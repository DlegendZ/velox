import type { RaceMode } from "./tracks";
export const TIERS = [
  "Street Rookie",
  "Night Circuit",
  "Coastal Cup",
  "Apex Championship",
];
export const CAREER_EVENTS = TIERS.flatMap((tier, t) =>
  Array.from({ length: 5 }, (_, i) => ({
    id: `tier${t + 1}_${i}`,
    tier: t + 1,
    name: [
      [
        "First light",
        "Underpass run",
        "After hours",
        "Sideways society",
        "Beat the neon",
      ],
      [
        "Night shift",
        "No curfew",
        "Express delivery",
        "Smoke signal",
        "Midnight run",
      ],
      [
        "Pacific calling",
        "Saltwater sprint",
        "Golden hour",
        "Coastal slide",
        "Last light",
      ],
      [
        "Apex rising",
        "Redline ritual",
        "All or nothing",
        "Final smoke",
        "PHANTOM: The finale",
      ],
    ][t][i],
    series: tier,
    mode:
      t === 3 && i === 4
        ? "race"
        : (["race", "race", "elimination", "drift", "time"] as RaceMode[])[i],
    track: ["neon_a", "neon_gp", "coast_gp", "canyon_gp"][t],
    laps: t > 0 ? 2 : i === 2 ? 4 : 2,
    maxPI: [449, 549, 699, 999][t],
    reward: 5000 * (t + 1),
    targetTime: [155, 170, 190, 175][t],
  })),
);
