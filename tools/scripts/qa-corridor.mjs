import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true, channel: "chrome" }),
  report = [];
try {
  const listPage = await browser.newPage();
  await listPage.goto(process.env.VELOX_URL ?? "http://127.0.0.1:5174");
  await listPage.waitForFunction(() => window.__velox);
  const ids = await listPage.evaluate(async () => {
    window.__velox.loop.stop();
    return (await import("/src/data/tracks.ts")).TRACKS.map((t) => t.id);
  });
  await listPage.close();
  for (const id of ids)
    for (const reverse of [false, true]) {
      const page = await browser.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(process.env.VELOX_URL ?? "http://127.0.0.1:5174");
      await page.waitForFunction(() => window.__velox);
      await page.evaluate(
        ({ id, reverse }) => {
          const g = window.__velox;
          g.loop.stop();
          g.renderer.setQuality("low");
          Object.assign(g.config, {
            track: id,
            reverse,
            rivals: 0,
            mode: "race",
            weather: "clear",
            eventId: undefined,
          });
          g.machine.go("prerace");
        },
        { id, reverse },
      );
      await page.waitForFunction(
        () => window.__velox.machine.current === "race",
        null,
        { timeout: 60000 },
      );
      const result = await page.evaluate(async () => {
        const { scanCorridor } =
          await import("/tools/scripts/corridor-scan.js");
        return scanCorridor(window.__velox.race.track);
      });
      report.push({ id, reverse, ...result, errors });
      console.log(
        id,
        reverse,
        result.failures.length,
        JSON.stringify(result.failures.slice(0, 2)),
      );
      await page.close();
    }
  fs.writeFileSync(
    "test-results/v05-corridor.json",
    JSON.stringify(report, null, 2),
  );
  assert.equal(
    report.reduce((n, r) => n + r.failures.length + r.errors.length, 0),
    0,
    "corridor failures; see v05-corridor.json",
  );
  console.log("All 24 track/direction corridors passed");
} finally {
  await browser.close();
}
