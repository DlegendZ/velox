/**
 * Phones play in landscape. `html.touch` marks touch-first devices (keyboard hints hide);
 * `html.phone` marks a short landscape viewport, which switches on the compact layout in
 * phone.css. Portrait phones see a rotate prompt instead of the game.
 */
const coarse = () => matchMedia("(pointer: coarse)").matches;

/** A phone-sized touch screen, whatever its current orientation. */
export const isPhone = () =>
  coarse() && Math.min(screen.width, screen.height) <= 600;

function classify() {
  const root = document.documentElement;
  root.classList.toggle("touch", coarse());
  root.classList.toggle(
    "phone",
    isPhone() || (innerHeight <= 500 && innerWidth > innerHeight),
  );
}

/** Fullscreen hides the browser bars; the lock keeps the game sideways (Android). */
async function goLandscape() {
  const root = document.documentElement;
  try {
    if (!document.fullscreenElement && root.requestFullscreen)
      await root.requestFullscreen({ navigationUI: "hide" });
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    await orientation.lock?.("landscape");
  } catch {
    /* iOS and desktop browsers refuse; the rotate prompt covers portrait. */
  }
}

export function installMobile() {
  classify();
  addEventListener("resize", classify);
  screen.orientation?.addEventListener?.("change", classify);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="rotate-prompt" role="alert"><div class="rotate-phone" aria-hidden="true"><i></i></div><b>TURN YOUR PHONE</b><span>VELOX is played in landscape.</span></div>`,
  );
  // Long-pressing a pedal or the 3D view must not open the browser's context menu
  // (back/forward/download image) or start a text selection.
  const typing = (t: EventTarget | null) =>
    t instanceof HTMLElement && !!t.closest("input, textarea, select");
  for (const type of ["contextmenu", "selectstart", "dragstart"])
    document.addEventListener(type, (e) => {
      if (coarse() && !typing(e.target)) e.preventDefault();
    });
  if (!isPhone()) return;
  // Browsers only allow fullscreen from a tap, so ask on the first one.
  const first = () => {
    void goLandscape();
    removeEventListener("pointerup", first, true);
  };
  addEventListener("pointerup", first, true);
}

/** Portrait on a phone: the game is covered by the rotate prompt. */
export const isPortraitPhone = () =>
  isPhone() && matchMedia("(orientation: portrait)").matches;
