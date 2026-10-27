import { carById, CARS, PI, UPGRADE_COSTS, type Upgrade } from "../data/cars";
import { TRACKS, MODES } from "../data/tracks";
import type { RaceConfig } from "../game/RaceManager";
export interface Visual {
  paint: string;
  finish: string;
  rim: string;
  rimColor: string;
  caliper: string;
  spoiler: number;
  underglow: string | null;
  tint: number;
  livery: string | null;
}
export interface OwnedCar {
  upgrades: Record<Upgrade, number>;
  visual: Visual;
  tuning: Record<string, number>;
}
export type GhostFrame = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export interface Stats {
  races: number;
  wins: number;
  podiums: number;
  cleanRaces: number;
  distance: number;
  topSpeed: number;
  bestDrift: number;
  longestAir: number;
  nearMisses: number;
  overtakes: number;
  tokens: number;
  traps: number;
  nitroTime: number;
  onlineRaces: number;
  onlineWins: number;
  dailies: number;
  playTime: number;
}
export const STAT_KEYS: (keyof Stats)[] = [
  "races",
  "wins",
  "podiums",
  "cleanRaces",
  "distance",
  "topSpeed",
  "bestDrift",
  "longestAir",
  "nearMisses",
  "overtakes",
  "tokens",
  "traps",
  "nitroTime",
  "onlineRaces",
  "onlineWins",
  "dailies",
  "playTime",
];
export interface SaveData {
  version: 1;
  trackVersion: 2;
  records_v1?: SaveData["records"];
  profile: { name: string; level: number; xp: number; credits: number };
  garage: { activeCar: string; owned: Record<string, OwnedCar> };
  career: { stars: Record<string, number>; unlockedTier: number };
  records: Record<
    string,
    {
      bestLap: number | null;
      ghost: GhostFrame[] | null;
      splits?: number[] | null;
    }
  >;
  stats: Stats;
  /** Achievement id → unlock timestamp. */
  achievements: Record<string, number>;
  /** Last completed daily challenge (YYYY-MM-DD). */
  daily: string;
  settings: {
    lastRace?: RaceConfig;
    quality: string;
    units: string;
    assists: {
      steering: boolean;
      traction: boolean;
      abs: boolean;
      drift: boolean;
      rubberband: boolean;
    };
    audio: { master: number; music: number; engine: number; sfx: number };
    bindings: Record<string, string>;
    manual: boolean;
    sensitivity: number;
    camera: number;
    shake: boolean;
    names: boolean;
    fov: number;
    hudScale: number;
    deadzone: number;
    colorSafe: boolean;
    touchArrows: boolean;
    hintRaces: number;
    showControlHints: boolean;
  };
}
export const SAVE_KEY = "velox_save_v1";
/** A car lent for an open-garage online room: your paint if you own it, every upgrade maxed. */
export function lentCar(id: string, base: OwnedCar = newOwned(id)): OwnedCar {
  const top = UPGRADE_COSTS.length;
  return {
    ...base,
    upgrades: Object.fromEntries(
      Object.keys(base.upgrades).map((k) => [k, top]),
    ) as OwnedCar["upgrades"],
  };
}
export function newOwned(id: string): OwnedCar {
  return {
    upgrades: {
      engine: 0,
      turbo: 0,
      tires: 0,
      suspension: 0,
      nitro: 0,
      weight: 0,
    },
    visual: {
      paint: carById(id).color,
      finish: "metallic",
      rim: "Rim_01",
      rimColor: "#aeb5b9",
      caliper: "#e6f481",
      spoiler: ["aurora", "phantom"].includes(id) ? 2 : 0,
      underglow: null,
      tint: 0.3,
      livery: id === "brutus" ? "twin" : null,
    },
    tuning: {},
  };
}
export function defaultSave(): SaveData {
  return {
    version: 1,
    trackVersion: 2,
    profile: { name: "RACER", level: 1, xp: 0, credits: 5000 },
    garage: { activeCar: "kestrel", owned: { kestrel: newOwned("kestrel") } },
    career: { stars: {}, unlockedTier: 1 },
    records: {},
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as unknown as Stats,
    achievements: {},
    daily: "",
    settings: {
      quality: "auto",
      units: "kmh",
      assists: {
        steering: true,
        traction: true,
        abs: true,
        drift: true,
        rubberband: true,
      },
      audio: { master: 0.55, music: 0.25, engine: 0.65, sfx: 0.55 },
      bindings: {
        throttle: "KeyW",
        brake: "KeyS",
        left: "KeyA",
        right: "KeyD",
        handbrake: "Space",
        nitro: "ShiftLeft",
      },
      manual: false,
      sensitivity: 1,
      camera: 0,
      shake: true,
      names: true,
      fov: 60,
      hudScale: 100,
      deadzone: 0.1,
      colorSafe: false,
      touchArrows: false,
      hintRaces: 0,
      showControlHints: false,
    },
  };
}
const number = (v: unknown, fallback: number, min = 0, max = 1e9) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(min, Math.min(max, v))
    : fallback;
const color = (v: unknown, fallback: string) =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
/** Validates a livery from storage or from another player. */
export function cleanVisual(raw: unknown, carId: string): Visual {
  const o = newOwned(carId).visual;
  if (!raw || typeof raw !== "object") return o;
  const v = raw as Partial<Visual>;
  o.paint = color(v.paint, o.paint);
  o.rimColor = color(v.rimColor, o.rimColor);
  o.caliper = color(v.caliper, o.caliper);
  o.finish = ["gloss", "metallic", "matte", "pearl", "chrome"].includes(
    v.finish ?? "",
  )
    ? v.finish!
    : "metallic";
  o.rim = /^Rim_0[1-6]$/.test(v.rim ?? "") ? v.rim! : "Rim_01";
  o.spoiler = Math.floor(number(v.spoiler, 0, 0, 3));
  o.tint = number(v.tint, 0.3, 0, 0.9);
  o.underglow = v.underglow ? color(v.underglow, "#9effd2") : null;
  o.livery = ["stripe", "twin", "number"].includes(v.livery ?? "")
    ? v.livery!
    : null;
  return o;
}
export function migrateSave(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<SaveData>;
  if (r.version !== 1) return d;
  if (r.profile) {
    d.profile.credits = number(r.profile.credits, 5000);
    d.profile.xp = number(r.profile.xp, 0);
    d.profile.level = 1 + Math.floor(d.profile.xp / 800);
    d.profile.name = cleanName(r.profile.name);
  }
  if (r.garage?.owned)
    for (const c of CARS) {
      const value = r.garage.owned[c.id];
      if (!value || typeof value !== "object") continue;
      const o = newOwned(c.id);
      for (const k of Object.keys(o.upgrades) as Upgrade[])
        o.upgrades[k] = Math.floor(number(value.upgrades?.[k], 0, 0, 5));
      o.visual = cleanVisual(value.visual, c.id);
      d.garage.owned[c.id] = o;
    }
  if (r.garage?.activeCar && Object.hasOwn(d.garage.owned, r.garage.activeCar))
    d.garage.activeCar = r.garage.activeCar;
  if (r.career?.stars && typeof r.career.stars === "object") {
    for (const [k, v] of Object.entries(r.career.stars))
      if (/^tier[1-4]_[0-4]$/.test(k))
        d.career.stars[k] = Math.floor(number(v, 0, 0, 3));
    d.career.unlockedTier = Math.min(
      4,
      1 +
        Math.floor(
          Object.values(d.career.stars).reduce((a, b) => a + b, 0) / 9,
        ),
    );
  }
  if (r.records && typeof r.records === "object")
    for (const [k, v] of Object.entries(r.records)) {
      if (!/^(neon|coast|canyon)_([a-c]|gp)(_reverse)?$/.test(k) || !v)
        continue;
      d.records[k] = {
        bestLap: v.bestLap === null ? null : number(v.bestLap, 0, 1, 360000),
        ghost: Array.isArray(v.ghost)
          ? v.ghost
              .filter(
                (f) =>
                  Array.isArray(f) &&
                  f.length === 8 &&
                  f.every((n) => typeof n === "number" && Number.isFinite(n)),
              )
              .slice(0, 18000)
          : null,
        splits: Array.isArray(v.splits)
          ? v.splits.slice(0, 12).map((n) => number(n, 0, 0, 360000))
          : null,
      };
    }
  if (r.trackVersion !== 2) {
    d.records_v1 = d.records;
    d.records = {};
  } else if (r.records_v1 && typeof r.records_v1 === "object")
    d.records_v1 = r.records_v1;
  if (r.stats && typeof r.stats === "object")
    for (const k of STAT_KEYS) d.stats[k] = number(r.stats[k], 0);
  if (r.achievements && typeof r.achievements === "object")
    for (const [k, v] of Object.entries(r.achievements))
      if (/^[a-z0-9_]{1,32}$/.test(k)) d.achievements[k] = number(v, 0);
  if (typeof r.daily === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.daily))
    d.daily = r.daily;
  const s = r.settings;
  if (s) {
    const race = s.lastRace;
    if (
      race &&
      TRACKS.some((t) => t.id === race.track) &&
      MODES.some((m) => m.id === race.mode)
    )
      d.settings.lastRace = {
        mode: race.mode,
        track: race.track,
        laps: Math.round(number(race.laps, 2, 1, 5)),
        rivals: Math.round(number(race.rivals, 5, 0, 5)),
        difficulty: ["easy", "normal", "hard", "legend"].includes(
          race.difficulty,
        )
          ? race.difficulty
          : "normal",
        reverse: race.reverse === true,
        weather: ["clear", "rain", "fog", "snow"].includes(race.weather)
          ? race.weather
          : "clear",
      };
    if (["auto", "low", "medium", "high", "ultra"].includes(s.quality))
      d.settings.quality = s.quality;
    if (s.units === "mph") d.settings.units = "mph";
    for (const k of Object.keys(
      d.settings.assists,
    ) as (keyof typeof d.settings.assists)[])
      if (typeof s.assists?.[k] === "boolean")
        d.settings.assists[k] = s.assists[k];
    for (const k of Object.keys(
      d.settings.audio,
    ) as (keyof typeof d.settings.audio)[])
      d.settings.audio[k] = number(s.audio?.[k], d.settings.audio[k], 0, 1);
    if (s.bindings)
      for (const k of Object.keys(d.settings.bindings)) {
        const b = s.bindings[k];
        if (
          typeof b === "string" &&
          /^(Key[A-Z]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right)|Control(Left|Right)|Digit[0-9])$/.test(
            b,
          )
        )
          d.settings.bindings[k] = b;
      }
    d.settings.manual = s.manual === true;
    d.settings.sensitivity = number(s.sensitivity, 1, 0.4, 1.8);
    d.settings.camera = Math.floor(number(s.camera, 0, 0, 3));
    d.settings.shake = s.shake !== false;
    d.settings.names = s.names !== false;
    d.settings.fov = number(s.fov, 60, 55, 80);
    d.settings.hudScale = number(s.hudScale, 100, 80, 130);
    d.settings.deadzone = number(s.deadzone, 0.1, 0.02, 0.35);
    d.settings.colorSafe = s.colorSafe === true;
    d.settings.touchArrows = s.touchArrows === true;
    d.settings.hintRaces = Math.floor(number(s.hintRaces, 0, 0));
    d.settings.showControlHints = s.showControlHints === true;
  }
  return d;
}
/** Display names are shown to other players: keep them short and printable. */
export function cleanName(v: unknown) {
  const name =
    typeof v === "string"
      ? v
          .replace(/[^\p{L}\p{N} _\-.]/gu, "")
          .trim()
          .slice(0, 16)
      : "";
  return name || "RACER";
}
export class Save {
  data: SaveData;
  warning = "";
  constructor(
    private storage: Pick<
      Storage,
      "getItem" | "setItem" | "removeItem"
    > = localStorage,
  ) {
    try {
      const raw = storage.getItem(SAVE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      this.data = parsed ? migrateSave(parsed) : defaultSave();
      if (parsed?.version === 1 && parsed.trackVersion !== 2) {
        this.warning =
          "Tracks were rebuilt bigger — your old lap records were archived.";
        this.persist();
      }
    } catch {
      this.data = defaultSave();
      this.warning = "Save could not be read. A fresh local profile is ready.";
    }
  }
  persist() {
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
      return true;
    } catch {
      this.warning =
        "Storage is full or unavailable. This session is still playable.";
      return false;
    }
  }
  reset() {
    this.data = defaultSave();
    this.persist();
  }
  buy(id: string) {
    const c = CARS.find((c) => c.id === id);
    if (
      !c ||
      this.data.garage.owned[id] ||
      this.data.profile.level < c.level ||
      this.data.profile.credits < c.price
    )
      return false;
    this.data.profile.credits -= c.price;
    this.data.garage.owned[id] = newOwned(id);
    this.data.garage.activeCar = id;
    this.persist();
    return true;
  }
  upgrade(id: string, k: Upgrade) {
    const o = this.data.garage.owned[id];
    if (!o) return false;
    const cost = UPGRADE_COSTS[o.upgrades[k]];
    if (cost === undefined || this.data.profile.credits < cost) return false;
    this.data.profile.credits -= cost;
    o.upgrades[k]++;
    this.persist();
    return true;
  }
  reward(credits: number, xp: number) {
    this.data.profile.credits += Math.max(0, Math.round(credits));
    this.data.profile.xp += Math.max(0, Math.round(xp));
    this.data.profile.level = 1 + Math.floor(this.data.profile.xp / 800);
    this.persist();
  }
  get active() {
    return this.data.garage.owned[this.data.garage.activeCar];
  }
  get pi() {
    return PI(carById(this.data.garage.activeCar), this.active.upgrades);
  }
}
