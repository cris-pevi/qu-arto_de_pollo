/* models.js — los tres modelos entrenados, ejecutados en el navegador con los pesos de data.js
   (DEMO.modelos, generado por exportar_web.py desde los .pt de PyTorch y el .pkl de la QSVM).
   - CNN (2 conv 3x3 + ReLU + max-pool, lineal 256->4): igual que Extractor en cnn_hibrida.py
   - Cabeza clásica: lineal 4->1.  Cabeza cuántica: circuito de 4 qubits (sim.js) + lineal 1->1
   - QSVM: escalado -> PCA -> [0, π] -> ZZFeatureMap (reps=2, lineal) -> kernel de fidelidad
   No usa el DOM: tools/validar_data.js lo carga en Node para verificarlo. */
(function () {
  "use strict";
  var QP = (window.QP = window.QP || {});
  var PI2 = Math.PI / 2, S2 = Math.SQRT1_2;

  /* ------------------------------------------------------------ CNN */
  function conv3(inp, C, H, W, w, b, O) {
    var out = new Float64Array(O * H * W), o, c, i, j, ki, kj;
    for (o = 0; o < O; o++) for (i = 0; i < H; i++) for (j = 0; j < W; j++) {
      var s = b[o];
      for (c = 0; c < C; c++) for (ki = 0; ki < 3; ki++) {
        var y = i + ki - 1; if (y < 0 || y >= H) continue;
        for (kj = 0; kj < 3; kj++) {
          var x = j + kj - 1; if (x < 0 || x >= W) continue;
          s += w[((o * C + c) * 3 + ki) * 3 + kj] * inp[(c * H + y) * W + x];
        }
      }
      out[(o * H + i) * W + j] = s > 0 ? s : 0;                     /* ReLU */
    }
    return out;
  }
  function pool2(inp, C, H, W) {
    var h = H / 2, w = W / 2, out = new Float64Array(C * h * w), c, i, j;
    for (c = 0; c < C; c++) for (i = 0; i < h; i++) for (j = 0; j < w; j++) {
      var a = (c * H + 2 * i) * W + 2 * j;
      out[(c * h + i) * w + j] = Math.max(inp[a], inp[a + 1], inp[a + W], inp[a + W + 1]);
    }
    return out;
  }
  /* parche (bt, dbt 16x16 en Kelvin) -> 4 activaciones antes de tanh */
  function cnn(M, bt, dbt) {
    var x = new Float64Array(2 * 256), r, c, k, n;
    for (r = 0; r < 16; r++) for (c = 0; c < 16; c++) {
      x[r * 16 + c] = (bt[r][c] - M.media[0]) / M.desv[0];
      x[256 + r * 16 + c] = (dbt[r][c] - M.media[1]) / M.desv[1];
    }
    var W = M.cnn, h = pool2(conv3(x, 2, 16, 16, W.c1w, W.c1b, 8), 8, 16, 16);
    h = pool2(conv3(h, 8, 8, 8, W.c2w, W.c2b, 16), 16, 8, 8);         /* 16x4x4 = 256 */
    var act = [];
    for (k = 0; k < 4; k++) {
      var s = W.lb[k];
      for (n = 0; n < 256; n++) s += W.lw[k * 256 + n] * h[n];
      act.push(s);
    }
    return act;
  }
  function sigmoid(v) { return 1 / (1 + Math.exp(-v)); }
  function angles(act) { return act.map(function (a) { return Math.tanh(a) * PI2; }); }

  function clasica(M, p) {
    var act = cnn(M, p.bt, p.dbt), ang = angles(act), s = M.salida.b;
    for (var i = 0; i < 4; i++) s += M.salida.w[i] * ang[i];
    return { act: act, ang: ang, logit: s, p: sigmoid(s) };
  }
  function hibrida(M, p) {
    var act = cnn(M, p.bt, p.dbt), ang = angles(act), z = QP.sim.run(ang, M.qnn_pesos);
    var s = M.salida.w[0] * z.mean + M.salida.b;
    return { act: act, ang: ang, z: z, logit: s, p: sigmoid(s) };
  }

  /* ------------------------------------------------------------ QSVM */
  /* ZZFeatureMap(4, reps, entanglement="linear") de Qiskit, vector de estado complejo:
     por repetición H en todos, P(2·x_i) y, por cada par (i, i+1), CX · P(2·(π−x_i)(π−x_j)) · CX */
  function zzState(x, reps) {
    var re = new Float64Array(16), im = new Float64Array(16), q, i, j, r;
    re[0] = 1;
    function h(q) {
      var m = 1 << q;
      for (i = 0; i < 16; i++) if (!(i & m)) {
        j = i | m;
        var ar = re[i], ai = im[i], br = re[j], bi = im[j];
        re[i] = (ar + br) * S2; im[i] = (ai + bi) * S2; re[j] = (ar - br) * S2; im[j] = (ai - bi) * S2;
      }
    }
    function ph(q, th) {
      var m = 1 << q, c = Math.cos(th), s = Math.sin(th);
      for (i = 0; i < 16; i++) if (i & m) { var a = re[i], b = im[i]; re[i] = a * c - b * s; im[i] = a * s + b * c; }
    }
    function cx(c, t) {
      var mc = 1 << c, mt = 1 << t;
      for (i = 0; i < 16; i++) if ((i & mc) && !(i & mt)) {
        j = i | mt;
        var a = re[i], b = im[i]; re[i] = re[j]; im[i] = im[j]; re[j] = a; im[j] = b;
      }
    }
    for (r = 0; r < reps; r++) {
      for (q = 0; q < 4; q++) h(q);
      for (q = 0; q < 4; q++) ph(q, 2 * x[q]);
      for (q = 0; q < 3; q++) { cx(q, q + 1); ph(q + 1, 2 * (Math.PI - x[q]) * (Math.PI - x[q + 1])); cx(q, q + 1); }
    }
    return { re: re, im: im };
  }
  function fidelity(a, b) {
    var sr = 0, si = 0;
    for (var i = 0; i < 16; i++) { sr += a.re[i] * b.re[i] + a.im[i] * b.im[i]; si += a.re[i] * b.im[i] - a.im[i] * b.re[i]; }
    return sr * sr + si * si;
  }
  function kernel(x, y, reps) { return fidelity(zzState(x, reps || 2), zzState(y, reps || 2)); }

  /* 7 features físicas -> 4 ángulos en [0, π] */
  function qsvmAngles(Q, f) {
    var nf = Q.feats.length, z = [], k, i;
    var s = f.map(function (v, i) { return (v - Q.scaler_media[i]) / Q.scaler_escala[i]; });
    for (k = 0; k < 4; k++) {
      var acc = 0;
      for (i = 0; i < nf; i++) acc += (s[i] - Q.pca_media[i]) * Q.pca_componentes[k * nf + i];
      z.push(Math.min(Math.PI, Math.max(0, acc * Q.minmax_escala[k] + Q.minmax_min[k])));
    }
    return z;
  }
  function qsvm(Q, f) {
    if (!Q._sv) {                                   /* estados de los vectores de soporte, una sola vez */
      Q._sv = [];
      for (var n = 0; n < Q.coef.length; n++) Q._sv.push(zzState(Q.vectores_soporte.slice(4 * n, 4 * n + 4), Q.reps));
    }
    var ang = qsvmAngles(Q, f), st = zzState(ang, Q.reps), d = Q.intercepto;
    for (var i = 0; i < Q._sv.length; i++) d += Q.coef[i] * fidelity(st, Q._sv[i]);
    return { ang: ang, dec: d, p: sigmoid(d), nsv: Q._sv.length };
  }

  /* ------------------------------------------------------------ verificación */
  function kernelSelfTest(tests, tol) {
    tol = tol || 1e-6;
    if (!Array.isArray(tests) || !tests.length) return { ok: null, n: 0, maxErr: null };
    var maxErr = 0, bad = 0;
    tests.forEach(function (t) {
      var e = Math.abs(kernel(t.x, t.y) - t.k_esperado);
      if (!(e <= tol)) bad++;
      if (isFinite(e)) maxErr = Math.max(maxErr, e);
    });
    return { ok: bad === 0, n: tests.length, maxErr: maxErr };
  }
  /* Recalcula todos los parches y los compara con la referencia de PyTorch / Qiskit */
  function run(D, tol) {
    tol = tol || 1e-4;
    var M = D && D.modelos;
    if (!M || !M.clasica || !M.hibrida || !Array.isArray(D.patches)) return null;
    var out = { ok: true, n: 0, maxErr: 0, fails: [], live: {} };
    D.patches.forEach(function (p) {
      try {
        var c = clasica(M.clasica, p), h = hibrida(M.hibrida, p), q = M.qsvm && Array.isArray(p.features) ? qsvm(M.qsvm, p.features) : null;
        var errs = [Math.abs(c.p - p.p_clasico), Math.abs(h.p - p.p_hibrido)];
        if (q && typeof p.p_qsvm === "number") errs.push(Math.abs(q.p - p.p_qsvm));
        var e = Math.max.apply(null, errs);
        out.maxErr = Math.max(out.maxErr, e);
        if (!(e <= tol)) { out.ok = false; out.fails.push(p.id); }
        out.live[p.id] = { c: c, h: h, q: q };
        out.n++;
      } catch (err) { out.ok = false; out.fails.push(p.id); }
    });
    out.kernel = kernelSelfTest(D.circuito && D.circuito.vectores_kernel);
    if (out.kernel.ok === false) out.ok = false;
    return out;
  }

  QP.models = { cnn: cnn, clasica: clasica, hibrida: hibrida, qsvm: qsvm, qsvmAngles: qsvmAngles,
                zzState: zzState, kernel: kernel, kernelSelfTest: kernelSelfTest, run: run };
})();
