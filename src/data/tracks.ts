import { GRAND_PRIX } from "./grandPrix";
export type EnvironmentId = "neon" | "coast" | "canyon";
export type Section =
  | { type: "tunnel" | "bridge" | "narrow"; from: number; to: number }
  | { type: "dirt"; from: number; to: number; grip: number }
  | { type: "boost" | "crest"; at: number };
export interface TrackSpec {
  id: string;
  name: string;
  subtitle: string;
  environment: EnvironmentId;
  accent: string;
  points: ([number, number] | [number, number, number, number])[];
  width: number;
  difficulty: string;
  smoothing?: "catmullrom" | "centripetal";
  sections?: Section[];
  length?: "short" | "gp";
}
/** Five large, flat circuits: no elevation, banking or crests, so cars never
 * get airborne and every corner is a clean drift corner. */
export const TRACKS: TrackSpec[] = [
  ...GRAND_PRIX,
  {
    id: "neon_a",
    name: "Harbour Drift",
    subtitle: "CONTAINER ROW AFTER MIDNIGHT",
    environment: "neon",
    accent: "#9ae7d4",
    width: 17,
    difficulty: "DRIFT",
    smoothing: "centripetal",
    length: "gp",
    points: [
      [0, 0, 0, 18],
      [0, 200, 0, 18],
      [40, 290, 0, 17],
      [150, 320, 0, 17],
      [230, 270, 0, 16],
      [250, 180, 0, 16],
      [330, 130, 0, 16],
      [440, 160, 0, 16],
      [480, 260, 0, 16],
      [450, 370, 0, 16],
      [510, 460, 0, 17],
      [640, 470, 0, 17],
      [730, 390, 0, 17],
      [730, 260, 0, 16],
      [660, 170, 0, 16],
      [690, 60, 0, 17],
      [790, 0, 0, 17],
      [830, -110, 0, 17],
      [760, -220, 0, 16],
      [620, -240, 0, 16],
      [510, -170, 0, 16],
      [400, -220, 0, 16],
      [290, -310, 0, 16],
      [160, -290, 0, 17],
      [90, -200, 0, 18],
      [30, -100, 0, 18],
    ],
    // Boulevard start → container-row esses → two hairpins round the cranes
    // → TUNNEL under the freight terminal → long sweeper back to the line.
    sections: [
      { type: "narrow", from: 0.2, to: 0.29 },
      { type: "tunnel", from: 0.6, to: 0.67 },
      { type: "boost", at: 0.05 },
      { type: "boost", at: 0.52 },
    ],
  },
  {
    id: "coast_c",
    name: "Lighthouse Touge",
    subtitle: "HAIRPINS ABOVE THE SURF",
    environment: "coast",
    accent: "#8fd3f0",
    width: 16,
    difficulty: "DRIFT",
    smoothing: "centripetal",
    length: "gp",
    points: [
      [0, 0, 0, 18],
      [0, 190, 0, 17],
      [-70, 270, 0, 16],
      [-50, 360, 0, 16],
      [40, 400, 0, 16],
      [120, 340, 0, 16],
      [200, 400, 0, 16],
      [180, 500, 0, 16],
      [260, 580, 0, 16],
      [390, 560, 0, 16],
      [440, 460, 0, 16],
      [370, 380, 0, 16],
      [430, 290, 0, 16],
      [540, 310, 0, 16],
      [630, 240, 0, 16],
      [610, 130, 0, 16],
      [520, 90, 0, 16],
      [560, -10, 0, 17],
      [670, -60, 0, 17],
      [690, -180, 0, 17],
      [580, -270, 0, 16],
      [450, -230, 0, 16],
      [330, -290, 0, 16],
      [200, -270, 0, 17],
      [130, -180, 0, 18],
      [60, -90, 0, 18],
    ],
    // Seafront straight → three linked hairpins up the headland → lighthouse
    // esses → BRIDGE over the cove → fast coastal run home.
    sections: [
      { type: "bridge", from: 0.64, to: 0.72 },
      { type: "boost", at: 0.04 },
      { type: "boost", at: 0.6 },
    ],
  },
];
// Every circuit is laid out at 1.35x its drawn size (~4 km a lap).
for (const track of TRACKS)
  track.points = track.points.map(
    ([x, z, y = 0, w = track.width]) =>
      [x * 1.35, z * 1.35, y, w] as [number, number, number, number],
  );
export type RaceMode =
  "race" | "time" | "drift" | "rush" | "elimination" | "roam";
export const WEATHERS = [
  ["clear", "CLEAR"],
  ["rain", "RAIN"],
  ["fog", "FOG"],
  ["snow", "SNOW"],
] as const;
export const MODES: {
  id: RaceMode;
  name: string;
  tag: string;
  description: string;
  icon: string;
}[] = [
  {
    id: "race",
    name: "Quick Race",
    tag: "THE STREETS ARE CALLING",
    description: "You. Five rivals. One finish line.",
    icon: "↗",
  },
  {
    id: "time",
    name: "Time Trial",
    tag: "YOUR ONLY RIVAL IS YOU",
    description: "Chase your personal best and race your ghost.",
    icon: "◷",
  },
  {
    id: "drift",
    name: "Drift Attack",
    tag: "STYLE OVER STRAIGHT LINES",
    description: "Link drifts. Build a combo. Make it count.",
    icon: "〰",
  },
  {
    id: "rush",
    name: "Checkpoint Rush",
    tag: "EVERY SECOND COUNTS",
    description: "Beat the clock. Each gate buys more time.",
    icon: "⌁",
  },
  {
    id: "elimination",
    name: "Elimination",
    tag: "NO ROOM FOR LAST PLACE",
    description: "Last place drops out at every lap.",
    icon: "⚑",
  },
  {
    id: "roam",
    name: "Free Roam",
    tag: "NO CLOCK. NO LIMITS.",
    description: "Explore, collect street tokens and find your flow.",
    icon: "◎",
  },
];
