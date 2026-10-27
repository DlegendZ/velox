import { chromium } from "playwright";
const b = await chromium.launch({ headless: true, channel: "chrome" }),
  p = await b.newPage();
try {
  await p.goto("http://127.0.0.1:5174");
  await p.waitForSelector(".home-copy");
  await p.evaluate(() => {
    const g = window.__velox;
    g.config.mode = "time";
    g.config.laps = 1;
    g.machine.go("prerace");
  });
  await p.waitForSelector(".race-hud");
  console.log(
    await p.evaluate(async () => {
      const g = window.__velox;
      g.loop.stop();
      const r = g.race;
      const { AIDriver } = await import("/src/game/AIDriver.ts"),
        driver = new AIDriver(
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
        ),
        out = [];
      for (let i = 0; i < 12000 && !r.finished; i++) {
        const input = driver.drive(1 / 60, r.track, 0, false);
        r.fixed(1 / 60, input);
        if (i % 600 === 0) {
          const n = r.track.nearest(r.player.position);
          out.push({
            time: r.time,
            t: n.t,
            distance: n.distance,
            speed: r.player.speed,
            steer: input.steer,
            passed: r.checkpoints[0].passed,
            yaw: Math.atan2(
              2 * (r.player.quaternion.w * r.player.quaternion.y),
              1 - 2 * r.player.quaternion.y ** 2,
            ),
            p: r.player.position.toArray(),
          });
        }
      }
      return { finished: r.finished, out };
    }),
  );
} finally {
  await b.close();
}
