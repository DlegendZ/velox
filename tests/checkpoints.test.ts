import { test } from "node:test";
import assert from "node:assert/strict";
import { Checkpoints } from "../src/game/Checkpoints.ts";
test("lap requires every ordered checkpoint; reverse and teleport shortcuts do not count", () => {
  const c = new Checkpoints();
  assert.equal(c.update(0.99, 1, 1), null);
  assert.equal(c.update(0, 2, 1), null);
  for (let i = 1; i < 12; i++) c.update(i / 12 + 0.001, i * 2, 1);
  assert.equal(c.update(0.001, 25, 1), "lap");
  assert.equal(c.lap, 2);
  assert.deepEqual(c.times, [25]);
  const r = new Checkpoints();
  r.update(0.09, 2, -1);
  assert.equal(r.passed, 0);
});
