#!/usr/bin/env node
/* Valida data.js contra el esquema de window.DEMO y prueba el simulador de JavaScript
   contra los vectores_prueba (tolerancia 1e-6).   Uso:  node tools/validar_data.js [ruta/a/data.js]
   Sale con código 1 si hay errores. No necesita instalar nada. */
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.resolve(__dirname, "..");
const file = path.resolve(process.argv[2] || path.join(root, "data.js"));
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(file, "utf8"), ctx);
vm.runInContext("window.QP = window.QP || {};", ctx);
vm.runInContext(fs.readFileSync(path.join(root, "js/sim.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(root, "js/models.js"), "utf8"), ctx);
const D = ctx.window.DEMO, QP = ctx.window.QP;
const err = [], warn = [];
const isN = (v) => typeof v === "number" && isFinite(v);
function need(cond, msg) { if (!cond) err.push(msg); }
function grid(g, name) {
  if (!Array.isArray(g) || g.length !== 16 || !g.every((r) => Array.isArray(r) && r.length === 16 && r.every(isN))) { err.push(name + ": debe ser una matriz 16x16 de números"); return false; }
  return true;
}
need(D && typeof D === "object", "window.DEMO no está definido");
if (D) {
  const m = D.meta || {};
  need(typeof m.is_synthetic === "boolean", "meta.is_synthetic debe ser true o false");
  ["fecha", "region", "version"].forEach((k) => { if (!m[k]) warn.push("meta." + k + " vacío (se mostrará —)"); });
  need(Array.isArray(D.patches) && D.patches.length >= 8 && D.patches.length <= 16, "patches: se esperan entre 8 y 16 parches (hay " + (D.patches || []).length + ")");
  const seen = new Set();
  (D.patches || []).forEach((p, i) => {
    const n = "patches[" + i + "]" + (p && p.id ? " (" + p.id + ")" : "");
    need(p && p.id, n + ": falta id");
    if (seen.has(p.id)) err.push(n + ": id repetido"); seen.add(p.id);
    need(Number.isInteger(p.fila) && p.fila >= 0 && p.fila < 4 && Number.isInteger(p.col) && p.col >= 0 && p.col < 4, n + ": fila y col deben ser enteros de 0 a 3");
    grid(p.bt, n + ".bt"); grid(p.dbt, n + ".dbt");
    need(p.etiqueta === 0 || p.etiqueta === 1, n + ": etiqueta debe ser 0 o 1");
    if (isN(p.lluvia_mmh) && (p.lluvia_mmh >= 5) !== (p.etiqueta === 1)) warn.push(n + ": etiqueta " + p.etiqueta + " no concuerda con lluvia_mmh=" + p.lluvia_mmh + " (la etiqueta es 1 desde 5 mm/h)");
    ["p_clasico", "p_hibrido"].forEach((k) => need(isN(p[k]) && p[k] >= 0 && p[k] <= 1, n + "." + k + ": número entre 0 y 1"));
    need(Array.isArray(p.activaciones_cnn) && p.activaciones_cnn.length === 4 && p.activaciones_cnn.every(isN), n + ".activaciones_cnn: 4 números");
    ["lat_c", "lon_c"].forEach((k) => { if (!isN(p[k])) warn.push(n + "." + k + " falta"); });
    if (!/^\d{1,2}:\d{2}$/.test(p.hora_utc || "")) warn.push(n + ".hora_utc debe ser 'HH:MM'");
  });
  const mt = D.metricas || {};
  ["clasico", "hibrido"].forEach((k) => ["F1", "PR_AUC", "umbral", "parametros", "t_entreno_s"].forEach((f) => { if (!isN((mt[k] || {})[f])) warn.push("metricas." + k + "." + f + " falta (se mostrará —)"); }));
  if (!isN(D.baseline_azar)) warn.push("baseline_azar falta (se mostrará —)");
  const c = D.curvas || {};
  const L = (c.epoca || []).length;
  ["prauc_val_clasico", "prauc_val_hibrido", "loss_clasico", "loss_hibrido"].forEach((k) => { if (!Array.isArray(c[k]) || c[k].length !== L) warn.push("curvas." + k + " debe tener " + L + " valores, como curvas.epoca"); });
  const ci = D.circuito || {};
  ["pesos_entrenados", "pesos_aleatorios"].forEach((k) => need(Array.isArray(ci[k]) && ci[k].length === 12 && ci[k].every(isN), "circuito." + k + ": 12 números"));
  need(Array.isArray(ci.vectores_prueba) && ci.vectores_prueba.length > 0, "circuito.vectores_prueba: incluye al menos 1 vector calculado con Qiskit");
  const r = QP.sim.selfTest(ci.vectores_prueba, 1e-6);
  if (r.ok === false) err.push("El simulador de JavaScript NO coincide con Qiskit en los vectores " + r.failed.join(", ") + " (error máx. " + r.maxErr + ")");
  else if (r.ok) console.log("Simulador JS vs Qiskit: " + r.n + " vectores OK, error máximo " + r.maxErr.toExponential(2));
  if (D.modelos) {
    const mr = QP.models.run(D, 1e-4);
    if (!mr) err.push("modelos: faltan modelos.clasica o modelos.hibrida");
    else {
      if (mr.kernel.ok === false) err.push("El kernel ZZ de JavaScript NO coincide con Qiskit (error máx. " + mr.kernel.maxErr + ")");
      else if (mr.kernel.ok) console.log("Kernel ZZ JS vs Qiskit: " + mr.kernel.n + " pares OK, error máximo " + mr.kernel.maxErr.toExponential(2));
      if (mr.fails.length) err.push("Los modelos en JavaScript NO reproducen a PyTorch/Qiskit en: " + mr.fails.join(", ") + " (error máx. " + mr.maxErr + ")");
      else console.log("Modelos JS vs PyTorch/Qiskit: " + mr.n + " parches OK, error máximo " + mr.maxErr.toExponential(2));
    }
  } else warn.push("sin 'modelos': la web mostrará probabilidades precalculadas en vez de ejecutar los modelos");
  console.log(m.is_synthetic ? "AVISO: is_synthetic = true → la web mostrará el banner de datos sintéticos." : "is_synthetic = false → el banner de datos sintéticos NO se mostrará. Verifica que son resultados reales.");
}
warn.forEach((w) => console.log("aviso:  " + w));
err.forEach((e) => console.log("ERROR:  " + e));
console.log(err.length ? "\n" + err.length + " error(es)." : "\nEsquema correcto.");
process.exit(err.length ? 1 : 0);
