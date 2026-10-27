# VELOX 0.6 — After Hours Motor Club

Browser arcade racing with original cars, TypeScript, Vite, three.js and Rapier. No backend or account is required. CODEX_BRIEF_3.md defines the 0.6 interface and HUD polish, layered on the existing racing systems and original car design.

## Run

Requires Node.js 22.12+ (tested with Node 24).

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. Create and serve a static production build with `npm run build` and `npm run preview`. Upload `dist/` to a static host; asset paths support subdirectories. WebGL 2 is required.

## Play

Press any key, choose RACE, select a mode/track/conditions, then START. Last race settings are remembered. Menus support arrows/D-pad, Enter/A, Esc/B and Q/E or LB/RB for tabs. The track carousel supports left/right browsing while focused. In the garage, arrows/LB/RB browse cards; Enter/A previews a car, then a second press buys or selects it. Wheel input browses carousels horizontally and scrolls other pages vertically. Focused controls scroll into view, with reduced-motion support.

| Input           | Action                                        |
| --------------- | --------------------------------------------- |
| W/↑, S/↓        | Accelerate; brake/reverse                     |
| A/D, ←/→        | Steer left/right on screen                    |
| Space; Shift    | Drift; nitro                                  |
| C; X; R         | Camera; rear view; reset car                  |
| Esc/P; Q/E      | Pause; manual gears when enabled              |
| T; F3; backtick | Online chat; performance overlay; live tuning |

Gamepad: RT/LT pedals, left stick steering, A/X drift, B nitro, Y camera, LB/RB gears, R3 rear view, Back reset, Start pause. Mobile uses an analog drag pad plus pedals/drift/nitro; Settings → Controls can restore arrow buttons. Settings also expose FOV, HUD scale, controller deadzone, units, shake, nameplates and colour-safe positions.

Nitro locks when empty. Release the button and recharge to at least 25% to unlock. Glancing wall contact preserves tangential speed; head-on hits still stop the car.

## Tracks and modes

Six modes: Quick Race, Time Trial with a saved ghost, Drift Attack, Checkpoint Rush, Elimination and Free Roam. Daily Challenge is the seventh setup tab. Career retains 20 events; the driver profile retains 26 achievements.

The nine original circuits keep their layouts at 2.4 times the original scale (1.9–2.3 km). Three Grand Prix circuits add elevation, variable width, bridges, tunnels and special sections:

| Circuit                    | Length  | Character                                               |
| -------------------------- | ------- | ------------------------------------------------------- |
| Metropolis Grand Prix      | 2.87 km | Boulevard, narrow alley, elevated expressway, underpass |
| Cliffside Coast Grand Prix | 2.94 km | Climb/crest, coast, headland tunnel, marina bridge      |
| Red Mesa Grand Prix        | 3.31 km | Switchbacks, dirt rim, narrow canyon, bridge and tunnel |

All circuits support reverse and clear/rain/fog/snow. Finish detection uses the front bumper at the visible checker strip for players and AI. Decals follow banks and crests; coastal water stays outside the road corridor. GP Free Roam adds 12 civilian traffic cars at 60–80 km/h, six alternating terrain exits, 30 tokens, five speed traps and four ramps. Reverse traffic bypasses narrow one-way sections. Traffic is absent from competitive races.

Progress remains in `velox_save_v1`. The trackVersion 2 migration preserves cars, credits, career, achievements, stats and settings. Incompatible old lap records/ghosts are archived under `records_v1`; an explanatory toast appears once.

## Online

Choose ONLINE → HOST A ROOM. For each friend create an invite code, send it using your own chat app, then paste their reply. The guest joins with that invite, sends back the reply, chooses a car and marks READY. The host chooses track, conditions and start. Up to six drivers can race or cruise.

WebRTC sends race data directly between players. Public STUN helps discover addresses; there is no game/signalling server or TURN relay. Some networks block direct connections. For two tabs on one computer, join the host's three-letter room code instead. Online races continue while paused or in settings. Chat and driver text are escaped and network inputs are validated.

## Graphics, assets and performance

Cars are generated from per-model design sheets (src/game/CarDesigns.ts): a parametric body surface with shoulder creases, flared arches and rounded-rectangle fascias, a separate greenhouse with glass/pillars/roof, surface-hugging lights and grilles, cast wheels with dished spoke windows, brake discs and calipers, an interior and contact shadows, with 28/130 m LOD. Local CC0 HDRIs and asphalt textures work offline; generated geometry, facade/water/rock shaders and foliage supply the environments. Fonts are bundled locally. Exact assets, authors and licenses are in CREDITS.md; the Saira, Saira Condensed and Inter fonts use OFL 1.1. Added external art is 7.21 MB.

The measured Intel UHD Medium preset uses 1024 soft shadows, bloom, SMAA and grading, with AO disabled and internal render width capped at 1056 px. The 0.5 run at a 1920×1080 viewport with six cars on canyon_gp achieved 67.70 FPS, at most 214 draw calls and 366,403 triangles (internal 1056×594). The HTML HUD remains native resolution. This is not a native-1080p 60 FPS claim. Other GPUs retain normal Medium resolution; High/Ultra retain N8AO, grain, radial speed blur and canyon heat haze limited to the bottom 15%. See DECISIONS.md and PROGRESS.md for measurement details. Audio source files and design are unchanged.

## Verify

```powershell
npx tsc --noEmit
npm test
npm run build
npm run handling
```

Browser QA uses installed Google Chrome and a separate dev server:

```powershell
npm run dev -- --port 5174 --strictPort
$env:VELOX_URL='http://127.0.0.1:5174'
npm run test:browser
node tools/scripts/qa-corridor.mjs
node tools/scripts/qa-garage.mjs
node tools/scripts/qa-scroll.mjs
```

Set `VELOX_URL` to use a different URL. UI/focus/garage checks cover 1920×1080, 1920×960, 1536×864, 1366×768, 1280×720 and 390×844. Other suites cover actual physics/rewards/ghost saves, traffic/near misses, both multiplayer transports, LOD, quality changes and measured performance. The corridor scan checks all 12 tracks in both directions; intentional overhead fixtures require at least 3m headroom (see DECISIONS.md). Screenshots and JSON reports are saved to `test-results/`; inspection contact sheets and source manifests accompany the 0.5 evidence. Close other running copies of the game before measuring FPS. The dev-only `window.__velox` diagnostic handle is absent from production.

## Source layout

`src/data` defines content and economy; `src/physics` handles vehicles and wall contacts; `src/game` builds tracks, scenery, traffic and race rules. `src/core` handles lifecycle/input/saves, `src/net` handles peer sessions, `src/render` handles cameras and graphics, and `src/ui` contains HTML helpers and the token/base/menu/garage/overlay/HUD/polish stylesheets. SSR, cascaded shadows, depth of field, damage, WebGPU and a dedicated snow render pass remain disabled. Sprint is optional in the original brief and is not included in this release.
