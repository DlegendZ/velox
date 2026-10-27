// 0.9 online screens: entry and meet-up fit the viewport, nothing is clipped, shots for review.
import { chromium } from "playwright";
const url = process.env.VELOX_URL ?? "http://127.0.0.1:5174";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const fails = [];
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
  if (!ok) fails.push(msg);
};
const sizes = (process.argv[2] ?? "1920x917,1366x768,1280x720,390x844").split(",");
for (const size of sizes) {
  const [width, height] = size.split("x").map(Number);
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__velox?.machine, null, { timeout: 30000 });
  await page.evaluate(() => {
    const g = window.__velox;
    g.renderer.setQuality("low");
    g.machine.go("menu");
    g.machine.go("lobby");
  });
  await page.waitForTimeout(500);
  const overflow = () =>
    page.evaluate(() => {
      const m = document.querySelector("main");
      return m.scrollHeight - m.clientHeight;
    });
  // Hidden overflow inside a fixed-height panel would clip controls.
  const clipped = () =>
    page.evaluate(() => {
      const main = document.querySelector("main").getBoundingClientRect();
      return [...document.querySelectorAll("main button, main input, main select, main summary")]
        .filter((el) => el.offsetParent && !el.closest(".meet-options, .meet-drivers, .chat-log"))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.bottom > main.bottom + 1 || r.right > main.right + 1;
        })
        .map((el) => el.dataset.action ?? el.id ?? el.tagName);
    });
  const mobile = width < 700;
  if (!mobile) check((await overflow()) <= 1, `${size} entry fits (${await overflow()}px)`);
  await page.screenshot({ path: `test-results/online-entry-${size}.png` });
  await page.evaluate(() => window.__velox.click("net-host", document.body));
  await page
    .waitForFunction(() => window.__velox.net?.roomCode || window.__velox.net?.roomError, null, { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(400);
  if (!mobile) {
    check((await overflow()) <= 1, `${size} meet-up fits (${await overflow()}px)`);
    const hidden = await clipped();
    check(hidden.length === 0, `${size} meet-up controls visible (${hidden.join(", ")})`);
  }
  const map = await page.evaluate(() => {
    const r = document.querySelector(".meet-race .lobby-map")?.getBoundingClientRect();
    return r ? Math.round(Math.min(r.width, r.height)) : 0;
  });
  check(map >= 180, `${size} race map is large (${map}px)`);
  await page.screenshot({ path: `test-results/online-meet-${size}.png` });
  await page.locator(".manual-invite summary").click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `test-results/online-meet-manual-${size}.png` });
  check(errors.length === 0, `${size} no page errors ${errors.join(" | ")}`);
  await page.evaluate(() => window.__velox.net?.close());
  await page.close();
}
await browser.close();
if (fails.length) {
  console.log(`${fails.length} FAILED`);
  process.exit(1);
}
console.log("online UI checks passed");
