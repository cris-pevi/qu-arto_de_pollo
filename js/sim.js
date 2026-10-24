/* sim.js — simulador de 4 qubits (vector de estado de 16 amplitudes), en JavaScript puro.
   Circuito del proyecto: RY(x_i) por qubit + RealAmplitudes(reps=2, entanglement="linear").
   Convención de Qiskit (little-endian): el qubit q es el bit q del índice del estado.
   Se mide <Z> en cada qubit y se promedia. Todo el circuito es real (RY y CNOT), así que
   las amplitudes son reales. */
(function () {
  "use strict";
  var QP = (window.QP = window.QP || {});

  /* Pasos del circuito (cada paso = columna del dibujo).
     ry: rotación en Y del qubit q con el parámetro p (entrada x[q] o peso w[idx]). cx: CNOT control c, objetivo t. */
  var STEPS = [];
  (function () {
    var q, k = 0;
    STEPS.push({ name: "enc", ops: [0, 1, 2, 3].map(function (q) { return { g: "ry", q: q, src: "x", i: q }; }) });
    for (var layer = 0; layer < 3; layer++) {
      STEPS.push({ name: "w" + layer, ops: [0, 1, 2, 3].map(function (q) { return { g: "ry", q: q, src: "w", i: k++ }; }) });
      if (layer < 2) for (q = 0; q < 3; q++) STEPS.push({ name: "cx" + layer + q, ops: [{ g: "cx", c: q, t: q + 1 }] });
    }
  })();

  function ry(psi, q, th) {
    var c = Math.cos(th / 2), s = Math.sin(th / 2), m = 1 << q;
    for (var i = 0; i < 16; i++) {
      if (!(i & m)) {
        var j = i | m, a = psi[i], b = psi[j];
        psi[i] = c * a - s * b; psi[j] = s * a + c * b;
      }
    }
  }
  function cx(psi, c, t) {
    var mc = 1 << c, mt = 1 << t;
    for (var i = 0; i < 16; i++) {
      if ((i & mc) && !(i & mt)) { var j = i | mt, a = psi[i]; psi[i] = psi[j]; psi[j] = a; }
    }
  }

  /* x: 4 ángulos de entrada; w: 12 pesos. Devuelve { psi, z:[4], mean } */
  function run(x, w) {
    if (!x || x.length !== 4 || !w || w.length !== 12) throw new Error("entrada: se esperan 4 ángulos y 12 pesos");
    var psi = new Float64Array(16); psi[0] = 1;
    for (var s = 0; s < STEPS.length; s++) {
      var ops = STEPS[s].ops;
      for (var o = 0; o < ops.length; o++) {
        var op = ops[o];
        if (op.g === "ry") {
          var th = op.src === "x" ? x[op.i] : w[op.i];
          if (typeof th !== "number" || !isFinite(th)) throw new Error("ángulo no numérico");
          ry(psi, op.q, th);
        } else cx(psi, op.c, op.t);
      }
    }
    var z = [0, 0, 0, 0], q, i;
    for (i = 0; i < 16; i++) {
      var p = psi[i] * psi[i];
      for (q = 0; q < 4; q++) z[q] += (i >> q) & 1 ? -p : p;
    }
    return { psi: psi, z: z, mean: (z[0] + z[1] + z[2] + z[3]) / 4 };
  }

  /* Prueba contra los vectores calculados con Qiskit (tolerancia 1e-6). */
  function selfTest(tests, tol) {
    tol = tol || 1e-6;
    if (!Array.isArray(tests) || !tests.length) return { ok: null, n: 0, failed: [], maxErr: null };
    var failed = [], maxErr = 0;
    tests.forEach(function (t, k) {
      try {
        var r = run(t.entrada, t.pesos), err = Math.abs(r.mean - t.z_esperado);
        if (!(err <= tol)) failed.push(k);
        if (isFinite(err)) maxErr = Math.max(maxErr, err); else failed.push(k);
      } catch (e) { failed.push(k); }
    });
    return { ok: failed.length === 0, n: tests.length, failed: failed, maxErr: maxErr };
  }

  QP.sim = { STEPS: STEPS, run: run, selfTest: selfTest };
})();
