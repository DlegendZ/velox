/**
 * Body design sheets for the procedural car generator. All values are metres in car space:
 * +Z forward, +Y up, ground at y = 0.02, axles at z = ±1.3 (shared with physics).
 */
export interface CarDesign {
  /** Maximum body half width. */
  width: number;
  /** Half-width multipliers at the nose and tail. */
  frontTaper: number;
  rearTaper: number;
  /** Height of the bonnet's leading edge, the cowl (windscreen base) and the tail deck. */
  noseY: number;
  cowlY: number;
  deckY: number;
  /** Underside height between the wheels and at the bumpers. */
  sillY: number;
  noseBottomY: number;
  tailBottomY: number;
  roofY: number;
  /** Greenhouse stations: windscreen base, roof front, roof rear, rear glass base, B-pillar. */
  zA: number;
  zR1: number;
  zR2: number;
  zC: number;
  zB: number;
  /** Greenhouse half width at the belt (× body width) and at the roof (× base). */
  cabinWidth: number;
  tumblehome: number;
  /** Plan-view corner radius at nose and tail, and their vertical rounding. */
  noseRadius: number;
  tailRadius: number;
  /** Extra width over the wheels. */
  flare: number;
  /** Shoulder crease prominence 0..1. */
  shoulder: number;
  /** Headlight style: 0 slim blade, 1 round twin, 2 wide bar. */
  headlights: 0 | 1 | 2;
  /** Taillight style: 0 corner blades, 1 full-width bar, 2 round quads. */
  taillights: 0 | 1 | 2;
  roofColor: "paint" | "black" | "glass";
  hoodScoop?: boolean;
  louvres?: boolean;
  sideIntake?: boolean;
  fin?: boolean;
  rallyLights?: boolean;
  openCage?: boolean;
  /** Tyre radius and width; bigger on the buggy and rally car. */
  tyre: [number, number];
  ride: number;
}
export const DESIGNS: Record<string, CarDesign> = {
  kestrel: {
    width: 0.92, frontTaper: 0.95, rearTaper: 0.97,
    noseY: 0.72, cowlY: 0.93, deckY: 1.02, sillY: 0.21, noseBottomY: 0.24, tailBottomY: 0.3,
    roofY: 1.4, zA: 0.72, zR1: 0.08, zR2: -1.32, zC: -1.84, zB: -0.52,
    cabinWidth: 0.9, tumblehome: 0.8, noseRadius: 0.42, tailRadius: 0.22, flare: 0.05, shoulder: 0.5,
    headlights: 0, taillights: 0, roofColor: "black", tyre: [0.34, 0.24], ride: 0,
  },
  vanta: {
    width: 0.95, frontTaper: 0.93, rearTaper: 0.96,
    noseY: 0.64, cowlY: 0.86, deckY: 0.93, sillY: 0.19, noseBottomY: 0.21, tailBottomY: 0.28,
    roofY: 1.26, zA: 0.86, zR1: 0.16, zR2: -0.58, zC: -1.6, zB: -0.34,
    cabinWidth: 0.86, tumblehome: 0.76, noseRadius: 0.5, tailRadius: 0.32, flare: 0.07, shoulder: 0.8,
    headlights: 0, taillights: 1, roofColor: "paint", tyre: [0.35, 0.26], ride: -0.01,
  },
  brutus: {
    width: 0.99, frontTaper: 0.98, rearTaper: 0.99,
    noseY: 0.84, cowlY: 0.99, deckY: 1.0, sillY: 0.22, noseBottomY: 0.27, tailBottomY: 0.3,
    roofY: 1.33, zA: 0.5, zR1: -0.1, zR2: -0.78, zC: -1.4, zB: -0.46,
    cabinWidth: 0.84, tumblehome: 0.82, noseRadius: 0.18, tailRadius: 0.16, flare: 0.05, shoulder: 0.95,
    headlights: 1, taillights: 0, roofColor: "black", hoodScoop: true, tyre: [0.36, 0.28], ride: 0,
  },
  ronin: {
    width: 0.97, frontTaper: 0.95, rearTaper: 0.97,
    noseY: 0.76, cowlY: 0.97, deckY: 1.06, sillY: 0.27, noseBottomY: 0.3, tailBottomY: 0.34,
    roofY: 1.47, zA: 0.74, zR1: 0.1, zR2: -1.12, zC: -1.6, zB: -0.5,
    cabinWidth: 0.88, tumblehome: 0.82, noseRadius: 0.36, tailRadius: 0.24, flare: 0.12, shoulder: 0.55,
    headlights: 1, taillights: 2, roofColor: "paint", rallyLights: true, hoodScoop: true, tyre: [0.36, 0.26], ride: 0.04,
  },
  solace: {
    width: 0.97, frontTaper: 0.92, rearTaper: 0.95,
    noseY: 0.66, cowlY: 0.89, deckY: 0.98, sillY: 0.2, noseBottomY: 0.22, tailBottomY: 0.28,
    roofY: 1.41, zA: 1.02, zR1: 0.38, zR2: -0.95, zC: -1.92, zB: -0.28,
    cabinWidth: 0.88, tumblehome: 0.8, noseRadius: 0.62, tailRadius: 0.38, flare: 0.02, shoulder: 0.35,
    headlights: 2, taillights: 1, roofColor: "glass", tyre: [0.36, 0.25], ride: 0,
  },
  dunerat: {
    width: 0.9, frontTaper: 0.85, rearTaper: 0.92,
    noseY: 0.78, cowlY: 0.9, deckY: 0.96, sillY: 0.36, noseBottomY: 0.42, tailBottomY: 0.44,
    roofY: 0.95, zA: 0.6, zR1: 0.3, zR2: -0.7, zC: -1.0, zB: -0.2,
    cabinWidth: 0.86, tumblehome: 0.8, noseRadius: 0.5, tailRadius: 0.3, flare: 0.16, shoulder: 0.4,
    headlights: 1, taillights: 2, roofColor: "paint", openCage: true, rallyLights: true, tyre: [0.4, 0.32], ride: 0.06,
  },
  aurora: {
    width: 1.0, frontTaper: 0.9, rearTaper: 0.98,
    noseY: 0.56, cowlY: 0.8, deckY: 0.96, sillY: 0.17, noseBottomY: 0.19, tailBottomY: 0.27,
    roofY: 1.15, zA: 1.06, zR1: 0.44, zR2: -0.26, zC: -1.58, zB: 0.0,
    cabinWidth: 0.8, tumblehome: 0.72, noseRadius: 0.55, tailRadius: 0.3, flare: 0.09, shoulder: 0.9,
    headlights: 0, taillights: 1, roofColor: "black", louvres: true, sideIntake: true, tyre: [0.35, 0.29], ride: -0.02,
  },
  phantom: {
    width: 1.01, frontTaper: 0.88, rearTaper: 0.99,
    noseY: 0.5, cowlY: 0.74, deckY: 0.9, sillY: 0.16, noseBottomY: 0.18, tailBottomY: 0.26,
    roofY: 1.12, zA: 1.16, zR1: 0.56, zR2: -0.18, zC: -1.46, zB: 0.12,
    cabinWidth: 0.7, tumblehome: 0.66, noseRadius: 0.6, tailRadius: 0.34, flare: 0.13, shoulder: 1,
    headlights: 2, taillights: 1, roofColor: "glass", sideIntake: true, fin: true, louvres: true, tyre: [0.36, 0.3], ride: -0.02,
  },
};
