"""
Clasificacion de riesgo de lluvia intensa: QSVC (kernel cuantico) vs modelos clasicos
======================================================================================

Entrada: CSV generado por goes_sierra_lima.py (o --demo para datos sinteticos).

Pipeline:
  features fisicas -> StandardScaler -> PCA (N_QUBITS componentes)
  -> escalado a [0, pi] -> ZZFeatureMap -> kernel de fidelidad -> QSVC

Comparacion justa: los modelos clasicos reciben las MISMAS N_QUBITS componentes.
Tambien se reporta un gradient boosting con todas las features como techo clasico.

Modos de evaluacion (--split):
  dia       (por defecto) validacion cruzada dejando un dia fuera: cada dia local se
            usa una vez como prueba y se entrena con los demas. Reporta media +- desv.
            y un intervalo bootstrap de la diferencia QSVC - SVC.
  temporal  un solo corte: 70 % primeras horas para entrenar, el resto para probar.
  aleatorio division aleatoria (infla las metricas por fuga entre horas vecinas).

El kernel se calcula con FidelityStatevectorKernel: misma matriz que
FidelityQuantumKernel en simulacion sin ruido, ~100x mas rapido.

Uso en Colab:
  !pip install qiskit qiskit-machine-learning scikit-learn pandas
  !python qsvc_lluvias.py --csv dataset_sierra_lima.csv
  !python qsvc_lluvias.py --csv dataset_sierra_lima.csv --semillas 3
  !python qsvc_lluvias.py --demo          # prueba sin descargar nada

Guardar el modelo final (para la web, ver exportar_web.py):
  !python qsvc_lluvias.py --csv dataset_sierra_lima.csv --guardar modelo
  -> modelo_qsvm.pkl (escalado, PCA, vectores de soporte, coeficientes; sin objetos de Qiskit)
"""

import argparse
import pickle
import time

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.svm import SVC

N_QUBITS = 4          # = numero de componentes PCA
MAX_POS = 400         # tope de positivos de entrenamiento (con el kernel statevector sobra)
RATIO_NEG = 2         # negativos por cada positivo en el entrenamiento
MIN_POS_PRUEBA = 5    # dias con menos positivos no se evaluan (PR-AUC demasiado inestable)
UTC_OFFSET = 5        # Peru = UTC-5, para agrupar por dia local
N_BOOT = 5000
SEED = 42


# ----------------------------------------------------------------------------
# Datos
# ----------------------------------------------------------------------------
def datos_demo(n=2000, seed=SEED):
    """Datos sinteticos con la misma estructura que el CSV real (6 dias)."""
    rng = np.random.default_rng(seed)
    lluvia = rng.random(n) < 0.15
    bt_min = np.where(lluvia, rng.normal(220, 15, n), rng.normal(250, 18, n))
    df = pd.DataFrame({
        "bt_min": bt_min,
        "bt_mean": bt_min + rng.normal(20, 6, n),
        "bt_std": np.where(lluvia, rng.normal(12, 4, n), rng.normal(8, 3, n)),
        "frac_235": np.clip(np.where(lluvia, rng.normal(0.5, 0.25, n), rng.normal(0.15, 0.15, n)), 0, 1),
        "frac_210": np.clip(np.where(lluvia, rng.normal(0.2, 0.15, n), rng.normal(0.03, 0.05, n)), 0, 1),
        "d_bt_min": np.where(lluvia, rng.normal(-8, 6, n), rng.normal(0, 5, n)),
        "d_bt_mean": np.where(lluvia, rng.normal(-4, 4, n), rng.normal(0, 3, n)),
    })
    df["label"] = lluvia.astype(int)
    base = pd.Timestamp("2023-03-07 18:00")
    i = np.arange(n)
    t = base + pd.to_timedelta(i % 6, unit="D") + pd.to_timedelta(i % 10, unit="h")
    df["tiempo_utc"] = t.strftime("%Y-%m-%d %H:%M:%S")
    return df


def dia_local(tiempo_utc):
    t = pd.to_datetime(pd.Series(tiempo_utc)) - pd.Timedelta(hours=UTC_OFFSET)
    return t.dt.strftime("%Y-%m-%d").values


def subconjunto_balanceado(df, seed):
    pos = df[df.label == 1]
    neg = df[df.label == 0]
    pos = pos.sample(min(len(pos), MAX_POS), random_state=seed)
    neg = neg.sample(min(len(neg), RATIO_NEG * len(pos)), random_state=seed)
    return pd.concat([pos, neg]).sample(frac=1, random_state=seed)


# ----------------------------------------------------------------------------
# Modelos
# ----------------------------------------------------------------------------
def feature_map(n):
    try:  # Qiskit >= 2.1
        from qiskit.circuit.library import zz_feature_map
        return zz_feature_map(n, reps=2, entanglement="linear")
    except ImportError:
        from qiskit.circuit.library import ZZFeatureMap
        return ZZFeatureMap(n, reps=2, entanglement="linear")


def kernel_cuantico():
    try:
        from qiskit_machine_learning.kernels import FidelityStatevectorKernel
        return FidelityStatevectorKernel(feature_map=feature_map(N_QUBITS))
    except ImportError:
        from qiskit_machine_learning.kernels import FidelityQuantumKernel
        return FidelityQuantumKernel(feature_map=feature_map(N_QUBITS))


def evaluar(nombre, modelo, Xtr, ytr, Xte, yte):
    t0 = time.time()
    modelo.fit(Xtr, ytr)
    t_fit = time.time() - t0
    pred = modelo.predict(Xte)
    score = (modelo.decision_function(Xte) if hasattr(modelo, "decision_function")
             else modelo.predict_proba(Xte)[:, 1])
    ap = average_precision_score(yte, score)
    return {
        "modelo": nombre,
        "F1": f1_score(yte, pred, zero_division=0),
        "PR-AUC": ap,
        "lift": ap / yte.mean(),          # PR-AUC / azar: comparable entre dias
        "t_entreno_s": t_fit,
    }


def correr_modelos(Xtr, ytr, Xte, yte, seed):
    """Entrena los 4 modelos sobre una particion y devuelve sus metricas."""
    from qiskit_machine_learning.algorithms import QSVC

    red = make_pipeline(StandardScaler(), PCA(N_QUBITS, random_state=seed),
                        MinMaxScaler((0, np.pi)))
    Ztr = red.fit_transform(Xtr)
    Zte = np.clip(red.transform(Xte), 0, np.pi)   # prueba fuera de rango -> se recorta
    return [
        evaluar(f"QSVC ({N_QUBITS} qubits)",
                QSVC(quantum_kernel=kernel_cuantico(), class_weight="balanced"),
                Ztr, ytr, Zte, yte),
        evaluar(f"SVC RBF ({N_QUBITS} PCA)", SVC(kernel="rbf", class_weight="balanced"),
                Ztr, ytr, Zte, yte),
        evaluar(f"Reg. logistica ({N_QUBITS} PCA)",
                LogisticRegression(class_weight="balanced", max_iter=1000),
                Ztr, ytr, Zte, yte),
        evaluar("Gradient boosting (todas)", GradientBoostingClassifier(random_state=seed),
                Xtr, ytr, Xte, yte),
    ]


# ----------------------------------------------------------------------------
# Informe
# ----------------------------------------------------------------------------
def informe(res, comparaciones):
    """res: una fila por (dia, semilla, modelo). Promedia semillas dentro de cada dia
    y hace bootstrap sobre dias de la diferencia de lift entre pares de modelos."""
    por_dia = res.groupby(["dia", "modelo"], sort=False)[["PR-AUC", "lift", "F1"]].mean()
    por_dia = por_dia.reset_index()

    print("\nLift por dia (PR-AUC / azar; 1.0 = azar):")
    tabla = por_dia.pivot(index="dia", columns="modelo", values="lift")
    prev = res.groupby("dia")[["prevalencia", "n_prueba"]].first()
    print(pd.concat([prev, tabla], axis=1).round(2).to_string())

    orden = list(dict.fromkeys(res["modelo"]))
    resumen = por_dia.groupby("modelo")[["PR-AUC", "lift", "F1"]].agg(["mean", "std"]).loc[orden]
    resumen.columns = [f"{m} {s}".replace("mean", "media").replace("std", "desv")
                       for m, s in resumen.columns]
    resumen["t_entreno_s"] = res.groupby("modelo")["t_entreno_s"].mean().loc[orden]
    print(f"\nResumen sobre {por_dia['dia'].nunique()} dias:")
    print(resumen.round(3).to_string())

    rng = np.random.default_rng(SEED)
    print(f"\nDiferencia de lift (bootstrap sobre dias, {N_BOOT} remuestreos):")
    for a, b in comparaciones:
        la = por_dia[por_dia.modelo == a].set_index("dia")["lift"]
        lb = por_dia[por_dia.modelo == b].set_index("dia")["lift"]
        d = (la - lb).dropna().values
        boots = rng.choice(d, size=(N_BOOT, len(d)), replace=True).mean(axis=1)
        lo, hi = np.percentile(boots, [2.5, 97.5])
        if len(d) < 5:
            veredicto = "no concluyente (menos de 5 dias)"
        elif lo <= 0 <= hi:
            veredicto = "sin diferencia significativa"
        else:
            veredicto = f"{a if d.mean() > 0 else b} es mejor"
        print(f"  {a}  -  {b}:  {d.mean():+.2f}  IC95% [{lo:+.2f}, {hi:+.2f}]  "
              f"gana en {(d > 0).sum()}/{len(d)} dias  -> {veredicto}")


def guardar_qsvc(df, feats, ruta_base):
    """Entrena la QSVC final con todos los dias menos uno, que queda para medir: el dia
    mas reciente con al menos MIN_POS_PRUEBA positivos (mismo criterio que
    cnn_hibrida.py --guardar, para que los dos modelos se midan en el mismo dia)."""
    from qiskit_machine_learning.algorithms import QSVC

    df = df.assign(dia=dia_local(df["tiempo_utc"]))
    dias = sorted(df["dia"].unique())
    pos_dia = df.groupby("dia")["label"].sum()
    aptos = [d for d in dias if pos_dia[d] >= MIN_POS_PRUEBA]
    dv = aptos[-1] if aptos else pos_dia.idxmax()
    tr = subconjunto_balanceado(df[df.dia != dv], SEED)
    va = df[df.dia == dv]
    print(f"Modelo final: entrena con {len(tr)} ({tr.label.sum()} pos), "
          f"valida con el dia {dv} ({len(va)} parches, {va.label.sum()} pos)")

    sc, pca, mm = StandardScaler(), PCA(N_QUBITS, random_state=SEED), MinMaxScaler((0, np.pi))
    red = make_pipeline(sc, pca, mm)
    Ztr = red.fit_transform(tr[feats].values)
    Zva = np.clip(red.transform(va[feats].values), 0, np.pi)
    kernel = kernel_cuantico()
    modelo = QSVC(quantum_kernel=kernel, class_weight="balanced")
    t0 = time.time()
    modelo.fit(Ztr, tr.label.values)
    t_fit = time.time() - t0

    # decision = sum_i coef_i * K(sv_i, x) + b: se comprueba antes de guardar
    sv, coef, b = Ztr[modelo.support_], modelo.dual_coef_[0], float(modelo.intercept_[0])
    dec = modelo.decision_function(Zva)
    propia = kernel.evaluate(Zva, sv) @ coef + b
    assert np.allclose(dec, propia, atol=1e-6), "decision_function no coincide con la formula"

    yv = va.label.values
    res = {"F1": f1_score(yv, dec > 0, zero_division=0),
           "PR-AUC": average_precision_score(yv, dec), "t_entreno_s": t_fit}
    ruta = f"{ruta_base}_qsvm.pkl"
    with open(ruta, "wb") as f:
        pickle.dump({
            "feats": feats, "n_qubits": N_QUBITS, "reps": 2, "entanglement": "linear",
            "scaler_media": sc.mean_, "scaler_escala": sc.scale_,
            "pca_media": pca.mean_, "pca_componentes": pca.components_,
            "minmax_escala": mm.scale_, "minmax_min": mm.min_,
            "vectores_soporte": sv, "coef": coef, "intercepto": b,
            "dia_validacion": dv, "metricas_validacion": res,
        }, f)
    print(f"  -> guardado {ruta}: {len(sv)} vectores de soporte, "
          f"PR-AUC val={res['PR-AUC']:.3f}, F1={res['F1']:.3f}, {t_fit:.0f}s")


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="dataset_sierra_lima.csv")
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--split", choices=["dia", "temporal", "aleatorio"], default="dia")
    ap.add_argument("--semillas", type=int, default=1,
                    help="repeticiones con distinto submuestreo (solo --split dia)")
    ap.add_argument("--guardar", metavar="RUTA",
                    help="entrena la QSVC final y la guarda como RUTA_qsvm.pkl")
    args = ap.parse_args()

    df = datos_demo() if args.demo else pd.read_csv(args.csv)
    df = df.dropna(subset=["label"]).reset_index(drop=True)
    df["label"] = df["label"].astype(int)
    feats = [c for c in df.columns if c.startswith(("bt_", "frac_", "d_bt", "wv_"))]
    print(f"{len(df)} muestras, {df.label.sum()} positivas, features: {feats}")

    if args.guardar:
        guardar_qsvc(df, feats, args.guardar)
        return

    if args.split == "dia":
        df["dia"] = dia_local(df["tiempo_utc"])
        dias = sorted(df["dia"].unique())
        print(f"Validacion cruzada por dia local: {len(dias)} dias -> {dias}\n")
        filas, omitidos = [], []
        for d in dias:
            te = df[df.dia == d]
            if te.label.sum() < MIN_POS_PRUEBA:
                omitidos.append(f"{d} ({te.label.sum()} pos)")
                continue
            for s in range(args.semillas):
                tr = subconjunto_balanceado(df[df.dia != d], SEED + s)
                t0 = time.time()
                for r in correr_modelos(tr[feats].values, tr.label.values,
                                        te[feats].values, te.label.values, SEED + s):
                    r.update(dia=d, semilla=s, prevalencia=te.label.mean(), n_prueba=len(te))
                    filas.append(r)
                print(f"  dia {d}  semilla {s}: train={len(tr)} ({tr.label.sum()} pos)  "
                      f"test={len(te)} ({te.label.sum()} pos)  [{time.time()-t0:.0f}s]")
        if omitidos:
            print(f"  Dias omitidos (< {MIN_POS_PRUEBA} positivos en prueba): {', '.join(omitidos)}")
        if len({r['dia'] for r in filas}) < 2:
            raise SystemExit("Se necesitan al menos 2 dias evaluables: agrega mas dias.")
        res = pd.DataFrame(filas)
        q, s, l, g = list(dict.fromkeys(res["modelo"]))
        informe(res, [(q, s), (q, l), (q, g)])
        return

    if args.split == "temporal":
        horas = np.sort(df["tiempo_utc"].unique())
        corte = horas[int(len(horas) * 0.7)]          # 70 % de las horas para entrenar
        tr = subconjunto_balanceado(df[df["tiempo_utc"] < corte], SEED)
        te = df[df["tiempo_utc"] >= corte]            # prueba con prevalencia natural
        Xtr, ytr = tr[feats].values, tr["label"].values
        Xte, yte = te[feats].values, te["label"].values
        print(f"Split TEMPORAL (corte {corte})")
    else:
        sub = subconjunto_balanceado(df, SEED)
        X, y = sub[feats].values, sub["label"].values
        Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, stratify=y, random_state=SEED)
        print("Split ALEATORIO (puede inflar metricas)")
    print(f"Entrenamiento: {len(Xtr)} ({ytr.sum()} pos) / prueba: {len(Xte)} ({yte.sum()} pos)\n")
    res = pd.DataFrame(correr_modelos(Xtr, ytr, Xte, yte, SEED))
    print(res.round(3).to_string(index=False))
    print(f"\nLinea base PR-AUC (azar) = {yte.mean():.3f}")


if __name__ == "__main__":
    main()