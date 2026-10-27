import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { TrackGeometry } from "./TrackGeometry";
const smooth = (x: number) => {
  x = THREE.MathUtils.clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};
const hash = (x: number, z: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
function noise(x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    u = smooth(x - ix),
    v = smooth(z - iz);
  return (
    THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), u),
      THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u),
      v,
    ) *
      2 -
    1
  );
}
export class Terrain {
  root: THREE.Mesh;
  collider: RAPIER.Collider;
  center: THREE.Vector3;
  private cells = new Map<string, number[]>();
  constructor(
    private track: TrackGeometry,
    world: RAPIER.World,
  ) {
    const bounds = new THREE.Box3().setFromPoints(track.points);
    this.center = bounds.getCenter(new THREE.Vector3());
    track.points.forEach((p, i) => {
      const key = `${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}`;
      const list = this.cells.get(key) ?? [];
      list.push(i);
      this.cells.set(key, list);
    });
    const n = 256,
      size = 2400,
      heights = new Float32Array((n + 1) * (n + 1)),
      positions: number[] = [],
      indices: number[] = [],
      colors: number[] = [];
    for (let x = 0; x <= n; x++)
      for (let z = 0; z <= n; z++) {
        const wx = this.center.x + (x / n - 0.5) * size,
          wz = this.center.z + (z / n - 0.5) * size,
          y = this.heightAt(wx, wz);
        heights[x * (n + 1) + z] = y;
        positions.push(wx, y, wz);
        const c = new THREE.Color(
          track.spec.environment === "neon"
            ? 0x182329
            : track.spec.environment === "coast"
              ? y < 2
                ? 0xb5a17d
                : 0x69745a
              : 0xa9805e,
        );
        c.multiplyScalar(0.9 + noise(wx / 35, wz / 35) * 0.1);
        colors.push(c.r, c.g, c.b);
        if (x < n && z < n) {
          const a = x * (n + 1) + z;
          indices.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1);
        }
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.root = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    );
    this.root.name = "Terrain";
    this.root.userData.trackFixture = true;
    this.root.receiveShadow = true;
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.heightfield(n, n, heights, { x: size, y: 1, z: size })
        .setTranslation(this.center.x, 0, this.center.z)
        .setFriction(1),
    );
  }
  heightAt(x: number, z: number) {
    const g = this.track,
      env = g.spec.environment;
    let y =
      env === "neon"
        ? noise(x / 90, z / 90) * 0.6 - 0.8
        : env === "coast"
          ? -1 +
            Math.max(0, (x - this.center.x) / 120) * 5 +
            noise(x / 120, z / 120) * 3
          : noise(x / 110, z / 110) * 2 - 1;
    let best = Infinity,
      index = 0;
    const cx = Math.floor(x / 64),
      cz = Math.floor(z / 64);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const i of this.cells.get(`${cx + dx},${cz + dz}`) ?? []) {
          const p = g.points[i],
            d = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (d < best) {
            best = d;
            index = i;
          }
        }
    const t = index / g.samples,
      edge = Math.sqrt(best) - g.halfWidthAt(t),
      road = g.points[index];
    const coastFloor = (height: number) =>
      env === "coast" && edge <= 30 ? Math.max(0.4, height) : height;
    if (g.inSection("tunnel", t) && edge < 34) {
      // The 9.4m heightfield cells need a broad cutting around the separate tunnel shell.
      const surface = road.y - 0.65;
      return coastFloor(
        THREE.MathUtils.lerp(
          surface,
          Math.max(y, road.y + 10),
          smooth((edge - 20) / 14),
        ),
      );
    }
    if (g.inSection("bridge", t))
      return coastFloor(edge < 20 ? Math.min(y, road.y - 8) : y);
    if (edge < 60) {
      const normal = g.at(t).normal,
        lateral = (x - road.x) * normal.x + (z - road.z) * normal.z;
      const surface =
        g.at(
          t,
          THREE.MathUtils.clamp(lateral, -g.halfWidthAt(t), g.halfWidthAt(t)),
        ).point.y - 0.45;
      // Broad embankments: the coarse heightfield cannot show a steep bank cleanly.
      y = THREE.MathUtils.lerp(surface - 0.15, y, smooth((edge - 3) / 45));
    }
    return coastFloor(y);
  }
}
