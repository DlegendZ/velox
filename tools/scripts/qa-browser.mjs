import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [],
  warnings = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
  if(m.text().includes('GL_INVALID_OPERATION')&&errors.length===0){errors.push(m.text());void page.evaluate(()=>({state:window.__velox?.machine.current,quality:window.__velox?.renderer.quality})).then(state=>console.log('GL FAILURE AT',state));}
  if (m.type() === "warning") warnings.push(m.text());
});
const click = (a) => page.locator(`[data-action="${a}"]`).first().click();
const snapshot = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-results/${name}.png` });
};
try {
  await page.goto("http://127.0.0.1:5174");
  await page.waitForSelector(".home-copy");
  await snapshot("home");
  await click("enter");
  await click("garage");
  await click("tab-performance");
  await click("upgrade-engine");
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.velox_save_v1).garage.owned.kestrel.upgrades
          .engine,
    ),
    1,
  );
  await click("tab-visual");
  await page.locator('[data-visual="paint"]').fill("#e75d6d");
  await page.locator('[data-visual="spoiler"]').selectOption("2");
  await snapshot("garage");
  await page.reload();
  await page.waitForSelector(".home-copy");
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.velox_save_v1).garage.owned.kestrel.visual
          .paint,
    ),
    "#e75d6d",
  );
  await click("enter");
  await click("modes");
  await snapshot("modes");
  await click("mode-race");
  await page.locator("#laps").selectOption("1");
  await snapshot("tracks");
  await click("start");
  await page.waitForSelector(".race-hud");
  await page.waitForTimeout(3400);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(2200);
  await page.keyboard.up("KeyW");
  const speed = Number(await page.locator("#hud-speed").textContent());
  assert.ok(speed > 10, `keyboard accelerates (${speed})`);
  await snapshot("race");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".pause-panel");
  await click("photo");
  await snapshot("photo");
  const downloadPromise = page.waitForEvent("download");
  await click("capture");
  const photoDownload = await downloadPromise;
  await photoDownload.saveAs("test-results/photo-export.png");
  await click("photo-back");
  await click("settings");
  await page.waitForSelector(".settings-grid");
  await snapshot("settings");
  await click("back");
  await click("resume");
  // Accelerate the same deterministic physics simulation using a racing-line driver.
  const simulation = await page.evaluate(async () => {
    const g = window.__velox;
    g.loop.stop();
    const r = g.race;
    r.reset();
    const { AIDriver } = await import("/src/game/AIDriver.ts");
    const driver = new AIDriver(
      r.player,
      {
        name: "QA",
        car: "kestrel",
        skill: 0.9,
        aggression: 0.5,
        lane: 0,
        color: "#fff",
      },
      "easy",
    );
    let steps = 0;
    for (; steps < 14400 && !r.finished; steps++) {
      const controls = driver.drive(1 / 60, r.track, 0, false);
      r.fixed(1 / 60, controls);
    }
    g.loop.running = true;
    g.loop.start();
    return {
      steps,
      time: r.time,
      finished: r.finished,
      lap: r.lap,
      checkpoints: r.checkpoints.map((c) => c.passed),
      ai: r.ai.map((a) => ({ stuck: a.stuck, t: a.lastT })),
      position: r.position,
      playerPosition: r.player.position.toArray(),
    };
  });
  console.log("SIMULATION", JSON.stringify(simulation));
  assert.ok(
    simulation.finished,
    "one-lap race finishes using the same vehicle controller",
  );
  await page.waitForSelector(".results-page");
  await snapshot("results");
  const credits = await page.evaluate(
    () => JSON.parse(localStorage.velox_save_v1).profile.credits,
  );
  assert.ok(credits > 4000, "race pays credits");
  await click("replay");
  await snapshot("replay");
  await click("results");
  await click("garage");
  await click("career");
  await snapshot("career");
  await click("settings");
  await click("reset-progress");
  await page.waitForSelector('[role="dialog"]');
  await click("cancel-reset");
  assert.equal(
    await page.locator('[role="dialog"]').count(),
    0,
    "reset cancelled without losing save",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await click("menu");
  await snapshot("mobile-home");
  await click("quick");
  await snapshot("mobile-tracks");
  await click("start");
  await page.waitForSelector(".race-hud");
  await page.waitForTimeout(500);
  await snapshot("mobile-race");
  assert.equal(await page.locator(".touch-controls").isVisible(), true);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "no mobile horizontal overflow",
  );
  console.log("ERRORS", JSON.stringify(errors));
  console.log("WARNINGS",JSON.stringify([...new Set(warnings)].slice(0,4)));
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/qa.json",
    JSON.stringify(
      { passed: true, simulation, speed, credits, errors, warnings },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
