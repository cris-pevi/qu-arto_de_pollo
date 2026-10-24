"""
GOES-East sobre la sierra de Lima -> parches -> features compactas -> etiquetas IMERG
=====================================================================================

Pipeline:
  1. Lee (en streaming, sin bajar el disco completo) la banda 13 de GOES-East
     (infrarrojo 10.3 um, temperatura de brillo del tope de nube), y opcionalmente
     la banda 8 (vapor de agua 6.2 um), recortada a la sierra de Lima.
  2. Divide el recorte en parches de PATCH x PATCH pixeles (~2 km/pixel).
  3. Calcula pocas features fisicas por parche (ideal para un circuito de 4-8 qubits):
       bt_min, bt_mean, bt_std, frac_235, frac_210   (estado actual)
       d_bt_min, d_bt_mean                           (enfriamiento en los ultimos 30 min)
       wv_mean                                       (opcional, banda 8)
  4. Etiqueta cada parche con GPM IMERG: 1 si la lluvia media de las proximas
     HORIZONTE_H horas supera UMBRAL_LLUVIA mm/h en algun pixel del parche.
  5. Guarda las features en un CSV (para qsvc_lluvias.py) y los parches como
     imagenes de 2 canales [bt, bt - bt_hace_30min] en un .npz (para cnn_hibrida.py).
     La fila i del CSV corresponde a la imagen X[i] del .npz.

Uso en Google Colab:
  !pip install s3fs h5netcdf xarray earthaccess pandas
  !python goes_sierra_lima.py --inicio 2026-01-10 --fin 2026-01-16

Sin cuenta de NASA Earthdata (solo features, sin etiquetas):
  !python goes_sierra_lima.py --inicio 2026-01-10 --fin 2026-01-16 --sin-etiquetas

Cuenta gratuita de Earthdata: https://urs.earthdata.nasa.gov
"""

import argparse
import datetime as dt
import re

import numpy as np
import pandas as pd
import xarray as xr

# ----------------------------------------------------------------------------
# Configuracion
# ----------------------------------------------------------------------------
# Bajo y Medio Piura: Catacaos, Piura, Castilla, La Arena, Cura Mori,
# Tambogrande y Chulucanas (~16 parches de 16x16 px).
LAT_MIN, LAT_MAX = -5.8, -4.6
LON_MIN, LON_MAX = -81.2, -79.8

PATCH = 16                       # 16 px * 2 km ~ 32 km por parche
HORAS_LOCALES = range(13, 23)    # 13:00-22:00 hora Peru: pico de conveccion andina
UTC_OFFSET = 5                   # Peru = UTC-5

UMBRAL_FRIO = 235.0              # K: tope de nube tipico de conveccion
UMBRAL_MUY_FRIO = 210.0          # K: conveccion profunda

HORIZONTE_H = 2                  # horas hacia adelante para la etiqueta
UMBRAL_LLUVIA = 5.0              # mm/h (revisa el balance de clases y ajusta)

GOES19_DESDE = dt.datetime(2025, 4, 7)   # GOES-19 reemplazo a GOES-16 como GOES-East


# ----------------------------------------------------------------------------
# Proyeccion geoestacionaria de GOES-R (GOES-R Product User Guide, sec. 4.2.8)
# ----------------------------------------------------------------------------
def _params(proj_attrs):
    r_eq = float(proj_attrs["semi_major_axis"])
    r_pol = float(proj_attrs["semi_minor_axis"])
    h = float(proj_attrs["perspective_point_height"]) + r_eq
    lon0 = np.deg2rad(float(proj_attrs["longitude_of_projection_origin"]))
    return r_eq, r_pol, h, lon0


def latlon_a_xy(lat, lon, proj_attrs):
    """Lat/lon (grados) -> angulos de escaneo x, y (radianes) del ABI."""
    r_eq, r_pol, h, lon0 = _params(proj_attrs)
    e2 = 1 - r_pol**2 / r_eq**2
    lat, lon = np.deg2rad(lat), np.deg2rad(lon)
    phi_c = np.arctan((r_pol**2 / r_eq**2) * np.tan(lat))
    r_c = r_pol / np.sqrt(1 - e2 * np.cos(phi_c) ** 2)
    s_x = h - r_c * np.cos(phi_c) * np.cos(lon - lon0)
    s_y = -r_c * np.cos(phi_c) * np.sin(lon - lon0)
    s_z = r_c * np.sin(phi_c)
    y = np.arctan(s_z / s_x)
    x = np.arcsin(-s_y / np.sqrt(s_x**2 + s_y**2 + s_z**2))
    return x, y


def xy_a_latlon(x, y, proj_attrs):
    """Angulos de escaneo x, y (radianes) -> lat/lon (grados)."""
    r_eq, r_pol, h, lon0 = _params(proj_attrs)
    a = np.sin(x) ** 2 + np.cos(x) ** 2 * (
        np.cos(y) ** 2 + (r_eq**2 / r_pol**2) * np.sin(y) ** 2
    )
    b = -2 * h * np.cos(x) * np.cos(y)
    c = h**2 - r_eq**2
    r_s = (-b - np.sqrt(b**2 - 4 * a * c)) / (2 * a)
    s_x = r_s * np.cos(x) * np.cos(y)
    s_y = -r_s * np.sin(x)
    s_z = r_s * np.cos(x) * np.sin(y)
    lat = np.arctan((r_eq**2 / r_pol**2) * s_z / np.sqrt((h - s_x) ** 2 + s_y**2))
    lon = lon0 - np.arctan(s_y / (h - s_x))
    return np.rad2deg(lat), np.rad2deg(lon)


def ventana_xy(proj_attrs):
    """Limites (x, y) en radianes que cubren la caja lat/lon de la region."""
    lats, lons = np.meshgrid(
        np.linspace(LAT_MIN, LAT_MAX, 25), np.linspace(LON_MIN, LON_MAX, 25)
    )
    x, y = latlon_a_xy(lats, lons, proj_attrs)
    return x.min(), x.max(), y.min(), y.max()


# ----------------------------------------------------------------------------
# GOES en AWS (bucket publico, sin credenciales)
# ----------------------------------------------------------------------------
class LectorGOES:
    def __init__(self):
        import s3fs

        self.fs = s3fs.S3FileSystem(anon=True)
        self._cache_ls = {}

    @staticmethod
    def bucket(t):
        return "noaa-goes19" if t >= GOES19_DESDE else "noaa-goes16"

    def _ls(self, prefijo):
        if prefijo not in self._cache_ls:
            try:
                self._cache_ls[prefijo] = self.fs.ls(prefijo)
            except FileNotFoundError:
                self._cache_ls[prefijo] = []
        return self._cache_ls[prefijo]

    def buscar(self, t, banda, tolerancia_min=10):
        """Archivo Full Disk de la banda cuyo inicio de escaneo es mas cercano a t."""
        prefijo = f"{self.bucket(t)}/ABI-L2-CMIPF/{t:%Y}/{t:%j}/{t:%H}/"
        patron = re.compile(rf"-M\dC{banda:02d}_G\d\d_s(\d{{11}})")
        mejor, mejor_dif = None, None
        for ruta in self._ls(prefijo):
            m = patron.search(ruta)
            if not m:
                continue
            t_ini = dt.datetime.strptime(m.group(1), "%Y%j%H%M")
            dif = abs((t_ini - t).total_seconds()) / 60
            if dif <= tolerancia_min and (mejor_dif is None or dif < mejor_dif):
                mejor, mejor_dif = ruta, dif
        return mejor

    def leer_recorte(self, ruta):
        """Lee solo el recorte de la region (streaming). Devuelve (CMI, x, y, attrs)."""
        with self.fs.open(ruta, "rb") as f:
            ds = xr.open_dataset(f, engine="h5netcdf")
            attrs = dict(ds["goes_imager_projection"].attrs)
            x0, x1, y0, y1 = ventana_xy(attrs)
            # En el ABI, x crece hacia el este e y decrece hacia el sur
            sub = ds["CMI"].sel(x=slice(x0, x1), y=slice(y1, y0)).load()
            ds.close()
        return sub.values.astype("float32"), sub["x"].values, sub["y"].values, attrs


# ----------------------------------------------------------------------------
# Features por parche
# ----------------------------------------------------------------------------
def recortar_multiplo(arr):
    ny, nx = arr.shape[-2:]
    return arr[..., : ny - ny % PATCH, : nx - nx % PATCH]


def features_parches(bt, bt_prev, wv=None):
    """bt, bt_prev, wv: arrays (ny, nx) ya recortados a multiplos de PATCH."""
    filas = []
    ny, nx = bt.shape
    for i in range(ny // PATCH):
        for j in range(nx // PATCH):
            s = (slice(i * PATCH, (i + 1) * PATCH), slice(j * PATCH, (j + 1) * PATCH))
            p, pp = bt[s], bt_prev[s]
            if np.isnan(p).mean() > 0.2 or np.isnan(pp).mean() > 0.2:
                continue
            fila = {
                "pi": i,
                "pj": j,
                "bt_min": np.nanmin(p),
                "bt_mean": np.nanmean(p),
                "bt_std": np.nanstd(p),
                "frac_235": np.nanmean(p < UMBRAL_FRIO),
                "frac_210": np.nanmean(p < UMBRAL_MUY_FRIO),
                "d_bt_min": np.nanmin(p) - np.nanmin(pp),     # negativo = se enfria
                "d_bt_mean": np.nanmean(p) - np.nanmean(pp),
            }
            if wv is not None:
                fila["wv_mean"] = np.nanmean(wv[s])
            # Imagen del parche para la CNN: canal 0 = temperatura, canal 1 = enfriamiento
            img = np.stack([p, p - pp]).astype("float32")
            for c in range(2):
                img[c] = np.where(np.isnan(img[c]), np.nanmean(img[c]), img[c])
            fila["_img"] = img
            filas.append(fila)
    return filas


def caja_parches(x, y, attrs):
    """Bounding box lat/lon de cada parche (para cruzar con IMERG)."""
    xx, yy = np.meshgrid(x, y)
    lat, lon = xy_a_latlon(xx, yy, attrs)
    lat, lon = recortar_multiplo(lat), recortar_multiplo(lon)
    cajas = {}
    ny, nx = lat.shape
    for i in range(ny // PATCH):
        for j in range(nx // PATCH):
            s = (slice(i * PATCH, (i + 1) * PATCH), slice(j * PATCH, (j + 1) * PATCH))
            cajas[(i, j)] = (lat[s].min(), lat[s].max(), lon[s].min(), lon[s].max())
    return cajas


# ----------------------------------------------------------------------------
# Etiquetas con GPM IMERG (NASA Earthdata, cuenta gratuita)
# ----------------------------------------------------------------------------
class LectorIMERG:
    """IMERG Final Run, media hora, 0.1 grados (~10 km). Latencia ~3.5 meses:
    para eventos recientes usa short_name='GPM_3IMERGHHL' (Late Run)."""

    def __init__(self, inicio, fin, short_name="GPM_3IMERGHH", version="07"):
        import earthaccess

        self.ea = earthaccess
        earthaccess.login()  # pide usuario/clave de Earthdata la primera vez
        kw = dict(
            short_name=short_name,
            temporal=(inicio.isoformat(), fin.isoformat()),
            bounding_box=(LON_MIN, LAT_MIN, LON_MAX, LAT_MAX),
        )
        granulos = earthaccess.search_data(version=version, **kw)
        if not granulos:  # por si cambio la version del producto
            granulos = earthaccess.search_data(**kw)
        self.por_hora = {}
        for g in granulos:
            ini = g["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"]
            t = dt.datetime.fromisoformat(ini.replace("Z", "")).replace(tzinfo=None)
            self.por_hora[t.replace(second=0, microsecond=0)] = g
        self._cache = {}
        print(f"IMERG: {len(self.por_hora)} archivos de media hora encontrados")

    def lluvia(self, t):
        """Campo de lluvia (mm/h) sobre la region para la media hora que empieza en t."""
        t = t.replace(minute=(t.minute // 30) * 30, second=0, microsecond=0)
        if t in self._cache:
            return self._cache[t]
        g = self.por_hora.get(t)
        if g is None:
            self._cache[t] = None
            return None
        f = self.ea.open([g])[0]
        ds = xr.open_dataset(f, group="Grid", engine="h5netcdf")
        da = (
            ds["precipitation"]
            .isel(time=0)
            .sel(lat=slice(LAT_MIN - 0.1, LAT_MAX + 0.1), lon=slice(LON_MIN - 0.1, LON_MAX + 0.1))
            .load()
        )
        ds.close()
        da = da.where(da >= 0)
        self._cache[t] = da
        return da

    def etiquetas(self, t, cajas):
        """Para cada parche: max sobre pixeles de la lluvia media en [t, t+HORIZONTE_H]."""
        campos = [self.lluvia(t + dt.timedelta(minutes=30 * k)) for k in range(2 * HORIZONTE_H)]
        if any(c is None for c in campos):
            return None
        media = sum(campos) / len(campos)
        res = {}
        for clave, (la0, la1, lo0, lo1) in cajas.items():
            v = media.sel(lat=slice(la0 - 0.05, la1 + 0.05), lon=slice(lo0 - 0.05, lo1 + 0.05))
            res[clave] = float(v.max()) if v.size else np.nan
        return res


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main():
    # Credenciales de Earthdata: variables de entorno EARTHDATA_USERNAME y
    # EARTHDATA_PASSWORD, ~/.netrc, o earthaccess las pide al iniciar. Nunca en el codigo.

    ap = argparse.ArgumentParser()
    ap.add_argument("--inicio", required=True, help="fecha local YYYY-MM-DD")
    ap.add_argument("--fin", required=True, help="fecha local YYYY-MM-DD (inclusive)")
    ap.add_argument("--vapor", action="store_true", help="agrega banda 8 (vapor de agua)")
    ap.add_argument("--sin-etiquetas", action="store_true", help="no usar IMERG")
    ap.add_argument("--salida", default="dataset_piura.csv")
    args = ap.parse_args()

    d0 = dt.date.fromisoformat(args.inicio)
    d1 = dt.date.fromisoformat(args.fin)
    tiempos = []
    for n in range((d1 - d0).days + 1):
        d = d0 + dt.timedelta(days=n)
        for h in HORAS_LOCALES:
            tiempos.append(dt.datetime(d.year, d.month, d.day, h) + dt.timedelta(hours=UTC_OFFSET))

    # ---- limitar a 50 ----
    tiempos = tiempos[:50] 

    goes = LectorGOES()
    imerg = None
    if not args.sin_etiquetas:
        # Forzamos el uso de Late Run (HHL) que está siempre disponible de inmediato
        imerg = LectorIMERG(
            tiempos[0], 
            tiempos[-1] + dt.timedelta(hours=HORIZONTE_H + 1), 
            short_name="GPM_3IMERGHHL"
        )

    filas, imgs, cajas = [], [], None
    ruta_npz = args.salida.rsplit(".", 1)[0] + "_parches.npz"

    def guardar():
        pd.DataFrame(filas).to_csv(args.salida, index=False)
        if imgs:
            np.savez_compressed(ruta_npz, X=np.stack(imgs))
    for k, t in enumerate(tiempos):
        r13 = goes.buscar(t, 13)
        r13p = goes.buscar(t - dt.timedelta(minutes=30), 13)
        if not r13 or not r13p:
            print(f"[{k+1}/{len(tiempos)}] {t:%Y-%m-%d %H:%M} UTC: sin datos GOES, se omite")
            continue
        try:
            bt, x, y, attrs = goes.leer_recorte(r13)
            bt_prev, _, _, _ = goes.leer_recorte(r13p)
            wv = None
            if args.vapor:
                r8 = goes.buscar(t, 8)
                wv = recortar_multiplo(goes.leer_recorte(r8)[0]) if r8 else None
        except Exception as e:  # archivo corrupto o corte de red
            print(f"[{k+1}/{len(tiempos)}] error leyendo GOES: {e}")
            continue

        bt, bt_prev = recortar_multiplo(bt), recortar_multiplo(bt_prev)
        if cajas is None:
            cajas = caja_parches(x, y, attrs)
            print(f"Recorte: {bt.shape} px -> {len(cajas)} parches de {PATCH}x{PATCH}")

        feats = features_parches(bt, bt_prev, wv)
        lab = imerg.etiquetas(t, cajas) if imerg else None
        if imerg and lab is None:
            print(f"[{k+1}/{len(tiempos)}] {t:%Y-%m-%d %H:%M} UTC: sin IMERG, se omite")
            continue

        for f in feats:
            f["tiempo_utc"] = t
            la0, la1, lo0, lo1 = cajas[(f["pi"], f["pj"])]
            f["lat_c"], f["lon_c"] = (la0 + la1) / 2, (lo0 + lo1) / 2
            if lab:
                f["lluvia_mmh"] = lab[(f["pi"], f["pj"])]
                f["label"] = int(f["lluvia_mmh"] >= UMBRAL_LLUVIA)
        for f in feats:
            imgs.append(f.pop("_img"))
        filas.extend(feats)
        print(f"[{k+1}/{len(tiempos)}] {t:%Y-%m-%d %H:%M} UTC: {len(feats)} parches")

        if (k + 1) % 10 == 0:  # guardado parcial por si se corta Colab
            guardar()

    guardar()
    df = pd.DataFrame(filas)
    print(f"\nGuardado {args.salida} y {ruta_npz}: {len(df)} muestras")
    if "label" in df:
        print("Balance de clases:\n", df["label"].value_counts())
        print("Percentiles de lluvia (mm/h):",
              df["lluvia_mmh"].quantile([0.5, 0.9, 0.95, 0.99]).round(2).to_dict())


if __name__ == "__main__":
    main()