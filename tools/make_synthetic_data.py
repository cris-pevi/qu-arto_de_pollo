#!/usr/bin/env python3
"""
Genera data.js SINTÉTICO (is_synthetic = true) con el esquema de window.DEMO.

- Los parches son campos inventados (nubes gaussianas + ruido): NO son imágenes GOES reales.
- Los números de métricas y curvas son de ejemplo, solo sirven para maquetar la web.
- Los vectores_prueba SÍ son reales: z_esperado se calcula con Qiskit (Statevector)
  usando el mismo circuito del proyecto: RY(x_i) por qubit + RealAmplitudes(reps=2,
  entanglement='linear'), y promediando <Z> de los 4 qubits.
- Los parámetros (2353 y 2362) son los del proyecto.

Uso:  python tools/make_synthetic_data.py [salida]     (por defecto ../data.js)
Requiere: numpy, qiskit
"""
import json, math, sys, pathlib
import numpy as np
from qiskit import QuantumCircuit
from qiskit.circuit.library import real_amplitudes
from qiskit.quantum_info import Statevector, SparsePauliOp

SEED = 2026
rng = np.random.default_rng(SEED)
PI = math.pi

# ---------------------------------------------------------------- circuito (Qiskit)
_ANSATZ = real_amplitudes(4, reps=2, entanglement="linear")
_OBS = [SparsePauliOp("I" * (3 - i) + "Z" + "I" * i) for i in range(4)]


def z_qiskit(x, w):
    qc = QuantumCircuit(4)
    for i in range(4):
        qc.ry(float(x[i]), i)
    qc.compose(_ANSATZ.assign_parameters([float(v) for v in w]), inplace=True)
    sv = Statevector(qc)
    zs = [float(sv.expectation_value(o).real) for o in _OBS]
    return zs, sum(zs) / 4


# ---------------------------------------------------------------- simulador numpy independiente
def z_numpy(x, w):
    psi = np.zeros(16)
    psi[0] = 1.0

    def ry(psi, q, th):
        c, s = math.cos(th / 2), math.sin(th / 2)
        out = psi.copy()
        for i in range(16):
            if not (i >> q) & 1:
                j = i | (1 << q)
                out[i] = c * psi[i] - s * psi[j]
                out[j] = s * psi[i] + c * psi[j]
        return out

    def cx(psi, c, t):
        out = psi.copy()
        for i in range(16):
            if (i >> c) & 1 and not (i >> t) & 1:
                j = i | (1 << t)
                out[i], out[j] = psi[j], psi[i]
        return out

    for q in range(4):
        psi = ry(psi, q, x[q])
    k = 0
    for layer in range(3):
        for q in range(4):
            psi = ry(psi, q, w[k]); k += 1
        if layer < 2:
            for q in range(3):
                psi = cx(psi, q, q + 1)
    p = psi ** 2
    zs = [sum(p[i] * (1 - 2 * ((i >> q) & 1)) for i in range(16)) for q in range(4)]
    return zs, sum(zs) / 4


# ---------------------------------------------------------------- campos sintéticos
def blur(a, n=2):
    k = np.array([1, 4, 6, 4, 1], float); k /= k.sum()
    for _ in range(n):
        a = np.apply_along_axis(lambda r: np.convolve(np.pad(r, 2, mode="reflect"), k, "valid"), 0, a)
        a = np.apply_along_axis(lambda r: np.convolve(np.pad(r, 2, mode="reflect"), k, "valid"), 1, a)
    return a


def blob(cy, cx, sy, sx):
    y, x = np.mgrid[0:16, 0:16]
    return np.exp(-(((y - cy) / sy) ** 2 + ((x - cx) / sx) ** 2) / 2)


KINDS = {
    #  nombre            núcleo frío (K)  enfriamiento (K)  tamaño   lluvia (mm/h)
    "pos_fuerte":   dict(core=(196, 204), cool=(14, 22), size=(3.0, 4.5), rain=(8.0, 16.0)),
    "pos_medio":    dict(core=(204, 212), cool=(8, 13), size=(2.5, 3.8), rain=(5.4, 9.0)),
    "pos_debil":    dict(core=(222, 232), cool=(7, 10), size=(1.4, 2.0), rain=(5.1, 5.9)),
    "neg_despejado": dict(core=(None, None), cool=(0, 0), size=(0, 0), rain=(0.0, 0.3)),
    "neg_nube_baja": dict(core=(268, 280), cool=(0, 2), size=(2.0, 3.5), rain=(0.0, 0.9)),
    "neg_cirro":    dict(core=(208, 216), cool=(0, 1.2), size=(5.0, 6.5), rain=(0.2, 1.4)),
    "neg_decae":    dict(core=(212, 220), cool=(-8, -5), size=(3.0, 4.0), rain=(2.6, 4.6)),
}

# (fila, col, tipo, hora_utc)  ->  12 de las 16 celdas
SPECS = [
    (0, 1, "pos_fuerte", "19:30"), (1, 2, "pos_fuerte", "21:00"), (2, 0, "pos_medio", "20:30"),
    (1, 0, "pos_debil", "22:30"), (3, 3, "pos_medio", "23:30"),
    (0, 3, "neg_despejado", "18:30"), (2, 2, "neg_despejado", "00:00"), (3, 1, "neg_nube_baja", "19:00"),
    (1, 3, "neg_cirro", "21:30"), (2, 1, "neg_decae", "01:00"), (0, 0, "neg_nube_baja", "22:00"),
    (3, 2, "pos_debil", "02:00"),
]


def make_patch(kind, spec):
    cfg = KINDS[kind]
    base = rng.uniform(292, 299) + blur(rng.normal(0, 3.0, (16, 16)), 3) * 2.2
    if kind == "neg_despejado":
        bt = base + rng.normal(0, 0.35, (16, 16))
        dbt = blur(rng.normal(0, 0.9, (16, 16)), 2) * 1.5 + rng.normal(0, 0.15, (16, 16))
    else:
        cy, cx = rng.uniform(5, 11, 2)
        sy, sx = rng.uniform(*cfg["size"]), rng.uniform(*cfg["size"])
        shape = blob(cy, cx, sy, sx)
        shape = np.clip(shape + 0.25 * blur(rng.normal(0, 1, (16, 16)), 1) * shape, 0, 1)
        core = rng.uniform(*cfg["core"])
        bt = base * (1 - shape) + (core + rng.normal(0, 1.2, (16, 16)) * (kind != "neg_cirro")) * shape
        if kind == "neg_cirro":
            bt = bt + blur(rng.normal(0, 1.4, (16, 16)), 2)
        cool = rng.uniform(*cfg["cool"])
        dbt = -cool * shape * (0.8 + 0.4 * blur(rng.normal(0, 1, (16, 16)), 1)) \
              + blur(rng.normal(0, 0.8, (16, 16)), 2)
    bt = np.clip(bt, 190, 305)
    dbt = np.clip(dbt, -30, 15)
    lo, hi = cfg["rain"]
    rain = float(rng.uniform(lo, hi))
    return np.round(bt, 1), np.round(dbt, 1), round(rain, 1)


def feature_score(bt, dbt):
    """Puntaje físico 0..1 (más frío y más enfriamiento -> más riesgo). Solo para fabricar ejemplos."""
    s = 0.55 * np.clip((250 - bt.min()) / 50, 0, 1) + 0.45 * np.clip(-dbt.min() / 20, 0, 1)
    return float(s)


def sigmoid(v):
    return 1 / (1 + math.exp(-v))


def main(out):
    patches = []
    for k, (fila, col, kind, hora) in enumerate(SPECS):
        bt, dbt, rain = make_patch(kind, None)
        patches.append(dict(
            id=f"P{k+1:02d}", fila=fila, col=col, kind=kind,
            lat_c=round(-4.6 - 1.2 * (fila + 0.5) / 4, 3), lon_c=round(-81.2 + 1.4 * (col + 0.5) / 4, 3),
            hora_utc=hora, bt=bt.tolist(), dbt=dbt.tolist(),
            etiqueta=int(rain >= 5.0), lluvia_mmh=rain, score=feature_score(bt, dbt)))

    # ---- pesos del circuito (sintéticos)
    pesos_aleat = [round(float(v), 4) for v in rng.uniform(-PI, PI, 12)]
    pesos_entr = [round(float(v), 4) for v in rng.normal(0, 0.9, 12)]

    # ---- activaciones de la CNN: se busca una dirección que correlacione con el puntaje
    best = None
    for _ in range(4000):
        v = rng.normal(0, 1, 4); v /= np.linalg.norm(v)
        off = rng.normal(0, 0.4, 4)
        acts = [off + v * 3.2 * (p["score"] - 0.5) * 2 + rng.normal(0, 0.18, 4) for p in patches]
        zb = np.array([z_numpy(np.tanh(a) * PI / 2, pesos_entr)[1] for a in acts])
        sc = np.array([p["score"] for p in patches])
        r = np.corrcoef(zb, sc)[0, 1]
        if best is None or abs(r) > abs(best[0]):
            best = (r, acts, zb)
        if abs(r) > 0.93:
            break
    r, acts, zb = best
    sign = 1 if r > 0 else -1
    zmid = float(np.median(zb))
    gain = 9.0
    for p, a, z in zip(patches, acts, zb):
        p["act"] = [round(float(t), 3) for t in a]
    # capa lineal 1->1 sintética: p = sigmoid(w*zbar + b)
    w_lin, b_lin = sign * gain, -sign * gain * zmid

    umbral_h, umbral_c = 0.46, 0.42
    for p in patches:
        a = np.array(p["act"]); ang = np.tanh(a) * PI / 2
        zs, zbar = z_qiskit(ang, pesos_entr)
        p["p_hibrido"] = round(sigmoid(w_lin * zbar + b_lin), 3)
        s = p["score"]
        p["p_clasico"] = round(sigmoid(7.0 * (s - 0.47) + float(rng.normal(0, 0.35))), 3)

    # ---- casos difíciles balanceados: uno que falla solo el clásico, uno solo el híbrido, uno ambos.
    # Se ajustan las activaciones de la CNN (con p_hibrido recalculado de forma coherente).
    by = {p["id"]: p for p in patches}

    def retarget_hybrid(p, want_pos):
        for _ in range(6000):
            a = np.array(p["act"]) + rng.normal(0, 0.9, 4)
            _, zbar = z_qiskit(np.tanh(a) * PI / 2, pesos_entr)
            ph = sigmoid(w_lin * zbar + b_lin)
            if (ph >= umbral_h) == want_pos and abs(ph - umbral_h) > 0.06:
                p["act"] = [round(float(t), 3) for t in a]
                p["p_hibrido"] = round(ph, 3)
                return
        raise RuntimeError("no se logró el caso difícil")

    # P09 (cirro): falla solo el clásico (falso positivo) ; P04 (pos débil): falla solo el híbrido (falso negativo)
    # P10 (decae): fallan ambos (falso positivo)
    by["P09"]["p_clasico"] = 0.61; retarget_hybrid(by["P09"], False)
    by["P04"]["p_clasico"] = 0.57; retarget_hybrid(by["P04"], False)
    by["P10"]["p_clasico"] = 0.55; retarget_hybrid(by["P10"], True)
    # el resto: ambos aciertan con margen razonable
    for p in patches:
        if p["id"] in ("P09", "P04", "P10"):
            continue
        pos = p["etiqueta"] == 1
        if (p["p_hibrido"] >= umbral_h) != pos:
            retarget_hybrid(p, pos)
        if (p["p_clasico"] >= umbral_c) != pos:
            p["p_clasico"] = round(float(rng.uniform(0.62, 0.9) if pos else rng.uniform(0.05, 0.28)), 3)

    # ---- vectores de prueba (Qiskit)
    tests = []
    def add(x, w):
        x = [round(float(v), 10) for v in x]; w = [round(float(v), 10) for v in w]   # se guarda lo mismo que se simula
        zs, zbar = z_qiskit(x, w); zn = z_numpy(x, w)[1]
        assert abs(zbar - zn) < 1e-9, (zbar, zn)
        tests.append(dict(entrada=x, pesos=w, z_esperado=round(zbar, 12)))
    add([0, 0, 0, 0], [0] * 12)
    add([PI / 2, 0, -PI / 2, PI / 4], [0] * 12)
    add([0.3, -0.8, 1.1, -1.4], pesos_entr)
    add([0.3, -0.8, 1.1, -1.4], pesos_aleat)
    for _ in range(4):
        add(rng.uniform(-PI / 2, PI / 2, 4), rng.uniform(-PI, PI, 12))
    for p in patches[:2]:
        add(np.tanh(np.array(p["act"])) * PI / 2, pesos_entr)

    # ---- curvas y métricas (ejemplo)
    E = 30
    ep = list(range(1, E + 1))
    def curve(final, start, speed, noise):
        return [round(float(start + (final - start) * (1 - math.exp(-e / speed)) + rng.normal(0, noise)), 4) for e in ep]
    def loss(final, start, speed, noise):
        return [round(float(final + (start - final) * math.exp(-e / speed) + abs(rng.normal(0, noise))), 4) for e in ep]
    baseline = 0.18
    data = dict(
        meta=dict(is_synthetic=True, fecha="2026-10-24",
                  region="Bajo y Medio Piura, Perú · lat −5.8 a −4.6 · lon −81.2 a −79.8",
                  version="sintetico-0.1"),
        patches=[dict(id=p["id"], fila=p["fila"], col=p["col"], lat_c=p["lat_c"], lon_c=p["lon_c"],
                      hora_utc=p["hora_utc"], bt=p["bt"], dbt=p["dbt"], etiqueta=p["etiqueta"],
                      lluvia_mmh=p["lluvia_mmh"], p_clasico=p["p_clasico"], p_hibrido=p["p_hibrido"],
                      activaciones_cnn=p["act"]) for p in patches],
        metricas=dict(
            clasico=dict(F1=0.642, PR_AUC=0.671, umbral=umbral_c, parametros=2353, t_entreno_s=312),
            hibrido=dict(F1=0.611, PR_AUC=0.648, umbral=umbral_h, parametros=2362, t_entreno_s=5480)),
        baseline_azar=baseline,
        curvas=dict(epoca=ep,
                    prauc_val_clasico=curve(0.66, 0.2, 7, 0.012),
                    prauc_val_hibrido=curve(0.64, 0.19, 10, 0.016),
                    loss_clasico=loss(0.46, 0.74, 8, 0.012),
                    loss_hibrido=loss(0.49, 0.72, 11, 0.014)),
        circuito=dict(pesos_entrenados=pesos_entr, pesos_aleatorios=pesos_aleat, vectores_prueba=tests),
    )
    txt = "/* DATOS SINTÉTICOS DE PRUEBA — generado por tools/make_synthetic_data.py (semilla %d).\n" \
          "   Reemplaza este archivo por tus resultados reales y pon meta.is_synthetic = false. */\n" % SEED
    txt += "window.DEMO = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    pathlib.Path(out).write_text(txt, encoding="utf-8")
    print("escrito", out, len(txt) // 1024, "KB")
    for p in patches:
        print(p["id"], p["fila"], p["col"], p["etiqueta"], p["lluvia_mmh"], "clas", p["p_clasico"], "hib", p["p_hibrido"])
    print("pesos_entr", pesos_entr)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else str(pathlib.Path(__file__).resolve().parent.parent / "data.js")
    main(out)
