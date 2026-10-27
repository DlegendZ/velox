# VELOX 0.3 — Execution brief for Codex

> **Ringkasan untuk owner (ID):** Dokumen ini adalah perintah kerja lengkap untuk Codex. Isinya: (1) perbaikan arah setir A/D, (2) nitro yang tetap bisa dipakai saat habis, (3) mobil berhenti total saat menyerempet dinding → harus meluncur, (4) tribun & dinding yang tembus ke jalan, (5) trek 3× lebih besar dengan elevasi, jembatan, terowongan, variasi tantangan, (6) grafis lebih realistis, (7) rombak total UI/UX menu + in-game (font besar, kontras terbaca di atas lampu putih, tidak "kotak-kotak AI slop"). Audio tidak diubah. Urutan kerja, kode acuan, data trek yang sudah divalidasi, dan kriteria lulus ada di bawah.

---

## 0. Ground rules (read first)

**Project:** `D:\Games\velox` — browser racing game. TypeScript + Vite 8 + three.js 0.186 + Rapier 0.21 (`@dimforge/rapier3d-compat`) + postprocessing + N8AO. No framework: screens are template strings in `src/ui/Screens.ts`, events are `data-action` attributes handled in `src/core/Game.ts`.

**Commands**
```
npm install
npm run dev            # http://127.0.0.1:5173
npx tsc --noEmit       # must be clean
npm test               # node:test via tsx, must be all green
npm run build          # must succeed
npm run handling       # prints steering/brake/drift numbers (tools/scripts/handling-metrics.ts)
```
In dev, `window.__velox` is the `Game` instance (use it for scripted QA).

**Hard rules**
1. Do the work in the order of section 9. After every section: `npx tsc --noEmit && npm test && npm run build` must pass. Do not move on with red tests.
2. Do **not** change audio design (`src/audio/*`). Only call existing `audio.sfx(...)`, `audio.setMusic(...)` from new UI/gameplay events. The owner is happy with the sound.
3. Do **not** break: multiplayer (`src/net/*`, lobby flow, invite codes), saves (`velox_save_v1` must still load; add migrations, never wipe progress except track records as described in 5.9), achievements, career, daily challenge, replays, ghost.
4. No real-world car brands, logos or names. Everything original.
5. Third-party assets: **only CC0** (Poly Haven, ambientCG, Kenney, Quaternius) or self-generated. Record every file in `CREDITS.md` (name, author, URL, license). Total added assets ≤ 35 MB. If you cannot download, use the procedural fallbacks described — never block on assets.
6. Performance budget (measure with F3 overlay, 1920×1080, Medium quality, 6 cars on the biggest track): ≥ 60 FPS on a mid laptop GPU, ≤ 400 draw calls, ≤ 1.8 M triangles. Use instancing, merged geometry and LOD as described.
7. Every visual/UI change must be checked in the browser at **1920×1080, 1366×768 and 390×844 (mobile)**. Take screenshots into `test-results/` (git-ignored) and look at them before calling a section done.
8. Keep code style: 2-space, double quotes, Prettier defaults (`npm run format`), short comments only where intent is non-obvious.

---

## 1. Bug — A/D steering is mirrored

**Root cause (verified):** `VehicleController` works in world-yaw sense: `steering > 0` → yaw rate > 0 → nose turns toward world **+X**. The chase camera sits behind the car looking down +Z, so screen-right is world **−X**. `Input.read()` returns `steer = right − left`, so pressing **D turns left on screen**. The old unit test even asserts the wrong thing (`tests/physics.test.ts`: `"right input turns right: x > 3"`).

**Fix — define one convention and enforce it at the boundary:**
- `Controls.steer` (in `src/core/Input.ts`) means: **+1 = turn right on screen, −1 = left.** Keep `Input.read()` producing `right − left` (keyboard, touch, gamepad axis unchanged).
- In `VehicleController.update()` convert once at the top: `const steerInput = -input.steer;` and use `steerInput` everywhere the method currently reads `input.steer` (steering target, drift kick, drift `along`, power-slide check). `this.steering` stays world-sense (used by wheel visuals and remote snapshots — consistent on all clients, do not touch).
- `src/game/AIDriver.ts` computes steer in world-yaw sense (`steerError * 1.9`). Return `steer: -clamp(steerError * 1.9)` so AI keeps driving correctly through the new boundary.
- `CameraRig.update()` roll: after the change, check visually that the camera leans **into** the corner (horizon tilts so the inside of the turn goes down slightly). Flip the sign of `targetRoll` if not.
- `tools/scripts/handling-metrics.ts` uses `settings.bindings.right` — keep, numbers must be unchanged in magnitude.

**Tests (update `tests/physics.test.ts`, add to `tests/features.test.ts`):**
- Car at origin, yaw 0, drive with `steer: +0.5` → assert `position.x < -3` (turns toward screen-right).
- AI regression: build a `Track` for `neon_a`, put one AI on the grid, run 20 s of fixed steps → assert its checkpoint `passed ≥ 3` (still drives the track).

**Acceptance:** in game, D/→ and gamepad stick right turn right; A/← left; AI still finishes races; `npm run handling` drift test still holds ~20°.

---

## 2. Bug — nitro keeps working after it is empty

**Root cause (verified):** `VehicleController.update()`:
`boosting = input.nitro && throttle > 0 && this.nitro > 0 && long > 2`. At 0 the tank recharges `3/s · dt`, becomes > 0 next frame, boost turns on again → nitro "never runs out" (flames, FOV, sound and some force flicker on forever). Also `RaceManager.scoring()` slipstream caps at `100` instead of the upgraded max.

**Fix:**
```ts
// VehicleController fields
nitroLocked = false;          // true after the tank hits 0
get nitroMax() { return 100 + this.owned.upgrades.nitro * 10; }

// in update(), replacing the current `this.boosting = …` line
if (this.nitroLocked && !input.nitro && this.nitro >= this.nitroMax * 0.25)
  this.nitroLocked = false;  // unlock needs ≥ 25 % AND the button released
this.boosting =
  input.nitro && !this.nitroLocked && input.throttle > 0 && this.nitro > 0 && long > 2;
// … existing drain/recharge + clamp to [0, nitroMax] …
if (this.boosting && this.nitro <= 0) {
  this.nitro = 0;
  this.boosting = false;
  this.nitroLocked = true;
}
```
The behaviour must be exactly: **when the tank empties, boost stops immediately and cannot start again until the tank is ≥ 25 % AND the player has released the nitro button.**
- Replace every hard-coded `100 + p.owned.upgrades.nitro * 10` / `Math.min(100, …)` in `RaceManager.ts` and `Game.ts` with `vehicle.nitroMax`.
- AI (`AIDriver`) already checks `nitro > 70`; leave it.

**HUD:** nitro bar gets three states — `ready` (accent colour), `active` (bright + animated stripes), `locked` (red-orange, label **RECHARGING**, pulsing). Flames, chromatic aberration, FOV kick and the nitro whoosh must stop the same frame boosting stops.

**Test:** hold nitro + throttle for 10 s from full → `boosting` becomes false once and stays false for the rest of the hold; `nitroLocked === true`; release, wait until ≥ 25 %, press again → boosts.

---

## 3. Bug — side contact with a wall stops the car dead

**Root causes (verified in code):**
1. Walls are ~300 separate rotated `cuboid` colliders per track (`TrackBuilder.build()`, `seg = 150`). Their ends overlap and form a saw-tooth inner face; the car's square chassis corner snags on every seam ("internal edge" problem).
2. Chassis is a sharp `cuboid` with friction 0.2 vs wall friction 0.12 (average combine) — still grips.
3. Nothing in gameplay turns a glancing hit into a slide; the yaw controller then fights the wall.

**Fix A — continuous, frictionless walls**
- Replace the per-segment barrier colliders with **one trimesh per side**: a vertical ribbon following the track at offset `±(halfWidth(t) + 0.8)`, from `roadY − 0.3` to `roadY + 1.3`, one quad per track sample (use the same sample count as the road). Build with
  `RAPIER.ColliderDesc.trimesh(vertices, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)`
  `.setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(0.05)`.
- Store the wall collider handles in `track.wallHandles: Set<number>`.
- Inner-side offset must never fold over itself: compute local radius from `track.curvature`; on the inside of a bend clamp the offset to `min(desired, 0.85 × localRadius)`. With the new track rules (section 5.2) this should never trigger, but keep the guard.
- Visual walls: keep instanced meshes but they must sit exactly on the collider line (see 6.4 for the new barrier models).
- Open gaps for Free Roam exits: split the ribbon into runs, skipping the exit samples (current rule `i % 30 < 5`, adapt to the new sample count).

**Fix B — rounded, slippery chassis** (`VehicleController` constructor)
`RAPIER.ColliderDesc.roundCuboid(0.78, 0.2, spec.length * 0.43 - 0.08, 0.08)` with `.setFriction(0.05).setFrictionCombineRule(Min)`. Keep mass/translation.

**Fix C — wall glide assist** (new method `VehicleController.wallContact(world, wallHandles)` called by `RaceManager.step()` right after `world.step()` for every local car):
```ts
// For each contact pair (chassis, wall): read manifold normal n (pointing from wall to car, flip if needed).
const v = body.linvel(); const vn = v.x*n.x + v.z*n.z;      // horizontal normal speed
if (vn < 0) {                                              // moving into the wall
  const speed = Math.hypot(v.x, v.z); const cos = -vn / Math.max(speed, 0.01); // 0 = parallel, 1 = head-on
  let tx = v.x - n.x*vn, tz = v.z - n.z*vn;               // keep only tangential part
  const keep = 1 - 0.35 * cos * cos;                        // 10° graze ≈ 1% loss, 45° ≈ 17%, head-on 35%
  tx *= keep; tz *= keep;
  const bounce = cos > 0.75 ? -vn * 0.15 : 0;               // tiny push-back only on hard hits
  body.setLinvel({ x: tx + n.x*bounce, y: v.y, z: tz + n.z*bounce }, true);
  if (cos < 0.6) {                                          // glancing: steer nose along the wall
    // rotate yaw toward the wall tangent direction closest to current heading, max 0.9 rad/s
  }
  this.wallImpact = -vn;                                    // m/s into the wall this step
}
```
- Replace the current `impact` heuristic (velocity-delta) with `wallImpact` for walls, and keep the delta heuristic only for car-to-car hits.
- Sparks: emit continuously along the contact while `wallImpact > 1.5` and speed > 40 km/h (scraping), a burst when `wallImpact > 6`.
- Penalties: `hits++`, "WATCH THE PAINT" and camera shake only when `wallImpact > 6` m/s. Scrapes play a looping metallic scrape (use `audio.sfx("impact")` at most every 0.4 s, low volume — no new audio code).

**Tests (`tests/walls.test.ts`):** straight wall built with the same helper.
- 100 km/h at 15° into the wall, throttle 0.6, 1.5 s → speed ≥ 85 km/h, heading within 10° of the wall direction, car still within 3 m of the wall (it slid along it).
- 100 km/h at 90° (head-on) → speed after 0.5 s ≤ 40 km/h and the car does not pass through.
- 300 steps scraping along a curved wall (radius 40 m) at 120 km/h → no snag: speed never drops more than 8 km/h in one step.

---

## 4. Bug — grandstands and walls poke into the road

**Verified:** `neon_a` start grandstand overlaps the road (11 of 280 sampled seat cells are on asphalt); on `neon_c` barrier boxes cross the inner edge of the tightest corner (radius 6.5 m < half width 8.1 m — the inner offset curve folds). Checkpoint gate bars are placed at `±(width/2 − 0.5)` → **inside** the road.

**Fix — one clearance system for everything placed beside the track:**
- New helper in `TrackBuilder`: `isClear(center: Vector3, halfExtent: number, margin: number): boolean` → true when `nearest(center).distance − halfExtent ≥ halfWidth(nearestT) + 0.8 (wall) + margin`. Use it for **every** placed object (buildings, mesas, palms, cacti, rocks, lamp posts, signs, billboards, grandstands, ramps, gantry legs). Objects that fail are skipped (or slid outward until they pass).
- Grandstands: never at a fixed `t`. Find the **longest straight** (|curvature| < 0.01 over ≥ 60 m) within 15 % of the start line and centre the stands on it, oriented to the local tangent; check every seat row with `isClear`. If no straight exists, put the stands on the outside of the start straight only.
- Gates: posts at `±(halfWidth + 1.2)` (outside the wall), overhead beam across. Never inside the road.
- Lamp posts at `±(halfWidth + 2.2)`, light pools stay on the road (they are decals).

**Test (`tests/clearance.test.ts`):** for every track (all old + new), build the `Track` headless (stub `document.createElement("canvas")` with a minimal 2D-context mock as needed) and assert that every collider except the road/terrain, and every instanced prop matrix, is clear by ≥ 0.5 m. Report the offending object type and position on failure.

---

## 5. Bigger tracks, elevation and variety

Goal: the owner said the maps are too small and it is "just going round in circles". New target: laps of **2.8–3.4 km**, elevation, bridges, tunnels, surface changes and set-piece moments, while keeping the 9 existing circuits playable (scaled up).

### 5.1 Track spec v2 (`src/data/tracks.ts`)
```ts
export type Section =
  | { type: "tunnel"; from: number; to: number }        // t range 0..1
  | { type: "bridge"; from: number; to: number }
  | { type: "dirt"; from: number; to: number; grip: number }   // grip multiplier, e.g. 0.8
  | { type: "narrow"; from: number; to: number }        // visual: concrete walls close in
  | { type: "boost"; at: number }                        // boost pad: +15 nitro
  | { type: "crest"; at: number };                       // blind crest, camera dip
export interface TrackSpec {
  id; name; subtitle; environment; accent; difficulty;
  points: [number, number][] | [number, number, number, number][]; // [x, z] or [x, z, y, width]
  width: number;                    // default width when a point has none
  smoothing?: "catmullrom" | "centripetal";   // GP tracks use centripetal
  sections?: Section[];
  length?: "short" | "gp";
}
```
### 5.2 Geometry rules (enforced by a unit test over all tracks)
- Minimum centreline radius ≥ `max(14, 1.6 × halfWidth)` metres (measured with a 3-point circumradius over ±8 m).
- Minimum distance between non-adjacent parts (more than 120 m apart along the track) ≥ `3 × maxWidth`.
- Grade ≤ 7 %. Elevation change ≤ 30 m per lap.

### 5.3 Scale the 9 existing circuits
Multiply every `[x, z]` of the 9 existing tracks by **2.4** (widths unchanged). This makes them 1.9–2.3 km and fixes the folded inner walls (their tightest radius goes 6.5 → 15.6 m). Re-check with the 5.2 test.

### 5.4 Three new Grand Prix tracks (data is final — already validated)
Validation run: neon_gp 2 866 m, min radius 27.8 m, min separation 99 m, max grade 4.7 %; coast_gp 2 937 m / 33.3 m / 108 m / 5.6 %; canyon_gp 3 305 m / 23.9 m / 99 m / 3.5 %. Use `smoothing: "centripetal"`, closed curve. Point format `[x, z, y, width]`.

```ts
{ id: "neon_gp", name: "Metropolis Grand Prix", subtitle: "THE WHOLE CITY IS THE TRACK", environment: "neon",
  accent: "#7fe3ff", width: 16, difficulty: "GRAND PRIX", smoothing: "centripetal", length: "gp",
  points: [[0,0,0,18],[0,180,0,18],[0,330,0,18],[30,400,0,16],[110,420,0,16],[260,420,0,16],[330,400,0,14],
    [360,340,0,12],[400,300,0,12],[460,320,0,12],[500,380,0,14],[580,420,2,16],[720,420,8,16],
    [860,380,12,16],[940,260,12,16],[940,100,12,16],[880,-20,10,16],[760,-80,6,16],[620,-80,2,16],
    [520,-60,0,14],[440,-120,-4,14],[360,-200,-6,14],[260,-220,-4,14],[160,-200,0,14],
    [90,-150,0,14],[60,-80,0,16],[20,-40,0,18]],
  // Boulevard start (18 m wide) → downtown 90° corners → NARROW alley chicane (points 6-10, 12 m)
  // → ramp up onto an ELEVATED EXPRESSWAY (points 11-18, y up to 12 m, BRIDGE) with long sweepers
  // → drop into an UNDERPASS TUNNEL (points 19-23, y down to -6) → harbour hairpin back to the boulevard.
  sections: [ {type:"narrow",from:0.22,to:0.33}, {type:"bridge",from:0.40,to:0.66}, {type:"tunnel",from:0.70,to:0.82},
              {type:"boost",at:0.12}, {type:"boost",at:0.55}, {type:"crest",at:0.38} ] },

{ id: "coast_gp", name: "Cliffside Coast Grand Prix", subtitle: "SALT, SUN AND A LONG WAY DOWN", environment: "coast",
  accent: "#ffb47a", width: 15, difficulty: "GRAND PRIX", smoothing: "centripetal", length: "gp",
  points: [[0,0,4,16],[0,220,4,16],[30,360,6,16],[120,450,10,15],[260,480,16,15],[380,440,22,14],
    [430,360,26,13],[400,280,24,13],[440,210,20,13],[520,200,16,14],[620,240,12,14],[720,300,8,15],
    [820,300,4,16],[900,220,2,16],[920,80,2,16],[860,-60,2,16],[760,-140,3,15],[620,-160,4,15],
    [500,-120,6,14],[400,-170,6,14],[300,-240,5,14],[180,-240,4,15],[80,-190,4,16],[20,-110,4,16]],
  // Seafront straight → CLIMB along the cliff edge to the lighthouse summit (points 3-7, y 26 m, sea on the outside,
  // low stone wall, crest) → SERPENTINE descent (points 7-11) → beach-level straight with the sea right beside you
  // → TUNNEL through the headland (points 15-17) → harbour BRIDGE over the marina (points 19-21) → back to the front.
  sections: [ {type:"crest",at:0.27}, {type:"tunnel",from:0.60,to:0.68}, {type:"bridge",from:0.76,to:0.86},
              {type:"boost",at:0.48} ] },

{ id: "canyon_gp", name: "Red Mesa Grand Prix", subtitle: "THE DESERT TAKES NO PRISONERS", environment: "canyon",
  accent: "#ff9a5c", width: 16, difficulty: "GRAND PRIX", smoothing: "centripetal", length: "gp",
  points: [[0,0,0,16],[0,240,0,16],[0,420,2,16],[60,540,6,15],[180,600,10,15],[320,600,12,14],
    [420,540,14,14],[440,440,16,13],[380,370,18,13],[420,300,20,13],[520,300,22,13],[600,360,22,14],
    [700,400,20,15],[820,380,16,16],[900,280,12,16],[920,120,8,16],[900,-40,6,16],[820,-160,4,15],
    [680,-220,2,15],[540,-200,2,14],[440,-260,2,14],[320,-300,1,15],[180,-280,0,16],[70,-200,0,16],[20,-100,0,16]],
  // Salt-flat drag straight → long climb → SWITCHBACKS up the mesa (points 6-10, 13 m wide) → plateau run
  // → DIRT shortcut-like fast section along the rim (points 12-16, grip 0.82, dust) → slot canyon NARROW (points 19-21)
  // → back onto the flats.
  sections: [ {type:"dirt",from:0.50,to:0.66,grip:0.82}, {type:"narrow",from:0.78,to:0.88},
              {type:"crest",at:0.44}, {type:"boost",at:0.08}, {type:"boost",at:0.70} ] },
```
Section `t` values are approximate; after building, print each section's start/end world position in dev and nudge `t` so they line up with the described points.

### 5.5 TrackBuilder changes (`src/game/TrackBuilder.ts`)
- **Samples:** `TRACK_SAMPLES` becomes per-track: `Math.ceil(length / 1.5)` (≈ 2 000 for GP). Replace the global constant everywhere (`nearest`, `at`, curbs, AI, minimap, `progressOf`). Keep checkpoints at **12 sectors** (`TRACK_SECTORS = 12` constant).
- **3D centreline:** points carry `y`; tables store y; `at()` returns y; `nearest(p, hint)` uses 3D distance (`dx² + dz² + 4·dy²`) so stacked sections can never be confused.
- **Variable width:** `halfWidthAt(t)` interpolated from point widths (smoothstep between points). Use it for road, curbs, walls, clearance and AI lane limits.
- **Banking:** bank angle = `clamp(curvature × 40, −6°, +6°)` toward the inside, smoothed over ±30 m; rotate the road cross-section around the tangent. Skip banking in tunnels.
- **Road mesh:** cross-section with 6 vertices (shoulder, edge line, lane, lane, edge line, shoulder) so you can UV the markings properly; add 0.6 m vertical side skirts downward so elevated road looks solid. Collider = the road trimesh (with `FIX_INTERNAL_EDGES`).
- **Terrain:** replace the flat 2 200 m plane with a heightfield (`RAPIER.ColliderDesc.heightfield`, 256×256 over 2 400 m) generated from layered value noise per environment (city: almost flat ±1 m; coast: hills inland, drops to sea level (y = 0, sea plane) on the sea side; canyon: mesas are separate meshes, terrain gentle dunes). Near the road blend terrain to `roadY − 0.25` within 4–14 m from the road edge (embankments). Inside `bridge` and `tunnel` sections do **not** blend: bridges stand on pillars over lower terrain, tunnels go under raised terrain.
- **Bridges:** deck slab (1 m thick), pillars every 30 m down to terrain, concrete parapet walls (the wall ribbon) and a lamp every 25 m.
- **Tunnels:** extruded arch (inner radius halfWidth + 2) with darker concrete, emissive light strips every 12 m on both sides, entrance portals with the environment's style. Tunnel interior: sky hidden, ambient lowered by the renderer while the camera is inside (`RaceManager` exposes `inTunnel(t)`), engine sound gets the existing reverb send — leave audio code alone, just pass nothing new.
- **Dirt:** different road material (packed sand), no lane markings, grip multiplier from the section (wire into `RaceManager` `gripAt(t)`), dust particles always on at speed (already in `Effects`).
- **Narrow:** concrete walls 0.5 m closer, graffiti/neon strips on city walls.
- **Boost pads:** glowing chevrons on the road (emissive decal, animated scroll). Driving over → `+15` nitro (respecting `nitroMax`) + `sfx("nitro")`.
- **Crests:** no gameplay change; road shape already rises/falls. Mark with chevron signs.
- **Everything with a hard-coded ground height** must use track/terrain height: grep for `0.7` spawn heights (`RaceManager.ts` lines ~230 and ~310, `VehicleController.reset` uses `y: 0.7`), `position.y < -3` fall check (use `< trackY − 6`), airtime `position.y > 0.8` (use "no wheel contact for 0.15 s"), skid marks `y = 0.062` (use contact height), camera floor `0.35` (use `terrainY + 0.35`), tokens `y = 1.1`, speed traps, ramps.
- **AI:** target speed also slows 10 % per 4 % downhill grade on corner entry; lanes clamp to `halfWidthAt(t) − 2`.
- **Minimap & menu map art:** draw from the actual samples; colour bridges lighter and tunnels dashed.

### 5.6 Variety beyond the layout
- **Traffic in Free Roam only** (`FEATURES.traffic = true`): 12 kinematic civilian cars per GP map driving the racing line at 60–80 km/h in lanes, both directions on wide sections. They are obstacles (near-miss bonus already exists). Not in races.
- **Free Roam on GP maps:** walls open at 6 exits per map onto the terrain; 30 tokens; 5 speed traps; 4 jump ramps placed with `isClear`.
- **New mode "Sprint"** (point to point is not possible on loops → implement as "one long lap with 3 sectors and a target time" = Time Trial variant with medal times bronze/silver/gold shown before start). Optional, do last.

### 5.7 Data hookups
- Career: tier 2 uses `neon_gp`, tier 3 `coast_gp`, tier 4 `canyon_gp`, laps reduced to 2 for GP tracks.
- Daily challenge picks from all tracks; for GP tracks laps = 1–2.
- Quick race default track: `neon_gp`, 2 laps.

### 5.8 Track select must communicate size
Track cards show: length (km), elevation range (m), corners, surface tags (TUNNEL / BRIDGE / DIRT), best lap, and a 3-medal row (see 7.6).

### 5.9 Save migration
Lap times on scaled tracks are not comparable. Add `trackVersion: 2` to `SaveData`. In `migrateSave`, if `trackVersion !== 2`: keep everything else, but drop `records` (best laps, ghosts, splits). Show a one-time toast: "Tracks were rebuilt bigger — your old lap records were archived." Keep the old records under `records_v1` (not used, not shown).

**Tests:** 5.2 geometry test over all tracks; `nearest()` on a stacked sample (if any) returns the correct deck; full-lap AI run on each GP track in headless physics finishes in < 4 simulated minutes without a reset.

---

## 6. Graphics — from "boxes" to believable

The look we want: **cinematic night-time street racing** — think a modern AAA racer's photo mode at 1/3 the cost. Wet-looking asphalt with reflections of lights, cars with smooth curved bodies and proper glass, real-looking wheels, a city with depth and detail at street level, golden-hour coast, harsh desert light.

### 6.1 Rendering setup (`src/render/Renderer.ts`)
- Environment lighting: load an **HDRI per environment** (Poly Haven, CC0, 1K `.hdr`, ≤ 2 MB each — pick a night city / urban street for neon, a sunset sky for coast, a clear desert/midday for canyon) via `RGBELoader` → `PMREMGenerator.fromEquirectangular`. Use it as `scene.environment` only (background stays our sky shader). Fallback: current `RoomEnvironment`.
- Shadows: sun shadow camera follows the player (exists); increase to ±60 m frustum at High/Ultra with 2048/4096 maps, `PCFSoftShadowMap`, tune `normalBias`. Low = no shadows, Medium = 1024 ±40 m.
- Post: keep N8AO, bloom, SMAA, ACES. Add a per-environment **colour grade** (a small `Effect` with lift/gamma/gain + saturation + vignette): neon = cool shadows, magenta-cyan highlights; coast = warm orange highlights, teal shadows; canyon = warm, contrasty. Add subtle film grain (0.03) at High+.
- Speed feel: radial motion blur effect active only while boosting or above 220 km/h (strength scales 0 → 0.35), High+ only.

### 6.2 Cars (`src/game/CarFactory.ts`)
Plan A (preferred, no licensing risk, consistent with "original cars"): **rebuild the procedural body as a lofted mesh.**
- Body = loft of 24 cross-sections along the length (front bumper → rear bumper). Each cross-section is a superellipse (exponent 2.5–4, rounder at the roof, squarer at the sills) with width from a plan-view curve and height/bottom from a side-profile curve. Cabin (greenhouse) = second loft on top, inset 12 % with tumblehome (sides lean in 8°). Generate normals smoothly (`computeVertexNormals` after merging duplicated seam vertices).
- Per-car parameters in `src/data/cars.ts` (`shape: { noseLength, cabinStart, cabinEnd, roofHeight, beltLine, rearDeck, hipWidth, fenderFlare, frontOverhang, rearOverhang, spoilerLip }`) so the 8 cars look clearly different: hatch (Kestrel), coupé (Vanta), muscle (Brutus, long hood, short deck), rally (Ronin, high, flared arches), EV saloon (Solace, smooth, flush), buggy (Dune Rat, open cage — keep tube frame), V12 exotic (Aurora, cab-forward, low), hypercar (Phantom, teardrop canopy + fin).
- Wheel arches: subtract by shaping the sill curve upward around wheels (lofted sections dip) + a dark inner arch liner mesh.
- Glass: separate loft for windows, `MeshPhysicalMaterial` with `transmission: 0` (cheap), dark tint, `envMapIntensity 2`, clearcoat 1.
- Panel lines: a tiny generated normal map (canvas) with door/hood seams, applied to body with UVs from the loft (u = around, v = along).
- Lights: headlight and taillight **strips** that follow the body curve (thin emissive ribbons from the loft), inner projector discs. Brake = brighter tail ribbon (exists via `setLights`).
- Wheels: tyre = `LatheGeometry` with a sidewall profile + tread normal map; rim = lathe barrel + spoke meshes per design (6 designs exist), brake disc with drilled-hole texture and caliper. Instanced across the 4 wheels.
- Details: side mirrors (lofted), door handles, exhaust tips with dark inner, rear diffuser fins, front splitter, licence plates reading `VELOX` + 3 digits.
- Paint: keep `MeshPhysicalMaterial` with clearcoat; add `metalness`/`roughness` per finish (exists) and **flake** normal noise for metallic/pearl (tiny tiled normal map).
- Triangle budget: ≤ 25 k per car (LOD0), LOD1 ≤ 6 k (sections reduced to 10, wheels 12-sided) beyond 60 m, LOD2 = flat-shaded box impostor beyond 180 m. Use `THREE.LOD`.
- Keep node names and sockets used elsewhere (`Wheel_FL` …, `Socket_Exhaust_*`, beams, flames, underglow, `apply()`, `setLights()`, `setHeadlights()`).

Plan B (only if Plan A is visibly worse after a full attempt): CC0 low-poly car models from Kenney/Quaternius re-materialised with our paint/glass materials. Do not ship branded models.

### 6.3 City (neon)
- Buildings: replace unit boxes with a **building generator**: footprint 12–40 m, 1–3 stacked tiers with setbacks, roof props (AC units, water tanks, antennas with red beacons), ground-floor shopfront band (4 m) with emissive signs.
- Façade shader (`onBeforeCompile` on `MeshStandardMaterial`): window grid computed from world-space UV in metres (window 1.6 × 2.2 m, floor 3.4 m), mullions, per-window hash for lit/unlit + warm/cool tint at night, glass reflections via envMap, slight emissive flicker for 2 % of windows. One material per palette, instanced per archetype.
- Street level: sidewalks (0.15 m curb, 4 m wide) along the track outside the walls, street lamps with arms (instanced), traffic lights at intersections, bus stops, parked cars (LOD2 impostors), trees in planters, overhead cables near downtown, steam vents (particles) in the narrow alley.
- Signage: billboards with generated text art (keep VELOX slogans) and animated scrolling LED panels.

### 6.4 Track furniture (all environments)
- **Barriers** by environment: city = concrete jersey barrier (extruded profile along the wall line) with reflective strip; coast = low stone wall on cliff side + steel W-beam guardrail elsewhere; canyon = W-beam guardrail with wooden posts; tunnels/bridges = concrete parapet. Build as extrusions along the wall polyline (merged per run), not boxes.
- Road: Poly Haven/ambientCG CC0 **asphalt** (albedo/normal/roughness, 1K, tiled every 4 m) blended with a generated grime map; lane markings painted via a second UV channel, slightly worn; curbs extruded with a sloped profile. Rain: roughness × 0.35 plus puddle mask (noise) at roughness 0.05.
- Start/finish: real gantry with lights board and the start lights mirrored in 3D (5 red lamps that light with the HUD countdown).

### 6.5 Coast and canyon
- Coast: sea shader (two scrolling normal maps, Fresnel, foam where terrain depth < 1 m), cliffs from terrain with rock material (triplanar), lighthouse model (lathe + emissive rotating beam at dusk), palm trees with alpha-tested frond cards (generated canvas texture), beach sand material, marina with boats (simple hulls) under the bridge.
- Canyon: mesas with layered strata texture (triplanar, horizontal bands), boulder clusters, dry bushes (instanced cards), Joshua-tree-like cacti, heat haze (subtle screen distortion near the ground on High+), dust devils (particle columns) far away.

### 6.6 Performance tools
- Static scenery merged per material per 200 m chunk; frustum culling per chunk.
- `THREE.LOD` for cars and big props; instancing for everything repeated.
- Quality presets toggle: shadows, AO, motion blur, grain, grass/foliage density (Low 0.3, Medium 0.6, High 1, Ultra 1.3), LOD distances.
- Keep the Auto quality benchmark (Renderer) working.

---

## 7. UI/UX overhaul (menus and in-game)

### 7.1 Problems to remove (owner feedback)
- Text far too small (current CSS uses 6–9 px labels) and **white text over white light** in the showroom is unreadable.
- Everything is the same bordered rectangle: looks like "AI slop".
- Important info small, unimportant info big (e.g. huge "01" scene index and wordmark, tiny credits/level/descriptions).
- Navigation feels stiff.

### 7.2 Design direction — "Broadcast Night"
Motorsport TV-broadcast graphics meets late-night street culture. Confident, kinetic, legible.
- **Shapes:** parallelogram/skewed elements (`transform: skewX(-12deg)` on the container, `skewX(12deg)` on the content), chevrons, angled corner cuts (`clip-path: polygon(...)`), thick left accent bars. Cards only where content is genuinely a card (cars, tracks); lists are lists, not boxes.
- **Image-led:** track cards use a big rendered preview (see 7.6), mode cards use full-bleed illustrations (generated CSS gradients + the mode's big glyph + a short looping CSS animation), the car is always the hero in the showroom.
- **Motion:** 160–240 ms `cubic-bezier(.2,.8,.2,1)`; focus/hover = slide 6 px right + accent bar grows + subtle glow; screen transitions = content slides in from the right by 24 px with fade, back navigation slides from the left. Respect `prefers-reduced-motion` (fade only).
- **One accent** + two semantic colours (never more on one screen).

### 7.3 Design tokens (new `src/ui/styles/tokens.css`)
```css
:root {
  --bg-0: #07090d;  --bg-1: #0d1118;  --bg-2: #141a24;  --bg-3: #1c2431;      /* surfaces */
  --line: rgba(255,255,255,.10); --line-strong: rgba(255,255,255,.22);
  --text-1: #f5f7fa;  /* primary */   --text-2: #b9c2cf; /* secondary */   --text-3: #7f8a99; /* tertiary, never for essential info */
  --accent: #c6ff3d;  --accent-ink: #0b1200;   /* electric lime – primary action, focus, player */
  --hot: #ff3d7f;      /* online / live / position lost */
  --gold: #ffc94a;     /* rewards, records, achievements */
  --cool: #4fd8ff;     /* info, friends */
  --danger: #ff5a4a;
  --scrim: linear-gradient(90deg, rgba(7,9,13,.94) 0%, rgba(7,9,13,.82) 38%, rgba(7,9,13,0) 62%);
  --radius: 4px;  --cut: 14px;   /* corner cut size */
  --font-display: "Barlow Condensed", "Arial Narrow", sans-serif;
  --font-ui: "Inter", system-ui, sans-serif;
  --font-num: "Barlow Condensed", "Inter", sans-serif; /* with font-variant-numeric: tabular-nums */
}
```
Fonts: add `@fontsource/barlow-condensed` (weights 500, 600, 700, 800 + italic 700) and `@fontsource-variable/inter` via npm and import in `main.ts`. Bundled locally (works offline).

### 7.4 Type scale (hard minimums — enforce with a CSS lint test, see 7.10)
| Role | Size (desktop, clamp for small screens) | Font |
|---|---|---|
| Hero title (home only) | `clamp(56px, 7vw, 112px)` italic 800, uppercase | display |
| Screen title | `clamp(36px, 4vw, 56px)` 800 uppercase | display |
| Section heading | 22–26 px 700 | display |
| Primary value (credits, speed, position, time) | 28–96 px depending on place, tabular | num |
| Body / descriptions | **16 px** (15 px mobile), line-height 1.45 | ui |
| Labels / captions | **13 px** min, 600, letter-spacing .06em, uppercase | ui |
| Key hints | 13 px with 22 px keycaps | ui |
**Nothing below 12 px anywhere.** Remove every `font-size` < 12 px from the codebase.

### 7.5 Legibility over the 3D scene (the white-light problem)
1. Every menu screen except the garage gets `--scrim` behind the left content column; the 3D showroom sits on the right 55 %.
2. Showroom lighting (`Renderer.buildStage()`): move the bright torus rings and vertical light bars **behind and to the right of the car only** (x > 0), reduce their emissive to ~60 %, and never let them be behind text. The "AFTER HOURS MOTOR CLUB" wall text goes on the far right wall.
3. All text drawn over 3D (HUD, nameplates, toasts) gets `text-shadow: 0 1px 2px rgba(0,0,0,.8), 0 0 12px rgba(0,0,0,.45)` **or** sits on a solid/blurred plate (`background: rgba(7,9,13,.72); backdrop-filter: blur(10px)`).
4. Contrast check: essential text ≥ 4.5:1 against its actual background; test by screenshot at the brightest moment (showroom ring behind content, neon billboard behind HUD).

### 7.6 Screen-by-screen spec
**Global shell**
- Top bar (64 px): wordmark small (left, 22 px), breadcrumb (`PLAY › QUICK RACE › TRACK`) 14 px, right side = credits (**24 px**, gold "CR"), level ring (40 px circle with XP progress stroke, level number 18 px inside), driver name 16 px + avatar. Online badge (pulsing hot dot "ONLINE · 3") when a lobby is open.
- Bottom command bar (56 px): contextual key hints on the right (`[↵] SELECT  [ESC] BACK  [Q][E] TABS`) at 13 px with keycap chips; now-playing song on the left (14 px, ♪ icon, marquee if long); mute button.
- Gamepad/keyboard: every screen is fully navigable with arrows/D-pad + Enter/A + Esc/B; Q/E or LB/RB switch tabs; focus is always visible (accent bar + glow). The first focusable item is focused on screen enter.

**Title** — full-screen showroom, car slowly turning on a turntable, logo centred big, "PRESS ANY KEY" pulsing 18 px, version tag bottom-right.

**Home (main menu)** — left column vertical menu, **big items** (display 40–48 px, italic, uppercase): `RACE`, `CAREER`, `ONLINE`, `GARAGE`, `DRIVER`, `SETTINGS`. Under the focused item, a one-line description (16 px) slides open. Focusing an item changes the showroom camera (RACE: low 3/4 front, CAREER: side profile, ONLINE: slow orbit, GARAGE: rear 3/4, DRIVER: close on badge, SETTINGS: top) — implement camera presets in `Renderer.setStage(preset)` with a 0.8 s eased tween. Right bottom: "YOUR RIDE" plate (car name 28 px, class badge, PI) and a **Daily Challenge ticket** (gold accent, track + mode + reward, 1-click start). Remove the four bottom cards and the giant "01".

**Race setup (replaces Modes + Tracks pages: one flow)** — top: horizontal **mode strip** (7 skewed tabs with glyph + name 18 px; Q/E to switch). Middle: **track carousel** — large cards (420×260) with: rendered map art over an environment gradient, track name 32 px, length/elevation/corners chips, surface tags, best lap + medals; ←/→ to browse, centred card is 1.0 scale, neighbours 0.86 and dimmed. Right panel: **conditions** as segmented controls (not `<select>`): laps (−/+ stepper), rivals (0–5 pips), difficulty (4 segments), direction (2), weather (4 icon buttons). Bottom-right: big **START** button (skewed, accent, 64 px tall, shows key hint). Remember the last setup in the save (`settings.lastRace`).

**Career** — chapter selector as a horizontal "season" line with 4 nodes (locked nodes show stars needed). Events as a vertical list of rows (not boxes): index, event name 22 px, mode + track 14 px, stars (24 px gold), reward 18 px, PI requirement chip (red if your car is above the cap, with a "Pick another car" link that opens the garage filtered by class).

**Garage** — left icon rail for tabs (Cars, Dealer, Performance, Customise) with labels 14 px; tab changes move the camera (customise wheels → wheel close-up, paint → 3/4, performance → engine bay/front). Bottom: car carousel strip with thumbnails (render each car once to an offscreen canvas at load, cache as data URL). Right: stats with **big numbers** (top speed 40 px, 0-100 40 px, weight), bars with upgrade preview (exists), PI/class badge large. Upgrades: rows with 5 segmented pips, cost, and a clear BUY button; disabled state explains why ("Need 2,300 more CR"). Paint: swatch grid 40 px swatches + colour picker; finish as segmented control.

**Online** — keep the existing flow and texts, restyle: three big option tiles on entry (HOST / JOIN WITH CODE / SAME COMPUTER) with icons and 16 px explanations; the code boxes 14 px monospace, copy buttons with "Copied ✓" state; lobby = left driver list (name 18 px, car 14 px, ready pill), centre race settings (same segmented controls as Race setup, read-only for guests), right invite panel + chat. Start button only for host, shows "Waiting for 2 drivers" when not ready.

**Driver (profile)** — header with avatar initial in a big hexagon, name 40 px, level ring; stats as a 4×3 grid of **numbers first** (value 32 px, label 13 px); achievements as rows with icon, name 18 px, description 15 px, progress bar, reward.

**Settings (menu and pause)** — left tab rail: `GAMEPLAY`, `CONTROLS`, `GRAPHICS`, `AUDIO`, `ONLINE`. Each setting is a row: label 16 px + description 14 px (`--text-2`) on the left, control on the right (toggles 52×28, sliders with value label, segmented controls). Key bindings as a table with large keycaps and a "Press a key…" modal. Add: FOV slider (55–80), HUD scale (80–130 %), steering deadzone (gamepad), units, camera shake, nameplates, colour-blind-safe position colours toggle.

**Pause** — blurred, darkened game behind (CSS backdrop + Renderer reduces exposure 30 %), centred vertical menu with big items (32 px): RESUME, RESTART, PHOTO MODE, SETTINGS, QUIT. Left: live mini standings + lap/time; right: current track map with your position. Online: the race keeps running — show a red "LIVE — race continues" banner.

**Loading** — track name 48 px, environment art, map drawing itself (SVG stroke animation), rotating tips (16 px), real progress.

**Results** — sequence: 1) big position reveal (P1 160 px, gold for 1–3) with confetti particles for P1 (CSS/canvas), 2) after 1.5 s the panels slide in: finishing order table (name 18 px, gap 18 px tabular), your laps with best highlighted, rewards counting up (credits 40 px gold), XP bar filling, stars popping, unlocked achievements as toasts. Buttons: RACE AGAIN / REPLAY / CONTINUE (primary).

**Toasts** — top-centre, 16 px, icon + text, max 2 stacked, colour by type (gold achievement, cool info, hot online, danger error).

### 7.7 HUD redesign (in-race)
- **Position** top-left: `P3` in 72 px display italic + `/6` 28 px; position change animates (green up / hot down arrow).
- **Lap & time** top-centre: `LAP 2/3` 20 px; current lap 34 px tabular; best 16 px; sector delta pill (green/red) 20 px appearing for 3 s.
- **Standings** under position: up to 6 rows, 15 px names, gaps 14 px tabular, player row highlighted with accent bar; collapses to top-3 + you on small screens.
- **Speed cluster** bottom-right: speed 96 px tabular, units 14 px, gear in a 56 px circle (20 px digit) with shift-light ring (5 LEDs green→red near limiter), RPM arc around, nitro bar segmented (10 segments) with the 3 states from section 2, label 14 px.
- **Minimap** bottom-left 260 px, **rotating heading-up**, player arrow, rivals coloured dots, friends with name initials, bridges light/tunnels dashed.
- **Center notifications**: countdown 200 px with scale-pop per number, "GO" in accent; popups (drift, near miss, airtime) 28 px with icon, stacked max 2, slide up and fade.
- **Wrong way**: full-width red band 28 px.
- Controls hint row: only for the first 20 s of the player's first 3 races, 14 px.
- **HUD scale** setting multiplies everything (CSS variable `--hud-scale`).
- Mobile: bigger touch targets (≥ 64 px), steering as a **drag pad** on the left half (horizontal drag = analog steer, returns to centre on release) plus the existing buttons on the right; option to switch back to arrow buttons in settings.

### 7.8 Implementation structure
- Split CSS: `tokens.css`, `base.css` (reset, typography, buttons, focus), `menu.css`, `garage.css`, `hud.css`, `overlays.css` (pause/settings/toasts/modals). Delete `main.css` and `extras.css` once everything is migrated; keep no dead selectors.
- New `src/ui/components.ts` with small helpers returning HTML strings: `button(label, action, {variant, icon, hint})`, `segmented(id, options, value)`, `stepper(id, value, min, max)`, `toggle(id, checked)`, `slider(...)`, `keycap(key)`, `statNumber(value, label)`, `trackCard(track)`, `carThumb(car)`. `Screens.ts` uses only these.
- Segmented/stepper/toggle controls dispatch the same `change` semantics `Game.change()` already understands (keep element ids like `laps`, `weather`, `difficulty`, `rivals`, `direction`, `net-track` …) so game logic changes stay minimal.
- Focus management: `Game.screen()` already keeps `data-keep` values and focus; add `data-autofocus` on the element to focus after a screen change, and arrow-key spatial navigation (nearest focusable element in the pressed direction using `getBoundingClientRect`) instead of DOM order.
- Escape all user/peer text with `esc()` (exists) — do not regress.

### 7.9 Copy
Short, confident, no lorem. Labels in uppercase only when ≤ 3 words. Descriptions in sentence case. Keep existing names (modes, tracks, cars, chapters).

### 7.10 UI acceptance tests
- `tests/ui-css.test.ts`: parse all CSS files and fail on any `font-size` below 12 px (px, or rem < 0.75) and on any `color` that is pure white used without a text-shadow/plate inside `.race-hud` (simple heuristic: every `.race-hud` text selector must also set `text-shadow` or be inside a `.plate`).
- Browser QA (script in `tools/scripts/qa-ui.mjs`, Playwright with installed Chrome like the other qa scripts): visit every screen at 1920×1080, 1366×768, 390×844; assert no horizontal overflow, no element with computed font-size < 12 px, every `[data-action]` reachable via keyboard; save screenshots.

---

## 8. Smaller polish that comes with the above
- `Game.updateHUD()` must use `vehicle.nitroMax` and the new nitro state.
- Start lights in 3D on the gantry mirror the HUD.
- Camera: chase camera FOV setting (7.6) and a slight downhill/uphill pitch follow (look target follows road slope).
- Replay director: add a bridge/tunnel-aware shot list (use trackside cameras near sections).
- Update `README.md`, `CHANGELOG.md` (new 0.3.0 entry), `PROGRESS.md`, `CREDITS.md`.

---

## 9. Work order and definition of done

| # | Task | Done when |
|---|---|---|
| 1 | Steering convention fix (§1) | tests green, D turns right in game, AI finishes `neon_a` |
| 2 | Nitro lockout (§2) | test green, HUD shows RECHARGING, no endless boost |
| 3 | Walls: trimesh ribbon, round chassis, glide assist (§3) | `walls.test.ts` green; manual: grazing a wall at 150 km/h keeps ≥ 130 km/h |
| 4 | Clearance system + grandstand placement (§4) | `clearance.test.ts` green on all 9 old tracks |
| 5 | Track spec v2, scaling ×2.4, variable width, 3D nearest (§5.1–5.3, 5.5 first half) | old tracks bigger, all tests green |
| 6 | Elevation, terrain, bridges, tunnels, dirt, boost pads (§5.5) + 3 GP tracks (§5.4) + save migration (§5.9) | AI lap test on GP tracks, clearance + geometry tests green, screenshots of each section |
| 7 | UI tokens, fonts, components, shell, home, race setup (§7.2–7.6 first part) | screenshots at 3 sizes, ui-css test green |
| 8 | Remaining screens: career, garage, online, driver, settings, pause, loading, results, toasts (§7.6) | full keyboard/gamepad navigation works, qa-ui green |
| 9 | HUD redesign + mobile drag steering (§7.7) | readable over the brightest neon scene, mobile screenshot |
| 10 | Graphics: renderer (§6.1), cars (§6.2) | 8 cars visibly distinct, ≤ 25 k tris each, LOD works |
| 11 | Graphics: environments + furniture (§6.3–6.5) | performance budget (§0.6) met on Medium |
| 12 | Traffic in free roam, polish (§5.6, §8), docs | all checks green, CHANGELOG written |

**Final checklist (all must be true):**
- [ ] `npx tsc --noEmit`, `npm test`, `npm run build` all pass.
- [ ] D/→/stick-right turns right; drift still holds ~20° (`npm run handling`).
- [ ] Nitro cannot be used when empty; unlocks at 25 % after releasing the button.
- [ ] Grazing a wall slides along it; only real head-on hits stop the car.
- [ ] No prop, stand, sign or wall intrudes on the road on any track (test).
- [ ] 3 Grand Prix tracks ≥ 2.8 km with elevation, a bridge, a tunnel and at least one surface/width change each; the 9 old tracks are 2.4× larger.
- [ ] No text below 12 px; essential text readable over the brightest scene; menus feel like a broadcast package, not a grid of boxes.
- [ ] Pause, settings, results, loading and HUD follow the same design system.
- [ ] Multiplayer host/join via code and same-computer room still works end to end (two tabs).
- [ ] 60 FPS on Medium within the budget; F3 overlay numbers recorded in `PROGRESS.md`.
- [ ] Assets CC0 and listed in `CREDITS.md`; audio files/code untouched.
