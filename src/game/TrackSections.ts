import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";
import type { Track } from "./TrackBuilder";
export function buildSections(track: Track) {
  const root = new THREE.Group();
  root.name = "TrackSections";
  root.userData.trackFixture = true;
  const concrete = new THREE.MeshStandardMaterial({
      color: 0x50565b,
      roughness: 0.86,
      side: THREE.DoubleSide,
    }),
    glow = new THREE.MeshStandardMaterial({
      color: 0xf0dfba,
      emissive: 0xffdba8,
      emissiveIntensity: 2.5,
    });
  const tunnelMat = new THREE.MeshStandardMaterial({
    color: 0x9aa1a6,
    roughness: 0.55,
    metalness: 0.05,
    // Bounce light from the strip lamps; tunnels should read lit, not black.
    emissive: 0x4a4236,
    emissiveIntensity: 0.9,
    side: THREE.DoubleSide,
  });
  const stripMat = new THREE.MeshStandardMaterial({
    color: 0xfff1d6,
    emissive: 0xffd9a0,
    emissiveIntensity: 1.35,
    side: THREE.DoubleSide,
  });
  const strips: THREE.BufferGeometry[] = [];
  const deck: number[][][] = [],
    deckRows: number[] = [];
  const shells: THREE.BufferGeometry[] = [],
    pillars: THREE.Matrix4[] = [],
    lights: THREE.Matrix4[] = [],
    slabs: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < track.samples; i++) {
    const t = i / track.samples,
      at = track.at(t),
      step = track.length / track.samples;
    if (track.inSection("tunnel", t)) {
      const count = 10,
        radius = track.halfWidthAt(t) + 2;
      for (let j = 0; j < count; j++) {
        const a = (j / count) * Math.PI,
          b = ((j + 1) / count) * Math.PI,
          next = track.at((i + 1) / track.samples);
        const points = [
          at.point.clone().addScaledVector(at.normal, Math.cos(a) * radius),
          at.point.clone().addScaledVector(at.normal, Math.cos(b) * radius),
          next.point.clone().addScaledVector(next.normal, Math.cos(b) * radius),
          next.point.clone().addScaledVector(next.normal, Math.cos(a) * radius),
        ];
        points[0].y += Math.sin(a) * 6;
        points[1].y += Math.sin(b) * 6;
        points[2].y += Math.sin(b) * 6;
        points[3].y += Math.sin(a) * 6;
        const g = new THREE.BufferGeometry();
        g.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            points.flatMap((p) => p.toArray()),
            3,
          ),
        );
        g.setIndex([0, 1, 2, 0, 2, 3]);
        g.computeVertexNormals();
        shells.push(g);
      }
      // Continuous light strips along both upper walls.
      const next = track.at((i + 1) / track.samples);
      for (const [a, b] of [
        [0.2, 0.235],
        [0.765, 0.8],
      ].map(([x, y]) => [x * Math.PI, y * Math.PI])) {
        const r = radius - 0.06;
        const quad = [
          at.point
            .clone()
            .addScaledVector(at.normal, Math.cos(a) * r)
            .setY(at.point.y + Math.sin(a) * 6 * (r / radius)),
          at.point
            .clone()
            .addScaledVector(at.normal, Math.cos(b) * r)
            .setY(at.point.y + Math.sin(b) * 6 * (r / radius)),
          next.point
            .clone()
            .addScaledVector(next.normal, Math.cos(b) * r)
            .setY(next.point.y + Math.sin(b) * 6 * (r / radius)),
          next.point
            .clone()
            .addScaledVector(next.normal, Math.cos(a) * r)
            .setY(next.point.y + Math.sin(a) * 6 * (r / radius)),
        ];
        const g = new THREE.BufferGeometry();
        g.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            quad.flatMap((p) => p.toArray()),
            3,
          ),
        );
        g.setIndex([0, 1, 2, 0, 2, 3]);
        g.computeVertexNormals();
        strips.push(g);
      }
      if (i % Math.max(1, Math.round(12 / step)) === 0)
        for (const side of [-1, 1]) {
          dummy.position
            .copy(at.point)
            .addScaledVector(at.normal, side * (track.halfWidthAt(t) + 0.8));
          dummy.position.y += 3;
          dummy.rotation.set(0, at.yaw, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          lights.push(dummy.matrix.clone());
        }
    }
    if (track.inSection("bridge", t)) {
      // Continuous deck section (follows bank and curvature, no stepping).
      const half = track.halfWidthAt(t) + 1.3;
      const l = track.at(t, -half).point,
        r = track.at(t, half).point;
      deck.push([
        [l.x, l.y - 0.05, l.z],
        [l.x, l.y - 1.2, l.z],
        [r.x, r.y - 1.2, r.z],
        [r.x, r.y - 0.05, r.z],
      ]);
      deckRows.push(i);
      if (i % Math.max(1, Math.round(30 / step)) === 0)
        for (const side of [-1, 1]) {
          const p = track.at(t, side * (track.halfWidthAt(t) + 1.5)).point,
            bottom = track.terrain.heightAt(p.x, p.z),
            height = Math.max(2, p.y - bottom);
          dummy.position.set(p.x, bottom + height / 2, p.z);
          dummy.rotation.set(0, at.yaw, 0);
          dummy.scale.set(1.1, height, 1.1);
          dummy.updateMatrix();
          pillars.push(dummy.matrix.clone());
        }
    }
  }
  if (shells.length) {
    // Weld shared edges so the arch has no hairline gaps between quads.
    const raw = mergeGeometries(shells)!;
    raw.deleteAttribute("normal");
    const merged = mergeVertices(raw, 1e-3);
    raw.dispose();
    merged.computeVertexNormals();
    shells.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, tunnelMat);
    mesh.name = "TunnelArch";
    mesh.receiveShadow = true;
    root.add(mesh);
    const lit = mergeGeometries(strips)!;
    strips.forEach((g) => g.dispose());
    const glowStrips = new THREE.Mesh(lit, stripMat);
    glowStrips.name = "TunnelLightStrips";
    root.add(glowStrips);
  }
  const instances = (
    name: string,
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    matrices: THREE.Matrix4[],
  ) => {
    if (!matrices.length) {
      geo.dispose();
      return;
    }
    const mesh = new THREE.InstancedMesh(geo, material, matrices.length);
    mesh.name = name;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.receiveShadow = true;
    root.add(mesh);
  };
  if (deck.length > 1) {
    const pos: number[] = [],
      idx: number[] = [];
    deck.forEach((ring, k) => {
      for (const v of ring) pos.push(...v);
      // Only join consecutive samples so separate bridges stay separate.
      if (k > 0 && deckRows[k] === deckRows[k - 1] + 1)
        for (let q = 0; q < 3; q++) {
          const a = (k - 1) * 4 + q,
            b = k * 4 + q;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const bridgeDeck = new THREE.Mesh(geo, concrete);
    bridgeDeck.name = "BridgeDeck";
    bridgeDeck.receiveShadow = true;
    root.add(bridgeDeck);
  }
  void slabs;
  instances("BridgePillars", new THREE.BoxGeometry(1, 1, 1), concrete, pillars);
  instances("TunnelLights", new THREE.BoxGeometry(0.12, 0.12, 3), glow, lights);
  for (const s of track.spec.sections ?? [])
    if ("at" in s) {
      const t = track.reverse ? 1 - s.at : s.at,
        at = track.at(t);
      if (s.type === "boost") {
        // Patch UVs run u across the lane and v along the direction of travel,
        // so the chevrons are drawn pointing up the texture (straight ahead).
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 256;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#c6ff3d";
        for (let i = 0; i < 3; i++) {
          const y = 20 + i * 76;
          ctx.beginPath();
          ctx.moveTo(10, y + 56);
          ctx.lineTo(64, y);
          ctx.lineTo(118, y + 56);
          ctx.lineTo(118, y + 80);
          ctx.lineTo(64, y + 24);
          ctx.lineTo(10, y + 80);
          ctx.closePath();
          ctx.fill();
        }
        const map = new THREE.CanvasTexture(canvas);
        map.anisotropy = 8;
        const plane = new THREE.Mesh(
          track.roadPatch(
            t - 3 / track.length,
            t + 3 / track.length,
            -Math.min(3.2, track.halfWidthAt(t) * 0.45),
            Math.min(3.2, track.halfWidthAt(t) * 0.45),
            6,
            4,
            0.04,
          ),
          new THREE.MeshStandardMaterial({
            map,
            emissiveMap: map,
            color: 0xb9ff43,
            emissive: 0x8fff36,
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
          }),
        );
        plane.name = "BoostPad";
        plane.userData.roadDecal = true;
        root.add(plane);
        track.animated.push(
          (time) =>
            ((plane.material as THREE.MeshStandardMaterial).emissiveIntensity =
              0.55 + Math.sin(time * 6) * 0.25),
        );
      } else {
        const sign = track.textPlane("CREST  › › ›", "#f2cf84", 4, 1);
        sign.position.copy(track.at(t, track.halfWidthAt(t) + 4).point);
        sign.position.y += 2;
        sign.rotation.y = at.yaw;
        sign.userData.trackFixture = true;
        track.root.add(sign);
      }
    }
  track.root.add(root);
}
