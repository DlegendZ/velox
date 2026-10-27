import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const b = await chromium.launch({ headless: true, channel: "chrome" }),
  report = [];
try {
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [1280, 720],
    [390, 844],
  ]) {
    const p = await b.newPage({ viewport: { width, height } });
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.goto(process.env.VELOX_URL ?? "http://127.0.0.1:5174");
    await p.waitForFunction(() => window.__velox);
    await p.evaluate(() => {
      const g = window.__velox;
      g.loop.stop();
      g.renderer.setQuality("low");
    });
    const studio = await p.evaluate(() => {
      const r=window.__velox.renderer, leds=r.stage.children.filter(e=>e.name==='StudioLED'),floor=r.stage.getObjectByName('StudioSatinFloor');
      return {leds:leds.map(e=>({height:e.geometry.parameters.height,y:e.position.y,brightness:Math.max(e.material.color.r,e.material.color.g,e.material.color.b)})),floor:{opacity:floor.material.opacity,roughness:floor.material.roughness},ceiling:r.stage.getObjectByName('StudioCeiling').position.y,reflector:r.reflector.material.uniforms.color.value.getHex()};
    });
    assert.ok(studio.leds.length===9&&studio.leds.every(e=>e.height===2.6&&e.y===2.2&&e.brightness<=.9));
    assert.deepEqual(studio.floor,{opacity:.92,roughness:.7});assert.equal(studio.ceiling,7.6);assert.equal(studio.reflector,0x101317);
    for (const state of [
      "menu",
      "tracks",
      "career",
      "garage",
      "profile",
      "settings",
      "lobby",
    ]) {
      await p.evaluate((state) => window.__velox.machine.go(state), state);
      await p.waitForTimeout(100);
      const result = await p.evaluate(async () => {
        const g = window.__velox,
          r = g.renderer;
        let draws = 0;
        let worldVisible = false;
        const original = r.composer.render.bind(r.composer);
        r.composer.render = (...a) => {
          draws++;
          worldVisible ||= r.world.visible || r.stage.visible;
          return original(...a);
        };
        for (let i = 0; i < 4; i++) r.render(1 / 60);
        r.composer.render = original;
        const css = getComputedStyle(
          document.getElementById("app"),
          "::before",
        );
        return {
          state: g.machine.current,
          draws,
          worldVisible,
          backdrop: css.backgroundColor,
          filter: css.backdropFilter,
          focus:
            document.activeElement.dataset.action ||
            document.activeElement.id ||
            document.activeElement.tagName,
          ...(await import("/tools/scripts/ui-audit.js")).auditUI(),
        };
      });
      report.push({ width, height, ...result });
      assert.deepEqual(result.nowrap, [], `${state}/${width} nowrap`);
      assert.deepEqual(result.textBounds, [], `${state}/${width} local text bounds`);
      assert.notEqual(result.focus, "back");
      if (!["menu", "garage"].includes(state)) {
        assert.ok(result.draws <= 1);
        assert.equal(result.worldVisible, false);
        assert.match(result.backdrop, /0\.9\)/, JSON.stringify({width,height,...result}));
        assert.match(result.filter, /blur\(8px\)/);
      }
      if (state === "tracks" && width >= 1280) {
        const box = await p.locator("[data-action=start]").boundingBox();
        assert.ok(
          box.y >= 64 && box.y + box.height <= height - 56,
          JSON.stringify(box),
        );
      }
    }
    if (width >= 1280) {
      const primary = async (selector, state) => {
        const r = await p.locator(selector).boundingBox();
        assert.ok(r && r.y >= 64 && r.y + r.height <= height - 56, `${state}/${width}: ${JSON.stringify(r)}`);
        report.push({width,height,state,primaryVisible:true});
      };
      await p.evaluate(() => window.__velox.machine.go('garage'));
      await primary('.garage-activate .button','garage-primary');
      await p.evaluate(async () => {const g=window.__velox;g.machine.go('lobby');await g.netAction('net-host');});
      await primary('[data-action=net-start]','lobby-host-primary');
      await p.evaluate(() => {const g=window.__velox;g.net.close();g.net=null;g.config.rivals=5;g.machine.go('prerace');});
      await p.waitForFunction(()=>window.__velox.machine.current==='race');
      await p.evaluate(()=>window.__velox.machine.go('pause'));
      const resume=await p.locator('[data-action=resume]').boundingBox();
      assert.ok(resume.y>=0&&resume.y+resume.height<=height,'pause primary');
      await p.evaluate(()=>{const g=window.__velox;g.machine.go('race');g.race.finish(true);});
      await primary('.result-actions .primary','results-primary');
      assert.equal(await p.locator('.results-page').evaluate(e=>e.scrollTop),0);
    }
    await p.mouse.click(20, 20);
    assert.ok(
      await p
        .locator("body")
        .evaluate((e) => e.classList.contains("input-pointer")),
    );
    await p.keyboard.press("ArrowDown");
    assert.ok(
      await p
        .locator("body")
        .evaluate((e) => e.classList.contains("input-keys")),
    );
    await p.close();
  }
  fs.writeFileSync("test-results/v06-A.json", JSON.stringify(report, null, 2));
  console.log(
    "A backdrop, frozen compositor, initial focus, modality and setup primary visibility passed",
  );
} finally {
  await b.close();
}
