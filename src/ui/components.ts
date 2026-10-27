import type { CarSpec } from "../data/cars";
import type { TrackSpec } from "../data/tracks";

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const keycap = (key: string) => `<kbd>${escape(key)}</kbd>`;
export function button(
  label: string,
  action: string,
  options: {
    variant?: string;
    icon?: string;
    hint?: string;
    disabled?: boolean;
  } = {},
) {
  return `<button class="button ${options.variant ?? "secondary"}" data-action="${escape(action)}" ${options.disabled ? "disabled" : ""}><span>${label}</span>${options.icon ?? ""}${options.hint ? keycap(options.hint) : ""}</button>`;
}
export function segmented(
  id: string,
  options: readonly (readonly [string, string])[],
  value: string,
  disabled = false,
  attrs = "",
) {
  return `<div class="segmented" role="group"><input type="hidden" id="${id}" value="${escape(value)}" ${attrs}>${options.map(([v, l]) => `<button type="button" data-action="control" data-control="${id}" data-value="${escape(v)}" aria-pressed="${value === v}" ${disabled ? "disabled" : ""}>${escape(l)}</button>`).join("")}</div>`;
}
export function stepper(
  id: string,
  value: number,
  min: number,
  max: number,
  disabled = false,
) {
  return `<div class="stepper"><input type="hidden" id="${id}" value="${value}"><button data-action="control" data-control="${id}" data-value="${Math.max(min, value - 1)}" aria-label="Decrease ${id}" ${disabled || value <= min ? "disabled" : ""}>−</button><output>${value}</output><button data-action="control" data-control="${id}" data-value="${Math.min(max, value + 1)}" aria-label="Increase ${id}" ${disabled || value >= max ? "disabled" : ""}>+</button></div>`;
}
export const toggle = (id: string, checked: boolean, attrs = "") =>
  `<input class="switch-input" type="checkbox" id="${id}" ${attrs} ${checked ? "checked" : ""}><label class="switch" for="${id}"><span class="sr-only">Toggle ${id}</span></label>`;
export const slider = (
  id: string,
  value: number,
  min: number,
  max: number,
  step: number,
  attrs = "",
  suffix = "",
) =>
  `<div class="slider"><input type="range" id="${id}" value="${value}" min="${min}" max="${max}" step="${step}" ${attrs}><output for="${id}">${value}${suffix}</output></div>`;
export const statNumber = (value: string, label: string) =>
  `<div class="stat-number"><strong>${value}</strong><span>${escape(label)}</span></div>`;
export function trackCard(
  track: TrackSpec,
  art: string,
  meta: string,
  best: string,
  selected = true,
) {
  return `<button class="track-card env-${track.environment} ${selected ? "selected" : ""}" data-action="track-${track.id}"><div class="track-art"><span class="track-location">${track.environment.toUpperCase()} / ${track.difficulty}</span>${art}</div><div class="track-detail"><h2>${track.name}</h2><div class="track-chips">${meta}</div><p>BEST ${best}<span class="medals">☆ ☆ ☆</span></p></div></button>`;
}
export const carThumb = (car: CarSpec, image = "") =>
  `<span class="car-thumbnail" style="--car-color:${car.color}">${image ? `<img src="${image}" alt="${car.name}">` : `<svg viewBox="0 0 160 65" aria-hidden="true"><path fill="currentColor" d="m7 40 16-7 23-19h53l26 19 25 7 3 13H6z"/><path fill="#141a24" d="m43 30 11-11h38l16 12z"/><circle cx="36" cy="51" r="10" fill="#07090d"/><circle cx="125" cy="51" r="10" fill="#07090d"/></svg>`}</span>`;
