# Qu-arto de pollo · Demo web

Sitio de una sola página para el jurado del IBM Quantum Hackathon 2026 (Lima). Explica y deja probar un modelo híbrido clásico-cuántico que estima el riesgo de lluvia intensa en Bajo y Medio Piura a 2 horas, con imágenes GOES-19.

- 100 % estático: sin servidor, sin CDN, sin recursos remotos. Pesa unos 450 KiB.
- Funciona abriendo `index.html` con doble clic (`file://`) y en GitHub Pages o Netlify.
- Español e inglés (botón **EN/ES** o `?lang=en`), tema oscuro y claro.

> **Estado de los datos:** `data.js` lo genera `exportar_web.py` desde los modelos entrenados (`.pt` de PyTorch y `.pkl` de la QSVM), y la web los ejecuta en el navegador. Si `meta.is_synthetic` es `true` (datos de `tools/make_synthetic_data.py`), el sitio muestra un aviso fijo arriba.

## Estructura

```
index.html        Contenido y estructura (texto en español)
config.js         Lo que el equipo completa: integrantes, repositorio, contacto, criterios
data.js           Todos los números del sitio (window.DEMO). Se reemplaza con datos reales
css/styles.css    Diseño (colores y tamaños arriba, en :root)
js/               core, i18n (inglés + glosario), sim (simulador de 4 qubits),
                  models (CNN, cabezas clásica y cuántica, QSVM con kernel ZZ),
                  viz (mapas de calor), sections, lab (laboratorio), main, qrcode
fonts/            Inter y JetBrains Mono, locales (licencia OFL incluida)
assets/           favicon.svg y og.jpg (vista previa al compartir)
tools/            Generador de datos sintéticos, validador de data.js, imagen OG
pipeline/         Python: descarga GOES/IMERG, CNN híbrida, QSVM, predicción, exportación
                  a data.js; dataset y modelos entrenados (.pt, .pkl)
```

## 1. Generar `data.js` desde los modelos entrenados

Todo número del sitio sale de `data.js`. Si falta un campo, el sitio muestra «—».

El código de los modelos, el dataset y los modelos entrenados están en `pipeline/`. `data.js` se genera desde ahí con los modelos ya entrenados; `exportar_web.py` no vuelve a entrenar nada:

```
cd pipeline
pip install -r requirements.txt
python cnn_hibrida.py  --csv dataset_sierra_lima.csv --guardar modelo   # modelo_clasico.pt, modelo_cuantico.pt
python qsvc_lluvias.py --csv dataset_sierra_lima.csv --guardar modelo   # modelo_qsvm.pkl
python exportar_web.py                                                  # escribe ../data.js
node ../tools/validar_data.js
```

Los dos primeros comandos solo hacen falta si quieres volver a entrenar: los modelos actuales ya están en `pipeline/` (`modelo_clasico_fin.pt`, `modelo_cuantico_fin.pt`, `modelo_qsvm.pkl`), y `exportar_web.py` los usa por defecto. Para descargar datos nuevos con `goes_sierra_lima.py`, define `EARTHDATA_USERNAME` y `EARTHDATA_PASSWORD` en tu terminal (o deja que `earthaccess` te los pida); nunca los escribas en el código.

`exportar_web.py` guarda en `data.js` (campo `modelos`) los pesos completos de los tres modelos: la CNN con cabeza clásica, la CNN con capa cuántica y la QSVM (escalado, PCA, vectores de soporte y coeficientes). **La web los ejecuta en el navegador** con `js/models.js`: la CNN, el circuito de 4 qubits de `js/sim.js` y el kernel ZZ de la QSVM. Al cargar, recalcula cada parche y lo compara con la referencia de PyTorch y Qiskit que trae `data.js`. Si coinciden (tolerancia 1e-4), usa sus propios resultados en todo el sitio; si no, muestra los precalculados y lo avisa en el laboratorio.

`validar_data.js` revisa el esquema y hace las mismas comprobaciones en Node: el circuito contra `circuito.vectores_prueba` (1e-6), el kernel ZZ contra `circuito.vectores_kernel` (1e-6) y los tres modelos contra las probabilidades de referencia (1e-4). Termina con error si algo no cuadra.

- Los 16 parches son una hora del día de validación, el único día que los modelos no usaron para ajustar pesos. Con `--hora "AAAA-MM-DD HH:MM:SS"` eliges otra hora.
- Las métricas son las de ese día de validación. Las curvas de entrenamiento no se guardan en los `.pt`, así que la web las muestra como «—».
- `meta.is_synthetic` sale en `false`, así que el aviso de datos sintéticos desaparece.
- Para volver a los datos sintéticos de prueba: `python tools/make_synthetic_data.py`.

Esquema de `window.DEMO`:

| Campo | Contenido |
|---|---|
| `meta` | `is_synthetic`, `fecha`, `region`, `version` |
| `patches[]` | `id`, `fila`, `col`, `lat_c`, `lon_c`, `hora_utc`, `bt[16][16]`, `dbt[16][16]`, `etiqueta`, `lluvia_mmh`, `p_clasico`, `p_hibrido`, `activaciones_cnn[4]` (8 a 12 parches) |
| `metricas.clasico` y `.hibrido` | `F1`, `PR_AUC`, `umbral`, `parametros`, `t_entreno_s` |
| `baseline_azar` | Proporción de positivos en test |
| `curvas` | `epoca`, `prauc_val_clasico`, `prauc_val_hibrido`, `loss_clasico`, `loss_hibrido` |
| `circuito` | `pesos_entrenados[12]`, `pesos_aleatorios[12]`, `vectores_prueba[]` con `entrada[4]`, `pesos[12]`, `z_esperado` |

**Convención del canal 2 (`dbt`).** Por defecto el sitio asume `dbt = BT(ahora) − BT(hace 30 min)`, así que valores negativos significan que la nube se enfrió. Si tu `dbt` ya viene como «cuánto se enfrió», pon `dbtEsCambio: false` en `config.js`. Confírmalo con quien generó el dataset.

**Vectores de prueba.** Genéralos con Qiskit usando el mismo circuito (RY de entrada, RealAmplitudes reps=2, entrelazamiento lineal, 12 pesos) y redondea las entradas a unos 10 decimales antes de calcular `z_esperado`.

## 2. Completar `config.js`

Es el único archivo que hay que editar para el equipo: nombre, integrantes (`members`), `repoUrl`, `contact`, agradecimientos y criterios del jurado. Lo que quede vacío o como `"[completar]"` se muestra como «—» y la consola (F12) avisa qué falta. El código QR de la sección Equipo se genera solo a partir de `repoUrl`.

## 3. Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube **el contenido de esta carpeta** (que `index.html` quede en la raíz).
2. En el repositorio: **Settings → Pages**.
3. En **Build and deployment**, elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`. Guarda.
4. Espera uno o dos minutos. La dirección será `https://TU-USUARIO.github.io/NOMBRE-REPO/`.
5. Pon esa dirección en `siteUrl` de `config.js` y, para la vista previa al compartir, en las metaetiquetas de `index.html`:
   - `og:image` → `https://TU-USUARIO.github.io/NOMBRE-REPO/assets/og.jpg`
   - agrega `<meta property="og:url" content="https://TU-USUARIO.github.io/NOMBRE-REPO/">`

   Las vistas previas de WhatsApp y otras redes necesitan la URL absoluta de la imagen.

## 4. Publicar en Netlify

1. Entra a <https://app.netlify.com/drop> (o **Add new site → Deploy manually**).
2. Arrastra la carpeta completa del sitio.
3. Netlify te da una dirección `https://algo.netlify.app`. Puedes cambiar el nombre en **Site configuration → Change site name**.
4. Actualiza `og:image` y `siteUrl` igual que en el paso 5 de GitHub Pages y vuelve a arrastrar la carpeta.

## 5. Probar en local

- Doble clic en `index.html`: funciona sin servidor.
- O bien: `python3 -m http.server 8000` dentro de la carpeta y abre `http://localhost:8000`.

## Qué hace (y qué no) el sitio

- Es una exploración. No afirma ventaja cuántica, ni que supere al modelo clásico, ni que esté listo para producción.
- El circuito corre en un simulador **sin ruido** hecho en JavaScript; no es un computador cuántico real.
- Los resultados con datos reales son preliminares (máximo 400 muestras en el entrenamiento descrito).
- No incluye cifras de daños o inundaciones externas ni logos de IBM.

## Créditos y licencias

- Inter y JetBrains Mono: SIL Open Font License 1.1 (copias en `fonts/`).
- `js/qrcode.js`: generador de códigos QR de Kazuhiko Arase (licencia MIT, cabecera incluida en el archivo). Solo se descarga si `repoUrl` está completo.
- Paleta de mapas de calor: inferno (matplotlib), perceptualmente uniforme y apta para daltonismo.
