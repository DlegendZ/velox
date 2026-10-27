import * as THREE from "three";
import type { EnvironmentId } from "../data/tracks";
export interface SkyPalette {
  top: string;
  horizon: string;
  bottom: string;
  sun: string;
  sunDir: [number, number, number];
  stars: number;
  glow: number;
  ridge: string;
  ridgeFar: string;
}
export const SKIES: Record<EnvironmentId, SkyPalette> = {
  neon: {
    top: "#03060f",
    horizon: "#2a2a5e",
    bottom: "#0b1224",
    sun: "#c9d8ff",
    sunDir: [0.35, 0.42, -0.84],
    stars: 1,
    glow: 0.55,
    ridge: "#0b1020",
    ridgeFar: "#151a36",
  },
  coast: {
    top: "#3b4f86",
    horizon: "#ffb38a",
    bottom: "#c98a7c",
    sun: "#ffd29a",
    sunDir: [-0.62, 0.12, -0.62],
    stars: 0.12,
    glow: 1,
    ridge: "#5b4a62",
    ridgeFar: "#a1727a",
  },
  canyon: {
    top: "#5e86b8",
    horizon: "#f2c49a",
    bottom: "#cba78e",
    sun: "#fff0cf",
    sunDir: [0.5, 0.3, 0.6],
    stars: 0,
    glow: 0.7,
    ridge: "#8a5242",
    ridgeFar: "#b57f68",
  },
};
const weatherTint = (hex: string, weather: string) => {
  const c = new THREE.Color(hex);
  if (weather === "rain" || weather === "fog")
    c.lerp(new THREE.Color("#55606a"), 0.45);
  if (weather === "snow") c.lerp(new THREE.Color("#b8c4cf"), 0.4);
  return c;
};
/** Camera-centred gradient sky with sun disc, horizon glow and twinkling stars. */
export function createSky(env: EnvironmentId, weather: string) {
  const p = SKIES[env];
  const clear = weather === "clear";
  const material = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: weatherTint(p.top, weather) },
      horizon: { value: weatherTint(p.horizon, weather) },
      bottom: { value: weatherTint(p.bottom, weather) },
      sunColor: { value: new THREE.Color(p.sun) },
      sunDir: { value: new THREE.Vector3(...p.sunDir).normalize() },
      stars: { value: clear ? p.stars : p.stars * 0.15 },
      glow: { value: clear ? p.glow : p.glow * 0.3 },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 clip = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
        gl_Position = clip.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, horizon, bottom, sunColor, sunDir;
      uniform float stars, glow, time;
      varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0
          ? mix(horizon, top, pow(smoothstep(0.0, 0.75, h), 0.65))
          : mix(horizon, bottom, smoothstep(0.0, 0.18, -h));
        float s = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.45 * glow + pow(s, 4.0) * 0.12 * glow);
        col += horizon * exp(-abs(h) * 14.0) * 0.35 * glow;
        if (stars > 0.0 && h > 0.05) {
          vec3 cell = floor(d * 220.0);
          float n = hash(cell);
          float twinkle = 0.6 + 0.4 * sin(time * 2.0 + n * 40.0);
          col += vec3(step(0.9965, n) * twinkle * stars * smoothstep(0.05, 0.4, h));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), material);
  sky.name = "Sky";
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  const group = new THREE.Group();
  group.add(sky);
  group.add(ridge(env, weatherTint(p.ridgeFar, weather), 820, 1.4, 11));
  group.add(ridge(env, weatherTint(p.ridge, weather), 700, 1, 29));
  return {
    root: group,
    update(time: number) {
      material.uniforms.time.value = time;
    },
  };
}
/** Distant silhouette ring: mountains outdoors, a stepped skyline in the city. */
function ridge(
  env: EnvironmentId,
  color: THREE.Color,
  radius: number,
  scale: number,
  seed: number,
) {
  const segments = 360,
    positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  let s = seed;
  const random = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const phases = [random() * 6, random() * 6, random() * 6];
  let block = 0,
    blockHeight = 0;
  const base = color.clone().multiplyScalar(0.55);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    let h: number;
    if (env === "neon") {
      if (i >= block) {
        block = i + 1 + Math.floor(random() * 4);
        blockHeight = 25 + random() * 95 * (random() > 0.85 ? 1.6 : 1);
      }
      h = blockHeight * scale;
    } else {
      h =
        (40 +
          Math.sin(a * 3 + phases[0]) * 22 +
          Math.sin(a * 7 + phases[1]) * 14 +
          Math.sin(a * 17 + phases[2]) * 6 +
          (env === "canyon"
            ? Math.max(0, Math.sin(a * 5 + phases[1])) * 30
            : 0)) *
        scale;
    }
    const x = Math.cos(a) * radius,
      z = Math.sin(a) * radius;
    positions.push(x, -20, z, x, h, z);
    colors.push(base.r, base.g, base.b, color.r, color.g, color.b);
    if (i < segments) {
      const k = i * 2;
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    fog: false,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  // Like the sky dome, distant silhouettes follow the camera and stay behind world geometry.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `vec4 mvPosition=viewMatrix*vec4(transformed+cameraPosition,1.0);gl_Position=projectionMatrix*mvPosition;gl_Position.z=gl_Position.w*.9999;`,
    );
  };
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = "Ridge";
  mesh.frustumCulled = false;
  mesh.renderOrder = -9;
  return mesh;
}
