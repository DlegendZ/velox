import { test } from "node:test";
import assert from "node:assert/strict";
import { TrackGeometry } from "../src/game/TrackGeometry.ts";
import { TRACKS } from "../src/data/tracks.ts";
import { Vector3 } from "three";

test("all tracks satisfy minimum radius, separation, elevation and grade", () => {
  for (const spec of TRACKS) {
    const g = new TrackGeometry(spec),
      step = Math.max(1, Math.round((8 * g.samples) / g.length));
    let minRadius = Infinity,
      maxGrade = 0,
      minSeparation = Infinity;
    for (let i = 0; i < g.samples; i++) {
      minRadius = Math.min(
        minRadius,
        1 / Math.max(1e-10, Math.abs(g.curvature[i])),
      );
      const tangent = g.tangents[i];
      maxGrade = Math.max(
        maxGrade,
        Math.abs(tangent.y) / Math.hypot(tangent.x, tangent.z),
      );
    }
    const stride = Math.max(1, Math.round((4 * g.samples) / g.length)),
      maxWidth = Math.max(...g.widths) * 2;
    for (let i = 0; i < g.samples; i += stride)
      for (let j = i + step; j < g.samples; j += stride) {
        const arc = (Math.min(j - i, g.samples - j + i) * g.length) / g.samples;
        if (arc <= 120) continue;
        minSeparation = Math.min(
          minSeparation,
          g.points[i].distanceTo(g.points[j]),
        );
      }
    assert.ok(
      minRadius >= Math.max(14, maxWidth * 0.8) - 0.1,
      `${spec.id}: radius ${minRadius.toFixed(2)}`,
    );
    assert.ok(
      minSeparation >= maxWidth * 3,
      `${spec.id}: separation ${minSeparation.toFixed(2)}`,
    );
    assert.ok(maxGrade <= 0.07, `${spec.id}: grade ${maxGrade}`);
    assert.ok(
      Math.max(...g.points.map((p) => p.y)) -
        Math.min(...g.points.map((p) => p.y)) <=
        30,
    );
    assert.equal(g.samples, Math.ceil(g.length / 1.5));
    if (spec.length === "gp") {
      assert.ok(g.length >= 2800);
      assert.ok(spec.sections?.some((s) => s.type === "bridge"));
      assert.ok(spec.sections?.some((s) => s.type === "tunnel"));
    }
  }
});
test("v2 widths interpolate and 3D nearest distinguishes elevated decks", () => {
  const spec = {
    ...TRACKS[0],
    smoothing: "centripetal" as const,
    points: [
      [0, 0, 0, 12],
      [0, 100, 0, 14],
      [100, 100, 10, 18],
      [100, 0, 10, 20],
    ] as [number, number, number, number][],
  };
  const g = new TrackGeometry(spec);
  assert.ok(Math.max(...g.widths) > 9.5 && Math.min(...g.widths) < 6.5);
  const p = g.at(0.3).point;
  assert.ok(Math.abs(g.nearest(p).t - 0.3) < 0.002);
  g.points[0] = new Vector3(0, 0, 0);
  g.points[1] = new Vector3(0, 0, 10);
  g.points[100] = new Vector3(0, 12, 0);
  g.points[101] = new Vector3(0, 12, 10);
  const upper = g.nearest(new Vector3(0, 12, 5));
  assert.ok(
    upper.index >= 99 && upper.index <= 101,
    `upper deck index ${upper.index}`,
  );
});
