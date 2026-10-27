import { test } from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "three";
import { Checkpoints, noseProgress } from "../src/game/Checkpoints";
import { TrackGeometry } from "../src/game/TrackGeometry";
import { RaceManager } from "../src/game/RaceManager";
import { TRACKS, type TrackSpec } from "../src/data/tracks";
import { CARS } from "../src/data/cars";

test("a lap crosses the finish plane with the front bumper, never early", () => {
  const spec: TrackSpec = {
    id: "straight",
    name: "Straight",
    subtitle: "",
    environment: "neon",
    accent: "#fff",
    width: 16,
    difficulty: "",
    smoothing: "centripetal",
    points: [
      [0, 0],
      [0, 100],
      [100, 100],
      [100, -100],
      [0, -100],
    ],
  };
  const track = new TrackGeometry(spec);
  for (const car of CARS) {
    const checkpoints = new Checkpoints();
    for (let gate = 1; gate < 12; gate++)
      checkpoints.update(gate / 12 + 0.001, gate, 1);
    let crossed = false;
    for (let step = 0; step < 30; step++) {
      const position = new Vector3(0, 0.66, -car.length / 2 - 2 + step * 0.2);
      const crossing = checkpoints.update(
        noseProgress(track, position, new Quaternion(), car.length).t,
        12 + step / 60,
        1,
      );
      const noseZ = position.z + car.length / 2;
      if (noseZ < -0.000001) assert.notEqual(crossing, "lap", car.id);
      if (crossing === "lap") {
        assert.ok(
          noseZ >= -1e-6 && noseZ <= 0.5,
          `${car.id} bumper ${noseZ}m past line`,
        );
        crossed = true;
        break;
      }
    }
    assert.equal(crossed, true, car.id);
  }
});

test("every car grid nose starts at least 3m behind the finish in both directions", () => {
  for (const spec of TRACKS)
    for (const reverse of [false, true]) {
      const track = new TrackGeometry(spec, reverse),
        start = track.at(0);
      for (const car of CARS)
        for (let slot = 0; slot < 6; slot++) {
          const spot = RaceManager.prototype.gridSpot.call(
            { track } as RaceManager,
            slot,
            car.length,
          );
          const nose = spot.point
            .clone()
            .addScaledVector(
              new Vector3(Math.sin(spot.yaw), 0, Math.cos(spot.yaw)),
              car.length / 2,
            );
          const behind = nose
            .sub(start.point)
            .setY(0)
            .dot(start.tangent.clone().setY(0).normalize());
          assert.ok(
            behind <= -2.98,
            `${spec.id}/${reverse}/${car.id}/${slot}: ${behind}`,
          );
        }
    }
});
