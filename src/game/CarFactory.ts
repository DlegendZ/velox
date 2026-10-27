import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { CarSpec } from "../data/cars";
import type { Visual } from "../core/Save";
import { DESIGNS, type CarDesign } from "./CarDesigns";
export interface CarModel {
  root: THREE.Group;
  wheels: THREE.Group[];
  paint: THREE.MeshPhysicalMaterial;
  tail: THREE.MeshStandardMaterial;
  flames: THREE.Mesh[];
  underglow: THREE.Mesh;
  beams: THREE.Mesh[];
  apply: (visual: Visual) => void;
  setLights: (braking: boolean, reversing: boolean, boosting: boolean) => void;
  setHeadlights: (on: boolean) => void;
}
const WHEEL_Z = 1.3,
  WHEEL_Y = 0.39;
// --------------------------------------------------------------- textures
/** Generated in code (no canvas) so models also build in Node tests. */
function dataTexture(
  size: number,
  fn: (x: number, y: number) => [number, number, number, number],
  repeat = 1,
) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) data.set(fn(x / size, y / size), (y * size + x) * 4);
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
let shared: ReturnType<typeof makeShared> | null = null;
function makeShared() {
  const hash = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  // Metallic flake: tiny random normal perturbation.
  const flake = dataTexture(128, (x, y) => {
    const h = hash(Math.floor(x * 128), Math.floor(y * 128));
    return [128 + (h - 0.5) * 60, 128 + (hash(h, x) - 0.5) * 60, 255, 255];
  }, 18);
  // Tyre tread: chevron grooves across the running surface.
  const tread = dataTexture(128, (x, y) => {
    const g = ((x * 24 + Math.abs(y - 0.5) * 6) % 1) < 0.22 && Math.abs(y - 0.5) < 0.42;
    const sipe = Math.abs(y - 0.5) < 0.03 || Math.abs(Math.abs(y - 0.5) - 0.2) < 0.02;
    const v = g || sipe ? 70 : 128;
    return [v, 128, 255, 255];
  });
  // Honeycomb grille mesh (alpha for cut-outs, used as a dark texture).
  const honey = dataTexture(64, (x, y) => {
    const gx = x * 6,
      gy = y * 6 * 1.15,
      row = Math.floor(gy),
      ox = row % 2 ? 0.5 : 0;
    const dx = ((gx + ox) % 1) - 0.5,
      dy = (gy % 1) - 0.5;
    const hole = Math.max(Math.abs(dx) * 1.15 + Math.abs(dy) * 0.55, Math.abs(dy)) < 0.36;
    const v = hole ? 8 : 52;
    return [v, v, v + 4, 255];
  }, 1);
  // Brake disc with drilled holes and radial slots.
  const disc = dataTexture(128, (x, y) => {
    const dx = x - 0.5,
      dy = y - 0.5,
      r = Math.hypot(dx, dy),
      a = Math.atan2(dy, dx);
    const holes = r > 0.3 && r < 0.46 && Math.abs(((a / (Math.PI * 2)) * 24) % 1 - 0.5) < 0.12 && Math.abs(((r - 0.3) * 30) % 1 - 0.5) < 0.25;
    const ring = r < 0.22 ? 80 : 168 + hash(x * 128, y * 128) * 20;
    const v = holes ? 25 : ring;
    return [v, v, v, 255];
  });
  // Soft contact shadow.
  const blob = dataTexture(64, (x, y) => {
    const dx = (x - 0.5) * 2,
      dy = (y - 0.5) * 2;
    const d = Math.max(0, 1 - Math.pow(Math.pow(Math.abs(dx), 3) + Math.pow(Math.abs(dy), 3), 1 / 3));
    return [0, 0, 0, Math.min(255, d * d * 330)];
  });
  blob.wrapS = blob.wrapT = THREE.ClampToEdgeWrapping;
  const beam = dataTexture(32, (x, y) => [255, 255, 255, Math.round(255 * y * y * (1 - Math.abs(x - 0.5) * 2) ** 0.6)]);
  beam.wrapS = beam.wrapT = THREE.ClampToEdgeWrapping;
  const materials = {
    trim: new THREE.MeshPhysicalMaterial({ name: "TrimGloss", color: 0x07090b, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 }),
    plastic: new THREE.MeshStandardMaterial({ name: "TrimMatte", color: 0x101214, roughness: 0.82 }),
    trimLite: new THREE.MeshStandardMaterial({ name: "TrimGlossLite", color: 0x07090b, roughness: 0.3, metalness: 0.2 }),
    grille: new THREE.MeshStandardMaterial({ name: "Grille", color: 0x5a5d62, map: honey, roughness: 0.75, metalness: 0.1 }),
    chrome: new THREE.MeshStandardMaterial({ name: "Chrome", color: 0xe3e8ee, metalness: 1, roughness: 0.12 }),
    carbon: new THREE.MeshPhysicalMaterial({ name: "Carbon", color: 0x16181b, roughness: 0.35, clearcoat: 1, metalness: 0.3 }),
    interior: new THREE.MeshStandardMaterial({ name: "Interior", color: 0x15171a, roughness: 0.9 }),
    /** One vertex-coloured material for every dark detail: one draw call per car. */
    detail: new THREE.MeshStandardMaterial({ name: "Detail", vertexColors: true, roughness: 0.42, metalness: 0.25, side: THREE.DoubleSide }),
    tyre: new THREE.MeshStandardMaterial({ name: "Tyre", color: 0x16181a, roughness: 0.92, normalMap: tread, normalScale: new THREE.Vector2(0.9, 0.9) }),
    barrel: new THREE.MeshStandardMaterial({ name: "RimBarrel", color: 0x2a2d31, metalness: 0.8, roughness: 0.4 }),
    disc: new THREE.MeshStandardMaterial({ name: "BrakeDisc", color: 0xffffff, map: disc, metalness: 0.85, roughness: 0.35 }),
    lens: new THREE.MeshPhysicalMaterial({ name: "LensClear", color: 0x1b2026, metalness: 0.2, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.6 }),
    head: new THREE.MeshStandardMaterial({ name: "LightHead", color: 0xeaf4ff, emissive: 0xdcecff, emissiveIntensity: 3.2 }),
    shadow: new THREE.MeshBasicMaterial({ name: "ContactShadow", map: blob, transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4 }),
    beam: new THREE.MeshBasicMaterial({ name: "Beam", color: 0xcfe4ff, map: beam, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  };
  return { flake, materials };
}
// --------------------------------------------------------------- body surface
const smooth = (x: number) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
/** Half cross-section templates (nx, ny) from bottom centre round to top centre. */
const BODY_SECTION: [number, number][] = [
  [0, 0], [0.5, 0], [0.8, 0.008], [0.92, 0.05], [0.975, 0.16], [0.995, 0.32],
  [1, 0.46], [0.997, 0.6], [0.982, 0.7], [0.95, 0.8], [0.88, 0.89], [0.72, 0.955],
  [0.48, 0.99], [0.22, 1], [0, 1],
];
const CABIN_SECTION: [number, number][] = [
  [1, 0], [0.99, 0.25], [0.968, 0.5], [0.93, 0.7], [0.86, 0.86], [0.72, 0.95], [0.45, 0.995], [0, 1],
];
class Profile {
  private xs: number[] = [];
  private ys: number[] = [];
  constructor(points: [number, number][], samples = 240) {
    const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const p of curve.getSpacedPoints(samples)) {
      this.xs.push(Math.max(0, p.x));
      this.ys.push(Math.max(0, Math.min(1, p.y)));
    }
  }
  at(v: number): [number, number] {
    const f = Math.max(0, Math.min(1, v)) * (this.xs.length - 1),
      i = Math.min(this.xs.length - 2, Math.floor(f)),
      k = f - i;
    return [this.xs[i] + (this.xs[i + 1] - this.xs[i]) * k, this.ys[i] + (this.ys[i + 1] - this.ys[i]) * k];
  }
  /** Parameter of the first outward point at a given normalised height. */
  vAtY(ny: number, fromTop = false) {
    let best = 0,
      bestD = Infinity;
    for (let i = 0; i < this.ys.length; i++) {
      const outer = fromTop ? true : this.xs[i] > 0.6;
      if (!outer) continue;
      const d = Math.abs(this.ys[i] - ny);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best / (this.ys.length - 1);
  }
  vAtX(nx: number) {
    // Top surface: search from the top centre downwards.
    for (let i = this.xs.length - 1; i >= 0; i--) if (this.xs[i] >= nx) return i / (this.xs.length - 1);
    return 0;
  }
}
const bodyProfile = new Profile(BODY_SECTION),
  cabinProfile = new Profile(CABIN_SECTION);
const superFall = (e: number, p: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, e), p)), 1 / p);
export class BodyShape {
  L: number;
  archR: number;
  constructor(
    public spec: CarSpec,
    public d: CarDesign,
  ) {
    this.L = spec.length / 2;
    this.archR = d.tyre[0] + 0.085;
  }
  /** End rounding factor e∈[0,1] for a station. */
  endE(z: number) {
    const R = z > 0 ? this.d.noseRadius : this.d.tailRadius;
    return Math.max(0, (Math.abs(z) - (this.L - R)) / R);
  }
  zFromE(e: number, front: boolean) {
    const R = front ? this.d.noseRadius : this.d.tailRadius;
    return (front ? 1 : -1) * (this.L - R + e * R);
  }
  top(z: number) {
    const d = this.d,
      L = this.L;
    if (z >= d.zA) {
      const k = (z - d.zA) / (L - d.zA);
      return d.cowlY - (d.cowlY - d.noseY) * Math.pow(k, 1.9);
    }
    if (z <= d.zC) {
      const k = (d.zC - z) / (d.zC + L);
      return d.cowlY + (d.deckY - d.cowlY) * smooth(k * 1.4);
    }
    return d.cowlY + 0.012 * Math.sin((Math.PI * (d.zA - z)) / (d.zA - d.zC));
  }
  bottom(z: number) {
    const d = this.d,
      front = smooth((z - (WHEEL_Z + 0.25)) / (this.L - WHEEL_Z - 0.25)),
      rear = smooth((-z - (WHEEL_Z + 0.25)) / (this.L - WHEEL_Z - 0.25));
    return d.sillY + (d.noseBottomY - d.sillY) * front + (d.tailBottomY - d.sillY) * rear;
  }
  halfWidth(z: number, withFlare = true) {
    const d = this.d,
      u = (z + this.L) / (2 * this.L);
    let w = d.width * (d.rearTaper + (d.frontTaper - d.rearTaper) * smooth(u * 1.2 - 0.1));
    w *= 0.985 + 0.015 * Math.sin(Math.PI * u);
    if (withFlare)
      w +=
        d.flare *
        Math.max(Math.exp(-(((z - WHEEL_Z) / 0.62) ** 2)), Math.exp(-(((z + WHEEL_Z) / 0.62) ** 2)));
    return w;
  }
  /** Point on the painted body. v: 0 bottom centre → 1 top centre; side ±1. */
  point(z: number, v: number, side = 1, out = new THREE.Vector3()) {
    const d = this.d,
      [nx0, ny] = bodyProfile.at(v),
      e = this.endE(z),
      plan = superFall(e, z > 0 ? 4.6 : 5.4),
      bot = this.bottom(z),
      top = this.top(z);
    const flareWeight = 1 - smooth((ny - 0.5) / 0.35);
    const hw = this.halfWidth(z, false) + (this.halfWidth(z) - this.halfWidth(z, false)) * flareWeight;
    // Shoulder crease: a slight ridge that catches the light.
    const crease = d.shoulder * 0.014 * Math.exp(-(((ny - 0.66) / 0.05) ** 2));
    let x = (nx0 * hw + crease) * plan;
    const centre = bot + (top - bot) * 0.42,
      raw = bot + ny * (top - bot);
    // Softly rounded bonnet/boot leading edge, crisp lower bumper edge.
    const vert = superFall(e, raw > centre ? 3.2 : 6);
    let y = centre + (raw - centre) * vert;
    // Wheel arch openings.
    if (nx0 > 0.55)
      for (const wz of [WHEEL_Z, -WHEEL_Z]) {
        const dz = z - wz;
        if (Math.abs(dz) < this.archR) {
          const arch = WHEEL_Y + Math.sqrt(this.archR ** 2 - dz * dz);
          const blend = smooth((nx0 - 0.55) / 0.25);
          if (y < arch) y = y + (arch - y) * blend;
        }
      }
    return out.set(side * x, y, z);
  }
  cabinRoof(z: number) {
    const d = this.d,
      belt = this.top(z);
    if (z > d.zR1) {
      const k = (d.zA - z) / (d.zA - d.zR1);
      return belt + (d.roofY - belt) * (1 - Math.pow(1 - Math.max(0, k), 1.7));
    }
    if (z < d.zR2) {
      const k = (z - d.zC) / (d.zR2 - d.zC);
      return belt + (d.roofY - belt) * (1 - Math.pow(1 - Math.max(0, k), 1.35));
    }
    return d.roofY + 0.02 * Math.sin((Math.PI * (z - d.zR2)) / (d.zR1 - d.zR2));
  }
  cabin(z: number, v: number, side = 1, out = new THREE.Vector3()) {
    const d = this.d,
      [nx, ny] = cabinProfile.at(v),
      base = this.halfWidth(z, false) * d.cabinWidth,
      top = base * d.tumblehome,
      belt = this.top(z) - 0.004;
    return out.set(side * nx * (base + (top - base) * ny), belt + ny * (this.cabinRoof(z) - belt), z);
  }
}
// --------------------------------------------------------------- mesh helpers
type Surface = (row: number, col: number, out: THREE.Vector3) => THREE.Vector3;
/** Indexed grid; rows run rear→front, columns around (counter-clockwise seen from the front). */
function grid(rows: number[], cols: number[], fn: Surface, group?: (r: number, c: number) => number) {
  const positions: number[] = [],
    uvs: number[] = [],
    v = new THREE.Vector3();
  rows.forEach((r, i) =>
    cols.forEach((c, j) => {
      fn(r, c, v);
      positions.push(v.x, v.y, v.z);
      uvs.push(j / (cols.length - 1), i / (rows.length - 1));
    }),
  );
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < rows.length - 1; i++)
    for (let j = 0; j < cols.length - 1; j++) {
      const a = i * cols.length + j,
        b = a + 1,
        dd = a + cols.length,
        e = dd + 1;
      const g = group ? group((rows[i] + rows[i + 1]) / 2, (cols[j] + cols[j + 1]) / 2) : 0;
      if (g < 0) continue;
      const list = buckets.get(g) ?? [];
      list.push(a, b, dd, b, e, dd);
      buckets.set(g, list);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  const index: number[] = [];
  for (const g of [...buckets.keys()].sort((a, b) => a - b)) {
    geo.addGroup(index.length, buckets.get(g)!.length, g);
    index.push(...buckets.get(g)!);
  }
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}
const range = (a: number, b: number, n: number, stops: number[] = []) => {
  const list = Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  for (const s of stops) if (s > Math.min(a, b) && s < Math.max(a, b)) list.push(s);
  return [...new Set(list.map((x) => +x.toFixed(5)))].sort((x, y) => (a < b ? x - y : y - x));
};
/** Full ring of columns: w∈[0,1] right side (v=w), w∈[1,2] left side (v=2-w). */
const ringCols = (n: number, stops: number[] = []) =>
  range(0, 2, n * 2, [...stops, ...stops.map((s) => 2 - s)]);
const ringPoint = (w: number) => (w <= 1 ? { v: w, side: 1 } : { v: 2 - w, side: -1 });
// --------------------------------------------------------------- builder
interface Detail {
  sections: number;
  around: number;
  wheelSides: number;
}
const DETAIL: Detail[] = [
  { sections: 46, around: 15, wheelSides: 40 },
  { sections: 20, around: 7, wheelSides: 14 },
];
export function bodyStations(shape: BodyShape, n: number) {
  const { L } = shape,
    d = shape.d;
  const inner = range(-L + d.tailRadius, L - d.noseRadius, n, [
    WHEEL_Z, -WHEEL_Z, d.zA, d.zC, d.zR1, d.zR2,
    ...[-1, 1].flatMap((s) => [s * WHEEL_Z - shape.archR, s * WHEEL_Z + shape.archR, s * WHEEL_Z - shape.archR * 0.6, s * WHEEL_Z + shape.archR * 0.6]),
  ]);
  const ends = [0.25, 0.45, 0.6, 0.72, 0.82, 0.89, 0.94, 0.975, 0.993, 1];
  const step = Math.max(1, Math.round(10 / Math.max(4, n / 4.6)));
  const endE = ends.filter((_, i) => i % step === 0 || i === ends.length - 1);
  return [
    ...endE.slice().reverse().map((e) => shape.zFromE(e, false)),
    ...inner,
    ...endE.map((e) => shape.zFromE(e, true)),
  ].sort((a, b) => a - b);
}
export function bodyGeometry(spec: CarSpec, level = 0) {
  const shape = new BodyShape(spec, DESIGNS[spec.id] ?? DESIGNS.kestrel),
    det = DETAIL[level];
  const cols = ringCols(det.around);
  return grid(bodyStations(shape, det.sections), cols, (z, w, out) => {
    const { v, side } = ringPoint(w);
    return shape.point(z, v, side, out);
  });
}
/** Kept for compatibility with earlier tooling and tests. */
export const loftBody = (spec: CarSpec) => bodyGeometry(spec, 0);
const GLASS = 2,
  TRIM = 1,
  PAINT = 0;
function cabinGeometry(shape: BodyShape, level: number) {
  const d = shape.d,
    det = DETAIL[level];
  const yStops = [0.06, 0.7, 0.86].map((y) => cabinProfile.vAtY(y, true));
  const rows = range(d.zC, d.zA, Math.round(det.sections * 0.55), [d.zR1, d.zR2, d.zB - 0.05, d.zB + 0.05, d.zR2 - 0.16]);
  const cols = ringCols(Math.max(4, Math.round(det.around * 0.75)), yStops);
  const roofMat = d.roofColor === "glass" ? GLASS : d.roofColor === "black" ? TRIM : PAINT;
  return grid(
    rows,
    cols,
    (z, w, out) => {
      const { v, side } = ringPoint(w);
      return shape.cabin(z, v, side, out);
    },
    (z, w) => {
      const { v } = ringPoint(w),
        ny = cabinProfile.at(v)[1];
      if (ny < 0.06) return TRIM;
      if (z > d.zR1) return ny > 0.86 ? GLASS : ny > 0.7 ? TRIM : GLASS;
      if (z < d.zR2) {
        if (ny > 0.86) return GLASS;
        return z < d.zR2 - 0.16 || ny > 0.7 ? (d.roofColor === "glass" ? TRIM : PAINT) : GLASS;
      }
      if (ny > 0.86) return roofMat;
      if (Math.abs(z - d.zB) < 0.05) return TRIM;
      return GLASS;
    },
  );
}
/** A panel that hugs the body surface (lights, grilles, skirts, stripes). */
function bodyPatch(
  shape: BodyShape,
  zs: number[],
  vs: number[],
  sides: number[],
  lift: number,
) {
  const parts: THREE.BufferGeometry[] = [];
  const p = new THREE.Vector3(),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    n = new THREE.Vector3();
  for (const side of sides) {
    const geo = grid(zs, side > 0 ? vs : vs.slice().reverse(), (z, v, out) => {
      shape.point(z, v, side, p);
      shape.point(z + 0.004, v, side, a).sub(p);
      shape.point(z, v + 0.004, side, b).sub(p);
      n.crossVectors(b, a).multiplyScalar(side);
      if (n.lengthSq() < 1e-12) n.set(0, 0, Math.sign(z));
      return out.copy(p).addScaledVector(n.normalize(), lift);
    });
    parts.push(geo);
  }
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  parts.forEach((g) => g.dispose());
  return merged!;
}
/** Front/rear fascia patch addressed by radial position r (0 centre → 1 outline) and around v. */
function facePatch(shape: BodyShape, front: boolean, r0: number, r1: number, v0: number, v1: number, lift = 0.006, steps = 8) {
  const zs = range(r0, r1, steps).map((r) => shape.zFromE(Math.pow(Math.max(0, 1 - Math.pow(Math.min(0.9999, r), 3.6)), 1 / 3.6), front));
  return bodyPatch(shape, zs.sort((a, b) => a - b), range(v0, v1, steps), [1, -1], lift);
}
function wheelGeometries(d: CarDesign, sides: number, simple = false) {
  const [R, W] = d.tyre,
    rimR = R * 0.7;
  const lathe = (pts: [number, number][], segments: number) => {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segments);
    g.rotateZ(-Math.PI / 2); // axle along +X; profile y → x
    return g;
  };
  const h = W / 2;
  const tyre = lathe(
    [
      [rimR + 0.006, -h + 0.03], [rimR + 0.03, -h + 0.005], [R - 0.06, -h], [R - 0.02, -h + 0.012],
      [R - 0.004, -h + 0.04], [R, -h + 0.07], [R, h - 0.07], [R - 0.004, h - 0.04],
      [R - 0.02, h - 0.012], [R - 0.06, h], [rimR + 0.03, h - 0.005], [rimR + 0.006, h - 0.03],
    ],
    sides,
  );
  const barrel = lathe(
    [[rimR - 0.03, -h + 0.03], [rimR, -h + 0.02], [rimR + 0.004, -h + 0.04], [rimR - 0.01, h - 0.04], [rimR + 0.006, h - 0.02], [rimR - 0.02, h - 0.03]],
    sides,
  );
  // Disc + caliper live inside the barrel, offset towards the hub.
  const discGeo = new THREE.CylinderGeometry(rimR - 0.045, rimR - 0.045, 0.024, sides);
  discGeo.rotateZ(Math.PI / 2);
  discGeo.translate(h * 0.15, 0, 0);
  const caliper = simple
    ? new THREE.BoxGeometry(0.06, 0.14, 0.11)
    : new RoundedBoxGeometry(0.06, 0.14, 0.11, 2, 0.02);
  caliper.translate(h * 0.15 + 0.03, rimR * 0.62, -rimR * 0.36);
  return { tyre, barrel, disc: discGeo, caliper, rimR, h };
}
/** Cast wheel face: a disc with spoke windows cut out, dished towards the hub. */
function rimFace(design: number, rimR: number, h: number, curveSegments: number) {
  const outer = rimR - 0.008,
    shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const windows: [number, number, number, number, number][] = [];
  // [count, inner radius, outer radius, angular width fraction, twist]
  const defs: [number, number, number, number, number][][] = [
    [[5, 0.32, 0.9, 0.62, 0]],
    [[6, 0.3, 0.9, 0.6, 0]],
    [[14, 0.34, 0.9, 0.62, 0]],
    [[8, 0.32, 0.6, 0.66, 0], [16, 0.64, 0.92, 0.58, 0]],
    [[10, 0.36, 0.9, 0.52, 0]],
    [[12, 0.3, 0.9, 0.5, 0.55]],
  ];
  for (const w of defs[design]) windows.push(w);
  for (const [count, ri, ro, frac, twist] of windows)
    for (let k = 0; k < count; k++) {
      const c = (k / count) * Math.PI * 2 + (count === 16 ? Math.PI / 16 : 0),
        half = (Math.PI / count) * frac,
        hole = new THREE.Path(),
        steps = 5;
      const r0 = outer * ri,
        r1 = outer * ro;
      for (let s = 0; s <= steps; s++) {
        const a = c - half + (2 * half * s) / steps + twist * 0.35;
        const p = [Math.cos(a) * r1, Math.sin(a) * r1] as const;
        s ? hole.lineTo(...p) : hole.moveTo(...p);
      }
      for (let s = steps; s >= 0; s--) {
        const a = c - half * 0.7 + (1.4 * half * s) / steps;
        hole.lineTo(Math.cos(a) * r0, Math.sin(a) * r0);
      }
      hole.closePath();
      shape.holes.push(hole);
    }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.018,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 1,
    curveSegments,
  });
  // Dish: spokes sweep outward from a recessed hub.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i)) / outer;
    p.setZ(i, p.getZ(i) - 0.045 * (1 - r * r));
  }
  g.computeVertexNormals();
  // Hub, centre cap and five lug nuts.
  const hub = new THREE.CylinderGeometry(0.06, 0.068, 0.04, 16);
  hub.rotateX(Math.PI / 2);
  hub.translate(0, 0, -0.03);
  const parts = [g.toNonIndexed(), hub.toNonIndexed()];
  for (let k = 0; k < 5; k++) {
    const nut = new THREE.CylinderGeometry(0.011, 0.011, 0.03, 6);
    nut.rotateX(Math.PI / 2);
    nut.translate(Math.cos((k / 5) * Math.PI * 2) * 0.085, Math.sin((k / 5) * Math.PI * 2) * 0.085, -0.02);
    parts.push(nut.toNonIndexed());
  }
  const merged = mergeGeometries(parts)!;
  // Face the +X side of the wheel, sitting just inside the tyre's outer wall.
  merged.rotateY(Math.PI / 2);
  merged.translate(h - 0.035, 0, 0);
  return merged;
}
/** Bakes a flat vertex colour so many dark parts can share one material. */
function tinted(geo: THREE.BufferGeometry, color: number) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = new THREE.Color(color),
    n = g.attributes.position.count,
    colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.dispose();
  return g;
}
// --------------------------------------------------------------- factory
export class CarFactory {
  /** Set by the renderer: false on Low/Medium so even the player car uses the cheaper paint. */
  static premium = true;
  /**
   * hero: the player's / showroom car gets clearcoat paint and casts map shadows.
   * Rivals use cheaper look-alike materials and rely on the contact shadow.
   */
  static buildProcedural(spec: CarSpec, visual: Visual, hero = true): CarModel {
    const premium = hero && CarFactory.premium;
    shared ??= makeShared();
    const M = shared.materials,
      d = DESIGNS[spec.id] ?? DESIGNS.kestrel,
      shape = new BodyShape(spec, d),
      L = shape.L;
    const root = new THREE.Group();
    root.name = `Car_${spec.id}`;
    const paint = new THREE.MeshPhysicalMaterial({
      name: "Paint",
      color: visual.paint,
      metalness: 0.6,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      normalMap: shared.flake,
      normalScale: new THREE.Vector2(0.05, 0.05),
      envMapIntensity: 1.25,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      name: "Glass",
      color: 0x0b1015,
      metalness: 0,
      roughness: 0.03,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      transparent: true,
      opacity: 0.86,
      envMapIntensity: 1.5,
    });
    // Cheaper look-alikes for the mid-distance LOD.
    const paintLite = new THREE.MeshStandardMaterial({ name: "PaintLite", color: visual.paint, metalness: 0.55, roughness: 0.3, envMapIntensity: 1.25 });
    const glassLite = new THREE.MeshStandardMaterial({ name: "GlassLite", color: 0x0b1015, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.9 });
    const rim = premium
      ? new THREE.MeshPhysicalMaterial({ name: "Rim", color: visual.rimColor, metalness: 0.92, roughness: 0.22, clearcoat: 0.6 })
      : new THREE.MeshStandardMaterial({ name: "Rim", color: visual.rimColor, metalness: 0.92, roughness: 0.24 });
    const caliper = new THREE.MeshStandardMaterial({ name: "Caliper", color: visual.caliper, metalness: 0.3, roughness: 0.35 });
    const tail = new THREE.MeshStandardMaterial({ name: "LightTail", color: 0xff2a3a, emissive: 0xff1428, emissiveIntensity: 1.8 });
    const reverse = new THREE.MeshStandardMaterial({ name: "LightReverse", color: 0xd8dde3, emissive: 0xffffff, emissiveIntensity: 0 });
    const livery = new THREE.MeshStandardMaterial({ name: "Livery", color: 0xf2f4f5, roughness: 0.28 });
    const bodyLOD = new THREE.LOD();
    bodyLOD.name = "Body_LOD";
    root.add(bodyLOD);
    const spoilers: THREE.Object3D[][] = [[], [], [], []],
      liveries: THREE.Object3D[] = [],
      twins: THREE.Object3D[] = [];
    const add = (parent: THREE.Object3D, name: string, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], shadow = false) => {
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      m.castShadow = shadow && premium;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const vY = (ny: number) => bodyProfile.vAtY(ny),
      vX = (nx: number) => bodyProfile.vAtX(nx);
    for (const level of [0, 1]) {
      const g = new THREE.Group();
      g.name = `LOD${level}`;
      const det = DETAIL[level],
        S = level ? 1 : 2,
        details: THREE.BufferGeometry[] = [];
      const dark = (geo: THREE.BufferGeometry, color = 0x08090b) => details.push(tinted(geo, color));
      const bodyPaint = level || !premium ? paintLite : paint,
        bodyGlass = level || !premium ? glassLite : glass;
      add(g, "Body", bodyGeometry(spec, level), bodyPaint, true);
      if (!d.openCage)
        add(g, "Cabin", cabinGeometry(shape, level), [bodyPaint, premium && !level ? M.trim : M.trimLite, bodyGlass], level === 0);
      // Lights.
      const trims: THREE.BufferGeometry[] = [],
        heads: THREE.BufferGeometry[] = [],
        lenses: THREE.BufferGeometry[] = [],
        tails: THREE.BufferGeometry[] = [],
        grilles: THREE.BufferGeometry[] = [];
      if (d.headlights === 0) {
        lenses.push(facePatch(shape, true, 0.56, 0.94, vY(0.56), vY(0.74), 0.006, level ? 3 : 6));
        heads.push(facePatch(shape, true, 0.6, 0.92, vY(0.58), vY(0.605), 0.009, level ? 2 : 6));
      } else if (d.headlights === 2) {
        lenses.push(facePatch(shape, true, 0.0, 0.95, vY(0.6), vY(0.7), 0.006, level ? 3 : 8));
        heads.push(facePatch(shape, true, 0.0, 0.93, vY(0.63), vY(0.655), 0.009, level ? 2 : 8));
      } else {
        lenses.push(facePatch(shape, true, 0.62, 0.94, vY(0.5), vY(0.72), 0.006, level ? 3 : 6));
        for (const [r0, r1] of [[0.64, 0.76], [0.8, 0.92]])
          heads.push(facePatch(shape, true, r0, r1, vY(0.55), vY(0.68), 0.009, level ? 2 : 4));
      }
      if (d.taillights === 1) {
        tails.push(facePatch(shape, false, 0.0, 0.97, vY(0.66), vY(0.72), 0.007, level ? 2 : 10));
        trims.push(facePatch(shape, false, 0.0, 0.97, vY(0.6), vY(0.78), 0.004, level ? 2 : 8));
      } else if (d.taillights === 2) {
        for (const [r0, r1] of [[0.6, 0.74], [0.78, 0.93]])
          tails.push(facePatch(shape, false, r0, r1, vY(0.56), vY(0.72), 0.007, level ? 2 : 4));
      } else {
        tails.push(facePatch(shape, false, 0.52, 0.96, vY(0.6), vY(0.74), 0.007, level ? 2 : 6));
        trims.push(facePatch(shape, false, 0.5, 0.97, vY(0.56), vY(0.78), 0.004, level ? 2 : 6));
      }
      // Lower intake / grille, rear diffuser, side skirts.
      grilles.push(facePatch(shape, true, 0.0, 0.9, vY(0.0) + 0.02, vY(0.36), 0.005, level ? 3 : 8));
      if (d.headlights === 1) grilles.push(facePatch(shape, true, 0.0, 0.6, vY(0.38), vY(0.72), 0.005, level ? 2 : 5));
      trims.push(facePatch(shape, false, 0.15, 0.9, 0.02, vY(0.22), 0.005, level ? 2 : 6));
      trims.push(
        bodyPatch(shape, range(-WHEEL_Z + shape.archR + 0.04, WHEEL_Z - shape.archR - 0.04, level ? 2 : 6), range(vY(0.02), vY(0.13), 2), [1, -1], 0.004),
      );
      if (level === 0) {
        // Door shut lines and window seals read as fine dark lines.
        for (const z of [d.zA - 0.12, d.zB - 0.55])
          if (z > -WHEEL_Z + shape.archR && z < WHEEL_Z - shape.archR)
            trims.push(bodyPatch(shape, [z - 0.004, z + 0.004], range(vY(0.16), vY(0.92), 6), [1, -1], 0.002));
        if (d.sideIntake)
          grilles.push(bodyPatch(shape, range(-WHEEL_Z + shape.archR + 0.08, -WHEEL_Z + shape.archR + 0.55, 4), range(vY(0.3), vY(0.56), 3), [1, -1], 0.003));
        if (d.louvres)
          for (let k = 0; k < 6; k++) {
            const z = d.zC - 0.12 - k * 0.09;
            trims.push(bodyPatch(shape, [z - 0.018, z + 0.018], range(vX(0.55), vX(0.08), 3), [1, -1], 0.003));
          }
      }
      dark(mergeGeometries(lenses)!, 0x161b21);
      add(g, "Light_Head", mergeGeometries(heads)!, M.head);
      add(g, "Light_Tail", mergeGeometries(tails)!, tail);
      dark(mergeGeometries(grilles)!, 0x1b1d20);
      // Reverse lamps sit low on the tail.
      add(g, "Light_Reverse", facePatch(shape, false, 0.3, 0.42, vY(0.5), vY(0.58), 0.008, 2), reverse);
      // Body-hugging livery stripes along the bonnet, roof line and deck.
      const stripeZs = range(-L + d.tailRadius * 0.6, L - d.noseRadius * 0.55, level ? 8 : 24);
      const stripe = add(g, "Livery", bodyPatch(shape, stripeZs, range(vX(0.13), 1, 3), [1], 0.003), livery);
      const stripe2 = add(g, "LiveryTwin", bodyPatch(shape, stripeZs, range(vX(0.32), vX(0.22), 2), [1, -1], 0.003), livery);
      stripe.geometry = mergeGeometries([stripe.geometry, bodyPatch(shape, stripeZs, range(vX(0.13), 1, 3), [-1], 0.003)])!;
      liveries.push(stripe);
      twins.push(stripe2);
      // Splitter, mirrors, exhausts, plates.
      const splitter = new RoundedBoxGeometry(shape.halfWidth(L - 0.3, false) * 1.55, 0.02, 0.22, 1, 0.008);
      splitter.translate(0, d.noseBottomY - 0.012, L - 0.2);
      dark(splitter, 0x101215);
      if (!d.openCage) {
        const mirrors: THREE.BufferGeometry[] = [];
        for (const side of [-1, 1]) {
          const base = shape.cabin(d.zA - 0.14, 0.03, side);
          const head = new RoundedBoxGeometry(0.15, 0.085, 0.1, S, 0.035);
          head.rotateY(side * 0.12);
          head.translate(base.x + side * 0.13, base.y + 0.075, base.z - 0.03);
          const stalk = new RoundedBoxGeometry(0.1, 0.025, 0.04, 1, 0.01);
          stalk.translate(base.x + side * 0.05, base.y + 0.05, base.z);
          mirrors.push(head.toNonIndexed(), stalk.toNonIndexed());
        }
        add(g, "Mirror", mergeGeometries(mirrors)!, bodyPaint);
      }
      if (level === 0) {
        const chromes: THREE.BufferGeometry[] = [],
          darks: THREE.BufferGeometry[] = [];
        for (const x of spec.id === "brutus" ? [-0.62, -0.48, 0.48, 0.62] : [-0.55, 0.55]) {
          const tip = new THREE.CylinderGeometry(0.048, 0.052, 0.16, 14, 1, true);
          tip.rotateX(Math.PI / 2);
          tip.translate(x, d.tailBottomY + 0.05, -L + 0.04);
          chromes.push(tip.toNonIndexed());
          const inner = new THREE.CircleGeometry(0.044, 14);
          inner.rotateY(Math.PI);
          inner.translate(x, d.tailBottomY + 0.05, -L + 0.0);
          darks.push(inner.toNonIndexed());
        }
        // Door handles: small flush chrome bars.
        for (const side of [-1, 1]) {
          const p = shape.point(d.zB - 0.32, vY(0.72), side);
          const handle = new RoundedBoxGeometry(0.02, 0.025, 0.16, 1, 0.008);
          handle.translate(p.x + side * 0.004, p.y - 0.03, p.z);
          chromes.push(handle.toNonIndexed());
        }
        add(g, "Exhaust", mergeGeometries(chromes)!, M.chrome);
        dark(mergeGeometries(darks)!, 0x030303);
        // Interior: dashboard, seats and steering wheel visible through the glass.
        if (!d.openCage) {
          const belt = shape.top(0);
          const parts = [
            new RoundedBoxGeometry(shape.halfWidth(d.zA - 0.3, false) * 1.6, 0.16, 0.36, 2, 0.05).translate(0, belt + 0.02, d.zA - 0.28),
            new RoundedBoxGeometry(0.46, 0.5, 0.5, S, 0.08).translate(0.38, belt - 0.08, d.zB - 0.05),
            new RoundedBoxGeometry(0.46, 0.5, 0.5, S, 0.08).translate(-0.38, belt - 0.08, d.zB - 0.05),
            new THREE.TorusGeometry(0.17, 0.022, 6, 18).rotateX(-0.35).translate(0.38, belt + 0.12, d.zA - 0.52),
          ];
          dark(mergeGeometries(parts.map((p) => p.toNonIndexed()))!, 0x16181b);
        } else {
          const tubes: THREE.BufferGeometry[] = [];
          const belt = shape.top(0);
          for (const x of [-0.62, 0.62]) {
            const curve = new THREE.CatmullRomCurve3([
              new THREE.Vector3(x, belt, d.zC - 0.1),
              new THREE.Vector3(x * 0.92, belt + 0.62, -0.55),
              new THREE.Vector3(x * 0.92, belt + 0.66, 0.2),
              new THREE.Vector3(x, belt, d.zA + 0.15),
            ]);
            tubes.push(new THREE.TubeGeometry(curve, 18, 0.04, 8, false).toNonIndexed());
          }
          for (const z of [-0.55, 0.2]) {
            const cross = new THREE.CylinderGeometry(0.035, 0.035, 1.14, 8);
            cross.rotateZ(Math.PI / 2);
            cross.translate(0, belt + (z > 0 ? 0.66 : 0.62), z);
            tubes.push(cross.toNonIndexed());
          }
          add(g, "Cage", mergeGeometries(tubes)!, M.trim, true).name = "Cage";
          const seats = [0.32, -0.32].map((x) => new RoundedBoxGeometry(0.42, 0.55, 0.45, S, 0.08).translate(x, belt - 0.05, -0.25).toNonIndexed());
          dark(mergeGeometries(seats)!, 0x16181b);
        }
        if (d.hoodScoop) {
          const scoop = new RoundedBoxGeometry(0.5, 0.12, 0.62, S, 0.05);
          scoop.translate(0, shape.top(d.zA + 0.45) + 0.005, d.zA + 0.45);
          dark(scoop, 0x0a0b0d);
        }
        if (d.fin) {
          const fin = new RoundedBoxGeometry(0.03, 0.26, 1.1, 1, 0.012);
          fin.translate(0, shape.top(-1.05) + 0.1, -1.05);
          add(g, "Dorsal_Fin", fin, bodyPaint);
        }
        if (d.rallyLights) {
          const pods: THREE.BufferGeometry[] = [];
          const roof = d.openCage ? shape.top(0) + 0.7 : d.roofY + 0.06;
          for (const x of [-0.45, -0.15, 0.15, 0.45]) {
            const pod = new THREE.CylinderGeometry(0.075, 0.08, 0.06, 16);
            pod.rotateX(Math.PI / 2);
            pod.translate(x, roof, (d.openCage ? 0.25 : d.zR1) - 0.02);
            pods.push(pod.toNonIndexed());
          }
          add(g, "Rally_Light", mergeGeometries(pods)!, M.head);
        }
        // Licence plates.
        for (const front of [true, false]) {
          const plate = new THREE.PlaneGeometry(0.42, 0.1);
          if (!front) plate.rotateY(Math.PI);
          const p = shape.point(shape.zFromE(0.97, front), vY(0.36), 1);
          plate.translate(0, p.y, (front ? 1 : -1) * (L + 0.005));
          add(g, "License_Plate", plate, M.chrome);
        }
      }
      // Spoilers: 0 factory lip, 1 ducktail, 2 sport wing, 3 track wing.
      const deckZ = -L + d.tailRadius * 0.7,
        deckTop = shape.top(deckZ);
      const lip = new RoundedBoxGeometry(shape.halfWidth(deckZ, false) * 1.55, 0.03, 0.12, 1, 0.012);
      lip.rotateX(-0.25);
      lip.translate(0, deckTop + 0.015, deckZ);
      spoilers[0].push(add(g, "Spoiler_Lip", lip, M.trim));
      const duck = new RoundedBoxGeometry(shape.halfWidth(deckZ, false) * 1.7, 0.06, 0.26, 2, 0.025);
      duck.rotateX(-0.32);
      duck.translate(0, deckTop + 0.04, deckZ + 0.05);
      spoilers[1].push(add(g, "Spoiler_Duck", duck, bodyPaint));
      for (const [i, height, span] of [[2, 0.2, 1.55], [3, 0.36, 1.78]] as const) {
        const parts = [new RoundedBoxGeometry(span, 0.04, 0.3, S, 0.015).rotateX(-0.12).translate(0, deckTop + height, deckZ - 0.02)];
        for (const x of [-0.5, 0.5]) parts.push(new RoundedBoxGeometry(0.03, height, 0.12, 1, 0.01).translate(x, deckTop + height / 2, deckZ));
        if (i === 3) for (const x of [-span / 2, span / 2]) parts.push(new RoundedBoxGeometry(0.015, 0.2, 0.38, 1, 0.006).translate(x, deckTop + height + 0.02, deckZ - 0.02));
        spoilers[i].push(add(g, `Spoiler_Wing${i}`, mergeGeometries(parts.map((p) => p.toNonIndexed()))!, M.carbon));
      }
      if (trims.length) dark(mergeGeometries(trims)!, 0x07090b);
      // Dark wheel-well liners fill the arch above each tyre.
      const liners: THREE.BufferGeometry[] = [];
      for (const z of [WHEEL_Z, -WHEEL_Z])
        for (const side of [-1, 1]) {
          const outer = shape.halfWidth(z) - 0.02,
            inner = outer - 0.42,
            liner = new THREE.CylinderGeometry(shape.archR - 0.012, shape.archR - 0.012, outer - inner, level ? 8 : 18, 1, true, 0, Math.PI);
          liner.rotateZ(Math.PI / 2);
          liner.translate(side * (outer + inner) / 2, WHEEL_Y, z);
          liners.push(liner.toNonIndexed());
        }
      dark(mergeGeometries(liners)!, 0x0b0c0d);
      add(g, "Detail", mergeGeometries(details)!, M.detail);
      void det;
      bodyLOD.addLevel(g, level === 0 ? 0 : 28);
    }
    // Far impostor.
    const far = new THREE.Group();
    far.name = "LOD2";
    const farBody = new THREE.BoxGeometry(d.width * 2, d.cowlY - d.sillY, spec.length * 0.98);
    farBody.translate(0, (d.cowlY + d.sillY) / 2, 0);
    add(far, "Impostor", farBody, paintLite);
    const farCabin = new THREE.BoxGeometry(d.width * 1.4, d.roofY - d.cowlY, d.zA - d.zC);
    farCabin.translate(0, (d.roofY + d.cowlY) / 2, (d.zA + d.zC) / 2);
    add(far, "Impostor_Cabin", farCabin, glass);
    bodyLOD.addLevel(far, 130);
    // Contact shadow keeps cars planted even without shadow maps.
    const blob = add(root, "Contact_Shadow", new THREE.PlaneGeometry(d.width * 2 + 0.7, spec.length + 0.8), M.shadow);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    blob.renderOrder = -1;
    // Wheels: transforms on named groups, geometry instanced per left/right pair.
    const wheels: THREE.Group[] = [];
    const trackX = d.width - d.tyre[1] / 2 + 0.035 + d.flare * 0.55;
    for (const [i, [x, z]] of [
      [-trackX, WHEEL_Z],
      [trackX, WHEEL_Z],
      [-trackX, -WHEEL_Z],
      [trackX, -WHEEL_Z],
    ].entries()) {
      const wheel = new THREE.Group();
      wheel.name = ["Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"][i];
      wheel.position.set(x, d.tyre[0] + 0.03, z);
      wheel.rotation.order = "YXZ";
      root.add(wheel);
      wheels.push(wheel);
    }
    const wheelLOD = new THREE.LOD();
    wheelLOD.name = "Wheels_LOD";
    root.add(wheelLOD);
    const rimDesigns: THREE.Object3D[][] = [];
    const flipLeft = new THREE.Matrix4().makeRotationY(Math.PI);
    for (const level of [0, 1]) {
      const group = new THREE.Group();
      const parts = wheelGeometries(d, DETAIL[level].wheelSides, level > 0);
      const make = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string) => {
        const mesh = new THREE.InstancedMesh(geo, mat, 4);
        mesh.name = name;
        mesh.castShadow = premium && name === "Tyre";
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        const m = new THREE.Matrix4();
        const update = () => {
          wheels.forEach((w, k) => {
            w.updateMatrix();
            m.copy(w.matrix);
            if (k % 2 === 0) m.multiply(flipLeft);
            mesh.setMatrixAt(k, m);
          });
          mesh.instanceMatrix.needsUpdate = true;
        };
        mesh.onBeforeRender = update;
        mesh.onBeforeShadow = update;
        update();
        group.add(mesh);
        return mesh;
      };
      make(parts.tyre, M.tyre, "Tyre");
      make(parts.barrel, M.barrel, "Rim_Barrel");
      make(parts.disc, M.disc, "Brake_Disc");
      make(parts.caliper, caliper, "Caliper");
      const designs: THREE.Object3D[] = [];
      // Far wheels only need a dished disc; every design shares it.
      const simple = level ? new THREE.CylinderGeometry(parts.rimR - 0.01, parts.rimR - 0.03, 0.04, 12).rotateZ(Math.PI / 2).translate(parts.h - 0.05, 0, 0) : null;
      for (let k = 0; k < 6; k++) designs.push(make(simple ?? rimFace(k, parts.rimR, parts.h, 8), rim, "Spokes"));
      rimDesigns.push(designs);
      wheelLOD.addLevel(group, level === 0 ? 0 : 28);
    }
    wheelLOD.addLevel(new THREE.Group(), 130);
    // Exhaust flames, underglow, headlight beams and camera sockets.
    const flames: THREE.Mesh[] = [],
      beams: THREE.Mesh[] = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x86bbff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const [i, x] of [-0.55, 0.55].entries()) {
      const socket = new THREE.Object3D();
      socket.name = `Socket_Exhaust_${i ? "R" : "L"}`;
      socket.position.set(x, d.tailBottomY + 0.05, -L - 0.1);
      root.add(socket);
      const f = add(root, "Flame", new THREE.ConeGeometry(0.09, 0.7, 10), flameMat);
      f.rotation.x = -Math.PI / 2;
      f.position.set(x, d.tailBottomY + 0.05, -L - 0.42);
      f.visible = false;
      flames.push(f);
    }
    const underglow = add(
      root,
      "Light_Underglow_Socket",
      new THREE.PlaneGeometry(d.width * 2 + 2.2, spec.length + 2.2),
      new THREE.MeshBasicMaterial({ color: 0xafffd4, map: underglowMap(), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    );
    underglow.rotation.x = -Math.PI / 2;
    // Just above the contact patch so it lights the asphalt instead of sinking into it.
    underglow.position.y = 0.06;
    for (const side of [-1, 1]) {
      const beam = add(root, "Light_Beam", new THREE.PlaneGeometry(2.2, 12), M.beam);
      beam.rotation.x = -Math.PI / 2;
      beam.position.set(side * 0.6, 0.035, L + 5.8);
      beam.visible = false;
      beams.push(beam);
    }
    for (const [name, z, y] of [
      ["Socket_Camera_Hood", d.zA - 0.1, d.cowlY + 0.18],
      ["Socket_Camera_Bumper", L + 0.15, d.noseY - 0.1],
    ] as const) {
      const socket = new THREE.Object3D();
      socket.name = name;
      socket.position.set(0, y, z);
      root.add(socket);
    }
    if (d.ride) root.position.y = d.ride;
    const model: CarModel = {
      root,
      wheels,
      paint,
      tail,
      flames,
      underglow,
      beams,
      setLights(braking, reversing, boosting) {
        tail.emissiveIntensity = braking ? 7 : 1.8;
        reverse.emissiveIntensity = reversing ? 4 : 0;
        for (const f of flames) {
          f.visible = boosting;
          if (boosting) f.scale.y = 0.85 + Math.random() * 0.3;
        }
      },
      setHeadlights(on) {
        beams.forEach((b) => (b.visible = on));
      },
      apply(v) {
        paint.color.set(v.paint);
        paintLite.color.set(v.paint);
        paint.metalness = v.finish === "chrome" ? 1 : v.finish === "metallic" ? 0.6 : v.finish === "pearl" ? 0.35 : 0.08;
        paint.roughness = v.finish === "matte" ? 0.62 : v.finish === "chrome" ? 0.06 : v.finish === "gloss" ? 0.18 : 0.3;
        paint.clearcoat = v.finish === "matte" ? 0 : 1;
        paint.normalScale.setScalar(v.finish === "metallic" || v.finish === "pearl" ? 0.05 : 0);
        paint.iridescence = v.finish === "pearl" ? 0.6 : 0;
        paintLite.metalness = paint.metalness;
        paintLite.roughness = Math.max(0.2, paint.roughness);
        glass.opacity = 0.62 + v.tint * 0.38;
        rim.color.set(v.rimColor);
        caliper.color.set(v.caliper);
        const lum = paint.color.r * 0.3 + paint.color.g * 0.59 + paint.color.b * 0.11;
        livery.color.set(lum > 0.45 ? 0x0d0f12 : 0xf1f3f4);
        spoilers.forEach((list, i) => list.forEach((o) => (o.visible = i === v.spoiler)));
        liveries.forEach((l) => (l.visible = v.livery === "stripe"));
        twins.forEach((l) => (l.visible = v.livery === "twin" || v.livery === "number"));
        const design = Math.max(0, Math.min(5, Number(v.rim.slice(-1)) - 1));
        rimDesigns.forEach((list) => list.forEach((o, i) => (o.visible = i === design)));
        underglow.visible = !!v.underglow;
        (underglow.material as THREE.MeshBasicMaterial).color.set(v.underglow ?? "#afffd4");
      },
    };
    model.apply(visual);
    return model;
  }
}
let underglowTexture: THREE.CanvasTexture | null = null;
/** Soft rounded pool of light: bright under the floor, fading past the body. */
function underglowMap() {
  if (underglowTexture || typeof document === "undefined")
    return underglowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return (underglowTexture = new THREE.CanvasTexture(c));
}
export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  const keep = new Set<THREE.Material>(shared ? Object.values(shared.materials) : []);
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!keep.has(m)) materials.add(m);
    }
  });
  for (const m of materials)
    for (const value of Object.values(m))
      if (value instanceof THREE.Texture && value !== shared?.flake) textures.add(value);
  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
  root.removeFromParent();
}
