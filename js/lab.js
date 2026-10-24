/* lab.js — Laboratorio: explorador de parches + circuito vivo */
(function () {
  "use strict";
  var QP = (window.QP = window.QP || {});
  var $ = QP.$, $$ = QP.$$, t = function (k, v) { return QP.t(k, v); };
  var DD, PI2 = Math.PI / 2;
  var selId = null, wmode = "train", ang = [0, 0, 0, 0], linked = null, running = false, simOK = true;
  var testResult = null;

  /* ============================== A. Explorador ============================== */
  function catRank(c) { return c === "pos" ? 0 : c === "neg" ? 1 : 2; }
  function catIcon(c) {
    if (c === "pos") return '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="6.5" fill="var(--heat)"/></svg>';
    if (c === "neg") return '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="5.8" fill="none" stroke="var(--text)" stroke-width="2.4"/></svg>';
    return '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 1.8L16.2 9 9 16.2 1.8 9z" fill="var(--q)" stroke="var(--bg)" stroke-width="1.4"/></svg>';
  }
  function buildPicker() {
    var list = $("#patch-list"), ps = DD.patches.slice().sort(function (a, b) { return catRank(DD.cat(a)) - catRank(DD.cat(b)); });
    list.innerHTML = "";
    ps.forEach(function (p) {
      var c = DD.cat(p), lab = document.createElement("label");
      lab.className = "po";
      lab.innerHTML = '<input type="radio" name="patch" value="' + QP.esc(p.id) + '"' + (p.id === selId ? " checked" : "") + '><span class="po-b">' + catIcon(c) + '<span><span class="po-id">' + QP.esc(p.id) + '</span><span class="po-k">' + t("cat." + c) + "</span></span></span>";
      list.appendChild(lab);
    });
  }
  function paintBar(idPrefix, dom, toLabel) {
    $("#cb-" + idPrefix + "-g").style.background = QP.infernoGradient();
    $("#cb-" + idPrefix + "-l").textContent = toLabel(dom[0]);
    $("#cb-" + idPrefix + "-r").textContent = toLabel(dom[1]);
  }
  function setReadouts(p) {
    var cold = DD.coldest(p.bt), cdMax = -Infinity, cr = 0, cc = 0;
    p.dbt.forEach(function (row, r) { row.forEach(function (v, c) { if (QP.num(v) && DD.cool(v) > cdMax) { cdMax = DD.cool(v); cr = r; cc = c; } }); });
    var chMin = DD.change(isFinite(cdMax) ? (DD.dbtCambio ? -cdMax : cdMax) : NaN);
    $("#ro-bt").textContent = t("lab.roBt", { v: QP.fmt(cold.v, 1), r: cold.r + 1, c: cold.c + 1 });
    $("#ro-dbt").textContent = t("lab.roDbt", { v: QP.fmtSigned(isFinite(cdMax) ? DD.change(DD.dbtCambio ? -cdMax : cdMax) : NaN, 1), r: cr + 1, c: cc + 1 });
    $("#cv-bt").setAttribute("aria-label", t("lab.ariaBt", { id: p.id, min: QP.fmt(cold.v, 1), r: cold.r + 1, c: cold.c + 1 }));
    $("#cv-dbt").setAttribute("aria-label", t("lab.ariaDbt", { id: p.id, v: QP.fmtSigned(isFinite(cdMax) ? DD.change(DD.dbtCambio ? -cdMax : cdMax) : NaN, 1), r: cr + 1, c: cc + 1 }));
  }
  function verdict(p, which) {
    var pr = DD.pred(p, which); if (pr === null) return "";
    var ok = pr === !!p.etiqueta;
    return '<span class="vd ' + (ok ? "okk" : "bad") + '"><svg class="ico" aria-hidden="true"><use href="#i-' + (ok ? "check" : "cross") + '"/></svg>' +
      t(pr ? "lab.predYes" : "lab.predNo") + " · " + t(ok ? "lab.right" : "lab.wrong") + "</span>";
  }
  function riskBox(p, which, pct) {
    var prob = which === "c" ? p.p_clasico : p.p_hibrido, m = which === "c" ? DD.mc : DD.mh;
    var w = QP.num(prob) ? Math.max(0, Math.min(1, prob)) * 100 : 0, u = QP.num(m.umbral) ? Math.max(0, Math.min(1, m.umbral)) * 100 : null;
    return '<div class="risk-h"><span>' + t(which === "c" ? "lab.riskC" : "lab.riskH") + '</span><span class="mono">' + QP.fmt(prob, 2) + "</span></div>" +
      '<div class="meter" role="img" aria-label="' + QP.esc(t("lab.meterAria", { v: QP.fmt(prob, 2), u: QP.fmt(m.umbral, 2) })) + '"><i style="width:' + (pct === 0 ? 0 : w) + '%"></i>' + (u !== null ? '<b style="left:' + u + '%"></b>' : "") + "</div>" +
      '<div class="risk-v"><span class="mono">' + t("lab.thr") + " " + QP.fmt(m.umbral, 2) + "</span>" + verdict(p, which) + "</div>";
  }
  function renderOutputs(p, zero) {
    var rc = $("#risk-c"), rh = $("#risk-h");
    rc.innerHTML = riskBox(p, "c", zero ? 0 : 1); rh.innerHTML = riskBox(p, "h", zero ? 0 : 1); rh.classList.add("hyb");
    $("#truth").innerHTML = t("lab.truth", { y: QP.num(p.etiqueta) ? p.etiqueta : "—", r: QP.fmt(p.lluvia_mmh, 1) });
  }
  function resetStages() {
    $$("#stages li").forEach(function (li) { li.classList.remove("on", "done"); li.querySelector(".st-v").textContent = "—"; });
  }
  function patchAngles(p) {
    return (p.activaciones_cnn || []).slice(0, 4).map(function (a) { return QP.num(a) ? Math.tanh(a) * PI2 : NaN; });
  }
  function selectPatch(id, silent) {
    var p = DD.byId(id); if (!p) return; selId = id;
    QP.drawGrid($("#cv-bt"), p.bt, DD.btT); QP.drawGrid($("#cv-dbt"), p.dbt, DD.clT);
    setReadouts(p); renderOutputs(p); resetStages();
    $("#use-patch").textContent = t("lab.usePatchId", { id: p.id });
    updateLink();
  }
  async function runModel() {
    if (running) return; var p = DD.byId(selId); if (!p) return;
    running = true; var btn = $("#run"); btn.disabled = true; resetStages(); renderOutputs(p, true);
    var delay = QP.reduced.matches ? 0 : 720, a = (p.activaciones_cnn || []).slice(0, 4), an = patchAngles(p), z = null, err = false;
    try { z = QP.sim.run(an, DD.circ.pesos_entrenados); } catch (e) { err = true; }
    var steps = [
      ["patch", "2×16×16 · " + p.id],
      ["cnn", a.length === 4 ? "(" + a.map(function (v) { return QP.fmt(v, 2); }).join(", ") + ")" : "—"],
      ["ang", an.length === 4 ? "(" + an.map(function (v) { return QP.fmt(v, 2); }).join(", ") + ") rad" : "—"],
      ["qc", z ? "(" + z.z.map(function (v) { return QP.fmt(v, 2); }).join(", ") + ")" : "—"],
      ["avg", z ? QP.fmt(z.mean, 3) : "—"],
      ["risk", QP.fmt(p.p_hibrido, 2) + " · " + t("lab.vsC") + " " + QP.fmt(p.p_clasico, 2)]
    ];
    for (var i = 0; i < steps.length; i++) {
      var li = $('#stages li[data-st="' + steps[i][0] + '"]');
      li.classList.add("on"); li.querySelector(".st-v").textContent = steps[i][1];
      if (delay) await QP.sleep(delay);
      li.classList.remove("on"); li.classList.add("done");
    }
    renderOutputs(p);
    $("#run-live").textContent = t("lab.runDone", { id: p.id, h: QP.fmt(p.p_hibrido, 2), c: QP.fmt(p.p_clasico, 2), y: QP.num(p.etiqueta) ? p.etiqueta : "—" });
    btn.disabled = false; running = false;
  }

  /* ============================== B. Circuito ============================== */
  function weights() { return wmode === "train" ? DD.circ.pesos_entrenados : DD.circ.pesos_aleatorios; }
  function buildSliders() {
    var box = $("#sliders"); box.innerHTML = "";
    for (var i = 0; i < 4; i++) {
      var d = document.createElement("div"); d.className = "sl";
      d.innerHTML = '<label for="sl' + i + '"><span>x<sub>' + i + '</sub> <small style="color:var(--muted);font-weight:400">' + t("lab.qubit") + " " + i + '</small></span><span class="mono" id="sv' + i + '">0.00</span></label>' +
        '<input type="range" id="sl' + i + '" min="' + (-PI2) + '" max="' + PI2 + '" step="0.01" value="' + ang[i] + '" data-i="' + i + '">';
      box.appendChild(d);
    }
    $$("input[type=range]", box).forEach(function (r) {
      r.addEventListener("input", function () { ang[+r.dataset.i] = parseFloat(r.value); linked = null; QP.hideTip(); update(); });
    });
  }
  function syncSliders() {
    for (var i = 0; i < 4; i++) {
      var r = $("#sl" + i); if (r) r.value = ang[i];
      var v = ang[i];
      $("#sv" + i).textContent = QP.fmt(v, 2) + " rad · " + QP.fmt(Math.round(v * 180 / Math.PI), 0) + "°";
      if (r) r.setAttribute("aria-valuetext", QP.fmt(v, 2) + " rad, " + Math.round(v * 180 / Math.PI) + "°");
    }
  }

  /* --- dibujo del circuito --- */
  function drawCircuit(res) {
    var box = $("#circ-box"), svg = $("#circuit"), W = Math.max(280, Math.floor(box.clientWidth - 20)), steps = QP.sim.STEPS, ns = steps.length + 1;
    var horiz = W >= 640, w = weights(), bw = 52, bh = 42, s = "", i, j;
    var X0, Y0, stepW, rowW, H, headY = 0;
    if (horiz) { X0 = 46; stepW = (W - X0 - 10) / ns; Y0 = 44; rowW = 62; H = Y0 + 3 * rowW + 40; }
    else { X0 = 34; rowW = (W - X0 - 8) / 4 * 1; stepW = 50; Y0 = 56; H = Y0 + ns * stepW + 8; }
    /* posición del centro de la puerta del qubit q en el paso k */
    function P(q, k) {
      return horiz ? { x: X0 + stepW * k + stepW / 2, y: Y0 + q * rowW } : { x: X0 + rowW * q + rowW / 2 + 4, y: Y0 + stepW * k + stepW / 2 };
    }
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("width", W); svg.setAttribute("height", H);
    svg.setAttribute("aria-label", t("lab.circAria", { x: ang.map(function (v) { return QP.fmt(v, 2); }).join(", "), z: res ? QP.fmt(res.mean, 3) : "—" }));
    /* cables */
    for (i = 0; i < 4; i++) {
      var a = P(i, 0), b = P(i, ns - 1), la = horiz ? { x: 8, y: a.y } : { x: a.x, y: 36 };
      if (horiz) s += '<line class="c-wire" x1="' + (X0 - 6) + '" y1="' + a.y + '" x2="' + (W - 6) + '" y2="' + a.y + '"/><text class="c-lab" x="6" y="' + (a.y + 5) + '">q' + i + "</text>";
      else s += '<line class="c-wire" x1="' + a.x + '" y1="' + 46 + '" x2="' + a.x + '" y2="' + (H - 4) + '"/><text class="c-lab" x="' + (a.x - 10) + '" y="30">q' + i + "</text>";
    }
    /* cabeceras (solo horizontal) */
    if (horiz) {
      var heads = [[0, 0, t("lab.hIn")], [1, 1, t("lab.hW")], [2, 4, "CNOT"], [5, 5, t("lab.hW")], [6, 8, "CNOT"], [9, 9, t("lab.hW")], [10, 10, t("lab.hMeas")]];
      heads.forEach(function (h) { var x = (P(0, h[0]).x + P(0, h[1]).x) / 2; s += '<text class="c-head" x="' + x + '" y="18" text-anchor="middle">' + QP.esc(h[2]) + "</text>"; });
    }
    /* puertas */
    steps.forEach(function (st, k) {
      st.ops.forEach(function (op) {
        if (op.g === "ry") {
          var p = P(op.q, k), v = op.src === "x" ? ang[op.i] : w[op.i], enc = op.src === "x", tk = enc ? "tip.gEnc" : "tip.gW";
          s += '<g class="c-gate ' + (enc ? "enc" : "w") + '" data-tip="' + tk + '" transform="translate(' + (p.x - bw / 2) + " " + (p.y - bh / 2) + ')"><rect width="' + bw + '" height="' + bh + '"/><text x="' + bw / 2 + '" y="17" text-anchor="middle">RY</text><text class="v" x="' + bw / 2 + '" y="34" text-anchor="middle">' + QP.fmt(v, 2) + "</text></g>";
        } else {
          var c = P(op.c, k), tt = P(op.t, k);
          s += '<g class="c-cx" data-tip="tip.cx"><line x1="' + c.x + '" y1="' + c.y + '" x2="' + tt.x + '" y2="' + tt.y + '"/><circle class="dot" cx="' + c.x + '" cy="' + c.y + '" r="6"/><circle class="tgt" cx="' + tt.x + '" cy="' + tt.y + '" r="12"/>' +
            '<path class="pl" d="M' + (tt.x - 12) + " " + tt.y + "H" + (tt.x + 12) + "M" + tt.x + " " + (tt.y - 12) + "V" + (tt.y + 12) + '"/>' +
            '<rect x="' + (Math.min(c.x, tt.x) - 16) + '" y="' + (Math.min(c.y, tt.y) - 16) + '" width="' + (Math.abs(c.x - tt.x) + 32) + '" height="' + (Math.abs(c.y - tt.y) + 32) + '" fill="transparent"/></g>';
        }
      });
    });
    /* medición */
    for (j = 0; j < 4; j++) {
      var m = P(j, ns - 1), mw = 46, mh = 36;
      s += '<g class="c-meas" data-tip="tip.meas" transform="translate(' + (m.x - mw / 2) + " " + (m.y - mh / 2) + ')"><rect width="' + mw + '" height="' + mh + '"/><text x="' + mw / 2 + '" y="23" text-anchor="middle">&lt;Z&gt;</text></g>';
    }
    svg.innerHTML = s;
  }

  function zBars(res) {
    var box = $("#zbars"), h = "", i;
    function row(label, v, cls) {
      var pct = QP.num(v) ? Math.min(1, Math.abs(v)) * 50 : 0, left = QP.num(v) && v < 0 ? 50 - pct : 50;
      return '<div class="zr ' + (cls || "") + '"><span class="mono">' + label + '</span><div class="ztrack" role="img" aria-label="' + QP.esc(label + " = " + QP.fmt(v, 3)) + '"><i style="left:' + left + "%;width:" + pct + '%"></i></div><span class="mono zv">' + QP.fmtSigned(v, 3) + "</span></div>";
    }
    for (i = 0; i < 4; i++) h += row("q" + i, res ? res.z[i] : NaN);
    h += row(t("lab.mean"), res ? res.mean : NaN, "mean");
    h += '<div class="zax mono" aria-hidden="true"><span>−1</span><span>0</span><span>+1</span></div>';
    box.innerHTML = h;
    $("#zmean").textContent = res ? t("lab.zmean", { v: QP.fmt(res.mean, 4) }) : "—";
  }
  function psiView(res) {
    var det = $("#psi-det"); if (!det.open || !res) return;
    var h = "";
    for (var i = 0; i < 16; i++) {
      var a = res.psi[i], b = ("0000" + i.toString(2)).slice(-4);
      h += '<div title="' + QP.esc(t("lab.psiTitle")) + '"><span>|' + b + "&gt;</span><span>" + QP.fmtSigned(a, 3) + '</span><i style="width:' + (a * a * 100).toFixed(1) + '%"></i></div>';
    }
    $("#psi").innerHTML = h;
  }
  function updateLink() {
    var el = $("#zlink");
    if (linked && DD.byId(linked)) {
      var p = DD.byId(linked);
      el.innerHTML = t("lab.linked", { id: p.id, h: QP.fmt(p.p_hibrido, 2), y: QP.num(p.etiqueta) ? p.etiqueta : "—" });
    } else el.textContent = t("lab.notLinked");
  }
  function update() {
    syncSliders();
    var res = null;
    try { res = QP.sim.run(ang, weights()); simOK = true; } catch (e) { simOK = false; res = null; $("#sim-note").hidden = false; $("#sim-note").className = "sim-note err"; $("#sim-note").textContent = t("lab.simErr", { m: e.message }); }
    try { drawCircuit(res); } catch (e2) { console.error(e2); }
    zBars(res); psiView(res); updateLink();
    if (simOK) showTestNote();
    $("#circ-live").textContent = res ? t("lab.zmean", { v: QP.fmt(res.mean, 3) }) : "";
  }
  function showTestNote() {
    var n = $("#sim-note"), r = testResult;
    n.hidden = false;
    if (!r || r.ok === null) { n.className = "sim-note"; n.textContent = t("lab.simNoTests"); }
    else if (r.ok) { n.className = "sim-note"; n.textContent = t("lab.simOk", { n: r.n, e: r.maxErr.toExponential(1) }); }
    else { n.className = "sim-note err"; n.textContent = t("lab.simBad"); }
  }

  function setW(mode) {
    wmode = mode; linked = null;
    $("#w-train").setAttribute("aria-pressed", mode === "train"); $("#w-rand").setAttribute("aria-pressed", mode === "rand");
    update();
  }

  /* ============================== init ============================== */
  function init() {
    DD = QP.data;
    var loading = $("#lab-loading"), err = $("#lab-error");
    var okA = DD.patches.length > 0 && Array.isArray(DD.circ.pesos_entrenados) && DD.circ.pesos_entrenados.length === 12 && Array.isArray(DD.circ.pesos_aleatorios) && DD.circ.pesos_aleatorios.length === 12;
    if (!DD.D) { loading.hidden = true; err.hidden = false; err.textContent = t("err.noData"); return; }
    if (!okA) { loading.hidden = true; err.hidden = false; err.textContent = t("err.labData"); return; }
    loading.hidden = true;
    $("#lab-a").hidden = false; $("#lab-b").hidden = false;

    testResult = QP.sim.selfTest(DD.circ.vectores_prueba, 1e-6);

    /* guía */
    var guide = $("#guide"), gopen = $("#guide-open");
    if (QP.store.get("qp-guide") === "closed") { guide.hidden = true; gopen.hidden = false; }
    $("#guide-close").addEventListener("click", function () { guide.hidden = true; gopen.hidden = false; QP.store.set("qp-guide", "closed"); gopen.focus(); });
    gopen.addEventListener("click", function () { guide.hidden = false; gopen.hidden = true; QP.store.set("qp-guide", "open"); $("#guide-close").focus(); });

    /* parche inicial: el primero positivo */
    var first = DD.patches.slice().sort(function (a, b) { return catRank(DD.cat(a)) - catRank(DD.cat(b)); })[0];
    selId = first.id;
    buildPicker();
    paintBar("bt", [DD.bt[1], DD.bt[0]], function (v) { return v + " K"; });
    paintBar("dbt", DD.cl, function (v) { return QP.fmtSigned(DD.dbtCambio ? -v : v, 0) + " K"; });
    /* Colorbar de dBT: izquierda = menos enfriamiento (cambio mayor), derecha = más enfriamiento */
    $("#patch-list").addEventListener("change", function (e) { if (e.target.name === "patch") selectPatch(e.target.value); });
    selectPatch(selId);
    $("#run").addEventListener("click", runModel);

    /* lectura al pasar el cursor por los mapas de calor */
    [["cv-bt", "bt"], ["cv-dbt", "dbt"]].forEach(function (c) {
      var cv = $("#" + c[0]);
      cv.addEventListener("pointermove", function (e) {
        var p = DD.byId(selId), r = cv.getBoundingClientRect(), col = Math.min(15, Math.max(0, Math.floor((e.clientX - r.left) / r.width * 16))), row = Math.min(15, Math.max(0, Math.floor((e.clientY - r.top) / r.height * 16)));
        var v = (c[1] === "bt" ? p.bt : p.dbt)[row][col];
        $("#ro-" + c[1]).textContent = c[1] === "bt" ? t("lab.cellBt", { v: QP.fmt(v, 1), r: row + 1, c: col + 1 }) : t("lab.cellDbt", { v: QP.fmtSigned(DD.change(v), 1), r: row + 1, c: col + 1 });
      });
      cv.addEventListener("pointerleave", function () { setReadouts(DD.byId(selId)); });
    });

    /* circuito */
    buildSliders();
    $("#w-rand").addEventListener("click", function () { setW("rand"); });
    $("#w-train").addEventListener("click", function () { setW("train"); });
    $("#use-patch").addEventListener("click", function () {
      var p = DD.byId(selId), a = patchAngles(p);
      if (a.length !== 4 || a.some(function (v) { return !QP.num(v); })) { $("#circ-live").textContent = t("lab.noAngles"); return; }
      ang = a.slice(); wmode = "train";
      $("#w-train").setAttribute("aria-pressed", "true"); $("#w-rand").setAttribute("aria-pressed", "false");
      linked = p.id; update();
      $("#circ-live").textContent = t("lab.loaded", { id: p.id });
    });
    $("#reset-ang").addEventListener("click", function () { ang = [0, 0, 0, 0]; linked = null; update(); });
    $("#psi-det").addEventListener("toggle", function () { update(); });
    var box = $("#circ-box"), lastW = 0;
    if (window.ResizeObserver) new ResizeObserver(function () { if (Math.abs(box.clientWidth - lastW) > 1) { lastW = box.clientWidth; update(); } }).observe(box);
    update();

    QP.onLang(function () {
      buildPicker(); buildSliders(); selectPatch(selId); update();
      paintBar("bt", [DD.bt[1], DD.bt[0]], function (v) { return v + " K"; });
    });
  }
  QP.lab = { init: init };
})();
