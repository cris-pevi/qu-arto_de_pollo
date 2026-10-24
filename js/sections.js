/* sections.js — datos compartidos, resumen, mapa, modelo, resultados, equipo, glosario */
(function () {
  "use strict";
  var QP = (window.QP = window.QP || {});
  var $ = QP.$, $$ = QP.$$, t = function (k, v) { return QP.t(k, v); };

  /* =====================================================================
     Datos compartidos (todo sale de window.DEMO; si falta algo -> "—")
     ===================================================================== */
  var DD = (QP.data = {});
  DD.init = function () {
    var D = window.DEMO;
    DD.D = D && typeof D === "object" ? D : null;
    DD.meta = (DD.D && DD.D.meta) || {};
    DD.patches = DD.D && Array.isArray(DD.D.patches) ? DD.D.patches.filter(function (p) { return p && p.bt && p.dbt; }) : [];
    DD.m = (DD.D && DD.D.metricas) || {};
    DD.mc = DD.m.clasico || {}; DD.mh = DD.m.hibrido || {};
    DD.baseline = DD.D ? DD.D.baseline_azar : undefined;
    DD.curves = (DD.D && DD.D.curvas) || {};
    DD.circ = (DD.D && DD.D.circuito) || {};
    DD.synthetic = !(DD.meta && DD.meta.is_synthetic === false);   /* solo "false" explícito quita el aviso */
    DD.dbtCambio = !(window.CONFIG && window.CONFIG.dbtEsCambio === false);
    /* dominios globales de color, para que el mismo color signifique lo mismo en todos los parches */
    var bmin = Infinity, bmax = -Infinity, cmin = Infinity, cmax = -Infinity;
    DD.patches.forEach(function (p) {
      p.bt.forEach(function (row) { row.forEach(function (v) { if (QP.num(v)) { if (v < bmin) bmin = v; if (v > bmax) bmax = v; } }); });
      p.dbt.forEach(function (row) { row.forEach(function (v) { if (QP.num(v)) { var c = DD.cool(v); if (c < cmin) cmin = c; if (c > cmax) cmax = c; } }); });
    });
    if (!isFinite(bmin)) { bmin = 190; bmax = 300; }
    if (!isFinite(cmin)) { cmin = 0; cmax = 1; }
    bmin = Math.floor(bmin / 5) * 5; bmax = Math.ceil(bmax / 5) * 5;
    cmin = Math.floor(cmin); cmax = Math.ceil(cmax); if (cmax <= cmin) cmax = cmin + 1;
    DD.bt = [bmin, bmax]; DD.cl = [cmin, cmax];
  };
  /* enfriamiento positivo, venga el canal como "cambio" (negativo = frío) o como "enfriamiento" */
  DD.cool = function (v) { return DD.dbtCambio ? -v : v; };
  DD.change = function (v) { return DD.dbtCambio ? v : -v; };              /* cambio en K: negativo = se enfrió */
  DD.btT = function (v) { return (DD.bt[1] - v) / (DD.bt[1] - DD.bt[0]); };       /* frío -> brillante */
  DD.clT = function (v) { return (DD.cool(v) - DD.cl[0]) / (DD.cl[1] - DD.cl[0]); };
  DD.pred = function (p, which) {
    var u = (which === "c" ? DD.mc : DD.mh).umbral, pr = which === "c" ? p.p_clasico : p.p_hibrido;
    return QP.num(u) && QP.num(pr) ? pr >= u : null;
  };
  /* categoría del parche: positivo / negativo / difícil (algún modelo falla) */
  DD.cat = function (p) {
    var a = DD.pred(p, "c"), b = DD.pred(p, "h"), y = !!p.etiqueta;
    if ((a !== null && a !== y) || (b !== null && b !== y)) return "hard";
    return y ? "pos" : "neg";
  };
  DD.local = function (hhmm) {        /* hora_utc "HH:MM" -> hora de Perú (UTC−5) */
    var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ""); if (!m) return null;
    var h = (parseInt(m[1], 10) + 24 - 5) % 24;
    return (h < 10 ? "0" : "") + h + ":" + m[2];
  };
  DD.coldest = function (grid) {
    var best = { v: Infinity, r: 0, c: 0 };
    grid.forEach(function (row, r) { row.forEach(function (v, c) { if (QP.num(v) && v < best.v) best = { v: v, r: r, c: c }; }); });
    return best;
  };
  DD.byId = function (id) { for (var i = 0; i < DD.patches.length; i++) if (DD.patches[i].id === id) return DD.patches[i]; return null; };

  /* =====================================================================
     Config -> DOM
     ===================================================================== */
  function applyConfig() {
    var C = window.CONFIG || {}, miss = [];
    $$("[data-cfg]").forEach(function (el) {
      var k = el.getAttribute("data-cfg"), v = C[k];
      if (QP.isPending(v)) { el.textContent = "—"; miss.push(k); } else el.textContent = v;
    });
    var repo = C.repoUrl;
    if (QP.isPending(repo)) {
      miss.push("repoUrl");
      $("#repo-link").hidden = true;
    } else {
      ["#cta-repo", "#repo-link"].forEach(function (s) {
        var a = $(s); a.href = repo; a.target = "_blank"; a.rel = "noopener noreferrer";
      });
    }
    /* contacto */
    var ct = $("#contact");
    if (QP.isPending(C.contact)) { ct.textContent = "—"; miss.push("contact"); }
    else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(C.contact)) { ct.innerHTML = '<a href="mailto:' + QP.esc(C.contact) + '">' + QP.esc(C.contact) + "</a>"; }
    else if (/^https?:\/\//.test(C.contact)) { ct.innerHTML = '<a href="' + QP.esc(C.contact) + '" rel="noopener noreferrer" target="_blank">' + QP.esc(C.contact) + "</a>"; }
    else ct.textContent = C.contact;
    /* agradecimientos */
    var th = (C.thanks || []).filter(function (x) { return !QP.isPending(x); });
    $("#thanks-wrap").hidden = !th.length;
    if (th.length) $("#thanks").textContent = th.join(" · ");
    /* integrantes */
    var ul = $("#members"), ms = (C.members || []).filter(function (m) { return m && !QP.isPending(m.name); });
    ul.innerHTML = "";
    if (!ms.length) { miss.push("members"); ul.innerHTML = '<li><span class="rl">—</span></li>'; }
    ms.forEach(function (m) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="nm">' + QP.esc(m.name) + '</span><span class="rl">' + (QP.isPending(m.role) ? "—" : QP.esc(m.role)) + "</span>";
      ul.appendChild(li);
    });
    /* criterios del jurado */
    var cr = (C.criteria || []).filter(function (x) { return x && !QP.isPending(x.name) && x.section && document.getElementById(x.section); });
    $("#criteria").hidden = !cr.length;
    var cl = $("#criteria-list"); cl.innerHTML = "";
    cr.forEach(function (x) {
      var li = document.createElement("li");
      li.innerHTML = '<a href="#' + QP.esc(x.section) + '">' + QP.esc(x.name) + "</a>";
      cl.appendChild(li);
    });
    /* QR */
    var qr = $("#qr"), qu = $("#qr-url");
    if (QP.isPending(repo)) qu.textContent = "—";
    else {
      qu.textContent = repo;
      var draw = function () {
        try {
          var q = window.qrcode(0, "M"); q.addData(repo); q.make();
          qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        } catch (e) { /* sin QR: queda la dirección en texto */ }
      };
      if (window.qrcode) draw();
      else { /* el generador de QR solo se descarga si hay repositorio */
        var sc = document.createElement("script");
        sc.src = "js/qrcode.js"; sc.async = true; sc.onload = draw;
        document.head.appendChild(sc);
      }
    }
    if (miss.length && window.console) console.warn("[config.js] Pendiente de completar: " + miss.join(", "));
  }

  /* =====================================================================
     Resumen "qué encontramos"
     ===================================================================== */
  function renderSummary() {
    var el = $("#sum-found");
    if (!DD.D) { el.textContent = "—"; return; }
    if (DD.synthetic) { el.innerHTML = t("sum.foundSyn"); return; }
    el.innerHTML = t("sum.foundReal", {
      c: QP.fmt(DD.mc.PR_AUC, 3), h: QP.fmt(DD.mh.PR_AUC, 3), b: QP.fmt(DD.baseline, 3)
    });
  }

  /* =====================================================================
     Mapa esquemático + vista previa de parches
     ===================================================================== */
  var mapSel = null, mapHover = null;
  var MAP = { x0: 10, y0: 10, w: 500, h: 429 };
  function px(lon) { return MAP.x0 + (lon + 81.2) / 1.4 * MAP.w; }
  function py(lat) { return MAP.y0 + (-4.6 - lat) / 1.2 * MAP.h; }
  /* costa muy simplificada (esquema, no a escala) */
  var COAST = [[-81.2, -4.6], [-81.17, -4.8], [-81.13, -4.97], [-81.08, -5.08], [-80.98, -5.2], [-80.9, -5.38], [-80.84, -5.52], [-80.82, -5.62], [-80.88, -5.72], [-81.02, -5.76], [-81.15, -5.79], [-81.2, -5.8]];
  var CITIES = [["Sullana", -4.90, -80.69], ["Piura", -5.19, -80.63], ["Paita", -5.09, -81.11], ["Sechura", -5.56, -80.82]];

  function thumb(p) {
    var cv = document.createElement("canvas"); cv.width = cv.height = 16;
    QP.drawGrid(cv, p.bt, function (v) { return DD.btT(v); });
    return cv.toDataURL();
  }
  function markerSvg(p, cx, cy) {
    var y = !!p.etiqueta, s = "";
    if (y) s = '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="#FB9B3A" stroke="#0A1224" stroke-width="2.5"/>';
    else s = '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="#0A1224" stroke="#EAF0FB" stroke-width="2.5"/>';
    return '<g class="m-mk">' + s + "</g>";
  }
  function buildMap() {
    var wrap = $("#map-wrap");
    if (!DD.patches.length) { wrap.innerHTML = '<p class="err" style="padding:16px">' + t("err.noPatches") + "</p>"; return; }
    var cw = MAP.w / 4, ch = MAP.h / 4, i, j, svg = "";
    var land = COAST.map(function (p) { return px(p[0]).toFixed(1) + "," + py(p[1]).toFixed(1); }).join(" ");
    var landPoly = land + " " + (MAP.x0 + MAP.w) + "," + (MAP.y0 + MAP.h) + " " + (MAP.x0 + MAP.w) + "," + MAP.y0;
    svg += '<svg viewBox="0 0 520 492" role="group" aria-labelledby="map-title map-desc" id="map-svg">';
    svg += '<title id="map-title">' + QP.esc(t("map.title")) + "</title><desc id=\"map-desc\">" + QP.esc(t("map.desc")) + "</desc>";
    svg += '<rect class="m-sea" x="' + MAP.x0 + '" y="' + MAP.y0 + '" width="' + MAP.w + '" height="' + MAP.h + '"/>';
    svg += '<polygon class="m-land" points="' + landPoly + '"/>';
    svg += '<polyline class="m-coast" points="' + land + '"/>';
    svg += '<text class="m-sea-t" x="22" y="290">' + QP.esc(t("map.sea1")) + '</text><text class="m-sea-t" x="22" y="312">' + QP.esc(t("map.sea2")) + "</text>";
    for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) {
      var p = null, x = MAP.x0 + j * cw, y = MAP.y0 + i * ch;
      DD.patches.forEach(function (q) { if (q.fila === i && q.col === j) p = q; });
      var lab = p ? t("map.cellHas", { id: p.id, r: i + 1, c: j + 1 }) : t("map.cellNone", { r: i + 1, c: j + 1 });
      svg += '<g class="m-cell' + (p ? " has" : "") + '" data-r="' + i + '" data-c="' + j + '"' + (p ? ' data-id="' + p.id + '"' : "") + ' tabindex="0" role="button" aria-label="' + QP.esc(lab) + '">';
      if (p) svg += '<image href="' + thumb(p) + '" x="' + x + '" y="' + y + '" width="' + cw + '" height="' + ch + '" preserveAspectRatio="none"/>';
      svg += '<rect class="cell" x="' + x + '" y="' + y + '" width="' + cw + '" height="' + ch + '"/>';
      if (p) {
        svg += markerSvg(p, x + cw - 14, y + 17) + '<text class="m-tag" text-anchor="end" x="' + (x + cw - 29) + '" y="' + (y + 23) + '">' + p.id + "</text>";
      } else svg += '<text class="none" x="' + (x + cw / 2) + '" y="' + (y + ch / 2 + 5) + '" text-anchor="middle">' + QP.esc(t("map.none")) + "</text>";
      svg += "</g>";
    }
    CITIES.forEach(function (c) {
      var x = px(c[2]), y = py(c[1]);
      svg += '<circle class="m-city" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.5"/><text class="m-city-t"' + (c[0] === "Sechura" ? ' text-anchor="end" x="' + (x - 9).toFixed(1) : ' x="' + (x + 9).toFixed(1)) + '" y="' + (y + 5).toFixed(1) + '">' + c[0] + "</text>";
    });
    svg += '<text class="m-note" x="10" y="463">' + QP.esc(t("map.note")) + '</text><text class="m-note" x="10" y="482">' + QP.esc(t("map.note2")) + "</text>";
    svg += "</svg>";
    wrap.innerHTML = svg;
    $$(".m-cell", wrap).forEach(function (g) {
      g.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") { mapHover = cellKey(g); renderPeek(); } });
      g.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") { mapHover = null; renderPeek(); } });
      g.addEventListener("focus", function () { mapHover = cellKey(g); renderPeek(); });
      g.addEventListener("blur", function () { mapHover = null; renderPeek(); });
      g.addEventListener("click", function () { mapSel = cellKey(g); mapHover = null; renderPeek(); });
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); mapSel = cellKey(g); renderPeek(); } });
    });
    $("#map-all").setAttribute("aria-pressed", wrap.classList.contains("m-all") ? "true" : "false");
  }
  function cellKey(g) { return { r: +g.getAttribute("data-r"), c: +g.getAttribute("data-c"), id: g.getAttribute("data-id") }; }
  function renderPeek() {
    var k = mapHover || mapSel, wrap = $("#map-wrap");
    $$(".m-cell", wrap).forEach(function (g) {
      g.classList.toggle("sel", !!(k && +g.getAttribute("data-r") === k.r && +g.getAttribute("data-c") === k.c));
    });
    if (!k) return;
    var p = k.id ? DD.byId(k.id) : null, title = $("#peek-title"), meta = $("#peek-meta"), cb = $("#pk-bt"), cd = $("#pk-dbt");
    if (!p) {
      title.textContent = t("peek.none", { r: k.r + 1, c: k.c + 1 });
      QP.drawGrid(cb, null, function () { return 0; }); QP.drawGrid(cd, null, function () { return 0; });
      meta.textContent = "—"; cb.setAttribute("aria-label", t("peek.none", { r: k.r + 1, c: k.c + 1 })); cd.setAttribute("aria-label", t("peek.none", { r: k.r + 1, c: k.c + 1 }));
      return;
    }
    QP.drawGrid(cb, p.bt, DD.btT); QP.drawGrid(cd, p.dbt, DD.clT);
    title.textContent = t("peek.title", { id: p.id, r: k.r + 1, c: k.c + 1 });
    var cold = DD.coldest(p.bt), lt = DD.local(p.hora_utc);
    var cdMin = Infinity; p.dbt.forEach(function (row) { row.forEach(function (v) { if (QP.num(v)) cdMin = Math.min(cdMin, DD.change(v)); }); });
    meta.innerHTML = QP.esc(t("peek.meta", {
      lat: QP.fmt(p.lat_c, 2), lon: QP.fmt(p.lon_c, 2), utc: p.hora_utc || "—", loc: lt || "—",
      lab: QP.num(p.etiqueta) ? p.etiqueta : "—", min: QP.fmt(cold.v, 1)
    }));
    cb.setAttribute("aria-label", t("peek.ariaBt", { id: p.id, min: QP.fmt(cold.v, 1), r: cold.r + 1, c: cold.c + 1 }));
    cd.setAttribute("aria-label", t("peek.ariaDbt", { id: p.id, v: QP.fmt(isFinite(cdMin) ? cdMin : NaN, 1) }));
  }
  function initMap() {
    DD.patches.length && (mapSel = mapSel || { r: DD.patches[0].fila, c: DD.patches[0].col, id: DD.patches[0].id });
    buildMap(); renderPeek();
    $("#map-all").addEventListener("click", function () {
      var w = $("#map-wrap"), on = w.classList.toggle("m-all");
      this.setAttribute("aria-pressed", on ? "true" : "false");
    });
    QP.onLang(function () { buildMap(); renderPeek(); });
  }

  /* =====================================================================
     Modelo: bloques + comparación justa
     ===================================================================== */
  function initModel() {
    var blks = $$(".blk", $("#pipe"));
    blks.forEach(function (b, i) {
      var d = document.getElementById(b.getAttribute("aria-controls"));
      if (b.classList.contains("q")) d.classList.add("dtl-q");
      b.addEventListener("click", function () {
        var open = b.getAttribute("aria-expanded") === "true";
        blks.forEach(function (o) {
          o.setAttribute("aria-expanded", "false");
          document.getElementById(o.getAttribute("aria-controls")).hidden = true;
        });
        if (!open) { b.setAttribute("aria-expanded", "true"); d.hidden = false; }
      });
    });
    function alt() {
      $("#alt-head").innerHTML = t("mod.alt", { c: QP.fmtInt(DD.mc.parametros), h: QP.fmtInt(DD.mh.parametros) });
    }
    alt(); QP.onLang(alt);
  }

  /* =====================================================================
     Resultados
     ===================================================================== */
  var chartKind = "pr", chartIdx = null;
  function swatch(cls) {
    return '<svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true" style="vertical-align:middle;margin-right:6px"><line x1="1" y1="5" x2="25" y2="5" stroke="var(--series-' + cls + ')" stroke-width="3" ' + (cls === "h" ? 'stroke-dasharray="7 3"' : "") + ' stroke-linecap="round"/></svg>';
  }
  function renderTable() {
    var rows = [
      ["F1", QP.fmt(DD.mc.F1, 3), QP.fmt(DD.mh.F1, 3), "res.f1"],
      ["PR-AUC", QP.fmt(DD.mc.PR_AUC, 3), QP.fmt(DD.mh.PR_AUC, 3), "res.pr"],
      ["", QP.fmt(DD.mc.umbral, 2), QP.fmt(DD.mh.umbral, 2), "res.thr"],
      ["", QP.fmtInt(DD.mc.parametros), QP.fmtInt(DD.mh.parametros), "res.params"],
      ["", QP.fmtDur(DD.mc.t_entreno_s), QP.fmtDur(DD.mh.t_entreno_s), "res.time"]
    ];
    $("#res-body").innerHTML = rows.map(function (r) {
      return "<tr><th scope=\"row\" style=\"font-weight:550;text-align:left;color:var(--text)\">" + t(r[3]) + "</th><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>";
    }).join("");
    var th = $$("#res-table thead th");
    th[1].innerHTML = swatch("c") + t("res.cls"); th[2].innerHTML = swatch("h") + t("res.hyb");
    $("#res-chance").textContent = t("res.chance", { b: QP.fmt(DD.baseline, 3) });
  }
  function series(kind) {
    var cv = DD.curves, ep = cv.epoca;
    var c = kind === "pr" ? cv.prauc_val_clasico : cv.loss_clasico, h = kind === "pr" ? cv.prauc_val_hibrido : cv.loss_hibrido;
    if (!Array.isArray(ep) || !Array.isArray(c) || !Array.isArray(h) || !ep.length) return null;
    return { ep: ep, c: c, h: h };
  }
  function renderChart() {
    var box = $("#chart"), S = series(chartKind), W = box.clientWidth || 600, H = box.clientHeight || 330;
    if (!S) { box.innerHTML = '<p class="loading" style="padding:16px">' + t("res.noCurve") + "</p>"; $("#chart-cap").textContent = "—"; return; }
    var m = { l: 48, r: 92, t: 18, b: 42 }, iw = W - m.l - m.r, ih = H - m.t - m.b, n = S.ep.length;
    var all = S.c.concat(S.h).filter(QP.num), base = chartKind === "pr" && QP.num(DD.baseline) ? DD.baseline : null;
    if (base !== null) all.push(base);
    var ymax = Math.max.apply(null, all), ymin = 0, step = niceStep(ymax / 4);
    ymax = Math.ceil(ymax / step - 1e-9) * step; if (chartKind === "pr" && ymax > 1) ymax = 1;
    var xmin = S.ep[0], xmax = S.ep[n - 1] === xmin ? xmin + 1 : S.ep[n - 1];
    function X(e) { return m.l + (e - xmin) / (xmax - xmin) * iw; }
    function Y(v) { return m.t + ih - (v - ymin) / (ymax - ymin) * ih; }
    function path(a) {
      var d = "", pen = false;
      a.forEach(function (v, i) { if (QP.num(v)) { d += (pen ? "L" : "M") + X(S.ep[i]).toFixed(1) + "," + Y(v).toFixed(1); pen = true; } else pen = false; });
      return d;
    }
    var s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true">', k;
    for (k = 0; k * step <= ymax + 1e-9; k++) {
      var yv = k * step, yy = Y(yv);
      s += '<line class="gridl" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yy + '" y2="' + yy + '"/><text x="' + (m.l - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + yv.toFixed(2) + "</text>";
    }
    var xt = xmax - xmin > 40 ? 10 : 5, xticks = [xmin];
    for (var e0 = Math.ceil((xmin + 1) / xt) * xt; e0 <= xmax; e0 += xt) xticks.push(e0);
    for (var ei = 0; ei < xticks.length; ei++) { var e = xticks[ei]; s += '<text x="' + X(e) + '" y="' + (H - m.b + 20) + '" text-anchor="middle">' + e + "</text>"; }
    s += '<line class="ax" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + (m.t + ih) + '" y2="' + (m.t + ih) + '"/>';
    s += '<text x="' + (m.l + iw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + QP.esc(t("res.epoch")) + "</text>";
    if (base !== null) s += '<path class="ln l-b" d="M' + m.l + "," + Y(base) + "H" + (W - m.r) + '"/>';
    s += '<path class="ln l-c" d="' + path(S.c) + '"/><path class="ln l-h" d="' + path(S.h) + '"/>';
    /* etiquetas directas (separadas si chocan) */
    var lastC = lastVal(S.c), lastH = lastVal(S.h), lab = [
      { y: Y(lastC), cls: "dir-c", txt: t("res.cls") },
      { y: Y(lastH), cls: "dir-h", txt: t("res.hyb") }
    ];
    if (base !== null) lab.push({ y: Y(base), cls: "dir-b", txt: t("res.chanceShort") });
    lab.sort(function (a, b) { return a.y - b.y; });
    for (k = 1; k < lab.length; k++) if (lab[k].y - lab[k - 1].y < 16) lab[k].y = lab[k - 1].y + 16;
    lab.forEach(function (l) { s += '<text class="' + l.cls + '" x="' + (W - m.r + 8) + '" y="' + (l.y + 4) + '">' + QP.esc(l.txt) + "</text>"; });
    s += '<g id="cx" hidden></g></svg><div class="chart-tip" id="ctip" hidden></div>';
    box.innerHTML = s;
    box._geo = { m: m, iw: iw, ih: ih, X: X, Y: Y, S: S, W: W, H: H };
    if (chartIdx !== null) drawCross(chartIdx);
    caption(S, base);
    curveTable();
  }
  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function lastVal(a) { for (var i = a.length - 1; i >= 0; i--) if (QP.num(a[i])) return a[i]; return NaN; }
  function caption(S, base) {
    var key = chartKind === "pr" ? "res.capPr" : "res.capLoss";
    $("#chart-cap").textContent = (DD.synthetic ? t("res.capSyn") + " " : "") + t(key, {
      e: S.ep[S.ep.length - 1], c: QP.fmt(lastVal(S.c), 3), h: QP.fmt(lastVal(S.h), 3), b: QP.fmt(base, 3)
    });
  }
  function drawCross(i) {
    var box = $("#chart"), g = box._geo; if (!g) return;
    var S = g.S, x = g.X(S.ep[i]), c = S.c[i], h = S.h[i], el = $("#cx");
    var html = '<line class="cross" x1="' + x + '" x2="' + x + '" y1="' + g.m.t + '" y2="' + (g.m.t + g.ih) + '"/>';
    if (QP.num(c)) html += '<circle cx="' + x + '" cy="' + g.Y(c) + '" r="5" fill="var(--series-c)" stroke="var(--surface)" stroke-width="2"/>';
    if (QP.num(h)) html += '<rect x="' + (x - 5) + '" y="' + (g.Y(h) - 5) + '" width="10" height="10" fill="var(--series-h)" stroke="var(--surface)" stroke-width="2"/>';
    el.innerHTML = html; el.removeAttribute("hidden"); el.style.display = "";
    var tp = $("#ctip");
    tp.innerHTML = t("res.tip", { e: S.ep[i], c: QP.fmt(c, 3), h: QP.fmt(h, 3) });
    tp.hidden = false;
    var left = x + 14; if (left + tp.offsetWidth > g.W - 6) left = x - tp.offsetWidth - 14;
    tp.style.left = Math.max(6, left) + "px"; tp.style.top = (g.m.t + 6) + "px";
  }
  function clearCross() {
    chartIdx = null; var el = $("#cx"), tp = $("#ctip");
    if (el) { el.innerHTML = ""; } if (tp) tp.hidden = true;
  }
  function initChart() {
    var box = $("#chart");
    function idxFrom(clientX) {
      var g = box._geo; if (!g) return null;
      var r = box.getBoundingClientRect(), x = clientX - r.left, S = g.S, best = 0, bd = Infinity;
      for (var i = 0; i < S.ep.length; i++) { var d = Math.abs(g.X(S.ep[i]) - x); if (d < bd) { bd = d; best = i; } }
      return best;
    }
    box.addEventListener("pointermove", function (e) { var i = idxFrom(e.clientX); if (i !== null) { chartIdx = i; drawCross(i); } });
    box.addEventListener("pointerleave", function () { if (document.activeElement !== box) clearCross(); });
    box.addEventListener("blur", clearCross);
    box.addEventListener("keydown", function (e) {
      var g = box._geo; if (!g) return; var n = g.S.ep.length, i = chartIdx === null ? n - 1 : chartIdx;
      if (e.key === "ArrowLeft") i = Math.max(0, i - 1);
      else if (e.key === "ArrowRight") i = Math.min(n - 1, i + 1);
      else if (e.key === "Home") i = 0; else if (e.key === "End") i = n - 1; else return;
      e.preventDefault(); chartIdx = i; drawCross(i);
      $("#chart-live").textContent = t("res.tipText", { e: g.S.ep[i], c: QP.fmt(g.S.c[i], 3), h: QP.fmt(g.S.h[i], 3) });
    });
    var live = document.createElement("p"); live.className = "sr-only"; live.id = "chart-live"; live.setAttribute("aria-live", "polite");
    box.parentNode.insertBefore(live, box.nextSibling);
    function setKind(k) {
      chartKind = k; chartIdx = null;
      $("#ch-pr").setAttribute("aria-pressed", k === "pr"); $("#ch-loss").setAttribute("aria-pressed", k === "loss");
      renderChart();
    }
    $("#ch-pr").addEventListener("click", function () { setKind("pr"); });
    $("#ch-loss").addEventListener("click", function () { setKind("loss"); });
    if (window.ResizeObserver) { var w0 = box.clientWidth; new ResizeObserver(function () { if (box.clientWidth !== w0) { w0 = box.clientWidth; renderChart(); } }).observe(box); }
    renderChart();
    QP.onLang(renderChart);
  }
  function curveTable() {
    var cv = DD.curves, ep = cv.epoca; if (!Array.isArray(ep)) { $("#curve-table").innerHTML = ""; return; }
    var h = "<thead><tr><th scope=\"col\">" + t("res.epoch") + "</th><th scope=\"col\">PR-AUC " + t("res.cls") + "</th><th scope=\"col\">PR-AUC " + t("res.hyb") + "</th><th scope=\"col\">" + t("res.curveLoss") + " " + t("res.cls") + "</th><th scope=\"col\">" + t("res.curveLoss") + " " + t("res.hyb") + "</th></tr></thead><tbody>";
    ep.forEach(function (e, i) {
      h += "<tr><td>" + e + "</td><td>" + QP.fmt((cv.prauc_val_clasico || [])[i], 3) + "</td><td>" + QP.fmt((cv.prauc_val_hibrido || [])[i], 3) + "</td><td>" + QP.fmt((cv.loss_clasico || [])[i], 3) + "</td><td>" + QP.fmt((cv.loss_hibrido || [])[i], 3) + "</td></tr>";
    });
    $("#curve-table").innerHTML = h + "</tbody>";
  }
  function renderReading() {
    var dp = QP.num(DD.mh.PR_AUC) && QP.num(DD.mc.PR_AUC) ? DD.mh.PR_AUC - DD.mc.PR_AUC : NaN;
    var df = QP.num(DD.mh.F1) && QP.num(DD.mc.F1) ? DD.mh.F1 - DD.mc.F1 : NaN;
    var can = [
      t("res.can1", { c: QP.fmtInt(DD.mc.parametros), h: QP.fmtInt(DD.mh.parametros) }),
      t("res.can2", { c: QP.fmt(DD.mc.PR_AUC, 3), h: QP.fmt(DD.mh.PR_AUC, 3), b: QP.fmt(DD.baseline, 3) }),
      t("res.can3", { dp: QP.fmtSigned(dp, 3), df: QP.fmtSigned(df, 3) })
    ];
    var cannot = [];
    if (DD.synthetic) cannot.push(t("res.cannotSyn"));
    cannot.push(t("res.cannot1"), t("res.cannot2"), t("res.cannot3"));
    $("#can-list").innerHTML = can.map(function (x) { return "<li>" + x + "</li>"; }).join("");
    $("#cannot-list").innerHTML = cannot.map(function (x) { return "<li>" + x + "</li>"; }).join("");
  }
  function initResults() {
    renderTable(); renderReading(); initChart();
    QP.onLang(function () { renderTable(); renderReading(); });
  }

  /* =====================================================================
     Glosario
     ===================================================================== */
  function renderGlossary() {
    var h = "";
    Object.keys(QP.GLOSS).forEach(function (k) {
      var g = QP.GLOSS[k];
      h += "<div><dt>" + QP.esc(g.n[QP.lang]) + "</dt><dd>" + g.d[QP.lang] + "</dd></div>";
    });
    $("#glossary").innerHTML = h;
  }

  function renderFoot() {
    var m = DD.meta;
    $("#foot-meta").textContent = t("foot.meta", {
      v: QP.isPending(m.version) ? "—" : m.version, f: QP.isPending(m.fecha) ? "—" : m.fecha,
      s: !DD.D ? "—" : t(DD.synthetic ? "foot.syn" : "foot.real")
    });
  }

  QP.sections = {
    applyConfig: applyConfig,
    init: function () {
      renderSummary(); initMap(); initModel(); initResults(); renderGlossary(); renderFoot();
      QP.onLang(function () { renderSummary(); renderGlossary(); renderFoot(); });
    }
  };
})();
