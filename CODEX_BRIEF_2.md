# VELOX 0.5 — Fix brief for Codex

> **Ringkasan (ID):** 7 perbaikan: (1) cahaya lampu & garis start/finish terpotong di jalan miring, (2) garasi saling tumpuk sehingga mobil susah dipilih, (3) busur speedometer cacat di atas, (4) ukuran tulisan sedikit dikecilkan, (5) navigasi scroll & jarak antar elemen, (6) bersihkan semua map: tidak ada air/laut di jalan, tidak ada kabut yang menutup pandangan, tidak ada benda di jalur, (7) finish harus tepat di garis finish. Penyebab sudah dicek di kode; urutan kerja dan kriteria lulus di bawah.

## 0. Rules

- Repo `D:\Games\velox` (TypeScript, Vite, three.js, Rapier). Commands: `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run dev`.
- After every task: typecheck + tests + build must pass. Do not move on with red tests.
- Do not change audio (`src/audio/*`), multiplayer protocol (`src/net/*`), save format (except an additive migration if truly needed), car generator design (`src/game/CarFactory.ts`, `CarDesigns.ts`) or handling.
- Visual checks: use the screenshot tool that already exists:
  `node tools/scripts/shots.mjs tools/scripts/scenes/<file>.mjs 1920x1080` (needs `npm run dev` on port 5174 and installed Chrome). Scenario files export `[[name, "async js using g and sleep", waitMs], ...]`; see `tools/scripts/scenes/map.mjs` (env `SPOTS="neon_gp:0.55,coast_gp:0.25"`). Look at every screenshot you take before calling a task done.
- Check every UI change at **1920×1080, 1920×960 (browser with toolbars), 1536×864, 1366×768, 1280×720 and 390×844**.
- When finished run: `node tools/scripts/qa-ui.mjs --full`, `qa-hud.mjs`, `qa-network.mjs`, `qa-final.mjs`, `qa-environments.mjs` with `VELOX_URL=http://127.0.0.1:5174`. Important: before measuring FPS, make sure no other tab or window is running the game, because a second running copy halves the GPU budget.

---

## 1. Road decals must follow the road surface (light pools, start/finish line, boost pads)

**Cause:**
- **Light pools.** `TrackBuilder.props()` places the light pools ("LightPool") as flat 13×13 m planes at a single point. The code sets `dummy.rotation.set(-Math.PI/2, 0, 0)`. The road is banked, curved and has elevation, so the planes cut into the asphalt or hover above it.
- **Start/finish checkers.** The checkers ("StartLine" InstancedMesh) are flat boxes rotated by yaw only, so they cut in the same way.
- **Boost pads.** The boost pads in `TrackSections.ts` are flat planes too.

**Fix:**
- Add a helper to `Track` (in `TrackBuilder.ts`):
  ```ts
  /** Grid that lies exactly on the asphalt: t range along the track, lateral range across it (metres). */
  roadPatch(t0: number, t1: number, lat0: number, lat1: number, rows: number, cols: number, lift = 0.02): THREE.BufferGeometry
  ```
  - **Vertices:** each vertex is `this.at(t, lateral).point` plus `lift` along the road normal. `at()` already includes bank and elevation.
  - **UVs:** u goes across the road (0..1), v goes along it (0..1).
  - **Wrapping:** handle `t0 > t1` by wrapping across 0/1.
- **Light pools:** rebuild them as `roadPatch` grids of 6×6 cells, centred on the old pool position, ±6.5 m along and across the road.
  - Merge all pools into one mesh.
  - Use a radial gradient (same glow texture) and vertex colours for the tints.
  - Keep `polygonOffset: true, polygonOffsetFactor: -2`, `depthWrite: false` and additive blending.
- **Start/finish:** build the line as one `roadPatch` strip.
  - **Size:** 1.2 m long, full width at ±halfWidth, at the finish position from §7.
  - **Texture:** a generated 16×2 checker DataTexture.
  - Remove the flat instanced boxes.
- **Boost pads:** build them as `roadPatch` strips (3.2 m long, 1.1×halfWidth wide). Keep the existing texture and animation.
- **Painted markings:** apply the same rule to anything else painted on the road. Grep for `rotation.set(-Math.PI / 2` and for `PlaneGeometry` placed at `point.y`. The existing curbs already use a road ribbon.

**Acceptance:**
- Screenshots on banked corners and on crests show no clipping or floating decals. Check at least `neon_gp` t = 0.12 / 0.55, `coast_gp` t = 0.25, `canyon_gp` t = 0.38, and the start line of every GP track.
- New unit test: for 50 random points of every `roadPatch`, the vertical distance to the road surface (raycast down onto the "Road" mesh) is between 0.005 and 0.05 m.

---

## 2. Garage layout: nothing may overlap; picking a car must be easy

**Symptom (1920×1026 browser window):** the car carousel at the bottom overlaps the stats panel ("KESTREL GT …"). The tab rail (MY CARS / DEALER / PERFORMANCE / CUSTOMIZE) is partly covered. The carousel cards are cut off at the right edge, and their lock icons sit on the bottom edge.

**Fix:** rebuild `.garage-page` as an explicit CSS grid. Do not use absolute positioning for the panels.

```
grid-template-columns: 200px 1fr minmax(320px, 380px);
grid-template-rows: auto 1fr auto;
areas:  "head  head   head"
        "rail  stage  info"
        "rail  strip  info";
```

- **rail:** vertical tab buttons, each at least 56 px tall with 8 px gaps, plus a label.
- **stage:** stays empty so the 3D car shows through (`pointer-events: none` on the stage area only, so orbit drag works).
- **info:** the stats panel. Scrolls vertically inside itself if it is too tall (`overflow:auto`). It must never extend under the strip.
- **strip:** horizontal car carousel, only as wide as the stage column.
  - **Cards:** 200×150 px each with 12 px gaps and 16 px inner padding. The lock and price row sits inside the card with 8 px bottom padding.
  - **Scrolling:** `overflow-x:auto; scroll-snap-type:x mandatory; scroll-padding-inline:16px`. Arrow buttons sit at both ends. The mouse wheel scrolls horizontally (convert `deltaY` to `scrollLeft` while hovering the strip). ← and → / LB and RB move between cards and call `scrollIntoView({inline:"nearest", block:"nearest"})`.
  - **Selection:** the selected card has the accent outline. Enter/A on a card previews it; a second Enter buys or selects it.
- **Small heights (≤ 800 px):** the strip collapses to 120 px cards. The info panel shows only the name, class/PI, 3 key stats and the action button.
- **Phone width:** rail on top as horizontal tabs, then the stage (40 vh), info, then the strip.
- **3D car framing:** the camera must frame the car inside the stage column. Compute the camera target offset from the stage column's screen centre (the renderer already has stage presets; add a `garage` look-at offset based on `stage.getBoundingClientRect()`).

**Acceptance:**
- At all 6 test sizes: no element overlaps another. Add an automated check to `qa-ui.mjs`: the bounding boxes of `.garage-rail`, `.garage-info`, `.garage-strip` and the header/footer must not intersect.
- Every car card is reachable and clickable with mouse, keyboard and gamepad.
- The 3D car is fully visible between the rail and the info panel.

---

## 3. Speedometer arc

**Cause (`src/ui/RaceHUD.ts` + `hud.css`):** `.shift-lights` is absolutely positioned at `top: 35px`, exactly on the top of the `.rpm-arc` path (`M30 153A105 105 0 1 1 230 153`, top at y≈16). The five LEDs cover the arc, so its top looks broken. The arc also uses `stroke-dasharray: 500` with a hard-coded offset formula, and its ends are cut square.

**Fix:**
- Remove `.shift-lights` from above the arc. Render the 5 shift LEDs as a small row under the gear circle, or as 5 short segments **outside** the arc at its right end (60°…20°), never on the arc line.
- Set `stroke-linecap: round` on both arc paths. Compute the real path length with `getTotalLength()` once after render, set `stroke-dasharray` and `dashoffset` from it, and fill the arc as `length * (1 - speed/maxSpeed)`.
- Add 12 small tick marks (every 30 km/h on a 0–360 scale) just inside the arc, plus a slightly thicker red zone over the last 15 %. The arc must be a perfect continuous curve at every speed.
- Make sure the SVG is not clipped: `overflow: visible` on the svg, and enough padding inside `.speedometer` (clip-path corner must not touch the arc).

**Acceptance:**
- HUD screenshots at 0, 40, 150 and 300 km/h show a smooth, uninterrupted arc with no overlapping LEDs.
- `qa-hud.mjs` still passes.

---

## 4. Slightly smaller type, more room

Reduce the type scale by about 12 %. Keep the minimum readable size at 12 px.

| Element | Now | New |
|---|---|---|
| Home menu items (`.home-entry > span`) | clamp(38px, 3.6vw, 54px) | clamp(30px, 3vw, 44px) |
| Page titles (`h1`, `.page-heading h1`, `.setup-heading h1`) | clamp(36px, 4vw, 56px) | clamp(30px, 3.2vw, 46px) |
| Title screen logo | clamp(88px, 15vw, 200px) | clamp(72px, 12vw, 160px) |
| Panel headings (`h2`, `.your-ride h2`) | 26–34px | 22–28px |
| Body text / descriptions | 16px | 15px |
| Labels / eyebrows | 13px | 12px |
| Buttons (`.button`) | 20px, min-height 48px | 17px, min-height 44px |
| HUD position `P1` | 76px | 64px |
| HUD speed number | 104px | 88px |
| Results position | as is | 85 % of now |

- The overrides live in `src/ui/styles/polish.css` (loaded last) and `tokens.css`. Change them there; do not scatter new `!important`s.
- `tests/ui-css` / `qa-ui` must still pass the 12 px minimum.

---

## 5. Scrolling and spacing

- **Spacing tokens:** add `--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px; --space-6: 32px` to `tokens.css`. Every list or stack of cards, rows, buttons and setting rows uses `gap` from these tokens. Minimum gap is `--space-2` between siblings and `--space-4` between sections. Nothing may touch its neighbour, including the mode tabs, track cards, career rows, settings rows, lobby players, result rows and pause buttons.
- **Scroll containers:** every scrollable page (`.scroll-page`, settings content, career list, garage info/strip, lobby, profile) gets:
  - `scroll-behavior: smooth` (disabled under `prefers-reduced-motion`);
  - `overscroll-behavior: contain`;
  - `scroll-padding-top` / `scroll-padding-bottom` equal to header (64 px) / footer (56 px) height plus 16 px, so focused items are never hidden under the bars;
  - a visible thin scrollbar on hover only.
- **Focus follows scroll:** whenever focus moves (spatial arrow navigation, Tab, gamepad D-pad), call `el.scrollIntoView({ block: "nearest", inline: "nearest" })`. Hook this into the existing focus logic in `Game.action()`.
- **Mouse wheel:** wheel over horizontal carousels (track carousel, garage strip, mode strip) scrolls them horizontally. Wheel anywhere else scrolls the page's main scroll container, even when the pointer is over the 3D canvas area.
- **Page fit:** no page may need body scrolling at 1366×768 or larger; only the inner scroll containers scroll. Check that the footer never covers the last item, which gets `padding-bottom: 72px`.

**Acceptance:**
- Keyboard-only and mouse-only walkthrough of every screen at 1366×768 and 1920×960: everything is reachable, nothing is hidden under the header/footer, and no elements touch.
- Add a check to `qa-ui.mjs`: for every focusable element, after `focus()` its bounding box is fully inside the viewport minus the header/footer.

---

## 6. Clean, readable maps (top priority — the owner still sees many map problems)

Goal: on every track, in every weather, the player always sees a clean dry road (or an honestly wet road in rain), clear sight lines and nothing in the driving corridor.

### 6.1 No water on the road

- **Sea:** `Environment.ts` places a 2800×2800 m sea plane at y = −0.2 around the coast terrain centre. Wherever terrain or road dips near or below 0 it shows through as "water on the road".
  - Build the sea as a mesh that excludes the road corridor: cut out every grid vertex within 30 m of the centreline, or use a shoreline polygon from the terrain where height < 0.
  - Enforce: road y ≥ sea level + 1.5 m everywhere, and terrain within 25 m of the road edge ≥ sea + 0.6 m.
  - Fix the terrain blend in `Terrain.heightAt` so coastal embankments never drop below sea + 0.6 within 25 m of the road.
- **Asphalt (`SurfaceMaterials.ts`):**
  - Clear weather: roughness ≥ 0.72 everywhere, no puddle mask, envMapIntensity ≤ 0.35 at night. The neon road must not look wet when it is dry.
  - Rain: a wet sheen is allowed (roughness ≥ 0.3), but **no** mirror puddles: remove the `roughnessFactor = .05` puddle path, or clamp it to ≥ 0.22, and limit puddles to the outer 1.2 m of the lane edges.

### 6.2 Fog and haze must never block the view

Set `FogExp2` densities in `Renderer.setRace` from a target visibility (50 % fog at distance D: `density = 0.8326 / D`).

| | Clear | Rain | Snow | Fog weather |
|---|---|---|---|---|
| Neon (city) | D = 420 m | 300 m | 260 m | 180 m |
| Coast | 650 m | 380 m | 320 m | 200 m |
| Canyon | 700 m | 420 m | 340 m | 200 m |

- Fog weather stays atmospheric but the next corner must always be readable: at least 180 m to 50 %.
- **Grade:** check the grade effect, the heat-haze pass (canyon, High+) and film grain. None of them may lower contrast of the road more than slightly. Disable heat haze below High, and limit its height to the bottom 15 % of the screen.
- **Particles:** rain streak / snow particle density must not exceed today's at Medium and must render behind the HUD-relevant area at no more than ~30 % coverage. Lower counts if a screenshot shows the road obscured.
- **Tunnels:** inside tunnels the scene fog colour follows the tunnel light colour; it must not go black.

### 6.3 Nothing in the driving corridor

- **Corridor test.** Write `tools/scripts/qa-corridor.mjs` (browser, Playwright, same setup as the other qa scripts) for every track (all 12, forward and reverse):
  - Sample every 5 m. Cast rays straight down from 8 m above the road at lateral offsets −0.9·half, −0.45·half, 0, +0.45·half, +0.9·half.
  - **Pass:** the first mesh hit is the road (`name === "Road"`), a curb, or an allowed road decal. A hit on terrain, sea, a prop, a building, a sign, a tunnel shell, a bridge deck above the road, a token in race mode, and so on, is a failure. Report track, t, lateral offset and object name.
  - Also cast horizontal rays at 1 m height along the lane centre to the next sample (5 m ahead). Any hit that is not a car is a failure: objects standing in the lane.
- **Pre-race snapshot.** For every track, take one screenshot every 10 % of t, chase camera, clear weather. Store them in `test-results/corridor/<track>/` and look at them. Fix every visual issue you see: floating objects, terrain spikes through the road or barriers, gaps between road and walls, z-fighting stripes, signs facing the wrong way, objects blocking the view at corner apexes.
- **Off-road visibility.** Large scenery (buildings, mesas, palms, rocks) on the inside of corners must stay at least 12 m outside the barrier, so the driver can see through the corner. Extend the existing clearance check with this apex rule.

**Acceptance:** `qa-corridor.mjs` passes with zero failures on all 24 track/direction combinations, and the 120 screenshots are clean.

---

## 7. Finish exactly on the finish line

**Cause (verified):**
- **Lap detection.** `Checkpoints.update()` registers the lap when the **car centre** enters sector 0, i.e. crosses track parameter t = 0.
- **Drawing.** The gantry and checkered line are drawn at `this.at(0.008)` (`TrackBuilder.build()`, `const start = this.at(0.008)`). On a 2.9 km Grand Prix that is about 23 m after t = 0 (about 15 m on the scaled legacy tracks). The race therefore ends 15–23 m **before** the visible line.

**Fix:**
- Draw the finish line (the road-patch strip from §1), the gantry and the 3D start lights at **exactly t = 0**.
- Lap and finish detection uses the **front bumper**, not the car centre:
  - `nose = position + forward × (spec.length/2)`, evaluate `nearest(nose)` for the checkpoint update. Keep using the centre for `progressOf()` ranking.
  - Apply the same rule to AI cars, so the finish order is fair.
  - For remote players it is fine as is, because they report their own laps.
- Move the grid back so no car's nose is past the line at the start. `gridSpot(slot)` should place the front row's nose 3 m behind t = 0 (`at(0)` minus tangent × (3 + length/2 + floor(slot/2) × 7)). The existing "behind the start line counts as negative progress" logic must keep working.
- Also update the start straight detection for the grandstands if it relies on 0.008.

**Tests:**
- Unit test with a straight synthetic track: drive a car at constant speed and record the position when `crossing === "lap"`. The car's nose must be within 0.5 m past the line (t = 0 plane) and never before it.
- Browser check: pause at the frame the race finishes. A screenshot from a side camera shows the car's nose on the checkered strip.

---

## 8. Work order and done criteria

| # | Task | Done when |
|---|---|---|
| 1 | §7 finish line + nose-based lap detection | new unit test green; visual check |
| 2 | §1 road-conforming decals | patch unit test green; corner/crest screenshots clean |
| 3 | §6 map cleanup (water, fog, corridor) | `qa-corridor.mjs` zero failures; 120 corridor screenshots clean |
| 4 | §3 speedometer | HUD screenshots at 4 speeds clean |
| 5 | §2 garage grid | no-overlap check at 6 sizes |
| 6 | §4 type scale + §5 scroll/spacing | qa-ui green incl. new focus-visibility check |
| 7 | Full regression | all tests + all qa scripts + build green; CHANGELOG 0.5.0 entry |

Final checklist:
- [ ] Light pools, finish line and boost pads hug the asphalt on banks and crests.
- [ ] Garage: rail, info panel and car strip never overlap at any size; every car is selectable with mouse, keyboard and pad.
- [ ] Speedometer arc is a clean curve; shift LEDs no longer sit on it.
- [ ] Type about 12 % smaller, min 12 px; consistent gaps; nothing touches.
- [ ] Smooth scrolling; focused items are always fully visible; wheel works on carousels.
- [ ] No water or mirror puddles on any road; fog visibility within the table; no objects in the corridor on 24 track/direction combinations.
- [ ] The race finishes when the car's nose reaches the visible finish line.
