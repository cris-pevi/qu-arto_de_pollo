# Qu-arto de pollo · Demo web

Sitio de una sola página para el jurado del IBM Quantum Hackathon 2026 (Lima). Explica y deja probar un modelo híbrido clásico-cuántico que estima el riesgo de lluvia intensa en Bajo y Medio Piura a 2 horas, con imágenes GOES-19.

- 100 % estático: sin servidor, sin CDN, sin recursos remotos. Pesa unos 450 KiB.
- Funciona abriendo `index.html` con doble clic (`file://`) y en GitHub Pages o Netlify.
- Español e inglés (botón **EN/ES** o `?lang=en`), tema oscuro y claro.

> **Estado de los datos:** `data.js` viene con **datos sintéticos de prueba**. Mientras `meta.is_synthetic` sea `true`, el sitio muestra un aviso fijo arriba. Nada de lo que se ve son resultados reales hasta que reemplaces ese archivo.

## Estructura

```
index.html        Contenido y estructura (texto en español)
config.js         Lo que el equipo completa: integrantes, repositorio, contacto, criterios
data.js           Todos los números del sitio (window.DEMO). Se reemplaza con datos reales
css/styles.css    Diseño (colores y tamaños arriba, en :root)
js/               core, i18n (inglés + glosario), sim (simulador de 4 qubits),
                  viz (mapas de calor), sections, lab (laboratorio), main, qrcode
fonts/            Inter y JetBrains Mono, locales (licencia OFL incluida)
assets/           favicon.svg y og.jpg (vista previa al compartir)
tools/            Generador de datos sintéticos, validador de data.js, imagen OG
```

## 1. Reemplazar `data.js` con tus resultados

Todo número del sitio sale de `data.js`. Si falta un campo, el sitio muestra «—».

1. Exporta tus resultados con la misma forma que el archivo actual (esquema abajo).
2. Pon `meta.is_synthetic: false` **solo** si son datos y resultados reales. Con `false` el aviso desaparece.
3. Valida el archivo (requiere Node.js):

   ```
   node tools/validar_data.js data.js
   ```

   Revisa el esquema y comprueba el simulador de 4 qubits contra `circuito.vectores_prueba` con tolerancia 1e-6. Termina con error si algo no cuadra. Dentro del sitio, si el simulador no coincide con Qiskit, se muestra «El simulador no coincide con Qiskit».

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
