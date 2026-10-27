import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ headless: true, channel: "chrome" }),
  page = await browser.newPage();
try {
  await page.goto("http://127.0.0.1:5174");
  await page.waitForSelector(".home-copy");
  const results = await page.evaluate(async () => {
    const g = window.__velox;
    g.loop.stop();
    const { RaceManager } = await import("/src/game/RaceManager.ts"),
      { AIDriver } = await import("/src/game/AIDriver.ts"),
      { TRACKS } = await import("/src/data/tracks.ts"),
      { CARS } = await import("/src/data/cars.ts"),
      { newOwned } = await import("/src/core/Save.ts");
    const out = [];
    const cases = [
      ...TRACKS.flatMap((t) =>
        [false, true].map((reverse) => ({
          track: t.id,
          car: "kestrel",
          reverse,
        })),
      ),
      ...CARS.slice(1).flatMap((c) =>
        ["neon_a", "coast_a", "canyon_a"].map((track) => ({
          track,
          car: c.id,
          reverse: false,
        })),
      ),
    ];
    for (const test of cases) {
      g.save.data.garage.activeCar = test.car;
      g.save.data.garage.owned[test.car] = newOwned(test.car);
      const r = new RaceManager(
          {
            mode: "time",
            track: test.track,
            laps: 1,
            difficulty: "easy",
            reverse: test.reverse,
            weather: "clear",
          },
          g.save,
        ),
        driver = new AIDriver(
          r.player,
          {
            name: "QA",
            car: test.car,
            skill: 0.9,
            aggression: 0.6,
            lane: 0,
            color: "#ffffff",
          },
          "easy",
        );
      let steps = 0;
      for (; steps < 9000 && !r.finished; steps++)
        r.fixed(1 / 60, driver.drive(1 / 60, r.track, 0, false));
      out.push({
        ...test,
        finished: r.finished,
        time: Number(r.time.toFixed(2)),
        checkpoints: r.checkpoints[0].passed,
      });
      r.dispose();
    }
    return out;
  });
  console.log(
    JSON.stringify(
      {
        passed: results.filter((r) => r.finished).length,
        total: results.length,
        failed: results.filter((r) => !r.finished),
      },
      null,
      2,
    ),
  );
  await writeFile("test-results/matrix.json", JSON.stringify(results, null, 2));
  assert.ok(
    results.every((r) => r.finished),
    "all cars and layouts complete a lap with the same physics",
  );
} finally {
  await browser.close();
}
