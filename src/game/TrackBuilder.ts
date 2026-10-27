import { buildEnvironment } from "./Environment";
import { Terrain } from "./Terrain";
import { buildSections } from "./TrackSections";
import { buildFurniture } from "./TrackFurniture";
import { roadMaterial } from "./SurfaceMaterials";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { TrackSpec } from "../data/tracks";
import { createWallRibbon } from "../physics/Walls";
import { TrackGeometry, TRACK_SECTORS, type TrackPoint } from "./TrackGeometry";
export { TRACK_SECTORS, type TrackPoint };
const ROAD_COLUMNS = [-1, -0.94, -0.32, 0.32, 0.94, 1];
export class Track extends TrackGeometry {
  root = new THREE.Group();
  terrain!: Terrain;
  startLights: THREE.Mesh[] = [];
  colliders: RAPIER.Collider[] = [];
  wallHandles = new Set<number>();
  tokens: THREE.Mesh[] = [];
  speedTraps: THREE.Vector3[] = [];
  animated: ((time: number) => void)[] = [];
  exits: { t: number; side: number }[] = [];
  constructor(
    spec: TrackSpec,
    public world: RAPIER.World,
    reverse = false,
    public weather = "clear",
    public open = false,
  ) {
    super(spec, reverse);
    this.build();
  }
  update(time: number) {
    for (const f of this.animated) f(time);
  }
  /** Road-surface grid, including elevation/bank and the closed-loop seam. */
  roadPatch(
    t0: number,
    t1: number,
    lat0: number,
    lat1: number,
    rows: number,
    cols: number,
    lift = 0.02,
  ) {
    let span = t1 - t0;
    if (span < 0) span += Math.ceil(-span);
    const positions: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    type Vertex = { t: number; lat: number; p: THREE.Vector3 };
    const clip = (
      polygon: Vertex[],
      key: "t" | "lat",
      bound: number,
      sign: number,
    ) => {
      const out: Vertex[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length],
          insideA = (a[key] - bound) * sign >= -1e-10,
          insideB = (b[key] - bound) * sign >= -1e-10;
        if (insideA) out.push(a);
        if (insideA !== insideB) {
          const f = (bound - a[key]) / (b[key] - a[key]);
          out.push({
            t: THREE.MathUtils.lerp(a.t, b.t, f),
            lat: THREE.MathUtils.lerp(a.lat, b.lat, f),
            p: a.p.clone().lerp(b.p, f),
          });
        }
      }
      return out;
    };
    // Split each requested cell on the road's own triangle edges; coarse grids otherwise float on banks.
    for (
      let i = Math.floor(t0 * this.samples);
      i < Math.ceil((t0 + span) * this.samples);
      i++
    ) {
      const make = (row: number, col: number): Vertex => {
        const t = row / this.samples,
          lat = ROAD_COLUMNS[col] * this.halfWidthAt(t);
        return { t, lat, p: this.at(t, lat).point };
      };
      for (let col = 0; col < 5; col++)
        for (const triangle of [
          [make(i, col), make(i + 1, col), make(i, col + 1)],
          [make(i, col + 1), make(i + 1, col), make(i + 1, col + 1)],
        ]) {
          const normal = triangle[1].p
            .clone()
            .sub(triangle[0].p)
            .cross(triangle[2].p.clone().sub(triangle[0].p))
            .normalize();
          for (let row = 0; row < rows; row++)
            for (let column = 0; column < cols; column++) {
              let polygon = clip(triangle, "t", t0 + (span * row) / rows, 1);
              polygon = clip(polygon, "t", t0 + (span * (row + 1)) / rows, -1);
              polygon = clip(
                polygon,
                "lat",
                THREE.MathUtils.lerp(lat0, lat1, column / cols),
                1,
              );
              polygon = clip(
                polygon,
                "lat",
                THREE.MathUtils.lerp(lat0, lat1, (column + 1) / cols),
                -1,
              );
              if (polygon.length < 3) continue;
              const base = positions.length / 3;
              for (const v of polygon) {
                positions.push(
                  ...v.p.clone().addScaledVector(normal, lift).toArray(),
                );
                uvs.push((v.lat - lat0) / (lat1 - lat0), (v.t - t0) / span);
              }
              for (let k = 1; k < polygon.length - 1; k++) {
                if (
                  polygon[k].p
                    .clone()
                    .sub(polygon[0].p)
                    .cross(polygon[k + 1].p.clone().sub(polygon[0].p))
                    .lengthSq() > 1e-12
                )
                  indices.push(base, base + k, base + k + 1);
              }
            }
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }
  isClear(center: THREE.Vector3, halfExtent: number, margin = 0.5) {
    const near = this.nearest(center, -1, true);
    return (
      near.distance - halfExtent >=
      this.halfWidthAt(near.t) +
        0.8 +
        this.sceneryMargin(center, near.t, halfExtent, margin)
    );
  }
  sceneryMargin(
    center: THREE.Vector3,
    t: number,
    halfExtent: number,
    margin = 0.5,
  ) {
    const at = this.at(t),
      side = center.clone().sub(at.point).dot(at.normal),
      curvature =
        this.curvature[Math.floor((((t % 1) + 1) % 1) * this.samples)];
    return halfExtent >= 2.5 &&
      Math.abs(curvature) > 1 / 180 &&
      side * curvature < 0
      ? Math.max(12, margin)
      : margin;
  }
  isExit(t: number, side: number) {
    return (
      this.open &&
      this.exits.some(
        (e) =>
          e.side === side &&
          Math.min(Math.abs(t - e.t), 1 - Math.abs(t - e.t)) * this.length < 14,
      )
    );
  }
  private clearPosition(
    center: THREE.Vector3,
    halfExtent: number,
    margin = 0.5,
  ) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const near = this.nearest(center, -1, true),
        at = this.at(near.t);
      const required =
        this.halfWidthAt(near.t) +
        0.8 +
        this.sceneryMargin(center, near.t, halfExtent, margin) +
        halfExtent;
      if (near.distance >= required + 0.02) return;
      const outward = center.clone().sub(at.point).setY(0);
      if (outward.lengthSq() < 0.01) outward.copy(at.normal);
      center.addScaledVector(
        outward.normalize(),
        Math.max(1, required - near.distance + 0.1),
      );
    }
    // An enclosed infield can have no local free position; move beyond the circuit bounds.
    const bounds = new THREE.Box3().setFromPoints(this.points),
      origin = bounds.getCenter(new THREE.Vector3());
    const direction = center.clone().sub(origin).setY(0).normalize();
    if (direction.lengthSq() < 0.1) direction.set(1, 0, 0);
    const radius =
      bounds.getSize(new THREE.Vector3()).length() / 2 +
      halfExtent +
      this.spec.width +
      margin +
      2;
    const y = center.y;
    center.copy(origin).addScaledVector(direction, radius);
    center.y = y;
  }
  /** All scenery uses its complete transformed footprint, including rotated instances. */
  private enforceClearance() {
    this.root.updateMatrixWorld(true);
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      let parent: THREE.Object3D | null = object;
      while (parent) {
        if (parent.userData.trackFixture) return;
        parent = parent.parent;
      }
      object.name ||= object.geometry.type;
      object.userData.roadside = true;
      object.geometry.computeBoundingBox();
      const bounds = object.geometry.boundingBox!;
      const instance = new THREE.Matrix4(),
        worldMatrix = new THREE.Matrix4(),
        inverse = object.parent!.matrixWorld.clone().invert();
      const place = (matrix: THREE.Matrix4) => {
        const box = bounds.clone().applyMatrix4(matrix),
          center = box.getCenter(new THREE.Vector3());
        const halfExtent =
          Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
        const previous = center.clone();
        this.clearPosition(center, halfExtent);
        const shift = center.sub(previous);
        matrix.elements[12] += shift.x;
        matrix.elements[14] += shift.z;
        return matrix;
      };
      if (object instanceof THREE.InstancedMesh) {
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, instance);
          if (instance.determinant() === 0) continue;
          worldMatrix.multiplyMatrices(object.matrixWorld, instance);
          place(worldMatrix);
          instance.copy(object.matrixWorld).invert().multiply(worldMatrix);
          object.setMatrixAt(i, instance);
        }
        object.instanceMatrix.needsUpdate = true;
        object.computeBoundingSphere();
      } else {
        place(worldMatrix.copy(object.matrixWorld));
        object.matrix.copy(inverse).multiply(worldMatrix);
        object.matrix.decompose(
          object.position,
          object.quaternion,
          object.scale,
        );
        object.updateMatrixWorld();
      }
      if (typeof object.userData.collider === "number") {
        const c = this.world.getCollider(object.userData.collider);
        if (c) {
          const p = object.getWorldPosition(new THREE.Vector3());
          c.setTranslation(p);
        }
      }
    });
  }
  wallPoint(index: number, side: number) {
    const span = Math.max(1, Math.round((8 * this.samples) / this.length)),
      a = this.points[(index - span + this.samples) % this.samples],
      b = this.points[index],
      c = this.points[(index + span) % this.samples];
    const abx = b.x - a.x,
      abz = b.z - a.z,
      bcx = c.x - b.x,
      bcz = c.z - b.z,
      turn = abx * bcz - abz * bcx;
    let offset =
      this.halfWidthAt(index / this.samples) +
      (this.inSection("narrow", index / this.samples) ? 0.3 : 0.8);
    if (side * turn < 0 && Math.abs(turn) > 1e-8) {
      const radius =
        (Math.hypot(abx, abz) *
          Math.hypot(bcx, bcz) *
          Math.hypot(c.x - a.x, c.z - a.z)) /
        (2 * Math.abs(turn));
      offset = Math.min(offset, 0.85 * radius);
    }
    return this.at(index / this.samples, side * offset).point;
  }
  private addCollider(c: RAPIER.ColliderDesc) {
    const collider = this.world.createCollider(c);
    this.colliders.push(collider);
    return collider;
  }
  build() {
    const { environment: env, width } = this.spec;
    const night = env === "neon";
    this.terrain = new Terrain(this, this.world);
    this.root.add(this.terrain.root);
    this.colliders.push(this.terrain.collider);
    if (this.open)
      for (let i = 0; i < 6; i++) {
        let t = (i + 0.5) / 6;
        for (let j = 0; j < 100; j++) {
          if (
            !this.inSection("bridge", t) &&
            !this.inSection("tunnel", t) &&
            this.exits.every(
              (e) => Math.min(Math.abs(t - e.t), 1 - Math.abs(t - e.t)) > 0.025,
            )
          )
            break;
          t = (t + 0.01) % 1;
        }
        this.exits.push({ t, side: i % 2 ? 1 : -1 });
      }
    const vertices: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    const columns = ROAD_COLUMNS;
    for (let i = 0; i <= this.samples; i++) {
      for (let j = 0; j < 6; j++) {
        const at = this.at(
          i / this.samples,
          columns[j] * this.halfWidthAt(i / this.samples),
        );
        vertices.push(at.point.x, at.point.y, at.point.z);
        uvs.push((columns[j] + 1) / 2, (i * this.length) / this.samples / 4);
      }
      if (i < this.samples)
        for (let j = 0; j < 5; j++) {
          const a = i * 6 + j;
          indices.push(a, a + 6, a + 1, a + 1, a + 6, a + 7);
        }
    }
    for (const j of [0, 5]) {
      const base = vertices.length / 3;
      for (let i = 0; i <= this.samples; i++) {
        const index = (i * 6 + j) * 3;
        vertices.push(
          vertices[index],
          vertices[index + 1] - 0.6,
          vertices[index + 2],
        );
        uvs.push(j === 0 ? 0 : 1, (i * this.length) / this.samples / 4);
        if (i < this.samples) {
          const a = i * 6 + j,
            b = (i + 1) * 6 + j;
          indices.push(a, base + i, b, b, base + i, base + i + 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    const paintUV = new Float32Array((vertices.length / 3) * 2);
    for (let i = 0; i <= this.samples; i++)
      for (let j = 0; j < 6; j++) {
        const k = (i * 6 + j) * 2;
        paintUV[k] = (columns[j] + 1) / 2;
        paintUV[k + 1] = (i * this.length) / this.samples / 4;
      }
    geo.setAttribute(
      "roadPaintUV",
      new THREE.Float32BufferAttribute(paintUV, 2),
    );
    const roadWidths = new Float32Array(vertices.length / 3).fill(
      this.spec.width,
    );
    for (let i = 0; i <= this.samples; i++)
      for (let j = 0; j < 6; j++)
        roadWidths[i * 6 + j] = this.halfWidthAt(i / this.samples) * 2;
    geo.setAttribute(
      "roadWidth",
      new THREE.Float32BufferAttribute(roadWidths, 1),
    );
    geo.setIndex(indices);
    geo.computeVertexNormals();
    let groupStart = 0,
      lastMaterial = -1;
    for (let i = 0; i < this.samples; i++) {
      const material = this.inSection("dirt", i / this.samples) ? 1 : 0;
      if (material !== lastMaterial) {
        if (lastMaterial >= 0)
          geo.addGroup(groupStart, i * 30 - groupStart, lastMaterial);
        groupStart = i * 30;
        lastMaterial = material;
      }
    }
    geo.addGroup(groupStart, this.samples * 30 - groupStart, lastMaterial);
    geo.addGroup(this.samples * 30, indices.length - this.samples * 30, 0);
    const texture = this.asphaltTexture();
    const road = new THREE.Mesh(geo, [
      roadMaterial(texture, this.weather, night),
      new THREE.MeshStandardMaterial({
        color: 0x9d7e55,
        map: texture,
        roughness: 0.98,
      }),
    ]);
    road.name = "Road";
    road.userData.trackFixture = true;
    road.receiveShadow = true;
    this.root.add(road);
    this.addCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(vertices),
        new Uint32Array(indices),
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
      ).setFriction(1),
    );
    const dummy = new THREE.Object3D();
    const seg = this.samples;
    const barriers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.42, 1.6, 1),
      new THREE.MeshStandardMaterial({
        color: night ? 0x4b626b : 0xc6bda6,
        metalness: 0.3,
        roughness: 0.55,
      }),
      seg * 2,
    );
    const railGlow = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.05, 0.035, 1),
      new THREE.MeshStandardMaterial({
        color: night ? 0x8fe7d8 : 0xffc474,
        emissive: night ? 0x44a7a4 : 0x89501e,
        emissiveIntensity: night ? 1.5 : 0.1,
      }),
      seg * 2,
    );
    barriers.name = "WallBarriers";
    barriers.userData.trackFixture = true;
    railGlow.userData.trackFixture = true;
    railGlow.name = "WallReflectors";
    const exit = (i: number, side: number) => this.isExit(i / seg, side);
    for (const [j, side] of [-1, 1].entries()) {
      const line = Array.from({ length: seg + 1 }, (_, i) =>
        this.wallPoint(i % seg, side),
      );
      const addRun = (points: THREE.Vector3[], closed = false) => {
        if (points.length < 2) return;
        const wall = createWallRibbon(this.world, points, { closed });
        this.colliders.push(wall);
        this.wallHandles.add(wall.handle);
      };
      if (!this.open) addRun(line, true);
      let run: THREE.Vector3[] = [];
      for (let i = 0; i < seg; i++) {
        const a = line[i],
          b = line[i + 1],
          length = a.distanceTo(b),
          gap = exit(i, side);
        dummy.position.copy(a).lerp(b, 0.5);
        dummy.position.y += 0.5;
        dummy.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0);
        dummy.scale.set(gap ? 0 : 1, gap ? 0 : 1, gap ? 0 : length);
        dummy.updateMatrix();
        barriers.setMatrixAt(i * 2 + j, dummy.matrix);
        dummy.position.y += 0.6;
        dummy.updateMatrix();
        railGlow.setMatrixAt(i * 2 + j, dummy.matrix);
        if (!this.open) continue;
        if (gap) {
          addRun(run);
          run = [];
        } else {
          if (run.length === 0) run.push(a);
          run.push(b);
        }
      }
      if (this.open) addRun(run);
    }
    barriers.geometry.dispose();
    railGlow.geometry.dispose();
    buildFurniture(this);
    dummy.scale.set(1, 1, 1);
    // Checkerboard start line and overhead gantry.
    const start = this.at(0);
    const gantry = new THREE.Group();
    gantry.name = "FinishGantry";
    gantry.position.copy(start.point);
    gantry.rotation.y = start.yaw;
    const steel = new THREE.MeshStandardMaterial({
      color: 0x203038,
      metalness: 0.75,
      roughness: 0.35,
    });
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6, 0.4), steel);
      p.position.set(side * (width / 2 + 1.6), 3, 0);
      p.name = "GantryLeg";
      gantry.add(p);
    }
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(width + 2.3, 1.3, 0.3),
      steel,
    );
    board.userData.trackFixture = true;
    board.name = "GantryOverhead";
    board.position.y = 5.7;
    gantry.add(board);
    const sign = this.textPlane(
      "V E L O X   /   AFTER HOURS",
      night ? "#d6f5a8" : "#fff0ce",
      width,
      0.9,
    );
    sign.userData.trackFixture = true;
    sign.position.set(0, 5.7, -0.17);
    sign.rotation.y = Math.PI;
    gantry.add(sign);
    const sign2 = sign.clone();
    sign2.rotation.y = 0;
    sign2.position.z = 0.17;
    gantry.add(sign2);
    for (let i = 0; i < 5; i++) {
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.21, 10, 8),
        new THREE.MeshStandardMaterial({
          color: 0x451b18,
          emissive: 0xff3020,
          emissiveIntensity: 0,
        }),
      );
      light.position.set((i - 2) * 0.65, 5.75, -0.22);
      light.userData.trackFixture = true;
      light.name = "StartLight";
      gantry.add(light);
      this.startLights.push(light);
    }
    this.root.add(gantry);
    const pixels = new Uint8Array(16 * 2 * 4);
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 16; x++)
        pixels.set(
          (x + y) % 2 ? [18, 23, 27, 255] : [225, 233, 223, 255],
          (y * 16 + x) * 4,
        );
    const checker = new THREE.DataTexture(pixels, 16, 2, THREE.RGBAFormat);
    checker.colorSpace = THREE.SRGBColorSpace;
    checker.magFilter = THREE.NearestFilter;
    checker.needsUpdate = true;
    const checks = new THREE.Mesh(
      this.roadPatch(
        -0.6 / this.length,
        0.6 / this.length,
        -this.halfWidthAt(0),
        this.halfWidthAt(0),
        2,
        16,
      ),
      new THREE.MeshBasicMaterial({
        map: checker,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        depthWrite: false,
      }),
    );
    checks.name = "StartLine";
    checks.userData.trackFixture = true;
    checks.userData.roadDecal = true;
    this.root.add(checks);
    for (let i = 1; i < 12; i++) {
      const at = this.at(i / 12);
      const gate = new THREE.Group();
      gate.position.copy(at.point);
      gate.rotation.y = at.yaw;
      gate.userData.trackFixture = true;
      for (const side of [-1, 1]) {
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 3.3, 0.16),
          new THREE.MeshStandardMaterial({
            color: 0xbcec9c,
            emissive: 0x82ca6f,
            emissiveIntensity: night ? 1.6 : 0.3,
          }),
        );
        bar.name = "CheckpointPost";
        bar.position.set(side * (this.halfWidthAt(i / 12) + 1.6), 1.65, 0);
        bar.scale.set(0.6, 0.8, 0.6);
        gate.add(bar);
      }
      this.root.add(gate);
    }
    this.props();
    if (this.open) {
      for (const t of this.spec.length === "gp"
        ? [0.12, 0.3, 0.46, 0.7, 0.9]
        : [0.2, 0.5, 0.8]) {
        const p = this.at(t);
        this.speedTraps.push(p.point.clone());
        const sign = this.textPlane("SPEED TRAP / 70+", "#d9efa5", 5, 0.8);
        sign.position
          .copy(p.point)
          .addScaledVector(p.normal, -this.spec.width / 2 - 1);
        sign.position.y += 2.4;
        sign.rotation.y = p.yaw;
        this.root.add(sign);
      }
      for (const [t, side] of [
        [0.25, 1],
        [0.65, -1],
        ...(this.spec.length === "gp"
          ? [
              [0.12, -1],
              [0.88, 1],
            ]
          : []),
      ]) {
        const p = this.at(t, side * 20),
          q = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(-0.18, p.yaw, 0),
          );
        const ramp = new THREE.Mesh(
          new THREE.BoxGeometry(6, 0.5, 12),
          new THREE.MeshStandardMaterial({
            color: 0x718b81,
            metalness: 0.4,
            roughness: 0.6,
          }),
        );
        this.clearPosition(p.point, Math.hypot(3, 6));
        ramp.name = "Ramp";
        ramp.position.copy(p.point);
        ramp.position.y = this.terrain.heightAt(p.point.x, p.point.z) + 0.9;
        ramp.quaternion.copy(q);
        ramp.receiveShadow = true;
        this.root.add(ramp);
        ramp.userData.collider = this.addCollider(
          RAPIER.ColliderDesc.cuboid(3, 0.25, 6)
            .setTranslation(p.point.x, ramp.position.y, p.point.z)
            .setRotation(q),
        ).handle;
      }
    }
    const tokenCount = this.spec.length === "gp" ? 30 : 16;
    for (let i = 0; i < tokenCount; i++) {
      const p = this.at(
        (i + 0.5) / tokenCount,
        (i % 2 ? 1 : -1) * width * 0.27,
      );
      const token = new THREE.Mesh(
        new THREE.TorusGeometry(0.65, 0.12, 6, 20),
        new THREE.MeshStandardMaterial({
          color: 0xe8ff9a,
          emissive: 0x9bda4f,
          emissiveIntensity: 1.4,
          metalness: 0.8,
          roughness: 0.3,
        }),
      );
      token.position.copy(p.point);
      token.position.y += 1.1;
      token.name = "Token";
      token.userData.trackFixture = true;
      token.userData.collected = false;
      this.tokens.push(token);
      this.root.add(token);
      token.visible = false;
    }
    buildSections(this);
    this.enforceClearance();
    this.groundScenery();
  }
  private groundScenery() {
    this.root.updateMatrixWorld(true);
    this.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.userData.roadside) return;
      const terrainOffset = (x: number, z: number) =>
        this.terrain.heightAt(x, z) -
        (o.parent === this.root
          ? 0
          : o.parent!.getWorldPosition(new THREE.Vector3()).y);
      if (o instanceof THREE.InstancedMesh) {
        const m = new THREE.Matrix4();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          m.elements[13] += terrainOffset(m.elements[12], m.elements[14]);
          o.setMatrixAt(i, m);
        }
        o.instanceMatrix.needsUpdate = true;
      } else {
        const p = o.getWorldPosition(new THREE.Vector3());
        if (o.name === "Ramp")
          o.position.y = this.terrain.heightAt(p.x, p.z) + 0.9;
        else o.position.y += terrainOffset(p.x, p.z);
        if (typeof o.userData.collider === "number")
          this.world
            .getCollider(o.userData.collider)
            ?.setTranslation(o.getWorldPosition(new THREE.Vector3()));
      }
    });
  }
  gripAt(t: number) {
    let grip = 1;
    for (const s of this.spec.sections ?? [])
      if (s.type === "dirt" && this.inSection("dirt", t))
        grip = Math.min(grip, s.grip);
    return grip;
  }
  setStartLights(countdown: number) {
    this.startLights.forEach((l, i) => {
      const m = l.material as THREE.MeshStandardMaterial;
      m.emissive.set(countdown <= 0 ? 0x83ff3d : 0xff3020);
      m.emissiveIntensity =
        countdown <= 0 || i < Math.ceil((3 - countdown) / 0.6) ? 2 : 0;
    });
  }
  props() {
    const env = this.spec.environment,
      night = env === "neon",
      coast = env === "coast",
      width = this.spec.width;
    let seed = this.spec.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const dummy = new THREE.Object3D();
    // Keeps scenery off the asphalt: rejects positions within `clear` metres of the centreline.
    const offTrack = (p: THREE.Vector3, clear: number) =>
      this.nearest(p).distance > clear;
    this.curbs();
    buildEnvironment(this, random);
    const posts = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.07, 0.1, 7, 6),
      new THREE.MeshStandardMaterial({ color: 0x45535b, metalness: 0.65 }),
      64,
    );
    const lamps = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.5, 0.12, 0.4),
      new THREE.MeshStandardMaterial({
        color: night ? 0xd4f3fa : 0xffe0ad,
        emissive: night ? 0xa4d1e8 : 0xffd9a4,
        emissiveIntensity: night ? 3 : 0.2,
      }),
      64,
    );
    // Additive light pools replace per-lamp point lights: same look, no per-pixel light cost.
    const poolPatches: THREE.BufferGeometry[] = [];
    const poolMaterial = new THREE.MeshBasicMaterial({
      map: this.glowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: night ? 0.8 : 0.14,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      vertexColors: true,
    });
    for (let i = 0; i < 64; i++) {
      const side = i % 2 ? 1 : -1,
        t = i / 64,
        at = this.at(t, side * (this.halfWidthAt(t) + 2.2)),
        head = this.at(t, side * (this.halfWidthAt(t) + 0.4));
      // Tunnels have their own ceiling strips: no street lamps (or their light
      // pools) inside them or at the portals, where posts would pierce the roof.
      if (
        [-14, 0, 14].some((d) => this.inSection("tunnel", t + d / this.length))
      ) {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        posts.setMatrixAt(i, dummy.matrix);
        lamps.setMatrixAt(i, dummy.matrix);
        continue;
      }
      // Posts stand upright on the verge; the luminaire reaches out over the kerb.
      dummy.position.set(at.point.x, at.point.y + 3.5, at.point.z);
      dummy.rotation.set(0, at.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      posts.setMatrixAt(i, dummy.matrix);
      // The luminaire is an arm from the post top out over the kerb, so it
      // never floats beside the pole.
      dummy.position.set(
        (at.point.x + head.point.x) / 2,
        at.point.y + 7,
        (at.point.z + head.point.z) / 2,
      );
      dummy.rotation.set(0, at.yaw + Math.PI / 2, 0);
      dummy.scale.set(
        (Math.hypot(head.point.x - at.point.x, head.point.z - at.point.z) +
          0.5) /
          1.5,
        1,
        1,
      );
      dummy.updateMatrix();
      lamps.setMatrixAt(i, dummy.matrix);
      const half = Math.min(
          ...Array.from({ length: 7 }, (_, row) =>
            this.halfWidthAt(t + ((row / 6 - 0.5) * 13) / this.length),
          ),
        ),
        center = side * (this.halfWidthAt(t) - 2.5);
      const lo = Math.max(-half + 0.03, center - 6.5),
        hi = Math.min(half - 0.03, center + 6.5);
      const patch = this.roadPatch(
        t - 6.5 / this.length,
        t + 6.5 / this.length,
        lo,
        hi,
        6,
        6,
        0.045,
      );
      const uv = patch.getAttribute("uv"),
        color = new THREE.Color(
          night ? (i % 16 > 7 ? 0xd8b2fa : 0x8fd8dd) : 0xffd9a4,
        ),
        colors = [];
      for (let j = 0; j < uv.count; j++) {
        uv.setX(
          j,
          (THREE.MathUtils.lerp(lo, hi, uv.getX(j)) - center + 6.5) / 13,
        );
        colors.push(color.r, color.g, color.b);
      }
      patch.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      poolPatches.push(patch);
    }
    posts.name = "LampPost";
    lamps.name = "LampHead";
    // Authored in world height already: exclude from terrain grounding.
    posts.userData.trackFixture = lamps.userData.trackFixture = true;
    const pools = new THREE.Mesh(mergeGeometries(poolPatches), poolMaterial);
    let patchOffset = 0;
    pools.userData.patchRanges = poolPatches.map((p) => {
      const range = { start: patchOffset, count: p.index!.count };
      patchOffset += range.count;
      return range;
    });
    poolPatches.forEach((p) => p.dispose());
    pools.name = "LightPool";
    pools.userData.trackFixture = true;
    pools.userData.roadDecal = true;
    this.root.add(posts, lamps, pools);
    this.grandstands();
    const slogans = [
      "AFTER HOURS",
      "STAY RESTLESS",
      "NO CURFEW",
      "TAKE THE LONG WAY",
      "VELOCITY CLUB",
    ];
    for (let i = 0; i < 10; i++) {
      const at = this.at((i + 0.35) / 10, (i % 2 ? 1 : -1) * (width / 2 + 7));
      const sign = this.textPlane(
        slogans[i % 5],
        i % 2 ? "#b2e2dd" : "#d6d7aa",
        9,
        2,
      );
      sign.position.copy(at.point);
      sign.position.y = 4;
      sign.rotation.y = at.yaw + (i % 2 ? -Math.PI / 2 : Math.PI / 2);
      this.root.add(sign);
    }
  }
  /** Red/white rumble strips: continuous ribbons that hug the asphalt through real corners. */
  curbs() {
    const n = this.samples,
      step = this.length / n;
    // Smooth curvature over ~12 m so short wiggles in the spline don't spawn curbs.
    const span = Math.max(1, Math.round(6 / step)),
      smooth: number[] = [];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -span; k <= span; k++)
        sum += Math.abs(this.curvature[(i + k + n) % n]);
      smooth.push(sum / (2 * span + 1));
    }
    const corner = smooth.map(
      (c, i) =>
        c > 1 / 110 &&
        !this.inSection("dirt", i / n) &&
        !this.inSection("tunnel", i / n),
    );
    // Extend each corner by 8 m either side so curbs lead in and out.
    const pad = Math.round(8 / step),
      marked = corner.map((_, i) => {
        for (let k = -pad; k <= pad; k++)
          if (corner[(i + k + n) % n]) return true;
        return false;
      });
    const stripes = new Uint8Array(4 * 2 * 4);
    for (let i = 0; i < 8; i++) {
      const red = i < 4;
      stripes.set(red ? [206, 44, 40, 255] : [232, 234, 228, 255], i * 4);
    }
    const tex = new THREE.DataTexture(stripes, 1, 8, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const positions: number[] = [],
      uvs: number[] = [],
      index: number[] = [];
    const profile = [
      [-0.95, 0.012],
      [-0.85, 0.04],
      [-0.05, 0.06],
      [0.05, 0.02],
    ];
    for (const side of [-1, 1]) {
      let i = 0;
      while (i < n) {
        if (!marked[i]) {
          i++;
          continue;
        }
        let j = i;
        while (j < n && marked[j]) j++;
        const base = positions.length / 3;
        for (let k = i; k <= Math.min(j, n); k++) {
          const t = k / n,
            half = this.halfWidthAt(t);
          for (const [x, y] of profile) {
            const p = this.at(t, side * (half + x)).point;
            positions.push(p.x, p.y + y, p.z);
            uvs.push((x + 0.95) / 1, (k * step) / 3);
          }
          if (k < Math.min(j, n))
            for (let q = 0; q < profile.length - 1; q++) {
              const a = base + (k - i) * profile.length + q,
                b = a + profile.length;
              if (side > 0) index.push(a, b, a + 1, a + 1, b, b + 1);
              else index.push(a, a + 1, b, a + 1, b + 1, b);
            }
        }
        i = j;
      }
    }
    if (!index.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const curbs = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.62,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    curbs.name = "Curb";
    curbs.userData.trackFixture = true;
    curbs.receiveShadow = true;
    this.root.add(curbs);
  }
  private startStraight() {
    let bestT = 0,
      bestLength = 0;
    for (let i = 0; i < this.samples; i++) {
      const t = i / this.samples;
      if (t > 0.15 && t < 0.85) continue;
      let length = 0;
      for (let j = 0; j < this.samples * 0.15; j++) {
        const a = this.tangents[(i + j) % this.samples],
          b = this.tangents[(i + j + 1) % this.samples];
        const curvature =
          Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) /
          (this.length / this.samples);
        if (curvature >= 0.01) break;
        length += this.length / this.samples;
      }
      if (length > bestLength) {
        bestLength = length;
        bestT = (t + length / this.length / 2) % 1;
      }
    }
    return bestLength >= 60 ? bestT : 0;
  }
  /** Start/finish grandstands with an instanced crowd. */
  grandstands() {
    const width = this.spec.width,
      start = this.at(this.startStraight()),
      group = new THREE.Group();
    group.name = "Grandstands";
    group.position.copy(start.point);
    group.rotation.y = start.yaw;
    const concrete = new THREE.MeshStandardMaterial({
      color: 0x59646b,
      roughness: 0.8,
    });
    const crowd = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.45, 0.8, 0.35),
      new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      480,
    );
    const dummy = new THREE.Object3D();
    let n = 0,
      seed = 7;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (const side of [-1, 1]) {
      for (let row = 0; row < 4; row++) {
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 0.9 + row * 0.9, 34),
          concrete,
        );
        const x = side * (width / 2 + 24 + row * 1.4);
        step.name = "GrandstandRow";
        step.position.set(x, (0.9 + row * 0.9) / 2, 0);
        step.receiveShadow = true;
        group.add(step);
        for (let k = 0; k < 60; k++) {
          if (random() < 0.15 || n >= 480) continue;
          dummy.position.set(
            x + (random() - 0.5) * 0.3,
            0.9 + row * 0.9 + 0.4,
            -16.5 + k * 0.55,
          );
          dummy.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
          dummy.scale.set(1, 0.85 + random() * 0.3, 1);
          dummy.updateMatrix();
          crowd.setMatrixAt(n, dummy.matrix);
          crowd.setColorAt(
            n++,
            new THREE.Color().setHSL(random(), 0.45, 0.35 + random() * 0.3),
          );
        }
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(7, 0.2, 35), concrete);
      roof.name = "GrandstandRoof";
      roof.position.set(side * (width / 2 + 26.3), 6.2, 0);
      group.add(roof);
    }
    crowd.name = "GrandstandCrowd";
    crowd.count = n;
    group.add(crowd);
    this.root.add(group);
    let crowdBase: Float32Array | null = null;
    this.animated.push((time) => {
      crowdBase ??= new Float32Array(crowd.instanceMatrix.array);
      // Gentle bounce: rewrite only the Y translation of each spectator.
      const a = crowd.instanceMatrix.array as Float32Array;
      for (let i = 0; i < n; i++)
        a[i * 16 + 13] =
          crowdBase[i * 16 + 13] +
          Math.max(0, Math.sin(time * 6 + i * 1.7)) * 0.12;
      crowd.instanceMatrix.needsUpdate = true;
    });
  }
  glowTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const c = canvas.getContext("2d")!,
      g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.35, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  holoTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#000";
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = "rgba(255,255,255,0.9)";
    c.lineWidth = 6;
    c.strokeRect(6, 6, 244, 244);
    c.font = "900 64px Arial";
    c.textAlign = "center";
    c.fillStyle = "#fff";
    c.fillText("VELOX", 128, 110);
    c.font = "600 22px Arial";
    c.fillText("OWN THE NIGHT", 128, 150);
    for (let y = 0; y < 256; y += 4) {
      c.fillStyle = "rgba(0,0,0,0.35)";
      c.fillRect(0, y, 256, 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  waterNormals() {
    const size = 128,
      canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const c = canvas.getContext("2d")!,
      image = c.createImageData(size, size);
    const h = (x: number, y: number) =>
      Math.sin((x / size) * Math.PI * 8) * 0.5 +
      Math.sin(((x + y * 2) / size) * Math.PI * 6) * 0.35 +
      Math.sin(((y - x * 0.5) / size) * Math.PI * 14) * 0.15;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = h(x + 1, y) - h(x - 1, y),
          dy = h(x, y + 1) - h(x, y - 1),
          i = (y * size + x) * 4;
        image.data[i] = 128 + dx * 90;
        image.data[i + 1] = 128 + dy * 90;
        image.data[i + 2] = 255;
        image.data[i + 3] = 255;
      }
    c.putImageData(image, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(40, 70);
    return tex;
  }
  textPlane(text: string, color: string, width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 192;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#10202a";
    c.fillRect(0, 0, 1024, 192);
    c.strokeStyle = color;
    c.lineWidth = 4;
    c.strokeRect(8, 8, 1008, 176);
    c.font = "bold 54px Arial";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = color;
    c.fillText(text, 512, 96);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }),
    );
  }
  asphaltTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const c = canvas.getContext("2d")!;
    const image = c.createImageData(128, 128);
    let seed = 42;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const v = 80 + (seed % 50);
      image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
    c.putImageData(image, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
