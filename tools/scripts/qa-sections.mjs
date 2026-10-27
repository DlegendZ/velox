import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" }),
  reports = [];
try {
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5176");
    await page.waitForFunction(() => !!window.__velox);
    await page.evaluate(() => window.__velox.loop.stop());
    for (const id of ["neon_gp", "coast_gp", "canyon_gp"]) {
      await page.evaluate((id) => {
        const g = window.__velox;
        g.config = { ...g.config, mode: "time", track: id, laps: 1 };
        g.machine.go("prerace");
      }, id);
      await page.waitForFunction(
        () =>
          !!window.__velox.race && window.__velox.machine.current === "race",
      );
      const sections = await page.evaluate(
        () => window.__velox.race.track.spec.sections,
      );
      for (const [i, s] of sections.entries()) {
        const metrics = await page.evaluate(
          ({ s }) => {
            const g = window.__velox,
              r = g.race,
              track = r.track,
              t = "at" in s ? s.at : (s.from + s.to) / 2,
              p = track.at(t),
              camera = g.renderer.camera;
            r.countdown = 0;r.time=2;r.popupTime=0;
            r.player.reset(p.point, p.yaw);
            r.render(1);
            g.updateHUD();
            camera.up.set(0, 1, 0);
            if (s.type !== "bridge") {
              camera.position.copy(track.at(t - 10 / track.length).point);
              camera.position.y += s.type==="tunnel"?2.7:4.5;
              const look = track.at(t + 20 / track.length).point;
              look.y += 2.5;
              camera.lookAt(look);
            } else {
              camera.position
                .copy(p.point)
                .addScaledVector(p.normal, 16)
                .addScaledVector(p.tangent, -24);
              camera.position.y += s.type === "bridge" ? 15 : 8;
              const look = track.at(t + 10 / track.length).point;
              camera.lookAt(look);
            }
            camera.fov = 60;
            camera.updateProjectionMatrix();
            g.renderer.setTunnel(s.type === "tunnel");
            r.sky.root.visible = s.type !== "tunnel";
            g.renderer.followSun(p.point, r.player.quaternion);
            g.renderer.render(1 / 60);
            return {
              type: s.type,
              t,
              position: p.point.toArray(),
              length: track.length,
              drawCalls: g.renderer.renderer.info.render.calls,
            };
          },
          { s },
        );
        await page.waitForTimeout(150);
        await page.screenshot({
          path: `test-results/task-6-${id}-${i}-${s.type}-${width}x${height}.png`,
        });
        reports.push({ id, width, height, ...metrics });
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  await writeFile("test-results/task-6.json", JSON.stringify(reports, null, 2));
  console.log(
    JSON.stringify({
      screenshots: reports.length,
      tracks: [...new Set(reports.map((r) => r.id))],
      errors: [],
    }),
  );
} finally {
  await browser.close();
}
