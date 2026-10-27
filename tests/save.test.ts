import { test } from "node:test";
import assert from "node:assert/strict";
import { Save, migrateSave, defaultSave, SAVE_KEY } from "../src/core/Save.ts";
const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
  };
};
test("corrupt and future saves recover; invalid amounts and arbitrary cars are rejected", () => {
  const s = memory();
  s.setItem(SAVE_KEY, "{broken");
  assert.equal(new Save(s).data.profile.credits, 5000);
  assert.equal(migrateSave({ version: 99 }).garage.activeCar, "kestrel");
  const d = defaultSave();
  d.profile.credits = -500;
  d.garage.activeCar = "bogus";
  d.garage.owned.kestrel.upgrades.engine = 100;
  const valid = migrateSave(d);
  assert.equal(valid.profile.credits, 0);
  assert.equal(valid.garage.activeCar, "kestrel");
  assert.equal(valid.garage.owned.kestrel.upgrades.engine, 5);
});
test("upgrade spends once and persists; locks and insufficient credits prevent purchases", () => {
  const m = memory(),
    s = new Save(m);
  assert.equal(s.buy("vanta"), false);
  assert.equal(s.upgrade("kestrel", "engine"), true);
  assert.equal(s.data.profile.credits, 4000);
  assert.equal(new Save(m).active.upgrades.engine, 1);
  s.reward(25000, 800);
  assert.equal(s.buy("vanta"), true);
  assert.equal(new Save(m).data.garage.activeCar, "vanta");
  assert.equal(s.buy("vanta"), false);
});
