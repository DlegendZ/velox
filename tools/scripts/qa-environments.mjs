import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true, channel: "chrome" }),
  report = [];
try {
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [390, 844],
  ])
    for (const id of ["neon_gp", "coast_gp", "canyon_gp"]) {
      const page = await browser.newPage({ viewport: { width, height } }),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(process.env.VELOX_URL ?? "http://127.0.0.1:5176");
      await page.waitForFunction(() => window.__velox);
      await page.evaluate((id) => {
        const g = window.__velox;
        g.loop.stop();
        g.config = { ...g.config, mode: "race", track: id, rivals: 5 };
        g.renderer.setQuality("medium");
        g.machine.go("prerace");
      }, id);
      await page.waitForFunction(
        () => window.__velox.machine.current === "race",
        null,
        { timeout: 60000 },
      );
      for (const t of [0, 0.27, 0.55, 0.8]) {
        const metrics = await page.evaluate((t) => {
          const g = window.__velox,
            r = g.race,
            a = r.track.at(t),
            renderer = g.renderer;
          r.player.reset(a.point, a.yaw);
          r.countdown = 0;
          r.time = 30;
          r.popupTime = 0;
          g.camera.reset();
          g.render(1 / 60, 1);
          g.updateHUD();
          g.drawStandings();
          for (let i = 0; i < 3; i++) renderer.render(1 / 60);
          return {
            calls: renderer.renderer.info.render.calls,
            triangles: renderer.renderer.info.render.triangles,
          };
        }, t);
        await page.waitForTimeout(150);
        await page.screenshot({
          path: `test-results/task-11-${id}-${t}-${width}x${height}.png`,
        });
        report.push({ id, t, width, height, ...metrics });
      }
      if (width === 1920 && id === "canyon_gp") {
        const perf = await page.evaluate(async () => {
          const g = window.__velox,
            r = g.race;
          r.player.reset(r.track.at(0).point, r.track.at(0).yaw);
          g.camera.reset();
          g.showFPS = true;
          g.screen();
          const gl = g.renderer.renderer.getContext(),
            ext = gl.getExtension("WEBGL_debug_renderer_info"),
            gpu = ext
              ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
              : gl.getParameter(gl.RENDERER);
          let start = 0,
            previous = 0;
          const intervals = [],
            cpu = [],
            calls = [],
            tris = [];
          for (let i = 0; i < 180; i++) {
            const now = await new Promise(requestAnimationFrame);
            if (i === 30) start = now;
            if (i > 30) intervals.push(now - previous);
            previous = now;
            const c = performance.now();
            g.fixed(1 / 60);
            g.render(1 / 60, 1);
            if (i >= 30) {
              cpu.push(performance.now() - c);
              calls.push(g.renderer.renderer.info.render.calls);
              tris.push(g.renderer.renderer.info.render.triangles);
            }
          }
          intervals.sort((a, b) => a - b);
          cpu.sort((a, b) => a - b);
          return {
            gpu,
            frames: 150,
            elapsedMs: previous - start,
            fps: 149000 / (previous - start),
            medianFps: 1000 / intervals[Math.floor(intervals.length / 2)],
            cpuMedianMs: cpu[Math.floor(cpu.length / 2)],
            maxDrawCalls: Math.max(...calls),
            maxTriangles: Math.max(...tris),
            quality: g.renderer.quality,
            renderScale: g.renderer.renderScale,
            renderWidth: g.renderer.renderer.domElement.width,
            renderHeight: g.renderer.renderer.domElement.height,
          };
        });
        report.push({ performance: perf });
        console.log(JSON.stringify(perf));
        await page.evaluate((perf) => {
          window.__velox.loop.fps = perf.fps;
          window.__velox.render(1 / 60, 1);
        }, perf);
        assert.ok(perf.fps >= 60, `Medium ${perf.fps} FPS`);
        assert.ok(perf.maxDrawCalls <= 400);
        assert.ok(perf.maxTriangles <= 1800000);
        await page.screenshot({
          path: "test-results/task-11-performance-1920x1080.png",
        });
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  fs.writeFileSync(
    "test-results/task-11-environments.json",
    JSON.stringify(report, null, 2),
  );
  console.log("Environment screenshots passed");
} finally {
  await browser.close();
}
