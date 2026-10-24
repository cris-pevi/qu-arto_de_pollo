# Qu-arto de pollo

Riesgo de lluvia intensa en el Bajo y Medio Piura a 2 horas, estimado desde satélite con modelos clásicos e híbridos clásico-cuánticos. Proyecto para el IBM Quantum Hackathon 2026 (Lima).

**Demo:** <https://cris-pevi.github.io/qu-arto_de_pollo/>

En Piura, sobre todo con El Niño costero o el ciclón Yaku (marzo de 2023), la lluvia puede volverse intensa en pocas horas. El proyecto descarga imágenes infrarrojas de GOES-East (GOES-16 para fechas anteriores a abril de 2025 y GOES-19 desde entonces) y divide la región en 16 parches de unos 32 km. Cada parche tiene dos canales: la temperatura del tope de nube y su enfriamiento en 30 minutos. Las etiquetas salen de la lluvia observada por GPM IMERG: un parche es positivo si supera 5 mm/h en las 2 horas siguientes. Se comparan tres modelos:

- **CNN híbrida.** Una CNN pequeña resume el parche en 4 números, que entran como ángulos a un circuito de 4 qubits (RY + RealAmplitudes, reps=2, entrelazamiento lineal).
- **CNN clásica.** La misma CNN con una cabeza lineal de 4 a 1, de casi el mismo tamaño (2353 frente a 2362 parámetros).
- **QSVM.** Un kernel cuántico ZZFeatureMap sobre 7 features físicas reducidas por PCA a 4 qubits.

**Resultado.** En validación cruzada dejando un día fuera (4 días evaluables, marzo de 2023), los dos modelos CNN superan claramente al azar, con un lift medio de unas 2.5 veces, pero el híbrido y el clásico empatan, sin diferencia significativa. No afirmamos ventaja cuántica. Todo se entrenó con simuladores exactos y sin ruido; el siguiente paso es la inferencia en hardware real con Qiskit Runtime.

## Estructura

```
index.html        La web (texto en español; inglés en js/i18n.js)
config.js         Lo que el equipo completa: integrantes, repositorio, contacto, criterios
data.js           Datos de la web (window.DEMO): parches, métricas y pesos de los 3 modelos.
                  Lo genera pipeline/exportar_web.py
css/styles.css    Diseño (colores y tamaños arriba, en :root)
js/               core, i18n (inglés + glosario), sim (simulador de 4 qubits),
                  models (CNN, cabezas clásica y cuántica, QSVM con kernel ZZ),
                  viz (mapas de calor), sections, lab (laboratorio), main, qrcode
fonts/            Inter y JetBrains Mono, locales (licencia OFL incluida)
assets/           favicon.svg y og.jpg (vista previa al compartir)
tools/            Validador de data.js, generador de datos sintéticos, imagen OG
pipeline/         Python: datos, modelos, predicción y exportación a la web
```

`pipeline/`:

| Archivo | Qué hace |
|---|---|
| `goes_sierra_lima.py` | Descarga GOES (AWS, sin cuenta) e IMERG (NASA Earthdata) y arma el CSV de features y el `.npz` de parches |
| `cnn_hibrida.py` | Entrena y compara la CNN híbrida y la clásica; con `--guardar` guarda los `.pt` |
| `qsvc_lluvias.py` | Entrena y compara la QSVM con SVM, regresión logística y gradient boosting; con `--guardar` guarda el `.pkl` |
| `predecir.py` | Predice con un `.pt` sobre una hora del dataset o sobre una imagen GOES nueva, y dibuja el mapa de riesgo |
| `exportar_web.py` | Lleva los modelos guardados a `../data.js`, sin volver a entrenar |
| `dataset_sierra_lima.csv` + `_parches.npz` | Dataset de marzo de 2023: 50 horas × 16 parches |
| `modelo_clasico.pt`, `modelo_cuantico.pt`, `modelo_qsvm.pkl` | Modelos entrenados |

## 1. Reproducir el experimento

Desde `pipeline/`:

```
pip install -r requirements.txt

# 1. Datos (opcional: el dataset ya está en la carpeta)
python goes_sierra_lima.py --inicio AAAA-MM-DD --fin AAAA-MM-DD --salida dataset.csv

# 2. Evaluación: validación cruzada por día, con comparación estadística
python cnn_hibrida.py  --csv dataset_sierra_lima.csv
python qsvc_lluvias.py --csv dataset_sierra_lima.csv

# 3. Modelos finales para la web y para predecir
python cnn_hibrida.py  --csv dataset_sierra_lima.csv --guardar modelo   # modelo_clasico.pt, modelo_cuantico.pt
python qsvc_lluvias.py --csv dataset_sierra_lima.csv --guardar modelo   # modelo_qsvm.pkl

# 4. Predicción sobre una hora del dataset o una fecha nueva (hora local de Perú)
python predecir.py --modelo modelo_cuantico.pt --csv dataset_sierra_lima.csv --hora "2023-03-10 21:00:00"
python predecir.py --modelo modelo_cuantico.pt --fecha "2023-03-08 16:00"
```

- **Credenciales de Earthdata.** `goes_sierra_lima.py` necesita una cuenta gratuita de NASA Earthdata (<https://urs.earthdata.nasa.gov>) para las etiquetas IMERG. Define `EARTHDATA_USERNAME` y `EARTHDATA_PASSWORD` en tu terminal, o deja que `earthaccess` te las pida. **Nunca las escribas en el código.** Con `--sin-etiquetas` descarga solo GOES.
- **Tiempos.** La capa cuántica se entrena por param-shift sobre un simulador, así que el híbrido tarda unos 400 s por entrenamiento, frente a 1 s del clásico. Por eso se usan como máximo 400 muestras.
- **Día de validación.** `--guardar` entrena con todos los días menos el más reciente que tenga al menos 5 positivos (hoy, 2023-03-10). Ese día sirve para el early stopping y para elegir el umbral; los dos scripts usan el mismo criterio, así que las métricas de los tres modelos son comparables.
- **Pruebas sin datos.** Con `--demo`, `cnn_hibrida.py` y `qsvc_lluvias.py` prueban el flujo con datos sintéticos.

## 2. Llevar los modelos a la web

```
cd pipeline
python exportar_web.py            # escribe ../data.js
node ../tools/validar_data.js     # requiere Node.js
```

`exportar_web.py` no entrena nada. Lee `modelo_clasico.pt` y `modelo_cuantico.pt` (o, si no existen, `modelo_clasico_fin.pt` y `modelo_cuantico_fin.pt`) y `modelo_qsvm.pkl`, y escribe en `data.js`:

- los pesos completos de los tres modelos (campo `modelos`);
- los 16 parches de una hora del día de validación, con la predicción de PyTorch y Qiskit como referencia. Con `--hora "AAAA-MM-DD HH:MM:SS"` eliges otra hora; si no es del día de validación, avisa que las probabilidades serán optimistas;
- las métricas en el día de validación, las curvas de pérdida y PR-AUC por época y el tiempo de entrenamiento. Los `.pt` guardados con versiones anteriores de `cnn_hibrida.py` no traen curvas; en ese caso la web las muestra como «—»;
- vectores de prueba calculados con Qiskit para el circuito y para el kernel ZZ.

**La web ejecuta los tres modelos en el navegador** con `js/models.js`: la CNN, el circuito de 4 qubits (`js/sim.js`) y la QSVM con su ZZFeatureMap y el kernel de fidelidad. Al cargar, recalcula cada parche y lo compara con la referencia de `data.js`. Si coinciden (tolerancia 1e-4), usa sus propios resultados en todo el sitio; si no, muestra los precalculados y lo avisa en el laboratorio.

`validar_data.js` revisa el esquema y hace las mismas comprobaciones en Node: el circuito contra `circuito.vectores_prueba` (1e-6), el kernel contra `circuito.vectores_kernel` (1e-6) y los tres modelos contra las probabilidades de referencia (1e-4). Termina con error si algo no cuadra.

Para volver a los datos sintéticos de maqueta: `python tools/make_synthetic_data.py` (pone `meta.is_synthetic: true` y la web muestra un aviso fijo).

### Esquema de `window.DEMO`

Si falta un campo, la web muestra «—».

| Campo | Contenido |
|---|---|
| `meta` | `is_synthetic`, `fecha`, `region`, `version` |
| `patches[]` | 8 a 16 parches: `id`, `fila`, `col`, `lat_c`, `lon_c`, `hora_utc`, `bt[16][16]`, `dbt[16][16]`, `features[7]`, `etiqueta`, `lluvia_mmh`, `p_clasico`, `p_hibrido`, `p_qsvm`, `d_qsvm` (margen de la SVM), `activaciones_cnn[4]` |
| `metricas.clasico`, `.hibrido` | `F1`, `PR_AUC`, `umbral`, `parametros`, `t_entreno_s`, `mejor_epoca`, `dia_validacion` |
| `metricas.qsvm` | `F1`, `PR_AUC`, `umbral` (0.5 = margen 0), `vectores_soporte`, `t_entreno_s`, `dia_validacion` |
| `baseline_azar` | Proporción de positivos en el día de validación |
| `curvas` | `epoca`, `prauc_val_clasico`, `prauc_val_hibrido`, `loss_clasico`, `loss_hibrido` |
| `circuito` | `pesos_entrenados[12]`, `pesos_aleatorios[12]`, `vectores_prueba[]` (`entrada`, `pesos`, `z_esperado`), `vectores_kernel[]` (`x`, `y`, `k_esperado`) |
| `modelos.clasica`, `.hibrida` | `cnn` (pesos de las 2 convoluciones y la lineal, en orden de PyTorch), `salida`, `media`, `desv`, `umbral`; la híbrida además `qnn_pesos[12]` |
| `modelos.qsvm` | `feats`, `reps`, escalado, PCA, MinMax, `vectores_soporte`, `coef`, `intercepto` |

**Convención del canal 2 (`dbt`).** El sitio asume `dbt = BT(ahora) − BT(hace 30 min)`, así que los valores negativos significan que la nube se enfrió. Es lo que produce `goes_sierra_lima.py`. Si algún día usas otra convención, pon `dbtEsCambio: false` en `config.js`.

## 3. Completar `config.js`

Es el único archivo que hay que editar para el equipo: nombre, integrantes (`members`), `repoUrl`, `contact`, agradecimientos y criterios del jurado. Lo que quede vacío o como `"[completar]"` se muestra como «—» y la consola (F12) avisa qué falta. El código QR de la sección Equipo se genera solo a partir de `repoUrl`.

## 4. Publicar

**GitHub Pages** (ya publicado en <https://cris-pevi.github.io/qu-arto_de_pollo/>): **Settings → Pages → Deploy from a branch**, rama `main`, carpeta `/ (root)`. Cada push se publica en uno o dos minutos.

- Para la vista previa al compartir, pon la dirección pública en `siteUrl` de `config.js` y en las metaetiquetas de `index.html`: `og:image` → `https://cris-pevi.github.io/qu-arto_de_pollo/assets/og.jpg`, y agrega `<meta property="og:url" content="https://cris-pevi.github.io/qu-arto_de_pollo/">`. WhatsApp guarda las vistas previas: si no cambia, agrega `?v=2` al enlace.
- **GitHub Pages publica todo el repositorio**, también `pipeline/`: cualquiera puede descargar el dataset y los modelos. Revisa que no haya credenciales antes de cada commit.

**Netlify:** arrastra la carpeta a <https://app.netlify.com/drop> y actualiza `og:image` y `siteUrl` con la dirección que te dé.

## 5. Probar en local

```
node tools/validar_data.js
python -m http.server 8000      # y abre http://localhost:8000
```

También funciona abriendo `index.html` con doble clic. La web es 100 % estática: sin servidor, sin CDN ni recursos remotos, unos 620 KiB. Está en español e inglés (botón **EN/ES** o `?lang=en`), con tema oscuro y claro.

## Qué hace (y qué no)

- Es una exploración. No afirma ventaja cuántica, ni que el híbrido supere al clásico, ni que esté listo para uso operativo.
- Todo corre en simuladores exactos y sin ruido: Qiskit en CPU para entrenar y nuestro simulador en el navegador para la demo. Nada corrió en un computador cuántico real.
- Los datos son 5 días de un mismo evento (marzo de 2023). Las métricas de la web salen de un solo día de validación, también usado para el early stopping y el umbral, así que son optimistas; la comparación sólida es la validación cruzada por día.
- No incluye cifras de daños o inundaciones externas ni logos de IBM.

## Créditos y licencias

- Datos: NOAA GOES-R (AWS Open Data) y NASA GPM IMERG.
- Inter y JetBrains Mono: SIL Open Font License 1.1 (copias en `fonts/`).
- `js/qrcode.js`: generador de códigos QR de Kazuhiko Arase (licencia MIT, cabecera incluida en el archivo). Solo se descarga si `repoUrl` está completo.
- Paleta de mapas de calor: inferno (matplotlib), perceptualmente uniforme y apta para daltonismo.
