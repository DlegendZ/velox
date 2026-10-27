import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { RaceGrade } from "./RaceGrade";
import { carBounds, fitCar } from "./CarFraming";
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  VignetteEffect,
  ToneMappingEffect,
  ToneMappingMode,
  SMAAEffect,
  ChromaticAberrationEffect,
} from "postprocessing";
import { N8AOPostPass } from "n8ao";
import type { CarModel } from "../game/CarFactory";
import { CarFactory, disposeObject } from "../game/CarFactory";
import { CARS, type CarSpec } from "../data/cars";
import { newOwned } from "../core/Save";
import type { Visual } from "../core/Save";
export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 1100);
  composer: EffectComposer;
  ao: N8AOPostPass;
  aberration: ChromaticAberrationEffect;
  private aberrationPass: EffectPass;
  stage = new THREE.Group();
  stageCar: CarModel | null = null;
  private stageCarKey = "";
  world = new THREE.Group();
  controls: OrbitControls;
  quality = "medium";
  renderScale = 1;
  private integrated = false;
  mode: "stage" | "race" | "photo" = "stage";
  private automatic = true;
  private tunnel = false;
  private exteriorFogColor = new THREE.Color();
  private exteriorAmbient = 1;
  private pausedExposure: number | null = null;
  private benchmarkTime = 0;
  private benchmarkFrames = 0;
  private benchmarkDone = false;
  sun: THREE.DirectionalLight;
  time = 0;
  orbit = 0;
  zoom = 1;
  grade = new RaceGrade();
  private environmentId = "stage";
  private hdrMaps = new Map<string, THREE.WebGLRenderTarget>();
  private hdrPending = new Map<string, Promise<void>>();
  speed = 0;
  boosting = false;
  carThumbnails = new Map<string, string>();
  private stageTween = 1;
  private stagePreset = "race";
  private garageFrame: DOMRect | null = null;
  private homeFrame: DOMRect | null = null;
  private garageTab = "";
  private stageFrom = new THREE.Vector3();
  private stageTarget = new THREE.Vector3(6.2, 2.9, 7.8);
  private stageLook = new THREE.Vector3(-1.7, 0.7, 0);
  private stageLookFrom = new THREE.Vector3();
  private stageLookTarget = new THREE.Vector3();
  ambient: THREE.HemisphereLight;
  /** Player headlight; one spotlight is cheap and sells night driving. */
  headlight: THREE.SpotLight;
  private reflector: Reflector;
  private environment: THREE.WebGLRenderTarget;
  private studio!: THREE.WebGLRenderTarget;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    const gl = this.renderer.getContext(),
      debug = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "";
    this.integrated = /Intel.*(UHD|HD Graphics)/i.test(gpu);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color("#0c141c");
    this.scene.fog = new THREE.FogExp2("#0c141c", 0.025);
    const pmrem = new THREE.PMREMGenerator(this.renderer),
      room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    room.dispose();
    pmrem.dispose();
    this.ambient = new THREE.HemisphereLight(0xc2eaff, 0x182027, 2.2);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xe1f1ff, 3.2);
    this.sun.position.set(10, 18, 12);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -24;
    this.sun.shadow.camera.right = 24;
    this.sun.shadow.camera.top = 24;
    this.sun.shadow.camera.bottom = -24;
    this.sun.shadow.normalBias = 0.06;
    this.scene.add(this.sun, this.sun.target);
    this.headlight = new THREE.SpotLight(0xe8f4ff, 0, 70, 0.5, 0.55, 1.4);
    this.headlight.visible = false;
    this.scene.add(this.headlight, this.headlight.target);
    this.scene.add(this.stage, this.world);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
    });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new N8AOPostPass(
      this.scene,
      this.camera,
      innerWidth,
      innerHeight,
    );
    this.ao.configuration.aoRadius = 0.8;
    this.ao.configuration.intensity = 1.5;
    this.ao.configuration.gammaCorrection = false;
    this.ao.setQualityMode("Low");
    this.ao.configuration.halfRes = true;
    this.composer.addPass(this.ao);
    this.aberration = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0, 0),
      radialModulation: true,
      modulationOffset: 0.6,
    });
    this.aberrationPass = new EffectPass(this.camera, this.aberration);
    this.composer.addPass(this.aberrationPass);
    const bloom = new BloomEffect({
      intensity: 0.4,
      luminanceThreshold: 1.6,
      luminanceSmoothing: 0.3,
      mipmapBlur: true,
    });
    this.composer.addPass(
      new EffectPass(
        this.camera,
        bloom,
        this.grade,
        new VignetteEffect({ darkness: 0.42, offset: 0.35 }),
        new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
        new SMAAEffect(),
      ),
    );
    this.renderer.info.autoReset = false;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 20;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.set(0, 0.7, 0);
    this.reflector = new Reflector(new THREE.PlaneGeometry(180, 180), {
      color: 0x101317,
      textureWidth: 768,
      textureHeight: 512,
      multisample: 0,
      clipBias: 0.003,
    });
    this.reflector.rotation.x = -Math.PI / 2;
    this.reflector.position.y = -0.025;
    this.stage.add(this.reflector);
    this.buildStage();
    this.buildThumbnails();
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  /** Photo-studio reflections: dark room, overhead softboxes and side strips. */
  private studioEnvironment() {
    const env = new THREE.Scene(),
      lit = (v: number, tint = 0xffffff) =>
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(tint).multiplyScalar(v),
          side: THREE.DoubleSide,
        });
    const room = new THREE.Mesh(
      new THREE.BoxGeometry(40, 14, 40),
      new THREE.MeshBasicMaterial({ color: 0x07090c, side: THREE.BackSide }),
    );
    room.position.y = 6;
    env.add(room);
    for (const x of [-2.6, 0, 2.6]) {
      const box = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 12), lit(9));
      box.rotation.x = Math.PI / 2;
      box.position.set(x, 7, 0);
      env.add(box);
    }
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 6),
        lit(5, 0xcfe6ff),
      );
      strip.position.set(side * 9, 3.5, 2);
      strip.rotation.y = (side * Math.PI) / 2;
      env.add(strip);
      const warm = new THREE.Mesh(
        new THREE.PlaneGeometry(6, 2.5),
        lit(1.2, 0xffd9b0),
      );
      warm.position.set(side * 6, 2, -10);
      env.add(warm);
    }
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshBasicMaterial({ color: 0x15181c }),
    );
    floor.rotation.x = -Math.PI / 2;
    env.add(floor);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const target = pmrem.fromScene(env, 0.02);
    pmrem.dispose();
    env.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    return target;
  }
  buildStage() {
    this.studio = this.studioEnvironment();
    const add = (
      geo: THREE.BufferGeometry,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      this.stage.add(m);
      return m;
    };
    const glow = (color: number, intensity: number) =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity),
        fog: false,
      });
    // Satin floor over the mirror softens the reflection like polished concrete.
    const satin = add(
      new THREE.CircleGeometry(60, 64),
      new THREE.MeshPhysicalMaterial({
        color: 0x090b0e,
        roughness: 0.7,
        metalness: 0.1,
        clearcoat: 0.4,
        clearcoatRoughness: 0.3,
        transparent: true,
        opacity: 0.92,
      }),
      0,
      -0.015,
      0,
    );
    satin.rotation.x = -Math.PI / 2;
    satin.name = "StudioSatinFloor";
    satin.receiveShadow = true;
    // Back wall with vertical LED slats and recessed signage.
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x15191e,
      roughness: 0.85,
      metalness: 0.15,
    });
    add(new THREE.BoxGeometry(60, 16, 0.4), wallMat, 0, 8, -11);
    add(new THREE.BoxGeometry(0.4, 16, 40), wallMat, 16, 8, 6);
    for (let i = 0; i < 9; i++) {
      const x = -2 + i * 2.2;
      add(
        new THREE.BoxGeometry(0.05, 2.6, 0.05),
        glow(0xd8ecff, 0.9 - (i % 3) * 0.1),
        x,
        2.2,
        -10.75,
      ).name = "StudioLED";
    }
    const ceiling = add(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({
        color: 0x06080b,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
      0,
      7.6,
      0,
    );
    ceiling.name = "StudioCeiling";
    ceiling.rotation.x = Math.PI / 2;
    add(
      new THREE.BoxGeometry(22, 0.04, 0.05),
      glow(0xc6ff3d, 1.4),
      7,
      0.04,
      -10.7,
    );
    // Overhead softboxes (visible when the camera looks up, and in reflections).
    for (const x of [-2.6, 0, 2.6]) {
      const box = add(
        new THREE.BoxGeometry(1.3, 0.08, 9),
        glow(0xffffff, 0.95),
        x,
        7.2,
        0,
      );
      box.castShadow = false;
      add(new THREE.BoxGeometry(1.5, 0.12, 9.2), wallMat, x, 7.3, 0);
    }
    // Turntable.
    const table = add(
      new THREE.CylinderGeometry(3.3, 3.36, 0.06, 96),
      new THREE.MeshPhysicalMaterial({
        color: 0x101317,
        metalness: 0.45,
        roughness: 0.48,
        clearcoat: 0.35,
      }),
      0,
      0.0,
      0,
    );
    table.receiveShadow = true;
    const edge = add(
      new THREE.TorusGeometry(3.34, 0.01, 6, 120),
      glow(0xc6ff3d, 1.1),
      0,
      0.03,
      0,
    );
    edge.rotation.x = Math.PI / 2;
    const texCanvas = document.createElement("canvas");
    texCanvas.width = 1024;
    texCanvas.height = 128;
    const ctx = texCanvas.getContext("2d")!;
    ctx.fillStyle = "#58626b";
    ctx.font = "700 46px Arial";
    ctx.textAlign = "center";
    ctx.fillText("A F T E R   H O U R S   M O T O R   C L U B", 512, 72);
    const tex = new THREE.CanvasTexture(texCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    add(
      new THREE.PlaneGeometry(13, 1.625),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.55,
      }),
      9,
      8.2,
      -10.75,
    );
    // Soft key from the front-left, cool rim from behind, warm kicker low on the right.
    const rim = new THREE.SpotLight(0xbfe1ff, 45, 30, 0.55, 0.7, 1.3);
    rim.position.set(-5, 5, -7);
    rim.target.position.set(0, 0.5, 0);
    this.stage.add(rim, rim.target);
    const kick = new THREE.PointLight(0xffc996, 3, 10, 2);
    kick.position.set(5, 1.2, 4);
    this.stage.add(kick);
  }
  private buildThumbnails() {
    const scene = new THREE.Scene();
    scene.environment = this.studio.texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x35404b, 3));
    const light = new THREE.DirectionalLight(0xffffff, 4);
    light.position.set(4, 7, 4);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(35, 2, 0.1, 40);
    camera.position.set(6, 2.6, 7);
    camera.lookAt(0, 0.6, 0);
    const target = new THREE.WebGLRenderTarget(512, 256),
      pixels = new Uint8Array(512 * 256 * 4);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext("2d")!;
    for (const spec of CARS) {
      const car = CarFactory.buildProcedural(spec, newOwned(spec.id).visual);
      scene.add(car.root);
      camera.position.set(5.6, 1.7, 6.4);
      fitCar(
        camera,
        carBounds(car.root),
        { x: 0, y: 0, width: 512, height: 256 },
        512,
        256,
        0.8,
      );
      this.renderer.setRenderTarget(target);
      this.renderer.clear();
      this.renderer.render(scene, camera);
      this.renderer.readRenderTargetPixels(target, 0, 0, 512, 256, pixels);
      const img = context.createImageData(512, 256);
      for (let y = 0; y < 256; y++)
        img.data.set(
          pixels.subarray((255 - y) * 2048, (256 - y) * 2048),
          y * 2048,
        );
      context.putImageData(img, 0, 0);
      this.carThumbnails.set(spec.id, canvas.toDataURL("image/png"));
      scene.remove(car.root);
      car.root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.renderer.setRenderTarget(null);
    target.dispose();
  }
  showCar(spec: CarSpec, visual: Visual) {
    const key = `${spec.id}:${JSON.stringify(visual)}`;
    if (this.stageCar && key === this.stageCarKey) return;
    this.stageCarKey = key;
    if (this.stageCar) disposeObject(this.stageCar.root);
    // The showroom always shows the full clearcoat paint.
    const premium = CarFactory.premium;
    CarFactory.premium = true;
    this.stageCar = CarFactory.buildProcedural(spec, visual);
    CarFactory.premium = premium;
    this.stage.add(this.stageCar.root);
    this.stageCar.root.position.y = 0.03;
  }
  setStage(preset: boolean | string = false) {
    this.setPaused(false);
    this.stagePreset =
      typeof preset === "string" ? preset : preset ? "garage" : "race";
    const garage =
      preset === true ||
      ["garage", "paint", "engine", "wheel"].includes(String(preset));
    if (!garage) {
      this.garageFrame = null;
      this.garageTab = "";
      this.camera.clearViewOffset();
      this.camera.zoom = 1;
    }
    const poses: Record<string, number[]> = {
      race: [6.2, 1.8, 7.8],
      career: [8.8, 2, 0.1],
      online: [5.2, 3, 8.8],
      garage: [5.6, 1.7, 6.4],
      driver: [3, 1.4, 4.6],
      // Under the 7.6 m ceiling and its softboxes, so the car stays in view.
      settings: [2, 5, 6.5],
      title: [5.6, 1.5, 7],
      engine: [8, 0.55, 0],
      paint: [-5.6, 1.7, -6.4],
      wheel: [2.8, 0.9, 2.7],
    };
    const pos =
      poses[typeof preset === "string" ? preset : garage ? "garage" : "race"];
    this.stageFrom.copy(this.camera.position);
    this.stageTarget.set(...(pos as [number, number, number]));
    this.stageLookFrom.copy(this.stageLook);
    // The title centres the car; menu poses leave room for the left-hand list.
    this.stageLookTarget.set(garage || preset === "title" ? 0 : -1.7, 0.7, 0);
    if (preset === "wheel") this.stageLookTarget.set(0.98, 0.45, 1.3);
    this.stageTween = 0;
    this.mode = "stage";
    this.environmentId = "stage";
    this.grade.environment("stage");
    this.scene.environment = this.studio.texture;
    this.headlight.visible = false;
    this.scene.environmentIntensity = 1;
    this.stage.visible = true;
    this.reflector.visible = !garage;
    this.world.visible = false;
    this.scene.background = new THREE.Color("#07090c");
    this.scene.fog = new THREE.FogExp2("#07090c", 0.022);
    this.ambient.intensity = 0.35;
    this.sun.intensity = 1.25;
    this.sun.position.set(-4, 10, 6);
    this.sun.target.position.set(0, 0, 0);
    this.renderer.toneMappingExposure = 1.08;
    this.controls.enabled = garage;
    if (preset === "wheel") this.controls.target.copy(this.stageLookTarget);
    else this.controls.target.set(0, 0.65, 0);
    this.camera.fov = 38;
    this.camera.updateProjectionMatrix();
  }
  setRace(environment: string, weather = "clear") {
    this.garageFrame = null;
    this.camera.clearViewOffset();
    this.camera.zoom = 1;
    this.setPaused(false);
    this.benchmarkDone = false;
    this.benchmarkTime = 0;
    this.benchmarkFrames = 0;
    this.mode = "race";
    this.applySceneryQuality();
    this.environmentId = environment;
    this.grade.environment(environment);
    void this.loadEnvironment(environment);
    this.scene.environmentIntensity = environment === "neon" ? 0.12 : 0.55;
    this.stage.visible = false;
    this.world.visible = true;
    this.controls.enabled = false;
    this.scene.background = new THREE.Color(
      environment === "neon"
        ? "#101b2b"
        : environment === "coast"
          ? "#c9938a"
          : "#cba78e",
    );
    const fogColor = new THREE.Color(
      environment === "neon"
        ? "#101b2b"
        : environment === "coast"
          ? "#c9938a"
          : "#cba78e",
    );
    if (weather === "rain" || weather === "fog")
      fogColor.lerp(new THREE.Color("#55606a"), 0.45);
    if (weather === "snow") fogColor.lerp(new THREE.Color("#b8c4cf"), 0.5);
    this.scene.background = fogColor;
    this.exteriorFogColor.copy(fogColor);
    this.tunnel = false;
    const visibility: Record<string, Record<string, number>> = {
      neon: { clear: 420, rain: 300, snow: 260, fog: 180 },
      coast: { clear: 650, rain: 380, snow: 320, fog: 200 },
      canyon: { clear: 700, rain: 420, snow: 340, fog: 200 },
    };
    this.scene.fog = new THREE.FogExp2(
      fogColor,
      0.8326 / (visibility[environment]?.[weather] ?? 420),
    );
    const night = environment === "neon" || weather !== "clear";
    this.headlight.visible = night;
    this.headlight.intensity = night ? (environment === "neon" ? 60 : 30) : 0;
    this.sun.color.set(environment === "neon" ? "#9bb8ea" : "#ffdbab");
    this.ambient.intensity = environment === "neon" ? 0.65 : 1.5;
    this.sun.intensity = environment === "neon" ? 0.55 : 2.5;
    this.renderer.toneMappingExposure = environment === "neon" ? 1.2 : 0.95;
    if (weather !== "clear") {
      this.sun.intensity *= 0.55;
      this.ambient.intensity *= 0.85;
    }
  }
  setTunnel(inside: boolean) {
    if (inside === this.tunnel) return;
    if (inside) {
      this.exteriorAmbient = this.ambient.intensity;
      this.ambient.intensity = 0.55;
    } else this.ambient.intensity = this.exteriorAmbient;
    if (this.scene.fog)
      this.scene.fog.color.copy(
        inside ? new THREE.Color("#9b8d76") : this.exteriorFogColor,
      );
    this.tunnel = inside;
  }
  /** Compiles every race material up front so the first seconds do not stutter. */
  async precompile() {
    await this.loadEnvironment(this.environmentId);
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      /* Older drivers: compile lazily instead. */
    }
  }
  private loadEnvironment(id: string): Promise<void> {
    const names: Record<string, string> = {
      neon: "cobblestone_street_night",
      coast: "venice_sunset",
      canyon: "nowhere_road",
    };
    if (!names[id]) return Promise.resolve();
    if (this.hdrMaps.has(id)) {
      if (this.environmentId === id)
        this.scene.environment = this.hdrMaps.get(id)!.texture;
      return Promise.resolve();
    }
    const pending = this.hdrPending.get(id);
    if (pending) return pending;
    const task = new RGBELoader()
      .loadAsync(`${import.meta.env.BASE_URL}assets/hdri/${names[id]}_1k.hdr`)
      .then((texture) => {
        const pmrem = new THREE.PMREMGenerator(this.renderer),
          map = pmrem.fromEquirectangular(texture);
        texture.dispose();
        pmrem.dispose();
        this.hdrMaps.set(id, map);
        if (this.environmentId === id) this.scene.environment = map.texture;
      })
      .catch(() => {
        if (this.environmentId === id)
          this.scene.environment = this.environment.texture;
      });
    this.hdrPending.set(id, task);
    return task;
  }
  setQuality(quality: string) {
    this.automatic = quality === "auto";
    this.quality =
      quality === "auto" ? (innerWidth < 700 ? "low" : "medium") : quality;
    CarFactory.premium = this.quality === "high" || this.quality === "ultra";
    let dpr =
      this.quality === "low"
        ? 0.8
        : this.quality === "ultra"
          ? Math.min(devicePixelRatio, 2)
          : Math.min(devicePixelRatio, 1.4);
    if (this.quality === "medium" && this.integrated && innerWidth > 1000)
      dpr = Math.min(dpr, 1056 / innerWidth);
    this.renderScale = dpr;
    this.renderer.setPixelRatio(dpr);
    this.ao.enabled =
      this.quality !== "low" && !(this.quality === "medium" && this.integrated);
    this.ao.configuration.halfRes = this.quality === "medium";
    this.ao.setQualityMode(this.quality === "ultra" ? "High" : "Low");
    this.renderer.shadowMap.enabled = this.quality !== "low";
    this.sun.castShadow = this.quality !== "low";
    const size =
      this.quality === "ultra" ? 4096 : this.quality === "high" ? 2048 : 1024;
    const radius = ["high", "ultra"].includes(this.quality) ? 60 : 40;
    Object.assign(this.sun.shadow.camera, {
      left: -radius,
      right: radius,
      top: radius,
      bottom: -radius,
    });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.setSize(size, size);
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          material.needsUpdate = true;
      }
    });
    this.resize();
    this.applySceneryQuality();
  }
  private applySceneryQuality() {
    const density =
      (
        { low: 0.3, medium: 0.6, high: 1, ultra: 1.3 } as Record<string, number>
      )[this.quality] ?? 0.6;
    const distance =
      (
        { low: 0.7, medium: 1, high: 1.15, ultra: 1.3 } as Record<
          string,
          number
        >
      )[this.quality] ?? 1;
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh && o.userData.foliage)
        o.count = Math.max(
          1,
          Math.round((o.userData.fullCount * density) / 1.3),
        );
      if (o instanceof THREE.LOD) {
        o.userData.lodDistances ??= o.levels.map((l) => l.distance);
        o.levels.forEach(
          (l, i) => (l.distance = o.userData.lodDistances[i] * distance),
        );
      }
    });
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    if (this.garageFrame) this.frameGarage(this.garageFrame);
  }
  frameHome(rect: DOMRect | null) {
    this.homeFrame = rect;
  }
  frameGarage(rect: DOMRect, tab = this.garageTab) {
    const changed = tab !== this.garageTab;
    if (changed) {
      this.garageTab = tab;
      this.setStage(
        tab === "performance"
          ? "engine"
          : tab === "visual"
            ? "paint"
            : "garage",
      );
      this.camera.position.copy(this.stageTarget);
      this.stageTween = 1;
      if (this.stageCar) this.stageCar.root.rotation.y = 0;
    }
    this.controls.maxPolarAngle = Math.PI * (tab === "performance" ? .52 : .49);
    this.controls.minPolarAngle = Math.PI * 0.22;
    this.garageFrame = rect;
    if (this.stageCar && rect.width > 0 && rect.height > 0) {
      const center = fitCar(
        this.camera,
        carBounds(this.stageCar.root),
        rect,
        innerWidth,
        innerHeight,
      );
      this.controls.target.copy(center);
      this.controls.update();
    }
  }
  /** Orbiting never leaves the studio: the camera dollies in before the
   * back wall (z −11), side wall (x 16) or ceiling (y 7.6) can cover the car. */
  private orbitRadius = 0;
  private orbitClamped = -1;
  private keepCameraInStudio() {
    const target = this.controls.target,
      offset = this.camera.position.clone().sub(target);
    let length = offset.length();
    if (length < 1e-3) return;
    const dir = offset.clone().divideScalar(length);
    // Leaving a wall restores the framed distance instead of staying dollied in.
    if (this.orbitClamped > 0 && Math.abs(length - this.orbitClamped) < 0.01)
      length = this.orbitRadius;
    else this.orbitRadius = length;
    let limit = length;
    if (dir.z < 0) limit = Math.min(limit, (-10.3 - target.z) / dir.z);
    if (dir.x > 0) limit = Math.min(limit, (15.3 - target.x) / dir.x);
    if (dir.x < 0) limit = Math.min(limit, (-15.3 - target.x) / dir.x);
    if (dir.y > 0) limit = Math.min(limit, (6.6 - target.y) / dir.y);
    limit = Math.max(this.controls.minDistance, limit);
    this.orbitClamped = limit < length ? limit : -1;
    this.camera.position.copy(target).addScaledVector(dir, Math.min(limit, length));
  }
  private contentScreen: string | null = null;
  private contentFramePending = true;
  setContentScreen(state: string | null) {
    if (state !== this.contentScreen) this.contentFramePending = true;
    this.contentScreen = state;
  }
  render(dt: number) {
    if (this.contentScreen && !this.contentFramePending) return;
    this.contentFramePending = false;
    this.time += dt;
    this.aberrationPass.enabled = this.aberration.offset.lengthSq() > 0;
    this.grade.motion(
      this.time,
      this.speed,
      this.boosting,
      this.quality === "high" || this.quality === "ultra",
    );
    if (this.mode === "stage" && this.stageTween < 1) {
      this.stageTween = Math.min(1, this.stageTween + dt / 0.8);
      const k = 1 - (1 - this.stageTween) ** 3;
      this.camera.position.lerpVectors(this.stageFrom, this.stageTarget, k);
      this.stageLook.lerpVectors(this.stageLookFrom, this.stageLookTarget, k);
      this.camera.lookAt(this.stageLook);
    }
    if (this.automatic && !this.benchmarkDone && dt > 0) {
      this.benchmarkTime += dt;
      this.benchmarkFrames++;
      if (this.benchmarkTime > 2.5 && this.benchmarkFrames > 30) {
        if (this.benchmarkFrames / this.benchmarkTime < 48) {
          this.setQuality("low");
          this.automatic = true;
        }
        this.benchmarkDone = true;
      }
    }
    if (this.mode === "stage" && !this.controls.enabled && this.stageCar) {
      this.stageCar.root.rotation.y = Math.sin(this.time * 0.1) * 0.12 - 0.12;
      if (this.stagePreset === "online" && this.stageTween >= 1) {
        this.camera.position.set(
          6 + Math.sin(this.time * 0.15) * 1.2,
          2.7,
          8 + Math.cos(this.time * 0.15) * 0.8,
        );
        this.camera.lookAt(this.stageLookTarget);
      }
    }
    if (this.mode === "stage" && this.homeFrame && this.stageCar) {
      fitCar(
        this.camera,
        carBounds(this.stageCar.root),
        this.homeFrame,
        innerWidth,
        innerHeight,
        0.86,
      );
    }
    if (this.controls.enabled) {
      this.controls.update();
      this.keepCameraInStudio();
    }
    this.renderer.info.reset();
    const stageVisible = this.stage.visible,
      worldVisible = this.world.visible;
    // Pause keeps the frozen race behind its blurred panel; other content
    // screens draw over a cleared canvas.
    if (this.contentScreen && this.contentScreen !== "pause") {
      this.stage.visible = false;
      this.world.visible = false;
    }
    this.composer.render(dt);
    this.stage.visible = stageVisible;
    this.world.visible = worldVisible;
  }
  capture() {
    this.composer.render(0);
    return this.renderer.domElement.toDataURL("image/png");
  }
  setPaused(paused: boolean) {
    if (paused && this.pausedExposure === null) {
      this.pausedExposure = this.renderer.toneMappingExposure;
      this.renderer.toneMappingExposure = this.pausedExposure * 0.7;
    } else if (!paused && this.pausedExposure !== null) {
      this.renderer.toneMappingExposure = this.pausedExposure;
      this.pausedExposure = null;
    }
  }
  private sunOffset = new THREE.Vector3(15, 25, 10);
  followSun(position: THREE.Vector3, rotation?: THREE.Quaternion) {
    this.sun.position.copy(position).add(this.sunOffset);
    this.sun.target.position.copy(position);
    if (rotation && this.headlight.visible) {
      this.headlight.position
        .set(0, 0.9, 1.9)
        .applyQuaternion(rotation)
        .add(position);
      this.headlight.target.position
        .set(0, -0.6, 24)
        .applyQuaternion(rotation)
        .add(position);
    }
  }
}
