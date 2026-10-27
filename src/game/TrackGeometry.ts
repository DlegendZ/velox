import * as THREE from "three";
import type { TrackSpec } from "../data/tracks";
export const TRACK_SECTORS = 12;
export interface TrackPoint {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  yaw: number;
  bank: number;
}
const wrap = (n: number) => ((n % 1) + 1) % 1;
export class TrackGeometry {
  curve: THREE.CatmullRomCurve3;
  points: THREE.Vector3[];
  tangents: THREE.Vector3[] = [];
  curvature: number[] = [];
  widths: number[] = [];
  banks: number[] = [];
  length: number;
  samples: number;
  constructor(
    public spec: TrackSpec,
    public reverse = false,
  ) {
    const control = spec.points.map((p) => [
      p[0],
      p[1],
      0,
      p[3] ?? spec.width,
    ]);
    if (reverse) control.reverse();
    this.curve = new THREE.CatmullRomCurve3(
      control.map(([x, z, y]) => new THREE.Vector3(x, y + 0.04, z)),
      true,
      spec.smoothing ?? "catmullrom",
      0.35,
    );
    this.curve.arcLengthDivisions = 10000;
    this.length = this.curve.getLength();
    this.samples = Math.ceil(this.length / 1.5);
    this.points = this.curve.getSpacedPoints(this.samples);
    for (let i = 0; i <= this.samples; i++) {
      const a = this.points[(i - 1 + this.samples) % this.samples],
        b = this.points[(i + 1) % this.samples];
      this.tangents.push(b.clone().sub(a).normalize());
      const u = this.curve.getUtoTmapping(i / this.samples, 0) * control.length,
        index = Math.floor(u) % control.length,
        f = u - Math.floor(u),
        k = f * f * (3 - 2 * f);
      this.widths.push(
        THREE.MathUtils.lerp(
          control[index][3],
          control[(index + 1) % control.length][3],
          k,
        ) / 2,
      );
    }
    const span = Math.max(1, Math.round((8 * this.samples) / this.length));
    for (let i = 0; i < this.samples; i++) {
      const a = this.points[(i - span + this.samples) % this.samples],
        b = this.points[i],
        c = this.points[(i + span) % this.samples];
      const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
      const product =
        Math.hypot(b.x - a.x, b.z - a.z) *
        Math.hypot(c.x - b.x, c.z - b.z) *
        Math.hypot(c.x - a.x, c.z - a.z);
      this.curvature.push(product > 1e-6 ? (2 * cross) / product : 0);
    }
    const smooth = Math.max(1, Math.round((30 * this.samples) / this.length));
    for (let i = 0; i <= this.samples; i++) {
      let bank = 0;
      for (let j = -smooth; j <= smooth; j++)
        bank += this.curvature[(i + j + this.samples) % this.samples];
      // Roads are flat: cars stay level, so a banked surface only made the
      // body look detached from the asphalt and unsettled the tyres.
      void bank;
      this.banks.push(0);
    }
    if (spec.environment === "coast") {
      const lowest = Math.min(
        ...this.points.map(
          (p, i) => p.y - this.widths[i] * Math.abs(Math.sin(this.banks[i])),
        ),
      );
      // The flat coast road runs on a 4 m seawall so its verges stay clear of the surf.
      const raise = Math.max(0, 4 - lowest);
      this.points.forEach((p) => (p.y += raise));
      this.curve.points.forEach((p) => (p.y += raise));
    }
  }
  private interpolate(values: number[], t: number) {
    const f = wrap(t) * this.samples,
      i = Math.floor(f);
    return THREE.MathUtils.lerp(
      values[i],
      values[(i + 1) % this.samples],
      f - i,
    );
  }
  halfWidthAt(t: number) {
    return this.interpolate(this.widths, t);
  }
  inSection(type: string, t: number) {
    if (this.reverse) t = 1 - t;
    return (
      this.spec.sections?.some(
        (s) =>
          s.type === type &&
          "from" in s &&
          (s.from <= s.to
            ? wrap(t) >= s.from && wrap(t) <= s.to
            : wrap(t) >= s.from || wrap(t) <= s.to),
      ) ?? false
    );
  }
  at(t: number, offset = 0): TrackPoint {
    const f = wrap(t) * this.samples,
      i = Math.min(this.samples - 1, Math.floor(f)),
      k = f - i;
    const point = this.points[i].clone().lerp(this.points[i + 1], k),
      tangent = this.tangents[i]
        .clone()
        .lerp(this.tangents[i + 1], k)
        .normalize();
    const bank = this.interpolate(this.banks, t),
      normal = new THREE.Vector3(tangent.z, 0, -tangent.x)
        .normalize()
        .applyAxisAngle(tangent, bank);
    point.addScaledVector(normal, offset);
    return {
      point,
      tangent,
      normal,
      yaw: Math.atan2(tangent.x, tangent.z),
      bank,
    };
  }
  /** The weighted vertical term disambiguates stacked road decks. */
  nearest(p: THREE.Vector3, hint = -1, flat = false) {
    let best = Infinity,
      index = 0,
      t = 0;
    const weight = flat ? 0 : 4;
    const scan = (from: number, to: number) => {
      for (let j = from; j < to; j++) {
        const i = ((j % this.samples) + this.samples) % this.samples,
          a = this.points[i],
          b = this.points[i + 1],
          dx = b.x - a.x,
          dy = b.y - a.y,
          dz = b.z - a.z;
        const k = THREE.MathUtils.clamp(
          ((p.x - a.x) * dx + weight * (p.y - a.y) * dy + (p.z - a.z) * dz) /
            (dx * dx + weight * dy * dy + dz * dz || 1),
          0,
          1,
        );
        const distance =
          (p.x - a.x - k * dx) ** 2 +
          weight * (p.y - a.y - k * dy) ** 2 +
          (p.z - a.z - k * dz) ** 2;
        if (distance < best) {
          best = distance;
          index = i;
          t = wrap((i + k) / this.samples);
        }
      }
    };
    if (hint >= 0) scan(hint - 50, hint + 51);
    if (hint < 0 || best > 900) {
      best = Infinity;
      scan(0, this.samples);
    }
    return { t, distance: Math.sqrt(best), index };
  }
}
