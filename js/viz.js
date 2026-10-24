/* viz.js — paleta inferno (perceptualmente uniforme, apta para daltónicos),
   mapas de calor y campo infrarrojo animado de la portada. */
(function () {
  "use strict";
  var QP = (window.QP = window.QP || {});

  /* inferno: 11 anclas, interpolación lineal. Más frío (nube más alta) = más brillante. */
  var STOPS = ["#000004", "#160b39", "#420a68", "#6a176e", "#932667", "#bc3754", "#dd513a", "#f37819", "#fca50a", "#f6d746", "#fcffa4"];
  var RGB = STOPS.map(function (h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); });
  var LUT = new Array(256);
  (function () {
    for (var i = 0; i < 256; i++) {
      var t = i / 255 * 10, k = Math.min(9, Math.floor(t)), f = t - k;
      LUT[i] = [0, 1, 2].map(function (c) { return Math.round(RGB[k][c] + (RGB[k + 1][c] - RGB[k][c]) * f); });
    }
  })();
  QP.inferno = function (t) { t = Math.max(0, Math.min(1, t)); return LUT[Math.round(t * 255)]; };
  QP.infernoGradient = function () { return "linear-gradient(90deg," + STOPS.join(",") + ")"; };

  /* dibuja una matriz 16x16; fn(valor) -> t en [0,1] */
  QP.drawGrid = function (canvas, grid, fn) {
    var ctx = canvas.getContext("2d"), img = ctx.createImageData(16, 16), r, c;
    for (r = 0; r < 16; r++) for (c = 0; c < 16; c++) {
      var v = grid && grid[r] ? grid[r][c] : NaN, o = (r * 16 + c) * 4, col;
      if (!QP.num(v)) col = [40, 46, 70]; else col = QP.inferno(fn(v));
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };

  /* ---------- campo infrarrojo de la portada ---------- */
  QP.heroField = function (canvas) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var W = 128, H = 72; canvas.width = W; canvas.height = H;
    var N = 64, lat = new Float32Array(N * N), seed = 20260;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < lat.length; i++) lat[i] = rnd();
    function noise(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      var x0 = xi & 63, x1 = (xi + 1) & 63, y0 = yi & 63, y1 = (yi + 1) & 63;
      var a = lat[y0 * N + x0], b = lat[y0 * N + x1], c = lat[y1 * N + x0], d = lat[y1 * N + x1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    var img = ctx.createImageData(W, H);
    var bg = [10, 18, 36];
    function frame(t) {
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var n = 0.62 * noise(x * 0.075 + t * 0.30, y * 0.10 - t * 0.06) +
                0.38 * noise(x * 0.18 - t * 0.42 + 17, y * 0.22 + t * 0.09);
        var v = (n - 0.50) / 0.30; v = v < 0 ? 0 : v > 1 ? 1 : v; v = v * v * (3 - 2 * v);
        v *= 0.18 + 0.82 * (x / W);                         /* más intenso a la derecha: deja limpia la zona del texto */
        var col = QP.inferno(v * 0.74), a = 0.05 + 0.6 * Math.pow(v, 0.9), o = (y * W + x) * 4;
        img.data[o] = bg[0] + (col[0] - bg[0]) * a;
        img.data[o + 1] = bg[1] + (col[1] - bg[1]) * a;
        img.data[o + 2] = bg[2] + (col[2] - bg[2]) * a;
        img.data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }
    var t = 3, last = 0, raf = 0, visible = true, running = false;
    function loop(ts) {
      raf = 0;
      if (!running) return;
      if (ts - last > 90) { t += (ts - last) / 1000 * 0.6; last = ts; frame(t); }
      raf = requestAnimationFrame(loop);
    }
    function sync() {
      var should = visible && !document.hidden && !QP.reduced.matches;
      if (should && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
      else if (!should && running) { running = false; if (raf) cancelAnimationFrame(raf); }
    }
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; sync(); }).observe(canvas);
    document.addEventListener("visibilitychange", sync);
    if (QP.reduced.addEventListener) QP.reduced.addEventListener("change", sync);
    /* el cuadro fijo y la animación empiezan cuando el navegador está libre */
    function begin() { frame(t); sync(); }
    if (window.requestIdleCallback) requestIdleCallback(begin, { timeout: 1200 }); else setTimeout(begin, 200);
  };
})();
