// 0.10.1 touch driving: real multi-touch through CDP. A thumb rolls from GAS onto N2O
// and DRIFT without lifting (both keep the throttle), the other thumb steers with the
// arrow buttons, and long presses never open the browser's context menu.
import { chromium } from "playwright";
import assert from "node:assert/strict";
const url = process.env.VELOX_URL ?? "http://127.0.0.1:5174";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url);
await page.waitForFunction(() => window.__velox?.machine, null, { timeout: 60000 });
await page.evaluate(() => {
  const g = window.__velox;
  g.loop.stop();
  g.renderer.setQuality("low");
  g.machine.go("prerace");
});
await page.waitForFunction(() => window.__velox.machine.current === "race", null, { timeout: 60000 });
await page.evaluate(() => {
  const g = window.__velox;
  g.screen();
  g.updateHUD();
});
const cdp = await context.newCDPSession(page);
const centre = async (sel) => {
  const b = await page.locator(sel).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const touch = (type, points) =>
  cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
const controls = () => page.evaluate(() => window.__velox.input.read(1 / 60));
const gas = await centre("[data-touch=throttle]"),
  nitro = await centre("[data-touch=nitro]"),
  drift = await centre("[data-touch=handbrake]"),
  left = await centre("[data-touch=left]");
await touch("touchStart", [{ ...gas, id: 1 }]);
let c = await controls();
assert.equal(c.throttle, 1, "GAS throttles");
// Roll the same thumb up onto N2O.
for (let i = 1; i <= 6; i++)
  await touch("touchMove", [{ x: gas.x + ((nitro.x - gas.x) * i) / 6, y: gas.y + ((nitro.y - gas.y) * i) / 6, id: 1 }]);
c = await controls();
assert.ok(c.nitro && c.throttle === 1, `slide to N2O keeps gas (${JSON.stringify(c)})`);
console.log("PASS thumb slides GAS → N2O, throttle stays on");
// Second thumb steers left while the first holds N2O.
await touch("touchStart", [{ ...nitro, id: 1 }, { ...left, id: 2 }]);
for (let i = 0; i < 20; i++) c = await controls();
assert.ok(c.steer < -0.5 && c.nitro && c.throttle === 1, `two thumbs: ${JSON.stringify(c)}`);
console.log("PASS second thumb steers left while N2O is held");
// Roll the first thumb onto DRIFT: handbrake plus throttle.
for (let i = 1; i <= 6; i++)
  await touch("touchMove", [{ x: nitro.x + ((drift.x - nitro.x) * i) / 6, y: nitro.y + ((drift.y - nitro.y) * i) / 6, id: 1 }, { ...left, id: 2 }]);
c = await controls();
assert.ok(c.handbrake && c.throttle === 1 && !c.nitro, `drift keeps gas: ${JSON.stringify(c)}`);
console.log("PASS DRIFT keeps the throttle on");
await touch("touchEnd", []);
c = await controls();
assert.ok(!c.handbrake && c.throttle === 0 && !c.nitro, "all released");
assert.equal(await page.locator("[data-touch].pressed").count(), 0, "no stuck highlights");
console.log("PASS lifting both thumbs releases everything");
// Long press: the browser's context menu is suppressed on controls and the 3D view.
const blocked = await page.evaluate(() =>
  ["[data-touch=throttle]", "#world"].map((sel) => {
    const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.querySelector(sel).dispatchEvent(e);
    return e.defaultPrevented;
  }),
);
assert.deepEqual(blocked, [true, true], "context menu blocked");
console.log("PASS long-press context menu blocked");
assert.deepEqual(errors, []);
await browser.close();
console.log("touch driving checks passed");
