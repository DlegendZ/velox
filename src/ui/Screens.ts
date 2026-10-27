import { raceHUD } from "./RaceHUD";
import { liveGap } from "./LiveOrder";
import {
  button,
  segmented,
  stepper,
  keycap,
  trackCard,
  carThumb,
  statNumber,
} from "./components";
import { settingsContent } from "./SettingsScreen";
import { gauge, speedRoad } from "./Loader";
import { TrackGeometry } from "../game/TrackGeometry";
import * as THREE from "three";
import {
  CARS,
  carById,
  carClass,
  PALETTE,
  FINISHES,
  UPGRADES,
  UPGRADE_COSTS,
  PI,
} from "../data/cars";
import { MODES, TRACKS, WEATHERS } from "../data/tracks";
import { CAREER_EVENTS, TIERS } from "../data/careerEvents";
import { ACHIEVEMENTS, dailyChallenge } from "../data/achievements";
import { CAMERA_NAMES } from "../render/CameraRig";
import { MAX_PLAYERS } from "../net/Session";
import type { Game } from "../core/Game";
const paths: Record<string, string> = {
  arrow: "M5 19 19 5M5 5h14v14",
  car: "m5 8 2-4h10l2 4M3 14V9l2-1h14l2 1v5M3 14h18v4h-3v-3H6v3H3zM6 11h2m8 0h2",
  flag: "M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0",
  gear: "m9 3-1 3-3 1v3l-2 2 2 2v3l3 1 1 3h6l1-3 3-1v-3l2-2-2-2V7l-3-1-1-3zM9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  volume: "m11 4-5 4H2v8h4l5 4zm4 4c3 2 3 6 0 8m3-11c5 4 5 10 0 14",
  mute: "m11 4-5 4H2v8h4l5 4zm5 5 6 6m0-6-6 6",
  clock: "M12 6v6l4 2M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0",
  back: "M20 12H4m6-6-6 6 6 6",
  photo: "M3 7h4l2-3h6l2 3h4v13H3zM8 13a4 4 0 1 0 8 0 4 4 0 1 0-8 0",
  play: "m8 4 13 8-13 8z",
  pause: "M8 4v16M16 4v16",
  lock: "M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4",
  check: "m5 12 4 4L20 5",
  refresh: "M20 7V2m0 5h-5M4 17v5m0-5h5M20 7A9 9 0 0 0 4 7m0 10a9 9 0 0 0 16 0",
  users:
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6",
  trophy:
    "M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H3c0 4 2 5 4 5m10-5h4c0 4-2 5-4 5",
  copy: "M8 8h12v12H8zM4 16V4h12",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m-2 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  send: "M3 11 21 3l-8 18-2-8z",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v4m8-4v4",
};
export const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.arrow}"/></svg>`;
export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
export const formatTime = (s: number | null) =>
  !s || !Number.isFinite(s)
    ? "—:——.——"
    : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.floor((s % 1) * 100)).padStart(2, "0")}`;
export const formatDelta = (d: number) =>
  `${d < 0 ? "−" : "+"}${Math.abs(d).toFixed(2)}`;
export const keyName = (code: string) =>
  code
    .replace("Key", "")
    .replace("Arrow", "")
    .replace("Left", "")
    .replace("Right", "")
    .toUpperCase();
/** Escapes text that came from other players or user input. */
export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const select = (
  attrs: string,
  entries: readonly (readonly [string, string])[],
  value: string,
  disabled = false,
) => {
  const id =
    attrs.match(/id="([^"]+)"/)?.[1] ??
    "control-" + (attrs.match(/="([^"]+)"/)?.[1] ?? "value");
  return segmented(
    id,
    entries,
    value,
    disabled,
    attrs.replace(/id="[^"]+"/, ""),
  );
};
const toggle = (label: string, attrs: string, checked: boolean) =>
  `<label class="toggle-label">${label}<input type="checkbox" ${attrs} ${checked ? "checked" : ""}><span class="toggle"></span></label>`;
export class Screens {
  private layouts = new Map<string, TrackGeometry>();
  private mapArt = new Map<string, string>();
  constructor(private g: Game) {}
  private layout(id: string, reverse = false) {
    const key = `${id}:${reverse}`;
    let geometry = this.layouts.get(key);
    if (!geometry) {
      geometry = new TrackGeometry(
        TRACKS.find((t) => t.id === id) ?? TRACKS[0],
        reverse,
      );
      this.layouts.set(key, geometry);
    }
    return geometry;
  }
  header(active = "play") {
    const p = this.g.save.data.profile;
    const names: Record<string, string> = {
      play: "PLAY",
      garage: "GARAGE",
      career: "CAREER",
      lobby: "ONLINE",
      settings: "SETTINGS",
      profile: "DRIVER",
    };
    return (
      '<header class="header"><button class="wordmark" data-action="menu" aria-label="VELOX home">VELOX</button><div class="breadcrumb">' +
      (names[active] ?? "PLAY") +
      (this.g.machine.current === "tracks" || this.g.machine.current === "modes"
        ? " <span>›</span> " +
          esc(
            (
              MODES.find((m) => m.id === this.g.config.mode)?.name ??
              "QUICK RACE"
            ).toUpperCase(),
          ) +
          " <span>›</span> " +
          (this.g.setupStep === "conditions" ? "CONDITIONS" : "CIRCUIT")
        : "") +
      '</div><div class="wallet">' +
      (this.g.net
        ? '<button class="online-badge" data-action="lobby"><i class="live-dot"></i> ONLINE · ' +
          this.g.net.players.length +
          "</button>"
        : "") +
      '<span class="credits"><b>' +
      fmt(p.credits) +
      '</b> CR</span><button class="profile-button" data-action="profile"><span class="level-ring" style="--xp:' +
      (p.xp % 800) / 8 +
      '%">' +
      p.level +
      "</span><b>" +
      esc(p.name) +
      '</b><span class="avatar">' +
      esc(p.name.charAt(0)) +
      "</span></button></div></header>"
    );
  }
  footer() {
    return (
      '<footer class="footer"><div class="music-line"><span>♪</span> <span class="now-playing">' +
      esc(this.g.audio.songName) +
      '</span><button class="sound-button" data-action="sound" aria-label="Toggle audio">' +
      icon(this.g.muted ? "mute" : "volume") +
      '</button></div><div class="footer-right"><span>' +
      keycap("↵") +
      " SELECT</span><span>" +
      keycap("ESC") +
      " BACK</span><span>" +
      keycap("Q") +
      keycap("E") +
      " TABS</span></div></footer>"
    );
  }
  top(label: string, title: string, desc = "") {
    return `<div class="page-heading" data-initial="${esc(this.g.save.data.profile.name.charAt(0))}"><button class="back-link" data-action="back">${icon("back")} BACK</button><p class="eyebrow">${label}</p><h1>${title}<span class="title-period">.</span></h1>${desc ? `<p class="description">${desc}</p>` : ""}</div>`;
  }
  menu(title: boolean) {
    if (title)
      return '<main class="title-screen"><h1>VELOX</h1><p>AFTER HOURS MOTOR CLUB</p><button data-action="enter" data-autofocus>PRESS ANY KEY</button><span class="version">0.8.0 / ORIGINAL MACHINES</span></main>';
    const g = this.g,
      c = carById(g.save.data.garage.activeCar),
      d = dailyChallenge(),
      t = TRACKS.find((t) => t.id === d.track)!;
    const entries = [
      [
        "modes",
        "RACE",
        "Find your next rush. Six pursuits. Twelve circuits.",
        "race",
      ],
      [
        "career",
        "CAREER",
        "From rookie to legend. Write your legacy.",
        "career",
      ],
      ["lobby", "ONLINE", "Bring the crew. Up to six drivers.", "online"],
      [
        "garage",
        "GARAGE",
        "Make it unmistakable. Your ride, your rules.",
        "garage",
      ],
      ["profile", "DRIVER", "Every mile tells your story.", "driver"],
      ["settings", "SETTINGS", "Tune the way you play.", "settings"],
    ];
    return (
      this.header() +
      '<main class="home"><nav class="home-menu" aria-label="Main menu"><p class="eyebrow">THE NIGHT IS YOURS</p>' +
      entries
        .map(
          ([a, n, d, p], i) =>
            '<button class="home-entry" data-action="' +
            a +
            '" data-stage="' +
            p +
            '" ' +
            (i === 0 ? "data-autofocus" : "") +
            "><span>" +
            n +
            "</span><small>" +
            d +
            "</small></button>",
        )
        .join("") +
      '</nav><div class="home-stage" aria-hidden="true"></div><aside class="ride-ticket"><div class="your-ride"><p class="eyebrow">YOUR RIDE</p><h2>' +
      c.name +
      '</h2><span class="class-badge">' +
      carClass(g.save.pi) +
      " " +
      g.save.pi +
      "</span> <span>" +
      c.drive +
      " / " +
      c.powerKw +
      ' kW</span></div><button class="daily-ticket" data-action="daily" ' +
      (g.save.data.daily === d.date ? "disabled" : "") +
      "><span>" +
      icon("calendar") +
      " DAILY CHALLENGE <b>+" +
      fmt(d.reward) +
      " CR</b></span><strong>" +
      t.name +
      "</strong><small>" +
      MODES.find((m) => m.id === d.mode)?.name +
      " · " +
      (g.save.data.daily === d.date ? "COMPLETED" : d.goal) +
      "</small></button></aside></main>" +
      this.footer()
    );
  }
  garage() {
    const g = this.g,
      id = g.previewCar,
      c = carById(id),
      owned = g.save.data.garage.owned[id],
      o = owned ?? g.save.active,
      v = o.visual;
    const carList = `<div class="car-list" aria-label="Car carousel">${CARS.filter(
      (c) =>
        (g.garageTab === "dealer" || g.save.data.garage.owned[c.id]) &&
        (g.garageCap === null ||
          PI(
            c,
            g.save.data.garage.owned[c.id]?.upgrades ?? g.save.active.upgrades,
          ) <= g.garageCap),
    )
      .map((c) => {
        const own = !!g.save.data.garage.owned[c.id];
        return `<button class="car-row ${c.id === id ? "selected" : ""}" data-action="preview-${c.id}" aria-label="Preview ${c.name}">${c.id === g.save.data.garage.activeCar ? '<em class="active-car-badge">ACTIVE</em>' : ""}${carThumb(c, g.renderer.carThumbnails.get(c.id))}<span class="car-card-copy"><b>${c.name}</b><small>${c.drive} · ${c.type}</small></span><span class="row-tail">${own ? "OWNED" : g.save.data.profile.level < c.level ? `${icon("lock")}<small>LV ${c.level}</small>` : `${fmt(c.price)} <small>CR</small>`}</span></button>`;
      })
      .join(
        "",
      )}${g.garageTab !== "dealer" ? '<button class="car-row dealer-card" data-action="tab-dealer" aria-label="Open Dealer">+ DEALER</button>' : ""}</div>`;
    let panel = "";
    if (g.garageTab === "performance")
      panel = owned
        ? `<div class="upgrade-list">${UPGRADES.map((u) => {
            const level = o.upgrades[u.id],
              cost = UPGRADE_COSTS[level];
            return `<div class="upgrade-row"><div><b>${u.name}</b><small>${u.detail}</small><div class="upgrade-pips">${Array.from({ length: 5 }, (_, i) => `<i class="${i < level ? "filled" : i === level ? "preview" : ""}"></i>`).join("")}</div></div><button class="upgrade-buy" data-action="upgrade-${u.id}" ${cost === undefined || g.save.data.profile.credits < cost ? "disabled" : ""}>${cost === undefined ? "MAX" : g.save.data.profile.credits < cost ? `Need ${fmt(cost - g.save.data.profile.credits)} more CR` : `BUY · ${fmt(cost)} CR`}<small>${cost === undefined ? "LEVEL 5" : `+12 PI · LV ${level + 1}`}</small></button></div>`;
          }).join("")}</div>`
        : `<p class="muted">Buy this car to fit upgrades.</p>`;
    if (g.garageTab === "visual")
      panel = `<div class="customize"><label>PAINT <input type="color" data-visual="paint" value="${v.paint}" aria-label="Paint color"></label><div class="swatches">${PALETTE.map((color) => `<button class="swatch ${v.paint === color ? "selected" : ""}" style="--swatch:${color}" data-action="paint-${color}" aria-label="Paint ${color}"></button>`).join("")}</div><label>FINISH ${select(
        'data-visual="finish"',
        FINISHES.map((f) => [f, f.toUpperCase()] as const),
        v.finish,
      )}</label><label>WHEEL DESIGN ${select(
        'data-visual="rim"',
        Array.from(
          { length: 6 },
          (_, i) =>
            [
              `Rim_0${i + 1}`,
              [
                "FIVE SPOKE",
                "SIX SPOKE",
                "SPLIT SEVEN",
                "MESH EIGHT",
                "TOURING TEN",
                "TURBINE",
              ][i],
            ] as const,
        ),
        v.rim,
      )}</label><div class="color-pair"><label>WHEELS <input type="color" data-visual="rimColor" value="${v.rimColor}"></label><label>CALIPERS <input type="color" data-visual="caliper" value="${v.caliper}"></label></div><label>REAR WING ${select(
        'data-visual="spoiler"',
        ["FACTORY", "STREET", "SPORT", "TRACK"].map(
          (f, i) => [String(i), f] as const,
        ),
        String(v.spoiler),
      )}</label><label>LIVERY ${select(
        'data-visual="livery"',
        [
          ["", "CLEAN"],
          ["stripe", "CENTER STRIPE"],
          ["twin", "OFFSET STRIPES"],
        ],
        v.livery ?? "",
      )}</label><label>UNDERGLOW ${select(
        'data-visual="underglow"',
        [
          ["", "OFF"],
          ["#aaffcc", "MINT"],
          ["#a7a2ff", "VIOLET"],
          ["#ff7e6e", "CORAL"],
          ["#7ec8ff", "ICE"],
          ["#ffd36e", "GOLD"],
        ],
        v.underglow ?? "",
      )}</label><label>WINDOW TINT <input type="range" min="0" max="0.9" step="0.1" value="${v.tint}" data-visual="tint"></label></div>`;
    const stat = (i: number) =>
      Math.min(
        10,
        c.stats[i] +
          [
            o.upgrades.engine * 0.3 + o.upgrades.turbo * 0.2,
            o.upgrades.turbo * 0.3 + o.upgrades.weight * 0.2,
            o.upgrades.tires * 0.25 + o.upgrades.suspension * 0.25,
            o.upgrades.suspension * 0.15,
          ][i],
      );
    return `${this.header("garage")}<main class="garage-page scroll-page garage-tab-${g.garageTab}">${this.top("THE WORKSHOP", "YOUR GARAGE")}<div class="garage-tabs garage-rail" role="tablist">${[
      ["collection", "MY CARS"],
      ["dealer", "DEALER"],
      ["performance", "PERFORMANCE"],
      ["visual", "CUSTOMIZE"],
    ]
      .map(
        ([id, label]) =>
          `<button role="tab" aria-selected="${g.garageTab === id}" class="${g.garageTab === id ? "active" : ""}" data-action="tab-${id}">${label}</button>`,
      )
      .join(
        "",
      )}</div><div class="garage-stage" aria-label="3D car preview"><div class="orbit-hint">${icon("refresh")} DRAG TO LOOK AROUND</div></div><section class="garage-strip garage-panel"><button class="garage-arrow" data-action="garage-prev" aria-label="Previous car">←</button>${carList}<button class="garage-arrow" data-action="garage-next" aria-label="Next car">→</button></section><section class="garage-car-info garage-info"><div class="garage-info-content">${g.garageCap !== null ? `<p class="filter-label">MAX PI ${g.garageCap} <button data-action="garage-clear-filter">CLEAR FILTER</button></p>` : ""}<p class="eyebrow">${c.type} / ${c.drive}</p><h2>${c.name.toUpperCase()}</h2><div class="spec-line"><span><b>${c.topSpeed + o.upgrades.engine * 5 + o.upgrades.turbo * 3}</b> KM/H</span><span><b>${Math.max(2, c.acceleration - o.upgrades.turbo * 0.25).toFixed(1)}</b> 0–100 S</span><span><b>${Math.round(c.massKg * (1 - o.upgrades.weight * 0.035))}</b> KG</span></div><div class="stat-bars">${["TOP SPEED", "ACCELERATION", "HANDLING", "DRIFT"].map((name, i) => `<div><span>${name}</span><i><b style="width:${c.stats[i] * 10}%"></b><b class="boost" style="left:${c.stats[i] * 10}%;width:${(stat(i) - c.stats[i]) * 10}%"></b></i><strong>${stat(i).toFixed(1)}</strong></div>`).join("")}</div>${panel ? `<div class="garage-tools">${panel}</div>` : ""}</div><div class="garage-activate"><span class="class-badge">${carClass(PI(c, o.upgrades))} ${PI(c, o.upgrades)}</span>${owned ? `<button class="button ${g.save.data.garage.activeCar === id ? "secondary" : "primary"}" data-action="activate-${id}">${g.save.data.garage.activeCar === id ? "CURRENT RIDE" : `SELECT CAR ${icon("check")}`}</button>` : `<button class="button primary" data-action="buy-${id}" ${g.save.data.profile.level < c.level || g.save.data.profile.credits < c.price ? "disabled" : ""}>${g.save.data.profile.level < c.level ? `UNLOCK AT LEVEL ${c.level}` : `BUY · ${fmt(c.price)} CR`}</button>`}</div></section></main>${this.footer()}`;
  }
  modes() {
    return this.tracks();
  }
  mapSVG(id: string, reverse = false, marker?: THREE.Vector3) {
    const key = `${id}:${reverse}`;
    if (!marker && this.mapArt.has(key)) return this.mapArt.get(key)!;
    const t = TRACKS.find((t) => t.id === id) ?? TRACKS[0],
      pts = t.points,
      minX = Math.min(...pts.map((p) => p[0])),
      minZ = Math.min(...pts.map((p) => p[1])),
      maxX = Math.max(...pts.map((p) => p[0])),
      maxZ = Math.max(...pts.map((p) => p[1])),
      scale = Math.min(220 / (maxX - minX), 140 / (maxZ - minZ));
    const geometry = this.layout(t.id, reverse),
      points = geometry.points
        .filter(
          (_, i) => i % Math.max(1, Math.floor(geometry.samples / 150)) === 0,
        )
        .map(
          (p) =>
            new THREE.Vector3(
              (p.x - minX) * scale + 35,
              0,
              (p.z - minZ) * scale + 25,
            ),
        ),
      d =
        points
          .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.z.toFixed(1)}`)
          .join(" ") + "Z",
      a = points[0],
      b = points[reverse ? points.length - 3 : 3];
    const art = `<svg class="track-map-art" viewBox="0 0 300 195" aria-label="${t.name} layout"><defs><pattern id="grid-${id}" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="currentColor" stroke-width=".3"/></pattern></defs><rect width="300" height="195" fill="url(#grid-${id})" opacity=".2"/><path d="${d}" fill="none" stroke="currentColor" stroke-width="16" opacity=".06"/><path class="map-line" d="${d}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="${a.x}" y1="${a.z}" x2="${b.x}" y2="${b.z}" stroke="#edffac" stroke-width="2" marker-end="url(#arrow-${id})"/><defs><marker id="arrow-${id}" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 6 3 0 6z" fill="#edffac"/></marker></defs><circle cx="${a.x}" cy="${a.z}" r="5" fill="#edffac" stroke="#172328" stroke-width="2"/>${marker ? `<circle cx="${(marker.x - minX) * scale + 35}" cy="${(marker.z - minZ) * scale + 25}" r="6" fill="var(--accent)" stroke="#07090d" stroke-width="2"/>` : ""}</svg>`;
    if (!marker) this.mapArt.set(key, art);
    return art;
  }
  raceOptions(config: Game["config"], disabled = false, showAI = true) {
    return (
      '<div class="condition-row"><span>Laps</span>' +
      stepper("laps", config.laps, 1, 5, disabled) +
      "</div>" +
      (showAI
        ? '<div class="condition-row"><span>Rivals</span>' +
          segmented(
            "rivals",
            [0, 1, 2, 3, 4, 5].map((n) => [String(n), String(n)] as const),
            String(config.rivals ?? 5),
            disabled,
          ) +
          '</div><div class="condition-row"><span>Difficulty</span>' +
          segmented(
            "difficulty",
            [
              ["easy", "EASY"],
              ["normal", "NORMAL"],
              ["hard", "HARD"],
              ["legend", "LEGEND"],
            ],
            config.difficulty,
            disabled,
          ) +
          "</div>"
        : "") +
      '<div class="condition-row"><span>Direction</span>' +
      segmented(
        "direction",
        [
          ["forward", "FORWARD"],
          ["reverse", "REVERSE"],
        ],
        config.reverse ? "reverse" : "forward",
        disabled,
      ) +
      '</div><div class="condition-row"><span>Weather</span>' +
      segmented("weather", WEATHERS, config.weather, disabled) +
      "</div>"
    );
  }
  trackCards(selected: string, action = "track", reverse = false) {
    return TRACKS.map(
      (t, i) =>
        `<button class="track-card env-${t.environment} ${selected === t.id ? "selected" : ""}" data-action="${action}-${t.id}" style="--track-accent:${t.accent}"><div class="track-art"><span class="track-location">${["NIGHT CITY", "PACIFIC COAST", "RED ROCK COUNTY"][["neon", "coast", "canyon"].indexOf(t.environment)]}</span>${this.mapSVG(t.id, selected === t.id && reverse)}<span class="track-number">${String(i + 1).padStart(2, "0")}</span></div><div class="track-detail"><span class="eyebrow">${t.subtitle}</span><h2>${t.name}</h2><p>${t.difficulty}<span>BEST ${formatTime(this.g.save.data.records[t.id + (reverse ? "_reverse" : "")]?.bestLap ?? null)}</span></p></div></button>`,
    ).join("");
  }
  tracks() {
    const g = this.g,
      index = Math.max(
        0,
        TRACKS.findIndex((t) => t.id === g.config.track),
      ),
      mode = MODES.find((m) => m.id === g.config.mode)!;
    const cards = [-1, 0, 1]
      .map((offset) => {
        const t = TRACKS[(index + offset + TRACKS.length) % TRACKS.length],
          geom = this.layout(t.id, g.config.reverse);
        const elevation =
          Math.max(...t.points.map((p) => p[2] ?? 0)) -
          Math.min(...t.points.map((p) => p[2] ?? 0));
        const corners = t.points.length,
          tags = (t.sections ?? [])
            .filter((x) =>
              ["dirt", "narrow", "tunnel", "bridge"].includes(x.type),
            )
            .map((x) => x.type);
        return (
          '<div class="carousel-slot offset-' +
          offset +
          '">' +
          trackCard(
            t,
            this.mapSVG(t.id, g.config.reverse),
            "<span>" +
              (geom.length / 1000).toFixed(2) +
              " KM</span><span>↕ " +
              elevation +
              " M</span><span>" +
              corners +
              " TURNS</span><span>" +
              ["ASPHALT", ...tags].join(" / ").toUpperCase() +
              "</span>",
            formatTime(
              g.save.data.records[t.id + (g.config.reverse ? "_reverse" : "")]
                ?.bestLap ?? null,
            ),
            offset === 0,
          ) +
          "</div>"
        );
      })
      .join("");
    const t = TRACKS[index];
    if (g.setupStep === "conditions") {
      const geom = this.layout(t.id, g.config.reverse);
      const elevation =
        Math.max(...t.points.map((p) => p[2] ?? 0)) -
        Math.min(...t.points.map((p) => p[2] ?? 0));
      const best =
        g.save.data.records[t.id + (g.config.reverse ? "_reverse" : "")]
          ?.bestLap ?? null;
      return (
        this.header() +
        '<main class="race-setup setup-conditions scroll-page"><div class="setup-heading"><button class="back-link" data-action="setup-track">' +
        icon("back") +
        ' TRACK</button><div class="setup-steps" aria-label="Step 2 of 2"><span class="done">01 CIRCUIT</span><i></i><span class="current">02 CONDITIONS</span></div><h1>SET THE CONDITIONS</h1><p>' +
        mode.icon +
        " " +
        esc(mode.name) +
        " · " +
        mode.description +
        '</p></div><div class="conditions-layout"><section class="setup-track-summary env-' +
        t.environment +
        '"><div class="summary-art">' +
        this.mapSVG(t.id, g.config.reverse) +
        '</div><div class="summary-detail"><span class="eyebrow">' +
        t.environment.toUpperCase() +
        " / " +
        t.difficulty +
        "</span><h2>" +
        t.name +
        '</h2><dl class="summary-stats"><div><dt>LENGTH</dt><dd>' +
        (geom.length / 1000).toFixed(2) +
        "<small>KM</small></dd></div><div><dt>CLIMB</dt><dd>" +
        elevation +
        "<small>M</small></dd></div><div><dt>TURNS</dt><dd>" +
        t.points.length +
        "</dd></div><div><dt>BEST</dt><dd>" +
        formatTime(best) +
        '</dd></div></dl><button class="text-button change-track" data-action="setup-track">' +
        icon("refresh") +
        ' CHANGE CIRCUIT</button></div></section><aside class="conditions"><h2>RACE CONDITIONS</h2><div class="condition-options">' +
        this.raceOptions(
          g.config,
          false,
          ["race", "elimination"].includes(g.config.mode),
        ) +
        '</div><div class="panel-actions">' +
        button("START", "start", {
          variant: "primary start-button",
          icon: icon("arrow"),
          hint: "↵",
        }) +
        "</div></aside></div></main>" +
        this.footer()
      );
    }
    return (
      this.header() +
      '<main class="race-setup setup-track scroll-page"><div class="setup-heading"><button class="back-link" data-action="back">' +
      icon("back") +
      ' BACK</button><div class="setup-steps" aria-label="Step 1 of 2"><span class="current">01 CIRCUIT</span><i></i><span>02 CONDITIONS</span></div><h1>CHOOSE YOUR CIRCUIT</h1><p>' +
      mode.description +
      '</p></div><div class="mode-strip" role="tablist">' +
      MODES.map(
        (m) =>
          '<button role="tab" aria-selected="' +
          (m.id === g.config.mode) +
          '" class="mode-tab ' +
          (m.id === g.config.mode ? "selected" : "") +
          '" aria-label="' +
          esc(m.name) +
          '" data-action="mode-' +
          m.id +
          '"><span><b>' +
          m.icon +
          '</b><span class="mode-name" data-short="' +
          ((
            { time: "TIME", drift: "DRIFT", rush: "RUSH" } as Record<
              string,
              string
            >
          )[m.id] ?? m.name) +
          '"><span class="mode-full">' +
          m.name +
          "</span></span></span></button>",
      ).join("") +
      '<button class="mode-tab daily-tab" data-action="daily"><span>★ Daily</span></button></div><section class="track-browser"><div class="carousel">' +
      cards +
      '</div><div class="carousel-commands">' +
      button("←", "track-prev") +
      '<span class="carousel-count"><b>' +
      String(index + 1).padStart(2, "0") +
      "</b> / " +
      String(TRACKS.length).padStart(2, "0") +
      '</span><span class="carousel-dots" aria-hidden="true">' +
      TRACKS.map((x, i) => '<i class="' + (i === index ? "on" : "") + '"></i>').join("") +
      "</span>" +
      button("→", "track-next") +
      '</div></section><div class="setup-next-row"><p>' +
      icon("flag") +
      " <b>" +
      t.name +
      "</b> · " +
      t.environment.toUpperCase() +
      '</p><button class="button primary setup-next" data-action="setup-next" data-autofocus>NEXT · CONDITIONS ' +
      icon("arrow") +
      "</button></div></main>" +
      this.footer()
    );
  }
  career() {
    const g = this.g,
      stars = Object.values(g.save.data.career.stars).reduce(
        (a, b) => a + b,
        0,
      );
    const seasons = TIERS.map(
      (name, i) =>
        `<button data-action="tier-${i + 1}" class="${g.tier === i + 1 ? "selected" : ""}" ${g.save.data.career.unlockedTier < i + 1 ? "disabled" : ""}><span class="season-node">${g.save.data.career.unlockedTier < i + 1 ? icon("lock") : String(i + 1).padStart(2, "0")}</span><b>${name}</b><small>${g.save.data.career.unlockedTier < i + 1 ? i * 9 + " STARS NEEDED" : "CHAPTER " + (i + 1)}</small></button>`,
    ).join("");
    const events = CAREER_EVENTS.filter((e) => e.tier === g.tier)
      .map((e, i) => {
        const earned = g.save.data.career.stars[e.id] ?? 0,
          tooHigh = g.save.pi > e.maxPI;
        return `<article class="career-event"><span class="event-index">${String(i + 1).padStart(2, "0")}</span><div class="event-details"><h2>${e.name}</h2><p>${MODES.find((m) => m.id === e.mode)?.name} · ${TRACKS.find((t) => t.id === e.track)?.name}</p><span class="pi-chip ${tooHigh ? "over-cap" : ""}">${tooHigh ? "Your car is too strong — pick a lower class" : `MAX PI ${e.maxPI} / YOURS ${g.save.pi}`}</span> ${tooHigh ? `<button class="pick-car" data-action="garage-cap-${e.maxPI}">Pick another car →</button>` : ""}</div><span class="stars">${"★".repeat(earned)}<span>${"☆".repeat(3 - earned)}</span></span><span class="event-reward">${fmt(e.reward)} <small>CR</small></span>${button("RACE", "event-" + e.id, { disabled: tooHigh, icon: icon("arrow") })}</article>`;
      })
      .join("");
    return `${this.header("career")}<main class="page scroll-page career-page">${this.top("YOUR ROAD TO THE TOP", "WRITE YOUR LEGACY", stars + " / 60 stars collected. Win stars to unlock the next chapter.")}<div class="season-line">${seasons}</div><div class="career-events">${events}</div></main>${this.footer()}`;
  }
  settings() {
    return `${this.header("settings")}<main class="page scroll-page settings-page">${this.top("MAKE IT YOURS", "THE SETUP")}<div class="settings-layout"><nav class="settings-tabs">${["gameplay", "controls", "graphics", "audio", "online"].map((t) => `<button data-action="settings-tab-${t}" class="${t === this.g.settingsTab ? "selected" : ""}">${t.toUpperCase()}</button>`).join("")}</nav><section class="settings-content">${settingsContent(this.g)}<button class="danger text-button" data-action="reset-progress">RESET PROGRESS ${icon("refresh")}</button></section></div></main>${this.footer()}`;
  }
  profile() {
    const d = this.g.save.data,
      s = d.stats,
      xpIn = d.profile.xp % 800;
    const tiles: [string, string][] = [
      ["RACES", fmt(s.races)],
      ["WINS", fmt(s.wins)],
      ["PODIUMS", fmt(s.podiums)],
      ["CLEAN RACES", fmt(s.cleanRaces)],
      ["DISTANCE", `${(s.distance / 1000).toFixed(1)} KM`],
      ["TOP SPEED", `${Math.round(s.topSpeed)} KM/H`],
      ["BEST DRIFT", fmt(s.bestDrift)],
      ["LONGEST AIR", `${s.longestAir.toFixed(2)} S`],
      ["NEAR MISSES", fmt(s.nearMisses)],
      ["OVERTAKES", fmt(s.overtakes)],
      ["ONLINE WINS", `${fmt(s.onlineWins)} / ${fmt(s.onlineRaces)}`],
      [
        "TIME PLAYED",
        `${Math.floor(s.playTime / 3600)}H ${Math.floor((s.playTime % 3600) / 60)}M`,
      ],
    ];
    const unlocked = Object.keys(d.achievements).length;
    const tab = this.g.profileTab,
      tabs = `<div class="profile-tabs" role="tablist">${(
        [
          ["overview", "OVERVIEW"],
          ["achievements", `ACHIEVEMENTS · ${unlocked}/${ACHIEVEMENTS.length}`],
        ] as const
      )
        .map(
          ([id, label]) =>
            `<button role="tab" aria-selected="${tab === id}" class="${tab === id ? "selected" : ""}" data-action="profile-tab-${id}">${label}</button>`,
        )
        .join("")}</div>`;
    const body =
      tab === "overview"
        ? `<div class="xp-result profile-xp"><span>LEVEL ${d.profile.level}</span><b>${fmt(800 - xpIn)} XP TO LEVEL ${d.profile.level + 1}</b><i><span style="width:${xpIn / 8}%"></span></i></div><div class="stat-tiles">${tiles.map(([k, v]) => statNumber(v, k)).join("")}</div>`
        : `<div class="achievement-grid">${ACHIEVEMENTS.map(
      (a) => {
        const [now, target] = a.progress(d),
          done = !!d.achievements[a.id],
          pct = Math.min(100, (now / target) * 100);
        return `<div class="achievement ${done ? "unlocked" : ""}"><span class="achievement-icon">${icon(done ? "star" : "lock")}</span><div><b>${a.name}</b><small>${a.detail}</small><i><span style="width:${done ? 100 : pct}%"></span></i></div><span class="achievement-reward">${done ? "DONE" : `+${fmt(a.reward)}`}</span></div>`;
      },
    ).join("")}</div>`;
    return `${this.header("profile")}<main class="page scroll-page profile-page profile-${tab}">${this.top("DRIVER FILE", esc(d.profile.name), `Level ${d.profile.level} · ${fmt(d.profile.xp)} XP · ${unlocked} of ${ACHIEVEMENTS.length} achievements`)}${tabs}${body}</main>${this.footer()}`;
  }
  lobby() {
    const g = this.g,
      n = g.net;
    if (!n) {
      const ui = g.netUI;
      return `${this.header("lobby")}<main class="page scroll-page lobby-page">${this.top("ONLINE · PEER TO PEER", "RACE YOUR FRIENDS", "Each player runs VELOX on their own computer. Cars connect directly — no game server, no account.")}<div class="lobby-entry"><section class="settings-panel"><p class="eyebrow">01 / HOST</p><h2>Open a room</h2><p class="muted">You pick the track and start the race. Invite up to ${MAX_PLAYERS - 1} friends.</p><button class="button primary" data-action="net-host">HOST A ROOM ${icon("users")}</button></section><section class="settings-panel"><p class="eyebrow">02 / JOIN WITH A CODE</p><h2>Got an invite?</h2><p class="muted">Paste the invite code your host sent you. You will get a reply code to send back.</p><textarea id="invite-code" rows="3" placeholder="VLX1-…" spellcheck="false" data-keep></textarea>${ui.reply ? `<label class="code-label">YOUR REPLY CODE — SEND THIS TO THE HOST<textarea readonly rows="3" id="reply-code">${esc(ui.reply)}</textarea></label><button class="button secondary" data-action="copy-reply">${icon("copy")} COPY REPLY</button><p class="muted small waiting">Waiting for the host to paste your reply…</p>` : `<button class="button primary" data-action="net-join" ${ui.busy ? "disabled" : ""}>${ui.busy ? "CONNECTING…" : `JOIN ${icon("link")}`}</button>`}</section><section class="settings-panel"><p class="eyebrow">03 / SAME COMPUTER</p><h2>Second window</h2><p class="muted">Testing or couch play: open VELOX in another tab of this browser and enter the host's room letters.</p><input type="text" id="room-code" maxlength="3" placeholder="ABC" autocomplete="off" data-keep><button class="button secondary" data-action="net-local">JOIN ROOM ${icon("arrow")}</button></section></div><p class="muted small lobby-note">Connections use WebRTC. A public STUN address lookup helps peers find each other across the internet; race data never passes through it. On the same Wi-Fi/LAN no internet is needed. Very strict networks may block direct connections.</p></main>${this.footer()}`;
    }
    const me = n.self,
      host = n.isHost,
      c = n.config,
      invite = g.netUI.invite;
    const players = n.players
      .map(
        (p, i) =>
          `<div class="lobby-player ${p.id === n.selfId ? "me" : ""}"><span class="slot">${String(i + 1).padStart(2, "0")}</span><span class="car-swatch" style="--car-color:${p.visual.paint}">${icon("car")}</span><div><b>${esc(p.name)}${p.host ? ' <em class="host-tag">HOST</em>' : ""}</b><small>${carById(p.car).name.toUpperCase()}${p.host || p.id === n.selfId ? "" : ` · <span data-ping="${esc(p.id)}">${p.ping}</span> MS`}</small></div><span class="ready ${p.ready ? "on" : ""}">${p.ready ? "READY" : "NOT READY"}</span></div>`,
      )
      .join("");
    const hostPanel = host
      ? `<section class="settings-panel invite-panel"><p class="eyebrow">INVITE FRIENDS · ${n.players.length} / ${MAX_PLAYERS}</p>${
          invite
            ? `<label class="code-label">1 · SEND THIS INVITE CODE<textarea readonly rows="3" id="offer-code">${esc(invite)}</textarea></label><button class="button secondary" data-action="copy-invite">${icon("copy")} COPY INVITE</button><label class="code-label">2 · PASTE THEIR REPLY CODE<textarea id="answer-code" rows="3" placeholder="VLX1-…" spellcheck="false" data-keep></textarea></label><div class="row-buttons"><button class="button primary" data-action="net-accept" ${g.netUI.busy ? "disabled" : ""}>CONNECT ${icon("link")}</button><button class="text-button" data-action="net-cancel-invite">CANCEL</button></div>`
            : `<p class="muted">Each friend needs their own code. Create one, send it, then paste back their reply.</p><button class="button primary" data-action="net-invite" ${g.netUI.busy || n.players.length >= MAX_PLAYERS ? "disabled" : ""}>${g.netUI.busy ? "GENERATING…" : `CREATE INVITE CODE ${icon("link")}`}</button>`
        }<p class="muted small">Same-computer room: <b class="room-code">${esc(n.localRoom)}</b></p></section>`
      : "";
    return `${this.header("lobby")}<main class="page scroll-page lobby-page">${this.top(host ? "YOU ARE HOSTING" : "CONNECTED TO HOST", "THE MEET-UP", host ? "Choose the race, invite your crew, start when everyone is ready." : "Pick your car in the garage and mark yourself ready.")}<div class="lobby-grid"><section class="settings-panel"><p class="eyebrow">DRIVERS</p><div class="lobby-players">${players}</div>${host ? "" : `<button class="button ${me?.ready ? "secondary" : "primary"}" data-action="net-ready">${me?.ready ? "NOT READY" : `I'M READY ${icon("check")}`}</button>`}<button class="text-button" data-action="garage">CHANGE CAR ${icon("car")}</button></section><section class="settings-panel lobby-race-panel"><p class="eyebrow">THE RACE ${host ? "" : "· HOST DECIDES"}</p><div class="lobby-race-options"><label>MODE${select(
      'id="net-mode"',
      [
        ["race", "RACE"],
        ["roam", "FREE ROAM CRUISE"],
      ],
      c.mode,
      !host,
    )}</label><label>TRACK${select(
      'id="net-track"',
      TRACKS.map((t) => [t.id, t.name.toUpperCase()] as const),
      c.track,
      !host,
    )}</label><div class="race-options compact">${this.raceOptions({ ...g.config, ...c }, !host, false)}</div><div class="lobby-map">${this.mapSVG(c.track, c.reverse)}</div></div><div class="panel-actions">${host ? `<button class="button primary start-button" data-action="net-start" ${n.canStart && n.players.length >= 2 ? "" : "disabled"}>${n.players.length < 2 ? "WAITING FOR 2 DRIVERS" : n.canStart ? "START RACE" : "WAITING FOR READY"} ${icon("flag")}</button>` : ""}</div></section>${hostPanel}<section class="settings-panel chat-panel"><p class="eyebrow">CHAT</p><div class="chat-log">${g.chatLog.map((m) => `<p><b>${esc(m.name)}</b> ${esc(m.text)}</p>`).join("") || '<p class="muted">Say hi.</p>'}</div><div class="chat-row"><input type="text" id="chat-input" maxlength="80" placeholder="Message" autocomplete="off" data-keep><button class="button secondary" data-action="net-chat" aria-label="Send">${icon("send")}</button></div></section></div><button class="danger text-button leave-button" data-action="net-leave">LEAVE ${host ? "AND CLOSE ROOM" : "LOBBY"} ${icon("back")}</button></main>${this.footer()}`;
  }
  pause() {
    const g = this.g,
      online = !!g.net,
      r = g.race,
      track = TRACKS.find((t) => t.id === g.config.track),
      mode = MODES.find((m) => m.id === g.config.mode),
      standings = r?.standings() ?? [],
      place = standings.findIndex((s) => s.kind === "player") + 1;
    const entry = (
      action: string,
      label: string,
      detail: string,
      symbol: string,
      key = "",
    ) =>
      `<button class="pause-entry ${action === "resume" ? "primary" : ""}" data-action="${action}" ${action === "resume" ? "data-autofocus" : ""}><span class="pause-icon">${icon(symbol)}</span><span class="pause-text"><b>${label}</b><small>${detail}</small></span>${key ? keycap(key) : ""}</button>`;
    return `<div class="modal-backdrop pause-backdrop"><div class="pause-layout"><section class="pause-panel"><p class="eyebrow ${online ? "live-banner" : ""}">${online ? "LIVE · THE RACE CONTINUES" : "TAKE A BREATHER"}</p><h1>PAUSED</h1><div class="pause-chips"><span><small>LAP</small><b>${r?.lap ?? 1}<i>/${g.config.laps}</i></b></span><span><small>TIME</small><b>${formatTime(r?.time ?? 0)}</b></span>${place ? `<span><small>POSITION</small><b>P${place}<i>/${standings.length}</i></b></span>` : ""}</div><div class="pause-buttons">${entry("resume", "RESUME", "Back on the throttle", "play", "ESC")}${online ? "" : entry("restart", "RESTART", "Same grid, fresh start", "refresh") + entry("photo", "PHOTO MODE", "Frame the moment", "photo")}${entry("settings", "SETTINGS", "Controls, graphics, audio", "gear")}${entry("quit", "QUIT TO MENU", online ? "Leave this race" : "Progress in this race is lost", "back")}</div></section><aside class="pause-side"><div class="pause-map"><p class="eyebrow">${esc(mode?.name ?? "")}</p><h2>${track?.name ?? ""}</h2>${this.mapSVG(g.config.track, g.config.reverse, g.race?.player.position)}</div><div class="pause-status">${this.standingsCard(undefined, "LIVE ORDER")}</div></aside></div></div>`;
  }
  loading(label = "Preparing the circuit") {
    const track = TRACKS.find(
      (t) => t.id === (this.g.net?.config.track ?? this.g.config.track),
    )!;
    const tips = [
      "Release nitro and recharge to 25% to boost again.",
      "Brake before the corner. Accelerate through the exit.",
      "A clean racing line keeps your speed through a wall graze.",
    ];
    return `<main class="loading-screen load-shell env-${track.environment}">${speedRoad()}<div class="load-brand"><p class="eyebrow">NEXT ON THE GRID</p><h1>${track.name}</h1><div class="loading-map">${this.mapSVG(track.id)}</div><p class="load-status"><i></i><span class="load-label">${label}</span></p><p class="loading-tip"><b>TIP</b> ${tips[Math.floor(Date.now() / 4000) % tips.length]}</p></div>${gauge("GRID")}</main>`;
  }
  results() {
    const g = this.g,
      r = g.result!,
      online = !!g.net,
      drift = g.config.mode === "drift",
      standings = g.race ? g.race.standings() : r.standings,
      showTable = standings.length > 1;
    const table = showTable ? this.standingsCard(standings) : "";
    return `${this.header()}<main class="results-page ${drift ? "" : `place-${r.position}`}"><p class="eyebrow">${r.completed ? "THE NIGHT BELONGS TO YOU" : "ANOTHER RUN. ANOTHER CHANCE."}</p><div class="result-heading"><h1>${drift ? "STYLE POINTS" : r.completed ? (r.position === 1 && g.config.mode !== "time" ? "VICTORY" : "FINISH LINE") : "TIME’S UP"}<span class="title-period">.</span></h1><p class="result-sub">${esc(TRACKS.find((t) => t.id === g.config.track)?.name ?? "")} · ${esc(MODES.find((m) => m.id === g.config.mode)?.name ?? "")} · ${g.config.laps} ${g.config.laps === 1 ? "LAP" : "LAPS"}</p><span class="result-position">${drift ? `<span data-count="${r.score}">0</span>` : String(r.position).padStart(2, "0")}<small>${drift ? "DRIFT SCORE" : `/ ${standings.length} RACERS`}</small></span></div>${r.newBest ? `<div class="pb-banner">${icon("star")} NEW PERSONAL BEST · ${formatTime(r.best)}</div>` : ""}<div class="result-columns ${showTable ? "three" : ""}"><section class="result-card"><p class="eyebrow">THE RUN</p><h2>${TRACKS.find((t) => t.id === g.config.track)?.name}${g.config.reverse ? " · REVERSE" : ""}</h2><div class="result-total">${formatTime(r.time)}</div>${r.laps.map((t, i) => `<div class="result-row"><span>LAP ${String(i + 1).padStart(2, "0")}</span><strong>${formatTime(t)}</strong>${t === Math.min(...r.laps) ? '<span class="best-tag">BEST</span>' : ""}</div>`).join("")}<div class="result-row"><span>PERSONAL BEST</span><strong>${formatTime(r.best)}</strong></div></section>${table}<section class="result-card"><p class="eyebrow">THE PAYOFF</p><div class="reward-total"><span class="currency">CR</span> <span data-count="${r.credits}">0</span></div><div class="result-row"><span>RACE + STYLE REWARD</span><strong>+${fmt(r.credits - r.clean - r.nearMisses * 150)}</strong></div><div class="result-row"><span>CLEAN RACE BONUS</span><strong>+${fmt(r.clean)}</strong></div><div class="result-row"><span>NEAR MISSES</span><strong>+${fmt(r.nearMisses * 150)}</strong></div>${g.lastUnlocks.map((a) => `<div class="result-row unlock"><span>${icon("trophy")} ${esc(a.name)}</span><strong>+${fmt(a.reward)}</strong></div>`).join("")}${g.dailyResult ? `<div class="result-row unlock"><span>${icon("calendar")} DAILY CHALLENGE</span><strong>${g.dailyResult}</strong></div>` : ""}<div class="xp-result"><span>LEVEL ${g.save.data.profile.level}</span><b>+${fmt(r.xp)} XP</b><i><span style="width:${(g.save.data.profile.xp % 800) / 8}%"></span></i></div><div class="stars result-stars">${"★".repeat(r.stars)}<span>${"☆".repeat(3 - r.stars)}</span></div></section></div><div class="result-actions">${
      online
        ? `${g.net!.isHost ? `<button class="button primary" data-action="net-lobby">BACK TO LOBBY ${icon("users")}</button>` : `<span class="muted small">The host will bring everyone back to the lobby.</span>`}<button class="button secondary" data-action="replay">WATCH REPLAY ${icon("play")}</button>`
        : `<button class="button secondary" data-action="menu">MAIN MENU ${icon("back")}</button><button class="button secondary" data-action="replay">WATCH REPLAY ${icon("play")}</button><button class="button secondary" data-action="restart">RACE AGAIN ${icon("refresh")}</button><button class="button primary" data-action="${g.config.eventId?.startsWith("tier") ? "career" : "setup-again"}">${g.config.eventId?.startsWith("tier") ? "CONTINUE CAREER" : "NEXT RACE"} ${icon("arrow")}</button>`
    }</div></main>${this.footer()}`;
  }
  standingsCard(
    standings = this.g.race?.standings() ?? [],
    label = "FINAL ORDER",
  ) {
    const live = label === "LIVE ORDER",
      player = standings.find((s) => s.kind === "player");
    const leader =
      standings.find((s) => s.time !== null && !s.estimated)?.time ??
      standings.find((s) => s.time !== null)?.time ??
      null;
    return `<section class="result-card standings-card" id="standings-card"><p class="eyebrow">${label}</p>${standings
      .map(
        (s, i) =>
          `<div class="standing-row ${s.kind === "player" ? "me" : ""} ${s.out ? "out" : ""}"><span class="pos">${String(i + 1).padStart(2, "0")}</span><i style="background:${s.color}"></i><span class="who"><b>${esc(s.name)}</b><small>${esc(s.car.toUpperCase())}${s.kind === "remote" ? " · ONLINE" : ""}</small></span><strong>${live && player ? liveGap(s, player, this.g.race!.track.length) : s.out ? "OUT" : s.time === null ? "RACING…" : i && leader !== null ? `${formatDelta(s.time - leader)}${s.estimated ? "*" : ""}` : formatTime(s.time)}</strong></div>`,
      )
      .join(
        "",
      )}${standings.some((s) => s.estimated && s.time !== null) ? '<p class="muted small projected-note">* projected from track position</p>' : ""}</section>`;
  }
  hud() {
    return raceHUD(this.g);
  }
  photo() {
    return `<div class="photo-bar"><div><p class="eyebrow">VELOX / PHOTO MODE</p><span>Drag to orbit · Scroll to zoom</span></div><div><button class="button secondary" data-action="photo-back">${icon("back")} BACK</button><button class="button primary" data-action="capture">${icon("photo")} SAVE PNG</button></div></div>`;
  }
  replay() {
    return `<div class="replay-label"><span class="status-dot"></span> REPLAY <small>THE AFTER HOURS, AGAIN.</small></div><div class="photo-bar"><span>Director cam · cuts every 5 seconds</span><button class="button primary" data-action="results">BACK TO RESULTS ${icon("arrow")}</button></div>`;
  }
}
