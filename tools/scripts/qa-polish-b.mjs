import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({ headless: true, channel: "chrome" }),
  report = [];
try {
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [1280, 720],
    [390, 844],
  ]) {
    const p = await browser.newPage({ viewport: { width, height } });
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.goto(process.env.VELOX_URL ?? "http://127.0.0.1:5174");
    await p.waitForFunction(() => window.__velox);
    await p.evaluate(() => {
      const g = window.__velox;
      g.loop.stop();
      g.machine.go("tracks");
    });
    await p.waitForTimeout(100);
    const r = await p.evaluate(() => {
      const style = (s) => getComputedStyle(document.querySelector(s));
      return {
        opacity: style(".carousel-slot.offset-1").opacity,
        scale: style(".carousel-slot.offset-1").transform,
        background: style(".track-card").backgroundImage,
        maxHeight: style(".conditions").maxHeight,
        gap: style(".condition-options").gap,
        modeGap: style(".mode-strip").gap,
        wrap: style(".mode-strip").flexWrap,
        snap: style(".mode-strip").scrollSnapType,
        labels: ["time", "drift", "rush"].map((id) => {
          const b = document.querySelector(`[data-action=mode-${id}]`),
            n = b.querySelector(".mode-name");
          return {
            id,
            full: b.getAttribute("aria-label"),
            short: n.dataset.short,
            display: getComputedStyle(n.querySelector(".mode-full")).display,
            shown: getComputedStyle(n, "::after").content,
          };
        }),
      };
    });
    assert.equal(r.opacity, ".55".replace(/^\./, "0."));
    assert.match(r.scale, /0\.86/);
    assert.ok(!/rgba/.test(r.background));
    assert.equal(parseFloat(r.maxHeight), height - 168);
    assert.equal(r.gap, "12px");
    assert.equal(r.modeGap, "6px");
    assert.equal(r.wrap, "nowrap");
    assert.equal(r.snap, "x mandatory");
    if(width>=1280){
      const boxes=await p.evaluate(()=>({panel:document.querySelector('.conditions').getBoundingClientRect().toJSON(),strip:document.querySelector('.mode-strip').getBoundingClientRect().toJSON()}));
      assert.ok(boxes.panel.top>=boxes.strip.bottom+15 && boxes.panel.bottom<=height-56,JSON.stringify(boxes));
    }
    assert.deepEqual(
      r.labels.map((x) => x.short),
      ["TIME", "DRIFT", "RUSH"],
    );
    assert.ok(
      r.labels.every(
        (x) => x.full.length > 4 && (width > 1366 || x.display === "none"),
      ),
    );
    report.push({ width, height, ...r });
    await p.close();
  }
  fs.writeFileSync("test-results/v06-B.json", JSON.stringify(report, null, 2));
  console.log(
    "B1–B3 exact setup dimensions, opacity and short-label behaviour passed",
  );
} finally {
  await browser.close();
}
