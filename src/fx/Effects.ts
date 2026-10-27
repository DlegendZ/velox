import * as THREE from "three";
/** The subset of a car the effects need; satisfied by local and remote cars. */
export interface FxCar {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  velocity: THREE.Vector3;
  speed: number;
  drifting: boolean;
  boosting: boolean;
  controller?: {
    wheelContactPoint: (
      index: number,
    ) => { x: number; y: number; z: number } | null;
  };
}
const tmp = new THREE.Vector3(),
  tmpForward = new THREE.Vector3(),
  tmpObject = new THREE.Object3D();
/** GPU point-sprite pool with per-particle colour, size and fade. */
class ParticlePool {
  points: THREE.Points;
  private position: Float32Array;
  private velocity: Float32Array;
  private color: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grow: Float32Array;
  private next = 0;
  private material: THREE.ShaderMaterial;
  constructor(
    private capacity: number,
    additive: boolean,
    private drag = 1.2,
    private gravity = 0,
  ) {
    this.position = new Float32Array(capacity * 3).fill(-9999);
    this.velocity = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.position, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.color, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        scale: { value: 400 },
        soft: { value: additive ? 0.15 : 0.5 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        attribute float size;
        attribute float alpha;
        uniform float scale;
        varying vec3 vColor;
        varying float vAlpha;
        #include <fog_pars_vertex>
        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float soft;
        varying vec3 vColor;
        varying float vAlpha;
        #include <fog_pars_fragment>
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, soft, d) * vAlpha;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vColor, a);
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.material.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      this.material.uniforms,
    ]);
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }
  set scale(v: number) {
    this.material.uniforms.scale.value = v;
  }
  emit(
    p: THREE.Vector3,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.Color,
    size: number,
    life: number,
    grow = 0,
  ) {
    const i = this.next++ % this.capacity;
    this.position[i * 3] = p.x;
    this.position[i * 3 + 1] = p.y;
    this.position[i * 3 + 2] = p.z;
    this.velocity[i * 3] = vx;
    this.velocity[i * 3 + 1] = vy;
    this.velocity[i * 3 + 2] = vz;
    this.color[i * 3] = color.r;
    this.color[i * 3 + 1] = color.g;
    this.color[i * 3 + 2] = color.b;
    this.size[i] = size;
    this.life[i] = this.maxLife[i] = life;
    this.grow[i] = grow;
  }
  update(dt: number) {
    const damp = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        this.position[i * 3 + 1] = -9999;
        continue;
      }
      const k = i * 3;
      this.velocity[k] *= damp;
      this.velocity[k + 1] = this.velocity[k + 1] * damp - this.gravity * dt;
      this.velocity[k + 2] *= damp;
      this.position[k] += this.velocity[k] * dt;
      this.position[k + 1] += this.velocity[k + 1] * dt;
      this.position[k + 2] += this.velocity[k + 2] * dt;
      if (this.gravity && this.position[k + 1] < 0.05) {
        this.position[k + 1] = 0.05;
        this.velocity[k + 1] *= -0.3;
      }
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, t * 2.5) * (t < 1 ? 1 : 0);
      this.size[i] += this.grow[i] * dt;
    }
    const attr = this.points.geometry.attributes;
    attr.position.needsUpdate = true;
    attr.alpha.needsUpdate = true;
    attr.size.needsUpdate = true;
    attr.color.needsUpdate = true;
  }
}
const SMOKE = new THREE.Color(0.78, 0.82, 0.86),
  DUST = new THREE.Color(0.72, 0.55, 0.42),
  SPRAY = new THREE.Color(0.75, 0.82, 0.88),
  SPARK = new THREE.Color(1, 0.62, 0.25),
  NITRO_A = new THREE.Color(0.45, 0.65, 1),
  NITRO_B = new THREE.Color(1, 0.55, 0.3),
  BACKFIRE = new THREE.Color(1, 0.45, 0.15);
export class Effects {
  root = new THREE.Group();
  private smoke = new ParticlePool(700, false, 1.1);
  private glow = new ParticlePool(500, true, 2.2, 9);
  private marks: THREE.InstancedMesh;
  private nextMark = 0;
  private precip: THREE.LineSegments | THREE.Points | null = null;
  private precipPositions: Float32Array | null = null;
  private snow = false;
  private time = 0;
  constructor(
    public weather: string,
    private dusty = false,
  ) {
    this.root.add(this.smoke.points, this.glow.points);
    this.marks = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.24, 0.7),
      new THREE.MeshBasicMaterial({
        color: 0x050a0e,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      }),
      1600,
    );
    tmpObject.position.set(0, -500, 0);
    tmpObject.updateMatrix();
    for (let i = 0; i < 1600; i++) this.marks.setMatrixAt(i, tmpObject.matrix);
    this.marks.frustumCulled = false;
    this.root.add(this.marks);
    if (weather === "rain") {
      // Streaks read as rain far better than dots.
      const count = 1200;
      this.precipPositions = new Float32Array(count * 6);
      for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * 110,
          y = Math.random() * 45,
          z = (Math.random() - 0.5) * 110;
        this.precipPositions.set([x, y, z, x + 0.06, y + 0.9, z + 0.03], i * 6);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(this.precipPositions, 3),
      );
      this.precip = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({
          color: 0xb5cfdf,
          transparent: true,
          opacity: 0.25,
        }),
      );
    } else if (weather === "snow") {
      this.snow = true;
      const count = 1500;
      this.precipPositions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++)
        this.precipPositions.set(
          [
            (Math.random() - 0.5) * 110,
            Math.random() * 40,
            (Math.random() - 0.5) * 110,
          ],
          i * 3,
        );
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(this.precipPositions, 3),
      );
      this.precip = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: 0xf4f8ff,
          size: 0.16,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        }),
      );
    }
    if (this.precip) {
      this.precip.frustumCulled = false;
      this.root.add(this.precip);
    }
  }
  set pointScale(v: number) {
    this.smoke.scale = v;
    this.glow.scale = v;
  }
  /** Sparks where a car hit something; strength in m/s of lost speed. */
  sparks(at: THREE.Vector3, strength: number) {
    const n = Math.min(60, 8 + strength * 6);
    for (let i = 0; i < n; i++)
      this.glow.emit(
        at,
        (Math.random() - 0.5) * 9,
        1 + Math.random() * 5,
        (Math.random() - 0.5) * 9,
        SPARK,
        0.09 + Math.random() * 0.08,
        0.35 + Math.random() * 0.45,
      );
    for (let i = 0; i < n / 4; i++)
      this.smoke.emit(
        at,
        (Math.random() - 0.5) * 2,
        0.6,
        (Math.random() - 0.5) * 2,
        SMOKE,
        1,
        0.9,
        2.4,
      );
  }
  backfire(car: FxCar, length: number) {
    tmpForward.set(0, 0, 1).applyQuaternion(car.quaternion);
    for (const x of [-0.6, 0.6]) {
      tmp
        .set(x, -0.1, -length / 2 - 0.15)
        .applyQuaternion(car.quaternion)
        .add(car.position);
      for (let i = 0; i < 5; i++)
        this.glow.emit(
          tmp,
          -tmpForward.x * 4 + (Math.random() - 0.5),
          0.4,
          -tmpForward.z * 4 + (Math.random() - 0.5),
          BACKFIRE,
          0.3,
          0.12,
        );
    }
  }
  update(
    dt: number,
    cars: { car: FxCar; length: number; offroad: boolean }[],
    focus: THREE.Vector3,
  ) {
    this.time += dt;
    for (const { car, length, offroad } of cars) {
      if (car.position.distanceToSquared(focus) > 160 * 160) continue;
      const speed = Math.abs(car.speed);
      tmpForward.set(0, 0, 1).applyQuaternion(car.quaternion);
      const heading = Math.atan2(tmpForward.x, tmpForward.z);
      const vx = car.velocity.x,
        vz = car.velocity.z;
      for (const x of [-0.88, 0.88]) {
        tmp
          .set(x, -0.15, -1.3)
          .applyQuaternion(car.quaternion)
          .add(car.position);
        if (car.drifting) {
          this.smoke.emit(
            tmp,
            vx * 0.15 + (Math.random() - 0.5) * 1.5,
            0.6 + Math.random() * 0.8,
            vz * 0.15 + (Math.random() - 0.5) * 1.5,
            this.dusty ? DUST : SMOKE,
            1.4,
            1.6,
            2.2,
          );
          const contact = car.controller?.wheelContactPoint(x < 0 ? 2 : 3);
          tmpObject.position.set(
            tmp.x,
            contact ? contact.y + 0.025 : car.position.y - 0.45,
            tmp.z,
          );
          tmpObject.rotation.set(-Math.PI / 2, 0, -heading);
          tmpObject.scale.set(1, 1, 1);
          tmpObject.updateMatrix();
          this.marks.setMatrixAt(this.nextMark++ % 1600, tmpObject.matrix);
          this.marks.instanceMatrix.needsUpdate = true;
        } else if ((offroad || this.dusty) && speed > 50 && Math.random() < 0.5)
          this.smoke.emit(
            tmp,
            vx * 0.1,
            0.5 + Math.random(),
            vz * 0.1,
            DUST,
            offroad ? 1.6 : 0.9,
            1.2,
            2.5,
          );
        else if (
          (this.weather === "rain" || this.snow) &&
          speed > 40 &&
          Math.random() < speed / 250
        )
          this.smoke.emit(
            tmp,
            vx * 0.3 + (Math.random() - 0.5) * 2,
            1 + Math.random(),
            vz * 0.3 + (Math.random() - 0.5) * 2,
            SPRAY,
            0.9,
            0.5,
            3,
          );
      }
      if (car.boosting)
        for (const x of [-0.6, 0.6]) {
          tmp
            .set(x, -0.1, -length / 2 - 0.25)
            .applyQuaternion(car.quaternion)
            .add(car.position);
          for (let i = 0; i < 2; i++)
            this.glow.emit(
              tmp,
              vx * 0.6 - tmpForward.x * 6 + (Math.random() - 0.5),
              (Math.random() - 0.2) * 1.2,
              vz * 0.6 - tmpForward.z * 6 + (Math.random() - 0.5),
              i ? NITRO_A : NITRO_B,
              0.28,
              0.18,
              -0.8,
            );
        }
    }
    this.smoke.update(dt);
    this.glow.update(dt);
    if (this.precip && this.precipPositions) {
      this.precip.position.set(focus.x, 0, focus.z);
      const p = this.precipPositions;
      if (this.snow) {
        for (let i = 0; i < p.length; i += 3) {
          p[i + 1] -= dt * 2.4;
          p[i] += Math.sin(this.time * 0.9 + i) * dt * 0.6;
          if (p[i + 1] < 0) p[i + 1] = 40;
        }
      } else
        for (let i = 0; i < p.length; i += 6) {
          p[i + 1] -= dt * 24;
          p[i + 4] -= dt * 24;
          if (p[i + 1] < 0) {
            p[i + 1] = 45;
            p[i + 4] = 45.9;
          }
        }
      this.precip.geometry.attributes.position.needsUpdate = true;
    }
  }
}
