"""
Exporta los modelos YA ENTRENADOS al data.js de la web (qu-arto_de_pollo)
========================================================================

No entrena nada. Lee:
  modelo_clasico.pt, modelo_cuantico.pt   (cnn_hibrida.py --guardar modelo)
  modelo_qsvm.pkl                         (qsvc_lluvias.py --guardar modelo)

y escribe window.DEMO con:
  - modelos: los pesos completos de los tres modelos, para que la web los EJECUTE
    en el navegador (CNN, circuito de 4 qubits, kernel ZZ de la QSVM)
  - los 16 parches de una hora del dataset (imagenes GOES, features, etiqueta IMERG)
    con las predicciones calculadas aqui con PyTorch / Qiskit como referencia: la web
    recalcula todo y avisa si no coincide
  - metricas en el dia de validacion guardado con cada modelo (no se uso para ajustar
    pesos; si para early stopping y umbral, asi que son optimistas)
  - vectores de prueba de Qiskit para el circuito y para el kernel

Uso (desde pipeline/; por defecto escribe ../data.js):
  python exportar_web.py
  python exportar_web.py --csv dataset_sierra_lima.csv --hora "2023-03-10 21:00:00"
  node ../tools/validar_data.js
"""

import argparse
import datetime as dt
import json
import math
import pathlib
import pickle

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import average_precision_score, f1_score

import cnn_hibrida as ch
import goes_sierra_lima as g
import predecir as pr
import qsvc_lluvias as qs

DEC = 8   # decimales de los pesos exportados


def z_qiskit(x, w):
    """<Z> promedio del circuito de la CNN hibrida, con Statevector (sin muestreo)."""
    from qiskit import QuantumCircuit
    from qiskit.circuit.library import real_amplitudes
    from qiskit.quantum_info import SparsePauliOp, Statevector

    n = ch.N_QUBITS
    qc = QuantumCircuit(n)
    for i in range(n):
        qc.ry(float(x[i]), i)
    ansatz = real_amplitudes(n, reps=2, entanglement="linear")
    qc.compose(ansatz.assign_parameters([float(v) for v in w]), inplace=True)
    sv = Statevector(qc)
    return sum(float(sv.expectation_value(SparsePauliOp("I" * (n - 1 - i) + "Z" + "I" * i)).real)
               for i in range(n)) / n


def kernel_qiskit(X, Y):
    """Kernel de fidelidad |<phi(x)|phi(y)>|^2 con el mismo ZZFeatureMap de la QSVC."""
    return qs.kernel_cuantico().evaluate(np.asarray(X, float), np.asarray(Y, float))


def plano(t):
    if isinstance(t, torch.Tensor):
        t = t.detach().numpy()
    return [round(float(v), DEC) for v in np.asarray(t, dtype=float).ravel()]


def cnn_js(sd):
    """Pesos del Extractor (cnn.red.0 / .3 / .8) en listas planas, orden de PyTorch."""
    return {"c1w": plano(sd["cnn.red.0.weight"]), "c1b": plano(sd["cnn.red.0.bias"]),
            "c2w": plano(sd["cnn.red.3.weight"]), "c2b": plano(sd["cnn.red.3.bias"]),
            "lw": plano(sd["cnn.red.8.weight"]), "lb": plano(sd["cnn.red.8.bias"])}


def redondear_modelo(modelo):
    """Deja los pesos del modelo EXACTAMENTE como quedan en data.js, para que la
    referencia de Python y el calculo de la web partan de los mismos numeros."""
    with torch.no_grad():
        for p in modelo.parameters():
            p.copy_(torch.round(p * 10**DEC) / 10**DEC)


def elegir_hora(df):
    """Hora con la mezcla mas pareja de positivos y negativos (mejor para la demo)."""
    g_ = df.groupby("tiempo_utc")["label"].agg(["size", "sum"])
    g_ = g_[g_["size"] == 16]
    return (g_["sum"] - 8).abs().sort_values(kind="stable").index[0]


class QSVM:
    """Prediccion de la QSVC guardada, solo con numpy + el kernel de Qiskit."""

    def __init__(self, ruta):
        with open(ruta, "rb") as f:
            self.m = pickle.load(f)
        m = self.m
        for k in ("scaler_media", "scaler_escala", "pca_media", "pca_componentes",
                  "minmax_escala", "minmax_min", "vectores_soporte", "coef"):
            m[k] = np.round(np.asarray(m[k], float), DEC)
        m["intercepto"] = round(float(m["intercepto"]), DEC)

    def angulos(self, F):
        m = self.m
        Z = (F - m["scaler_media"]) / m["scaler_escala"]
        Z = (Z - m["pca_media"]) @ m["pca_componentes"].T
        return np.clip(Z * m["minmax_escala"] + m["minmax_min"], 0, np.pi)

    def decision(self, F):
        return kernel_qiskit(self.angulos(F), self.m["vectores_soporte"]) @ self.m["coef"] + self.m["intercepto"]

    def js(self):
        m = self.m
        return {"feats": m["feats"], "reps": m["reps"],
                "scaler_media": plano(m["scaler_media"]), "scaler_escala": plano(m["scaler_escala"]),
                "pca_media": plano(m["pca_media"]), "pca_componentes": plano(m["pca_componentes"]),
                "minmax_escala": plano(m["minmax_escala"]), "minmax_min": plano(m["minmax_min"]),
                "vectores_soporte": plano(m["vectores_soporte"]), "coef": plano(m["coef"]),
                "intercepto": m["intercepto"]}


def sigmoide(v):
    return 1 / (1 + np.exp(-v))


def main():
    aqui = pathlib.Path(__file__).resolve().parent          # pipeline/, dentro del repo de la web
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(aqui / "dataset_sierra_lima.csv"))
    ap.add_argument("--clasico", help="por defecto modelo_clasico.pt (o modelo_clasico_fin.pt)")
    ap.add_argument("--cuantico", help="por defecto modelo_cuantico.pt (o modelo_cuantico_fin.pt)")
    ap.add_argument("--qsvm", default=str(aqui / "modelo_qsvm.pkl"))
    ap.add_argument("--hora", help='hora UTC del CSV a mostrar, ej. "2023-03-10 21:00:00" '
                                   "(por defecto: una del dia de validacion)")
    ap.add_argument("--salida", default=str(aqui.parent / "data.js"))
    args = ap.parse_args()
    for k in ("clasico", "cuantico"):
        if not getattr(args, k):
            base = str(aqui / f"modelo_{k}")
            setattr(args, k, base + ".pt" if pathlib.Path(base + ".pt").exists() else base + "_fin.pt")
    print(f"Modelos: {args.clasico}, {args.cuantico}, {args.qsvm}")

    cla, ck_c = pr.cargar_modelo(args.clasico)
    hib, ck_h = pr.cargar_modelo(args.cuantico)
    redondear_modelo(cla)
    redondear_modelo(hib)
    qsvm = QSVM(args.qsvm)
    dv, dv_q = ck_h["dia_validacion"], qsvm.m["dia_validacion"]
    if dv_q != dv:
        print(f"AVISO: la CNN se valido con el dia {dv} y la QSVM con {dv_q}: sus metricas "
              "no son comparables. Regenera los .pt con: python cnn_hibrida.py --csv "
              f"{args.csv} --guardar modelo")

    df = pd.read_csv(args.csv)
    X = np.load(args.csv.rsplit(".", 1)[0] + "_parches.npz")["X"]
    ok = df["label"].notna().values
    df, X = df[ok].reset_index(drop=True), X[ok]
    X = np.round(X, 1).astype("float32")        # la web recibe las imagenes con 1 decimal
    F = np.round(df[qsvm.m["feats"]].values.astype(float), 6)
    dias = ch.dia_local(df["tiempo_utc"].values)
    en_val, en_val_q = dias == dv, dias == dv_q

    hora = args.hora or elegir_hora(df[en_val])
    sel = (df["tiempo_utc"] == hora).values
    if not sel.any():
        raise SystemExit(f"La hora {hora} no esta en el CSV.")
    if not en_val[sel].all():
        print(f"AVISO: {hora} no es del dia de validacion {dv}: los modelos se entrenaron "
              "con esos parches, sus probabilidades seran optimistas.")
    print(f"Parches para la web: {hora} UTC ({int(df.label[sel].sum())} positivos de {sel.sum()})")

    # ---- metricas en el dia de validacion de cada modelo
    def metr_cnn(modelo, ck):
        yv = df.loc[en_val, "label"].values.astype(int)
        p = pr.predecir(modelo, ck, X[en_val])
        m = {"F1": round(float(f1_score(yv, p >= ck["umbral"], zero_division=0)), 3),
             "PR_AUC": round(float(average_precision_score(yv, p)), 3),
             "umbral": round(float(ck["umbral"]), 4),
             "parametros": sum(q.numel() for q in modelo.parameters()),
             "dia_validacion": dv}
        if "t_entreno_s" in ck:                       # .pt guardados con la version actual
            m["t_entreno_s"] = round(float(ck["t_entreno_s"]), 1)
            m["mejor_epoca"] = int(ck["mejor_epoca"])
        return m

    yq = df.loc[en_val_q, "label"].values.astype(int)
    dq = qsvm.decision(F[en_val_q])
    m_q = {"F1": round(float(f1_score(yq, dq > 0, zero_division=0)), 3),
           "PR_AUC": round(float(average_precision_score(yq, dq)), 3),
           "umbral": 0.5, "vectores_soporte": int(len(qsvm.m["coef"])),
           "t_entreno_s": round(float(qsvm.m["metricas_validacion"]["t_entreno_s"]), 1),
           "dia_validacion": dv_q}
    m_c, m_h = metr_cnn(cla, ck_c), metr_cnn(hib, ck_h)

    # ---- curvas por epoca (solo si los .pt las traen: cnn_hibrida.py --guardar actual)
    curvas = {}
    cc, chh = ck_c.get("curva"), ck_h.get("curva")
    if cc and chh and len(cc["loss"]) == len(chh["loss"]):
        curvas = {"epoca": list(range(1, len(cc["loss"]) + 1)),
                  "prauc_val_clasico": [round(v, 4) for v in cc["prauc_val"]],
                  "prauc_val_hibrido": [round(v, 4) for v in chh["prauc_val"]],
                  "loss_clasico": [round(v, 4) for v in cc["loss"]],
                  "loss_hibrido": [round(v, 4) for v in chh["loss"]]}
    else:
        print("AVISO: los .pt no traen curvas por epoca; regeneralos con "
              "cnn_hibrida.py --guardar modelo para verlas en la web.")

    # ---- parches elegidos: referencia de PyTorch / Qiskit
    imgs = X[sel]
    p_c, p_h = pr.predecir(cla, ck_c, imgs), pr.predecir(hib, ck_h, imgs)
    d_q = qsvm.decision(F[sel])
    with torch.no_grad():
        xs = torch.tensor(((imgs - ck_h["media"]) / ck_h["desv"]).astype("float32"))
        act = hib.cnn.red(xs).numpy()                 # antes de tanh: la web aplica tanh*pi/2
        z_modelo = hib.qnn(hib.cnn(xs)).numpy().ravel()
    w_entr = hib.qnn.weight.detach().numpy().astype(float)

    # El circuito exportado debe ser exactamente el que usa el modelo guardado
    angulos = np.tanh(act) * np.pi / 2
    for k in range(len(angulos)):
        zq = z_qiskit(angulos[k], w_entr)
        assert abs(zq - z_modelo[k]) < 1e-5, f"Qiskit {zq} != modelo {z_modelo[k]} en el parche {k}"

    patches = []
    for k, f in df[sel].reset_index(drop=True).iterrows():
        patches.append({
            "id": f"P{k + 1:02d}", "fila": int(f.pi), "col": int(f.pj),
            "lat_c": round(float(f.lat_c), 3), "lon_c": round(float(f.lon_c), 3),
            "hora_utc": pd.Timestamp(f.tiempo_utc).strftime("%H:%M"),
            "bt": np.round(imgs[k][0].astype(float), 1).tolist(),
            "dbt": np.round(imgs[k][1].astype(float), 1).tolist(),
            "features": F[sel][k].tolist(),
            "etiqueta": int(f.label), "lluvia_mmh": round(float(f.lluvia_mmh), 2),
            "p_clasico": round(float(p_c[k]), 6), "p_hibrido": round(float(p_h[k]), 6),
            "p_qsvm": round(float(sigmoide(d_q[k])), 6), "d_qsvm": round(float(d_q[k]), 6),
            "activaciones_cnn": [round(float(a), 6) for a in act[k]],
        })

    w_aleat = np.random.default_rng(2026).uniform(-math.pi, math.pi, len(w_entr))

    # ---- vectores de prueba (Qiskit). Se redondea lo que se guarda y se calcula con eso.
    tests, tests_k = [], []

    def add(x, w):
        x = [round(float(v), 10) for v in x]
        w = [round(float(v), 10) for v in w]
        tests.append({"entrada": x, "pesos": w, "z_esperado": round(z_qiskit(x, w), 12)})

    add([0, 0, 0, 0], [0] * 12)
    add([math.pi / 2, 0, -math.pi / 2, math.pi / 4], w_entr)
    add([0.3, -0.8, 1.1, -1.4], w_aleat)
    for p in patches[:4]:
        add(np.tanh(np.array(p["activaciones_cnn"])) * np.pi / 2, w_entr)

    rng = np.random.default_rng(7)
    pares = [(rng.uniform(0, np.pi, 4), rng.uniform(0, np.pi, 4)) for _ in range(4)]
    pares += [(qsvm.angulos(F[sel][k:k + 1])[0], qsvm.m["vectores_soporte"][k]) for k in range(3)]
    for a, b in pares:
        a, b = [round(float(v), 10) for v in a], [round(float(v), 10) for v in b]
        tests_k.append({"x": a, "y": b, "k_esperado": round(float(kernel_qiskit([a], [b])[0, 0]), 12)})

    def lineal(modelo):
        return {"w": plano(modelo.salida.weight), "b": plano(modelo.salida.bias)[0]}

    fechas = pd.to_datetime(df["tiempo_utc"])
    data = {
        "meta": {
            "is_synthetic": False,
            "fecha": dt.date.today().isoformat(),
            "region": (f"Bajo y Medio Piura, Perú · lat {g.LAT_MIN} a {g.LAT_MAX} · "
                       f"lon {g.LON_MIN} a {g.LON_MAX}").replace("-", "−"),
            "version": (f"real · GOES + IMERG {fechas.min():%Y-%m-%d} a {fechas.max():%Y-%m-%d} · "
                        f"métricas del día de validación {dv}"),
        },
        "patches": patches,
        "metricas": {"clasico": m_c, "hibrido": m_h, "qsvm": m_q},
        "baseline_azar": round(float(df.loc[en_val, "label"].mean()), 3),
        "curvas": curvas,
        "circuito": {
            "pesos_entrenados": [round(float(v), 10) for v in w_entr],
            "pesos_aleatorios": [round(float(v), 6) for v in w_aleat],
            "vectores_prueba": tests,
            "vectores_kernel": tests_k,
        },
        "modelos": {
            "clasica": {"cnn": cnn_js(cla.state_dict()), "salida": lineal(cla),
                        "media": plano(ck_c["media"]), "desv": plano(ck_c["desv"]),
                        "umbral": float(ck_c["umbral"])},
            "hibrida": {"cnn": cnn_js(hib.state_dict()), "salida": lineal(hib),
                        "qnn_pesos": [round(float(v), 10) for v in w_entr],
                        "media": plano(ck_h["media"]), "desv": plano(ck_h["desv"]),
                        "umbral": float(ck_h["umbral"])},
            "qsvm": qsvm.js(),
        },
    }
    txt = ("/* DATOS REALES — generado por exportar_web.py desde %s, %s, %s y %s.\n"
           "   La web ejecuta los tres modelos con los pesos de 'modelos'. */\n"
           % tuple(pathlib.Path(a).name for a in (args.csv, args.clasico, args.cuantico, args.qsvm)))
    txt += "window.DEMO = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    pathlib.Path(args.salida).write_text(txt, encoding="utf-8")

    print(f"\nEscrito {args.salida} ({len(txt) // 1024} KB)")
    print(pd.DataFrame({"clasico": m_c, "hibrido": m_h, "qsvm": m_q}).T.to_string())
    print(f"Linea base PR-AUC (azar) en {dv} = {df.loc[en_val, 'label'].mean():.3f}")


if __name__ == "__main__":
    main()
