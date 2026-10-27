import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const task =
  process.argv.find((a) => a.startsWith("--task="))?.split("=")[1] ?? "1";
const track =
  process.argv.find((a) => a.startsWith("--track="))?.split("=")[1] ?? "neon_a";
const overview = process.argv.includes("--overview");
const url = process.env.VELOX_QA_URL ?? "http://127.0.0.1:5176";
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
    await page.goto(url);
    await page.waitForFunction(() => !!window.__velox);
    await page.evaluate((track) => {
      const g = window.__velox;
      g.config = { ...g.config, mode: "time", track, laps: 1 };
      g.machine.go("prerace");
    }, track);
    await page.waitForFunction(
      () => !!window.__velox.race && window.__velox.machine.current === "race",
    );
    const report = await page.evaluate((task) => {
      const g = window.__velox;
      g.loop.stop();
      const r = g.race;
      const p = r.player;
      const controls = {
        throttle: 0,
        brake: 0,
        steer: 0,
        handbrake: false,
        nitro: false,
        rear: false,
      };
      for (let i = 0; i < 181; i++) r.fixed(1 / 60, controls);
      p.reset(r.track.at(0).point, 0);
      g.input.keys.add(g.save.data.settings.bindings.throttle);
      for (let i = 0; i < 180; i++) g.fixed(1 / 60);
      const before = p.position.clone();
      g.input.keys.add(g.save.data.settings.bindings.right);
      for (let i = 0; i < 24; i++) {
        g.fixed(1 / 60);
        g.render(1 / 60, 1);
      }
      g.input.clear();
      g.render(1 / 60, 1);
      if (task === "2") {
        p.nitro = 0.01;
        p.body.setLinvel({ x: 0, y: 0, z: 20 }, true);
        p.update(
          1 / 60,
          { ...controls, throttle: 1, nitro: true },
          g.save.data.settings,
        );
        g.render(1 / 60, 1);
        g.updateHUD();
      }
      return {
        dx: p.position.x - before.x,
        speed: p.speed,
        steering: p.steering,
        nitroLocked: p.nitroLocked,
        label: document.querySelector("#nitro-label-text")?.textContent,
      };
    }, task);
    if (task === "2") {
      assert.equal(report.nitroLocked, true);
      assert.equal(report.label, "RECHARGING");
    }
    assert.ok(report.dx < 0, "D moves toward screen-right (-X)");
    assert.deepEqual(errors, []);
    if (overview)
      await page.evaluate(() => {
        const g = window.__velox,
          r = g.race,
          p = r.track.at(0.005);
        g.renderer.camera.up.set(0, 1, 0);
        g.renderer.camera.position
          .copy(p.point)
          .addScaledVector(p.normal, 40)
          .addScaledVector(p.tangent, -26);
        g.renderer.camera.position.y = p.point.y + 130;
        g.renderer.camera.lookAt(p.point);
        g.renderer.render(1 / 60);
      });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `test-results/task-${task}-${track === "neon_a" ? "" : track + "-"}${width}x${height}.png`,
    });
    reports.push({ width, height, ...report, errors });
    await page.close();
  }
  await writeFile(
    `test-results/task-${task}.json`,
    JSON.stringify(reports, null, 2),
  );
  console.log(JSON.stringify(reports));
} finally {
  await browser.close();
}
