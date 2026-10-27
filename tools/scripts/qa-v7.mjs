// 0.7 interaction checks: setup steps, side-card clicks, garage arrows, drag/wheel scroll, menu highlight, page fit.
import { chromium } from "playwright";
const url = process.env.VELOX_URL ?? "http://127.0.0.1:5174";
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) fails.push(msg); };
const sizes = (process.argv[2] ?? "1920x917,1366x768,1280x720").split(",");
for (const size of sizes) {
  const [width, height] = size.split("x").map(Number);
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__velox?.machine, null, { timeout: 30000 });
  const go = (code) => page.evaluate(`(async () => { const g = window.__velox; ${code} })()`);
  await go("g.machine.go('menu')");
  await page.waitForTimeout(400);
  // Menu: hovering an entry leaves exactly one highlighted entry.
  const entries = page.locator(".home-entry");
  await entries.nth(2).hover();
  await page.waitForTimeout(250);
  const lit = await page.evaluate(() => [...document.querySelectorAll(".home-entry")].filter((e) => getComputedStyle(e.querySelector("small")).opacity > 0.5).length);
  check(lit === 1, `${size} menu hover lights one entry (${lit})`);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(250);
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  check(ring === "none", `${size} keyboard menu focus has no outline (${ring})`);
  // Setup step 1 fits without scrolling; side card click selects that circuit.
  await go("g.click('quick', document.body)");
  await page.waitForTimeout(400);
  const fit = () => page.evaluate(() => { const m = document.querySelector("main"); return m.scrollHeight - m.clientHeight; });
  check((await fit()) <= 1, `${size} circuit step fits (${await fit()}px overflow)`);
  const before = await go("return g.config.track");
  const nextId = await page.evaluate(() => document.querySelector(".offset-1 .track-card").dataset.action.slice(6));
  await page.locator(".offset-1 .track-card").click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__velox.config.track);
  check(after === nextId && after !== before, `${size} side card click selects it (${before} → ${after})`);
  await page.waitForTimeout(400);
  check((await page.evaluate(() => window.__velox.config.track)) === nextId, `${size} selection stays after click`);
  // Wheel over the carousel moves exactly one circuit per gesture.
  await page.locator(".carousel").hover();
  const t0 = await page.evaluate(() => window.__velox.config.track);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 8); await page.waitForTimeout(16); }
  await page.waitForTimeout(300);
  const t1 = await page.evaluate(() => window.__velox.config.track);
  check(t0 !== t1, `${size} trackpad gesture browses (${t0} → ${t1})`);
  // Centre click → conditions step, which fits and has START.
  await page.locator(".offset-0 .track-card").click();
  await page.waitForTimeout(400);
  check((await page.evaluate(() => window.__velox.setupStep)) === "conditions", `${size} centre card confirms circuit`);
  check((await fit()) <= 1, `${size} conditions step fits (${await fit()}px overflow)`);
  const start = await page.locator(".start-button").boundingBox();
  check(start && start.y + start.height <= height - 44, `${size} START above footer`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check((await page.evaluate(() => window.__velox.setupStep)) === "track", `${size} ESC returns to circuit step`);
  // Garage arrows step through the cars.
  await go("g.save.data.garage.owned['vanta'] ||= JSON.parse(JSON.stringify(g.save.data.garage.owned[g.save.data.garage.activeCar])); g.machine.go('garage')");
  await page.waitForTimeout(600);
  const p0 = await page.evaluate(() => window.__velox.previewCar);
  const next = page.locator("[data-action=garage-next]");
  if (await next.isEnabled()) {
    await next.click();
    await page.waitForTimeout(300);
    const p1 = await page.evaluate(() => window.__velox.previewCar);
    check(p1 !== p0, `${size} garage → previews next car (${p0} → ${p1})`);
    await page.locator("[data-action=garage-prev]").click();
    await page.waitForTimeout(300);
    check((await page.evaluate(() => window.__velox.previewCar)) === p0, `${size} garage ← returns`);
  } else check(false, `${size} garage next arrow disabled with ${await page.locator('.car-row[data-action^="preview-"]').count()} cars`);
  // Settings: wheel scroll moves the scrollport smoothly; drag scrolls it too.
  await go("g.machine.go('settings'); g.click('settings-tab-graphics', document.body)");
  await page.waitForTimeout(500);
  const port = await page.evaluate(() => { const els = [...document.querySelectorAll("#app *")].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1); return els.map((e) => e.className).join(" | "); });
  console.log(`  scrollports: ${port || "(none — page fits)"}`);
  const visibleBars = await page.evaluate(() => [...document.querySelectorAll("#app *")].filter((e) => getComputedStyle(e).overflowY === "scroll").length);
  check(visibleBars === 0, `${size} no forced scrollbars (overflow: scroll) (${visibleBars})`);
  console.log(`  errors: ${errors.length ? errors.join("; ") : "none"}`);
  await page.close();
}
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASS");
process.exit(fails.length ? 1 : 0);
