# VELOX changelog

## 0.8.1 — Tunnel and garage polish

- Tunnels: no street lamps or road light pools inside or at the portals, and the ceiling light strips sit beside the crown instead of at camera height (where they read as a bright band across the screen).
- Restart (from pause or RACE AGAIN) skips the intro fly-around: the camera starts behind your car on the grid.
- Garage: panels cast a short, light shadow so the car stays clear; Performance and Customize panels run from beside the heading down to the footer.

## 0.8.0 — Five big flat circuits

- Five circuits instead of twelve, each about 4 km: Metropolis Grand Prix, Cliffside Coast Grand Prix, Red Mesa Grand Prix, and two new drift circuits, Harbour Drift and Lighthouse Touge. Roads are completely flat (no elevation, banking or crests), so cars no longer get airborne, slide on slopes, or crawl uphill.
- Boost-pad arrows point straight down the lane and sit flush on the asphalt; lamp light pools and underglow sit on the road surface, and lamp heads hang from an arm on their post. Smoke and sparks stay within a few metres of where they appear, so nothing pokes through tunnel roofs.
- Reverse drives at up to about 45 km/h.
- Pause shows the frozen race behind a blurred panel with lap, time and position, large menu entries, the circuit map and the live order. Results have a medal-coloured position badge, compact standings, and MAIN MENU / NEXT RACE actions (NEXT RACE goes back to circuit selection).
- Title screen centres the car with the prompt lower down; the Settings menu camera stays under the studio ceiling; the main-menu shade is lighter; online invite boxes match the room-code input.

## 0.7.0 — Setup flow, scrolling and loading

- Quick race setup is two pages: choose the circuit (mode tabs, three-card carousel, NEXT), then set the conditions (circuit summary beside laps, rivals, difficulty, direction and weather, START). Both pages fit 1280×720 and larger without scrolling. Clicking a side card selects it; clicking the centre card continues. One wheel or trackpad gesture moves one circuit.
- Scrolling: one thin scrollbar style that only appears when content overflows, eased wheel scrolling with a longer step, and click-drag scrolling with momentum on every scroll area (clicks after a drag are ignored).
- Career, settings, driver file, lobby and garage pages were compacted to fit one screen at 1366×768; the driver file is split into Overview and Achievements tabs.
- Garage: the ← → arrows step through your cars; Performance and Customize use the full panel height, and the orbit camera stays inside the studio so walls and ceiling never cover the car.
- Main menu: hovering moves the single highlight; keyboard focus shows no outline ring. The footer is shorter with smaller labels.
- New loading screens: a tachometer gauge with lit ticks, a red line and moving lane markings, shared by the boot and race loading screens.

## 0.6.0 — Interface and HUD polish

- Content screens use the specified dark backdrop and freeze studio drawing;studio lighting and floor reflections follow the 0.6 values.
- Garage cameras frame the whole car in every tab,with512×256 thumbnails,owned/dealer cards,compact stats,and a timed orbit hint. Home,Career,Pause and Results fit their actions and text across desktop and phone sizes.
- HUD safe margins,separated gear/LEDs,lap progress and checkpoint distance,compact standings,three fading nameplates and a two-slot notification stack improve race readability. Control hints use an additive first-three-races counter and a Controls override.
  -44px desktop/48px touch targets,Saira display/number roles,Inter descriptive copy,native wheel scrolling,all-container scroll memory/edge fades,and styled controls provide consistent feedback. Identical showroom cars and UI map layouts are reused.
- Added item-by-item CODEX_REPORT_3.md,inspected before/after evidence,geometry/layout/input/scroll checks and a performance trace. No new external assets;audio,network protocol,handling,car and track geometry remain unchanged.

## 0.5.0 — Road and interface fixes

- Finish checks use the front bumper for players and AI. The checker strip, gantry and start lights share t=0; each grid row starts with its nose behind the line.
- Lamp pools, the checker strip and animated boost pads follow the actual triangulated asphalt across banks, crests and the start seam.
- Coastal sea excludes the road corridor; coastal roads and embankments stay above sea level. Dry asphalt remains rough, rain avoids mirror puddles, and fog uses the specified visibility distances. Warm tunnel fog, lighter precipitation and background-depth ridges keep corners visible. Large inside-apex props stay 12m outside barriers.
- The speedometer uses the real rounded SVG arc length, twelve ticks and a red zone. Shift LEDs sit below the gear.
- Garage panels occupy separate grid areas, with a framed 3D stage and reachable carousel cards. Mouse, keyboard and gamepad support preview followed by purchase/selection.
- Smaller readable type, shared spacing, smooth inner scrolling, visible focused controls and horizontal carousel wheel input work across six viewport sizes, including reduced-motion preferences.
- Added finish, road-patch, coast and clearance tests; corridor scanning, six-size UI/focus/garage QA and inspected screenshot evidence. No new external assets or changes to audio, peer protocol, save schema, car design or handling.

## 0.4.0 — "Showroom Finish"

### Cars

- New car generator (`src/game/CarFactory.ts` + per-model design sheets in `src/game/CarDesigns.ts`). Bodies are a parametric surface: shoulder crease, flared wheel arches cut into the body, rounded-rectangle fascias with a crisp lower bumper, hood/deck profiles per model.
- Separate greenhouse with tinted glass, black A/B pillars, painted or glass roof and fastback/hatch rear glass.
- Lights, grilles, intakes, diffuser, door shut lines, louvres and livery stripes are panels that follow the body surface exactly.
- Cast wheels with dished spoke windows (six designs), lug nuts, profiled tyres with tread, drilled discs and calipers, dark wheel-well liners, interiors, mirrors, exhausts, plates, contact shadows.
- Performance: dark details share one vertex-coloured material; clearcoat paint and map shadows only for the player car on High/Ultra (always in the showroom). Rivals use look-alike standard materials. Measured on the Intel UHD test host: 69 FPS, 223 draw calls on the biggest track (Medium).

### Showroom and UI

- The menu stage is now a car photo studio: dark concrete room, overhead softboxes, LED wall slats, satin turntable and a studio reflection map so paint shows real softbox highlights. The giant rings that crossed the car are gone.
- New typography: Saira (expanded italic headlines), Saira Condensed (numbers), Inter (body).
- Glass panels with gradient edges, lime→cyan accent gradients, shimmering primary buttons, numbered home menu, film grain and staggered screen-entry motion. The HUD gets glass plates, a circular minimap, gradient speed/nitro and auto-scaling to the window size.

### Tracks

- Curbs are continuous ribbons on the asphalt and only appear in real corners; previously tilted slabs floated along entire straights.
- Lamp posts, crest signs and checkpoint posts no longer float in the sky on elevated sections (they were raised twice). Lamps stand upright with the luminaire over the kerb.
- Bridge decks are one continuous section (no sawtooth edges in corners). Terrain embankments are four times wider, so raised roads sit on smooth banks instead of jagged cliffs.
- Tunnels are lit: lighter walls, continuous light strips and welded arch geometry (no sparkling seams).
- City buildings use a new facade shader: 1.7 m window bays with mullions, reflective dark glass, ~25 % lit windows in varied colour temperatures, floor slabs.
- Billboards face the road (their text read mirrored). The black overhead checkpoint beams that cut across the screen are gone; boost pads are subtler.

### Fixes

- Time Trial ghost crashed when the car had multi-material meshes.
- The HUD was designed for 1080p and covered most of the road on small windows; it now scales to the window and rescales on resize.
- Dev tools: `tools/scripts/shots.mjs` + `tools/scripts/scenes/*.mjs` capture full-resolution screenshots of scripted scenes (needs a running dev server and Chrome).

## 0.3.0 — "Broadcast Night"

### Handling and track integrity

- Steering now uses one screen-right convention for keyboard, controller and touch; AI and corner lean follow the same boundary.
- Empty nitro locks until the button is released and the tank reaches 25%; every refill respects upgraded capacity.
- Continuous wall collision ribbons, rounded chassis and contact-normal glide preserve glancing speed. Hard hits and scrapes have separate effects/penalties using the existing audio API.
- All roadside geometry uses full-footprint clearance, including grandstands, checkpoint posts, lamps, signs and ramps. Terrain tunnel cuttings prevent coarse heightfield triangles crossing the driving corridor.

### Bigger world

- Nine legacy circuits retain their layouts at exactly 2.4× scale. Per-track 1.5m sampling supports banking, smooth widths, elevation and weighted 3D nearest queries.
- Three Grand Prix circuits (2.87/2.94/3.31km) add bridges, tunnels, narrow sections, dirt grip, boost pads and crests. Career and daily content use the new circuits.
- GP Free Roam adds 12 kinematic civilian cars at 60–80km/h, six terrain exits, 30 tokens, five speed traps and four ramps. Near misses use the existing reward system.
- Track record migration archives incompatible lap times, ghosts and splits under records_v1 while preserving other progress and notifying once.

### Interface and accessibility

- Broadcast Night tokens, local Barlow Condensed/Inter fonts, angled actions, dark text plates, spatial focus and keyboard/gamepad tab navigation.
- Vertical Home menu with camera presets; unified mode/track carousel and segmented race conditions; last setup persists.
- Restyled career, garage, online, driver, settings, pause, loading, results and toasts. Garage caches rendered thumbnails and explains unavailable upgrades.
- New large racing HUD, heading-up minimap, RPM/shift LEDs and segmented three-state nitro. Mobile adds analog drag steering with an arrow-button option.
- Settings expose FOV, HUD scale, controller deadzone, units, shake, nameplates and colour-safe positions. Online pause remains live. Ping-only updates retain lobby button DOM to keep invite clicks reliable.

### Graphics and validation

- Original 24-section lofted car bodies/greenhouses, generated detail maps, instanced lathe wheels and 60/180m LOD. LOD0 stays below 8.7k triangles; LOD1 below 2.7k.
- Local CC0 HDRIs and asphalt maps; environment grading, soft shadow presets, High+ grain/speed blur/heat haze, tiered city facades, street details, profiled barriers, coast water/foam/palms/marina and canyon strata/dust.
- Scenery uses instancing and 200m chunks; replay director recognises bridges and tunnels. Intel UHD Medium trades internal resolution and AO for the measured 60FPS budget; exact measurements and limitations are in PROGRESS.md and DECISIONS.md.
- Added geometry, clearance, wall, nitro, save migration, car LOD, terrain and traffic tests, plus browser screenshots at three resolutions and two-tab multiplayer QA.

Audio source files and the sound design are unchanged. External art remains CC0; the two explicitly required font families retain their OFL licenses in CREDITS.md. Optional Sprint is not part of this release.

## 0.2.0 — "Bring the crew"

### Multiplayer (peer to peer, no server)

- **Online lobby** (Home → Race your friends, or the ONLINE tab): host a room for up to 6 drivers.
- **Invite codes**: the host creates one code per friend and sends it in any chat app; the friend pastes it and sends back a reply code. Codes are compressed WebRTC offers/answers, so no signalling or game server is involved. Public STUN is only used to discover addresses; race data goes directly between players. LAN play works without internet.
- **Same-computer rooms**: a second browser tab can join with the host's three-letter room code (BroadcastChannel, no network at all) — handy for testing and couch play.
- Host picks mode (race or free-roam cruise), track, laps, direction and weather; guests pick their own car/livery and mark ready.
- Synced grid start (everyone waits until every player has loaded), 20 Hz car state with 110 ms interpolation and short extrapolation, solid kinematic collisions with other players, live standings, finish times, lobby chat and in-race chat (T).
- All network input is validated (names, liveries, configs, snapshots); player text is HTML-escaped.

### Controls and handling

- Steering response 0.45 s → 0.18 s, return-to-centre 0.53 s → 0.15 s (removed double smoothing; keys ramp in fast and snap back faster).
- New arcade drift model: handbrake flick kicks the rear out, steer into the slide to hold the angle and tighten the arc, let go or counter-steer to straighten. Drift assist keeps it out of spins, throttle keeps momentum (drift now holds ~21° at speed instead of 2–4° or a spin).
- Power-oversteer drifts only while steering and on the throttle.
- Progressive brakes (100–0 km/h ≈ 20 m instead of 16 m).
- Manual gearbox now matters: torque curve and rev limiter (AI always automatic).
- Gamepad: rescaled dead zone, response curve, trigger dead zones, X also drifts, LB/RB shift, R3 looks back, rumble on impacts and landings.
- Reset (R) respawns where you are in the current sector instead of back at the last gate; "stuck" hint.
- `npm run handling` prints objective handling numbers for tuning.

### Audio

- Four original procedural synthwave songs (menu, neon, coast, canyon) with drums, sidechained bass, pads, delayed arpeggios and a lead that enters on the final lap; music is muffled when paused.
- Engine voices per engine type (I4, boxer, V8 burble, V12 rasp, EV whine) with waveshaping, turbo whistle, shift cuts, backfire pops.
- Tyre squeal follows slip, wind follows speed², rain ambience, spatial engines for nearby rivals and friends.
- ~25 synthesized SFX: UI hover/click/back/error, countdown and go, checkpoints, laps, personal best, finish fanfare, nitro, impacts, near misses, tokens, position changes, achievements, players joining/leaving.

### Graphics

- Camera-centred sky shader per environment (stars, sun disc, horizon glow) plus distant mountain/skyline silhouettes.
- New scenery: palm trees, rolling hills and animated sea normals (coast); stratified mesas, boulders and cacti (canyon); rooftop beacons and animated holographic billboards (city); grandstands with a bouncing crowd at every start line; red/white curbs on corners.
- Weather: rain (streaks, wet reflective road, tyre spray), new **fog** and **snow** (falling snow, snowy ground, lower grip).
- Headlight spotlight and light beams at night/bad weather; brake lights that respond to braking; reverse lights.
- New GPU particle system: drift smoke, dust off-road/canyon, sparks on impact, nitro flames, backfire flashes.
- Camera shake (impacts, boost, high speed; can be disabled), corner lean, replay director with orbit, trackside, low-chase and helicopter cuts, results orbit.

### Game content

- 3 new tracks: Skyline Spiral, Lighthouse Point, Mesa Sprint (9 total, each forward/reverse).
- Daily challenge (same for everyone each day) with a credit bonus.
- 26 achievements with progress bars and rewards; driver profile page with lifetime statistics.
- Driver name (shown online and in standings), rival count option (0–5), live standings with gaps, sector split deltas against your best, start lights, nameplates over rivals, impact flash, PB banner, full finishing order with projected times, animated reward count-up.

### Fixes and optimisation

- Track lookups use precomputed tables and a local search window instead of curve arc-length searches and full scans every step (several thousand fewer distance checks per physics step).
- 8 per-lamp point lights replaced by additive light pools (no per-pixel light cost); scenery no longer spawns on the track.
- HUD elements are cached; the minimap outline is drawn once per race instead of 20 times a second.
- Shaders are precompiled before the race starts; `preserveDrawingBuffer` removed.
- Wheels no longer wobble while steering (Euler order), steered wheels spin about the right axis.
- Screen animations only play on real screen changes (no flash on every click); typed text, focus and scroll survive re-renders.
- Race loading no longer depends on `requestAnimationFrame` (no stall in background tabs).
- Players behind the start line no longer count as nearly a full lap ahead; impact detection based on velocity change instead of speed drops (no double hit on reset).
- Finished races keep running behind the results screen so AI finishing times are real.
