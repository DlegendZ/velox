import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({ headless: true, channel: "chrome" }),
  report = [];
try {
  for (const [width, height] of [
    [1920, 1080],
    [1920, 960],
    [1536, 864],
    [1366, 768],
    [1280, 720],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(process.env.VELOX_URL ?? "http://127.0.0.1:5174");
    await page.waitForFunction(() => window.__velox);
    await page.evaluate(() => {
      const g = window.__velox;
      g.loop.stop();
      g.renderer.setQuality("low");
      g.garageTab = "dealer";
      g.machine.go("garage");
      g.renderer.render(1);
    });
    const details = await page.evaluate(async () => {
      const list = document.querySelector(".car-list");
      const ownedCards = [...list.querySelectorAll("[data-action^=preview]")]
        .length;
      const dealer = document.querySelector(".dealer-card");
      const thumbs = [...window.__velox.renderer.carThumbnails.values()];
      const sizes = await Promise.all(
        thumbs.map(
          (src) =>
            new Promise((resolve) => {
              const im = new Image();
              im.onload = () => resolve([im.width, im.height]);
              im.src = src;
            }),
        ),
      );
      const card = list.querySelector(".car-row"),
        style = getComputedStyle(card),
        thumb = card.querySelector(".car-thumbnail").getBoundingClientRect();
      return {
        ownedCards,
        dealer: !!dealer,
        sizes,
        width: card.getBoundingClientRect().width,
        height: card.getBoundingClientRect().height,
        thumbnailHeight: thumb.height,
        paddingBottom: style.paddingBottom,
        gap: getComputedStyle(list).gap,
      };
    });
    assert.ok(
      details.sizes.length === 8 &&
        details.sizes.every((s) => s[0] === 512 && s[1] === 256),
    );
    assert.ok(Math.abs(details.width - 220) < .01, "220px card width (subpixel tolerance)");
    assert.ok(Math.abs(details.height - 150) < .01);
    assert.ok(Math.abs(details.thumbnailHeight - 96) < .01);
    assert.equal(details.paddingBottom, "10px");
    assert.equal(details.gap, "12px");
    if ([1920, 1366].includes(width))
      for (const tab of ["collection", "dealer", "performance", "visual"]) {
        const frame = await page.evaluate(async (tab) => {
          const g = window.__velox;
          g.garageTab = tab;
          g.screen();
          g.renderer.render(1);
          const { carBounds, boxCorners } =
            await import("/src/render/CarFraming.ts");
          const rect = document
              .querySelector(".garage-stage")
              .getBoundingClientRect(),
            cam = g.renderer.camera;
          cam.updateMatrixWorld(true);
          const points = boxCorners(carBounds(g.renderer.stageCar.root))
            .map((p) => p.project(cam))
            .map((p) => ({
              x: ((p.x + 1) * innerWidth) / 2,
              y: ((1 - p.y) * innerHeight) / 2,
            }));
          return {
            tab,
            cameraY:cam.position.y,
            rect: rect.toJSON(),
            points,
            fill:
              (Math.max(...points.map((p) => p.x)) -
                Math.min(...points.map((p) => p.x))) /
              rect.width,
            mirror: g.renderer.reflector.visible,
          };
        }, tab);
        if(tab === "performance") assert.ok(Math.abs(frame.cameraY-.55)<.25, "Performance camera remains at wheel height");
        assert.ok(
          frame.points.every(
            (p) =>
              p.x >= frame.rect.left &&
              p.x <= frame.rect.right &&
              p.y >= frame.rect.top &&
              p.y <= frame.rect.bottom,
          ),
          JSON.stringify(frame),
        );
        assert.ok(
          frame.fill >= 0.55 && frame.fill <= 0.7,
          JSON.stringify(frame),
        );
        assert.equal(frame.mirror, false);
        report.push({ width, height, framing: frame });
      }
    await page.evaluate(() => {
      window.__velox.garageTab = "dealer";
      window.__velox.screen();
    });
    const ids = await page
      .locator(".car-row[data-action^=preview-]")
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.action.slice(8)));
    if (width === 1920 && height === 1080) {
      await page.waitForTimeout(4100);
      assert.ok(
        await page
          .locator(".orbit-hint")
          .evaluate((e) => e.classList.contains("dismissed")),
        "orbit hint fades at4s",
      );
      await page.evaluate(() => window.__velox.screen());
      assert.ok(
        await page
          .locator(".orbit-hint")
          .evaluate((e) => e.classList.contains("dismissed")),
        "hint stays dismissed during rerender",
      );
      await page.evaluate(() => {
        const g = window.__velox;
        g.machine.go("menu");
        g.garageTab = "dealer";
        g.machine.go("garage");
      });
      assert.ok(
        await page
          .locator(".orbit-hint")
          .evaluate((e) => !e.classList.contains("dismissed")),
        "new visit restores hint",
      );
    }
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i],
        card = page.locator(`[data-action=preview-${id}]`);
      await card.scrollIntoViewIfNeeded();
      if (i % 3 === 0) await card.click();
      else if (i % 3 === 1) {
        await card.focus();
        await page.keyboard.press("Enter");
      } else
        await page.evaluate((id) => {
          const g = window.__velox;
          document.querySelector(`[data-action=preview-${id}]`).focus();
          const pad = {
            connected: true,
            axes: [0, 0, 0, 0],
            buttons: Array.from({ length: 17 }, () => ({
              pressed: false,
              value: 0,
            })),
          };
          Object.defineProperty(navigator, "getGamepads", {
            configurable: true,
            value: () => [pad],
          });
          pad.buttons[0].pressed = true;
          g.input.read(1 / 60);
          pad.buttons[0].pressed = false;
          g.input.read(1 / 60);
        }, id);
      assert.equal(await page.evaluate(() => window.__velox.previewCar), id);
    }
    // Two Enter presses preview then buy, using a fresh affordable dealer state.
    await page.evaluate(() => {
      const g = window.__velox;
      g.save.data.profile.level = 30;
      g.save.data.profile.credits = 1000000;
      g.armedCar = null;
      g.screen();
    });
    await page.locator("[data-action=preview-vanta]").focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(() => !!window.__velox.save.data.garage.owned.vanta),
      false,
    );
    await page.locator("[data-action=preview-vanta]").focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(() => !!window.__velox.save.data.garage.owned.vanta),
      true,
    );
    await page.evaluate(() => {
      const g = window.__velox;
      g.garageTab = "dealer";
      g.screen();
    });
    await page.locator("[data-action=preview-kestrel]").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.action),
      "preview-brutus",
    );
    const wheelBefore = await page.evaluate(() => {
      const list = document.querySelector(".car-list");
      list.scrollTo({ left: 0, behavior: "instant" });
      const before = list.scrollLeft;
      list.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 200,
          bubbles: true,
          cancelable: true,
        }),
      );
      return before;
    });
    await page.waitForFunction(
      (before) => document.querySelector(".car-list").scrollLeft > before,
      wheelBefore,
    );
    await page.evaluate(() => {
      document
        .querySelector(".garage-page")
        .scrollTo({ top: 0, behavior: "instant" });
      window.__velox.frameGarage();
    });
    const stage = await page.locator(".garage-stage").boundingBox(),
      cx = stage.x + stage.width / 2,
      cy = stage.y + stage.height / 2;
    assert.equal(
      await page.evaluate(
        ({ cx, cy }) => document.elementFromPoint(cx, cy)?.id,
        { cx, cy },
      ),
      "world",
      "stage passes pointer to canvas",
    );
    const before = await page.evaluate(() =>
      window.__velox.renderer.camera.position.toArray(),
    );
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 20, { steps: 5 });
    await page.mouse.up();
    const after = await page.evaluate(() => {
      window.__velox.renderer.render(1 / 60);
      return window.__velox.renderer.camera.position.toArray();
    });
    assert.ok(
      Math.hypot(...after.map((v, i) => v - before[i])) > 0.01,
      "orbit drag works",
    );
    report.push({
      width,
      height,
      cards: ids.length,
      mouseKeyboardPad: true,
      twoStepPurchase: true,
      arrows: true,
      wheel: true,
    });
    console.log(`Garage ${width}x${height} passed`);
    await page.close();
  }
  fs.writeFileSync(
    "test-results/v05-garage.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Garage selection, two-step purchase, arrows and wheel passed at six sizes",
  );
} finally {
  await browser.close();
}
