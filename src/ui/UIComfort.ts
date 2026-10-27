import type { Game } from "../core/Game";
import { carById, UPGRADE_COSTS, type Upgrade } from "../data/cars";

export type ScrollMemory = Map<string, { top: number; left: number }>;
export const rememberScroll = (root: HTMLElement): ScrollMemory =>
  new Map(
    [...root.querySelectorAll<HTMLElement>("[data-scroll-key]")].map((el) => [
      el.dataset.scrollKey!,
      { top: el.scrollTop, left: el.scrollLeft },
    ]),
  );
export function revealControl(el: HTMLElement) {
  el.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
    block: "nearest",
    inline: "nearest",
  });
}

const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Wheel delta in pixels; mouse notches travel further so lists never feel stuck. */
export function wheelPixels(e: WheelEvent) {
  const d =
    e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
  // Notched wheels report ~100 px per click; trackpads report small steps.
  return Math.abs(d) >= 50 ? d * 1.6 : d * 1.15;
}

type Glide = { x: number; y: number; frame: number; last: number };
const glides = new WeakMap<HTMLElement, Glide>();
/** Eased scrolling toward an accumulated target, shared by wheel and drag momentum. */
export function smoothScroll(el: HTMLElement, dx: number, dy: number) {
  const maxX = el.scrollWidth - el.clientWidth,
    maxY = el.scrollHeight - el.clientHeight;
  let g = glides.get(el);
  if (!g) {
    g = { x: el.scrollLeft, y: el.scrollTop, frame: 0, last: 0 };
    glides.set(el, g);
  }
  if (!g.frame) {
    g.x = el.scrollLeft;
    g.y = el.scrollTop;
  }
  g.x = Math.max(0, Math.min(maxX, g.x + dx));
  g.y = Math.max(0, Math.min(maxY, g.y + dy));
  if (reducedMotion()) {
    el.scrollLeft = g.x;
    el.scrollTop = g.y;
    return;
  }
  if (g.frame) return;
  g.last = performance.now();
  const step = (now: number) => {
    // rAF timestamps can predate the wheel event that started the glide.
    const k = 1 - Math.exp(-Math.max(1, Math.min(64, now - g!.last)) / 75);
    g!.last = Math.max(g!.last, now);
    const fromLeft = el.scrollLeft,
      fromTop = el.scrollTop;
    const left = fromLeft + (g!.x - fromLeft) * k,
      top = fromTop + (g!.y - fromTop) * k;
    // Sub-pixel steps would round to no movement: finish them in one go.
    el.scrollLeft =
      Math.abs(g!.x - left) < 3 || Math.abs(left - fromLeft) < 1 ? g!.x : left;
    el.scrollTop =
      Math.abs(g!.y - top) < 3 || Math.abs(top - fromTop) < 1 ? g!.y : top;
    const arrived =
      Math.abs(el.scrollLeft - g!.x) < 1 && Math.abs(el.scrollTop - g!.y) < 1;
    // A scrollport that stops moving (content shrank, edge reached) ends the glide.
    const stuck = el.scrollLeft === fromLeft && el.scrollTop === fromTop;
    g!.frame =
      arrived || stuck || !el.isConnected ? 0 : requestAnimationFrame(step);
  };
  g.frame = requestAnimationFrame(step);
}
const scrollsY = (el: HTMLElement) =>
  /(auto|scroll)/.test(getComputedStyle(el).overflowY) &&
  el.scrollHeight > el.clientHeight + 1;
/** The nearest vertical scrollport that can still move in the wheel's direction. */
export function scrollPortFor(
  target: HTMLElement,
  root: HTMLElement,
  down: boolean,
) {
  for (
    let port: HTMLElement | null = target;
    port && port !== root && root.contains(port);
    port = port.parentElement
  ) {
    if (!scrollsY(port)) continue;
    const g = glides.get(port),
      top = g?.frame ? g.y : port.scrollTop;
    if (down ? top < port.scrollHeight - port.clientHeight - 1 : top > 0)
      return port;
  }
  // The 3D canvas sits outside #app: its wheel scrolls the page itself.
  const page = root.querySelector<HTMLElement>(".scroll-page,.page,.home");
  return page && scrollsY(page) ? page : null;
}

/** Mouse drag scrolls any scrollport, with momentum; touch keeps native panning. */
type DragEvent = PointerEvent & { dragAxes?: { x: boolean; y: boolean } };
function installDrag(el: HTMLElement) {
  let start: { x: number; y: number; left: number; top: number } | null = null,
    axes = { x: false, y: false },
    dragging = false,
    vx = 0,
    vy = 0,
    lastX = 0,
    lastY = 0,
    lastT = 0;
  const move = (e: PointerEvent) => {
    if (!start) return;
    const dx = e.clientX - start.x,
      dy = e.clientY - start.y;
    if (!dragging && Math.hypot(dx, dy) < 8) return;
    if (!dragging) {
      dragging = true;
      el.classList.add("drag-scrolling");
      document.body.classList.add("drag-scrolling");
    }
    const now = performance.now(),
      dt = Math.max(1, now - lastT);
    vx = vx * 0.6 + ((e.clientX - lastX) / dt) * 0.4;
    vy = vy * 0.6 + ((e.clientY - lastY) / dt) * 0.4;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
    glides.delete(el);
    if (axes.x) el.scrollLeft = start.left - dx;
    if (axes.y) el.scrollTop = start.top - dy;
  };
  const up = () => {
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    removeEventListener("pointercancel", up);
    if (!start) return;
    start = null;
    if (!dragging) return;
    el.classList.remove("drag-scrolling");
    document.body.classList.remove("drag-scrolling");
    // Swallow the click that ends a drag so cards are not activated.
    const swallow = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener("click", swallow, true), 0);
    if (performance.now() - lastT < 80)
      smoothScroll(el, axes.x ? -vx * 260 : 0, axes.y ? -vy * 260 : 0);
  };
  const down = (event: PointerEvent) => {
    const e = event as DragEvent;
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest("input,select,textarea,[contenteditable],.no-drag-scroll"))
      return;
    // Grabbing the scrollbar itself stays native.
    const r = el.getBoundingClientRect();
    if (
      e.clientX > r.left + el.clientLeft + el.clientWidth ||
      e.clientY > r.top + el.clientTop + el.clientHeight
    )
      return;
    // Nested scrollports split the drag: the innermost takes each axis it can move.
    const claimed = (e.dragAxes ??= { x: false, y: false });
    axes = {
      x: !claimed.x && el.scrollWidth > el.clientWidth + 1,
      y: !claimed.y && el.scrollHeight > el.clientHeight + 1,
    };
    if (!axes.x && !axes.y) return;
    claimed.x ||= axes.x;
    claimed.y ||= axes.y;
    start = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
    };
    dragging = false;
    vx = vy = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = performance.now();
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };
  el.addEventListener("pointerdown", down);
  return () => {
    el.removeEventListener("pointerdown", down);
    up();
  };
}

/** Discover every CSS scrollport, including nested lists and future screens. */
export function installScrolling(
  root: HTMLElement,
  memory: ScrollMemory = new Map(),
) {
  const counts = new Map<string, number>(),
    cleanups: (() => void)[] = [];
  for (const el of root.querySelectorAll<HTMLElement>("*")) {
    const css = getComputedStyle(el);
    if (!/(auto|scroll)/.test(`${css.overflowX} ${css.overflowY}`)) continue;
    const base =
      el.id ||
      el.className
        .split(/\s+/)
        .filter((c) => c && !/selected|active|scrolling/.test(c))
        .join(".") ||
      el.tagName;
    const index = counts.get(base) ?? 0;
    counts.set(base, index + 1);
    el.dataset.scrollKey ||= `${base}:${index}`;
    const saved = memory.get(el.dataset.scrollKey);
    if (saved) {
      el.scrollTop = saved.top;
      el.scrollLeft = saved.left;
    }
    let timeout = 0;
    const edges = () => {
      const vertical = el.scrollHeight > el.clientHeight + 1;
      const position = vertical ? el.scrollTop : el.scrollLeft;
      const end = vertical
        ? el.scrollHeight - el.clientHeight
        : el.scrollWidth - el.clientWidth;
      el.style.setProperty(
        "--scroll-axis",
        vertical ? "to bottom" : "to right",
      );
      el.style.setProperty("--scroll-before", position > 1 ? "24px" : "0px");
      el.style.setProperty(
        "--scroll-after",
        position < end - 1 ? "24px" : "0px",
      );
    };
    const scroll = () => {
      edges();
      el.classList.add("scrolling");
      clearTimeout(timeout);
      timeout = window.setTimeout(() => el.classList.remove("scrolling"), 700);
    };
    el.addEventListener("scroll", scroll, { passive: true });
    const observer = new ResizeObserver(edges);
    observer.observe(el);
    edges();
    const undrag = installDrag(el);
    cleanups.push(() => {
      undrag();
      observer.disconnect();
      el.removeEventListener("scroll", scroll);
      clearTimeout(timeout);
    });
  }
  return () => cleanups.forEach((clean) => clean());
}

const iconLabels: Record<string, string> = {
  pause: "Pause",
  sound: "Toggle audio",
  "track-prev": "Previous track",
  "track-next": "Next track",
  "garage-prev": "Previous car",
  "garage-next": "Next car",
  "net-copy": "Copy invite code",
  "net-chat": "Send chat message",
  camera: "Change camera",
  "reset-car": "Reset car",
};
export function rangeFill(input: HTMLInputElement) {
  const min = Number(input.min) || 0,
    max = Number(input.max) || 100;
  input.style.setProperty(
    "--range-fill",
    `${((Number(input.value) - min) / (max - min)) * 100}%`,
  );
}
export function decorateControls(root: HTMLElement, g: Game) {
  for (const input of root.querySelectorAll<HTMLInputElement>(
    "input[type=range]",
  ))
    rangeFill(input);
  for (const row of root.querySelectorAll<HTMLElement>(".setting-row")) {
    const control = row.querySelector<HTMLInputElement>(
      "input:not([type=hidden]),select,button",
    );
    const name = row.querySelector("b")?.textContent?.trim();
    if (control && name && !control.hasAttribute("aria-label"))
      control.setAttribute("aria-label", name);
    row.addEventListener("click", (e) => {
      if (
        (e.target as HTMLElement).closest("button,input,select,textarea,label")
      )
        return;
      control?.focus({ preventScroll: true });
      if (control?.type === "checkbox") control.click();
    });
  }
  for (const input of root.querySelectorAll<HTMLInputElement>(
    "input[type=color]",
  )) {
    const name =
      input.closest("label")?.textContent?.trim() ||
      input.dataset.visual ||
      "Choose colour";
    input.setAttribute("aria-label", name);
    input.title = name;
  }
  for (const b of root.querySelectorAll<HTMLButtonElement>("button")) {
    const action = b.dataset.action ?? "",
      label = iconLabels[action] || b.getAttribute("aria-label");
    if (label) {
      b.setAttribute("aria-label", label);
      b.title = label;
    }
    if (!b.disabled) continue;
    let reason = "Only the host can change these race settings";
    if (action.startsWith("buy-")) {
      const c = carById(action.slice(4));
      reason =
        g.save.data.profile.level < c.level
          ? `Unlocks at level ${c.level}`
          : `Need ${Math.max(0, c.price - g.save.data.profile.credits).toLocaleString("en-US")} more CR`;
    } else if (action.startsWith("upgrade-")) {
      const id = action.slice(8) as Upgrade,
        cost = UPGRADE_COSTS[g.save.active.upgrades[id]];
      reason =
        cost === undefined
          ? "Already at maximum upgrade level"
          : `Need ${(cost - g.save.data.profile.credits).toLocaleString("en-US")} more CR`;
    } else if (action === "daily")
      reason = "Today's challenge is already complete";
    else if (action === "net-start")
      reason =
        g.net && g.net.players.length < 2
          ? "At least two drivers must join"
          : "Every driver must be ready";
    else if (action === "garage-prev") reason = "First car — no previous car";
    else if (action === "garage-next") reason = "Last car — no next car";
    else if (b.closest(".stepper"))
      reason = `${b.textContent?.trim() === "−" ? "Minimum" : "Maximum"} ${b.dataset.control} reached`;
    else if (b.closest(".career-event"))
      reason = "Earn the required career stars to unlock this event";
    b.title = reason;
  }
}
