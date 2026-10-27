import * as THREE from "three";

// Index world triangles near the lane so every 5m sample can test actual geometry.
export function scanCorridor(track) {
  const cell = 10,
    key = (x, z) => `${x},${z}`,
    needed = new Set(),
    grid = new Map(),
    triangles = [];
  const samples = Math.ceil(track.length / 5);
  for (let i = 0; i < samples; i++) {
    const at = track.at(i / samples),
      r = Math.ceil((track.halfWidthAt(i / samples) + 12) / cell),
      cx = Math.floor(at.point.x / cell),
      cz = Math.floor(at.point.z / cell);
    for (let x = cx - r; x <= cx + r; x++)
      for (let z = cz - r; z <= cz + r; z++) needed.add(key(x, z));
  }
  track.root.updateMatrixWorld(true);
  const matrix = new THREE.Matrix4(),
    instance = new THREE.Matrix4(),
    va = new THREE.Vector3(),
    vb = new THREE.Vector3(),
    vc = new THREE.Vector3();
  track.root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    let parent = mesh,
      roof = false;
    while (parent) {
      if (!parent.visible) return;
      if (parent.name === "FinishGantry") roof = true;
      parent = parent.parent;
    }
    roof =
      roof ||
      ["TunnelArch", "TunnelLightStrips", "TunnelLights"].includes(mesh.name);
    const geo = mesh.geometry,
      p = geo.getAttribute("position"),
      index = geo.index,
      count = mesh.isInstancedMesh ? mesh.count : 1;
    for (let inst = 0; inst < count; inst++) {
      matrix.copy(mesh.matrixWorld);
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(inst, instance);
        matrix.multiply(instance);
      }
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        va.fromBufferAttribute(p, index ? index.getX(i) : i).applyMatrix4(
          matrix,
        );
        vb.fromBufferAttribute(
          p,
          index ? index.getX(i + 1) : i + 1,
        ).applyMatrix4(matrix);
        vc.fromBufferAttribute(
          p,
          index ? index.getX(i + 2) : i + 2,
        ).applyMatrix4(matrix);
        const cells = [];
        for (
          let x = Math.floor(Math.min(va.x, vb.x, vc.x) / cell);
          x <= Math.floor(Math.max(va.x, vb.x, vc.x) / cell);
          x++
        )
          for (
            let z = Math.floor(Math.min(va.z, vb.z, vc.z) / cell);
            z <= Math.floor(Math.max(va.z, vb.z, vc.z) / cell);
            z++
          )
            if (needed.has(key(x, z))) cells.push(key(x, z));
        if (!cells.length) continue;
        const n = triangles.length;
        triangles.push({
          a: va.clone(),
          b: vb.clone(),
          c: vc.clone(),
          name: mesh.name || mesh.geometry.type,
          roof,
          allowed:
            mesh.name === "Road" ||
            mesh.name === "Curb" ||
            mesh.userData.roadDecal === true,
        });
        for (const k of cells) {
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(n);
        }
      }
    }
  });
  const ray = new THREE.Ray(),
    target = new THREE.Vector3(),
    down = new THREE.Vector3(0, -1, 0),
    failures = [];
  let downRays = 0,
    horizontalRays = 0,
    overheadHits = 0,
    minOverhead = Infinity;
  const record = (type, t, lat, name, height) => {
    if (failures.length < 200)
      failures.push({ type, t, lateral: lat, object: name, height });
  };
  for (let i = 0; i < samples; i++) {
    const t = i / samples,
      half = track.halfWidthAt(t);
    for (const fraction of [-0.9, -0.45, 0, 0.45, 0.9]) {
      const at = track.at(t, fraction * half);
      ray.set(at.point.clone().add(new THREE.Vector3(0, 8, 0)), down);
      downRays++;
      const hits = [];
      for (const n of grid.get(
        key(Math.floor(at.point.x / cell), Math.floor(at.point.z / cell)),
      ) ?? []) {
        const tri = triangles[n];
        if (
          ray.intersectTriangle(tri.a, tri.b, tri.c, false, target) &&
          target.y >= at.point.y - 0.5 &&
          target.y <= at.point.y + 8
        )
          hits.push({ tri, y: target.y });
      }
      hits.sort((a, b) => b.y - a.y);
      let hit;
      for (const h of hits) {
        const height = h.y - at.point.y;
        if (h.tri.roof && height >= 3.0) {
          overheadHits++;
          minOverhead = Math.min(minOverhead, height);
          continue;
        }
        hit = h;
        break;
      }
      if (!hit || !hit.tri.allowed)
        record(
          "down",
          t,
          fraction * half,
          hit?.tri.name ?? "NO_ROAD",
          hit?.y - at.point.y,
        );
    }
    const a = track
        .at(t)
        .point.clone()
        .add(new THREE.Vector3(0, 1, 0)),
      b = track
        .at((i + 1) / samples)
        .point.clone()
        .add(new THREE.Vector3(0, 1, 0)),
      length = a.distanceTo(b);
    ray.set(a, b.clone().sub(a).normalize());
    horizontalRays++;
    const candidates = new Set();
    for (const p of [a, b])
      for (const n of grid.get(
        key(Math.floor(p.x / cell), Math.floor(p.z / cell)),
      ) ?? [])
        candidates.add(n);
    for (const n of candidates) {
      const tri = triangles[n];
      if (
        ray.intersectTriangle(tri.a, tri.b, tri.c, false, target) &&
        target.distanceTo(a) <= length + 1e-6
      ) {
        record("horizontal", t, 0, tri.name, target.y - track.at(t).point.y);
        break;
      }
    }
  }
  return {
    samples,
    downRays,
    horizontalRays,
    overheadHits,
    minOverhead: Number.isFinite(minOverhead) ? minOverhead : null,
    triangles: triangles.length,
    failures,
  };
}
