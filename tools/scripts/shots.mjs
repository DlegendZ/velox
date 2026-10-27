// Dev helper: node tools/scripts/shots.mjs <scenario-module> [WxH]
// The module default-exports [[name, "async js using g", waitMs], ...]. Needs a dev server + Chrome.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
const [file, size = "1920x1080"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const scenarios = (await import(pathToFileURL(path.resolve(file)).href))
  .default;
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on(
  "console",
  (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)),
);
await page.goto(process.env.VELOX_URL ?? "http://127.0.0.1:5174");
await page.waitForFunction(() => window.__velox?.machine, null, {
  timeout: 30000,
});
fs.mkdirSync("test-results/shots", { recursive: true });
for (const [name, code, wait = 1200] of scenarios) {
  try {
    await page.evaluate(
      `(async () => { const g = window.__velox; const sleep = (ms) => new Promise(r => setTimeout(r, ms)); ${code} })()`,
    );
  } catch (e) {
    errors.push(`${name}: ${e.message.slice(0, 200)}`);
  }
  await page.waitForTimeout(wait);
  const output = path.join(
    process.env.SHOTS_ROOT ?? "test-results/shots",
    `${name}-${width}x${height}.png`,
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await page.screenshot({ path: output });
  const info = await page.evaluate(() => {
    const g = window.__velox;
    return {
      s: g.machine.current,
      fps: Math.round(g.loop.fps),
      calls: g.renderer.renderer.info.render.calls,
      tris: g.renderer.renderer.info.render.triangles,
    };
  });
  console.log(name, JSON.stringify(info));
}
console.log("errors", JSON.stringify(errors.slice(0, 10)));
await browser.close();
if (errors.length)
  throw new Error(`Screenshot scenarios failed: ${errors.join("; ")}`);
