import { test } from "node:test";
import assert from "node:assert/strict";
import {
  controlHintsVisible,
  standingsRows,
  HUDNotices,
} from "../src/ui/HUDPresentation.ts";
import { defaultSave, migrateSave } from "../src/core/Save.ts";
test("control hint migration is additive and preserves old progression", () => {
  const d = defaultSave();
  d.profile.credits = 12345;
  d.career.stars.tier1_1 = 3;
  delete (d.settings as Partial<typeof d.settings>).hintRaces;
  delete (d.settings as Partial<typeof d.settings>).showControlHints;
  const result = migrateSave(d);
  assert.equal(result.settings.hintRaces, 0);
  assert.equal(result.settings.showControlHints, false);
  assert.equal(result.profile.credits, 12345);
  assert.equal(result.career.stars.tier1_1, 3);
  result.settings.hintRaces = 7;
  result.settings.showControlHints = true;
  assert.equal(migrateSave(result).settings.hintRaces, 7);
  assert.equal(migrateSave(result).settings.showControlHints, true);
});
test("hints last twenty seconds in exactly the first three races, with a force override", () => {
  for (const race of [1, 2, 3]) {
    assert.equal(controlHintsVisible(19.99, race, false), true);
    assert.equal(controlHintsVisible(20, race, false), false);
  }
  assert.equal(controlHintsVisible(0, 4, false), false);
  assert.equal(controlHintsVisible(200, 30, true), true);
});
test("standings retain player and fit six rows, or top three in landscape", () => {
  for (let p = 0; p < 12; p++) {
    const rows = standingsRows(12, p, 768);
    assert.ok(rows.length <= 6);
    assert.ok(rows.includes(p));
    assert.deepEqual(rows.filter((x) => x !== null).slice(0, 3), [0, 1, 2]);
  }
  assert.deepEqual(standingsRows(6, 5, 390), [0, 1, 2]);
});
test("notices share two slots, expire after 1.8 seconds and rearm only after a new event", () => {
  const n = new HUDNotices();
  assert.equal(
    n.update({ countdown: "GO", wrong: "WRONG WAY", popup: "AIRTIME" }, 0)
      .length,
    2,
  );
  assert.equal(
    n.update({ countdown: "GO", wrong: "WRONG WAY", popup: "AIRTIME" }, 1800)
      .length,
    0,
  );
  n.update({ countdown: "", wrong: "", popup: "" }, 1900);
  assert.equal(n.update({ popup: "AIRTIME" }, 2000).length, 1);
});
