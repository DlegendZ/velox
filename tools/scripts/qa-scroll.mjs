import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({ headless: true, channel: "chrome" }),
  report = [];
try {
  for (const [width, height] of [
    [1366, 768],
    [1920, 960],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(process.env.VELOX_URL ?? "http://127.0.0.1:5174");
    await page.waitForFunction(() => window.__velox);
    await page.evaluate(() => {
      const g = window.__velox;
      g.loop.stop();
      g.renderer.setQuality("low");
      // 0.7: the overview fits one screen; the achievements tab still scrolls.
      g.profileTab = "achievements";
      g.machine.go("profile");
    });
    await page.waitForTimeout(700);
    assert.equal(
      await page
        .locator(".scroll-page")
        .evaluate((e) => getComputedStyle(e).scrollBehavior),
      "auto",
    );
    await page.mouse.move(width * 0.93, height * 0.45);
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(500);
    assert.ok(
      await page.locator(".scroll-page").evaluate((e) => e.scrollTop > 0),
      "wheel over blank scene scrolls page",
    );
    await page.mouse.wheel(0, 10000);
    await page.waitForTimeout(500);
    assert.ok(
      await page
        .locator(".achievement")
        .last()
        .evaluate((e) => e.getBoundingClientRect().bottom <= innerHeight - 56),
      "last item clears footer",
    );
    await page.evaluate(() => {
      const g = window.__velox;
      g.settingsTab = "controls";
      g.machine.go("settings");
    });
    await page.waitForTimeout(700);
    await page.locator("[data-action=rebind-throttle]").focus();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      // Chrome visits the browser chrome between the last and first page controls.
      if (await page.evaluate(() => document.activeElement === document.body))
        await page.keyboard.press("Tab");
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const e = document.activeElement,
          r = e.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          inBar: !!e.closest(".header,.footer"),
          target: e.outerHTML.slice(0, 400),
          scroll: [
            ...document.querySelectorAll(".scroll-page,.settings-content"),
          ].map((e) => ({
            top: e.scrollTop,
            height: e.clientHeight,
            total: e.scrollHeight,
          })),
        };
      });
      assert.ok(
        r.inBar || (r.top >= 63 && r.bottom <= height - 55),
        `native Tab focus clears bars ${width}x${height} step ${i}: ${JSON.stringify(r)}`,
      );
    }
    await page.evaluate(() => window.__velox.machine.go("tracks"));
    await page.waitForTimeout(700);
    const before = await page.evaluate(() => window.__velox.config.track);
    await page.locator(".carousel").hover();
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(500);
    assert.notEqual(
      await page.evaluate(() => window.__velox.config.track),
      before,
      "wheel browses track carousel",
    );
    if (width === 390) {
      const tab = page.locator(".mode-strip");
      await tab.hover();
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(400);
      assert.ok(
        await tab.evaluate((e) => e.scrollLeft > 0),
        "mode strip wheel scrolls",
      );
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator(".scroll-page")
        .evaluate((e) => getComputedStyle(e).scrollBehavior),
      "auto",
    );
    report.push({
      width,
      height,
      wheel: true,
      tab: true,
      trackCarousel: true,
      reducedMotion: true,
    });
    await page.close();
  }
  fs.writeFileSync(
    "test-results/v05-scroll.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Normal-motion wheel, Tab visibility, carousel and reduced-motion checks passed",
  );
} finally {
  await browser.close();
}
