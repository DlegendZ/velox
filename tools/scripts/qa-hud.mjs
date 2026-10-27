import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const reports = [];
try {
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(process.env.VELOX_URL ?? "http://127.0.0.1:5176");
    await page.waitForFunction(() => window.__velox);
    await page.evaluate(() => {
      const g = window.__velox;
      g.loop.stop();
      g.renderer.setQuality("low");
      g.config = { ...g.config, track: "neon_gp", mode: "race" };
      g.machine.go("prerace");
    });
    await page.waitForFunction(() => window.__velox.machine.current === "race");
    for (const state of ["ready", "active", "locked"]) {
      await page.evaluate((state) => {
        const g = window.__velox,
          r = g.race,
          p = r.player;
        r.countdown = 0;
        r.time = 12;
        p.speed = 154;
        p.rpm = 7200;
        p.gear = 4;
        p.nitro = state === "locked" ? 8 : 60;
        p.nitroLocked = state === "locked";
        p.boosting = state === "active";
        g.render(1 / 60, 1);
        g.updateHUD();
        g.drawStandings();
      }, state);
      await page.waitForTimeout(120);
      assert.equal(
        await page.locator(".speedometer").getAttribute("data-nitro-state"),
        state,
      );
      const fonts = await page.evaluate(() =>
        [...document.querySelectorAll(".race-hud *")]
          .filter(
            (e) =>
              e.getClientRects().length &&
              parseFloat(getComputedStyle(e).fontSize) < 12,
          )
          .map((e) => e.outerHTML.slice(0, 100)),
      );
      assert.deepEqual(fonts, []);
      await page.screenshot({
        path: `test-results/task-9-${state}-${width}x${height}.png`,
      });
    }
    if (width === 390) {
      // Arrow buttons are the default; the drag pad is the option.
      assert.equal(await page.locator("[data-touch=right]").isVisible(), true);
      await page.evaluate(() => {
        const g = window.__velox;
        g.save.data.settings.touchDrag = true;
        g.screen();
        g.updateHUD();
      });
      const pad = await page.locator("[data-drag-pad]").boundingBox(),
        x = pad.x + pad.width / 2,
        y = pad.y + pad.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 70, y);
      const steer = await page.evaluate(
        () => window.__velox.input.read(1 / 60).steer,
      );
      assert.ok(steer > 0.8, `drag right ${steer}`);
      await page.mouse.up();
      assert.equal(
        await page.evaluate(() => window.__velox.input.read(1).steer),
        0,
      );
      await page.evaluate(() => {
        const g = window.__velox;
        g.save.data.settings.touchDrag = false;
        g.screen();
        g.updateHUD();
      });
      assert.equal(await page.locator("[data-touch=right]").isVisible(), true);
      await page.screenshot({
        path: "test-results/task-9-arrow-option-390x844.png",
      });
    }
    reports.push({ width, height, errors });
    assert.deepEqual(errors, []);
    await page.close();
  }
  fs.writeFileSync(
    "test-results/task-9-hud.json",
    JSON.stringify(reports, null, 2),
  );
  console.log(
    "HUD QA passed: 10 screenshots, analog drag/release and arrow option",
  );
} finally {
  await browser.close();
}
