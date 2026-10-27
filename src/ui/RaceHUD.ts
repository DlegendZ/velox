import type { Game } from "../core/Game";
import { TRACKS, MODES } from "../data/tracks";
import { icon, formatTime } from "./Screens";
import { keycap } from "./components";

/** Scales the 1080p-designed HUD down on smaller windows so it never covers the road. */
export function hudFit() {
  return Math.max(
    0.55,
    Math.min(1, (innerWidth / 1920) * 1.18, (innerHeight / 1080) * 1.12),
  );
}
export function raceHUD(g: Game) {
  const r = g.race!,
    total = r.vehicles.length + r.remotes.size,
    roam = g.config.mode === "roam",
    settings = g.save.data.settings;
  const arc = "M30 153A105 105 0 1 1 230 153";
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = ((162.25 + (215.5 * i) / 12) * Math.PI) / 180;
    return `<line x1="${130 + 97 * Math.cos(a)}" y1="${120.984 + 97 * Math.sin(a)}" x2="${130 + 91 * Math.cos(a)}" y2="${120.984 + 91 * Math.sin(a)}"/>`;
  }).join("");
  return `<div class="race-hud mode-${g.config.mode} ${settings.touchDrag ? "" : "touch-arrows"} ${settings.colorSafe ? "color-safe" : ""}" style="--hud-scale:${(settings.hudScale / 100) * hudFit()}">
    <div class="race-position plate"><strong id="hud-position">P${total}</strong><span>/ ${total}</span><i id="position-arrow"></i></div>
    <div class="race-laps plate"><span>LAP <b id="hud-lap">1</b> / ${roam ? "∞" : g.config.laps}</span><strong id="hud-time">00:00.00</strong><small>BEST <b id="hud-best">${formatTime(r.bestLap)}</b></small></div>
    <div class="hud-track plate"><span>${TRACKS.find((t) => t.id === g.config.track)?.name}</span><small>${MODES.find((m) => m.id === g.config.mode)?.name}${g.net ? " · ONLINE" : ""}</small></div>
    <button class="hud-pause plate" data-action="pause" aria-label="Pause" title="Pause">${icon("pause")}</button><ol class="standings" id="hud-standings"></ol>
    <div class="start-lights" id="start-lights">${"<i></i>".repeat(5)}</div><div class="race-center" aria-live="polite"><div id="countdown" hidden></div><div id="wrong-way" hidden></div><div id="hud-split" class="split" hidden></div><div id="score-popup" hidden></div><div id="drift-score" hidden></div><div id="mode-timer" hidden></div></div>
    <div id="nameplates" class="nameplates"></div><div class="chat-feed" id="chat-feed"></div>${g.net ? '<input type="text" class="chat-entry" id="race-chat" maxlength="80" placeholder="Chat… (Enter to send)" hidden>' : ""}
    <div class="minimap plate"><canvas id="minimap" width="260" height="260"></canvas><div class="lap-progress"><i id="lap-progress"></i></div><span id="checkpoint-distance">0 m TO CHECKPOINT</span></div>
    <div class="driving-hints plate" id="driving-hints">${[
      ["WASD", "DRIVE"],
      ["SPACE", "DRIFT"],
      ["SHIFT", "NITRO"],
      ["C", "CAMERA"],
      ["R", "RESET"],
    ]
      .map(([k, v]) => `<span>${keycap(k)} ${v}</span>`)
      .join("")}</div>
    <div class="speedometer plate" data-nitro-state="ready"><svg class="rpm-arc" viewBox="0 0 260 180" aria-label="Speed 0 to 360 km/h"><g class="speed-ticks">${ticks}</g><path d="${arc}" fill="none" stroke="var(--line-strong)" stroke-width="4"/><path class="speed-red-zone" d="${arc}" pathLength="1" fill="none" stroke="var(--danger)" stroke-width="6" stroke-dasharray=".15 .85" stroke-dashoffset="-.85"/><path id="speed-arc" d="${arc}" fill="none" stroke="var(--accent)" stroke-width="4"/></svg><div class="shift-lights" id="shift-lights">${"<i></i>".repeat(5)}</div><div class="speed-value"><span id="hud-speed">000</span><small id="hud-units">KM/H</small><b id="hud-gear">1</b></div><div class="rpm-track"><i id="hud-rpm"></i></div><div class="nitro-label"><b id="nitro-label-text">NITRO</b><span id="nitro-percent">100%</span></div><div class="nitro-track"><i id="hud-nitro"></i></div></div>
    <div class="touch-utilities"><button class="plate" data-action="camera" aria-label="Change camera">CAM</button><button class="plate" data-action="reset-car" aria-label="Reset car">RESET</button></div>
    <div class="touch-controls"><div class="drag-pad" data-drag-pad aria-label="Drag horizontally to steer"><div class="drag-thumb"></div><span>DRAG TO STEER</span></div><div class="touch-arrow-pair"><button data-touch="left" aria-label="Steer left">◀</button><button data-touch="right" aria-label="Steer right">▶</button></div><div class="touch-pedals"><button data-touch="handbrake">DRIFT<small>+ GAS</small></button><button data-touch="nitro">N₂O<small>+ GAS</small></button><button data-touch="brake">BRAKE</button><button class="touch-gas" data-touch="throttle">GAS</button></div></div>
    <div class="speed-lines" id="speed-lines"></div><div class="impact-flash" id="impact-flash"></div><div id="fps" class="fps plate" ${g.showFPS ? "" : "hidden"}></div></div>`;
}
