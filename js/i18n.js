/* i18n.js — español (por defecto) / inglés.
   El español de los textos fijos vive en index.html; aquí está su traducción al inglés (EN)
   y los textos dinámicos de ambos idiomas (DYN_ES / EN). */
(function () {
  "use strict";
  var QP = (window.QP = window.QP || {});
  var ES = {};            /* se llena leyendo index.html */
  var nodes = [];         /* { el, key } y { el, attr, key } */

  /* ------------------------------------------------------------ glosario */
  QP.GLOSS = {
    qubit: { n: "qubit", q: true,
      d: { es: "La unidad básica de la computación cuántica. Como un bit, pero puede estar en una mezcla de 0 y 1.",
           en: "The basic unit of quantum computing. Like a bit, but it can be in a mix of 0 and 1." } },
    ry: { n: "RY", q: true,
      d: { es: "Compuerta que gira un qubit un ángulo dado alrededor del eje Y.",
           en: "A gate that rotates a qubit by a given angle around the Y axis." } },
    cnot: { n: "CNOT", q: true,
      d: { es: "Compuerta de dos qubits: invierte el segundo si el primero está en 1. Sirve para enlazarlos (entrelazamiento).",
           en: "A two-qubit gate: it flips the second qubit if the first is 1. It links them (entanglement)." } },
    z: { n: "<Z>", q: true,
      d: { es: "Valor medio de medir un qubit en la base 0/1: +1 si siempre da 0 y −1 si siempre da 1.",
           en: "Average result of measuring a qubit in the 0/1 basis: +1 if it always gives 0, −1 if it always gives 1." } },
    bt: { n: { es: "temperatura de brillo", en: "brightness temperature" },
      d: { es: "La temperatura que tendría un cuerpo negro con la misma radiación infrarroja. Una nube más alta se ve más fría.",
           en: "The temperature a black body would need to give off the same infrared radiation. Higher clouds look colder." } },
    imerg: { n: "IMERG",
      d: { es: "Producto de la NASA (GPM) que estima la lluvia combinando satélites. Aquí: 0.1° de resolución, cada 30 minutos.",
           en: "NASA (GPM) product that estimates rainfall by combining satellites. Here: 0.1° resolution, every 30 minutes." } },
    prauc: { n: "PR-AUC",
      d: { es: "Área bajo la curva precisión–sensibilidad. Resume qué tan bien el modelo pone los casos positivos primero.",
           en: "Area under the precision–recall curve. It summarizes how well the model ranks positive cases first." } },
    f1: { n: "F1",
      d: { es: "Media armónica de precisión y sensibilidad, calculada con el umbral elegido en validación.",
           en: "Harmonic mean of precision and recall, computed at the threshold chosen on validation data." } },
    umbral: { n: { es: "umbral", en: "threshold" },
      d: { es: "Riesgo a partir del cual el modelo dice «lluvia intensa». Se elige en validación.",
           en: "Risk level above which the model says “heavy rain”. It is chosen on validation data." } },
    azar: { n: { es: "línea base de azar", en: "chance baseline" },
      d: { es: "El PR-AUC de un modelo que adivina: es igual a la proporción de positivos en el conjunto de prueba.",
           en: "The PR-AUC of a model that guesses: it equals the share of positives in the test set." } }
  };
  Object.keys(QP.GLOSS).forEach(function (k) { var g = QP.GLOSS[k]; if (typeof g.n === "string") { var s = g.n; g.n = { es: s, en: s }; } });
  /* los términos del glosario salen en el mismo orden en la sección final */

  /* ------------------------------------------------------------ inglés: textos fijos + dinámicos */
  var EN = {
    "ui.skip": "Skip to content",
    "ui.banner": "SYNTHETIC TEST DATA, NOT REAL RESULTS",
    "ui.loading": "Loading…",
    "ui.copy": "Copy", "ui.copied": "Copied",
    "ui.menu": "Open menu",
    "ui.themeToLight": "Switch to light theme", "ui.themeToDark": "Switch to dark theme",
    "nav.home": "Qu-arto de pollo — home", "nav.label": "Sections",
    "nav.problema": "Problem", "nav.datos": "Data", "nav.modelo": "Model", "nav.laboratorio": "Lab",
    "nav.resultados": "Results", "nav.limites": "Limits", "nav.reproducir": "Reproduce", "nav.equipo": "Team",

    "hero.tagsLabel": "Key facts",
    "hero.tag1": "GOES-East + IMERG", "hero.tag2": "CNN + 4-qubit circuit", "hero.tag3": "Simulator · preliminary results",
    "hero.h1": "Heavy-rain risk in Piura two hours ahead, estimated from satellite images with a classical–quantum network",
    "hero.sub": "We test whether a quantum layer adds anything over a classical head of the same size.",
    "hero.demo": "Try the demo", "hero.code": "See the code",

    "sum.h2": "In 30 seconds",
    "sum.k1": "The problem", "sum.k2": "What we did", "sum.k3": "What we found", "sum.k4": "What comes next",
    "sum.v1": "Anticipating heavy rain in the lower and middle Piura valley with a couple of hours of lead time.",
    "sum.v2": "A hybrid model (CNN + 4-qubit circuit) reads GOES-East infrared images and estimates the risk in ~32 km patches.",
    "sum.v4": "Try real quantum hardware, with noise, and more rainy seasons.",
    "sum.criteria": "Where to look for each criterion",
    "sum.foundSyn": '<span class="tagnote">Synthetic</span>No real results here yet: this version shows synthetic test data and supports no conclusions.',
    "sum.foundReal": "Preliminary, on a noiseless simulator: PR-AUC {c} for the classical model and {h} for the hybrid; chance would give {b}. We cannot conclude anything about quantum advantage yet.",

    "prob.h2": "Why anticipate rain in Piura",
    "prob.p1": "In the summer season, and especially with the coastal El Niño, rain in Piura can turn heavy within hours. Anticipating it, even by two hours, buys time to prepare.",
    "prob.p2": "The satellite looks down: the colder a cloud top, the higher the cloud, and very tall clouds often bring heavy rain.",
    "prob.sat": "Satellite (infrared)", "prob.cold": "cold top", "prob.warm": "warm top", "prob.rainy": "heavy rain", "prob.calm": "little or none",
    "prob.cap": "Sketch: the satellite measures how cold the cloud top is. Colder means higher, and higher often goes with heavier rain.",

    "datos.h2": "The data: 16 patches over lower and middle Piura",
    "datos.showAll": "Show images in all cells",
    "datos.hint": "Hover or tap a patch to see its image.",
    "datos.ch1s": "Channel 1 · cloud coldness", "datos.ch2s": "Channel 2 · cooling",
    "datos.c1t": "Channel 1:", "datos.c1": "infrared brightness temperature, band 13 (10.3 µm): how cold the cloud top is.",
    "datos.c2t": "Channel 2:", "datos.c2": "how much it cooled compared with 30 min ago.",
    "datos.lt": "Label:", "datos.l": "1 if IMERG records 5 mm/h or more in any pixel of the patch.",
    "datos.moreS": "Data details",
    "datos.more": "Each patch is 16×16 pixels (about 32 km per side). The region spans −5.8 to −4.6 latitude and −81.2 to −79.8 longitude. We analyze 13:00 to 22:00 Peru time. The label uses NASA GPM IMERG (0.1°, every 30 min), averaging the next 2 hours: it is 1 if any pixel in the patch reaches 5 mm/h or more, otherwise 0. The two channels above are what the model receives.",
    "map.title": "Schematic map of the region",
    "map.desc": "A 4 by 4 grid of patches over lower and middle Piura, with the Pacific coast to the west and the cities of Sullana, Piura, Paita and Sechura. Approximate sketch, not to scale.",
    "map.sea1": "Pacific", "map.sea2": "Ocean",
    "map.cellHas": "Patch {id}, row {r}, column {c}. Show its image.",
    "map.cellNone": "Row {r}, column {c}: no sample.",
    "map.none": "no sample",
    "map.note": "Approximate sketch, not to scale",
    "map.note2": "lat −4.6 to −5.8 · lon −81.2 to −79.8",
    "peek.none": "Row {r}, column {c}: no sample image in this set.",
    "peek.title": "Patch {id} · row {r}, column {c}",
    "peek.meta": "lat {lat} · lon {lon} · {utc} UTC ({loc} Peru time) · label {lab} · coldest pixel {min} K",
    "peek.ariaBt": "Channel 1 of patch {id}: brightness temperature. The coldest point is {min} K, at row {r}, column {c}.",
    "peek.ariaDbt": "Channel 2 of patch {id}: change over 30 minutes. The strongest cooling is {v} K.",

    "mod.h2": "The model, block by block",
    "mod.lede": "Tap a block: we explain it simply first, then technically.",
    "mod.b1": "Satellite patch", "mod.b2": "Small CNN", "mod.b3": "Four angles", "mod.b4": "4-qubit circuit", "mod.b5": "Measurement and average", "mod.b6": "Risk",
    "mod.simple": "In plain words", "mod.tech": "Technically",
    "mod.d1s": "An infrared picture about 32 km wide, with two layers: how cold the cloud is and how much it cooled in half an hour.",
    "mod.d1t": '2-channel input: <button type="button" class="term" data-term="bt">brightness temperature</button> from band 13 (10.3 µm) and its change over the last 30 min.',
    "mod.d2s": "A network that looks for shapes in the image, such as very cold cores or cloud edges, and boils them down to just four numbers.",
    "mod.d2t": "2 convolutions 3×3 (8 and 16 filters), maxpool and a linear layer that outputs 4 numbers.",
    "mod.d3s": "Each number becomes an angle between −90° and 90°, which is what the quantum circuit can read.",
    "mod.d3t": "x<sub>i</sub> = tanh(a<sub>i</sub>)·π/2, so each angle falls in (−π/2, π/2).",
    "mod.d4s": 'Each angle turns one <button type="button" class="term" data-term="qubit">qubit</button>. Then the qubits are linked together and turned again with 12 knobs that training adjusts.',
    "mod.d4t": 'One <button type="button" class="term" data-term="ry">RY</button>(x<sub>i</sub>) rotation per qubit, then RealAmplitudes with 2 repetitions and linear entanglement: 3 layers of 4 RY and 2 chains of <button type="button" class="term" data-term="cnot">CNOT</button> (0-1, 1-2, 2-3). 12 trainable weights.',
    "mod.d5s": "Each qubit is read and gives a value between −1 and 1. Then the four are averaged.",
    "mod.d5t": 'Expectation value <button type="button" class="term" data-term="z">&lt;Z&gt;</button> on each qubit, averaged. The result lies between −1 and 1.',
    "mod.d6s": "A last adjustment turns the average into a risk number for that patch. Above a threshold we say “heavy rain”.",
    "mod.d6t": 'Linear layer on the average of &lt;Z&gt;. The <button type="button" class="term" data-term="umbral">threshold</button> is chosen on validation data.',
    "mod.alt": "<b>Fair comparison:</b> the same CNN with a classical head (a linear layer from 4 to 1). Parameters: {c} for the classical model and {h} for the hybrid.",

    "lab.h2": "Lab",
    "lab.lede": "Everything runs in your browser: the hybrid CNN, the classical CNN and the QSVM run here with their trained weights, on our own quantum simulator.",
    "lab.s7": "QSVM: ZZ quantum kernel",
    "lab.guideT": "3-step guide", "lab.guideClose": "Close the guide", "lab.guideOpen": "Show the guide",
    "lab.g1": "Pick an example patch.", "lab.g2": "Press “Run model” and watch the journey.", "lab.g3": "Scroll to the circuit, load its angles and move them.",
    "lab.aT": "Patch explorer", "lab.pick": "Example patch",
    "lab.ch1": "Channel 1 · brightness temperature", "lab.ch1n": "brighter = colder",
    "lab.ch2": "Channel 2 · cooling in 30 min", "lab.ch2n": "brighter = cooled more",
    "lab.run": "Run model",
    "lab.stagesLabel": "Model journey for the chosen patch",
    "lab.s1": "Patch", "lab.s2": "CNN: 4 numbers", "lab.s3": "Angles", "lab.s4": "Circuit: <Z> per qubit", "lab.s5": "Average of <Z>", "lab.s6": "Hybrid risk",
    "lab.bT": "Live circuit",
    "lab.bLede": "Move the input angles. A 4-qubit simulator (a state vector of 16 amplitudes) recomputes everything instantly.",
    "lab.weights": "Circuit weights", "lab.wRand": "Random weights", "lab.wTrain": "Trained weights",
    "lab.reset": "Set angles to zero",
    "lab.zT": "Measurement result",
    "lab.lgEnc": "Input RY (from the CNN)", "lab.lgW": "RY with a trainable weight", "lab.lgCx": "CNOT", "lab.lgMeas": "Measure <Z>", "lab.lgHint": "Tap or hover a gate to see what it does.",
    "lab.psiS": "See the state vector (16 amplitudes)",

    "res.h2": "Results: classical vs quantum",
    "res.lede": "Same CNN with two heads (a classical linear layer or the 4-qubit circuit), plus a QSVM with a quantum kernel. Metrics come from the validation day: it was not used to fit weights, but it was used for early stopping and the threshold.",
    "res.cap": "Metrics of the two models",
    "res.metric": "Metric", "res.cls": "Classical", "res.hyb": "Hybrid",
    "res.curveLabel": "Curve", "res.curvePr": "Validation PR-AUC", "res.curveLoss": "Loss",
    "res.chartAria": "Per-epoch curves chart. Use the left and right arrow keys to move through epochs.",
    "res.tableS": "See the curve values as a table",
    "res.canT": "What we can say", "res.cannotT": "What we cannot say",
    "res.f1": "F1 (validation threshold)", "res.pr": "PR-AUC", "res.thr": "Threshold", "res.params": "Parameters", "res.time": "Training time",
    "res.chance": "Chance baseline (share of positives on the validation day): {b}",
    "res.noCurve": "No curves found in data.js.",
    "res.epoch": "Epoch", "res.chanceShort": "Chance",
    "res.capSyn": "(Example data.)",
    "res.capPr": "Validation PR-AUC per epoch: at epoch {e} the classical model reaches {c} and the hybrid {h}; the dotted line is chance ({b}).",
    "res.capLoss": "Loss per epoch: at epoch {e} the classical model reaches {c} and the hybrid {h}.",
    "res.tip": "<b>Epoch {e}</b><br><span class=\"mono\">Classical {c}</span><br><span class=\"mono\">Hybrid {h}</span>",
    "res.tipText": "Epoch {e}: classical {c}, hybrid {h}",
    "res.can1": "Both models share the same CNN and almost the same size ({c} and {h} parameters), so the comparison is direct.",
    "res.can2": "With these figures, PR-AUC is {c} for the classical model and {h} for the hybrid; chance would give {b}.",
    "res.can3": "Hybrid − classical difference: {dp} in PR-AUC and {df} in F1.",
    "res.can4": "The QSVM (ZZ quantum kernel on 7 physical features, {n} support vectors) reaches PR-AUC {q} on the same day.",
    "res.can5": "All three models run in your browser and reproduce PyTorch and Qiskit: what you see in the lab is the real model.",
    "res.qsvm": "QSVM", "res.nsv": "{n} support vect.",
    "res.cannotSyn": "Anything about the real model: this version’s figures are synthetic and only fill the layout.",
    "res.cannot1": "That the quantum layer improves on the classical model: we do not claim quantum advantage.",
    "res.cannot2": "That the result holds on real hardware: this is a noiseless simulator with at most 400 samples.",
    "res.cannot3": "That it generalizes to other seasons: there are only 5 days from a single event (March 2023), and these metrics come from one validation day.",

    "lim.h2": "Limits and next steps",
    "lim.nowT": "Today",
    "lim.n1": "Runs on exact, noiseless simulators (Qiskit on CPU for training, our simulator in the browser), not on quantum hardware.",
    "lim.n2": "At most 400 samples: the simulated quantum layer is slow.",
    "lim.n3": "Results with real data are preliminary.",
    "lim.n4": "The metrics on this site come from a single validation day, also used for early stopping and the threshold: they are optimistic. In per-day cross-validation, hybrid and classical tie.",
    "lim.n5": "We do not claim quantum advantage or operational use.",
    "lim.sim": "Simulator", "lim.sim2": "no noise", "lim.hw": "Real hardware", "lim.hw2": "Qiskit Runtime", "lim.noise": "noise appears", "lim.adj": "Model adjustments",
    "mod.s4": "12 weights", "mod.s6": "linear · 0 to 1",
    "lim.p1": "seasons", "lim.p2": "test", "lim.p3": "ansatz", "lim.p4": "qubits",
    "lim.cap": "Sketch of the path: from simulator to real hardware, and the model adjustments.",
    "lim.nextT": "Next steps",
    "lim.x1": "Inference on real hardware with Qiskit Runtime using the already trained weights (retraining there is not viable: each epoch needs thousands of circuits), going first through a noisy simulator (Qiskit Aer). For the QSVM, evaluate the kernel against the support vectors on hardware.",
    "lim.x2": "Add more rainy seasons.",
    "lim.x3": "Hold out a test day independent of the day used for early stopping and the threshold.",
    "lim.x4": "Tune the ansatz and the number of qubits.",

    "rep.h2": "Reproduce the experiment", "rep.lede": "Three steps, in this order, from the repository's <code>pipeline/</code> folder.",
    "rep.c1t": "1. Download images and labels", "rep.c1n": "Creates the CSV and the patch file.",
    "rep.c2t": "2. Train and save the models", "rep.c2n": "Without <code>--guardar</code> they run the per-day cross-validation and compare with classical models. With <code>--demo</code> the flow is tested with synthetic data.",
    "rep.c3t": "3. Bring the models to this site", "rep.c3n": "Writes the weights of the three models into <code>data.js</code> and checks that the browser reproduces PyTorch and Qiskit.",
    "rep.reqT": "Requirements",
    "rep.r1": "Python with PyTorch, Qiskit and qiskit-machine-learning.",
    "rep.r2": "A free NASA Earthdata account, for the IMERG labels.",
    "rep.repo": "Open the repository",

    "team.h2": "Team and wrap-up", "team.event": "Event", "team.contact": "Contact", "team.thanks": "Acknowledgments",
    "team.qrAria": "QR code of the repository", "team.qrPh": "The QR appears once the repository URL is filled in config.js",
    "gl.h2": "Glossary",
    "foot.p": "Static site: no cookies, no analytics and no external resources. Every figure comes from the data.js file.",
    "foot.meta": "version {v} · date {f} · {s}", "foot.syn": "synthetic data", "foot.real": "real data",

    "cat.pos": "positive", "cat.neg": "negative", "cat.hard": "hard",
    "err.noPatches": "There are no patches in data.js.",
    "err.noData": "Could not load the data (data.js). Check that the file sits next to index.html.",
    "err.labData": "The lab needs more data in data.js (patches and the 12-value circuit weights).",
    "lab.roBt": "Coldest: {v} K (row {r}, col. {c})", "lab.roDbt": "Strongest cooling: {v} K (row {r}, col. {c})",
    "lab.cellBt": "{v} K (row {r}, col. {c})", "lab.cellDbt": "Change {v} K (row {r}, col. {c})",
    "lab.ariaBt": "Channel 1 of patch {id}: brightness temperature. Minimum {min} K at row {r}, column {c}.",
    "lab.ariaDbt": "Channel 2 of patch {id}: temperature change over 30 minutes. The strongest cooling is {v} K at row {r}, column {c}.",
    "lab.predYes": "predicts heavy rain", "lab.predNo": "predicts none", "lab.right": "correct", "lab.wrong": "wrong",
    "lab.riskC": "Risk · classical", "lab.riskH": "Risk · hybrid", "lab.meterAria": "Risk {v}; threshold {u}", "lab.thr": "threshold",
    "lab.riskQ": "Score · QSVM",
    "lab.qNote": "Sigmoid of the SVM margin (not a calibrated probability). It uses the patch's 7 physical features, not the image.",
    "lab.qStep": "angles {a} · {n} support vectors · margin {d}",
    "lab.livePre": "This data.js has no model weights: the probabilities shown are precomputed.",
    "lab.liveOk": "All 3 models run in your browser and reproduce PyTorch/Qiskit on {n} patches (maximum error {e}).",
    "lab.liveBad": "The models in the browser do not match PyTorch/Qiskit: showing precomputed values.",
    "lab.liveRun": "Computed just now in your browser: 3 models in {ms} ms.",
    "lab.truth": "<b>True label (IMERG):</b> {y} · maximum rain in the patch: {r} mm/h (the label is 1 from 5 mm/h)",
    "lab.usePatchId": "Use the angles of patch {id}",
    "lab.vsC": "classical", "lab.runDone": "Patch {id}: hybrid risk {h}, classical {c}; true label {y}.",
    "lab.qubit": "qubit",
    "lab.circAria": "4-qubit circuit with input angles {x} and an average of <Z> equal to {z}.",
    "lab.hIn": "input", "lab.hW": "weights", "lab.hMeas": "measure", "lab.mean": "average",
    "lab.zmean": "Average of <Z> = {v}", "lab.psiTitle": "Basis-state amplitude (bar: probability)",
    "lab.linked": "These are the angles of patch {id} with trained weights: the model gave hybrid risk {h} (true label {y}).",
    "lab.notLinked": "Press “Use the angles of patch…” to connect the circuit to a patch.",
    "lab.simErr": "Simulator error: {m}",
    "lab.simNoTests": "No test vectors in data.js: the simulator could not be compared with Qiskit.",
    "lab.simOk": "Simulator verified: {n} Qiskit vectors, maximum error {e}.",
    "lab.simBad": "The simulator does not match Qiskit.",
    "lab.noAngles": "This patch does not have the 4 CNN activations.", "lab.loaded": "Angles of patch {id} loaded with trained weights.",
    "tip.gEnc": "<b>Input RY.</b> Turns the qubit by an angle that comes from the CNN: one number per qubit.",
    "tip.gW": "<b>RY with a weight.</b> Turns the qubit by an angle learned during training (12 in total).",
    "tip.cx": "<b>CNOT.</b> Flips the target qubit (the circle with a plus) if the control qubit (the dot) is 1. This links the qubits.",
    "tip.meas": "<b>Measuring &lt;Z&gt;.</b> A value between −1 and 1: near 1 if the qubit tends to 0, near −1 if it tends to 1."
  };

  /* ------------------------------------------------------------ español: textos dinámicos */
  var DYN_ES = {
    "ui.copied": "Copiado", "ui.themeToLight": "Cambiar a tema claro", "ui.themeToDark": "Cambiar a tema oscuro",
    "sum.foundSyn": '<span class="tagnote">Sintético</span>Todavía no hay resultados reales aquí: esta versión muestra datos sintéticos de prueba y no permite sacar conclusiones.',
    "sum.foundReal": "Preliminar, en simulador sin ruido: PR-AUC {c} del modelo clásico y {h} del híbrido; el azar daría {b}. Aún no podemos concluir nada sobre ventaja cuántica.",
    "err.noPatches": "No hay parches en data.js.",
    "err.noData": "No se pudieron cargar los datos (data.js). Revisa que el archivo esté junto a index.html.",
    "err.labData": "Faltan datos para el laboratorio en data.js (parches o los 12 pesos del circuito).",
    "map.title": "Mapa esquemático de la región",
    "map.desc": "Cuadrícula de 4 por 4 parches sobre el Bajo y Medio Piura, con la costa del Pacífico al oeste y las ciudades de Sullana, Piura, Paita y Sechura. Esquema aproximado, no a escala.",
    "map.sea1": "Océano", "map.sea2": "Pacífico",
    "map.cellHas": "Parche {id}, fila {r}, columna {c}. Ver su imagen.",
    "map.cellNone": "Fila {r}, columna {c}: sin ejemplo.",
    "map.none": "sin ejemplo",
    "map.note": "Esquema aproximado, no a escala",
    "map.note2": "lat −4.6 a −5.8 · lon −81.2 a −79.8",
    "peek.none": "Fila {r}, columna {c}: no hay imagen de ejemplo en esta muestra.",
    "peek.title": "Parche {id} · fila {r}, columna {c}",
    "peek.meta": "lat {lat} · lon {lon} · {utc} UTC ({loc} hora de Perú) · etiqueta {lab} · píxel más frío {min} K",
    "peek.ariaBt": "Canal 1 del parche {id}: temperatura de brillo. El punto más frío es {min} K, en la fila {r}, columna {c}.",
    "peek.ariaDbt": "Canal 2 del parche {id}: cambio en 30 minutos. El mayor enfriamiento es {v} K.",
    "mod.alt": "<b>Comparación justa:</b> la misma CNN con una cabeza clásica (capa lineal de 4 a 1). Parámetros: {c} el clásico y {h} el híbrido.",
    "res.f1": "F1 (umbral de validación)", "res.pr": "PR-AUC", "res.thr": "Umbral", "res.params": "Parámetros", "res.time": "Tiempo de entrenamiento",
    "res.chance": "Línea base de azar (proporción de positivos en el día de validación): {b}",
    "res.noCurve": "No hay curvas en data.js.",
    "res.epoch": "Época", "res.chanceShort": "Azar",
    "res.capSyn": "(Datos de ejemplo.)",
    "res.capPr": "PR-AUC de validación por época: en la época {e} el clásico llega a {c} y el híbrido a {h}; la línea punteada es el azar ({b}).",
    "res.capLoss": "Pérdida por época: en la época {e} el clásico llega a {c} y el híbrido a {h}.",
    "res.tip": '<b>Época {e}</b><br><span class="mono">Clásico {c}</span><br><span class="mono">Híbrido {h}</span>',
    "res.tipText": "Época {e}: clásico {c}, híbrido {h}",
    "res.can1": "Los dos modelos comparten la misma CNN y casi el mismo tamaño ({c} y {h} parámetros): la comparación es directa.",
    "res.can2": "Con estas cifras, el PR-AUC del clásico es {c} y el del híbrido {h}; el azar daría {b}.",
    "res.can3": "Diferencia híbrido − clásico: {dp} en PR-AUC y {df} en F1.",
    "res.can4": "La QSVM (kernel cuántico ZZ sobre 7 features físicas, {n} vectores de soporte) llega a PR-AUC {q} en el mismo día.",
    "res.can5": "Los tres modelos se ejecutan en tu navegador y reproducen a PyTorch y Qiskit: lo que ves en el laboratorio es el modelo real.",
    "res.qsvm": "QSVM", "res.nsv": "{n} vect. soporte",
    "res.cannotSyn": "Nada sobre el modelo real: las cifras de esta versión son sintéticas y solo sirven para maquetar.",
    "res.cannot1": "Que la capa cuántica mejore al modelo clásico: no afirmamos ventaja cuántica.",
    "res.cannot2": "Que el resultado se mantenga en hardware real: aquí corre un simulador sin ruido, con 400 muestras como máximo.",
    "res.cannot3": "Que generalice a otras temporadas: solo hay 5 días de un mismo evento (marzo de 2023) y estas métricas salen de un único día de validación.",
    "foot.meta": "versión {v} · fecha {f} · {s}", "foot.syn": "datos sintéticos", "foot.real": "datos reales",
    "cat.pos": "positivo", "cat.neg": "negativo", "cat.hard": "difícil",
    "lab.roBt": "Más frío: {v} K (fila {r}, col. {c})", "lab.roDbt": "Mayor enfriamiento: {v} K (fila {r}, col. {c})",
    "lab.cellBt": "{v} K (fila {r}, col. {c})", "lab.cellDbt": "Cambio {v} K (fila {r}, col. {c})",
    "lab.ariaBt": "Canal 1 del parche {id}: temperatura de brillo. Mínimo {min} K en la fila {r}, columna {c}.",
    "lab.ariaDbt": "Canal 2 del parche {id}: cambio de temperatura en 30 minutos. El mayor enfriamiento es {v} K en la fila {r}, columna {c}.",
    "lab.predYes": "predice lluvia intensa", "lab.predNo": "predice que no", "lab.right": "acierta", "lab.wrong": "falla",
    "lab.riskC": "Riesgo · clásico", "lab.riskH": "Riesgo · híbrido", "lab.meterAria": "Riesgo {v}; umbral {u}", "lab.thr": "umbral",
    "lab.riskQ": "Puntaje · QSVM",
    "lab.qNote": "Sigmoide del margen de la SVM (no es una probabilidad calibrada). Usa las 7 features físicas del parche, no la imagen.",
    "lab.qStep": "ángulos {a} · {n} vectores de soporte · margen {d}",
    "lab.livePre": "Este data.js no trae los pesos de los modelos: las probabilidades son precalculadas.",
    "lab.liveOk": "Los 3 modelos corren en tu navegador y reproducen a PyTorch/Qiskit en {n} parches (error máximo {e}).",
    "lab.liveBad": "Los modelos del navegador no coinciden con PyTorch/Qiskit: se muestran valores precalculados.",
    "lab.liveRun": "Calculado ahora mismo en tu navegador: 3 modelos en {ms} ms.",
    "lab.truth": "<b>Etiqueta real (IMERG):</b> {y} · lluvia máxima en el parche: {r} mm/h (la etiqueta es 1 desde 5 mm/h)",
    "lab.usePatchId": "Usar los ángulos del parche {id}",
    "lab.vsC": "clásico", "lab.runDone": "Parche {id}: riesgo híbrido {h}, clásico {c}; etiqueta real {y}.",
    "lab.qubit": "qubit",
    "lab.circAria": "Circuito de 4 qubits con ángulos de entrada {x} y promedio de <Z> igual a {z}.",
    "lab.hIn": "entrada", "lab.hW": "pesos", "lab.hMeas": "medir", "lab.mean": "promedio",
    "lab.zmean": "Promedio de <Z> = {v}", "lab.psiTitle": "Amplitud del estado base (barra: probabilidad)",
    "lab.linked": "Son los ángulos del parche {id} con pesos entrenados: el modelo dio riesgo híbrido {h} (etiqueta real {y}).",
    "lab.notLinked": "Pulsa «Usar los ángulos del parche…» para conectar el circuito con un parche.",
    "lab.simErr": "Error del simulador: {m}",
    "lab.simNoTests": "Sin vectores de prueba en data.js: no se pudo comparar el simulador con Qiskit.",
    "lab.simOk": "Simulador verificado: {n} vectores de Qiskit, error máximo {e}.",
    "lab.simBad": "El simulador no coincide con Qiskit.",
    "lab.noAngles": "Este parche no tiene las 4 activaciones de la CNN.", "lab.loaded": "Ángulos del parche {id} cargados con pesos entrenados.",
    "tip.gEnc": "<b>RY de entrada.</b> Gira el qubit un ángulo que viene de la CNN: un número por qubit.",
    "tip.gW": "<b>RY con peso.</b> Gira el qubit un ángulo que se aprende en el entrenamiento (12 en total).",
    "tip.cx": "<b>CNOT.</b> Invierte el qubit de destino (el círculo con un más) si el de control (el punto) está en 1. Así los qubits quedan enlazados.",
    "tip.meas": "<b>Medición de &lt;Z&gt;.</b> Valor entre −1 y 1: cerca de 1 si el qubit tiende a 0 y cerca de −1 si tiende a 1."
  };

  /* ------------------------------------------------------------ motor */
  QP.lang = "es";
  QP.t = function (key, vars) {
    var s;
    if (QP.lang === "en") s = EN[key];
    else s = DYN_ES[key] != null ? DYN_ES[key] : ES[key];
    if (s == null) s = ES[key] != null ? ES[key] : DYN_ES[key] != null ? DYN_ES[key] : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  };
  var meta = { title: "", desc: "" };
  QP.i18nInit = function () {
    nodes = [];
    QP.$$("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n");
      if (ES[k] == null) ES[k] = el.innerHTML;
      nodes.push({ el: el, key: k });
    });
    QP.$$("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(",").forEach(function (pair) {
        var p = pair.split("="), a = p[0].trim(), k = p[1].trim();
        if (ES[k] == null) ES[k] = el.getAttribute(a) || "";
        nodes.push({ el: el, attr: a, key: k });
      });
    });
    meta.title = document.title;
    var d = QP.$('meta[name="description"]'); meta.desc = d ? d.getAttribute("content") : "";
  };
  function apply() {
    var en = QP.lang === "en";
    nodes.forEach(function (n) {
      var v = en ? (EN[n.key] != null ? EN[n.key] : ES[n.key]) : ES[n.key];
      if (v == null) return;
      if (n.attr) n.el.setAttribute(n.attr, v); else n.el.innerHTML = v;
    });
    document.documentElement.lang = QP.lang;
    var title = en ? "Qu-arto de pollo · Heavy rain in Piura with a hybrid classical–quantum model" : meta.title;
    var desc = en ? "Interactive demo: a hybrid model (CNN + 4-qubit quantum circuit) estimates heavy-rain risk in Piura two hours ahead from GOES-East images. Simulator, preliminary results." : meta.desc;
    document.title = title;
    var d = QP.$('meta[name="description"]'); if (d) d.setAttribute("content", desc);
    var ot = QP.$('meta[property="og:title"]'); if (ot) ot.setAttribute("content", title);
    var od = QP.$('meta[property="og:description"]');
    if (od) od.setAttribute("content", en ? "Try the demo: satellite patches, a 4-qubit circuit in your browser and an honest comparison with a classical model." : "Prueba la demo: parches de satélite, un circuito de 4 qubits en tu navegador y la comparación honesta con un modelo clásico.");
    var b = QP.$("#btn-lang"); QP.$("#lang-txt").textContent = en ? "ES" : "EN";
    b.setAttribute("aria-label", en ? "ES: Cambiar a español" : "EN: Switch to English");
    b.setAttribute("lang", en ? "es" : "en");
  }
  QP.setLang = function (l, noStore) {
    QP.lang = l === "en" ? "en" : "es";
    if (!noStore) QP.store.set("qp-lang", QP.lang);
    apply();
    QP.refreshThemeBtn();
    QP.fireLang();
  };
  /* para pruebas: claves del inglés que faltan */
  QP.i18nMissing = function () {
    var out = [];
    nodes.forEach(function (n) { if (EN[n.key] == null && out.indexOf(n.key) < 0) out.push(n.key); });
    return out;
  };
})();
