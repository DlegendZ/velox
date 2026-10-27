# Credits & licenses

Car designs, track layouts, environment meshes, generated window/smoke/detail textures, UI icons, logos and synthesized music/SFX were created for this project. The separately listed CC0 HDRIs/asphalt maps and OFL fonts are bundled locally. No real car brands, logos, or third-party car models are used.

The interface bundles the fonts explicitly requested in CODEX_BRIEF.md:
- Saira Variable (width 50–125%, weight 100–900, upright and italic) — Omnibus-Type — https://github.com/Omnibus-Type/Saira — SIL Open Font License 1.1, distributed via @fontsource-variable/saira.
- Saira Condensed 600/700/800 — Omnibus-Type — https://github.com/Omnibus-Type/Saira — SIL Open Font License 1.1, distributed via @fontsource/saira-condensed.
- Inter Variable — Rasmus Andersson — https://github.com/rsms/inter — SIL Open Font License 1.1, distributed via @fontsource-variable/inter.

These named fonts are the brief's documented exception to its generic CC0 art restriction (see DECISIONS.md). Other third-party art is restricted to the CC0 files listed below.
Their full license texts ship in public/licenses/Saira-OFL.txt, public/licenses/Saira-Condensed-OFL.txt and public/licenses/Inter-OFL.txt.

## Software dependencies

- Three.js and its included addons — MIT — https://github.com/mrdoob/three.js
- Rapier / @dimforge/rapier3d-compat — Apache-2.0 — https://github.com/dimforge/rapier.js
- postprocessing — Zlib — https://github.com/pmndrs/postprocessing
- N8AO — CC0-1.0 (distributed LICENSE file) — https://github.com/N8python/n8ao
- lil-gui — MIT — https://github.com/georgealways/lil-gui
- Vite — MIT — https://github.com/vitejs/vite
- TypeScript — Apache-2.0 — https://github.com/microsoft/TypeScript
- Playwright — Apache-2.0 — https://github.com/microsoft/playwright
- tsx — MIT — https://github.com/privatenumber/tsx

Software dependencies retain their own licenses. All external art is CC0; fonts are the brief's explicitly named OFL exception. No art or font downloads occur at runtime.

## Version 0.3 environment lighting (CC0)

| File | Creator | Source | License |
|---|---|---|---|
| public/assets/hdri/cobblestone_street_night_1k.hdr (1,760,191 bytes) | Greg Zaal / Poly Haven | https://polyhaven.com/a/cobblestone_street_night | CC0 1.0 |
| public/assets/hdri/venice_sunset_1k.hdr (1,440,400 bytes) | Greg Zaal / Poly Haven | https://polyhaven.com/a/venice_sunset | CC0 1.0 |
| public/assets/hdri/nowhere_road_1k.hdr (1,490,435 bytes) | Dario Barresi / Poly Haven | https://polyhaven.com/a/nowhere_road | CC0 1.0 |

License: https://polyhaven.com/license. HDRIs are local/offline assets, used only for reflections/environment lighting. RoomEnvironment remains the fallback. Panel seams, metallic flakes, tire tread, drilled discs and licence plates are self-generated in CarFactory.ts.

| File | Creator | Source | License |
|---|---|---|---|
| public/assets/asphalt/asphalt_02_diff_1k.jpg (731,707 bytes) | Rob Tuytel / Poly Haven | https://polyhaven.com/a/asphalt_02 | CC0 1.0 |
| public/assets/asphalt/asphalt_02_nor_gl_1k.jpg (1,240,122 bytes) | Rob Tuytel / Poly Haven | https://polyhaven.com/a/asphalt_02 | CC0 1.0 |
| public/assets/asphalt/asphalt_02_rough_1k.jpg (544,032 bytes) | Rob Tuytel / Poly Haven | https://polyhaven.com/a/asphalt_02 | CC0 1.0 |

City facade shaders, tiered architecture/roof props, shop signs, palm fronds, water/foam, rock strata, lighthouse/boats, furniture profiles, heat haze and dust particles are self-generated in the source. No additional third-party geometry or audio is used.
