"""
Demo: prediccion de riesgo de lluvia intensa con la CNN hibrida ya entrenada
============================================================================

Requiere un modelo guardado con:
  !python cnn_hibrida.py --csv dataset_sierra_lima.csv --guardar modelo

En la prediccion la capa cuantica SI se ejecuta: cada parche pasa por la CNN,
sus 4 features entran como angulos al circuito de 4 qubits y <Z> se convierte en
una probabilidad. Solo se omiten los gradientes, por eso es rapido.

Dos modos:

  1) Imagen GOES nueva, descargada en el momento (hora LOCAL de Peru):
     !python predecir.py --modelo modelo_cuantico.pt --fecha "2023-03-08 16:00"

  2) Una hora de tu dataset (sin internet; compara con lo que paso de verdad):
     !python predecir.py --modelo modelo_cuantico.pt --csv dataset_sierra_lima.csv \\
                         --hora "2023-03-08 21:00:00"          # hora UTC del CSV

Salida: tabla por parche (probabilidad y riesgo ALTO/bajo segun el umbral
guardado) y un mapa riesgo_<hora>.png con la temperatura del tope de nube.
"""

import argparse
import datetime as dt
import time

import numpy as np
import pandas as pd
import torch

import cnn_hibrida as ch

UTC_OFFSET = 5


def cargar_modelo(ruta):
    ck = torch.load(ruta, map_location="cpu", weights_only=False)
    cls = {"Hibrida": ch.Hibrida, "Clasica": ch.Clasica}[ck["clase"]]
    modelo = cls()
    modelo.load_state_dict(ck["state_dict"])
    modelo.eval()                      # desactiva Dropout
    return modelo, ck


def predecir(modelo, ck, imgs):
    """imgs: (n, 2, 16, 16) crudos [temperatura, enfriamiento 30 min], en Kelvin."""
    Xn = ((imgs - ck["media"]) / ck["desv"]).astype("float32")   # misma normalizacion
    with torch.no_grad():
        return torch.sigmoid(modelo(torch.tensor(Xn))).numpy()


# ----------------------------------------------------------------------------
# Fuentes de datos
# ----------------------------------------------------------------------------
def parches_goes(fecha_local):
    """Descarga GOES para esa hora y arma los parches igual que en el entrenamiento."""
    import goes_sierra_lima as g

    t = fecha_local + dt.timedelta(hours=UTC_OFFSET)
    goes = g.LectorGOES()
    r13, r13p = goes.buscar(t, 13), goes.buscar(t - dt.timedelta(minutes=30), 13)
    if not r13 or not r13p:
        raise SystemExit(f"No hay imagen GOES banda 13 para {t:%Y-%m-%d %H:%M} UTC.")
    bt, x, y, attrs = goes.leer_recorte(r13)
    bt_prev = goes.leer_recorte(r13p)[0]
    bt, bt_prev = g.recortar_multiplo(bt), g.recortar_multiplo(bt_prev)
    feats = g.features_parches(bt, bt_prev)
    cajas = g.caja_parches(x, y, attrs)
    imgs = np.stack([f.pop("_img") for f in feats])
    df = pd.DataFrame(feats)
    df["lat_c"] = [np.mean(cajas[(i, j)][:2]) for i, j in zip(df.pi, df.pj)]
    df["lon_c"] = [np.mean(cajas[(i, j)][2:]) for i, j in zip(df.pi, df.pj)]
    return df, imgs, f"{t:%Y-%m-%d %H:%M} UTC"


def parches_dataset(csv, hora_utc):
    df = pd.read_csv(csv)
    X = np.load(csv.rsplit(".", 1)[0] + "_parches.npz")["X"]
    sel = (df["tiempo_utc"] == hora_utc).values
    if not sel.any():
        horas = sorted(df["tiempo_utc"].unique())
        raise SystemExit(f"La hora {hora_utc} no esta en el CSV. Disponibles: "
                         f"{horas[0]} ... {horas[-1]} ({len(horas)} horas)")
    return df[sel].reset_index(drop=True), X[sel], f"{hora_utc} UTC"


# ----------------------------------------------------------------------------
# Salida
# ----------------------------------------------------------------------------
def mapa(df, imgs, umbral, titulo, ruta):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle

    P = imgs.shape[-1]
    ni, nj = df.pi.max() + 1, df.pj.max() + 1
    mosaico = np.full((ni * P, nj * P), np.nan)
    for (_, f), img in zip(df.iterrows(), imgs):
        mosaico[f.pi * P:(f.pi + 1) * P, f.pj * P:(f.pj + 1) * P] = img[0]

    fig, ax = plt.subplots(figsize=(1.6 * nj + 2, 1.6 * ni + 1))
    im = ax.imshow(mosaico, cmap="gray_r", vmin=190, vmax=300)
    fig.colorbar(im, ax=ax, label="Temperatura tope de nube (K) - blanco = frio (nube alta)")
    for _, f in df.iterrows():
        alto = f.prob >= umbral
        ax.add_patch(Rectangle((f.pj * P - 0.5, f.pi * P - 0.5), P, P, fill=False,
                               lw=3 if alto else 1, ec="red" if alto else "tab:blue"))
        txt = f"{f.prob:.2f}" + (f"\nreal {f.lluvia_mmh:.1f} mm/h" if "lluvia_mmh" in f else "")
        ax.text(f.pj * P + P / 2 - 0.5, f.pi * P + P / 2 - 0.5, txt, ha="center",
                va="center", fontsize=8, color="red" if alto else "tab:blue",
                bbox=dict(fc="white", alpha=0.7, lw=0))
    ax.set_title(f"Riesgo de lluvia intensa (proximas 2 h) - {titulo}\n"
                 f"rojo = probabilidad >= umbral {umbral:.2f}", fontsize=10)
    ax.set_xticks([]); ax.set_yticks([])
    fig.tight_layout()
    fig.savefig(ruta, dpi=120)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modelo", required=True, help="archivo .pt de cnn_hibrida.py --guardar")
    ap.add_argument("--fecha", help='hora LOCAL, ej. "2023-03-08 16:00" (descarga GOES)')
    ap.add_argument("--csv", help="dataset para el modo sin internet")
    ap.add_argument("--hora", help='hora UTC tal como aparece en el CSV, ej. "2023-03-08 21:00:00"')
    args = ap.parse_args()

    modelo, ck = cargar_modelo(args.modelo)
    print(f"Modelo: {ck['nombre']}  (umbral {ck['umbral']:.3f}, "
          f"PR-AUC validacion {ck['pr_auc_validacion']:.3f})")

    if args.fecha:
        df, imgs, titulo = parches_goes(dt.datetime.fromisoformat(args.fecha))
    elif args.csv and args.hora:
        df, imgs, titulo = parches_dataset(args.csv, args.hora)
    else:
        raise SystemExit("Usa --fecha, o bien --csv y --hora.")

    t0 = time.time()
    df["prob"] = predecir(modelo, ck, imgs)
    ms = (time.time() - t0) * 1000 / len(df)
    df["riesgo"] = np.where(df["prob"] >= ck["umbral"], "ALTO", "bajo")

    cols = ["pi", "pj", "lat_c", "lon_c", "bt_min", "frac_235", "prob", "riesgo"]
    if "lluvia_mmh" in df:
        df["real"] = np.where(df["label"] == 1, "SI llovio fuerte", "-")
        cols += ["lluvia_mmh", "real"]
    print(f"\n{titulo}: {len(df)} parches, {ms:.1f} ms por parche\n")
    print(df[[c for c in cols if c in df]].round(3).to_string(index=False))

    n_alto = (df["riesgo"] == "ALTO").sum()
    print(f"\nParches en riesgo ALTO: {n_alto}/{len(df)}")
    if "label" in df:
        acierto = ((df["riesgo"] == "ALTO") == (df["label"] == 1)).mean()
        print(f"Coincidencia con lo observado (IMERG): {acierto:.0%}")

    ruta = f"riesgo_{titulo.replace(' ', '_').replace(':', '')}.png"
    mapa(df, imgs, ck["umbral"], titulo, ruta)
    print(f"Mapa guardado en {ruta}")


if __name__ == "__main__":
    main()
