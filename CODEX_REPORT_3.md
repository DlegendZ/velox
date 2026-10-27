# CODEX REPORT 3 — VELOX 0.6

Baseline captured before code changes: 56 images (14 states × 4 sizes) in `test-results/before/`. All 56 inspected via `test-results/v06-before-review-{1..6}.jpg` and its source manifest. Protected sources: `test-results/v06-protected-before.json`.

| ID | Done? | Evidence (screenshot files / test names) | Notes |
| --- | --- | --- | --- |
| A1 | Yes | `test-results/` paths: `after/A/A-p-{settings,career,setup,profile}-1366x768.png`; `v06-A.json` | Exact rgba(6,8,11,.9), blur8/saturate.8 and half-strength glow. Hide world/studio for the final frame, then freeze compositor; this also removes the silhouette still visible through a 90% scrim. |
| A2 | Yes | `test-results/` paths: `after/A/A-p-{menu,garage}-{1920x1080,1366x768}.png`; `v06-A-floor-glare.json`; `qa-polish-a.mjs` | LED 2.6m/y2.2/max.9; ceiling y7.6; reflector0x101317; satin.92/.7. Lower-half pure-white area below2% of screen. |
| A3 | Yes | `test-results/` paths: `v06-A.json`; `after/A/*.png` | Meaningful entry focus, never BACK; pointer/key/gamepad modality controls outline. Entry focus suppresses focus scrolling. |
| A4 | Yes | `test-results/` paths: `v06-A.json`; `qa-ui.mjs` + `ui-audit.js`; `after/A/A-p-garage-1366x768.png` | Nowrap ellipsis and local bounds checked; OWNED has10px card-bottom padding. Deliberate partial/offscreen scrollport clipping is excluded from local text bounds: scrolling necessarily clips moving content; focus QA verifies reachability. |
| A5 | Yes | `test-results/` paths: `v06-A.json`; `after/A/A-p-{setup,garage,pause,results}-{1366x768,1280x720}.png` | Primary actions in stationary/sticky panel footers; option/card bodies scroll. Checks include actual host START RACE and actual results entry at scrollTop0. |
| A6 | Yes | `test-results/` paths: `before/crops/*.png`; `after/A/crops/*.png`; `v06-A-final-crops-review-1.jpg` | Shared space tokens;24px panel padding,16px at<=1366; separate action rows. Explicit later B3/H6 gap exceptions are retained. |
| B1 | Yes | `test-results/after/B/B-p-setup-*.png`; `test-results/v06-B.json` | Opaque glass-strong gradient; side cards .55 opacity/.86 scale, centre1; ellipsis names. |
| B2 | Yes | `test-results/after/B/B-p-setup-*.png`; `test-results/v06-B.json` | Exact max-height viewport minus64/56/2×24; inner options scroll;12px row gaps; sticky START; panel stays16px below the mode strip. |
| B3 | Yes | `test-results/after/B/B-p-setup-*.png`; `test-results/v06-B.json` | 6px unwrapped snap strip; data-short TIME/DRIFT/RUSH at<=1366 with full aria-labels. |
| C1 | Yes | `test-results/after/C/C-p-garage*.png`; `qa-garage.mjs`; `test-results/v05-garage.json` | carBounds/fitCar project actual LOD0 Box3 corners;62% stage width, stage view offset. Front3/4, side at wheel height and rear3/4 presets. The Performance orbit limit permits the requested low camera;QA checks its height. Portrait fit uses a wider lens while staying inside studio walls. QA projects corners at1920/1366 for all4tabs. |
| C2 | Yes | `test-results/after/C/C-p-garage*.png`; `qa-garage.mjs`; `test-results/v05-garage.json` | Reflector hidden in garage; no mirrored fragments below platform. |
| C3 | Yes | `test-results/after/C/C-p-garage*.png`; `qa-garage.mjs`; `test-results/v05-garage.json` | 220×150 cards,96px cover thumbnails rendered512×256 at80% projected width;16/12px text/status10px bottom;12px card gap;48px edge arrows disabled at ends;owned plusDEALER/all8;ACTIVE badge. The150px height requires compact internal card lines with no extra interline gaps. |
| C4 | Yes | `test-results/after/C/C-p-garage*.png`; `qa-garage.mjs`; `test-results/v05-garage.json` | Four22px stat rows retained;panel wraps content,inner scroll and sticky action footer. |
| C5 | Yes | `test-results/after/C/C-p-garage*.png`; `qa-garage.mjs`; `test-results/v05-garage.json` | Hint dismisses after4s or pointer-down initiating orbit; stays dismissed through rerenders/tabs and resets only on next visit. QA checks timed dismissal and revisit. |
| D1 | Yes | `test-results/after/D/D-p-career*.png` | Four equal minmax chapter columns;ellipsis titles,accent selection and text-3 locked labels. |
| D2 | Yes | `test-results/after/D/D-p-career*.png` | RACE vertically centred with16px right padding;red over-cap chip uses exact requested sentence and links to lower-class selection. |
| E1 | Yes | `test-results/after/E/*.png`;`test-results/v06-E.json`;`qa-polish-e.mjs` | Centre panel padding is28px on all sides. |
| E2 | Yes | `test-results/after/E/*.png`;`test-results/v06-E.json`;`qa-polish-e.mjs` | Exact minmax columns and24px gap,vertically centred;map hidden below1100,standings below800;long order scrolls inside its column. |
| E3 | Yes | `test-results/after/E/*.png`;`test-results/v06-E.json`;`qa-polish-e.mjs` | Shared liveGap formatter used by HUD and pause;metres/FIN/OUT,right-aligned tabular gaps and ellipsis names. |
| F1 | Yes | `test-results/after/F/*.png`;`test-results/v06-F.json`;`qa-polish-f.mjs` | Header96px/position<=96px;three independently scrolling cards and sticky actions;entry resets page/cards to0 and focuses CONTINUE with preventScroll. Fixed selector-list document ordering that previously chose RACE AGAIN. |
| F2 | Yes | `test-results/after/F/*.png`;`test-results/v06-F.json`;`qa-polish-f.mjs` | Each name/car/time stays on one line;roomy line-height;projected note has8px padding at card bottom. |
| F3 | Yes | `test-results/after/F/*.png`;`test-results/v06-F.json`;`qa-polish-f.mjs` | XP-to-stars16px;achievement gold icon aligned to text baseline. |
| G1 | Yes | `test-results/after/G/*.png`;`test-results/v06-G.json`;`qa-polish-g.mjs` | Dedicated middle stage uses actual projected car Box3;centre between55–65% of viewport;width confined between menu/cards. Both cards above footer with16px gap at desktop sizes. Portrait uses a separate stage below the menu and a solid menu scrim because the wide portrait lens exposes overhead softboxes;both cards remain reachable by internal scrolling. |
| G2 | Yes | `test-results/after/G/*.png`;`test-results/v06-G.json`;`qa-polish-g.mjs` | Numbered entries retained;description uses animated max-height with6px gap and no excess padding-driven jump. |
| H1 | Yes | `test-results/after/H/*.png`;`test-results/v06-H.json`;`qa-polish-h.mjs`;`tests/hud-presentation.test.ts` | Physical24px safe margins at<=1366 and40px at1920,compensating whole-HUD scale;pairwise plate/control bounds checked at five sizes. |
| H2 | Yes | `test-results/after/H/*.png`;`test-results/v06-H.json`;`qa-polish-h.mjs`;`tests/hud-presentation.test.ts` | One-line ellipsis track name,max300px;mode12px beneath. |
| H3 | Yes | `test-results/after/H/*.png`;`test-results/v06-H.json`;`qa-polish-h.mjs`;`tests/hud-presentation.test.ts` | Gear circle left of KM/H;path-sampling checks>=8px physical clearance at0/40/150/300;LEDs below arc. |
| H4 | Yes | `test-results/after/H/*.png`;`test-results/v06-H.json`;`qa-polish-h.mjs`;`tests/hud-presentation.test.ts` | Additive validated settings.hintRaces defaults0 and increments only when race enters;first20s of exactly first3 races,600ms fade. Controls toggle persists via actual UI change and forces hints. Old progression migration test passes. |
| H5 | Yes | `test-results/after/H/*.png`;`test-results/v06-H.json`;`qa-polish-h.mjs`;`tests/hud-presentation.test.ts` | Removed old caption;4px accent lap-progress bar and12px checkpoint distance using actual expected gate. |
| H6 | Yes | `test-results/after/H/*.png`;`test-results/v06-H.json`;`qa-polish-h.mjs`;`tests/hud-presentation.test.ts` | Maximum6 physical rows including separator;at<=800 top3/player/neighbours prioritised;below500 only top3. Tabular12px gaps and4px row spacing. If an ellipsis plus both neighbours would exceed6,retain the ahead neighbour first. |
| H7 | Yes | `test-results/after/H/*.png`;`test-results/v06-H.json`;`qa-polish-h.mjs`;`tests/hud-presentation.test.ts` | Maximum3 stable fading slots;nearest forward cars within80m,>=6m from camera;projected player Box3 overlap rejected;200ms fades without hidden toggles. |
| H8 | Yes | `test-results/after/H/*.png`;`test-results/v06-H.json`;`qa-polish-h.mjs`;`tests/hud-presentation.test.ts` | One22–40% vertical stack,max2 notices;1800ms lifetime,120px countdown at1080p/28px popup display font;short landscape countdown scales further to fit stack. |
| H9 | Yes | `test-results/after/H/*.png`;`test-results/v06-H.json`;`qa-polish-h.mjs`;`tests/hud-presentation.test.ts` | Portrait390x844 and landscape844x390 measured without overlaps;touch zones separated from speed/map/order;landscape minimap hidden/top3 only. |
| I1 | Yes | `qa-ui.mjs --full`;`test-results/task-8-ui.json`;`test-results/v06-I-touch.json` | 44px desktop and48px coarse-pointer minimums;segmented48px widths,44px stepper,48px arrows,44px BACK/mute,48px settings tabs,56px garage rail,44/48px paints and52x30 toggle tracks inside44/48px targets.36 extra touch states verify48px targets. |
| I2 | Yes | `test-results/after/I-crops/*.png`;`test-results/v06-final-ui.log` | Saira display/labels at600–850,width100–118;Saira Condensed/tabular numbers;Inter14px descriptive copy and inputs. Conflicting important font overrides and Inter label fallbacks removed. No Inter>=18px or Inter buttons across120 screens. |
| I3 | Yes | `test-results/after/p-*.png`;`test-results/v06-final-ui.log` | Secondary labels13px/600/uppercase/.06em,text-2;values16px+/700;body14px/400/1.45;card headings22px/800/italic/112%. Labels above profile values;explicit C3/H2/H5/H6 sizes retained. |
| I4 | Yes | `test-results/v06-I-comfort.json`;`test-results/v06-final-qa-scroll.log`;`UIComfort.ts` | Every CSS auto/scroll container gets a deterministic data-scroll-key;all nested positions restored across Game.screen and periodic standings replacement.24px directional masks,6px hover/scroll scrollbars/stable gutter,native wheel and explicit smooth programmatic reveal with reduced-motion instant. |
| I5 | Yes | `test-results/v06-I-comfort.json`;`test-results/after/I-final-ui/*.png`;`polish.css` | 120ms hover background/border and2px row lift;instant active scale.98;pointer cursor. Disabled opacity.45 with contextual affordability,unlock,ready-state or carousel-end tooltip reasons. |
| I6 | Yes | `test-results/v06-I-comfort.json`;`test-results/after/I-final-ui/task-8-settings-*.png` | 6px accent-filled ranges,20px thumb and focus ring,value output on right;44px colour inputs and text controls with12px padding/glass/focus accent;styled toggle tracks and clickable setting rows. |
| I7 | Yes | `test-results/v06-I-comfort.json`;`test-results/v06-final-qa-network.log` | Pause,mute,track/car arrows,copy and chat-send buttons have aria-label and title. Disabled icon tooltips explain the unavailable action. |
| I8 | Yes (closest permitted) | `test-results/v06-performance.json`;`test-results/v06-performance-trace.json` | Closest permitted version:instant CSS press feedback,entry transitions<=240ms;identical showroom cars/UI track layouts cached.41 actual UI actions traced. Loading screen paints before heavy work.100ms ceiling is NOT universally met;all exceptions and GUI-tool limitation are listed below. |

## Section gates

| Section | Typecheck | Unit tests | Build | Visual inspection |
| --- | --- | --- | --- | --- |
| A | PASS | 30/30 | PASS | 40 final images + 8 crops inspected; earlier captures also inspected. |
| B | PASS | 30/30 | PASS | Four final setup screenshots inspected (v06-B-final-review-1.jpg); initial captures also inspected. |
| C | PASS | 30/30 | PASS |16 final images inspected(v06-C-final-review-{1,2}.jpg);earlier captures also inspected. |
| D | PASS |30/30|PASS|Eight normal/over-cap screenshots inspected(v06-D-review-1.jpg).|
| E | PASS |30/30|PASS|Eight final images inspected(v06-E-final-review-1.jpg);initial captures also inspected.|
| F | PASS |30/30|PASS|Eight initial and eight final entry/payoff images inspected(v06-F-review-1.jpg,v06-F-corrected-review-1.jpg). Corrected frozen-loop QA to draw the final backdrop frame; all earlier captures also inspected.|
| G | PASS |30/30|PASS|Eight title/Home and two portrait follow-up images inspected(v06-G-review-1.jpg,after/G/G-mobile-*.png).|
| H | PASS |34/34|PASS|22 final images inspected(v06-H-final-review-{1..3}.jpg);initial22 also inspected. Frozen-loop capture now redraws after viewport resize.|
| I | PASS |34/34|PASS|120 UI +56 full-polish +10 HUD +20 regression images inspected;8 corrections and8 font crops inspected;final wheel-height camera images also inspected.|

## Exact-value precedence and permitted exception

B3 explicitly specifies 6px between mode tabs and H6 specifies 4px between standings rows; these specific values take precedence over the general 8px sibling gap. I3 retains the explicitly requested 12px sizes in C3/H2/H5/H6, as well as eyebrows/key hints. H4 explicitly permits additive settings.hintRaces and the control-hints override; no other save format change is planned.

## Performance panel tool limitation

The Computer Use helper ended GUI automation because it could not determine the current Chrome URL with enough confidence to enforce policy. No further native GUI input was issued. The owned local QA Chrome was launched with DevTools open; panel selection cannot be verified. The closest evidence is a Chrome DevTools Protocol performance trace and PerformanceObserver long-task measurements against the known localhost page. This is an explicit I8 protocol exception, not a claimed visual verification of the Performance panel.

## Changed files by section

| Section | Main source files |
| --- | --- |
| A | `src/render/Renderer.ts`,`src/core/Game.ts`,`src/ui/Screens.ts`,`src/ui/styles/polish.css` |
| B | `src/ui/Screens.ts`,`src/ui/styles/polish.css` |
| C | `src/render/CarFraming.ts`,`src/render/Renderer.ts`,`src/core/Game.ts`,`src/ui/Screens.ts`,`src/ui/styles/polish.css` |
| D | `src/ui/Screens.ts`,`src/ui/styles/polish.css` |
| E | `src/ui/LiveOrder.ts`,`src/core/Game.ts`,`src/ui/Screens.ts`,`src/ui/styles/polish.css` |
| F | `src/core/Game.ts`,`src/ui/Screens.ts`,`src/ui/styles/polish.css` |
| G | `src/render/Renderer.ts`,`src/core/Game.ts`,`src/ui/Screens.ts`,`src/ui/styles/polish.css` |
| H | `src/ui/HUDPresentation.ts`,`src/ui/RaceHUD.ts`,`src/ui/SettingsScreen.ts`,`src/core/Game.ts`,`src/core/Save.ts`,`src/ui/styles/polish.css`,`tests/hud-presentation.test.ts` |
| I | `src/ui/UIComfort.ts`,`src/core/Game.ts`,`src/render/Renderer.ts`,`src/ui/Screens.ts`,`src/ui/styles/{tokens,menu,polish}.css`;QA scripts;version/changelog/readme |

## Final verification

All commands passed with VELOX_URL=http://127.0.0.1:5174:

| Check | Result | Evidence |
| --- | --- | --- |
| Typecheck / unit tests / production build | PASS /34 of34/PASS | `test-results/v06-I-{typecheck,test,build}.log` |
| qa-ui.mjs --full | PASS,120 screens | `test-results/v06-final-ui.log`,`test-results/task-8-ui.json` |
| qa-hud.mjs | PASS | `test-results/v06-final-qa-hud.log` |
| qa-garage.mjs | PASS | `test-results/v06-final-qa-garage.log` |
| qa-scroll.mjs | PASS | `test-results/v06-final-qa-scroll.log` |
| qa-final.mjs | PASS:roam,replay,rewards/ghost/save,reset cancellation | `test-results/v06-final-qa-final.log` |
| qa-network.mjs | PASS:room and WebRTC invite,end to end | `test-results/v06-final-qa-network.log` |
| Exact A/B/H and scroll/control checks | PASS | `test-results/v06-final-{A,B,H}.log`,`test-results/v06-I-comfort.json` |
| Coarse-pointer targets | PASS,36 states at390x844 and844x390 | `test-results/v06-final-touch.log`,`test-results/v06-I-touch.json` |
| Protected sources |18 of18 unchanged SHA256 | `test-results/v06-protected-after.json` |

Baseline56 images remain in `test-results/before/`;final56 full-polish images are `test-results/after/p-*.png`. Final review manifests: `v06-final-polish-review.json`,`v06-final-ui-review.json`,`v06-final-hud-review.json`,`v06-final-regressions-review.json`,`v06-final-corrections-review.json`,`v06-final-camera-review.json`. Every image was opened via its review sheet;earlier captures and the8 type crops were also inspected. Studio/geometry measurements use actual rendered Box3 corners. Native browser subpixel rounding of0.00003px is accepted within0.01px for exact220x150 card checks.

## I8 measured limitations and closest implementation

The final trace covers41 clicks,including every screen,all garage/settings tabs,setup modes,local lobby,race loading,pause/photo/replay/results. Setup's former105ms long task no longer appears after UI layout/map caching. First-entry work fell from214ms to158ms. The100ms ceiling and first-frame response are therefore **not claimed as fully satisfied**.

| Start after navigation (ms) | Duration (ms) | Attributed action |
| --- | --- | --- |
| 6163.6 | 158 | enter |
| 19465.3 | 873 | start |
| 20383.5 | 292 | race loading / render |
| 20849.4 | 1502 | race loading / render |
| 25277.2 | 156 | race loading / render |
| 25505.9 | 140 | race loading / render |

The loading screen was present on the first requestAnimationFrame,6.6ms after START. Maximum measured click-to-next-frame was165ms. Long tasks remain in first user-gesture audio/entry initialization and legacy race construction/shader/render warm-up. The brief protects audio,physics and track/car geometry;these subsystems were preserved instead of rewriting them to hide the measurements. This is the explicit closest-version exception allowed by section0. The trace and raw metrics include every observed task over100ms.

## Checklist

- [x] All41 IDs recorded with evidence;I8's exact limitations explicitly disclosed.
- [x] Required hit-target,font,text-bounds and primary-action checks pass.
- [x] All scrollports retain positions and have directional edge fades.
- [x] Baseline/final full polish scenes exist at all four required sizes and were inspected.
- [x] Content backdrops,studio values,garage framing,pause/results and HUD checks pass.
- [x] All required commands pass;CHANGELOG,package/lock/title and README are0.6.0.
- [x] No new external assets;CREDITS requires no new entries;protected18 files unchanged.
