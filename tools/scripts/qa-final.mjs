import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true, channel: "chrome" }),
  report = [];
const url = process.env.VELOX_URL ?? "http://127.0.0.1:5176";
try {
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(url);
    await page.waitForFunction(() => window.__velox);
    await page.evaluate(() => {
      const g = window.__velox;
      g.loop.stop();
      g.renderer.setQuality("medium");
    });
    for (const id of ["neon_gp", "coast_gp", "canyon_gp"]) {
      await page.evaluate((id) => {
        const g = window.__velox;
        g.config = { ...g.config, track: id, mode: "roam" };
        g.machine.go("prerace");
      }, id);
      await page.waitForFunction(
        () => window.__velox.machine.current === "race",
      );
      const roam = await page.evaluate(() => {
        const g = window.__velox,
          r = g.race;
        r.countdown = 0;
        r.time = 2;
        const neutral = {
          throttle: 0,
          brake: 0,
          steer: 0,
          nitro: false,
          handbrake: false,
          rear: false,
        };
        const token = r.track.tokens[0];
        r.player.reset(token.position, r.track.at(0.5 / 30).yaw);
        r.fixed(1 / 60, neutral);
        const trapsBefore = r.stats.traps,
          trap = r.track.speedTraps[0],
          at = r.track.at(r.track.nearest(trap).t);
        r.player.reset(trap, at.yaw);
        r.player.body.setLinvel(
          { x: at.tangent.x * 30, y: 0, z: at.tangent.z * 30 },
          true,
        );
        r.fixed(1 / 60, { ...neutral, throttle: 0.5 });
        const traffic = r.traffic.actors[0],
          near = r.track.at(traffic.t),
          position = traffic.position.clone().addScaledVector(near.normal, 2.7);
        position.y = near.point.y;
        r.player.reset(position, near.yaw);
        r.player.body.setLinvel(
          { x: near.tangent.x * 30, y: 0, z: near.tangent.z * 30 },
          true,
        );
        r.nearCooldown = 0;
        const nearBefore = r.nearMisses;
        r.fixed(1 / 60, { ...neutral, throttle: 0.5 });
        r.player.reset(
          r.track.at((traffic.t - 0.01 + 1) % 1).point,
          r.track.at(traffic.t).yaw,
        );
        r.render(1);
        g.camera.reset();
        g.render(1 / 60, 1);
        g.updateHUD();
        return {
          actors: r.traffic.actors.length,
          tokens: r.tokens,
          traps: r.stats.traps - trapsBefore,
          nearMiss: r.nearMisses - nearBefore,
          exits: r.track.exits.length,
        };
      });
      assert.equal(roam.actors, 12);
      assert.equal(roam.tokens, 1);
      assert.equal(roam.traps, 1);
      assert.equal(roam.nearMiss, 1);
      assert.equal(roam.exits, 6);
      await page.screenshot({
        path: `test-results/task-12-roam-${id}-${width}x${height}.png`,
      });
      report.push({ width, height, id, ...roam });
    }
    for (const type of ["bridge", "tunnel"]) {
      await page.evaluate((type) => {
        const g = window.__velox,
          r = g.race,
          s = r.track.spec.sections.find((s) => s.type === type),
          at = r.track.at((s.from + s.to) / 2),
          q = r.player.quaternion
            .clone()
            .setFromAxisAngle({ x: 0, y: 1, z: 0 }, at.yaw),
          f = [0, at.point.x, at.point.y + 0.66, at.point.z, ...q.toArray()];
        r.replay = [[f], [f], [f]];
        g.machine.go("replay");
        g.render(1 / 60, 1);
      }, type);
      await page.screenshot({
        path: `test-results/task-12-replay-${type}-${width}x${height}.png`,
      });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__velox);
  await page.evaluate(() => {
    const g = window.__velox;
    g.loop.stop();
    g.renderer.setQuality("low");
    g.config = { ...g.config, mode: "time", track: "neon_gp", laps: 1 };
    g.machine.go("prerace");
  });
  await page.waitForFunction(() => window.__velox.machine.current === "race");
  const finish = await page.evaluate(async () => {
    const g = window.__velox,
      r = g.race,
      { AIDriver } = await import("/src/game/AIDriver.ts");
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
      "normal",
    );
    const before = g.save.data.profile.credits;
    for (let i = 0; i < 14400 && !r.finished; i++)
      r.fixed(
        1 / 60,
        driver.drive(
          1 / 60,
          r.track,
          r.near[0],
          r.near[0].t,
          false,
          r.vehicles,
        ),
      );
    return {
      finished: r.finished,
      state: g.machine.current,
      time: r.time,
      credits: g.save.data.profile.credits - before,
      record: g.save.data.records[r.recordKey],
      replayFrames: r.replay.length,
    };
  });
  assert.ok(finish.finished && finish.state === "results");
  assert.ok(
    finish.credits > 0 &&
      finish.record.bestLap > 0 &&
      finish.record.ghost.length > 0 &&
      finish.replayFrames > 0,
  );
  report.push({
    finish: {
      ...finish,
      record: {
        bestLap: finish.record.bestLap,
        ghostFrames: finish.record.ghost.length,
      },
    },
  });
  await page.evaluate(() => window.__velox.render(1 / 60, 1));
  await page.waitForFunction(() =>
    [".result-columns", ".result-actions", ".result-stars"].every(
      (selector) => {
        const el = document.querySelector(selector);
        return !el || Number(getComputedStyle(el).opacity) > 0.99;
      },
    ),
  );
  await page.screenshot({ path: "test-results/task-12-real-results.png" });
  await page.evaluate(() => {
    const g = window.__velox;
    g.machine.go("settings");
    g.click("reset-progress", document.body);
    g.click("cancel-reset", document.body);
  });
  assert.equal(await page.locator(".confirm-backdrop").count(), 0);
  await page.close();
  fs.writeFileSync(
    "test-results/task-12-final.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Roam rewards, traffic near miss, section replay, real race rewards/ghost/save and reset cancellation passed",
  );
} finally {
  await browser.close();
}
