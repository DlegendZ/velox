import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const b = await chromium.launch({ headless: true, channel: "chrome" });
const report = [];
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
    await p.goto(process.env.VELOX_URL ?? "http://127.0.0.1:5176");
    await p.waitForFunction(() => window.__velox);
    await p.addStyleTag({
      content:
        ".car-qa-label{position:fixed;left:24px;top:24px;background:#07090dcc;padding:14px 24px;font:700 28px var(--font-display);color:var(--text-1)}",
    });
    await p.evaluate(() => {
      const g = window.__velox;
      g.loop.stop();
      g.renderer.setQuality("medium");
      g.machine.go("garage");
      // This isolated full-viewport car study replaces the garage panels below.
      // LOD distances must use a neutral camera zoom, not the phone stage framing.
      g.renderer.garageFrame = null;
      g.renderer.camera.clearViewOffset();
      g.renderer.camera.zoom = 1;
      g.renderer.camera.updateProjectionMatrix();
    });
    const ids = await p.evaluate(async () => {
      const { CARS } = await import("/src/data/cars.ts");
      return CARS.map((c) => c.id);
    });
    for (const id of ids) {
      const info = await p.evaluate(async (id) => {
        const { carById } = await import("/src/data/cars.ts"),
          { newOwned } = await import("/src/core/Save.ts");
        const g = window.__velox,
          r = g.renderer;
        r.showCar(carById(id), newOwned(id).visual);
        r.controls.enabled = false;
        r.camera.position.set(6, 2.8, 7);
        r.camera.lookAt(0, 0.7, 0);
        r.camera.fov = 35;
        r.camera.updateProjectionMatrix();
        r.stageTween = 1;
        r.stageCar.root.rotation.y = 0;
        r.renderer.info.reset();
        r.renderer.render(r.scene, r.camera);
        document.querySelector("#app").innerHTML =
          '<div class="car-qa-label">' + carById(id).name + "</div>";
        const counts = [];
        for (const distance of [10, 80, 200]) {
          r.camera.position.set(0, 0, distance);
          r.camera.updateMatrixWorld(true);
          r.stageCar.root.updateMatrixWorld(true);
          r.stageCar.root.traverse((o) => {
            if (o.isLOD) o.update(r.camera);
          });
          counts.push(
            r.stageCar.root.getObjectByName("Body_LOD").getCurrentLevel(),
          );
        }
        r.camera.position
          .set(6, 2.8, 7)
          .multiplyScalar(innerWidth < 700 ? 1.7 : 1);
        r.camera.lookAt(0, 0.7, 0);
        for (let frame = 0; frame < 4; frame++) {
          r.render(1 / 60);
          await new Promise(requestAnimationFrame);
        }
        return {
          id,
          lods: counts,
          calls: r.renderer.info.render.calls,
          triangles: r.renderer.info.render.triangles,
        };
      }, id);
      assert.deepEqual(info.lods, [0, 1, 2]);
      await p.waitForTimeout(100);
      await p.evaluate(() => window.__velox.renderer.render(0));
      await p.screenshot({
        path: `test-results/task-10-${id}-${width}x${height}.png`,
      });
      report.push({ width, height, ...info });
    }
    for (const env of ["neon", "coast", "canyon"]) {
      await p.evaluate(async (env) => {
        const r = window.__velox.renderer;
        r.environmentId = env;
        r.grade.environment(env);
        await r.loadEnvironment(env);
        r.render(0);
      }, env);
      await p.screenshot({
        path: `test-results/task-10-hdri-${env}-${width}x${height}.png`,
      });
    }
    assert.deepEqual(errors, []);
    await p.close();
  }
  fs.writeFileSync(
    "test-results/task-10-cars.json",
    JSON.stringify(report, null, 2),
  );
  console.log("24 car views + 9 HDRI views passed, LOD 0/1/2 verified");
} finally {
  await b.close();
}
