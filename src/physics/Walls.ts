import RAPIER from "@dimforge/rapier3d-compat";
import type { Vector3 } from "three";

export interface WallRibbonOptions {
  closed?: boolean;
  bottom?: number;
  height?: number;
}

/** One shared-edge ribbon prevents a chassis corner snagging on separate wall boxes. */
export function createWallRibbon(
  world: RAPIER.World,
  points: Vector3[],
  options: WallRibbonOptions = {},
): RAPIER.Collider {
  const bottom = options.bottom ?? -0.3,
    height = options.height ?? 1.6;
  if (points.length < 2 || !Number.isFinite(height) || height <= 0)
    throw new Error("A wall ribbon needs two points and a positive height.");
  const count =
    options.closed &&
    points[0].distanceToSquared(points[points.length - 1]) < 1e-10
      ? points.length - 1
      : points.length;
  const vertices = new Float32Array(count * 6),
    indices: number[] = [],
    segments = options.closed ? count : count - 1;
  for (let i = 0; i < count; i++) {
    const p = points[i];
    vertices.set(
      [p.x, p.y + bottom, p.z, p.x, p.y + bottom + height, p.z],
      i * 6,
    );
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2,
      b = ((i + 1) % count) * 2;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      vertices,
      new Uint32Array(indices),
      // Rapier 0.21 otherwise discards contacts on a ribbon's reverse face.
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES |
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED,
    )
      .setFriction(0)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(0.05),
  );
}
