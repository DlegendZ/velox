import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const url = process.env.VELOX_URL ?? "http://127.0.0.1:5176";
const full = process.argv.includes("--full");
const garageOnly = process.argv.includes("--garage-only");
fs.mkdirSync("test-results", { recursive: true });
const shotRoot = process.env.QA_SHOTS_ROOT ?? "test-results";
fs.mkdirSync(shotRoot, { recursive: true });
const report = [];
const sizes = (
  process.env.QA_SIZES ??
  "1920x1080,1920x960,1536x864,1366x768,1280x720,390x844"
)
  .split(",")
  .map((s) => s.split("x").map(Number));
for (const [width, height] of sizes) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__velox?.machine);
  await page.evaluate(() => {
    window.__velox.renderer.setQuality("low");
    window.__velox.loop.stop();
  });
  const cases = garageOnly
    ? ["garage", "garage:dealer", "garage:performance", "garage:visual"]
    : full
      ? [
          "title",
          "menu",
          "tracks",
          "career",
          "garage",
          "profile",
          "settings",
          "lobby",
          "garage:dealer",
          "garage:performance",
          "garage:visual",
          "settings:controls",
          "settings:graphics",
          "settings:audio",
          "settings:online",
          "loading",
          "lobby:host",
          "pause",
          "photo",
          "results",
        ]
      : ["title", "menu", "tracks"];
  for (const state of cases) {
    if (state === "pause") {
      await page.evaluate(() => {
        const g = window.__velox;
        g.net?.close();
        g.net = null;
        g.machine.go("prerace");
      });
      await page.waitForFunction(
        () => window.__velox.machine.current === "race",
      );
    }
    await page.evaluate((s) => {
      const g = window.__velox,
        [name, tab] = s.split(":");
      if (tab && name === "garage") g.garageTab = tab;
      if (tab && name === "settings") g.settingsTab = tab;
      if (name === "loading") {
        document.querySelector("#app").innerHTML = g.screens.loading(
          0.65,
          "Circuit and vehicles ready",
        );
        return;
      }
      if (name === "results")
        g.result = {
          position: 1,
          time: 94.2,
          laps: [94.2],
          best: 94.2,
          score: 4200,
          credits: 6500,
          xp: 420,
          stars: 3,
          clean: 1000,
          nearMisses: 2,
          completed: true,
          standings: g.race.standings(),
          newBest: true,
        };
      g.machine.go(name);
      if (name === "lobby" && tab === "host")
        g.click("net-host", document.body);
      g.renderer.render(1);
    }, state);
    await page.waitForTimeout(state === "results" ? 2900 : 350);
    if (state.startsWith("garage")) {
      const overlaps = await page.evaluate(() => {
        const selectors = [
          ".garage-rail",
          ".garage-info",
          ".garage-strip",
          ".garage-page .page-heading",
          ".header",
          ".footer",
        ];
        const items = selectors.map((s) => {
          const e = document.querySelector(s),
            r = e.getBoundingClientRect();
          const clipped = {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
          };
          for (
            let p = e.parentElement;
            p && p.id !== "app";
            p = p.parentElement
          )
            if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflow)) {
              const bounds = p.getBoundingClientRect();
              clipped.top = Math.max(clipped.top, bounds.top);
              clipped.bottom = Math.min(clipped.bottom, bounds.bottom);
              clipped.left = Math.max(clipped.left, bounds.left);
              clipped.right = Math.min(clipped.right, bounds.right);
            }
          return { s, r: clipped };
        });
        const hits = [];
        for (let i = 0; i < items.length; i++)
          for (let j = i + 1; j < items.length; j++) {
            const a = items[i],
              b = items[j];
            if (
              Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) >
                1 &&
              Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 1
            )
              hits.push([a.s, b.s]);
          }
        return hits;
      });
      assert.deepEqual(overlaps, [], `${state}/${width} garage panel overlap`);
    }
    const problems = await page.evaluate(() => {
      const visible = [...document.querySelectorAll("#app *")].filter(
        (e) =>
          e.getClientRects().length &&
          getComputedStyle(e).visibility !== "hidden",
      );
      return {
        bodyOverflow: document.documentElement.scrollHeight > innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth,
        small: visible
          .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12)
          .map((e) => e.outerHTML.slice(0, 160)),
        unreachable: visible
          .filter(
            (e) => e.matches("[data-action]:not([disabled])") && e.tabIndex < 0,
          )
          .map((e) => e.outerHTML.slice(0, 100)),
      };
    });
    assert.equal(
      problems.overflow,
      false,
      `${state} ${width} horizontal overflow`,
    );
    assert.equal(
      problems.bodyOverflow,
      false,
      `${state}/${width} body scrolling`,
    );
    assert.deepEqual(problems.small, [], `${state} ${width} small fonts`);
    assert.deepEqual(problems.unreachable, [], `${state} ${width} keyboard`);
    const textAudit = await page.evaluate(async () =>
      (await import("/tools/scripts/ui-audit.js")).auditUI(),
    );
    assert.deepEqual(
      textAudit.nowrap,
      [],
      `${state}/${width} nowrap labels truncate`,
    );
    assert.deepEqual(
      textAudit.textBounds,
      [],
      `${state}/${width} text stays inside its local container`,
    );
    const comfort = await page.evaluate(async () =>
      (await import("/tools/scripts/ui-audit.js")).auditComfort(),
    );
    assert.deepEqual(
      comfort.fonts,
      [],
      `${state}/${width} display and button font roles`,
    );
    if ([1920, 1366].includes(width))
      assert.deepEqual(
        comfort.targets,
        [],
        `${state}/${width} 44px hit targets`,
      );
    assert.deepEqual(
      comfort.scrollKeys,
      [],
      `${state}/${width} all scrollports have keys`,
    );
    const visibilityFailures = await page.evaluate(() => {
      const header = document.querySelector(".header")?.getBoundingClientRect(),
        footer = document.querySelector(".footer")?.getBoundingClientRect(),
        failures = [];
      const elements = [
        ...document.querySelectorAll(
          "#app button:not([disabled]),#app input:not([type=hidden]):not([disabled]),#app select:not([disabled]),#app textarea:not([disabled])",
        ),
      ].filter(
        (e) =>
          e.getClientRects().length &&
          getComputedStyle(e).visibility !== "hidden",
      );
      for (const el of elements) {
        el.focus();
        const r = el.getBoundingClientRect(),
          inBar = el.closest(".header,.footer"),
          top = inBar ? 0 : (header?.bottom ?? 0),
          bottom = inBar ? innerHeight : (footer?.top ?? innerHeight);
        if (
          r.left < -0.5 ||
          r.right > innerWidth + 0.5 ||
          r.top < top - 0.5 ||
          r.bottom > bottom + 0.5
        )
          failures.push({
            action: el.dataset.action ?? el.id ?? el.tagName,
            rect: {
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
            },
            top,
            bottom,
          });
      }
      return failures;
    });
    assert.deepEqual(
      visibilityFailures,
      [],
      `${state}/${width} focused controls fully visible`,
    );
    if (state === "profile") {
      const grid = await page.evaluate(() => {
        const wrap = document.querySelector(".stat-tiles"),
          first = wrap.querySelector(".stat-number");
        return {
          columns: getComputedStyle(wrap).gridTemplateColumns.split(" ").length,
          count: wrap.children.length,
          valueAboveLabel:
            first.querySelector("strong").getBoundingClientRect().top <
            first.querySelector("span").getBoundingClientRect().top,
        };
      });
      assert.equal(
        grid.columns,
        width <= 600 ? 2 : 4,
        "Driver statistics column count",
      );
      assert.equal(grid.count, 12);
      assert.equal(
        grid.valueAboveLabel,
        false,
        "I3 places labels above values",
      );
    }
    const focusFailures = await page.evaluate(() =>
      [...document.querySelectorAll("#app [data-action]:not([disabled])")]
        .filter(
          (e) =>
            e.getClientRects().length &&
            getComputedStyle(e).visibility !== "hidden",
        )
        .filter((e) => {
          e.focus({ preventScroll: true });
          return document.activeElement !== e;
        })
        .map((e) => e.outerHTML.slice(0, 120)),
    );
    assert.deepEqual(focusFailures, [], `${state} ${width} focusability`);
    await page.evaluate(() => {
      document
        .querySelector("#app [data-autofocus]")
        ?.focus({ preventScroll: true });
      document.querySelectorAll("[data-scroll-key]").forEach((e) => {
        e.scrollTop = 0;
        e.scrollLeft = 0;
      });
    });
    await page.evaluate(() => window.__velox.renderer.render(1 / 60));
    if (!process.env.QA_NOSHOTS) await page.screenshot({
      path: `${shotRoot}/task-${full ? 8 : 7}-${state.replace(":", "-")}-${width}x${height}.png`,
    });
    report.push({ state, width, height, ...problems });
  }
  if (full) {
    await page.evaluate(() => window.__velox.machine.go("menu"));
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.action),
      "career",
    );
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(() => window.__velox.machine.current),
      "career",
    );
    await page.evaluate(() => {
      const g = window.__velox,
        pad = {
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
      pad.buttons[1].pressed = true;
      g.input.read(1 / 60);
      pad.buttons[1].pressed = false;
      g.input.read(1 / 60);
    });
    assert.equal(
      await page.evaluate(() => window.__velox.machine.current),
      "menu",
      "gamepad B returns home",
    );
  }
  assert.deepEqual(errors, []);
  await page.close();
}
await browser.close();
fs.writeFileSync(
  `test-results/task-${full ? 8 : 7}-ui.json`,
  JSON.stringify(report, null, 2),
);
console.log(`UI QA passed: ${report.length} screens`);
