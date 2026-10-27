import { hudFit } from "../ui/RaceHUD";
import {
  rememberScroll,
  installScrolling,
  revealControl,
  decorateControls,
  rangeFill,
  smoothScroll,
  scrollPortFor,
  wheelPixels,
  type ScrollMemory,
} from "../ui/UIComfort";
import { setGauge } from "../ui/Loader";
import { liveGap } from "../ui/LiveOrder";
import {
  controlHintsVisible,
  standingsRows,
  HUDNotices,
} from "../ui/HUDPresentation";
import { carBounds, boxCorners } from "../render/CarFraming";
import { drawRaceMap } from "../ui/Minimap";
import { TRACK_SECTORS } from "../game/TrackGeometry";
import * as THREE from "three";
import GUI from "lil-gui";
import { Renderer } from "../render/Renderer";
import { CameraRig } from "../render/CameraRig";
import { Loop } from "./Loop";
import { Input } from "./Input";
import { Save, cleanName, lentCar, type OwnedCar } from "./Save";
import { StateMachine, type State } from "./StateMachine";
import { AudioManager, type SpatialSource } from "../audio/AudioManager";
import { CARS, carById, UPGRADES, type Upgrade } from "../data/cars";
import { TRACKS, MODES, type RaceMode } from "../data/tracks";
import { CAREER_EVENTS } from "../data/careerEvents";
import {
  checkAchievements,
  dailyChallenge,
  type Achievement,
} from "../data/achievements";
import {
  RaceManager,
  type NetRace,
  type RaceConfig,
  type RaceEvent,
  type RaceResult,
} from "../game/RaceManager";
import { TUNING } from "../data/tuning";
import { Screens, fmt, formatTime, formatDelta, esc } from "../ui/Screens";
import { cleanRoomCode, NetSession, type NetConfig } from "../net/Session";
import { checkNetwork, type NetworkKind } from "../net/Link";
import { isPortraitPhone } from "../ui/Mobile";
import type { NetPlayer } from "../game/RaceManager";
const MENU_STATES: State[] = [
  "title",
  "menu",
  "garage",
  "modes",
  "tracks",
  "career",
  "profile",
  "lobby",
];
const projected = new THREE.Vector3();
export class Game {
  save = new Save();
  private clearScrolling = () => {};
  private hintRace = 0;
  private notices = new HUDNotices();
  private checkpointNotice = "";
  private checkpointNoticeUntil = 0;
  renderer: Renderer;
  camera: CameraRig;
  input: Input;
  audio: AudioManager;
  machine: StateMachine;
  loop: Loop;
  screens: Screens;
  race: RaceManager | null = null;
  result: RaceResult | null = null;
  config: RaceConfig = {
    mode: "race",
    track: "neon_gp",
    laps: 2,
    difficulty: "normal",
    reverse: false,
    weather: "clear",
    rivals: 5,
  };
  garageTab = "collection";
  garageCap: number | null = null;
  settingsTab = "gameplay";
  profileTab: "overview" | "achievements" = "overview";
  previewCar = "kestrel";
  private armedCar: string | null = null;
  private wheelBrowseTime = 0;
  private wheelBrowseDelta = 0;
  private wheelBrowseSwitch = 0;
  /** Quick race setup is two pages: pick the circuit, then the conditions. */
  setupStep: "track" | "conditions" = "track";
  tier = 1;
  settingsReturn: State = "menu";
  showFPS = false;
  muted = false;
  /** Multiplayer session, while one is open. */
  net: NetSession | null = null;
  netUI = {
    reply: "",
    invite: "",
    busy: false,
    accept: null as null | ((reply: string) => Promise<void>),
    guest: null as NetSession | null,
    cancel: null as null | (() => void),
    /** Manual copy-paste codes (works with no room server) are tucked away. */
    manual: false,
    network: "" as "" | "checking" | NetworkKind,
  };
  /** Room code from an invite link (?room=CODE), joined once the player is in. */
  pendingRoom = cleanRoomCode(
    new URLSearchParams(location.search).get("room") ?? "",
  );
  chatLog: { name: string; text: string }[] = [];
  lastUnlocks: Achievement[] = [];
  dailyResult = "";
  private netGrid: NetPlayer[] = [];
  private netTimer = 0;
  private hudTick = 0;
  private standingsTick = 0;
  private replayTime = 0;
  private debug: GUI | null = null;
  private photoReturn: State = "pause";
  private toastTimer = 0;
  private toastMessage = "";
  private toastKind = "";
  private toastQueue: { message: string; kind: string }[] = [];
  private hud = new Map<string, HTMLElement | null>();
  private minimapBase: HTMLCanvasElement | null = null;
  private minimapRace: RaceManager | null = null;
  private minimapTransform = { scale: 1, cx: 0, cz: 0 };
  private nameplates: HTMLElement[] = [];
  private statsMerged = false;
  private lastHovered: Element | null = null;
  private enterTimer = 0;
  private saveTimer = 0;
  private lastRendered: State | null = null;
  private backTransition = false;
  private restoringScreen = false;
  private hoverFocus = false;
  private skipIntro = false;
  private orbitHintTimer = 0;
  private orbitHintDismissed = false;
  constructor(
    private app: HTMLElement,
    canvas: HTMLCanvasElement,
  ) {
    if (this.save.data.settings.lastRace)
      this.config = { ...this.save.data.settings.lastRace };
    this.renderer = new Renderer(canvas);
    this.renderer.showCar(
      carById(this.save.data.garage.activeCar),
      this.save.active.visual,
    );
    this.renderer.setQuality(this.save.data.settings.quality);
    this.renderer.setStage();
    this.camera = new CameraRig(this.renderer.camera);
    this.camera.mode = this.save.data.settings.camera;
    this.camera.shakeEnabled = this.save.data.settings.shake;
    this.camera.fov = this.save.data.settings.fov;
    this.input = new Input(() => this.save.data.settings.bindings);
    this.input.deadzone = this.save.data.settings.deadzone;
    this.audio = new AudioManager(this.save.data.settings.audio);
    this.screens = new Screens(this);
    this.machine = new StateMachine((s, p) => this.enter(s, p));
    document.body.classList.add("input-pointer");
    window.addEventListener(
      "pointerdown",
      () => {
        document.body.classList.add("input-pointer");
        document.body.classList.remove("input-keys");
      },
      true,
    );
    window.addEventListener(
      "keydown",
      () => {
        document.body.classList.add("input-keys");
        document.body.classList.remove("input-pointer");
      },
      true,
    );
    window.addEventListener(
      "pointermove",
      () => {
        document.body.classList.add("input-pointer");
        document.body.classList.remove("input-keys");
      },
      { passive: true },
    );
    this.input.onAction = (key) => {
      document.body.classList.add("input-keys");
      document.body.classList.remove("input-pointer");
      this.action(key);
    };
    this.previewCar = this.save.data.garage.activeCar;
    this.app.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-action]",
      );
      if (el && !el.hasAttribute("disabled")) {
        void this.audio.start();
        this.audio.sfx(el.dataset.action === "back" ? "back" : "click");
        this.click(el.dataset.action!, el);
      }
    });
    this.app.addEventListener("mouseover", (e) => {
      const el = (e.target as HTMLElement).closest(
        "button:not([disabled]),.track-card",
      );
      if (el && el !== this.lastHovered) {
        this.audio.sfx("hover");
        // One highlight at a time: the hovered menu entry takes focus.
        if (
          el instanceof HTMLElement &&
          el.matches(".home-entry,.mode-tab,.settings-tabs button") &&
          document.activeElement !== el
        ) {
          this.hoverFocus = true;
          el.focus({ preventScroll: true });
          this.hoverFocus = false;
        }
      }
      this.lastHovered = el;
    });
    this.app.addEventListener("focusin", (e) => {
      const target = e.target as HTMLElement,
        stage = target.dataset.stage;
      if (!this.restoringScreen && !this.hoverFocus) revealControl(target);
      if (stage && this.machine.current === "menu") {
        this.renderer.setStage(stage);
        this.renderer.controls.enabled = false;
      }
    });
    window.addEventListener(
      "wheel",
      (e) => {
        if (
          !MENU_STATES.includes(this.machine.current) &&
          this.machine.current !== "settings"
        )
          return;
        const target = e.target as HTMLElement;
        const list = target.closest(
          ".car-list,.mode-strip,.garage-rail",
        ) as HTMLElement | null;
        if (
          list &&
          list.scrollWidth > list.clientWidth + 1 &&
          Math.abs(e.deltaY) > Math.abs(e.deltaX)
        ) {
          e.preventDefault();
          smoothScroll(list, wheelPixels(e), 0);
          return;
        }
        if (target.closest(".carousel")) {
          // Trackpads send long bursts of small deltas: one notch of travel
          // (or one mouse click) moves exactly one circuit.
          e.preventDefault();
          const now = performance.now();
          // A pause of 220 ms ends the gesture; each gesture moves once.
          // A held scroll re-arms after 450 ms so a long wheel spin keeps browsing.
          if (
            now - this.wheelBrowseTime > 220 ||
            (Number.isNaN(this.wheelBrowseDelta) &&
              now - this.wheelBrowseSwitch > 450)
          )
            this.wheelBrowseDelta = 0;
          this.wheelBrowseTime = now;
          if (Number.isNaN(this.wheelBrowseDelta)) return;
          this.wheelBrowseDelta += wheelPixels(e) + e.deltaX;
          if (Math.abs(this.wheelBrowseDelta) > 40) {
            this.click(
              this.wheelBrowseDelta > 0 ? "track-next" : "track-prev",
              target,
            );
            this.wheelBrowseSwitch = now;
            this.wheelBrowseDelta = NaN;
          }
          return;
        }
        const port = scrollPortFor(target, this.app, e.deltaY > 0);
        if (port && !e.ctrlKey) {
          e.preventDefault();
          smoothScroll(port, 0, wheelPixels(e));
        }
      },
      { passive: false, capture: true },
    );
    this.app.addEventListener(
      "scroll",
      () => {
        if (this.machine.current === "menu") this.frameHome();
        if (this.machine.current === "garage") {
          this.frameGarage();
          this.updateGarageArrows();
        }
      },
      true,
    );
    canvas.addEventListener("pointerdown", () => {
      if (this.machine.current === "garage") this.dismissOrbitHint();
    });
    this.app.addEventListener("change", (e) =>
      this.change(e.target as HTMLInputElement),
    );
    this.app.addEventListener("input", (e) =>
      this.liveInput(e.target as HTMLInputElement),
    );
    this.app.addEventListener("keydown", (e) => this.textKey(e));
    window.addEventListener("resize", () => {
      if (this.machine.current === "menu") this.frameHome();
      if (this.machine.current === "garage") this.frameGarage();
      const hud = document.querySelector<HTMLElement>(".race-hud");
      if (hud)
        hud.style.setProperty(
          "--hud-scale",
          String((this.save.data.settings.hudScale / 100) * hudFit()),
        );
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.machine.current === "race")
        this.machine.go("pause");
    });
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      if (this.machine.current === "race") this.machine.go("pause");
      this.toast("Graphics context interrupted. Waiting for browser recovery.");
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.net?.close("Graphics driver reset; the game reloaded.");
      location.reload();
    });
    // Turning a phone upright mid-race covers the game with the rotate prompt.
    matchMedia("(orientation: portrait)").addEventListener("change", () => {
      if (isPortraitPhone() && this.machine.current === "race")
        this.machine.go("pause");
    });
    window.addEventListener("beforeunload", () => {
      this.net?.close("Closed or reloaded the game.");
      this.save.persist();
    });
    this.loop = new Loop(
      (dt) => this.fixed(dt),
      (dt, alpha) => this.render(dt, alpha),
    );
    this.enter("title", "title");
    this.loop.start();
    if (this.save.warning) this.toast(this.save.warning);
  }
  enter(state: State, previous: State) {
    this.renderer.frameHome(null);
    this.renderer.setContentScreen(
      ["title", "menu", "garage", "race", "photo", "replay"].includes(state)
        ? null
        : state,
    );
    this.input.clear();
    const changed = state !== previous;
    this.app.className = `state-${state}${changed ? " screen-enter" : ""}`;
    this.app.style.setProperty(
      "--enter-x",
      this.backTransition ? "-24px" : "24px",
    );
    this.backTransition = false;
    if (state === "modes" || state === "tracks") {
      this.config.eventId = undefined;
      if (previous !== "modes" && previous !== "tracks")
        this.setupStep = "track";
    }
    clearTimeout(this.enterTimer);
    if (changed)
      this.enterTimer = window.setTimeout(
        () => this.app.classList.remove("screen-enter"),
        240,
      );
    if (this.pendingRoom && state === "menu" && previous === "title")
      queueMicrotask(() => this.machine.go("lobby"));
    if (this.pendingRoom && state === "lobby" && !this.net) {
      const code = this.pendingRoom;
      this.pendingRoom = "";
      history.replaceState(null, "", location.pathname);
      setTimeout(() => {
        const input = document.getElementById("join-code") as HTMLInputElement;
        if (input) input.value = code;
        void this.netAction("net-join");
      });
    }
    if (state === "results" && previous !== "replay") this.resultTab = null;
    if (MENU_STATES.includes(state)) {
      this.skipIntro = false;
      this.renderer.setStage(
        state === "garage" ? true : state === "title" ? "title" : false,
      );
      if (state !== "garage")
        this.renderer.showCar(
          carById(this.save.data.garage.activeCar),
          this.save.active.visual,
        );
      this.audio.setMusic("afterglow", 0);
      this.audio.silenceSpatial();
    }
    this.audio.setMuffled(
      state === "pause" || (state === "settings" && previous === "pause"),
    );
    if (state === "garage") {
      this.orbitHintDismissed = false;
      clearTimeout(this.orbitHintTimer);
      this.orbitHintTimer = window.setTimeout(
        () => this.dismissOrbitHint(),
        4000,
      );
      this.armedCar = null;
      const ride = this.raceCar();
      this.previewCar = ride.id;
      this.renderer.showCar(carById(ride.id), ride.owned.visual);
    }
    if (state === "settings" && previous !== "settings")
      this.settingsReturn = previous === "pause" ? "pause" : "menu";
    this.renderer.setPaused(
      !!this.race &&
        (state === "pause" ||
          (state === "settings" && this.settingsReturn === "pause")),
    );
    if (state === "prerace") {
      void this.startRace();
      return;
    }
    if (state === "race") {
      this.renderer.mode = "race";
      this.renderer.controls.enabled = false;
      if (this.race) this.audio.setMusic(this.songFor(), 1);
    }
    if (state === "results" && this.race)
      this.audio.setMusic(this.songFor(), 0);
    if (state === "photo") {
      this.photoReturn = previous;
      this.renderer.mode = "photo";
      this.renderer.controls.target.copy(this.race!.player.position);
      this.renderer.controls.enabled = true;
    }
    if (state === "replay") {
      this.replayTime = 0;
      this.renderer.mode = "race";
      this.renderer.controls.enabled = false;
    }
    this.screen();
  }
  private songFor() {
    const env =
      TRACKS.find((t) => t.id === this.race?.config.track)?.environment ??
      "neon";
    return env;
  }
  /** Re-renders the current screen, keeping typed-in text and focus. */
  screen() {
    const s = this.machine.current,
      ui = this.screens;
    const kept = new Map<string, string>();
    this.app
      .querySelectorAll<HTMLInputElement>("[data-keep]")
      .forEach((el) => kept.set(el.id, el.value));
    const focused = (document.activeElement as HTMLElement | null)?.id;
    const focusedAction = (document.activeElement as HTMLElement | null)
      ?.dataset.action;
    const focusedControl = (document.activeElement as HTMLElement | null)
      ?.dataset.control;
    const focusedValue = (document.activeElement as HTMLElement | null)?.dataset
      .value;
    const scroll = rememberScroll(this.app);
    this.clearScrolling();
    const views: Partial<Record<State, () => string>> = {
      title: () => ui.menu(true),
      menu: () => ui.menu(false),
      garage: () => ui.garage(),
      modes: () => ui.modes(),
      tracks: () => ui.tracks(),
      career: () => ui.career(),
      settings: () => ui.settings(),
      pause: () => ui.pause(),
      results: () => ui.results(),
      race: () => ui.hud(),
      photo: () => ui.photo(),
      replay: () => ui.replay(),
      profile: () => ui.profile(),
      lobby: () => ui.lobby(),
    };
    this.app.innerHTML = views[s]?.() ?? "";
    if (s === "menu") this.frameHome();
    if (s === "garage") {
      this.frameGarage();
      this.updateGarageArrows();
      if (this.orbitHintDismissed)
        this.app.querySelector(".orbit-hint")?.classList.add("dismissed");
    }
    for (const [id, value] of kept) {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el && id !== "driver-name") el.value = value;
    }
    if (s === "results" && s !== this.lastRendered) {
      document.scrollingElement?.scrollTo({
        top: 0,
        left: 0,
        behavior: "instant",
      });
      this.app.querySelectorAll(".results-page,.result-card").forEach((el) => {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      });
    }
    this.restoringScreen = true;
    if (focused && s === this.lastRendered)
      document.getElementById(focused)?.focus({ preventScroll: true });
    else if (focusedControl && s === this.lastRendered) {
      const controls = [
        ...this.app.querySelectorAll<HTMLElement>(
          "[data-control]:not([disabled])",
        ),
      ].filter((e) => e.dataset.control === focusedControl);
      (
        controls.find((e) => e.dataset.value === focusedValue) ?? controls[0]
      )?.focus({ preventScroll: true });
    } else if (focusedAction && s === this.lastRendered)
      [...this.app.querySelectorAll<HTMLElement>("[data-action]")]
        .find((e) => e.dataset.action === focusedAction)
        ?.focus({ preventScroll: true });
    if (s !== this.lastRendered && s !== "race")
      (
        this.app.querySelector<HTMLElement>("[data-autofocus]") ??
        this.app.querySelector<HTMLElement>(
          (
            {
              career: ".career-event button:not([disabled])",
              settings:
                ".setting-row input:not([type=hidden]),.setting-row button:not([disabled])",
              garage: ".car-row.selected",
              pause: '[data-action="resume"]',
              results: ".result-actions .primary",
              lobby:
                '#join-code:not([disabled]),[data-action="net-ready"],[data-action="copy-link"],.net-entry button:not([disabled])',
            } as Record<string, string>
          )[s] ??
            "main button:not(.back-link):not([disabled]),main input:not([type=hidden])",
        )
      )?.focus({ preventScroll: true });
    if (
      s !== this.lastRendered &&
      s !== "race" &&
      !this.app.contains(document.activeElement)
    ) {
      const main = this.app.querySelector<HTMLElement>("main");
      if (main) {
        main.tabIndex = -1;
        main.focus({ preventScroll: true });
      }
    }
    this.prepareUI(s === this.lastRendered ? scroll : undefined);
    this.restoringScreen = false;
    this.lastRendered = s;
    this.hud.clear();
    this.nameplates = [];
    this.notices = new HUDNotices();
    if (s === "results") this.countUp();
    if (this.toastTimer > 0) this.showToast();
  }
  private prepareUI(memory?: ScrollMemory) {
    this.clearScrolling();
    decorateControls(this.app, this);
    this.clearScrolling = installScrolling(this.app, memory);
  }
  private el(id: string) {
    if (!this.hud.has(id)) this.hud.set(id, document.getElementById(id));
    return this.hud.get(id)!;
  }
  private frameHome() {
    const stage = this.app.querySelector(".home-stage");
    this.renderer.frameHome(stage ? stage.getBoundingClientRect() : null);
  }
  private frameGarage() {
    const stage = this.app.querySelector(".garage-stage");
    if (stage)
      this.renderer.frameGarage(stage.getBoundingClientRect(), this.garageTab);
  }
  private dismissOrbitHint() {
    this.orbitHintDismissed = true;
    this.app.querySelector(".orbit-hint")?.classList.add("dismissed");
  }
  private updateGarageArrows() {
    const cards = [
      ...this.app.querySelectorAll<HTMLElement>(
        '.car-row[data-action^="preview-"]',
      ),
    ];
    const index = cards.findIndex(
      (c) => c.dataset.action === `preview-${this.previewCar}`,
    );
    const prev = this.app.querySelector<HTMLButtonElement>(
        "[data-action=garage-prev]",
      ),
      next = this.app.querySelector<HTMLButtonElement>(
        "[data-action=garage-next]",
      );
    if (prev) {
      prev.disabled = index <= 0;
      prev.title = prev.disabled
        ? "First car — no previous car"
        : "Previous car";
    }
    if (next) {
      next.disabled = index < 0 || index >= cards.length - 1;
      next.title = next.disabled ? "Last car — no next car" : "Next car";
    }
  }
  private countUp() {
    const position = this.app.querySelector<HTMLElement>(".result-position");
    if (
      position &&
      this.result &&
      this.config.mode !== "drift" &&
      position.firstChild
    )
      position.firstChild.textContent = `P${this.result.position}`;
    this.app.querySelector(".results-page")?.classList.add("scroll-page");
    if (this.result?.position === 1) {
      this.app.querySelector(".results-page")?.classList.add("winner");
      this.app
        .querySelector(".result-heading")
        ?.insertAdjacentHTML(
          "beforeend",
          `<div class="confetti" aria-hidden="true">${Array.from({ length: 32 }, (_, i) => `<i style="--i:${i};--x:${(i * 37) % 100}%"></i>`).join("")}</div>`,
        );
    }
    const items = [...this.app.querySelectorAll<HTMLElement>("[data-count]")];
    const start = performance.now() + 1500;
    const step = () => {
      const k = Math.max(0, Math.min(1, (performance.now() - start) / 1200)),
        e = 1 - (1 - k) ** 3;
      for (const el of items)
        el.textContent = fmt(Number(el.dataset.count) * e);
      if (k < 1 && items[0]?.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  /** Results card shown on phones (null: the default for this result). */
  resultTab: "run" | "order" | "payoff" | null = null;
  /** Car picked in the garage while an open-garage online room is active. */
  onlineCar: string | null = null;
  /** The host lends every car fully upgraded to everyone in this room. */
  get openGarage() {
    return this.net?.config.garage === "open";
  }
  /** The car (and its upgrades) this player races with right now. */
  raceCar(): { id: string; owned: OwnedCar } {
    const garage = this.save.data.garage;
    if (!this.openGarage) return { id: garage.activeCar, owned: this.save.active };
    const id = CARS.some((c) => c.id === this.onlineCar)
      ? this.onlineCar!
      : garage.activeCar;
    return { id, owned: lentCar(id, garage.owned[id]) };
  }
  private sessionProfile() {
    const car = this.raceCar();
    return {
      name: this.save.data.profile.name,
      car: car.id,
      visual: car.owned.visual,
    };
  }
  private profileChanged() {
    this.net?.updateProfile(this.sessionProfile());
  }
  click(a: string, el: HTMLElement) {
    if (a.startsWith("profile-tab-")) {
      this.profileTab = a.slice(12) as Game["profileTab"];
      this.screen();
      return;
    }
    if (a.startsWith("settings-tab-")) {
      this.settingsTab = a.slice(13);
      this.screen();
      return;
    }
    if (a.startsWith("garage-cap-")) {
      this.garageCap = Number(a.slice(11));
      this.machine.go("garage");
      return;
    }
    if (a === "garage-clear-filter") {
      this.garageCap = null;
      this.screen();
      return;
    }
    if (a === "control") {
      const input = document.getElementById(
        el.dataset.control!,
      ) as HTMLInputElement;
      if (!input) return;
      input.value = el.dataset.value!;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      this.screen();
      (
        this.app.querySelector<HTMLElement>(
          `[data-control="${input.id}"][data-value="${input.value}"]:not([disabled])`,
        ) ??
        this.app.querySelector<HTMLElement>(
          `[data-control="${input.id}"]:not([disabled])`,
        )
      )?.focus();
      return;
    }
    if (a === "track-prev" || a === "track-next") {
      const i = TRACKS.findIndex((t) => t.id === this.config.track);
      this.config.track =
        TRACKS[
          (i + (a === "track-next" ? 1 : -1) + TRACKS.length) % TRACKS.length
        ].id;
      this.rememberRace();
      this.screen();
      return;
    }
    if (a.startsWith("net-") || a.startsWith("copy-")) {
      void this.netAction(a);
      return;
    }
    if (a === "enter" || a === "play") {
      this.machine.go(a === "play" ? "modes" : "menu");
      return;
    }
    if (a === "quick") {
      this.config = { ...this.config, mode: "race", eventId: undefined };
      this.machine.go("tracks");
      return;
    }
    if (a === "daily") {
      const d = dailyChallenge();
      this.config = {
        ...this.config,
        mode: d.mode,
        track: d.track,
        laps: d.laps,
        reverse: d.reverse,
        weather: d.weather,
        rivals: 5,
        difficulty: "normal",
        eventId: "daily",
      };
      this.machine.go("prerace");
      return;
    }
    if (a === "back") {
      this.back();
      return;
    }
    if (a === "sound") {
      this.muted = !this.muted;
      this.audio.configure({
        ...this.save.data.settings.audio,
        master: this.muted ? 0 : this.save.data.settings.audio.master,
      });
      this.screen();
      return;
    }
    if (a.startsWith("mode-")) {
      this.config.mode = a.slice(5) as RaceMode;
      this.config.eventId = undefined;
      this.rememberRace();
      this.machine.go("tracks");
      return;
    }
    if (a === "setup-again") {
      // After a race, pick the next circuit with the same mode and conditions.
      this.config.eventId = undefined;
      this.machine.go("tracks");
      return;
    }
    if (a === "setup-next" || a === "setup-track") {
      this.setupStep = a === "setup-next" ? "conditions" : "track";
      this.lastRendered = null;
      this.screen();
      this.app.style.setProperty(
        "--enter-x",
        a === "setup-track" ? "-24px" : "24px",
      );
      this.app.classList.add("screen-enter");
      clearTimeout(this.enterTimer);
      this.enterTimer = window.setTimeout(
        () => this.app.classList.remove("screen-enter"),
        240,
      );
      return;
    }
    if (a.startsWith("track-")) {
      // Clicking the circuit already in the middle confirms it.
      if (this.config.track === a.slice(6) && el.closest(".offset-0")) {
        this.click("setup-next", el);
        return;
      }
      this.config.track = a.slice(6);
      this.rememberRace();
      this.screen();
      return;
    }
    if (a === "start" || a === "restart") {
      if (this.net) return;
      if (a === "start") this.rememberRace();
      // A restart goes straight to the chase camera behind the car on the grid.
      this.skipIntro = a === "restart";
      this.machine.go("prerace");
      return;
    }
    if (a === "pause") {
      this.machine.go("pause");
      return;
    }
    if (a === "camera") {
      this.camera.mode = (this.camera.mode + 1) % 4;
      this.camera.reset();
      return;
    }
    if (a === "reset-car") {
      this.race?.reset();
      return;
    }
    if (a === "resume") {
      this.machine.go("race");
      return;
    }
    if (a === "quit") {
      this.mergeStats(null);
      if (this.net?.isHost) {
        this.net.returnToLobby();
        return;
      }
      this.net?.retire();
      this.disposeRace();
      this.machine.go(this.net ? "lobby" : "menu");
      return;
    }
    if (a === "photo") {
      this.machine.go("photo");
      return;
    }
    if (a === "photo-back") {
      this.renderer.controls.enabled = false;
      this.machine.go(this.photoReturn);
      return;
    }
    if (a === "capture") {
      const link = document.createElement("a");
      link.download = `velox-${Date.now()}.png`;
      link.href = this.renderer.capture();
      link.click();
      this.toast("Photo saved.");
      return;
    }
    if (a === "replay" && this.race?.replay.length) {
      this.machine.go("replay");
      return;
    }
    if (a === "results") {
      this.machine.go("results");
      return;
    }
    if (a.startsWith("tab-")) {
      this.armedCar = null;
      this.garageTab = a.slice(4);
      if (["visual", "performance"].includes(this.garageTab)) {
        const ride = this.raceCar();
        this.previewCar = ride.id;
        this.renderer.showCar(carById(ride.id), ride.owned.visual);
      }
      this.screen();
      return;
    }
    if (a.startsWith("preview-")) {
      const id = a.slice(8);
      if (this.previewCar === id && this.armedCar === id) {
        this.click(
          `${this.save.data.garage.owned[id] ? "activate" : "buy"}-${id}`,
          el,
        );
        return;
      }
      this.armedCar = id;
      this.previewCar = a.slice(8);
      const o = this.save.data.garage.owned[this.previewCar];
      this.renderer.showCar(
        carById(this.previewCar),
        o?.visual ?? {
          ...this.save.active.visual,
          paint: carById(this.previewCar).color,
        },
      );
      this.screen();
      return;
    }
    if (a === "garage-prev" || a === "garage-next") {
      // Arrows step the preview through the cars on show (not the dealer card).
      const cards = [
        ...this.app.querySelectorAll<HTMLElement>(
          '.car-row[data-action^="preview-"]',
        ),
      ];
      // Keyboard steps from the focused card; the on-screen arrows from the preview.
      const fromCard = el.matches(".car-row");
      const index = fromCard
        ? cards.indexOf(el)
        : cards.findIndex(
            (c) => c.dataset.action === `preview-${this.previewCar}`,
          );
      const next =
        cards[
          Math.max(
            0,
            Math.min(cards.length - 1, index + (a === "garage-next" ? 1 : -1)),
          )
        ];
      if (!next || cards.indexOf(next) === index) return;
      // Stepping only previews: never let it confirm an armed purchase.
      this.armedCar = null;
      this.click(next.dataset.action!, next);
      const selected = this.app.querySelector<HTMLElement>(
        `.car-row[data-action="${next.dataset.action}"]`,
      );
      if (fromCard) selected?.focus({ preventScroll: true });
      if (selected) revealControl(selected);
      this.updateGarageArrows();
      return;
    }
    if (a.startsWith("result-tab-")) {
      this.resultTab = a.slice(11) as Game["resultTab"];
      this.screen();
      return;
    }
    if (a.startsWith("online-car-")) {
      const id = a.slice(11);
      if (this.openGarage && CARS.some((c) => c.id === id)) {
        this.onlineCar = id;
        this.audio.sfx("buy");
        this.toast(`${carById(id).name} is your ride for this room.`, "online");
        this.profileChanged();
        this.screen();
      }
      return;
    }
    if (a.startsWith("activate-")) {
      const id = a.slice(9);
      if (this.save.data.garage.owned[id]) {
        this.save.data.garage.activeCar = id;
        this.save.persist();
        this.profileChanged();
        this.screen();
      }
      return;
    }
    if (a.startsWith("buy-")) {
      if (this.save.buy(a.slice(4))) {
        this.audio.sfx("buy");
        this.toast("New ride added to your garage.");
        this.garageTab = "collection";
        this.profileChanged();
        this.unlockAchievements();
        this.screen();
      } else this.audio.sfx("error");
      return;
    }
    if (a.startsWith("upgrade-")) {
      const k = a.slice(8) as Upgrade;
      if (
        UPGRADES.some((u) => u.id === k) &&
        this.save.upgrade(this.previewCar, k)
      ) {
        this.audio.sfx("buy");
        this.unlockAchievements();
        this.screen();
        this.toast("Upgrade fitted. Ready for the streets.");
      } else this.audio.sfx("error");
      return;
    }
    if (a.startsWith("paint-")) {
      this.save.active.visual.paint = a.slice(6);
      this.save.persist();
      this.renderer.stageCar?.apply(this.save.active.visual);
      this.profileChanged();
      this.screen();
      return;
    }
    if (a.startsWith("tier-")) {
      this.tier = Number(a.slice(5));
      this.screen();
      return;
    }
    if (a.startsWith("event-")) {
      const e = CAREER_EVENTS.find((e) => e.id === a.slice(6));
      if (
        e &&
        e.tier <= this.save.data.career.unlockedTier &&
        this.save.pi <= e.maxPI
      ) {
        this.config = {
          ...this.config,
          mode: e.mode,
          track: e.track,
          laps: e.laps,
          eventId: e.id,
          rivals: 5,
          reverse: false,
          weather: "clear",
          difficulty: e.tier < 2 ? "easy" : e.tier === 2 ? "normal" : "hard",
        };
        this.machine.go("prerace");
      }
      return;
    }
    if (a.startsWith("rebind-")) {
      const key = a.slice(7);
      el.querySelector("kbd")!.textContent = "PRESS KEY";
      this.app.insertAdjacentHTML(
        "beforeend",
        '<div class="confirm-backdrop rebind-modal" role="dialog" aria-modal="true"><section class="confirm-panel"><h2>Press a key…</h2><p>Choose a keyboard binding. ESC cancels.</p></section></div>',
      );
      this.input.capture = (code) => {
        if (code === "Escape") {
          this.input.capture = null;
          this.screen();
          return;
        }
        if (
          /^(Key[A-Z]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right)|Control(Left|Right)|Digit[0-9])$/.test(
            code,
          )
        ) {
          for (const [k, v] of Object.entries(this.save.data.settings.bindings))
            if (v === code && k !== key)
              this.save.data.settings.bindings[k] =
                this.save.data.settings.bindings[key];
          this.save.data.settings.bindings[key] = code;
          this.save.persist();
          this.input.capture = null;
          this.screen();
        }
      };
      return;
    }
    if (a === "reset-progress") {
      this.confirmReset();
      return;
    }
    if (a === "cancel-reset") {
      this.screen();
      return;
    }
    if (a === "confirm-reset") {
      this.save.reset();
      this.audio.configure(this.save.data.settings.audio);
      this.renderer.showCar(carById("kestrel"), this.save.active.visual);
      this.profileChanged();
      this.screen();
      this.toast("Local progress reset. Fresh streets ahead.");
      return;
    }
    if (a === "fullscreen") {
      if (!document.fullscreenElement)
        void document.documentElement
          .requestFullscreen()
          .catch(() =>
            this.toast("Fullscreen is unavailable in this browser."),
          );
      else void document.exitFullscreen();
      return;
    }
    if (
      [
        "menu",
        "garage",
        "career",
        "modes",
        "settings",
        "profile",
        "lobby",
      ].includes(a)
    )
      this.machine.go(a as State);
  }
  private rememberRace() {
    this.save.data.settings.lastRace = { ...this.config, eventId: undefined };
    this.save.persist();
  }
  change(el: HTMLInputElement) {
    const lobbyHost = this.machine.current === "lobby" && this.net?.isHost;
    if (lobbyHost) {
      const patch: Partial<NetConfig> = {};
      if (el.id === "net-mode") patch.mode = el.value as RaceMode;
      if (el.id === "net-track") patch.track = el.value;
      if (el.id === "net-garage")
        patch.garage = el.value === "open" ? "open" : "own";
      if (el.id === "laps") patch.laps = Number(el.value);
      if (el.id === "direction") patch.reverse = el.value === "reverse";
      if (el.id === "weather") patch.weather = el.value;
      this.net!.setConfig(patch);
      return;
    }
    if (el.id === "laps") this.config.laps = Number(el.value);
    if (el.id === "rivals") this.config.rivals = Number(el.value);
    if (el.id === "difficulty")
      this.config.difficulty = el.value as RaceConfig["difficulty"];
    if (el.id === "direction") {
      this.config.reverse = el.value === "reverse";
      this.screen();
    }
    if (el.id === "weather") this.config.weather = el.value;
    if (
      ["laps", "rivals", "difficulty", "direction", "weather"].includes(el.id)
    )
      this.rememberRace();
    if (el.id === "driver-name") {
      this.save.data.profile.name = cleanName(el.value);
      this.save.persist();
      this.profileChanged();
      this.screen();
    }
    if (el.dataset.visual) {
      const k = el.dataset.visual,
        v = this.save.active.visual;
      if (k === "spoiler") v.spoiler = Number(el.value);
      else if (k === "tint") v.tint = Number(el.value);
      else if (k === "underglow") v.underglow = el.value || null;
      else if (k === "livery") v.livery = el.value || null;
      else if (["paint", "finish", "rim", "rimColor", "caliper"].includes(k))
        (v as unknown as Record<string, string>)[k] = el.value;
      this.renderer.stageCar?.apply(v);
      this.save.persist();
      this.profileChanged();
    }
    if (el.dataset.setting) {
      const s = this.save.data.settings,
        k = el.dataset.setting;
      if (k === "quality") {
        s.quality = el.value;
        this.renderer.setQuality(el.value);
      }
      if (k === "units") s.units = el.value;
      if (k === "camera") this.camera.mode = s.camera = Number(el.value);
      if (k === "manual") s.manual = el.checked;
      if (k === "shake") this.camera.shakeEnabled = s.shake = el.checked;
      if (k === "names") s.names = el.checked;
      if (k === "sensitivity") s.sensitivity = Number(el.value);
      if (k === "fov") this.camera.fov = s.fov = Number(el.value);
      if (k === "deadzone") this.input.deadzone = s.deadzone = Number(el.value);
      if (k === "hudScale") s.hudScale = Number(el.value);
      if (k === "colorSafe") s.colorSafe = el.checked;
      if (k === "touchDrag") s.touchDrag = el.checked;
      if (k === "showControlHints") s.showControlHints = el.checked;
      this.save.persist();
    }
    if (el.dataset.assist) {
      this.save.data.settings.assists[
        el.dataset.assist as keyof typeof this.save.data.settings.assists
      ] = el.checked;
      this.save.persist();
    }
    if (el.dataset.audio) {
      this.save.data.settings.audio[
        el.dataset.audio as keyof typeof this.save.data.settings.audio
      ] = Number(el.value);
      this.audio.configure(this.save.data.settings.audio);
      this.save.persist();
    }
  }
  liveInput(el: HTMLInputElement) {
    if (el.type === "range") {
      rangeFill(el);
      const output = el.parentElement?.querySelector("output");
      if (output) output.textContent = el.value;
      if (el.dataset.setting) this.change(el);
    }
    if (
      el.dataset.visual &&
      ["paint", "rimColor", "caliper", "tint"].includes(el.dataset.visual)
    ) {
      const v = this.save.active.visual;
      if (el.dataset.visual === "tint") v.tint = Number(el.value);
      else
        (v as unknown as Record<string, string>)[el.dataset.visual] = el.value;
      this.renderer.stageCar?.apply(v);
    }
    if (el.dataset.audio) {
      this.change(el);
      const label = document.querySelector(`#audio-label-${el.dataset.audio}`);
      if (label) label.textContent = `${Math.round(Number(el.value) * 100)}%`;
    }
  }
  /** Enter/Escape inside chat boxes and code fields. */
  private textKey(e: KeyboardEvent) {
    const t = e.target as HTMLInputElement;
    if (t.id === "race-chat") {
      if (e.key === "Enter") {
        this.net?.chat(t.value);
        t.value = "";
        t.hidden = true;
        t.blur();
      }
      if (e.key === "Escape") {
        t.hidden = true;
        t.blur();
      }
      e.stopPropagation();
    }
    if (t.id === "chat-input" && e.key === "Enter") {
      this.net?.chat(t.value);
      t.value = "";
    }
    if (t.id === "driver-name" && e.key === "Enter") t.blur();
    if (t.id === "join-code" && e.key === "Enter") void this.netAction("net-join");
    if (t.id === "join-code" && e.key !== "Enter")
      requestAnimationFrame(() => {
        const clean = cleanRoomCode(t.value);
        if (clean !== t.value) t.value = clean;
      });
  }
  confirmReset() {
    this.app.insertAdjacentHTML(
      "beforeend",
      `<div class="confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="reset-title"><section class="confirm-panel"><p class="eyebrow">START OVER</p><h2 id="reset-title">Reset local progress?</h2><p>This removes your cars, credits, upgrades, career stars, records, statistics and achievements on this browser.</p><div><button class="button secondary" data-action="cancel-reset">KEEP PROGRESS</button><button class="button danger-button" data-action="confirm-reset">RESET EVERYTHING</button></div></section></div>`,
    );
  }
  action(key: string) {
    const s = this.machine.current;
    if (
      s === "garage" &&
      (document.activeElement as HTMLElement)?.matches(".car-row") &&
      ["ArrowLeft", "ArrowRight", "KeyQ", "KeyE"].includes(key)
    ) {
      this.click(
        ["ArrowRight", "KeyE"].includes(key) ? "garage-next" : "garage-prev",
        document.activeElement as HTMLElement,
      );
      return;
    }
    if (key === "GamepadEnter") {
      if (s === "race") return;
      void this.audio.start();
      if (document.activeElement instanceof HTMLInputElement) {
        if (document.activeElement.type === "checkbox")
          document.activeElement.click();
      } else if (document.activeElement instanceof HTMLButtonElement)
        document.activeElement.click();
      else
        this.app
          .querySelector<HTMLButtonElement>(".start-button,.button.primary")
          ?.click();
      return;
    }
    if (key === "F3") {
      this.showFPS = !this.showFPS;
      document.querySelector("#fps")?.toggleAttribute("hidden", !this.showFPS);
      return;
    }
    if (key === "Backquote") {
      this.toggleDebug();
      return;
    }
    if (
      s === "title" &&
      ![
        "Tab",
        "Escape",
        "ShiftLeft",
        "ShiftRight",
        "ControlLeft",
        "ControlRight",
      ].includes(key)
    ) {
      void this.audio.start();
      this.machine.go("menu");
      return;
    }
    if (
      key === "Escape" ||
      (key === "GamepadBack" && s !== "race") ||
      (key === "KeyP" && ["race", "pause"].includes(s))
    ) {
      this.back();
      return;
    }
    if (s === "race") {
      if (key === "KeyC") {
        this.camera.mode = (this.camera.mode + 1) % 4;
        this.camera.reset();
      }
      if (key === "KeyR") this.race?.reset();
      if (key === "KeyT" && this.net) {
        const chat = document.getElementById("race-chat") as HTMLInputElement;
        if (chat) {
          chat.hidden = false;
          this.input.clear();
          setTimeout(() => chat.focus());
        }
      }
      if (this.save.data.settings.manual && this.race) {
        if (key === "KeyQ")
          this.race.player.gear = Math.max(1, this.race.player.gear - 1);
        if (key === "KeyE")
          this.race.player.gear = Math.min(6, this.race.player.gear + 1);
      }
      return;
    }
    if (["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(key)) {
      const focused = document.activeElement as HTMLElement;
      if (
        ["ArrowLeft", "ArrowRight"].includes(key) &&
        focused instanceof HTMLInputElement &&
        focused.type === "range"
      ) {
        if (key === "ArrowRight") focused.stepUp();
        else focused.stepDown();
        focused.dispatchEvent(new Event("input", { bubbles: true }));
        focused.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      if (
        ["modes", "tracks"].includes(s) &&
        ["ArrowLeft", "ArrowRight"].includes(key) &&
        (focused.closest(".track-browser") ||
          (this.setupStep === "track" && !focused.closest(".mode-strip")))
      ) {
        this.click(key === "ArrowRight" ? "track-next" : "track-prev", focused);
        this.app.querySelector<HTMLElement>(".track-card.selected")?.focus();
        return;
      }
      const scope = this.app.querySelector("[role=dialog]") ?? this.app;
      const buttons = [
          ...scope.querySelectorAll<HTMLElement>(
            "button:not([disabled]),select:not([disabled]),input:not([type=hidden]):not([disabled]),textarea",
          ),
        ].filter((el) => el.offsetParent !== null),
        active = document.activeElement as HTMLElement,
        current = active?.getBoundingClientRect(),
        horizontal = key === "ArrowRight" || key === "ArrowLeft",
        sign = key === "ArrowDown" || key === "ArrowRight" ? 1 : -1;
      if (current) {
        const cx = current.x + current.width / 2,
          cy = current.y + current.height / 2;
        const nearest = buttons
          .filter((b) => b !== active)
          .map((b) => {
            const r = b.getBoundingClientRect(),
              dx = r.x + r.width / 2 - cx,
              dy = r.y + r.height / 2 - cy;
            return {
              b,
              along: (horizontal ? dx : dy) * sign,
              cross: Math.abs(horizontal ? dy : dx),
            };
          })
          .filter((x) => x.along > 4)
          .sort((a, b) => a.along + a.cross * 2 - (b.along + b.cross * 2))[0];
        nearest?.b.focus();
      } else buttons[0]?.focus();
    }
    if ((key === "KeyQ" || key === "KeyE") && ["modes", "tracks"].includes(s)) {
      const i = MODES.findIndex((m) => m.id === this.config.mode);
      this.config.mode =
        MODES[(i + (key === "KeyE" ? 1 : -1) + MODES.length) % MODES.length].id;
      this.rememberRace();
      this.screen();
      this.app
        .querySelector<HTMLElement>(`[data-action="mode-${this.config.mode}"]`)
        ?.focus();
    }
    if (
      (key === "KeyQ" || key === "KeyE") &&
      ["settings", "garage", "career", "profile"].includes(s)
    ) {
      const ids =
        s === "profile"
          ? ["overview", "achievements"]
          : s === "settings"
          ? ["gameplay", "controls", "graphics", "audio", "online"]
          : s === "garage"
            ? ["collection", "dealer", "performance", "visual"]
            : ["1", "2", "3", "4"];
      const current =
        s === "profile"
          ? this.profileTab
          : s === "settings"
          ? this.settingsTab
          : s === "garage"
            ? this.garageTab
            : String(this.tier);
      const next =
        ids[
          (ids.indexOf(current) + (key === "KeyE" ? 1 : -1) + ids.length) %
            ids.length
        ];
      const action =
        (s === "profile"
          ? "profile-tab-"
          : s === "settings"
          ? "settings-tab-"
          : s === "garage"
            ? "tab-"
            : "tier-") + next;
      const tab = this.app.querySelector<HTMLElement>(
        `[data-action="${action}"]:not([disabled])`,
      );
      tab?.click();
      this.app.querySelector<HTMLElement>(`[data-action="${action}"]`)?.focus();
    }
    if (
      key === "Enter" &&
      !(document.activeElement instanceof HTMLButtonElement)
    )
      this.app
        .querySelector<HTMLButtonElement>(".start-button,.button.primary")
        ?.click();
  }
  back() {
    const s = this.machine.current;
    if (s === "title" || s === "menu" || (s === "results" && this.net)) return;
    this.backTransition = true;
    if (s === "race") {
      this.machine.go("pause");
      return;
    }
    if (s === "pause") {
      this.machine.go("race");
      return;
    }
    if (s === "photo") {
      this.renderer.controls.enabled = false;
      this.machine.go(this.photoReturn);
      return;
    }
    if (s === "settings") {
      this.machine.go(this.settingsReturn);
      return;
    }
    if ((s === "tracks" || s === "modes") && this.setupStep === "conditions") {
      this.click("setup-track", this.app);
      return;
    }
    if (s === "tracks" || s === "modes") {
      this.machine.go("menu");
      return;
    }
    if (s === "replay") {
      this.machine.go("results");
      return;
    }
    if (s === "garage" && this.net && !this.net.inRace) {
      this.machine.go("lobby");
      return;
    }
    this.machine.go("menu");
  }
  // ---------------------------------------------------------------- races
  /** The loading screen stays mounted so the gauge sweeps instead of resetting. */
  private showLoading(progress: number, label: string, ceiling = progress) {
    if (!this.app.querySelector(".loading-screen"))
      this.app.innerHTML = this.screens.loading(label);
    setGauge(this.app, progress, label, ceiling);
  }
  async startRace() {
    this.showLoading(0.05, "Loading physics and race settings", 0.6);
    // Let the loading screen paint (a timer, so background tabs never stall here).
    await new Promise((r) => setTimeout(r, 40));
    try {
      this.disposeRace();
      this.lastUnlocks = [];
      this.dailyResult = "";
      this.statsMerged = false;
      let netRace: NetRace | null = null;
      let config: RaceConfig = { ...this.config };
      if (this.net) {
        const self = this.netGrid.find((p) => p.id === this.net!.selfId);
        config = {
          ...this.config,
          ...this.net.config,
          eventId: undefined,
          rivals: 0,
          difficulty: "normal",
        };
        netRace = {
          localSlot: self?.slot ?? 0,
          remotes: this.netGrid.filter((p) => p.id !== this.net!.selfId),
        };
      }
      this.race = new RaceManager(
        config,
        this.save,
        netRace,
        this.net ? this.raceCar() : undefined,
      );
      this.showLoading(0.65, "Compiling shaders", 0.95);
      await new Promise((r) => setTimeout(r, 20));
      this.renderer.world.add(this.race.root);
      this.renderer.setRace(this.race.track.spec.environment, config.weather);
      this.camera.reset();
      this.minimapRace = null;
      this.race.onCheckpoint = () => {};
      this.race.onEvent = (e) => this.raceEvent(e);
      this.race.onFinish = (r) => this.finished(r);
      await this.renderer.precompile();
      this.showLoading(1, "Lights out and away we go");
      await new Promise((r) => setTimeout(r, 380));
      if (this.net) {
        // A slow loader may already have missed "go"; then it starts right away.
        this.race.waiting = !this.net.started;
        this.net.markLoaded();
      }
      this.hintRace = ++this.save.data.settings.hintRaces;
      this.save.persist();
      this.machine.go("race");
    } catch (e) {
      console.error(e);
      this.disposeRace();
      this.machine.go(this.net ? "lobby" : "tracks");
      this.toast("Race could not load. Choose a track and try again.");
    }
  }
  private raceEvent(e: RaceEvent) {
    const r = this.race;
    switch (e.type) {
      case "count":
        this.audio.sfx("count");
        this.el("start-lights")?.setAttribute("data-lit", String(4 - e.value));
        break;
      case "go":
        this.audio.sfx("go");
        this.el("start-lights")?.setAttribute("data-lit", "go");
        break;
      case "checkpoint": {
        this.audio.sfx("checkpoint");
        if (e.delta !== null) {
          this.checkpointNotice = `CHECKPOINT ${formatDelta(e.delta)} s`;
          this.checkpointNoticeUntil = performance.now() + 1800;
        }
        break;
      }
      case "lap":
        this.audio.sfx(e.best ? "best" : "lap");
        if (e.final && r && this.config.mode !== "roam")
          this.audio.setMusic(this.songFor(), 2);
        break;
      case "impact":
        this.audio.sfx("impact");
        this.input.rumble(Math.min(1, e.strength * 0.12), 180);
        this.camera.shake(Math.min(0.8, e.strength * 0.08));
        this.el("impact-flash")?.classList.remove("hit");
        void this.el("impact-flash")?.offsetWidth;
        this.el("impact-flash")?.classList.add("hit");
        break;
      case "boostPad":
        this.audio.sfx("nitro");
        break;
      case "scrape":
        this.audio.sfx("impact");
        break;
      case "nearMiss":
        this.audio.sfx("nearMiss");
        break;
      case "drift":
        this.audio.sfx("drift");
        break;
      case "token":
        this.audio.sfx("token");
        break;
      case "trap":
        this.audio.sfx("checkpoint");
        break;
      case "air":
        this.camera.shake(0.25);
        this.input.rumble(0.5, 140);
        break;
      case "position":
        this.audio.sfx(e.delta > 0 ? "positionUp" : "positionDown");
        this.el("hud-position")?.classList.remove("bump");
        void this.el("hud-position")?.offsetWidth;
        this.el("hud-position")?.classList.add("bump");
        break;
      case "eliminated":
        this.audio.sfx("eliminated");
        break;
      case "wrongWay":
        this.audio.sfx("wrongWay");
        break;
      case "backfire":
        this.audio.sfx("backfire");
        break;
    }
  }
  private finished(r: RaceResult) {
    this.result = r;
    this.audio.sfx("finish");
    this.net?.sendFinish(r.time, this.race?.bestLap ?? null);
    if (this.config.eventId === "daily" && !this.net) {
      const d = dailyChallenge();
      if (r.stars >= 2 && this.save.data.daily !== d.date) {
        this.save.data.daily = d.date;
        this.save.data.stats.dailies++;
        this.save.reward(d.reward, 300);
        this.dailyResult = `+${fmt(d.reward)} CR`;
      } else
        this.dailyResult =
          this.save.data.daily === d.date
            ? "ALREADY CLAIMED"
            : "NOT YET — TRY AGAIN";
    }
    this.mergeStats(r);
    this.machine.go("results");
  }
  /** Folds a race's counters into lifetime statistics (once per race). */
  private mergeStats(r: RaceResult | null) {
    const race = this.race;
    if (!race || this.statsMerged) return;
    this.statsMerged = true;
    const s = this.save.data.stats,
      st = race.stats;
    s.distance += st.distance;
    s.topSpeed = Math.max(s.topSpeed, st.topSpeed);
    s.bestDrift = Math.max(s.bestDrift, st.bestDrift);
    s.longestAir = Math.max(s.longestAir, st.longestAir);
    s.nearMisses += st.nearMisses;
    s.overtakes += st.overtakes;
    s.tokens += st.tokens;
    s.traps += st.traps;
    s.nitroTime += st.nitroTime;
    if (r?.completed) {
      s.races++;
      const field = r.standings.length;
      if (field > 1 && r.position === 1) s.wins++;
      if (field > 1 && r.position <= 3) s.podiums++;
      if (r.clean) s.cleanRaces++;
      if (this.net) {
        s.onlineRaces++;
        if (field > 1 && r.position === 1) s.onlineWins++;
      }
    }
    this.lastUnlocks = this.unlockAchievements();
    this.save.persist();
  }
  private unlockAchievements() {
    const unlocked = checkAchievements(this.save.data);
    if (unlocked.length) {
      this.save.persist();
      this.audio.sfx("achievement");
      this.toast(
        `ACHIEVEMENT · ${unlocked.map((a) => a.name.toUpperCase()).join(" · ")}  +${fmt(unlocked.reduce((a, b) => a + b.reward, 0))} CR`,
        "achievement",
      );
    }
    return unlocked;
  }
  disposeRace() {
    if (this.race) {
      this.race.dispose();
      this.race = null;
    }
    this.minimapRace = null;
    this.minimapBase = null;
    this.debug?.destroy();
    this.debug = null;
    this.audio.silenceSpatial();
  }
  fixed(dt: number) {
    const s = this.machine.current,
      r = this.race;
    const controls = this.input.read(dt);
    if (!r) return;
    if (s === "race") r.fixed(dt, controls);
    // Online races and finished races keep running behind menus.
    else if (
      (this.net && ["pause", "settings", "results", "replay"].includes(s)) ||
      (r.finished && (s === "results" || s === "replay"))
    )
      r.fixed(dt, {
        ...controls,
        throttle: 0,
        brake: 0.2,
        steer: 0,
        nitro: false,
        handbrake: false,
      });
  }
  render(dt: number, alpha: number) {
    const s = this.machine.current,
      r = this.race;
    this.save.data.stats.playTime += dt;
    this.saveTimer += dt;
    if (this.saveTimer > 30) {
      this.saveTimer = 0;
      this.save.persist();
    }
    this.toastTimer = Math.max(0, this.toastTimer - dt);
    if (this.toastTimer === 0 && this.toastMessage) {
      this.toastMessage = "";
      this.toastQueue = [];
      this.app.querySelectorAll(".toast").forEach((t) => t.remove());
    }
    if (
      r &&
      (s === "race" ||
        s === "pause" ||
        (s === "settings" && this.settingsReturn === "pause") ||
        s === "photo" ||
        s === "results")
    ) {
      r.render(alpha);
      if (s === "race") {
        const roadT = r.track.nearest(r.player.position).t;
        this.camera.groundHeight = r.inTunnel(roadT)
          ? r.track.at(roadT).point.y - 0.1
          : r.track.terrain.heightAt(r.player.position.x, r.player.position.z);
        this.camera.roadSlope = r.track.at(roadT).tangent.y;
        if ((r.countdown > 0 || r.waiting) && !this.skipIntro)
          this.camera.cinematic(
            dt,
            r.player.position,
            r.player.quaternion,
            3 - r.countdown + r.clock * 0.2,
          );
        else this.camera.update(dt, r.player, this.input.keys.has("KeyX"));
        this.hudTick += dt;
        if (this.hudTick > 0.05) {
          this.hudTick = 0;
          this.updateHUD();
        }
        this.updateNameplates();
      } else if (s === "results")
        this.camera.cinematic(
          dt,
          r.player.position,
          r.player.quaternion,
          r.clock,
        );
      this.renderer.followSun(r.player.position, r.player.quaternion);
      this.renderer.setTunnel(r.inTunnel(r.track.nearest(r.player.position).t));
      if (s === "results" || s === "pause") {
        this.standingsTick += dt;
        if (this.standingsTick > 1) {
          this.standingsTick = 0;
          const card = document.getElementById("standings-card");
          if (card) {
            const memory = rememberScroll(this.app);
            card.outerHTML = this.screens.standingsCard(
              undefined,
              s === "pause" ? "LIVE ORDER" : "FINAL ORDER",
            );
            this.prepareUI(memory);
          }
        }
      }
    }
    if (s === "replay" && r) {
      this.replayTime += dt;
      const target = r.playReplay(this.replayTime);
      if (target)
        this.camera.director(
          dt,
          target.position,
          target.quaternion,
          this.replayTime,
          r.track,
        );
      if (target) {
        const inside = r.inTunnel(r.track.nearest(target.position).t);
        this.renderer.setTunnel(inside);
        r.sky.root.visible = !inside;
      }
    }
    if (this.net && r && !r.finished) {
      this.netTimer += dt;
      if (this.netTimer >= 0.05) {
        this.netTimer = 0;
        const p = r.player;
        this.net.sendState({
          p: [p.position.x, p.position.y, p.position.z],
          q: [p.quaternion.x, p.quaternion.y, p.quaternion.z, p.quaternion.w],
          v: [p.velocity.x, p.velocity.y, p.velocity.z],
          sp: p.speed,
          st: p.steering,
          fl:
            (p.boosting ? 1 : 0) |
            (p.braking ? 2 : 0) |
            (p.drifting ? 4 : 0) |
            (p.reversing ? 8 : 0),
          pr: r.progressOf(0),
          lap: r.lap,
        });
      }
    }
    this.renderer.aberration.offset.set(
      r?.player.boosting && s === "race" ? 0.0012 : 0,
      0,
    );
    const driving = s === "race" && !!r && r.racing;
    this.audio.driveEffects(
      s === "race",
      r?.player.speed ?? 0,
      r
        ? r.player.drifting
          ? 1
          : Math.max(0, Math.abs(r.player.slip) - 0.18) * 3
        : 0,
      r?.player.boosting ?? false,
      r?.config.weather ?? "clear",
    );
    this.audio.update(
      r?.player.rpm ?? 900,
      r?.player.throttle ?? 0,
      r?.player.speed ?? 0,
      r?.player.gear ?? 1,
      s === "race" && !!r,
      r?.player.spec.sound ?? "i4",
      r
        ? r.player.owned.upgrades.turbo +
            (["i4", "boxer"].includes(r.player.spec.sound) ? 2 : 0)
        : 0,
    );
    if (r && (s === "race" || s === "replay")) {
      const cam = this.renderer.camera,
        f = projected.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const sources: SpatialSource[] = [
        ...r.ai.filter((a) => !a.eliminated).map((a) => a.vehicle),
        ...r.remotes.values(),
      ].map((v) => ({
        x: v.position.x,
        y: v.position.y,
        z: v.position.z,
        speed: v.speed,
      }));
      this.audio.spatial(
        {
          x: cam.position.x,
          y: cam.position.y,
          z: cam.position.z,
          fx: f.x,
          fz: f.z,
        },
        driving || s === "replay" ? sources : [],
      );
    } else this.audio.silenceSpatial();
    this.renderer.speed = r && s === "race" ? Math.abs(r.player.speed) : 0;
    this.renderer.boosting = !!r && s === "race" && r.player.boosting;
    this.renderer.render(dt);
    if (r && this.renderer.mode === "race")
      r.effects.pointScale = this.renderer.renderer.domElement.height / 2;
    if (this.showFPS) {
      const fps = document.querySelector("#fps");
      if (fps)
        fps.textContent = `${Math.round(this.loop.fps)} FPS · ${this.renderer.renderer.info.render.calls} CALLS · ${(this.renderer.renderer.info.render.triangles / 1000).toFixed(0)}K TRIS · ${this.renderer.quality.toUpperCase()} ${Math.round(this.renderer.renderScale * 100)}%`;
    }
  }
  private text(id: string, value: string) {
    const el = this.el(id);
    if (el && el.textContent !== value) el.textContent = value;
  }
  updateHUD() {
    const r = this.race!;
    if (this.machine.current !== "race") return;
    const p = r.player,
      mph = this.save.data.settings.units === "mph";
    this.text(
      "hud-speed",
      String(Math.round(Math.abs(p.speed) * (mph ? 0.621371 : 1))).padStart(
        3,
        "0",
      ),
    );
    this.text("hud-units", mph ? "MPH" : "KM/H");
    const gear = this.el("hud-gear");
    const gearText = p.speed < -1 ? "R" : String(p.gear);
    if (gear && gear.dataset.g !== gearText) {
      gear.dataset.g = gearText;
      gear.innerHTML = `${gearText} <small>GEAR</small>`;
    }
    gear?.classList.toggle("limiter", p.rpm > 7600);
    const pos = this.el("hud-position"),
      old = Number(pos?.dataset.position ?? r.position);
    this.text("hud-position", `P${r.position}`);
    if (pos) pos.dataset.position = String(r.position);
    if (old !== r.position) {
      const arrow = this.el("position-arrow");
      if (arrow) {
        arrow.textContent = r.position < old ? "↑" : "↓";
        arrow.classList.toggle("down", r.position > old);
        setTimeout(() => {
          if (arrow.isConnected) arrow.textContent = "";
        }, 1800);
      }
    }
    this.text(
      "hud-lap",
      String(
        r.config.mode === "roam" ? r.lap : Math.min(r.lap, r.config.laps),
      ).padStart(2, "0"),
    );
    this.text("hud-time", formatTime(r.currentLapTime || 0.001));
    this.text("hud-best", formatTime(r.bestLap));
    const maxNitro = p.nitroMax;
    this.text("nitro-percent", `${Math.round((p.nitro / maxNitro) * 100)}%`);
    const nitro = this.el("hud-nitro"),
      rpm = this.el("hud-rpm"),
      arc = this.el("speed-arc");
    if (nitro) nitro.style.width = `${(p.nitro / maxNitro) * 100}%`;
    const nitroState = p.nitroLocked
      ? "locked"
      : p.boosting
        ? "active"
        : "ready";
    this.el("nitro-label-text")!.textContent = p.nitroLocked
      ? "RECHARGING"
      : p.boosting
        ? "BOOST ACTIVE"
        : "NITRO";
    nitro
      ?.closest(".speedometer")
      ?.setAttribute("data-nitro-state", nitroState);
    if (rpm) rpm.style.width = `${(p.rpm / 8200) * 100}%`;
    this.el("shift-lights")
      ?.querySelectorAll("i")
      .forEach((light, i) =>
        light.classList.toggle("on", p.rpm > 4000 + i * 800),
      );
    if (arc) {
      const length =
        Number(arc.dataset.length) ||
        (arc as unknown as SVGPathElement).getTotalLength();
      if (!arc.dataset.length) {
        arc.dataset.length = String(length);
        arc.setAttribute("stroke-dasharray", String(length));
      }
      arc.setAttribute(
        "stroke-dashoffset",
        String(length * (1 - Math.min(1, Math.abs(p.speed) / 360))),
      );
    }
    const now = performance.now();
    const notices = this.notices.update(
      {
        countdown: r.waiting
          ? "WAITING FOR DRIVERS"
          : r.countdown > 0
            ? String(Math.ceil(r.countdown))
            : r.time < 1
              ? "GO"
              : "",
        "wrong-way": r.wrongWay && Math.abs(p.speed) > 15 ? "WRONG WAY" : "",
        "hud-split":
          now < this.checkpointNoticeUntil ? this.checkpointNotice : "",
        "score-popup": r.popupTime > 0 ? r.popup : "",
        "drift-score": p.drifting
          ? `DRIFT ${fmt(r.driftPoints)} ×${r.combo}`
          : "",
        "mode-timer":
          r.config.mode === "drift"
            ? `${Math.max(0, Math.ceil(TUNING.driftDuration - r.time))}s / ${fmt(r.score)} PTS`
            : r.config.mode === "rush"
              ? `${Math.max(0, Math.ceil(r.timeLeft))}s REMAINING`
              : r.config.mode === "roam"
                ? `${r.tokens} / ${r.track.tokens.length} STREET TOKENS`
                : "",
      },
      now,
    );
    this.app
      .querySelectorAll<HTMLElement>(".race-center > div")
      .forEach((el) => {
        const notice = notices.find((n) => n.id === el.id);
        el.hidden = !notice;
        if (notice) {
          el.textContent = notice.text;
          el.style.opacity = String(notice.opacity);
        }
      });
    this.el("countdown")?.classList.toggle("waiting", r.waiting);
    this.el("driving-hints")?.classList.toggle(
      "hints-hidden",
      !controlHintsVisible(
        r.time,
        this.hintRace,
        this.save.data.settings.showControlHints,
      ),
    );
    this.el("start-lights")?.classList.toggle("off", r.time > 1.2);
    const t = r.near[0]?.t ?? 0;
    const progress = this.el("lap-progress");
    if (progress) progress.style.width = `${t * 100}%`;
    const next = r.checkpoints[0].expected / TRACK_SECTORS;
    this.text(
      "checkpoint-distance",
      `${Math.round(((next - t + 1) % 1) * r.track.length)} m TO CHECKPOINT`,
    );
    this.el("speed-lines")?.classList.toggle("boosting", p.boosting);
    this.standingsTick += 0.05;
    if (this.standingsTick > 0.25) {
      this.standingsTick = 0;
      this.drawStandings();
    }
    this.drawMinimap();
  }
  private drawStandings() {
    const r = this.race!,
      el = this.el("hud-standings");
    if (!el) return;
    if (r.vehicles.length + r.remotes.size < 2 || r.config.mode === "roam") {
      el.innerHTML = "";
      return;
    }
    const list = r.standings(),
      mine = list.find((s) => s.kind === "player")!;
    el.innerHTML = standingsRows(list.length, list.indexOf(mine), innerHeight)
      .map((i) => {
        if (i === null)
          return '<li class="order-separator" aria-hidden="true">…</li>';
        const s = list[i];
        const gap = liveGap(s, mine, r.track.length);
        return `<li class="${s === mine ? "me" : ""} ${s.out ? "out" : ""}"><span>${i + 1}</span><i style="background:${s.color}"></i><b>${esc(s.name)}</b><small>${gap}</small></li>`;
      })
      .join("");
  }
  drawMinimap() {
    const canvas = this.el("minimap") as HTMLCanvasElement | null;
    if (canvas && this.race) drawRaceMap(canvas, this.race);
  }
  /** Floating name tags over nearby rivals and friends. */
  private updateNameplates() {
    const r = this.race,
      container = this.el("nameplates");
    if (!r || !container) return;
    const cam = this.renderer.camera,
      now = performance.now();
    cam.updateMatrixWorld(true);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
      r.player.quaternion,
    );
    const playerCorners = boxCorners(carBounds(r.models[0].root)).map((v) =>
      v.project(cam),
    );
    const playerBox = {
      left: Math.min(...playerCorners.map((v) => ((v.x + 1) * innerWidth) / 2)),
      right: Math.max(
        ...playerCorners.map((v) => ((v.x + 1) * innerWidth) / 2),
      ),
      top: Math.min(...playerCorners.map((v) => ((1 - v.y) * innerHeight) / 2)),
      bottom: Math.max(
        ...playerCorners.map((v) => ((1 - v.y) * innerHeight) / 2),
      ),
    };
    const actors = this.save.data.settings.names
      ? [
          ...r.ai
            .filter((a) => !a.eliminated)
            .map((a) => ({
              key: `ai:${a.profile.name}`,
              name: a.profile.name,
              position: a.vehicle.position,
              remote: false,
            })),
          ...[...r.remotes.values()].map((a) => ({
            key: `remote:${a.id}`,
            name: a.name,
            position: a.position,
            remote: true,
          })),
        ]
          .map((a) => ({
            ...a,
            distance: a.position.distanceTo(r.player.position),
            cameraDistance: a.position.distanceTo(cam.position),
          }))
          .filter(
            (a) =>
              a.distance <= 80 &&
              a.cameraDistance >= 6 &&
              a.position.clone().sub(r.player.position).dot(forward) > 0,
          )
          .sort((a, b) => a.distance - b.distance)
      : [];
    const scale = (this.save.data.settings.hudScale / 100) * hudFit(),
      selected = new Set<HTMLElement>();
    for (const a of actors) {
      projected.copy(a.position);
      projected.y += 1.9;
      projected.project(cam);
      if (
        projected.z < -1 ||
        projected.z > 1 ||
        Math.abs(projected.x) > 1 ||
        Math.abs(projected.y) > 1
      )
        continue;
      let tag = this.nameplates.find((t) => t.dataset.actor === a.key);
      if (!tag)
        tag = this.nameplates.find(
          (t) =>
            t.dataset.visible !== "true" &&
            now - Number(t.dataset.fadedAt ?? now) >= 200,
        );
      if (!tag && this.nameplates.length < 3) {
        tag = document.createElement("div");
        tag.className = "nameplate";
        tag.style.opacity = "0";
        container.append(tag);
        this.nameplates.push(tag);
      }
      if (!tag) continue;
      tag.dataset.actor = a.key;
      tag.textContent = `${a.name} · ${Math.round(a.distance)} m`;
      tag.classList.toggle("friend", a.remote);
      tag.style.transform = `translate(${((projected.x + 1) * innerWidth) / 2 / scale}px,${((1 - projected.y) * innerHeight) / 2 / scale}px) translate(-50%,-100%)`;
      const b = tag.getBoundingClientRect();
      if (
        b.left < playerBox.right &&
        b.right > playerBox.left &&
        b.top < playerBox.bottom &&
        b.bottom > playerBox.top
      )
        continue;
      tag.dataset.distance = String(a.distance);
      tag.dataset.cameraDistance = String(a.cameraDistance);
      tag.dataset.visible = "true";
      tag.style.opacity = "1";
      selected.add(tag);
      if (selected.size === 3) break;
    }
    for (const tag of this.nameplates)
      if (!selected.has(tag)) {
        if (tag.dataset.visible === "true" || !tag.dataset.fadedAt)
          tag.dataset.fadedAt = String(now);
        tag.dataset.visible = "false";
        tag.style.opacity = "0";
      }
  }

  toast(message: string, kind = "") {
    this.toastMessage = message;
    this.toastKind = kind;
    this.toastQueue = [...this.toastQueue, { message, kind }].slice(-2);
    this.toastTimer = kind === "achievement" ? 5 : 4;
    this.showToast();
  }
  showToast() {
    this.app.querySelectorAll(".toast").forEach((t) => t.remove());
    for (const item of this.toastQueue) {
      const t = document.createElement("div");
      t.className = `toast ${item.kind}`;
      t.setAttribute("role", "status");
      t.textContent = item.message;
      this.app.append(t);
    }
  }
  // ------------------------------------------------------------- online
  private attachSession(n: NetSession) {
    this.net = n;
    this.chatLog = [];
    const roster = () =>
      JSON.stringify([
        n.players.map(({ ping, ...p }) => p),
        n.config,
        n.roomCode,
        n.roomError,
      ]);
    let previousRoster = roster(),
      sentCar = this.raceCar().id;
    n.onChange = () => {
      const next = roster(),
        changed = next !== previousRoster;
      previousRoster = next;
      // Opening or closing the garage switches which car this player races.
      if (this.net === n && this.raceCar().id !== sentCar) {
        sentCar = this.raceCar().id;
        n.updateProfile(this.sessionProfile());
      }
      if (this.machine.current === "lobby") {
        // Ping-only updates must not detach a button between pointer down and up.
        if (changed) this.screen();
        this.app.querySelectorAll<HTMLElement>("[data-ping]").forEach((el) => {
          const p = n.players.find((p) => p.id === el.dataset.ping);
          if (p) el.textContent = String(p.ping);
        });
      }
    };
    n.onRetire = (id) => this.race?.removeRemote(id);
    n.onPlayerJoined = (name) => {
      this.audio.sfx("join");
      this.toast(`${name} joined the lobby.`, "online");
    };
    n.onPlayerAway = (name, away) =>
      this.toast(
        away
          ? `${name} lost connection. Holding their spot…`
          : `${name} is back.`,
        "online",
      );
    n.onReconnecting = (active) => {
      if (active) this.audio.sfx("leave");
      this.toast(
        active ? "Connection lost. Reconnecting to the host…" : "Reconnected.",
        "online",
      );
    };
    n.onPlayerLeft = (name, id, reason) => {
      this.audio.sfx("leave");
      this.toast(reason ? `${name} left: ${reason}` : `${name} left.`, "online");
      this.race?.removeRemote(id);
    };
    n.onChat = (name, text) => {
      this.chatLog.push({ name, text });
      if (this.chatLog.length > 40) this.chatLog.shift();
      if (this.machine.current === "lobby") this.screen();
      const feed = document.getElementById("chat-feed");
      if (feed) {
        const line = document.createElement("p");
        line.innerHTML = `<b>${esc(name)}</b> ${esc(text)}`;
        feed.append(line);
        setTimeout(() => line.remove(), 8000);
      }
    };
    n.onStart = (config, grid) => {
      this.netGrid = grid;
      Object.assign(this.config, config);
      this.machine.go("prerace");
    };
    n.onGo = () => this.race?.go();
    n.onState = (id, s) => this.race?.updateRemote(id, s);
    n.onFinish = (id, time, best) => this.race?.remoteFinished(id, time, best);
    n.onLobby = () => {
      this.mergeStats(null);
      this.disposeRace();
      this.machine.go("lobby");
    };
    n.onClosed = (reason) => {
      // Ignore stale sessions (an abandoned join attempt timing out later).
      if (this.net !== n && this.netUI.guest !== n) return;
      this.net = null;
      Object.assign(this.netUI, {
        reply: "",
        invite: "",
        busy: false,
        accept: null,
        cancel: null,
        guest: null,
      });
      if (
        this.race &&
        [
          "race",
          "pause",
          "results",
          "replay",
          "photo",
          "settings",
          "prerace",
        ].includes(this.machine.current)
      ) {
        this.disposeRace();
        this.machine.go("lobby");
      } else if (this.machine.current === "lobby") this.screen();
      if (reason) this.toast(reason);
    };
  }
  private value(id: string) {
    return (
      (document.getElementById(id) as HTMLInputElement | null)?.value ?? ""
    );
  }
  /** Guest session that becomes `this.net` once the host's roster arrives. */
  private startGuest() {
    const ui = this.netUI;
    ui.guest?.close();
    const n = (ui.guest = NetSession.guest(this.sessionProfile()));
    this.attachSession(n);
    this.net = null; // stays on the entry view until connected
    const previousChange = n.onChange;
    n.onChange = () => {
      if (!this.net) {
        this.net = n;
        ui.reply = "";
        ui.busy = false;
        this.audio.sfx("join");
      }
      previousChange();
    };
    return n;
  }
  private async netAction(a: string) {
    const ui = this.netUI;
    try {
      if (a === "net-host") {
        const n = NetSession.host(this.sessionProfile(), {
          mode: "race",
          track: this.config.track,
          laps: this.config.laps,
          reverse: this.config.reverse,
          weather: this.config.weather,
        });
        this.attachSession(n);
        n.openLocalRoom();
        void n.openOnlineRoom();
        this.screen();
      }
      if (a === "net-join") {
        const code = cleanRoomCode(this.value("join-code"));
        if (!code) throw new Error("Type the room code from your host.");
        ui.busy = true;
        this.screen();
        const n = this.startGuest();
        await n.joinOnlineRoom(code);
      }
      if (a === "net-join-manual") {
        const code = this.value("invite-code").trim();
        if (!code) throw new Error("Paste the invite code first.");
        ui.busy = true;
        this.screen();
        const n = this.startGuest();
        ui.reply = await n.answerInvite(code);
        ui.busy = false;
        this.screen();
      }
      if (a === "net-local") {
        const room = this.value("room-code").trim();
        if (!/^[A-Za-z]{3}$/.test(room))
          throw new Error("Enter the three room letters.");
        this.startGuest().joinLocalRoom(room);
        this.toast(`Looking for room ${room.toUpperCase()}…`);
      }
      if (a === "net-manual") {
        ui.manual = !ui.manual;
        this.screen();
      }
      if (a === "net-cancel-join") {
        ui.guest?.close();
        ui.guest = null;
        ui.busy = false;
        ui.reply = "";
        this.screen();
      }
      if (a === "net-check") {
        ui.network = "checking";
        this.screen();
        ui.network = await checkNetwork();
        if (this.machine.current === "lobby") this.screen();
      }
      if ((a === "copy-room" || a === "copy-link") && this.net?.roomCode) {
        const code = this.net.roomCode,
          text =
            a === "copy-room"
              ? code
              : `${location.origin}${location.pathname}?room=${code}`;
        await navigator.clipboard.writeText(text).then(
          () => {
            this.toast(
              a === "copy-room"
                ? `Room code ${code} copied.`
                : "Invite link copied. Send it to your friends.",
            );
            const button = this.app.querySelector<HTMLElement>(
              `[data-action="${a}"]`,
            );
            if (button) button.textContent = "COPIED ✓";
          },
          () => this.toast(`Room code: ${code}`),
        );
      }
      if (a === "net-invite" && this.net?.isHost) {
        ui.busy = true;
        this.screen();
        const invite = await this.net.createInvite();
        ui.invite = invite.code;
        ui.accept = invite.accept;
        ui.cancel = invite.cancel;
        ui.busy = false;
        this.screen();
      }
      if (a === "net-accept" && ui.accept) {
        const reply = this.value("answer-code").trim();
        if (!reply) throw new Error("Paste your friend's reply code.");
        ui.busy = true;
        this.screen();
        await ui.accept(reply);
        ui.invite = "";
        ui.accept = ui.cancel = null;
        ui.busy = false;
        this.toast("Connecting… they will appear in the list in a moment.");
        this.screen();
      }
      if (a === "net-cancel-invite") {
        ui.cancel?.();
        ui.invite = "";
        ui.accept = ui.cancel = null;
        this.screen();
      }
      if (a === "copy-invite" || a === "copy-reply") {
        const text = a === "copy-invite" ? ui.invite : ui.reply;
        await navigator.clipboard.writeText(text).then(
          () => {
            this.toast("Copied. Paste it to your friend.");
            const button = this.app.querySelector<HTMLElement>(
              `[data-action="${a}"]`,
            );
            if (button) button.textContent = "Copied ✓";
          },
          () => {
            (
              document.getElementById(
                a === "copy-invite" ? "offer-code" : "reply-code",
              ) as HTMLTextAreaElement
            )?.select();
            this.toast("Select the code and copy it manually.");
          },
        );
      }
      if (
        (a === "net-track-prev" || a === "net-track-next") &&
        this.net?.isHost
      ) {
        const i = TRACKS.findIndex((t) => t.id === this.net!.config.track),
          step = a === "net-track-next" ? 1 : -1;
        this.net.setConfig({
          track: TRACKS[(i + step + TRACKS.length) % TRACKS.length].id,
        });
      }
      if (a === "net-ready" && this.net) {
        this.net.setReady(!this.net.self?.ready);
      }
      if (a === "net-start" && this.net?.canStart) this.net.start();
      if (a === "net-chat" && this.net) {
        const input = document.getElementById("chat-input") as HTMLInputElement;
        this.net.chat(input?.value ?? "");
        if (input) input.value = "";
      }
      if (a === "net-lobby" && this.net?.isHost) this.net.returnToLobby();
      if (a === "net-leave") {
        this.net?.close();
        this.net = null;
        this.machine.go("lobby");
      }
    } catch (e) {
      ui.busy = false;
      if (a === "net-join" && !this.net) {
        ui.guest?.close();
        ui.guest = null;
      }
      this.audio.sfx("error");
      this.toast(
        e instanceof Error ? e.message : "Connection failed. Try a new code.",
      );
      if (this.machine.current === "lobby") this.screen();
    }
  }
  toggleDebug() {
    if (this.debug) {
      this.debug.destroy();
      this.debug = null;
      return;
    }
    if (!this.race) return;
    this.debug = new GUI({ title: "VELOX · Live tuning" });
    this.debug.add(TUNING, "steering", 0.2, 0.8);
    this.debug.add(TUNING, "friction", 0.5, 6);
    this.debug.add(TUNING, "driftGrip", 0.1, 1);
    this.debug.add(TUNING, "lateralAssist", 0, 5);
    this.debug.add(TUNING, "nitroForce", 1000, 15000);
  }
}
