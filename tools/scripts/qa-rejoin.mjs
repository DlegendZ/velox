// 0.9.2 stability: a room-code link that dies mid-race (guest side, then host side) is
// redialled automatically, the player keeps their slot, and car state flows again.
import { chromium } from "playwright";
import assert from "node:assert/strict";
const url = process.env.VELOX_URL ?? "http://127.0.0.1:5174";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const host = await context.newPage(),
  guest = await context.newPage(),
  errors = [],
  toasts = [];
for (const [name, p] of [["host", host], ["guest", guest]]) {
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await p.goto(url);
  await p.waitForFunction(() => window.__velox?.machine, null, { timeout: 30000 });
  await p.exposeFunction("__toast", (t) => toasts.push(`${name}: ${t}`));
  await p.evaluate(() => {
    const g = window.__velox;
    g.loop.stop();
    g.renderer.setQuality("low");
    const toast = g.toast.bind(g);
    g.toast = (m, k) => (window.__toast(m), toast(m, k));
    g.machine.go("lobby");
  });
}
await host.evaluate(() => window.__velox.click("net-host", document.body));
await host.waitForFunction(() => window.__velox.net.roomCode.length === 6, null, { timeout: 20000 });
const code = await host.evaluate(() => window.__velox.net.roomCode);
await guest.evaluate((c) => {
  document.getElementById("join-code").value = c;
  window.__velox.click("net-join", document.body);
}, code);
const twoPlayers = () =>
  Promise.all([host, guest].map((p) => p.waitForFunction(() => window.__velox.net?.players.length === 2, null, { timeout: 40000 })));
await twoPlayers();
await host.evaluate(() => window.__velox.net.setConfig({ track: "neon_gp", laps: 3, mode: "race" }));
await guest.evaluate(() => window.__velox.net.setReady(true));
await host.waitForFunction(() => window.__velox.net.canStart);
// The guest loads slower than the host is willing to wait, so "go" arrives first.
await guest.evaluate(() => {
  const r = window.__velox.renderer,
    precompile = r.precompile.bind(r);
  r.precompile = async () => {
    await new Promise((done) => setTimeout(done, 23000));
    return precompile();
  };
});
await host.evaluate(() => window.__velox.net.start());
for (const p of [host, guest]) {
  await p.waitForFunction(() => window.__velox.machine.current === "race", null, { timeout: 60000 });
  await p.waitForFunction(() => window.__velox.race && !window.__velox.race.waiting, null, { timeout: 60000 });
}
const step = (p, keys = false) =>
  p.evaluate((drive) => {
    const g = window.__velox;
    if (drive) g.input.keys.add("KeyW");
    for (let i = 0; i < 60; i++) {
      g.fixed(1 / 60);
      if (i % 3 === 0) g.render(0.05, 1);
    }
    g.input.clear();
  }, keys);
const remoteMoves = async () => {
  const before = await guest.evaluate(() => [...window.__velox.race.remotes.values()][0].position.toArray());
  for (let i = 0; i < 3; i++) {
    await step(host, true);
    await step(guest);
    await new Promise((r) => setTimeout(r, 120));
  }
  await guest.evaluate(() => {
    window.__velox.race.remotes.forEach((r) => r.sample());
    window.__velox.render(0.05, 1);
  });
  const after = await guest.evaluate(() => [...window.__velox.race.remotes.values()][0].position.toArray());
  return Math.hypot(...after.map((v, i) => v - before[i]));
};
// Run through the countdown.
for (let i = 0; i < 6; i++) {
  await step(host);
  await step(guest);
}
assert.ok((await remoteMoves()) > 1, "snapshots flow before the drop");

for (const side of ["guest", "host"]) {
  const page = side === "guest" ? guest : host;
  // Kill the WebRTC link the way a network change does.
  await page.evaluate(() => {
    const link = [...window.__velox.net.links.values()][0];
    link.conn.peerConnection.close();
  });
  await guest.waitForFunction(() => window.__velox.net?.links.get("host")?.open === true && !window.__velox.net.rejoining, null, { timeout: 45000 });
  await host.waitForFunction(() => [...window.__velox.net.links.values()].some((l) => l.open), null, { timeout: 20000 });
  for (const p of [host, guest]) {
    assert.equal(await p.evaluate(() => window.__velox.machine.current), "race", `${side} drop: still racing`);
    assert.equal(await p.evaluate(() => window.__velox.net.players.length), 2, `${side} drop: slot kept`);
  }
  const moved = await remoteMoves();
  assert.ok(moved > 1, `${side} drop: snapshots flow again (${moved.toFixed(2)} m)`);
  console.log(`PASS ${side}-side drop: reconnected, still racing, remote moved ${moved.toFixed(1)} m`);
}
// A finish sent while the guest is redialling still reaches the host.
await guest.evaluate(() => [...window.__velox.net.links.values()][0].conn.peerConnection.close());
await guest.evaluate(() => window.__velox.net.sendFinish(101, 99));
await host.waitForFunction(() => [...window.__velox.race.remotes.values()][0]?.finishTime === 101, null, { timeout: 45000 });
console.log("PASS finish sent mid-reconnect arrives");
// Leaving on purpose frees the slot at once (no 30 s hold).
await guest.evaluate(() => window.__velox.click("net-leave", document.body));
await host.waitForFunction(() => window.__velox.net.players.length === 1, null, { timeout: 4000 });
console.log("PASS deliberate leave frees the slot immediately");
// Closing the room ends guests at once instead of a 30 s redial.
await guest.evaluate(() => window.__velox.machine.go("lobby"));
await host.evaluate(() => window.__velox.net.returnToLobby?.());
await guest.evaluate((c) => {
  document.getElementById("join-code").value = c;
  window.__velox.click("net-join", document.body);
}, code);
await twoPlayers();
await host.evaluate(() => window.__velox.click("net-leave", document.body));
await guest.waitForFunction(() => !window.__velox.net && !window.__velox.netUI.guest, null, { timeout: 5000 });
assert.ok(toasts.some((t) => t.includes("The host closed the room.")), "guest told the room closed");
console.log("PASS host closing the room ends guests immediately");
console.log(toasts.join("\n"));
assert.deepEqual(errors, []);
await browser.close();
console.log("rejoin checks passed");
