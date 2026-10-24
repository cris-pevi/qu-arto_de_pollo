/* main.js — arranque */
(function () {
  "use strict";
  var QP = window.QP;

  function start() {
    QP.initChrome();
    QP.i18nInit();
    QP.data.init();

    /* idioma: ?lang=en, luego lo guardado, luego español */
    var q = /[?&]lang=(es|en)/.exec(location.search), l = q ? q[1] : QP.store.get("qp-lang");
    QP.lang = l === "en" ? "en" : "es";

    /* aviso de datos sintéticos: solo desaparece con is_synthetic === false */
    if (!QP.data.synthetic) document.getElementById("banner").hidden = true;

    QP.sections.applyConfig();
    QP.sections.init();
    QP.lab.init();
    /* el HTML ya está en español: solo hace falta repintar si se abre en inglés */
    if (QP.lang === "en") QP.setLang("en", true); else QP.refreshThemeBtn();

    var c = document.getElementById("ir-field");
    if (c) QP.heroField(c);
    document.documentElement.classList.add("js-ready");

    /* los datos cambian la altura de la página: vuelve a la ancla si se abrió con #sección */
    if (location.hash.length > 1) {
      var el = document.getElementById(location.hash.slice(1));
      if (el) setTimeout(function () { el.scrollIntoView(); }, 60);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
