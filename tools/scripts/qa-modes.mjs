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
      { AIDriver } = await import("/src/game/AIDriver.ts");
    const config = {
      mode: "race",
      track: "neon_a",
      laps: 3,
      difficulty: "normal",
      reverse: false,
      weather: "rain",
    };
    const neutral = {
      throttle: 0,
      brake: 0,
      steer: 0,
      handbrake: false,
      nitro: false,
      rear: false,
    };
    const race = new RaceManager(config, g.save),
      start = race.player.position.clone();
    for (let i = 0; i < 179; i++) race.fixed(1 / 60, neutral);
    const countdownStable =
      race.player.position.distanceTo(start) < 1 &&
      Math.abs(race.player.speed) < 1;
    const driver = new AIDriver(
      race.player,
      {
        name: "QA",
        car: "kestrel",
        skill: 1.05,
        aggression: 0.8,
        lane: 0,
        color: "#fff",
      },
      "normal",
    );
    for (let i = 0; i < 18000 && !race.finished; i++)
      race.fixed(1 / 60, driver.drive(1 / 60, race.track, 0, false));
    const threeLap = {
      finished: race.finished,
      laps: race.checkpoints[0].times.length,
      ai: race.checkpoints.slice(1).map((c) => c.passed),
      best: race.bestLap,
      ghostFrames: g.save.data.records.neon_a?.ghost?.length,
    };
    race.dispose();
    const ghostRace = new RaceManager({ ...config, mode: "time" }, g.save);
    const hasGhost = !!ghostRace.ghost;
    ghostRace.dispose();
    const drift = new RaceManager({ ...config, mode: "drift" }, g.save);
    let driftResult;
    drift.onFinish = (r) => (driftResult = r);
    const drifter = new AIDriver(
      drift.player,
      {
        name: "QA",
        car: "kestrel",
        skill: 0.9,
        aggression: 0.6,
        lane: 0,
        color: "#fff",
      },
      "normal",
    );
    for (let i = 0; i < 5700 && !drift.finished; i++) {
      const controls = drifter.drive(1 / 60, drift.track, 0, false);
      if (i % 240 > 180) {
        controls.handbrake = true;
        controls.steer = 0.6;
      }
      drift.fixed(1 / 60, controls);
    }
    const driftScore = drift.score;
    drift.dispose();
    const rush = new RaceManager({ ...config, mode: "rush" }, g.save);
    let rushResult;
    rush.onFinish = (r) => (rushResult = r);
    for (let i = 0; i < 2000 && !rush.finished; i++)
      rush.fixed(1 / 60, neutral);
    rush.dispose();
    const roam = new RaceManager({ ...config, mode: "roam" }, g.save);
    const credits = g.save.data.profile.credits;
    roam.player.reset(roam.track.tokens[0].position, 0);
    for (let i = 0; i < 190; i++) roam.fixed(1 / 60, neutral);
    const tokenReward = g.save.data.profile.credits - credits;
    const openWorld = roam.track.open && roam.track.speedTraps.length === 3;
    roam.dispose();
    return {
      countdownStable,
      threeLap,
      hasGhost,
      driftScore,
      driftCompleted: !!driftResult?.completed,
      rushExpired: rushResult?.completed === false,
      tokenReward,
      openWorld,
    };
  });
  console.log(JSON.stringify(results, null, 2));
  await writeFile("test-results/modes.json", JSON.stringify(results, null, 2));
  assert.ok(results.countdownStable);
  assert.ok(results.threeLap.finished && results.threeLap.laps === 3);
  assert.ok(results.hasGhost && results.threeLap.ghostFrames > 0);
  assert.ok(results.driftCompleted && results.driftScore > 0);
  assert.ok(results.rushExpired);
  assert.equal(results.tokenReward, 250);
  assert.ok(results.openWorld);
} finally {
  await browser.close();
}
