import { test } from "node:test";
import assert from "node:assert/strict";
import { InstancedMesh, LOD, Mesh, Object3D } from "three";
import { CARS } from "../src/data/cars";
import { newOwned } from "../src/core/Save";
import { CarFactory, loftBody } from "../src/game/CarFactory";
function triangles(object: Object3D, level: number): number {
  if (!object.visible) return 0;
  if (object instanceof LOD)
    return triangles(object.levels[level].object, level);
  return (
    (object instanceof Mesh
      ? ((object.geometry.index?.count ??
          object.geometry.attributes.position.count) /
          3) *
        (object instanceof InstancedMesh ? object.count : 1)
      : 0) + object.children.reduce((n, o) => n + triangles(o, level), 0)
  );
}
test("eight distinct lofted cars preserve sockets and fit every LOD budget", () => {
  const silhouettes = new Set<string>();
  for (const spec of CARS) {
    silhouettes.add(JSON.stringify(spec.shape));
    const model = CarFactory.buildProcedural(spec, newOwned(spec.id).visual);
    assert.equal(model.wheels.length, 4);
    for (const name of [
      "Wheel_FL",
      "Wheel_FR",
      "Wheel_RL",
      "Wheel_RR",
      "Socket_Exhaust_L",
      "Socket_Exhaust_R",
      "Socket_Camera_Hood",
      "Socket_Camera_Bumper",
    ])
      assert.ok(model.root.getObjectByName(name), `${spec.id} ${name}`);
    for (const [level, max] of [
      [0, 25000],
      [1, 6000],
      [2, 100],
    ] as const) {
      const count = triangles(model.root, level);
      assert.ok(count <= max, `${spec.id} LOD${level}: ${count}`);
      console.log(`${spec.id} LOD${level}: ${count} triangles`);
    }
    const geo = loftBody(spec),
      p = geo.attributes.position,
      n = geo.attributes.normal;
    assert.ok([...p.array, ...n.array].every(Number.isFinite));
    let side = -1;
    for (let i = 0; i < p.count; i++)
      if (Math.abs(p.getZ(i)) < 0.2 && (side < 0 || p.getX(i) > p.getX(side)))
        side = i;
    assert.ok(side >= 0 && n.getX(side) > 0.5, "side normals face outwards");
    // Average over the rearmost station (its centre point is degenerate by construction).
    let rearZ = 0,
      count = 0;
    const minZ = Math.min(...Array.from({ length: p.count }, (_, i) => p.getZ(i)));
    for (let i = 0; i < p.count; i++)
      if (p.getZ(i) < minZ + 0.05) {
        rearZ += n.getZ(i);
        count++;
      }
    assert.ok(rearZ / count < -0.3, "rear cap normals face backwards");
  }
  assert.equal(silhouettes.size, 8);
});
