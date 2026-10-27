import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Track } from "./TrackBuilder";
import { strataMaterial } from "./SurfaceMaterials";
type Placement = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  yaw?: number;
};
function instances(
  track: Track,
  name: string,
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  positions: Placement[],
  foliage = false,
) {
  const mesh = new THREE.InstancedMesh(geo, material, positions.length),
    dummy = new THREE.Object3D();
  mesh.name = name;
  positions.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.scale.set(p.sx, p.sy, p.sz);
    dummy.rotation.set(0, p.yaw ?? 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.castShadow = !foliage;
  mesh.receiveShadow = true;
  mesh.userData.foliage = foliage;
  mesh.userData.fullCount = mesh.count;
  if (positions.length > 24) {
    const chunks = new Map<string, Placement[]>();
    for (const p of positions) {
      const key = `${Math.floor(p.x / 200)},${Math.floor(p.z / 200)}`,
        list = chunks.get(key) ?? [];
      list.push(p);
      chunks.set(key, list);
    }
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.userData.fullCount = 0;
    mesh.userData.foliage = false;
    for (const [key, list] of chunks) {
      const chunk = new THREE.InstancedMesh(geo, material, list.length);
      chunk.name = `${name}_Chunk_${key}`;
      chunk.castShadow = !foliage;
      chunk.receiveShadow = true;
      chunk.userData.foliage = foliage;
      chunk.userData.fullCount = list.length;
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.set(p.sx, p.sy, p.sz);
        dummy.rotation.set(0, p.yaw ?? 0, 0);
        dummy.updateMatrix();
        chunk.setMatrixAt(i, dummy.matrix);
      });
      mesh.add(chunk);
    }
  }
  track.root.add(mesh);
  return mesh;
}
function facade(track: Track) {
  const time = { value: 0 };
  track.animated.push((t) => (time.value = t));
  const m = new THREE.MeshStandardMaterial({
    color: 0x3c444d,
    metalness: 0.3,
    roughness: 0.62,
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.facadeTime = time;
    s.vertexShader =
      "varying vec3 vFacadeWorld;\nvarying vec3 vFacadeNormal;\n" +
      s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
    vec4 fp=vec4(transformed,1.);
#ifdef USE_INSTANCING
fp=instanceMatrix*fp;
#endif
vFacadeWorld=(modelMatrix*fp).xyz;
    vec3 fnrm=objectNormal;
#ifdef USE_INSTANCING
fnrm=mat3(instanceMatrix)*fnrm;
#endif
vFacadeNormal=normalize(mat3(modelMatrix)*fnrm);`,
    );
    s.fragmentShader =
      `varying vec3 vFacadeWorld;varying vec3 vFacadeNormal;uniform float facadeTime;
float fh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float facadeWindow;
` + s.fragmentShader;
    // Windows: 1.7 m bays on 3.4 m floors with mullions and spandrel bands.
    s.fragmentShader = s.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
    vec3 fn=normalize(vFacadeNormal);
    float wall=1.-step(.6,abs(fn.y));
    float u=abs(fn.x)>abs(fn.z)?vFacadeWorld.z:vFacadeWorld.x;
    vec2 grid=vec2(u/1.7,vFacadeWorld.y/3.4),cell=floor(grid),f=fract(grid);
    float pane=step(.1,f.x)*step(f.x,.9)*step(.22,f.y)*step(f.y,.86);
    float mullion=1.-step(.47,f.x)*step(f.x,.53);
    facadeWindow=wall*pane*mullion*step(1.2,vFacadeWorld.y);
    float slab=wall*(1.-step(.06,f.y));
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.35,slab);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.02,.03,.04),facadeWindow);`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
    roughnessFactor=mix(roughnessFactor,.06,facadeWindow);`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <metalnessmap_fragment>",
      `#include <metalnessmap_fragment>
    metalnessFactor=mix(metalnessFactor,.85,facadeWindow);`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
    vec2 room=floor(vec2(u/1.7,vFacadeWorld.y/3.4));
    float h=fh(room+floor(vFacadeWorld.xz/37.)*.13);
    float lit=step(.74,h);
    vec3 tone=h>.97?vec3(.35,.95,1.):h>.9?vec3(.75,.85,1.):h>.82?vec3(1.,.82,.6):vec3(1.,.66,.36);
    float flicker=h>.995?.6+.4*sin(facadeTime*7.+h*90.):1.;
    float depth=.55+.45*smoothstep(.86,.22,fract(vFacadeWorld.y/3.4));
    totalEmissiveRadiance+=facadeWindow*lit*tone*depth*flicker*(.55+.6*fh(room*1.7));`,
    );
  };
  return m;
}
function tierGeometry(tiers: number) {
  const parts: THREE.BufferGeometry[] = [];
  let bottom = 0;
  for (let t = 0; t < tiers; t++) {
    const height = t === 0 ? (tiers === 1 ? 1 : 0.65) : 0.35 / (tiers - 1),
      w = 1 - t * 0.18;
    const g = new THREE.BoxGeometry(w, height, w);
    g.translate(0, bottom + height / 2, 0);
    parts.push(g);
    bottom += height;
  }
  const geo = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return geo;
}
function clearPlacement(
  track: Track,
  t: number,
  side: number,
  offset: number,
  sx: number,
  sy: number,
  sz: number,
  y = 0,
): Placement | null {
  const at = track.at(t, side * offset),
    p = at.point;
  if (!track.isClear(p, Math.hypot(sx, sz) / 2, 0.5)) return null;
  return { x: p.x, y, z: p.z, sx, sy, sz, yaw: at.yaw };
}
function city(track: Track, random: () => number) {
  const palettes = [facade(track), facade(track), facade(track)];
  palettes[1].color.set(0x4a535c);
  palettes[2].color.set(0x2f353d);
  const blocks: Placement[][] = [[], [], []],
    ac: Placement[] = [],
    tanks: Placement[] = [],
    antenna: Placement[] = [],
    shops: Placement[] = [],
    beacons: Placement[] = [];
  for (let i = 0; i < 220; i++) {
    const sx = 12 + random() * 28,
      sz = 12 + random() * 28,
      h = 14 + random() * 68,
      side = i % 2 ? 1 : -1;
    const p = clearPlacement(
      track,
      random(),
      side,
      35 + random() * 150,
      sx,
      h,
      sz,
      h / 2,
    );
    if (!p) continue;
    p.y = 0;
    blocks[i % 3].push(p);
    ac.push({ ...p, y: h + 0.7, sx: 1.8, sy: 1.4, sz: 2.4 });
    if (i % 3 === 0)
      tanks.push({ ...p, x: p.x + 3, y: h + 1.4, sx: 1.3, sy: 2.8, sz: 1.3 });
    if (i % 4 === 0) {
      antenna.push({ ...p, y: h + 3, sx: 0.07, sy: 6, sz: 0.07 });
      beacons.push({ ...p, y: h + 6, sx: 0.35, sy: 0.35, sz: 0.35 });
    }
    shops.push({ ...p, y: 2, sx: sx + 0.03, sy: 4, sz: sz + 0.03 });
  }
  blocks.forEach((p, i) =>
    instances(
      track,
      "Buildings_Tier" + (i + 1),
      tierGeometry(i + 1),
      palettes[i],
      p,
    ),
  );
  instances(
    track,
    "Roof_HVAC",
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0x62686d,
      metalness: 0.5,
      roughness: 0.7,
    }),
    ac,
  );
  instances(
    track,
    "Roof_Tanks",
    new THREE.CylinderGeometry(1, 1, 1, 10),
    new THREE.MeshStandardMaterial({ color: 0x434d53, roughness: 0.6 }),
    tanks,
  );
  instances(
    track,
    "Roof_Antennas",
    new THREE.CylinderGeometry(1, 1, 1, 5),
    new THREE.MeshStandardMaterial({ color: 0x343d46 }),
    antenna,
  );
  const beacon = instances(
    track,
    "Roof_Beacons",
    new THREE.SphereGeometry(1, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xff354a }),
    beacons,
  );
  track.animated.push((t) =>
    (beacon.material as THREE.MeshBasicMaterial).color.setScalar(
      0.55 + 0.45 * Math.sin(t * 3) ** 2,
    ),
  );
  instances(
    track,
    "Shopfront_Bands",
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0x172832,
      metalness: 0.6,
      roughness: 0.22,
    }),
    shops,
  );
  const shopMap = track.holoTexture();
  instances(
    track,
    "Shopfront_Signs",
    new THREE.PlaneGeometry(),
    new THREE.MeshStandardMaterial({
      map: shopMap,
      emissiveMap: shopMap,
      emissive: 0x7baca7,
      emissiveIntensity: 0.65,
      side: THREE.DoubleSide,
    }),
    shops.map((p) => ({
      ...p,
      x: p.x + Math.sin(p.yaw ?? 0) * (p.sz / 2 + 0.03),
      y: 3,
      z: p.z + Math.cos(p.yaw ?? 0) * (p.sz / 2 + 0.03),
      sx: p.sx * 0.7,
      sy: 1.2,
      sz: 1,
    })),
  );
  const parked: Placement[] = [],
    planters: Placement[] = [],
    trees: Placement[] = [],
    bus: Placement[] = [],
    signals: Placement[] = [],
    arms: Placement[] = [];
  for (let i = 0; i < 90; i++) {
    const t = i / 90,
      side = i % 2 ? 1 : -1,
      half = track.halfWidthAt(t);
    const p = clearPlacement(track, t, side, half + 9, 1.9, 0.9, 4.4, 0.6);
    if (p && i % 3 === 0) parked.push(p);
    const tree = clearPlacement(track, t, side, half + 8, 2.5, 2.5, 2.5, 1.25);
    if (tree) {
      planters.push({ ...tree, sy: 0.5, y: 0.25 });
      trees.push({ ...tree, y: 3.5, sy: 4 });
    }
    if (i % 12 === 0) {
      const stop = clearPlacement(track, t, side, half + 11, 5, 3, 2, 1.5);
      if (stop) bus.push(stop);
    }
    if (i % 15 === 0) {
      const light = clearPlacement(track, t, side, half + 5, 1, 4, 1, 2);
      if (light) signals.push(light);
    }
    const arm = clearPlacement(track, t, side, half + 5, 2.8, 0.1, 0.15, 7);
    if (arm) arms.push(arm);
  }
  instances(
    track,
    "Parked_Cars_LOD2",
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0x30424e,
      metalness: 0.4,
      roughness: 0.4,
    }),
    parked,
  );
  instances(
    track,
    "Tree_Planters",
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ color: 0x444a4c, roughness: 0.9 }),
    planters,
  );
  instances(
    track,
    "Street_Trees",
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0x294c3c, roughness: 0.95 }),
    trees,
    true,
  );
  const shelterParts = [
    new THREE.BoxGeometry(5, 0.12, 2).translate(0, 1.4, 0),
    new THREE.BoxGeometry(0.1, 2.8, 2).translate(-2.45, 0, 0),
    new THREE.BoxGeometry(0.1, 2.8, 2).translate(2.45, 0, 0),
    new THREE.BoxGeometry(5, 2, 0.05).translate(0, 0.3, -0.95),
  ];
  instances(
    track,
    "Bus_Shelters",
    mergeGeometries(shelterParts)!,
    new THREE.MeshStandardMaterial({
      color: 0x687d81,
      metalness: 0.6,
      roughness: 0.3,
    }),
    bus.map((p) => ({ ...p, sx: 1, sy: 1, sz: 1 })),
  );
  shelterParts.forEach((g) => g.dispose());
  instances(
    track,
    "Signal_Posts",
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ color: 0x383c42, roughness: 0.6 }),
    signals.map((p) => ({ ...p, sx: 0.15, sz: 0.15 })),
  );
  instances(
    track,
    "Traffic_Lights",
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0x111718,
      emissive: 0xb93b27,
      emissiveIntensity: 0.7,
    }),
    signals.map((p) => ({ ...p, y: 4.1, sx: 0.34, sy: 0.8, sz: 0.2 })),
  );
  instances(
    track,
    "Lamp_Arms",
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ color: 0x53616b, metalness: 0.7 }),
    arms,
  );
  // Cable arches keep their support points outside the roadway clearance envelope.
  for (let i = 0; i < 4; i++) {
    const at = track.at(0.22 + i * 0.025),
      half = track.halfWidthAt(0.22 + i * 0.025);
    const points = [
      at.point
        .clone()
        .addScaledVector(at.normal, -half - 7)
        .add(new THREE.Vector3(0, 10, 0)),
      at.point.clone().add(new THREE.Vector3(0, 8.8, 0)),
      at.point
        .clone()
        .addScaledVector(at.normal, half + 7)
        .add(new THREE.Vector3(0, 10, 0)),
    ];
    const cable = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        20,
        0.025,
        3,
        false,
      ),
      new THREE.MeshStandardMaterial({ color: 0x151a21 }),
    );
    cable.name = "Overhead_Cable";
    cable.userData.trackFixture = true;
    track.root.add(cable);
  }
  const map = track.holoTexture();
  instances(
    track,
    "Scrolling_LED",
    new THREE.PlaneGeometry(12, 4),
    new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      side: THREE.DoubleSide,
    }),
    [0.12, 0.34, 0.56, 0.78].map((t) => {
      const at = track.at(t, track.halfWidthAt(t) + 16);
      return {
        x: at.point.x,
        y: 10,
        z: at.point.z,
        sx: 1,
        sy: 1,
        sz: 1,
        // Face back towards the road so the artwork never reads mirrored.
        yaw: at.yaw - Math.PI / 2,
      };
    }),
  );
  map.wrapS = THREE.RepeatWrapping;
  track.animated.push((t) => {
    map.offset.x = t * 0.08;
  });
  const steamGeo = new THREE.BufferGeometry(),
    steam: number[] = [];
  for (let i = 0; i < 45; i++) {
    const at = track.at(0.23 + (i / 45) * 0.09, track.halfWidthAt(0.25) + 2);
    steam.push(at.point.x, at.point.y + (i % 9) * 0.45, at.point.z);
  }
  steamGeo.setAttribute("position", new THREE.Float32BufferAttribute(steam, 3));
  const mist = new THREE.Points(
    steamGeo,
    new THREE.PointsMaterial({
      color: 0xa5b5bf,
      size: 1.2,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  );
  mist.name = "Alley_Steam";
  track.root.add(mist);
  track.animated.push((t) => {
    mist.position.y = Math.sin(t * 0.6) * 0.8;
  });
}
function frondTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const c = canvas.getContext("2d")!;
  c.clearRect(0, 0, 128, 256);
  c.strokeStyle = "#789657";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(64, 250);
  c.quadraticCurveTo(54, 130, 64, 8);
  c.stroke();
  for (let y = 16; y < 246; y += 7) {
    const w = Math.sin((y / 256) * Math.PI) * 54;
    c.strokeStyle = y % 3 ? "#416744" : "#6a8b4b";
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(64, y);
    c.lineTo(64 - w, y + 28);
    c.moveTo(64, y);
    c.lineTo(64 + w, y + 28);
    c.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function coast(track: Track, random: () => number) {
  const trunks: Placement[] = [],
    fronds: Placement[] = [];
  for (let i = 0; i < 100; i++) {
    const t = random(),
      p = clearPlacement(
        track,
        t,
        i % 2 ? 1 : -1,
        track.halfWidthAt(t) + 7 + random() * 25,
        4,
        8,
        4,
      );
    if (!p) continue;
    const h = 0.7 + random() * 0.6;
    trunks.push({ ...p, sx: h, sy: h, sz: h });
    for (let f = 0; f < 7; f++)
      fronds.push({
        ...p,
        x: p.x + Math.cos(p.yaw ?? 0) * 1.2 * h,
        z: p.z - Math.sin(p.yaw ?? 0) * 1.2 * h,
        y: 8 * h,
        sx: h,
        sy: h,
        sz: h,
        yaw: (p.yaw ?? 0) + (f / 7) * Math.PI * 2,
      });
  }
  const trunk = new THREE.CylinderGeometry(0.14, 0.3, 8, 7, 5);
  trunk.translate(0, 4, 0);
  const pos = trunk.attributes.position;
  for (let i = 0; i < pos.count; i++)
    pos.setX(i, pos.getX(i) + (pos.getY(i) / 8) ** 2 * 1.2);
  trunk.computeVertexNormals();
  instances(
    track,
    "Palm_Trunks",
    trunk,
    new THREE.MeshStandardMaterial({ color: 0x6d6049, roughness: 0.95 }),
    trunks,
    true,
  );
  const frond = new THREE.PlaneGeometry(2, 5, 1, 8),
    fp = frond.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i) + 2.5;
    fp.setXYZ(i, fp.getX(i), -y * y * 0.15, y);
  }
  frond.computeVertexNormals();
  instances(
    track,
    "Palm_Fronds",
    frond,
    new THREE.MeshStandardMaterial({
      map: frondTexture(),
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.9,
    }),
    fronds,
    true,
  );
  const normalA = track.waterNormals(),
    normalB = track.waterNormals();
  normalB.repeat.set(31, 47);
  const seaMat = new THREE.MeshPhysicalMaterial({
    color: 0x286b7b,
    normalMap: normalA,
    roughness: 0.16,
    metalness: 0.3,
    clearcoat: 1,
    envMapIntensity: 1.4,
  });
  const clock = { value: 0 };
  const terrainPositions = track.terrain.root.geometry.attributes.position,
    heights = new Float32Array(257 * 257);
  for (let x = 0; x < 257; x++)
    for (let z = 0; z < 257; z++)
      heights[z * 257 + x] = terrainPositions.getY(x * 257 + z);
  const shore = new THREE.DataTexture(
    heights,
    257,
    257,
    THREE.RedFormat,
    THREE.FloatType,
  );
  shore.needsUpdate = true;
  seaMat.onBeforeCompile = (s) => {
    s.uniforms.waterClock = clock;
    s.uniforms.waterSecond = { value: normalB };
    s.uniforms.shoreHeight = { value: shore };
    s.uniforms.shoreCenter = {
      value: new THREE.Vector2(track.terrain.center.x, track.terrain.center.z),
    };
    s.vertexShader = "varying vec3 vSea;\n" + s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvSea=(modelMatrix*vec4(transformed,1.)).xyz;",
    );
    s.fragmentShader =
      "uniform float waterClock;uniform sampler2D waterSecond;uniform sampler2D shoreHeight;uniform vec2 shoreCenter;varying vec3 vSea;\n" +
      s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>\nnormal=normalize(normal+ (texture2D(waterSecond,vNormalMapUv*1.3+waterClock*.006).rgb*2.-1.)*.12);`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>\nfloat fres=pow(1.-abs(dot(normalize(vNormal),normalize(vViewPosition))),3.);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.55,.72,.74),fres*.35);float foam=sin(vSea.x*.22+waterClock)*sin(vSea.z*.3+waterClock*.7);float depth=-.2-texture2D(shoreHeight,(vSea.xz-shoreCenter)/2400.+.5).r;diffuseColor.rgb+=step(0.,depth)*(1.-smoothstep(0.,1.,depth))*(.22+foam*.09);`,
    );
  };
  const size = 2800,
    n = 128,
    step = size / n,
    origin = track.terrain.center,
    blocked = new Set<number>();
  for (let i = 0; i < track.samples; i++) {
    const p = track.points[i],
      radius =
        track.halfWidthAt(i / track.samples) + 30 + (step * Math.SQRT2) / 2 + 1;
    const cx = (p.x - origin.x + size / 2) / step,
      cz = (p.z - origin.z + size / 2) / step,
      r = radius / step;
    for (
      let x = Math.max(0, Math.floor(cx - r));
      x < Math.min(n, Math.ceil(cx + r));
      x++
    )
      for (
        let z = Math.max(0, Math.floor(cz - r));
        z < Math.min(n, Math.ceil(cz + r));
        z++
      )
        if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r) blocked.add(x * n + z);
  }
  const seaPositions: number[] = [],
    seaUV: number[] = [],
    seaIndices: number[] = [];
  for (let x = 0; x <= n; x++)
    for (let z = 0; z <= n; z++) {
      seaPositions.push(
        origin.x + (x / n - 0.5) * size,
        -0.2,
        origin.z + (z / n - 0.5) * size,
      );
      seaUV.push(x / n, 1 - z / n);
      if (x < n && z < n && !blocked.has(x * n + z)) {
        const a = x * (n + 1) + z;
        seaIndices.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1);
      }
    }
  const seaGeometry = new THREE.BufferGeometry();
  seaGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(seaPositions, 3),
  );
  seaGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(seaUV, 2));
  seaGeometry.setIndex(seaIndices);
  seaGeometry.computeVertexNormals();
  const sea = new THREE.Mesh(seaGeometry, seaMat);
  sea.name = "Sea";
  sea.userData.trackFixture = true;
  track.root.add(sea);
  track.animated.push((t) => {
    clock.value = t;
    normalA.offset.set(t * 0.008, t * 0.012);
  });
  const at = track.at(0.27, track.halfWidthAt(0.27) + 32),
    light = new THREE.Group();
  light.name = "Lighthouse";
  light.position.set(at.point.x, 0, at.point.z);
  const tower = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(2.1, 0),
        new THREE.Vector2(1.4, 17),
        new THREE.Vector2(2, 17.4),
        new THREE.Vector2(2, 18),
        new THREE.Vector2(1.5, 18.2),
      ],
      24,
    ),
    new THREE.MeshStandardMaterial({ color: 0xe2d6b7, roughness: 0.8 }),
  );
  light.add(tower);
  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 2, 16),
    new THREE.MeshStandardMaterial({
      color: 0x798c94,
      emissive: 0xffcf6d,
      emissiveIntensity: 0.8,
    }),
  );
  lantern.position.y = 19;
  light.add(lantern);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.1, 1.7, 16),
    new THREE.MeshStandardMaterial({ color: 0x9c5c48 }),
  );
  roof.position.y = 20.8;
  light.add(roof);
  const landmarkLOD = new THREE.LOD(),
    close = new THREE.Group();
  close.add(...[...light.children]);
  landmarkLOD.addLevel(close, 0);
  const distant = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 2, 20, 8),
    new THREE.MeshStandardMaterial({ color: 0xcfc3a8, roughness: 0.9 }),
  );
  distant.name = "Lighthouse_Distant";
  distant.position.y = 10;
  landmarkLOD.addLevel(distant, 180);
  light.add(landmarkLOD);
  track.root.add(light);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(5, 65, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffda98,
      transparent: true,
      opacity: 0.035,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.geometry.translate(0, -32.5, 0);
  beam.rotation.z = Math.PI / 2;
  const pivot = new THREE.Group();
  pivot.position.set(at.point.x, at.point.y + 19, at.point.z);
  pivot.userData.trackFixture = true;
  pivot.add(beam);
  track.root.add(pivot);
  track.animated.push((t) => (pivot.rotation.y = t * 0.18));
  const boats: Placement[] = [],
    docks: Placement[] = [];
  const bridge = track.spec.sections?.find((s) => s.type === "bridge");
  if (bridge && "from" in bridge)
    for (let i = 0; i < 8; i++) {
      const p = track.at(
        (bridge.from + bridge.to) / 2,
        (i % 2 ? 1 : -1) * (22 + i * 3),
      );
      boats.push({
        x: p.point.x,
        y: 0.2,
        z: p.point.z,
        sx: 1.4,
        sy: 1,
        sz: 4,
        yaw: p.yaw + 0.3,
      });
      docks.push({
        x: p.point.x + 3,
        y: 0.05,
        z: p.point.z,
        sx: 3,
        sy: 0.2,
        sz: 12,
      });
    }
  const boat = instances(
    track,
    "Marina_Boats",
    new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xe0d6c0, roughness: 0.5 }),
    boats,
  );
  boat.userData.trackFixture = true;
  const dock = instances(
    track,
    "Marina_Docks",
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ color: 0x6a5844, roughness: 0.9 }),
    docks,
  );
  dock.userData.trackFixture = true;
}
function canyon(track: Track, random: () => number) {
  const mesas: Placement[] = [],
    rocks: Placement[] = [],
    cacti: Placement[] = [],
    bushes: Placement[] = [];
  for (let i = 0; i < 100; i++) {
    const t = random(),
      p = clearPlacement(
        track,
        t,
        i % 2 ? 1 : -1,
        50 + random() * 145,
        20 + random() * 25,
        15 + random() * 30,
        20 + random() * 25,
      );
    if (p) {
      p.y = p.sy / 2 - 1;
      mesas.push(p);
    }
  }
  for (let i = 0; i < 180; i++) {
    const t = random(),
      s = 0.6 + random() * 2,
      p = clearPlacement(
        track,
        t,
        i % 2 ? 1 : -1,
        track.halfWidthAt(t) + 7 + random() * 35,
        s * 2,
        s * 1.4,
        s * 2,
        s * 0.5,
      );
    if (p) {
      rocks.push(p);
      if (i % 2)
        cacti.push({ ...p, sx: 0.7, sy: 0.7 + random() * 0.5, sz: 0.7, y: 0 });
      else bushes.push({ ...p, sx: 1.2, sy: 1.1, sz: 1.2, y: 0.5 });
    }
  }
  instances(
    track,
    "Strata_Mesas",
    new THREE.CylinderGeometry(0.75, 1, 1, 10, 8),
    strataMaterial(0xb1815d),
    mesas,
  );
  instances(
    track,
    "Boulder_Clusters",
    new THREE.DodecahedronGeometry(1, 0),
    strataMaterial(0x9e7055),
    rocks,
  );
  const cactusParts = [
    new THREE.CylinderGeometry(0.15, 0.25, 3.5, 7).translate(0, 1.75, 0),
  ];
  for (const x of [-0.65, 0.65]) {
    cactusParts.push(
      new THREE.CylinderGeometry(0.1, 0.17, 1.8, 6).translate(x, 2.5, 0),
      new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6)
        .rotateZ(Math.PI / 2)
        .translate(x / 2, 1.7, 0),
    );
  }
  const cactus = mergeGeometries(cactusParts)!;
  cactusParts.forEach((g) => g.dispose());
  instances(
    track,
    "Joshua_Cacti",
    cactus,
    new THREE.MeshStandardMaterial({ color: 0x596747, roughness: 0.95 }),
    cacti,
    true,
  );
  const twigParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.PlaneGeometry(1.2, 1.1, 1, 1);
    g.rotateY((i / 6) * Math.PI);
    twigParts.push(g);
  }
  const twigs = mergeGeometries(twigParts)!;
  twigParts.forEach((g) => g.dispose());
  instances(
    track,
    "Dry_Bushes",
    twigs,
    new THREE.MeshStandardMaterial({
      color: 0x8a8060,
      roughness: 1,
      side: THREE.DoubleSide,
      wireframe: true,
    }),
    bushes,
    true,
  );
  const positions: number[] = [];
  for (let i = 0; i < 140; i++) {
    const a = i * 2.4,
      y = i % 30;
    positions.push(
      Math.cos(a) * (1 + y * 0.08),
      y * 0.5,
      Math.sin(a) * (1 + y * 0.08),
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  for (let i = 0; i < 3; i++) {
    const at = track.at(i / 3, 100),
      dust = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: 0xc19b73,
          size: 1.4,
          transparent: true,
          opacity: 0.15,
          depthWrite: false,
        }),
      );
    dust.position.copy(at.point);
    dust.position.y = track.terrain.heightAt(at.point.x, at.point.z);
    dust.name = "Dust_Devil";
    track.root.add(dust);
    track.animated.push((t) => (dust.rotation.y = t * 0.35 + i));
  }
}
export function buildEnvironment(track: Track, random: () => number) {
  if (track.spec.environment === "neon") city(track, random);
  else if (track.spec.environment === "coast") coast(track, random);
  else canyon(track, random);
  const material = track.terrain.root.material as THREE.MeshStandardMaterial;
  const rock = strataMaterial(
    track.spec.environment === "canyon"
      ? 0xa9805e
      : track.spec.environment === "coast"
        ? 0x93846b
        : 0x263138,
  );
  rock.vertexColors = true;
  track.terrain.root.material = rock;
  material.dispose();
}
