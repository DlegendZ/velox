// 0.9.4 open garage: the host lends every car fully upgraded; a guest races an unowned
// car at level 5 and their save is untouched. Switching back restores their own car.
import { chromium } from "playwright";
import assert from "node:assert/strict";
const url = process.env.VELOX_URL ?? "http://127.0.0.1:5174";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const host = await context.newPage(),
  guest = await context.newPage(),
  errors = [];
for (const p of [host, guest]) {
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.__velox?.machine, null, { timeout: 30000 });
  await p.evaluate(() => {
    const g = window.__velox;
    g.loop.stop();
    g.renderer.setQuality("low");
    g.machine.go("lobby");
  });
}
const saveBefore = await guest.evaluate(() =>
  JSON.stringify([window.__velox.save.data.garage, window.__velox.save.data.profile.credits]),
);
await host.evaluate(() => window.__velox.click("net-host", document.body));
await host.waitForFunction(() => window.__velox.net.roomCode.length === 6, null, { timeout: 20000 });
const code = await host.evaluate(() => window.__velox.net.roomCode);
await guest.evaluate((c) => {
  document.getElementById("join-code").value = c;
  window.__velox.click("net-join", document.body);
}, code);
await Promise.all([host, guest].map((p) => p.waitForFunction(() => window.__velox.net?.players.length === 2, null, { timeout: 40000 })));
// Host opens the garage from the lobby control.
await host.locator('[data-control="net-garage"][data-value="open"]').click();
await guest.waitForFunction(() => window.__velox.net.config.garage === "open");
// Guest picks an unowned car in the garage.
await guest.locator("[data-action=garage]").first().click();
await guest.waitForSelector(".garage-page");
const cars = await guest.evaluate(() => [...document.querySelectorAll(".car-row[data-action^=preview-]")].map((b) => b.dataset.action.slice(8)));
const owned = await guest.evaluate(() => Object.keys(window.__velox.save.data.garage.owned));
const pick = cars.find((id) => !owned.includes(id));
assert.ok(pick, `garage lists unowned cars (${cars.join(",")})`);
await guest.locator(`.car-row[data-action="preview-${pick}"]`).click();
await guest.locator(`[data-action="online-car-${pick}"]`).click();
await guest.locator("[data-action=tab-performance]").click();
await guest.screenshot({ path: "test-results/open-garage-performance.png" });
assert.equal(await guest.locator(".upgrade-buy:not([disabled])").count(), 0, "upgrades read as maxed");
await host.waitForFunction((id) => window.__velox.net.players.some((p) => !p.host && p.car === id), pick, { timeout: 10000 });
console.log(`PASS guest picked unowned ${pick}; host sees it`);
await guest.evaluate(() => window.__velox.machine.go("lobby"));
await host.screenshot({ path: "test-results/open-garage-lobby.png" });
// Race: the guest drives the lent car with every upgrade at the top level.
await guest.evaluate(() => window.__velox.net.setReady(true));
await host.waitForFunction(() => window.__velox.net.canStart);
await host.evaluate(() => window.__velox.net.start());
await guest.waitForFunction(() => window.__velox.race && !window.__velox.race.waiting, null, { timeout: 60000 });
const raced = await guest.evaluate(() => {
  const p = window.__velox.race.player;
  return { id: p.spec.id, upgrades: Object.values(p.owned.upgrades) };
});
assert.equal(raced.id, pick);
assert.ok(raced.upgrades.every((u) => u === 5), `all upgrades at 5 (${raced.upgrades})`);
console.log(`PASS race uses ${raced.id} with upgrades ${raced.upgrades.join("/")}`);
// Back in the lobby, closing the garage returns everyone to their own car.
await host.evaluate(() => window.__velox.net.returnToLobby());
await guest.waitForFunction(() => window.__velox.machine.current === "lobby");
await host.evaluate(() => window.__velox.net.setConfig({ garage: "own" }));
const active = await guest.evaluate(() => window.__velox.save.data.garage.activeCar);
await host.waitForFunction((id) => window.__velox.net.players.some((p) => !p.host && p.car === id), active, { timeout: 10000 });
console.log(`PASS own garage restores ${active}`);
const saveAfter = await guest.evaluate(() =>
  JSON.stringify([window.__velox.save.data.garage, window.__velox.save.data.profile.credits]),
);
assert.equal(saveAfter, saveBefore, "guest save untouched");
console.log("PASS guest save untouched");
assert.deepEqual(errors, []);
await browser.close();
console.log("open garage checks passed");
