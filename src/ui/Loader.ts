/** Loading screens share one tachometer gauge: the needle and lit ticks show
 * progress, a red line marks the last 15%, and an outer ring keeps turning
 * while a long step (WASM, shaders) gives no intermediate progress. */
const CX = 120,
  CY = 120;
const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(CX + r * Math.cos(a)).toFixed(2)} ${(CY + r * Math.sin(a)).toFixed(2)}`;
};
/** 270° arc from the lower left (135°) clockwise to the lower right (405°). */
const arc = (r: number, from = 0, to = 1) => {
  const a = 135 + 270 * from,
    b = 135 + 270 * to;
  return `M${polar(r, a)}A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${polar(r, b)}`;
};

export function gauge(caption = "LOADING") {
  const labels = Array.from({ length: 9 }, (_, i) => {
    const [x, y] = polar(70, 135 + (270 * i) / 8).split(" ");
    return `<text x="${x}" y="${y}" class="${i >= 7 ? "red" : ""}">${i}</text>`;
  }).join("");
  return `<div class="gauge" style="--p:0"><svg viewBox="0 0 240 240" aria-hidden="true"><defs><linearGradient id="gauge-fill" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4fd8ff"/><stop offset=".55" stop-color="#c6ff3d"/><stop offset="1" stop-color="#ff3d7f"/></linearGradient><mask id="gauge-ticks" maskUnits="userSpaceOnUse"><path d="${arc(96)}" pathLength="100" stroke="#fff" stroke-width="18" fill="none" stroke-dasharray=".55 1.533"/></mask></defs><path class="gauge-spin" d="M${CX} ${CY - 112}a112 112 0 1 1 -.01 0" pathLength="100"/><path class="gauge-track" d="${arc(96)}" pathLength="100" mask="url(#gauge-ticks)"/><path class="gauge-red" d="${arc(96, 0.85, 1)}" mask="url(#gauge-ticks)"/><path class="gauge-fill" d="${arc(96)}" pathLength="100" mask="url(#gauge-ticks)" stroke-dasharray="0 100"/><path class="gauge-inner" d="${arc(82)}" pathLength="100" stroke-dasharray="0 100"/><g class="gauge-labels">${labels}</g><g class="gauge-needle"><path d="M${CX - 3} ${CY}L${CX} ${CY - 92}L${CX + 3} ${CY}Z"/><circle cx="${CX}" cy="${CY}" r="9"/></g></svg><div class="gauge-readout"><b>0</b><small>%</small><span>${caption}</span></div></div>`;
}

type Motion = {
  shown: number;
  target: number;
  ceiling: number;
  frame: number;
  last: number;
};
const motions = new WeakMap<HTMLElement, Motion>();
/** Animate the gauge toward `progress` (0–1). Between real updates the needle
 * creeps toward `ceiling` so a long single step never looks frozen. */
export function setGauge(
  root: ParentNode,
  progress: number,
  label?: string,
  ceiling = progress,
) {
  const el = root.querySelector<HTMLElement>(".gauge");
  if (label !== undefined) {
    const text = root.querySelector(".load-label");
    if (text) text.textContent = label;
  }
  if (!el) return;
  let m = motions.get(el);
  if (!m) {
    m = { shown: 0, target: 0, ceiling: 0, frame: 0, last: 0 };
    motions.set(el, m);
  }
  m.target = Math.max(m.shown, Math.min(1, progress));
  m.ceiling = Math.max(m.target, Math.min(0.99, ceiling));
  if (m.frame) return;
  m.last = performance.now();
  const fill = el.querySelector(".gauge-fill"),
    inner = el.querySelector(".gauge-inner"),
    needle = el.querySelector<SVGGElement>(".gauge-needle"),
    number = el.querySelector(".gauge-readout b");
  const step = (now: number) => {
    const dt = Math.min(0.1, (now - m!.last) / 1000);
    m!.last = now;
    if (m!.shown < m!.target - 0.002)
      m!.shown += (m!.target - m!.shown) * (1 - Math.exp(-dt * 7));
    else m!.shown += (m!.ceiling - m!.shown) * (1 - Math.exp(-dt * 0.35));
    const p = Math.min(1, m!.shown);
    fill?.setAttribute("stroke-dasharray", `${(p * 100).toFixed(2)} 100`);
    inner?.setAttribute("stroke-dasharray", `${(p * 100).toFixed(2)} 100`);
    needle?.setAttribute("transform", `rotate(${-135 + 270 * p} ${CX} ${CY})`);
    if (number) number.textContent = String(Math.round(p * 100));
    el.style.setProperty("--p", p.toFixed(3));
    el.classList.toggle("redline", p >= 0.85);
    m!.frame = el.isConnected ? requestAnimationFrame(step) : 0;
  };
  m.frame = requestAnimationFrame(step);
}

/** Moving lane markings in perspective behind the loading content. */
export const speedRoad = () =>
  '<div class="load-road" aria-hidden="true"><i></i><i></i><i></i></div>';

export function bootScreen() {
  return `<div class="boot load-shell">${speedRoad()}<div class="load-brand"><strong class="load-wordmark">VELOX</strong><p class="eyebrow">AFTER HOURS MOTOR CLUB</p><p class="load-status"><i></i><span class="load-label">Warming up the engine</span></p></div>${gauge("IGNITION")}</div>`;
}
