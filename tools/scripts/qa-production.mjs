import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const b = await chromium.launch({ headless: true, channel: "chrome" }),
  reports = [];
try {
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [390, 844],
  ]) {
    const p = await b.newPage({ viewport: { width, height } }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.goto(process.env.VELOX_PRODUCTION_URL ?? "http://127.0.0.1:4176");
    await p.waitForSelector(".title-screen");
    assert.equal(
      await p.evaluate(() => window.__velox),
      undefined,
      "production diagnostic handle absent",
    );
    await p.locator("[data-action=enter]").click();
    await p.waitForSelector(".home-menu");
    await p.screenshot({
      path: `test-results/task-12-production-home-${width}x${height}.png`,
    });
    await p.locator("[data-action=modes]").click();
    await p.waitForSelector(".race-setup");
    await p.locator('[data-control=laps][data-value="1"]').click();
    await p.screenshot({
      path: `test-results/task-12-production-setup-${width}x${height}.png`,
    });
    await p.locator("[data-action=start]").click();
    await p.waitForSelector(".race-hud");
    await p.waitForTimeout(3600);
    await p.keyboard.down("KeyW");
    await p.waitForTimeout(1400);
    await p.keyboard.up("KeyW");
    const speed = Number(await p.locator("#hud-speed").textContent());
    assert.ok(speed > 10, `keyboard accelerates in production: ${speed}`);
    await p.screenshot({
      path: `test-results/task-12-production-race-${width}x${height}.png`,
    });
    await p.keyboard.press("Escape");
    await p.waitForSelector(".pause-panel");
    await p.screenshot({
      path: `test-results/task-12-production-pause-${width}x${height}.png`,
    });
    if (width === 1920) {
      await p.locator("[data-action=photo]").click();
      const promise = p.waitForEvent("download");
      await p.locator("[data-action=capture]").click();
      const download = await promise;
      await download.saveAs("test-results/task-12-production-photo.png");
      const buffer = fs.readFileSync(
        "test-results/task-12-production-photo.png",
      );
      assert.equal(buffer.subarray(1, 4).toString(), "PNG");
      assert.ok(buffer.length > 10000);
    }
    reports.push({ width, height, speed, errors });
    assert.deepEqual(errors, []);
    await p.close();
  }
  fs.writeFileSync(
    "test-results/task-12-production.json",
    JSON.stringify(reports, null, 2),
  );
  console.log(
    "Production driving, pause, photo export and all three viewports passed",
  );
} finally {
  await b.close();
}
