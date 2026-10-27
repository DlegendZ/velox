import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const b = await chromium.launch({ headless: true, channel: "chrome" }),
  report = [],
  issues = [];
try {
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [390, 844],
  ]) {
    const p = await b.newPage({ viewport: { width, height } });
    p.on("pageerror", (e) => issues.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error" || m.text().includes("GL_INVALID"))
        issues.push(m.text());
    });
    await p.goto(process.env.VELOX_URL ?? "http://127.0.0.1:5176");
    await p.waitForFunction(() => window.__velox);
    await p.evaluate(() => {
      const g = window.__velox;
      g.loop.stop();
      g.renderer.setQuality("low");
      g.config.track = "canyon_gp";
      g.machine.go("prerace");
    });
    await p.waitForFunction(() => window.__velox.machine.current === "race");
    for (const q of ["low", "medium", "high", "ultra", "medium"]) {
      const info = await p.evaluate(async (q) => {
        const g = window.__velox,
          r = g.renderer;
        r.setQuality(q);
        await r.precompile();
        g.race.countdown = 0;
        g.race.time = 30;
        g.race.player.boosting = q === "high";
        g.camera.reset();
        g.render(1 / 60, 1);
        g.updateHUD();
        for (let i = 0; i < 3; i++) r.render(1 / 60);
        return {
          quality: r.quality,
          shadow: r.sun.shadow.mapSize.x,
          ao: r.ao.enabled,
          scale: r.renderScale,
          grain: r.grade.uniforms.get("grain").value,
          haze: r.grade.uniforms.get("haze").value,
        };
      }, q);
      assert.equal(
        info.shadow,
        q === "ultra" ? 4096 : q === "high" ? 2048 : 1024,
      );
      if (q === "high" || q === "ultra") {
        assert.equal(info.ao, true);
        assert.ok(info.grain > 0 && info.haze > 0);
      }
      if (q === "high")
        await p.screenshot({
          path: `test-results/task-12-high-effects-${width}x${height}.png`,
        });
      report.push({ width, height, ...info });
    }
    await p.evaluate(() => {
      const g = window.__velox;
      g.machine.go("menu");
      g.renderer.setQuality("auto");
      g.renderer.benchmarkDone = false;
      for (let i = 0; i < 50; i++) g.renderer.render(0.06);
    });
    assert.equal(
      await p.evaluate(() => window.__velox.renderer.quality),
      "low",
      "Auto fallback",
    );
    await p.close();
  }
  assert.deepEqual(issues, []);
  fs.writeFileSync(
    "test-results/task-12-quality.json",
    JSON.stringify({ report, issues }, null, 2),
  );
  console.log(
    "Quality presets, High effects, shadows, AO and Auto fallback passed",
  );
} finally {
  await b.close();
}
