// Genera assets/og.jpg desde tools/og.html. Requiere Playwright:  node tools/make_og.js
const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto("file://" + path.resolve(__dirname, "og.html"));
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.resolve(__dirname, "../assets/og.jpg"), type: "jpeg", quality: 86 });
  await b.close();
})();
