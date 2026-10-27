// 1.0 phone play: every screen in phone landscape fits or scrolls cleanly, touch targets
// stay usable, and portrait asks to rotate. Saves screenshots for review.
import { chromium } from "playwright";
const url = process.env.VELOX_URL ?? "http://127.0.0.1:5174";
const sizes = (process.argv[2] ?? "844x390,740x360,667x375,844x330,780x320").split(",");
const states = (process.argv[3] ?? "title,menu,tracks,tracks:conditions,career,garage,garage:performance,garage:visual,profile,settings,lobby,lobby:host,race,pause,results").split(",");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const fails = [];
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
  if (!ok) fails.push(msg);
};
for (const size of sizes) {
  const [width, height] = size.split("x").map(Number);
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__velox?.machine, null, { timeout: 60000 });
  await page.evaluate(() => window.__velox.renderer.setQuality("low"));
  for (const state of states) {
    const [name, tab] = state.split(":");
    if (name === "race") {
      await page.evaluate(() => {
        const g = window.__velox;
        g.net?.close();
        g.net = null;
        g.machine.go("prerace");
      });
      await page.waitForFunction(() => window.__velox.machine.current === "race", null, { timeout: 60000 });
      await page.evaluate(() => {
        const g = window.__velox;
        for (let i = 0; i < 300; i++) g.fixed(1 / 60);
        g.render(0.016, 1);
        g.updateHUD();
      });
    } else if (name === "results") {
      await page.evaluate(() => window.__velox.race.finish(true));
      await page.waitForTimeout(2600);
    } else {
      await page.evaluate(
        ([name, tab]) => {
          const g = window.__velox;
          if (name === "garage" && tab) g.garageTab = tab;
          g.machine.go(name);
          if (name === "tracks" && tab === "conditions") g.click("setup-next", document.body);
          if (name === "lobby" && tab === "host") g.click("net-host", document.body);
        },
        [name, tab],
      );
      await page.waitForTimeout(name === "lobby" && tab === "host" ? 1500 : 300);
    }
    await page.evaluate(() => window.__velox.render?.(0.016, 1));
    await page.screenshot({ path: `test-results/mobile-${size}-${state.replace(":", "-")}.png` });
    const r = await page.evaluate(() => {
      const app = document.getElementById("app");
      const visible = (e) => {
        const b = e.getBoundingClientRect(),
          s = getComputedStyle(e);
        return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      // Controls that sit outside the viewport and cannot be scrolled to.
      const lost = [...app.querySelectorAll("button, input:not([type=hidden]), select")]
        .filter(visible)
        .filter((e) => {
          const b = e.getBoundingClientRect();
          if (b.right <= innerWidth + 1 && b.left >= -1 && b.bottom <= innerHeight + 1) return false;
          for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
            const c = getComputedStyle(a);
            if (/auto|scroll/.test(c.overflowY + c.overflowX) && a.scrollHeight > a.clientHeight + 1) return false;
          }
          return true;
        })
        .map((e) => e.dataset.action ?? e.dataset.touch ?? e.id ?? e.textContent.trim().slice(0, 20));
      const small = [...app.querySelectorAll("button, [data-touch]")]
        .filter(visible)
        .filter((e) => {
          const b = e.getBoundingClientRect();
          return b.top < innerHeight && b.bottom > 0 && (b.height < 36 || b.width < 36);
        })
        .map((e) => `${e.dataset.action ?? e.dataset.touch ?? e.textContent.trim().slice(0, 16)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
      // How far the page's own scroller overflows (a few px means it should just fit).
      const scroller = [...app.querySelectorAll("main, .pause-panel, .garage-info-content")]
        .filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY))
        .map((e) => e.scrollHeight - e.clientHeight)
        .reduce((a, b) => Math.max(a, b), 0);
      return { lost, small, scroller, hscroll: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    check(r.lost.length === 0, `${size} ${state} controls reachable ${r.lost.join(", ")}`);
    check(r.small.length === 0, `${size} ${state} touch targets ≥36px ${r.small.slice(0, 6).join(", ")}`);
    check(!r.hscroll, `${size} ${state} no sideways page scroll`);
    // Either it fits, or it overflows enough that scrolling is clearly intended.
    check(r.scroller <= 1 || r.scroller > 60 || process.env.ALLOW_SMALL_SCROLL, `${size} ${state} no near-miss scroll (${r.scroller}px)`);
    console.log(`  ${size} ${state}: overflow ${r.scroller}px`);
  }
  check(errors.length === 0, `${size} no page errors ${errors.slice(0, 2).join(" | ")}`);
  await context.close();
}
// Portrait phones are asked to rotate.
const portrait = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const p = await portrait.newPage();
await p.goto(url);
await p.waitForFunction(() => window.__velox?.machine, null, { timeout: 60000 });
await p.waitForTimeout(500);
const rotate = await p.evaluate(() => {
  const el = document.querySelector(".rotate-prompt");
  return !!el && getComputedStyle(el).display !== "none";
});
await p.screenshot({ path: "test-results/mobile-portrait.png" });
check(rotate, "portrait phone shows the rotate prompt");
await browser.close();
if (fails.length) {
  console.log(`${fails.length} FAILED`);
  process.exit(1);
}
console.log("mobile checks passed");
