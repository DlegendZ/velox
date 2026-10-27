# VELOX 0.6 — UI/UX & HUD polish brief for Codex

> **Ringkasan (ID):** Semua masalah UI/UX dan HUD yang ditemukan di audit 0.5 (screenshot 1920×1080 dan 1366×768). Fokus: keterbacaan (mobil/lampu studio tembus di belakang teks), elemen terpotong/tumpang tindih, garasi, layar hasil & pause, dan HUD. **Wajib** ikuti protokol bukti di §0: setiap item harus punya screenshot sebelum/sesudah dan dicatat di `CODEX_REPORT_3.md`. Item tanpa bukti dianggap belum dikerjakan.

## 0. Compliance protocol (mandatory — read first)

1. **Implement every item exactly as written.** Use the numbers, sizes and behaviours given. If one is technically impossible, implement the closest possible version and explain why in the report. Never silently skip, reinterpret or "improve" an item into something else.
2. **Before you change any code**, capture the baseline:
   `node tools/scripts/shots.mjs tools/scripts/scenes/polish.mjs 1920x1080`, then the same with `1366x768`, `1280x720` and `390x844`. Copy the outputs to `test-results/before/`.
3. **After each section**, re-capture the screenshots this item lists into `test-results/after/` and open them yourself. Done means the screenshot visibly shows the fix.
4. **Create `CODEX_REPORT_3.md`** with one row per item:
   `| ID | Done? | Evidence (screenshot files / test names) | Notes |`.
   - Every ID from this brief must appear, from A1 to I8.
   - "Done" requires at least one after-screenshot or one automated check.
5. **Keep the build green.** After every section run `npx tsc --noEmit`, `npm test` and `npm run build`. At the end, also run `qa-ui.mjs --full`, `qa-hud.mjs`, `qa-garage.mjs`, `qa-scroll.mjs`, `qa-final.mjs` and `qa-network.mjs` (dev server on port 5174, `VELOX_URL=http://127.0.0.1:5174`).
6. **Out of scope — do not touch:** audio, net protocol, physics/handling, car geometry (`CarFactory.ts`, `CarDesigns.ts`), track geometry, save format.
7. **Measuring FPS:** first make sure no other browser tab is running the game.
8. **If an existing QA script contradicts this brief,** update the script to match this brief and explain why in the report.

The scenario file `tools/scripts/scenes/polish.mjs` already walks every screen (title, menu, setup, career, garage + 3 tabs, lobby, profile, settings, race HUD, pause, results). Extend it when an item needs another state, for example the results screen after a real finish or HUD at speed.

---

## A. Global readability and layout

**A1 — Backdrop behind content screens.**
- **Problem:** on Settings, Career, Race setup, Lobby, Profile and Results, the 3D studio car, the bright floor glare and the vertical LED slats show straight through the UI. White text then sits on white light, the exact readability problem the owner reported earlier.
- **Full-screen backdrop:** every state except `title`, `menu`, `garage`, `race`, `photo` and `replay` gets one on `#app::before`: `background: rgba(6, 8, 11, 0.9); backdrop-filter: blur(8px) saturate(0.8);`. Keep a very subtle accent glow, for example the existing radial gradients at 50 % strength, on top of it.
- **Stop rendering:** while such a screen is open, the renderer stops drawing the studio. Render one last frame, then skip `composer.render` until the state changes. This saves GPU and laptop battery.
- **Evidence:** settings, career, setup and profile at 1366×768. No car or floor glare may be visible behind text.

**A2 — Studio lighting artefacts** (menu/garage, `Renderer.buildStage`).
- **LED slats:** the vertical slats on the back wall are 6.5 m tall and read as glitch lines running through the header. Make them 2.6 m tall, centred at y = 2.2, with brightness ≤ 0.9. Add a dark ceiling plane at y = 7.6 over the whole studio.
- **Floor glare:** the bright vertical streak on the floor below the car is the mirror reflecting the overhead softboxes and the spotlight. Set the reflector colour to `0x101317`, satin floor opacity to 0.92 and roughness to 0.7. No pure-white area larger than 2 % of the screen is allowed below the car.
- **Evidence:** menu and garage at 1920×1080 and 1366×768.

**A3 — Initial focus and focus ring.**
- **Problem:** every screen opens with a highlighted box on BACK.
- **Initial focus:** on screen entry, focus the first meaningful item, i.e. the first home entry, selected mode tab, selected track card, first career event, first settings row, selected garage car card or the RESUME/CONTINUE button. Never BACK.
- **Input modality:** add `body.input-pointer` after any mouse/touch input and `body.input-keys` after any key or gamepad input. Show focus outlines only with `input-keys`.
- **Evidence:** every screen after a mouse click shows no outline. After pressing an arrow key the outline appears on the focused element.

**A4 — No clipped or overflowing text.**
- **Where:** every single-line label (track names, car names, card subtitles, standings names, HUD track plate, button labels).
- **Rule:** use `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` with enough bottom padding (≥ 10 px) that no line is cut by its container's bottom edge. The garage card "OWNED" line is currently cut.
- **Automated check (`qa-ui.mjs`):** for every visible element whose computed `white-space` is `nowrap`, `scrollWidth ≤ clientWidth + 1` or the element has `text-overflow: ellipsis`. For every text element, its bounding box must lie inside its nearest positioned/overflow-hidden ancestor.

**A5 — Primary action always visible at 1366×768 and 1280×720 without page scrolling.**
- **Where:** START (race setup), CONTINUE/RACE AGAIN (results), the garage action button (BUY / SELECT CAR / CURRENT RIDE), RESUME (pause) and START RACE (lobby host).
- **Layout:** each sits in a sticky footer row of its panel. The panel's inner list scrolls (`overflow:auto`), never the page.
- **Automated check:** at both sizes, after screen entry, the primary button's bounding box is fully inside the viewport and not under the header (64 px) or footer (56 px).

**A6 — Consistent spacing.**
- Use the `--space-*` tokens from 0.5 for every gap. Minimum 8 px between siblings and 16 px between sections.
- Panels get 24 px inner padding (16 px at ≤ 1366 px wide).
- Before/after crops of setup, garage, pause and results must show no touching borders.

## B. Race setup screen

**B1 — Carousel side cards.** The neighbouring track cards are semi-transparent, so the 3D car shows through them and their text overlaps. Make them opaque (`var(--glass-strong)`), 0.55 opacity on the whole card, slightly scaled (0.86) and truncated text. Only the centre card is fully bright.

**B2 — Race conditions panel.**
- **Height:** `max-height: calc(100dvh - 64px - 56px - 2 × 24px)`. Options scroll inside the panel. The START button is a sticky footer of the panel, always fully visible (see A5).
- **Option rows:** 12 px apart.

**B3 — Mode strip.**
- Tabs keep a 6 px gap.
- On ≤ 1366 px wide, shorten labels: "CHECKPOINT RUSH" → "RUSH", "TIME TRIAL" → "TIME", "DRIFT ATTACK" → "DRIFT". Use `data-short` attributes; the full name stays in `aria-label`.
- The strip may scroll horizontally with snap, never wrap.

## C. Garage

**C1 — Camera framing.**
- **Problem:** every tab must show the whole car centred in the stage column (between the rail and the info panel). Currently the Performance tab zooms into the car so it is cut off behind the panels, and My Cars looks at the rear from high up.
- **Presets:**
  - My Cars/Dealer: front 3/4 view, camera at about (5.6, 1.7, 6.4).
  - Performance: side view at wheel height.
  - Customise: rear 3/4 view.
- **Framing rule:** each camera keeps a distance such that the car's projected bounding box fills 55–70 % of the stage column width.
- **Stage centre:** compute it from `getBoundingClientRect()` of `.garage-stage` and offset the camera with `camera.setViewOffset` (preferred) or a look-at shift.
- **Automated check (`qa-garage.mjs`):** project the car's `Box3` corners to screen for each tab at 1920×1080 and 1366×768. All corners must lie inside the stage rect.

**C2 — Mirror shards under the turntable.** The reflector shows broken pieces of the car below the turntable. Give the turntable a solid skirt (a cylinder from y = −0.4 to 0) or hide the reflector while in the garage. There must be no fragments below the platform.

**C3 — Car strip.**
- **Cards:** 220×150 px. The top 96 px is the thumbnail filling the width (`object-fit: cover`).
- **Thumbnails:** re-render them at 512×256 with the car framed tightly (fills about 80 % of the width; it is currently a tiny car in a big dark box).
- **Card text:** name (16 px, ellipsis), then drive · type (12 px), then a status row (OWNED / price / 🔒 Lv N) with 10 px bottom padding.
- **Gaps:** 12 px between cards.
- **Arrows:** placed directly at the strip's left and right edges, not floating in the middle of the stage. They are disabled at the ends.
- **Contents:** My Cars shows owned cars plus a final "+ DEALER" card that switches to the Dealer tab. Dealer shows all 8 cars.
- **Active car:** marked with an accent corner badge "ACTIVE".

**C4 — Info panel at small heights.**
- **Problem:** at 1366×768 the stat bars disappear and a large empty area is left under CURRENT RIDE.
- **Fix:** keep the 4 stat bars in a compact form (row height 22 px). Put the action button in a sticky footer. The panel height wraps its content and scrolls internally if needed — no dead space.

**C5 — Orbit hint.** "DRAG TO LOOK AROUND" fades out after 4 s or on the first drag, and reappears only on the next garage visit.

## D. Career

**D1** With A1 the backdrop is solved. The chapter line still needs work:
- Chapter titles must not overlap each other at 1280 px.
- Locked chapters show the lock and "N STARS NEEDED" in `--text-3`.
- The selected chapter title is accent-coloured.

**D2** Event rows: keep the current layout, but the RACE button gets 16 px right padding and is vertically centred. The PI chip turns red with the text "Your car is too strong — pick a lower class" when the car's PI is above the cap.

## E. Pause

**E1 — Panel padding.** The "PAUSED" title starts outside its panel; its left edge is clipped. Give the centre panel 28 px padding on all sides so the title and buttons sit inside it.

**E2 — Grid.**
- **Columns:** `grid-template-columns: minmax(280px, 1fr) minmax(320px, 400px) minmax(260px, 1fr)` with a 24 px gap, vertically centred.
- **Below 1100 px:** hide the map column.
- **Below 800 px:** hide the standings column.

**E3 — Live order rows.** Show the gap ("+1.2 s" or "+35 m", the same text as the HUD standings) or "FIN" instead of "RACING…", right-aligned and tabular. Truncate names with ellipsis.

## F. Results

**F1 — Fit without page scroll.**
- **Problem:** at 1366×768 the page is scrolled on entry, so the title, the position and the first rows are hidden under the header.
- **Layout:**
  - Header row (title + position) at most 110 px tall, with the position at most 96 px.
  - The three cards share the remaining height, and each card scrolls internally if needed.
  - The action row is sticky at the bottom.
- **On entry:** the page and every card start at `scrollTop = 0`. Initial focus is on CONTINUE (A3), but focusing it must not scroll the page — use `focus({ preventScroll: true })`.

**F2 — Final order card.** The winner row shows name, car and time on one line each, with nothing cut at the top. Projected times keep the "*" note at the card bottom with 8 px padding.

**F3** The level/XP row and the stars are 16 px apart. Achievement rows use the gold colour, with the icon aligned to the text baseline.

## G. Home menu and title

**G1** The "YOUR RIDE" and "DAILY CHALLENGE" cards must not overlap the turntable car.
- Move the turntable/camera so the car sits in the centre-right column, between the menu and the cards. Alternatively, keep the cards in a column right of the car, with the car framed at x = 55–65 % of the width.
- At 1366×768 both cards are fully visible above the footer with 16 px spacing.

**G2** Home entries: keep the numbered style.
- The description line appears with a 6 px gap and does not shift the items below by more than its own height (no jumpy layout). Animate with `grid-template-rows: 0fr → 1fr` or max-height.

## H. HUD (in race)

**H1 — Safe margins.** HUD plates keep 24 px from the screen edges at ≤ 1366 px wide and 40 px at ≥ 1920 px. No plate may touch another.

**H2 — Track plate.** The track name is one line with ellipsis, max-width 300 px. The mode label sits below it at 12 px. At 1366×768 "Metropolis Grand Prix" currently wraps into two lines.

**H3 — Gear indicator.** The gear circle currently overlaps the right end of the speed arc.
- Move it inside the speedometer plate under the arc's right end, with at least 8 px clearance from the arc stroke, or to the left of the KM/H label.
- Shift LEDs stay off the arc line.
- **Evidence:** HUD at 0, 40, 150 and 300 km/h.

**H4 — Control hints.** The bottom hint bar (WASD / SPACE / SHIFT / C / R) is shown only during the first 20 s of the player's first 3 races (count in the save under `settings.hintRaces`, additive, defaults to 0). It then fades over 0.6 s. Settings → Controls gets a "Show control hints" toggle that forces it on.

**H5 — Minimap caption.** Remove "HEADING UP / VELOX". Show the lap progress bar (thin, 4 px, accent) under the minimap instead, and the distance to the next checkpoint in metres (12 px).

**H6 — Standings.**
- At most 6 rows.
- At viewport height ≤ 800 px, show the top 3 + the player (with "…" separator) + the car directly ahead/behind if not already listed.
- Gaps right-aligned, tabular, 12 px.
- The player row keeps the accent bar.
- Rows are 4 px apart.

**H7 — Nameplates.** Show at most 3, for the nearest cars ahead within 80 m. Hide a nameplate when its car is within 6 m of the camera, or when its screen position overlaps the player car's screen bounding box. Fade them in and out over 0.2 s; no popping.

**H8 — Centre notifications.**
- The countdown, "GO", popups (drift/near miss/airtime/checkpoint delta) and "WRONG WAY" share one stack, centred between y = 22 % and 40 % of the screen.
- They never overlap the lap panel or each other: max 2 visible, each fading after 1.8 s.
- They use the display font at 28 px (popups) and 120 px (countdown) at 1080p, and scale with `--hud-scale`.

**H9 — Mobile HUD (390×844 portrait and 844×390 landscape).**
- The touch controls, speedometer, minimap and standings must not overlap each other.
- Below 500 px height: hide the minimap and show top 3 standings only.

## I. Comfort: hit targets, fonts, scrolling, feedback

Audit data from 1366×768 (DOM measurement):
- **Race setup:** 22 interactive elements smaller than 40 px — segmented options 45×35, rival pips 45×35, track ←/→ 50×38, BACK 75×24.
- **Mute button:** 32×32 on every screen.
- **Font mix:** Inter is used for 24–26 px headings next to Saira headings (setup, career), which reads as "a different font". Many secondary labels are 12–13 px.

**I1 — Hit targets.**
- Every interactive element is at least 44×44 px on desktop and 48×48 px on touch (`@media (pointer: coarse)`). Grow the padding, not just the font.
- Fix at least: segmented options and rival pips (44 px tall, min 48 px wide), stepper ± (44×44), track/garage carousel arrows (48×48), BACK link (44 px tall, 12 px horizontal padding), mute/sound button (44×44), settings tabs (48 px tall), garage rail tabs (56 px), paint swatches (44×44), toggles (52×30 track, 44 px clickable row height).
- **Automated check (`qa-ui.mjs`):** no visible `button`, `[data-action]`, `input` or `select` smaller than 44×44 at 1366×768 and 1920×1080. Text inputs and range sliders are exempt from the width rule only.

**I2 — One font system** (apply in `tokens.css` / `polish.css`; delete conflicting old rules).

| Role | Font |
|---|---|
| Headings, card titles, track/car names, buttons, nav, tabs, segmented options, setting labels, HUD labels | `Saira Variable`, weight 600–850, width 100–118 % |
| All numbers: speed, times, credits, stats, positions, PI | `Saira Condensed` 600–800, `tabular-nums` |
| Only descriptive sentences (descriptions, help text, chat, input text) | `Inter Variable` 400–500, 14–15 px |

- **Automated check:** no element with computed font-size ≥ 18 px uses Inter, and no `button` uses Inter.
- **Evidence:** before/after crops of setup, career, pause (map caption) and the HUD track plate.

**I3 — Type hierarchy (less bland).**
- **Secondary labels:** 13 px, weight 600, uppercase, letter-spacing 0.06em, colour `--text-2`.
- **Values:** at least 16 px at weight 700.
- **Body text:** 14–15 px at weight 400 with line-height 1.45.
- **Card titles:** 18–22 px at weight 800, italic Saira at width 112 %.
- **One idea per row:** label on top, value under it. No row may mix three different sizes.
- Remove any remaining 12 px text except eyebrows and key hints.

**I4 — Scrolling comfort.**
- **Scroll-position memory:** keep the scroll position of **every** scroll container across re-renders, not only `.scroll-page`. Give each container a `data-scroll-key` and restore it in `Game.screen()`.
- **Edge fades:** show a 24 px gradient at the top/bottom (or left/right for carousels) of a scroll container while more content is hidden in that direction (`mask-image`, toggled by an IntersectionObserver or a scroll handler).
- **Smooth programmatic scrolling:** `scrollIntoView({ behavior: "smooth", block: "nearest" })` (instant under reduced motion). Mouse-wheel scrolling stays native, so there is no artificial lag.
- **Carousels:** horizontal wheel support (from 0.5) plus touch momentum (`-webkit-overflow-scrolling: touch`, `scroll-snap-stop: normal`).
- **Scrollbars:** thin, 6 px, visible on hover/scroll only; the track area must not shift the layout (`scrollbar-gutter: stable`).

**I5 — Hover and press feedback** on every interactive element:
- **Hover:** a background or border change within 120 ms. Clickable rows such as career events, settings rows, lobby players, car cards and track cards also get a 2 px lift.
- **Press:** `transform: scale(0.98)`.
- **Cursor:** `cursor: pointer` on everything clickable.
- **Disabled:** shown at 0.45 opacity and given a `title` tooltip explaining why ("Need 2,300 more CR", "Unlocks at level 6").

**I6 — Style native controls.**
- **Range sliders:** 6 px track filled in accent up to the value, 20 px thumb with a ring on focus, value label to the right.
- **Colour inputs:** a 44×44 swatch button that opens the picker.
- **Text inputs and textareas:** 44 px tall, 12 px padding, the same glass surface as panels, accent border on focus.
- **Checkboxes:** none left unstyled.

**I7 — Icon-only buttons** (pause, mute, carousel arrows, copy, chat send) get `aria-label` and a `title` tooltip.

**I8 — Responsiveness feel.**
- Clicking any button gives a visual response within one frame. Screen transitions take 240 ms or less.
- No action may block the UI for more than 100 ms. Race loading shows the loading screen first, as it already does.
- Verify by clicking through every screen with the Performance panel open; list any long task over 100 ms in the report.

---

## Done checklist (all must be true)

- [ ] `CODEX_REPORT_3.md` lists A1…I8, each with evidence.
- [ ] No interactive element under 44×44 (automated check green); one font system (no Inter ≥ 18 px, no Inter buttons).
- [ ] Every scroll container keeps its position across re-renders and shows edge fades when content is hidden.
- [ ] `test-results/before/` and `test-results/after/` contain the full polish scene at 4 sizes.
- [ ] No 3D car or floor glare behind text on content screens; no LED lines through the header.
- [ ] No clipped text anywhere (automated check green).
- [ ] Primary actions visible without page scroll at 1366×768 and 1280×720 (automated check green).
- [ ] Garage: car fully framed in every tab (automated check green); strip thumbnails fill their cards; no mirror shards.
- [ ] Pause and Results fit with proper padding; results never open scrolled.
- [ ] HUD: track name one line, gear clear of the arc, hints auto-hide, nameplates ≤ 3 and never on the player car, notifications never overlap.
- [ ] `npx tsc --noEmit`, `npm test`, `npm run build` and all listed qa scripts pass. Add a CHANGELOG 0.6.0 entry.
