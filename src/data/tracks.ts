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
export const TRACKS: TrackSpec[] = [
  {
    id: "neon_a",
    name: "Neon District",
    subtitle: "MIDNIGHT NEVER ENDS",
    environment: "neon",
    accent: "#9ae7d4",
    width: 15,
    difficulty: "TECHNICAL",
    points: [
      [0, 0],
      [0, 95],
      [45, 165],
      [140, 170],
      [205, 105],
      [190, 5],
      [130, -75],
      [40, -85],
      [-25, -45],
    ],
  },
  {
    id: "neon_b",
    name: "Neon Express",
    subtitle: "UNDER THE CITY LIGHTS",
    environment: "neon",
    accent: "#b3a1e7",
    width: 16,
    difficulty: "HIGH SPEED",
    points: [
      [0, 0],
      [0, 150],
      [50, 230],
      [145, 230],
      [230, 155],
      [230, 10],
      [160, -70],
      [40, -70],
    ],
  },
  {
    id: "coast_a",
    name: "Coastal Sunset",
    subtitle: "CHASE THE LAST LIGHT",
    environment: "coast",
    accent: "#f4b47a",
    width: 15,
    difficulty: "FLOWING",
    points: [
      [0, 0],
      [20, 100],
      [110, 145],
      [180, 100],
      [240, 130],
      [290, 30],
      [205, -65],
      [85, -90],
      [-10, -55],
    ],
  },
  {
    id: "coast_b",
    name: "Pacific Loop",
    subtitle: "SALT IN THE AIR",
    environment: "coast",
    accent: "#f4b47a",
    width: 15,
    difficulty: "HIGH SPEED",
    points: [
      [0, 0],
      [-25, 120],
      [50, 200],
      [170, 190],
      [250, 100],
      [210, -30],
      [100, -100],
      [10, -70],
    ],
  },
  {
    id: "canyon_a",
    name: "Canyon Run",
    subtitle: "INTO THE DUST",
    environment: "canyon",
    accent: "#e7a578",
    width: 16,
    difficulty: "MIXED SURFACE",
    points: [
      [0, 0],
      [0, 95],
      [70, 140],
      [155, 100],
      [185, 15],
      [260, -30],
      [200, -115],
      [100, -125],
      [15, -75],
    ],
  },
  {
    id: "canyon_b",
    name: "Redline Ridge",
    subtitle: "CARVE YOUR OWN LINE",
    environment: "canyon",
    accent: "#e7a578",
    width: 15,
    difficulty: "TECHNICAL",
    points: [
      [0, 0],
      [-30, 110],
      [60, 190],
      [155, 150],
      [150, 70],
      [240, 10],
      [220, -90],
      [100, -115],
      [0, -70],
    ],
  },
  {
    id: "neon_c",
    name: "Skyline Spiral",
    subtitle: "TIGHT LINES, BRIGHT LIGHTS",
    environment: "neon",
    accent: "#f29ad8",
    width: 15,
    difficulty: "TECHNICAL",
    points: [
      [0, 0],
      [0, 80],
      [30, 130],
      [90, 140],
      [120, 100],
      [108, 58],
      [140, 20],
      [200, 40],
      [230, 100],
      [270, 60],
      [250, -40],
      [170, -90],
      [80, -80],
      [20, -50],
    ],
  },
  {
    id: "coast_c",
    name: "Lighthouse Point",
    subtitle: "WHERE THE ROAD MEETS THE SEA",
    environment: "coast",
    accent: "#8fd3f0",
    width: 15,
    difficulty: "FLOWING",
    points: [
      [0, 0],
      [10, 90],
      [70, 160],
      [160, 180],
      [220, 130],
      [200, 60],
      [260, 10],
      [300, -60],
      [230, -120],
      [120, -110],
      [40, -70],
    ],
  },
  {
    id: "canyon_c",
    name: "Mesa Sprint",
    subtitle: "FLAT OUT BETWEEN GIANTS",
    environment: "canyon",
    accent: "#f0c27a",
    width: 16,
    difficulty: "HIGH SPEED",
    points: [
      [0, 0],
      [-10, 100],
      [40, 170],
      [120, 200],
      [200, 170],
      [230, 90],
      [180, 40],
      [220, -30],
      [170, -100],
      [80, -120],
      [20, -70],
    ],
  },
];
TRACKS.find((t) => t.id === "neon_c")!.smoothing = "centripetal";
// Legacy circuits retain their layouts at the mandated 2.4x scale.
for (const track of TRACKS)
  track.points = track.points.map(([x, z]) => [x * 2.4, z * 2.4]);
TRACKS.push(...GRAND_PRIX);
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
