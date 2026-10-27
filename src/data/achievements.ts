import { UPGRADES } from "./cars";
import { TRACKS, type RaceMode } from "./tracks";
import type { SaveData } from "../core/Save";
export interface Achievement {
  id: string;
  name: string;
  detail: string;
  reward: number;
  /** [current, target]; unlocked when current ≥ target. */
  progress: (d: SaveData) => [number, number];
}
const stat =
  (key: keyof SaveData["stats"], target: number, scale = 1) =>
  (d: SaveData): [number, number] => [d.stats[key] / scale, target];
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_race",
    name: "First Light",
    detail: "Finish your first race.",
    reward: 500,
    progress: stat("races", 1),
  },
  {
    id: "first_win",
    name: "Top Step",
    detail: "Win a race.",
    reward: 1000,
    progress: stat("wins", 1),
  },
  {
    id: "wins_10",
    name: "Street Royalty",
    detail: "Win 10 races.",
    reward: 5000,
    progress: stat("wins", 10),
  },
  {
    id: "podium_25",
    name: "Regular on the Podium",
    detail: "Finish in the top three 25 times.",
    reward: 4000,
    progress: stat("podiums", 25),
  },
  {
    id: "clean_5",
    name: "Not a Scratch",
    detail: "Finish 5 races without contact.",
    reward: 2500,
    progress: stat("cleanRaces", 5),
  },
  {
    id: "km_100",
    name: "Night Shift",
    detail: "Drive 100 km.",
    reward: 3000,
    progress: stat("distance", 100, 1000),
  },
  {
    id: "km_500",
    name: "Odometer Legend",
    detail: "Drive 500 km.",
    reward: 10000,
    progress: stat("distance", 500, 1000),
  },
  {
    id: "speed_250",
    name: "Quarter Thousand",
    detail: "Reach 250 km/h.",
    reward: 2000,
    progress: stat("topSpeed", 250),
  },
  {
    id: "speed_330",
    name: "Warp Lane",
    detail: "Reach 330 km/h.",
    reward: 6000,
    progress: stat("topSpeed", 330),
  },
  {
    id: "drift_5k",
    name: "Sideways",
    detail: "Bank a single 5,000 point drift.",
    reward: 2000,
    progress: stat("bestDrift", 5000),
  },
  {
    id: "drift_20k",
    name: "Smoke Signal",
    detail: "Bank a single 20,000 point drift.",
    reward: 6000,
    progress: stat("bestDrift", 20000),
  },
  {
    id: "air_2",
    name: "Frequent Flyer",
    detail: "Stay airborne for 2 seconds.",
    reward: 1500,
    progress: stat("longestAir", 2),
  },
  {
    id: "near_25",
    name: "Paint Thin",
    detail: "Score 25 near misses.",
    reward: 2500,
    progress: stat("nearMisses", 25),
  },
  {
    id: "overtake_50",
    name: "Coming Through",
    detail: "Make 50 overtakes.",
    reward: 3000,
    progress: stat("overtakes", 50),
  },
  {
    id: "tokens_16",
    name: "Collector",
    detail: "Collect 16 street tokens.",
    reward: 2000,
    progress: stat("tokens", 16),
  },
  {
    id: "traps_3",
    name: "Flash Photography",
    detail: "Trigger 3 speed traps.",
    reward: 1500,
    progress: stat("traps", 3),
  },
  {
    id: "nitro_300",
    name: "Afterburner",
    detail: "Use 5 minutes of nitro.",
    reward: 2500,
    progress: stat("nitroTime", 300, 60),
  },
  {
    id: "garage_4",
    name: "Growing Collection",
    detail: "Own 4 cars.",
    reward: 4000,
    progress: (d) => [Object.keys(d.garage.owned).length, 4],
  },
  {
    id: "garage_8",
    name: "Full House",
    detail: "Own all 8 cars.",
    reward: 20000,
    progress: (d) => [Object.keys(d.garage.owned).length, 8],
  },
  {
    id: "upgrade_max",
    name: "Fully Built",
    detail: "Max out any upgrade category.",
    reward: 3000,
    progress: (d) => [
      Math.max(
        0,
        ...Object.values(d.garage.owned).flatMap((o) =>
          UPGRADES.map((u) => o.upgrades[u.id]),
        ),
      ),
      5,
    ],
  },
  {
    id: "career_30",
    name: "Halfway Legend",
    detail: "Earn 30 career stars.",
    reward: 8000,
    progress: (d) => [
      Object.values(d.career.stars).reduce((a, b) => a + b, 0),
      30,
    ],
  },
  {
    id: "phantom",
    name: "Catch the Phantom",
    detail: "Win the career finale and claim the Phantom X.",
    reward: 10000,
    progress: (d) => [d.garage.owned.phantom ? 1 : 0, 1],
  },
  {
    id: "online_1",
    name: "Party Lights",
    detail: "Finish an online race with friends.",
    reward: 1500,
    progress: stat("onlineRaces", 1),
  },
  {
    id: "online_win",
    name: "Bragging Rights",
    detail: "Win an online race.",
    reward: 4000,
    progress: stat("onlineWins", 1),
  },
  {
    id: "daily_3",
    name: "Creature of Habit",
    detail: "Complete 3 daily challenges.",
    reward: 3000,
    progress: stat("dailies", 3),
  },
  {
    id: "level_10",
    name: "Double Digits",
    detail: "Reach driver level 10.",
    reward: 5000,
    progress: (d) => [d.profile.level, 10],
  },
];
/** Unlocks every achievement whose target is met, pays its reward and returns the new ones. */
export function checkAchievements(d: SaveData) {
  const unlocked: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (d.achievements[a.id]) continue;
    const [now, target] = a.progress(d);
    if (now >= target) {
      d.achievements[a.id] = Date.now();
      d.profile.credits += a.reward;
      unlocked.push(a);
    }
  }
  return unlocked;
}
export interface DailyChallenge {
  date: string;
  mode: RaceMode;
  track: string;
  reverse: boolean;
  weather: string;
  laps: number;
  car: string | null;
  reward: number;
  goal: string;
}
/** A deterministic challenge for the local calendar day, identical for every player. */
export function dailyChallenge(now = new Date()): DailyChallenge {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  let seed = [...date].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pick = <T>(list: readonly T[]) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return list[seed % list.length];
  };
  const mode = pick(["race", "time", "drift", "rush", "elimination"] as const);
  const track = pick(TRACKS);
  return {
    date,
    mode,
    track: track.id,
    reverse: pick([false, true]),
    weather: pick(["clear", "rain", "fog", "snow", "clear"]),
    laps:
      track.length === "gp"
        ? pick([1, 2])
        : mode === "elimination"
          ? 5
          : pick([2, 3]),
    car: null,
    reward: 4000,
    goal:
      mode === "race"
        ? "Finish on the podium"
        : mode === "time"
          ? "Set a lap under the 2-star time"
          : mode === "drift"
            ? "Score over 5,000 drift points"
            : mode === "rush"
              ? "Complete every lap before time runs out"
              : "Survive to the final lap",
  };
}
