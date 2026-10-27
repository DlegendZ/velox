import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({ headless: true, channel: "chrome" }),
  report = [];
const url = process.env.VELOX_URL ?? "http://127.0.0.1:5174";
try {
  for (const transport of process.argv.includes("--invite-only")
    ? ["invite"]
    : (process.env.VELOX_TRANSPORTS ?? "online,room,invite").split(",")) {
    const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
      }),
      host = await context.newPage(),
      guest = await context.newPage(),
      errors = [];
    for (const p of [host, guest]) {
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(url);
      await p.waitForFunction(() => window.__velox);
      await p.evaluate(() => {
        const g = window.__velox;
        g.loop.stop();
        g.renderer.setQuality("low");
        g.machine.go("lobby");
      });
    }
    await host.evaluate(() => {
      const g = window.__velox;
      g.save.data.profile.name = "HOST";
      g.click("net-host", document.body);
    });
    await host.bringToFront();
    if (transport === "online") {
      // Room code through the public PeerJS broker, typed into the join box.
      await host.waitForFunction(() => window.__velox.net.roomCode.length === 6, null, { timeout: 20000 });
      const code = await host.evaluate(() => window.__velox.net.roomCode);
      await host.screenshot({ path: "test-results/net-room-host.png" });
      await guest.bringToFront();
      await guest.locator("#join-code").fill(code.toLowerCase());
      await guest.locator("#join-code").press("Enter");
    } else if (transport === "room") {
      const room = await host.evaluate(() => window.__velox.net.localRoom);
      await guest.bringToFront();
      await guest.locator("[data-action=net-manual]").click();
      await guest.locator("#room-code").fill(room);
      await guest.locator("[data-action=net-local]").click();
    } else {
      await host.locator(".manual-invite summary").click();
      await host.locator("[data-action=net-invite]").click();
      await host.waitForFunction(() => window.__velox.netUI.invite.length > 20);
      const code = await host.evaluate(() => window.__velox.netUI.invite);
      assert.ok(code.startsWith("VLX1-"));
      await guest.bringToFront();
      await guest.locator("[data-action=net-manual]").click();
      await guest.locator("#invite-code").fill(code);
      await guest.locator("[data-action=net-join-manual]").click();
      await guest.waitForFunction(() => window.__velox.netUI.reply.length > 20);
      const reply = await guest.evaluate(() => window.__velox.netUI.reply);
      await host.bringToFront();
      await host.locator("#answer-code").fill(reply);
      await host.locator("[data-action=net-accept]").click();
    }
    try {
      await Promise.all([
        host.waitForFunction(() => window.__velox.net?.players.length === 2),
        guest.waitForFunction(() => window.__velox.net?.players.length === 2),
      ]);
    } catch (error) {
      const diagnostics = [];
      for (const p of [host, guest])
        diagnostics.push(
          await p.evaluate(() => {
            const g = window.__velox,
              n = g.net ?? g.netUI.guest;
            return {
              state: g.machine.current,
              players: n?.players.length,
              toast: document.querySelector(".toast")?.textContent,
              busy: g.netUI.busy,
              links: [
                ...(n?.links.values() ?? []),
                ...(n?.pending.values() ?? []),
              ].map((link) => ({
                open: link.open,
                peer: link.peer,
                connection: link.pc?.connectionState,
                ice: link.pc?.iceConnectionState,
                gathering: link.pc?.iceGatheringState,
                localType: link.pc?.localDescription?.type,
                remoteType: link.pc?.remoteDescription?.type,
                localCandidates: (link.pc?.localDescription?.sdp ?? "")
                  .split("\n")
                  .filter((l) => l.startsWith("a=candidate:"))
                  .map((l) =>
                    l.includes(".local")
                      ? "mDNS"
                      : l.split(" typ ")[1]?.split(" ")[0],
                  ),
                remoteCandidates: (link.pc?.remoteDescription?.sdp ?? "")
                  .split("\n")
                  .filter((l) => l.startsWith("a=candidate:"))
                  .map((l) =>
                    l.includes(".local")
                      ? "mDNS"
                      : l.split(" typ ")[1]?.split(" ")[0],
                  ),
              })),
            };
          }),
        );
      fs.writeFileSync(
        "test-results/task-12-network-diagnostics.json",
        JSON.stringify(diagnostics, null, 2),
      );
      console.log(JSON.stringify(diagnostics));
      throw error;
    }
    await guest.bringToFront();
    await guest.locator("#chat-input").fill("<img src=x> hello");
    await guest.locator("[data-action=net-chat]").click();
    await host.waitForFunction(() =>
      window.__velox.chatLog.some((m) => m.text.includes("hello")),
    );
    assert.equal(
      await host.locator(".chat-log img").count(),
      0,
      "peer chat escaped",
    );
    await host.evaluate(() =>
      window.__velox.net.setConfig({
        track: "neon_gp",
        laps: 1,
        mode: "race",
        weather: "rain",
        reverse: false,
      }),
    );
    await guest.waitForFunction(
      () => window.__velox.net.config.track === "neon_gp",
    );
    assert.equal(
      await guest.locator("[data-control=weather]:not([disabled])").count(),
      0,
      "guest conditions read-only",
    );
    await guest.locator("[data-action=net-ready]").click();
    await host.waitForFunction(() => window.__velox.net.canStart);
    await host.screenshot({
      path: `test-results/task-12-net-${transport}-lobby.png`,
    });
    await host.bringToFront();
    await host.locator("[data-action=net-start]").click();
    await Promise.all([
      host.waitForFunction(
        () => window.__velox.machine.current === "race",
        null,
        { timeout: 60000 },
      ),
      guest.waitForFunction(
        () => window.__velox.machine.current === "race",
        null,
        { timeout: 60000 },
      ),
    ]);
    await Promise.all([
      host.waitForFunction(() => !window.__velox.race.waiting),
      guest.waitForFunction(() => !window.__velox.race.waiting),
    ]);
    for (let batch = 0; batch < 10; batch++) {
      for (const p of [host, guest])
        await p.evaluate(() => {
          const g = window.__velox;
          for (let i = 0; i < 30; i++) {
            g.fixed(1 / 60);
            if (i % 3 === 0) g.render(0.05, 1);
          }
          g.updateHUD();
        });
      await new Promise((r) => setTimeout(r, 30));
    }
    const before = await guest.evaluate(() =>
      [...window.__velox.race.remotes.values()][0].position.clone().toArray(),
    );
    await host.evaluate(() => {
      const g = window.__velox;
      g.input.keys.add("KeyW");
      for (let i = 0; i < 100; i++) {
        g.fixed(1 / 60);
        if (i % 3 === 0) g.render(0.05, 1);
      }
      g.input.clear();
    });
    await new Promise((r) => setTimeout(r, 250));
    await guest.evaluate(() => {
      window.__velox.race.remotes.forEach((r) => r.sample());
      window.__velox.render(0.05, 1);
    });
    const after = await guest.evaluate(() =>
      [...window.__velox.race.remotes.values()][0].position.toArray(),
    );
    assert.ok(
      Math.hypot(...after.map((v, i) => v - before[i])) > 1,
      "remote snapshots move the car",
    );
    const clock = await guest.evaluate(() => window.__velox.race.time);
    await guest.evaluate(() => {
      const g = window.__velox;
      g.machine.go("pause");
      for (let i = 0; i < 60; i++) g.fixed(1 / 60);
    });
    assert.ok(
      (await guest.evaluate(() => window.__velox.race.time)) > clock,
      "online pause keeps racing",
    );
    await guest.screenshot({
      path: `test-results/task-12-net-${transport}-live-pause.png`,
    });
    await host.evaluate(() => window.__velox.net.sendFinish(95, 94));
    await guest.waitForFunction(
      () => [...window.__velox.race.remotes.values()][0].finishTime === 95,
    );
    await host.evaluate(() => window.__velox.net.returnToLobby());
    await Promise.all([
      host.waitForFunction(() => window.__velox.machine.current === "lobby"),
      guest.waitForFunction(() => window.__velox.machine.current === "lobby"),
    ]);
    assert.deepEqual(errors, []);
    report.push({
      transport,
      players: 2,
      chatEscaped: true,
      guestReadOnly: true,
      snapshots: true,
      livePause: true,
      returnToLobby: true,
    });
    await context.close();
  }
  fs.writeFileSync(
    "test-results/task-12-network.json",
    JSON.stringify(report, null, 2),
  );
  console.log("Room code, same-browser and manual invite flows passed end to end");
} finally {
  await browser.close();
}
