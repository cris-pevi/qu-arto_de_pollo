"""
CNN hibrida clasico-cuantica para riesgo de lluvia intensa con parches GOES
===========================================================================

Entrada: dataset_sierra_lima.csv (etiquetas) + dataset_sierra_lima_parches.npz
(imagenes 2x16x16), ambos generados por goes_sierra_lima.py CON etiquetas IMERG.

Arquitectura (se entrena todo junto, de extremo a extremo):

  parche 2x16x16 --CNN--> 4 features --tanh*pi/2--> [circuito 4 qubits] --> logit
                                                     RY(x_i) + real_amplitudes
                                                     medicion <Z> promedio

Comparacion justa: el mismo extractor CNN con una cabeza CLASICA (Linear 4->1).

Contra el sobreajuste: aumento de datos (rotaciones de 90 grados y volteos, con
sentido fisico para una tormenta), Dropout, weight decay y LR = 1e-3.

Modos de evaluacion (--split):
  dia       (por defecto) validacion cruzada dejando un dia fuera: cada dia local se
            usa una vez como prueba, el dia siguiente como validacion (early
            stopping) y el resto para entrenar. Reporta media +- desv. y un
            intervalo bootstrap de la diferencia cuantica - clasica.
  temporal  un solo corte: 60 % / 15 % / 25 % de las horas.
  aleatorio division aleatoria (infla las metricas por fuga entre horas vecinas).

Uso en Colab:
  !pip install torch qiskit qiskit-machine-learning scikit-learn pandas
  !python cnn_hibrida.py --csv dataset_sierra_lima.csv
  !python cnn_hibrida.py --csv dataset_sierra_lima.csv --solo-clasica   # rapido
  !python cnn_hibrida.py --demo           # prueba con parches sinteticos

Guardar el modelo final para hacer predicciones (ver predecir.py):
  !python cnn_hibrida.py --csv dataset_sierra_lima.csv --guardar modelo
  -> modelo_cuantico.pt y modelo_clasico.pt (pesos + normalizacion + umbral)
"""

import argparse
import copy
import time

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.metrics import average_precision_score, f1_score
from sklearn.model_selection import train_test_split

N_QUBITS = 4
EPOCAS = 15
BATCH = 16
LR = 1e-3
WEIGHT_DECAY = 1e-4
DROPOUT = 0.3
MAX_MUESTRAS = 400    # tope de entrenamiento: la capa cuantica es lenta (param-shift)
MIN_POS_PRUEBA = 5    # dias con menos positivos no se evaluan (PR-AUC demasiado inestable)
UTC_OFFSET = 5        # Peru = UTC-5, para agrupar por dia local
N_BOOT = 5000
SEED = 42


def fijar_semilla(s):
    torch.manual_seed(s)
    np.random.seed(s)


# ----------------------------------------------------------------------------
# Datos
# ----------------------------------------------------------------------------
def datos_demo(n=600):
    """Parches sinteticos (6 dias): los positivos tienen un nucleo frio que se enfria."""
    rng = np.random.default_rng(SEED)
    y = (rng.random(n) < 0.2).astype(int)
    X = np.empty((n, 2, 16, 16), dtype="float32")
    yy, xx = np.mgrid[:16, :16]
    for i in range(n):
        base = rng.normal(280, 10) + rng.normal(0, 3, (16, 16))
        if y[i]:
            cy, cx = rng.integers(3, 13, 2)
            nucleo = np.exp(-((yy - cy) ** 2 + (xx - cx) ** 2) / (2 * rng.uniform(2, 4) ** 2))
            base -= rng.uniform(10, 50) * nucleo
            enfr = -rng.uniform(0, 10) * nucleo + rng.normal(0, 2, (16, 16))
        else:
            enfr = rng.normal(0, 2, (16, 16))
        X[i, 0], X[i, 1] = base, enfr
    i = np.arange(n)
    t = (pd.Timestamp("2023-03-07 18:00") + pd.to_timedelta(i % 6, unit="D")
         + pd.to_timedelta(i % 10, unit="h"))
    return X, y, np.asarray(t.strftime("%Y-%m-%d %H:%M:%S"))


def cargar(csv):
    df = pd.read_csv(csv)
    if "label" not in df:
        raise SystemExit(
            "El CSV no tiene columna 'label'. Vuelve a correr goes_sierra_lima.py "
            "SIN --sin-etiquetas (necesitas cuenta de NASA Earthdata)."
        )
    X = np.load(csv.rsplit(".", 1)[0] + "_parches.npz")["X"]
    assert len(X) == len(df), "El CSV y el .npz no tienen el mismo numero de filas"
    ok = df["label"].notna().values
    return X[ok], df.loc[ok, "label"].astype(int).values, df.loc[ok, "tiempo_utc"].values


def dia_local(tiempo_utc):
    t = pd.to_datetime(pd.Series(tiempo_utc)) - pd.Timedelta(hours=UTC_OFFSET)
    return t.dt.strftime("%Y-%m-%d").values


def submuestrear(X, y, rng):
    """Conserva los positivos (hasta la mitad del cupo) y completa con negativos."""
    pos, neg = np.where(y == 1)[0], np.where(y == 0)[0]
    pos = rng.permutation(pos)[: MAX_MUESTRAS // 2]
    neg = rng.permutation(neg)[: MAX_MUESTRAS - len(pos)]
    idx = rng.permutation(np.concatenate([pos, neg]))
    return X[idx], y[idx]


def normalizar(Xtr, *otros):
    """Estandariza cada canal con estadisticas SOLO del entrenamiento."""
    m = Xtr.mean(axis=(0, 2, 3), keepdims=True)
    s = Xtr.std(axis=(0, 2, 3), keepdims=True) + 1e-6
    return [((X - m) / s).astype("float32") for X in (Xtr, *otros)]


def aumentar(xb):
    """Rotacion aleatoria de 0/90/180/270 grados y volteo horizontal opcional."""
    xb = torch.rot90(xb, int(torch.randint(4, (1,))), dims=(2, 3))
    if torch.rand(1).item() < 0.5:
        xb = torch.flip(xb, dims=(3,))
    return xb


# ----------------------------------------------------------------------------
# Modelos
# ----------------------------------------------------------------------------
class Extractor(nn.Module):
    """CNN pequena: 2x16x16 -> N_QUBITS features en [-pi/2, pi/2]."""

    def __init__(self):
        super().__init__()
        self.red = nn.Sequential(
            nn.Conv2d(2, 8, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),   # 8x8x8
            nn.Conv2d(8, 16, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),  # 16x4x4
            nn.Flatten(), nn.Dropout(DROPOUT), nn.Linear(16 * 4 * 4, N_QUBITS),
        )

    def forward(self, x):
        return torch.tanh(self.red(x)) * (np.pi / 2)   # angulos para RY


def capa_cuantica():
    from qiskit import QuantumCircuit
    from qiskit.circuit import ParameterVector
    from qiskit.quantum_info import SparsePauliOp
    from qiskit_machine_learning.connectors import TorchConnector
    from qiskit_machine_learning.neural_networks import EstimatorQNN

    try:  # Qiskit >= 2.1
        from qiskit.circuit.library import real_amplitudes
        ansatz = real_amplitudes(N_QUBITS, reps=2, entanglement="linear")
    except ImportError:
        from qiskit.circuit.library import RealAmplitudes
        ansatz = RealAmplitudes(N_QUBITS, reps=2, entanglement="linear")

    x = ParameterVector("x", N_QUBITS)
    qc = QuantumCircuit(N_QUBITS)
    for i in range(N_QUBITS):
        qc.ry(x[i], i)               # codificacion por angulo: 1 feature -> 1 qubit
    qc.compose(ansatz, inplace=True)

    # Observable: promedio de Z en todos los qubits (salida en [-1, 1])
    obs = SparsePauliOp.from_list(
        [("I" * (N_QUBITS - 1 - i) + "Z" + "I" * i, 1 / N_QUBITS) for i in range(N_QUBITS)]
    )
    qnn = EstimatorQNN(
        circuit=qc, observables=obs,
        input_params=list(x), weight_params=list(ansatz.parameters),
        input_gradients=True,        # necesario para que el gradiente llegue a la CNN
    )
    w0 = 0.1 * (2 * np.random.rand(qnn.num_weights) - 1)
    return TorchConnector(qnn, initial_weights=w0)


class Hibrida(nn.Module):
    def __init__(self):
        super().__init__()
        self.cnn = Extractor()
        self.qnn = capa_cuantica()
        self.salida = nn.Linear(1, 1)   # reescala <Z> a un logit

    def forward(self, x):
        return self.salida(self.qnn(self.cnn(x))).squeeze(-1)


class Clasica(nn.Module):
    def __init__(self):
        super().__init__()
        self.cnn = Extractor()
        self.salida = nn.Linear(N_QUBITS, 1)

    def forward(self, x):
        return self.salida(self.cnn(x)).squeeze(-1)


MODELOS = [("CNN + cabeza clasica", Clasica), ("CNN + capa cuantica", Hibrida)]


# ----------------------------------------------------------------------------
# Entrenamiento y evaluacion
# ----------------------------------------------------------------------------
def entrenar(nombre, modelo, Xtr, ytr, Xva, yva, Xte, yte, verbose=True):
    Xtr_t, ytr_t = torch.tensor(Xtr), torch.tensor(ytr, dtype=torch.float32)
    pos_w = torch.tensor((len(ytr) - ytr.sum()) / max(ytr.sum(), 1), dtype=torch.float32)
    loss_fn = nn.BCEWithLogitsLoss(pos_weight=pos_w)   # compensa el desbalance
    opt = torch.optim.Adam(modelo.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)

    def puntajes(X):
        modelo.eval()
        with torch.no_grad():
            return torch.sigmoid(modelo(torch.tensor(X))).numpy()

    mejor, mejor_ap, mejor_ep = None, -1, 0
    curva = {"loss": [], "prauc_val": []}      # por epoca; --guardar la guarda en el .pt
    t0 = time.time()
    for ep in range(EPOCAS):
        modelo.train()
        perm = torch.randperm(len(Xtr_t))
        total = 0.0
        for b in range(0, len(perm), BATCH):
            idx = perm[b:b + BATCH]
            opt.zero_grad()
            loss = loss_fn(modelo(aumentar(Xtr_t[idx])), ytr_t[idx])
            loss.backward()
            opt.step()
            total += loss.item() * len(idx)
        ap = average_precision_score(yva, puntajes(Xva))
        curva["loss"].append(total / len(Xtr_t))
        curva["prauc_val"].append(float(ap))
        if ap > mejor_ap:                    # early stopping por PR-AUC en validacion
            mejor_ap, mejor, mejor_ep = ap, copy.deepcopy(modelo.state_dict()), ep + 1
        if verbose:
            print(f"  [{nombre}] epoca {ep+1:2d}  loss={total/len(Xtr_t):.3f}  PR-AUC val={ap:.3f}")
    t = time.time() - t0

    modelo.load_state_dict(mejor)
    # Umbral que maximiza F1 en validacion (no 0.5 fijo)
    pv = puntajes(Xva)
    umbral = max(np.unique(pv), key=lambda u: f1_score(yva, pv >= u))
    p = puntajes(Xte)
    ap_te = average_precision_score(yte, p)
    return {
        "modelo": nombre,
        "F1": f1_score(yte, p >= umbral, zero_division=0),
        "umbral": float(umbral),
        "PR-AUC": ap_te,
        "lift": ap_te / yte.mean(),            # PR-AUC / azar: comparable entre dias
        "mejor_epoca": mejor_ep,
        "parametros": sum(q.numel() for q in modelo.parameters()),
        "t_entreno_s": t,
        "curva": curva,
    }


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
    resumen["mejor_epoca"] = res.groupby("modelo")["mejor_epoca"].mean().loc[orden]
    resumen["t_entreno_s"] = res.groupby("modelo")["t_entreno_s"].mean().loc[orden]
    print(f"\nResumen sobre {por_dia['dia'].nunique()} dias:")
    print(resumen.round(3).to_string())

    if not comparaciones:
        return
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


def guardar_modelos(X, y, t, modelos, ruta_base):
    """Entrena con todos los dias menos uno, que se usa para early stopping y para
    elegir el umbral: el dia mas reciente con al menos MIN_POS_PRUEBA positivos
    (un dia casi sin lluvia daria un PR-AUC de validacion igual al azar)."""
    dias_arr = dia_local(t)
    dias = sorted(np.unique(dias_arr))
    pos_dia = {d: int(y[dias_arr == d].sum()) for d in dias}
    aptos = [d for d in dias if pos_dia[d] >= MIN_POS_PRUEBA]
    dv = aptos[-1] if aptos else max(dias, key=pos_dia.get)
    if not aptos:
        print(f"AVISO: ningun dia tiene >= {MIN_POS_PRUEBA} positivos; el umbral sera poco confiable.")
    va = dias_arr == dv
    tr = ~va if len(dias) > 1 else np.ones(len(y), bool)
    fijar_semilla(SEED)
    Xtr, ytr = submuestrear(X[tr], y[tr], np.random.default_rng(SEED))
    media = Xtr.mean(axis=(0, 2, 3), keepdims=True)
    desv = Xtr.std(axis=(0, 2, 3), keepdims=True) + 1e-6
    Xtr_n, Xva_n = normalizar(Xtr, X[va])
    print(f"Modelo final: entrena con {len(ytr)} parches ({ytr.sum()} pos), "
          f"valida con el dia {dv} ({int(va.sum())} parches, {y[va].sum()} pos)\n")
    for nombre, cls in modelos:
        fijar_semilla(SEED)
        modelo = cls()
        r = entrenar(nombre, modelo, Xtr_n, ytr, Xva_n, y[va], Xva_n, y[va])
        ruta = f"{ruta_base}_{'cuantico' if cls is Hibrida else 'clasico'}.pt"
        torch.save({
            "clase": cls.__name__, "nombre": nombre, "state_dict": modelo.state_dict(),
            "media": media, "desv": desv, "umbral": r["umbral"],
            "n_qubits": N_QUBITS, "dropout": DROPOUT,
            "dia_validacion": dv, "pr_auc_validacion": r["PR-AUC"],
            "curva": r["curva"], "mejor_epoca": r["mejor_epoca"], "t_entreno_s": r["t_entreno_s"],
        }, ruta)
        print(f"  -> guardado {ruta}  (PR-AUC val={r['PR-AUC']:.3f}, umbral={r['umbral']:.3f})\n")


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="dataset_sierra_lima.csv")
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--split", choices=["dia", "temporal", "aleatorio"], default="dia")
    ap.add_argument("--semillas", type=int, default=1,
                    help="repeticiones con distinta inicializacion (solo --split dia)")
    ap.add_argument("--solo-clasica", action="store_true",
                    help="omite la capa cuantica (para probar rapido)")
    ap.add_argument("--guardar", metavar="RUTA",
                    help="entrena el modelo final y lo guarda como RUTA_cuantico.pt / RUTA_clasico.pt")
    args = ap.parse_args()
    modelos = MODELOS[:1] if args.solo_clasica else MODELOS

    X, y, t = datos_demo() if args.demo else cargar(args.csv)
    print(f"{len(y)} parches, {y.sum()} positivos ({y.mean():.1%})")
    if y.sum() < 10:
        raise SystemExit("Menos de 10 positivos: agrega mas dias (idealmente con El Nino "
                         "costero) o baja UMBRAL_LLUVIA en goes_sierra_lima.py.")

    if args.guardar:
        guardar_modelos(X, y, t, modelos, args.guardar)
        return

    if args.split == "dia":
        dias_arr = dia_local(t)
        dias = sorted(np.unique(dias_arr))
        if len(dias) < 3:
            raise SystemExit("--split dia necesita al menos 3 dias (entrenar, validar, probar).")
        print(f"Validacion cruzada por dia local: {len(dias)} dias -> {dias}")
        print("Cada dia es prueba una vez; el dia siguiente se usa para early stopping.\n")
        filas, omitidos = [], []
        for k, d in enumerate(dias):
            te = dias_arr == d
            if y[te].sum() < MIN_POS_PRUEBA:
                omitidos.append(f"{d} ({y[te].sum()} pos)")
                continue
            # Validacion: el siguiente dia con positivos (circular)
            candidatos = [dias[(k + j) % len(dias)] for j in range(1, len(dias))]
            dv = next((c for c in candidatos if y[dias_arr == c].sum() > 0), candidatos[0])
            va = dias_arr == dv
            tr = ~(te | va)
            for s in range(args.semillas):
                fijar_semilla(SEED + s)
                Xtr, ytr = submuestrear(X[tr], y[tr], np.random.default_rng(SEED + s))
                Xtr_n, Xva_n, Xte_n = normalizar(Xtr, X[va], X[te])
                for nombre, cls in modelos:
                    fijar_semilla(SEED + s)
                    r = entrenar(nombre, cls(), Xtr_n, ytr, Xva_n, y[va], Xte_n, y[te],
                                 verbose=False)
                    r.update(dia=d, semilla=s, prevalencia=y[te].mean(), n_prueba=int(te.sum()))
                    filas.append(r)
                    print(f"  prueba {d} (val {dv})  semilla {s}  {nombre:22s} "
                          f"lift={r['lift']:.2f}  PR-AUC={r['PR-AUC']:.3f}  "
                          f"[{r['t_entreno_s']:.0f}s]")
        if omitidos:
            print(f"  Dias omitidos (< {MIN_POS_PRUEBA} positivos en prueba): {', '.join(omitidos)}")
        if len({r['dia'] for r in filas}) < 2:
            raise SystemExit("Se necesitan al menos 2 dias evaluables: agrega mas dias.")
        res = pd.DataFrame(filas)
        comps = [(MODELOS[1][0], MODELOS[0][0])] if not args.solo_clasica else []
        informe(res, comps)
        return

    fijar_semilla(SEED)
    rng = np.random.default_rng(SEED)
    if args.split == "temporal":
        horas = np.sort(np.unique(t))
        c1, c2 = horas[int(len(horas) * 0.6)], horas[int(len(horas) * 0.75)]
        Xtr, ytr = submuestrear(X[t < c1], y[t < c1], rng)
        Xva, yva = X[(t >= c1) & (t < c2)], y[(t >= c1) & (t < c2)]
        Xte, yte = X[t >= c2], y[t >= c2]
        print("Split TEMPORAL: entrena con las primeras horas, prueba con las ultimas")
    else:
        X, y = submuestrear(X, y, rng)
        Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, stratify=y, random_state=SEED)
        Xtr, Xva, ytr, yva = train_test_split(Xtr, ytr, test_size=0.2, stratify=ytr, random_state=SEED)
        print("Split ALEATORIO (puede inflar metricas)")
    Xtr, Xva, Xte = normalizar(Xtr, Xva, Xte)
    print(f"train={len(ytr)} ({ytr.sum()} pos)  val={len(yva)} ({yva.sum()} pos)  "
          f"test={len(yte)} ({yte.sum()} pos)\n")

    resultados = []
    for nombre, cls in modelos:
        fijar_semilla(SEED)
        resultados.append(entrenar(nombre, cls(), Xtr, ytr, Xva, yva, Xte, yte))
    print("\n" + pd.DataFrame(resultados).drop(columns="curva").round(3).to_string(index=False))
    print(f"\nLinea base PR-AUC (azar) = {yte.mean():.3f}")


if __name__ == "__main__":
    main()