# Lista antes de compartir

Marca cada punto antes de mandar el enlace o el QR al jurado.

## Datos y honestidad
- [ ] `data.js` reemplazado por los datos reales y `node tools/validar_data.js data.js` termina sin errores.
- [ ] `meta.is_synthetic` es `true` si los datos son de prueba (aviso fijo visible) y `false` solo si son reales. Abre el sitio y confirma que el aviso aparece o no según corresponde.
- [ ] Ninguna cifra, en ninguna sección, contradice `data.js` (revisa Resultados, Resumen y el pie de página: versión, fecha, «datos reales/sintéticos»).
- [ ] Confirmada la convención de `dbt` (`dbtEsCambio` en `config.js`) con quien generó el dataset.
- [ ] La sección **Límites** sigue diciendo: simulador sin ruido, máximo 400 muestras, resultados preliminares.
- [ ] Ningún texto promete «ventaja cuántica», «supera al clásico» o «listo para producción».

## Contenido del equipo
- [ ] `config.js` completo: integrantes, `repoUrl`, `contact`, criterios del jurado. Consola (F12) sin el aviso «Pendiente de completar».
- [ ] El enlace al repositorio abre y el repositorio es público (o el jurado tiene acceso).
- [ ] El QR de la sección Equipo se escanea con un teléfono y lleva al repositorio.
- [ ] Los comandos de **Reproducir** coinciden con los de `pipeline/` (`goes_sierra_lima.py`, `cnn_hibrida.py`, `qsvc_lluvias.py`, `exportar_web.py`) y los botones de copiar funcionan.
- [ ] Ningún archivo del repositorio tiene credenciales (busca `EARTHDATA` y contraseñas antes de cada commit).

## Publicación
- [ ] Sitio publicado en GitHub Pages o Netlify; la dirección abre desde una ventana privada.
- [ ] `og:image` y `siteUrl` apuntan a la dirección pública (URL absoluta).
- [ ] Vista previa en WhatsApp: pega el enlace en un chat contigo mismo y revisa título, descripción e imagen. Si no cambia, WhatsApp guarda la anterior: agrega `?v=2` al enlace.
- [ ] Cada sección tiene su enlace (por ejemplo `.../#laboratorio`) y abre en el lugar correcto.

## Teléfono
- [ ] Probado en un teléfono real, en vertical: sin scroll horizontal, texto legible, menú que abre y cierra.
- [ ] En el laboratorio: elegir un parche, **Correr modelo**, mover los 4 deslizadores, cambiar entre pesos aleatorios y entrenados, usar «ángulos del parche».
- [ ] Idioma EN y tema claro probados también en el teléfono.
- [ ] El mensaje del simulador dice «Simulador verificado» (no «no coincide con Qiskit»).

## Conexión lenta
- [ ] Prueba con la red limitada (DevTools → Network → Slow 4G, o datos móviles débiles): el texto aparece rápido y las animaciones no bloquean.
- [ ] Prueba con «Reducir movimiento» activado en el sistema: el campo infrarrojo queda quieto y todo sigue siendo usable.
- [ ] Con JavaScript desactivado se ve el resumen de `<noscript>`.

## Plan B el día de la presentación
- [ ] Tienes el sitio abierto en una pestaña ya cargada y una copia local (`index.html` desde la carpeta) por si falla la red.
- [ ] Teléfono con batería y brillo alto; el QR en pantalla grande o impreso.
