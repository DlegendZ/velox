import * as THREE from "three";
import type { Track } from "./TrackBuilder";

function ribbon(
  track: Track,
  side: number,
  start: number,
  end: number,
  profile: number[][],
  material: THREE.Material,
  name: string,
  offset = 0,
) {
  const p: number[] = [],
    ix: number[] = [],
    uv: number[] = [];
  for (let i = start; i <= end; i++) {
    const t = i / track.samples,
      at = track.at(t),
      wall = track.wallPoint(i % track.samples, side);
    for (const [x, y] of profile) {
      const v = wall.clone().addScaledVector(at.normal, side * (x + offset));
      p.push(v.x, v.y + y, v.z);
      uv.push((i * track.length) / track.samples / 4, y);
    }
    if (i < end)
      for (let j = 0; j < profile.length - 1; j++) {
        const k = (i - start) * profile.length + j;
        ix.push(
          k,
          k + profile.length,
          k + 1,
          k + 1,
          k + profile.length,
          k + profile.length + 1,
        );
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ix);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.name = name;
  mesh.userData.trackFixture = true;
  mesh.receiveShadow = true;
  track.root.add(mesh);
}
export function buildFurniture(track: Track) {
  const concrete = new THREE.MeshStandardMaterial({
    color: track.spec.environment === "neon" ? 0x7a848c : 0xa7a08c,
    roughness: 0.83,
    side: THREE.DoubleSide,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0xb8bec0,
    metalness: 0.8,
    roughness: 0.36,
    side: THREE.DoubleSide,
  });
  const stone = new THREE.MeshStandardMaterial({
    color: 0xa89c82,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const sidewalk = new THREE.MeshStandardMaterial({
    color: 0x656a6b,
    roughness: 0.96,
    side: THREE.DoubleSide,
  });
  for (const material of [concrete, steel, stone])
    material.onBeforeCompile = (shader) => {
      shader.vertexShader =
        "varying float vBarrierHeight;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvBarrierHeight=uv.y;",
      );
      shader.fragmentShader =
        "varying float vBarrierHeight;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\nfloat reflector=step(.9,vBarrierHeight)*step(vBarrierHeight,.95);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.8,.86,.65),reflector);totalEmissiveRadiance+=reflector*vec3(.12,.16,.08);",
      );
    };
  const jersey = [
    [0, -0.3],
    [0.42, -0.3],
    [0.42, 0.1],
    [0.2, 0.7],
    [0.2, 1.3],
    [0, 1.3],
    [0, -0.3],
  ];
  const wbeam = [
    [0, 0.58],
    [0.12, 0.65],
    [0, 0.76],
    [0.12, 0.88],
    [0, 0.98],
    [0.08, 1.03],
  ];
  const lowStone = [
    [0, -0.3],
    [0.55, -0.3],
    [0.55, 0.85],
    [0, 0.85],
    [0, -0.3],
  ];
  const chunk = Math.ceil(200 / (track.length / track.samples));
  const gap = (i: number, side: number) =>
    track.isExit(i / track.samples, side);
  for (const side of [-1, 1]) {
    let start = 0;
    while (start < track.samples) {
      if (gap(start, side)) {
        start++;
        continue;
      }
      const at = start / track.samples,
        parapet =
          track.inSection("bridge", at) || track.inSection("tunnel", at),
        city = track.spec.environment === "neon",
        isStone = track.spec.environment === "coast" && side === -1;
      const kind = parapet || city ? "concrete" : isStone ? "stone" : "steel";
      let end = start + 1;
      while (end < track.samples && end - start < chunk && !gap(end, side)) {
        const t = end / track.samples,
          k =
            track.inSection("bridge", t) || track.inSection("tunnel", t) || city
              ? "concrete"
              : isStone
                ? "stone"
                : "steel";
        if (k !== kind) break;
        end++;
      }
      ribbon(
        track,
        side,
        start,
        end,
        kind === "concrete" ? jersey : kind === "stone" ? lowStone : wbeam,
        kind === "concrete" ? concrete : kind === "stone" ? stone : steel,
        "Barrier_" + kind,
      );
      if (city && !parapet)
        ribbon(
          track,
          side,
          start,
          end,
          [
            [0.55, -0.1],
            [0.55, 0.15],
            [4.55, 0.15],
            [4.55, -0.1],
          ],
          sidewalk,
          "Sidewalk",
        );
      start = end;
    }
  }
  if (track.spec.environment !== "neon") {
    const count = Math.ceil(track.length / 6) * 2,
      posts = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.16, 0.85, 0.16),
        new THREE.MeshStandardMaterial({
          color: track.spec.environment === "canyon" ? 0x65513b : 0x7c8386,
          roughness: 0.85,
        }),
        count,
      ),
      dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const t = Math.floor(i / 2) / (count / 2),
        side = i % 2 ? 1 : -1,
        p = track.wallPoint(Math.floor(t * track.samples), side);
      dummy.position.copy(p);
      dummy.position.y += 0.25;
      dummy.scale.setScalar(gap(Math.floor(t * track.samples), side) ? 0 : 1);
      dummy.updateMatrix();
      posts.setMatrixAt(i, dummy.matrix);
    }
    posts.name = "Guardrail_Posts";
    posts.userData.trackFixture = true;
    track.root.add(posts);
  }
}
