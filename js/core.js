/* core.js — utilidades, tema, navegación, tooltips/glosario, copiar */
(function () {
  "use strict";
  var QP = (window.QP = window.QP || {});
  var doc = document;

  QP.$ = function (s, r) { return (r || doc).querySelector(s); };
  QP.$$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  QP.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  /* valor pendiente: vacío o entre corchetes, p. ej. "[completar]" */
  QP.isPending = function (v) {
    return v == null || (typeof v === "string" && (v.trim() === "" || /^\s*\[.*\]\s*$/.test(v)));
  };
  QP.num = function (v) { return typeof v === "number" && isFinite(v); };
  /* formato numérico: si falta el dato, "—" (nunca se rellena con números) */
  QP.fmt = function (v, d) {
    if (!QP.num(v)) return "—";
    var s = v.toFixed(d == null ? 2 : d);
    if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);          /* sin "−0.00" */
    return s.replace("-", "\u2212");
  };
  QP.fmtInt = function (v) { return QP.num(v) ? String(Math.round(v)) : "—"; };
  QP.fmtSigned = function (v, d) { return QP.num(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d == null ? 2 : d) : "—"; };
  QP.fmtDur = function (s) {
    if (!QP.num(s)) return "—";
    s = Math.round(s);
    if (s < 90) return s + " s";
    var m = Math.floor(s / 60), r = s % 60;
    if (m < 90) return m + " min" + (r ? " " + r + " s" : "");
    var h = Math.floor(m / 60);
    return h + " h " + (m % 60) + " min";
  };
  QP.store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  QP.reduced = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false, addEventListener: function () {} };
  QP.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* ---------- hooks de idioma ---------- */
  var langHooks = [];
  QP.onLang = function (fn) { langHooks.push(fn); };
  QP.fireLang = function () { langHooks.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); };

  /* ---------- tema ---------- */
  function themeNow() { return doc.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; }
  QP.refreshThemeBtn = function () {
    var b = QP.$("#btn-theme"); if (!b) return;
    var light = themeNow() === "light";
    b.setAttribute("aria-label", QP.t(light ? "ui.themeToDark" : "ui.themeToLight"));
    b.querySelector("use").setAttribute("href", light ? "#i-moon" : "#i-sun");
    var m = QP.$('meta[name="theme-color"]'); if (m) m.setAttribute("content", light ? "#F3F5FA" : "#0A1224");
  };
  function setTheme(t) {
    doc.documentElement.setAttribute("data-theme", t);
    QP.store.set("qp-theme", t);
    QP.refreshThemeBtn();
  }

  /* ---------- navegación ---------- */
  function initNav() {
    var top = QP.$("#top"), btn = QP.$("#btn-menu"), nav = QP.$("#nav");
    function sizeTop() { doc.documentElement.style.setProperty("--top-h", top.offsetHeight + "px"); }
    sizeTop();
    if (window.ResizeObserver) new ResizeObserver(sizeTop).observe(top); else window.addEventListener("resize", sizeTop);
    btn.addEventListener("click", function () {
      var open = top.classList.toggle("menu-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.querySelector("use").setAttribute("href", open ? "#i-close" : "#i-menu");
    });
    function closeMenu() {
      top.classList.remove("menu-open"); btn.setAttribute("aria-expanded", "false");
      btn.querySelector("use").setAttribute("href", "#i-menu");
    }
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) closeMenu(); });
    doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && top.classList.contains("menu-open")) { closeMenu(); btn.focus(); } });
    window.addEventListener("resize", function () { if (window.innerWidth >= 1180) closeMenu(); });

    /* sección activa */
    var links = QP.$$("a", nav), map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var ids = Object.keys(map);
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            links.forEach(function (a) { a.removeAttribute("aria-current"); });
            map[en.target.id].setAttribute("aria-current", "true");
          }
        });
      }, { rootMargin: "-40% 0px -55% 0px" });
      ids.forEach(function (id) { var s = doc.getElementById(id); if (s) io.observe(s); });
    }
  }

  /* ---------- tooltips (glosario, compuertas) ---------- */
  var tip, tipFor = null, tipT0 = 0;
  function tipContent(el) {
    var k = el.getAttribute("data-tip");
    if (k) return { html: QP.t(k), q: /^tip\.(g|c|m)/.test(k) };
    var g = QP.GLOSS && QP.GLOSS[el.getAttribute("data-term")];
    if (!g) return null;
    var L = QP.lang;
    return { html: "<b>" + QP.esc(g.n[L]) + "</b> " + g.d[L], q: !!g.q };
  }
  function showTip(el) {
    var c = tipContent(el); if (!c) return;
    tip.innerHTML = c.html;
    tip.className = "tip" + (c.q ? " q" : "");
    tip.hidden = false;
    tip.id = "tip";
    tipFor = el; tipT0 = Date.now();
    var r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    var x = r.left + r.width / 2 - tw / 2;
    x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
    var y = r.bottom + 8;
    if (y + th > window.innerHeight - 8) y = Math.max(8, r.top - th - 8);
    tip.style.left = x + "px"; tip.style.top = y + "px";
    el.setAttribute("aria-describedby", "tip");
  }
  function hideTip() {
    if (!tipFor) return;
    tipFor.removeAttribute("aria-describedby");
    tip.hidden = true; tipFor = null;
  }
  QP.hideTip = hideTip;
  function initTips() {
    tip = QP.$("#tip");
    var sel = ".term,[data-tip]";
    doc.addEventListener("mouseover", function (e) {
      var el = e.target.closest && e.target.closest(sel);
      if (el && el !== tipFor) showTip(el);
      else if (!el && tipFor && !(e.target.closest && e.target.closest("#tip"))) hideTip();
    });
    doc.addEventListener("focusin", function (e) { var el = e.target.closest && e.target.closest(sel); if (el) showTip(el); });
    doc.addEventListener("focusout", function (e) { if (e.target.closest && e.target.closest(sel)) hideTip(); });
    doc.addEventListener("click", function (e) {
      var el = e.target.closest && e.target.closest(sel);
      if (el) {
        if (tipFor === el && Date.now() - tipT0 > 500) hideTip(); else if (tipFor !== el) showTip(el);
      } else hideTip();
    });
    doc.addEventListener("keydown", function (e) { if (e.key === "Escape") hideTip(); });
    window.addEventListener("scroll", hideTip, { passive: true });
  }

  /* ---------- copiar ---------- */
  function initCopy() {
    doc.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".copy"); if (!b) return;
      var src = doc.getElementById(b.getAttribute("data-copy")); if (!src) return;
      var txt = src.textContent;
      function ok() {
        b.classList.add("done");
        var s = b.querySelector("span"); if (s) s.textContent = QP.t("ui.copied");
        var live = QP.$("#run-live"); if (live) live.textContent = QP.t("ui.copied");
        setTimeout(function () { b.classList.remove("done"); if (s) s.textContent = QP.t("ui.copy"); }, 1800);
      }
      function fallback() {
        var ta = doc.createElement("textarea"); ta.value = txt; ta.setAttribute("readonly", "");
        ta.style.position = "fixed"; ta.style.opacity = "0"; doc.body.appendChild(ta); ta.select();
        try { doc.execCommand("copy"); ok(); } catch (er) {}
        doc.body.removeChild(ta);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, fallback); else fallback();
    });
  }

  /* ---------- botones de idioma / tema ---------- */
  QP.initChrome = function () {
    initNav(); initTips(); initCopy();
    QP.$("#btn-theme").addEventListener("click", function () { setTheme(themeNow() === "light" ? "dark" : "light"); });
    QP.$("#btn-lang").addEventListener("click", function () { QP.setLang(QP.lang === "es" ? "en" : "es"); });
  };
})();
