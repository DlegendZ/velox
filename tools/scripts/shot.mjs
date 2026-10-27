// Dev helper: node tools/scripts/shot.mjs <out-name> "<async js run in page>" [waitMs] [WxH]
// Requires a running dev server (VELOX_URL, default http://127.0.0.1:5174) and installed Chrome.
import fs from "node:fs";
import { chromium } from "playwright";
const [name = "shot", code = "", wait = "1500", size = "1920x1080"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(process.env.VELOX_URL ?? "http://127.0.0.1:5174");
await page.waitForFunction(() => window.__velox?.machine, null, { timeout: 30000 });
if (code) await page.evaluate(`(async () => { const g = window.__velox; ${code} })()`);
await page.waitForTimeout(Number(wait));
fs.mkdirSync("test-results/shots", { recursive: true });
await page.screenshot({ path: `test-results/shots/${name}.png` });
const info = await page.evaluate(() => {
  const g = window.__velox;
  return { state: g.machine.current, fps: Math.round(g.loop.fps), calls: g.renderer.renderer.info.render.calls, tris: g.renderer.renderer.info.render.triangles, quality: g.renderer.quality };
});
console.log(JSON.stringify({ ...info, errors: errors.slice(0, 5) }));
await browser.close();
