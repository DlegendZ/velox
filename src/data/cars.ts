export type Drive = "FWD" | "RWD" | "AWD";
export type Upgrade =
  "engine" | "turbo" | "tires" | "suspension" | "nitro" | "weight";
export interface CarShape {
  noseLength: number;
  cabinStart: number;
  cabinEnd: number;
  roofHeight: number;
  beltLine: number;
  rearDeck: number;
  hipWidth: number;
  fenderFlare: number;
  frontOverhang: number;
  rearOverhang: number;
  spoilerLip: number;
}
export interface CarSpec {
  id: string;
  name: string;
  type: string;
  drive: Drive;
  price: number;
  level: number;
  stats: [number, number, number, number];
  topSpeed: number;
  acceleration: number;
  massKg: number;
  powerKw: number;
  color: string;
  sound: "i4" | "v8" | "boxer" | "ev" | "v12";
  length: number;
  roof: number;
  shape: CarShape;
}
export const CARS: CarSpec[] = [
  {
    id: "kestrel",
    shape: {
      noseLength: 0.26,
      cabinStart: 0.24,
      cabinEnd: 0.88,
      roofHeight: 1.37,
      beltLine: 0.86,
      rearDeck: 0.82,
      hipWidth: 0.92,
      fenderFlare: 0.06,
      frontOverhang: 0.75,
      rearOverhang: 0.75,
      spoilerLip: 0.04,
    },
    name: "Kestrel GT",
    type: "STREET HATCH",
    drive: "FWD",
    price: 0,
    level: 1,
    stats: [5, 5, 7, 4],
    topSpeed: 210,
    acceleration: 6.8,
    massKg: 1180,
    powerKw: 155,
    color: "#bded74",
    sound: "i4",
    length: 4.1,
    roof: 1.37,
  },
  {
    id: "vanta",
    shape: {
      noseLength: 0.35,
      cabinStart: 0.34,
      cabinEnd: 0.76,
      roofHeight: 1.16,
      beltLine: 0.78,
      rearDeck: 0.74,
      hipWidth: 1,
      fenderFlare: 0.08,
      frontOverhang: 0.92,
      rearOverhang: 0.78,
      spoilerLip: 0.07,
    },
    name: "Vanta R",
    type: "DRIFT COUPÉ",
    drive: "RWD",
    price: 18000,
    level: 2,
    stats: [6, 6, 7, 9],
    topSpeed: 238,
    acceleration: 5.7,
    massKg: 1300,
    powerKw: 235,
    color: "#c4b5fd",
    sound: "i4",
    length: 4.35,
    roof: 1.16,
  },
  {
    id: "brutus",
    shape: {
      noseLength: 0.43,
      cabinStart: 0.43,
      cabinEnd: 0.81,
      roofHeight: 1.22,
      beltLine: 0.82,
      rearDeck: 0.8,
      hipWidth: 1.04,
      fenderFlare: 0.04,
      frontOverhang: 1.1,
      rearOverhang: 0.88,
      spoilerLip: 0.08,
    },
    name: "Brutus 69",
    type: "AMERICAN MUSCLE",
    drive: "RWD",
    price: 25000,
    level: 3,
    stats: [7, 8, 4, 7],
    topSpeed: 260,
    acceleration: 4.8,
    massKg: 1620,
    powerKw: 340,
    color: "#ef7957",
    sound: "v8",
    length: 4.8,
    roof: 1.22,
  },
  {
    id: "ronin",
    shape: {
      noseLength: 0.27,
      cabinStart: 0.25,
      cabinEnd: 0.87,
      roofHeight: 1.48,
      beltLine: 0.94,
      rearDeck: 0.89,
      hipWidth: 0.98,
      fenderFlare: 0.16,
      frontOverhang: 0.7,
      rearOverhang: 0.75,
      spoilerLip: 0.12,
    },
    name: "Ronin S",
    type: "RALLY SPECIAL",
    drive: "AWD",
    price: 30000,
    level: 4,
    stats: [6, 7, 8, 6],
    topSpeed: 240,
    acceleration: 4.9,
    massKg: 1280,
    powerKw: 255,
    color: "#8dd8f7",
    sound: "boxer",
    length: 4.05,
    roof: 1.48,
  },
  {
    id: "solace",
    shape: {
      noseLength: 0.24,
      cabinStart: 0.23,
      cabinEnd: 0.82,
      roofHeight: 1.24,
      beltLine: 0.79,
      rearDeck: 0.73,
      hipWidth: 0.96,
      fenderFlare: 0.025,
      frontOverhang: 0.85,
      rearOverhang: 0.88,
      spoilerLip: 0.025,
    },
    name: "Solace EV",
    type: "ELECTRIC SPORT",
    drive: "AWD",
    price: 42000,
    level: 6,
    stats: [7, 9, 6, 3],
    topSpeed: 270,
    acceleration: 3.6,
    massKg: 1840,
    powerKw: 410,
    color: "#d8e3ea",
    sound: "ev",
    length: 4.7,
    roof: 1.24,
  },
  {
    id: "dunerat",
    shape: {
      noseLength: 0.2,
      cabinStart: 0.25,
      cabinEnd: 0.78,
      roofHeight: 1.55,
      beltLine: 0.75,
      rearDeck: 0.7,
      hipWidth: 0.84,
      fenderFlare: 0.22,
      frontOverhang: 0.55,
      rearOverhang: 0.55,
      spoilerLip: 0.02,
    },
    name: "Dune Rat",
    type: "OFFROAD BUGGY",
    drive: "AWD",
    price: 35000,
    level: 5,
    stats: [5, 7, 6, 8],
    topSpeed: 215,
    acceleration: 5,
    massKg: 1020,
    powerKw: 225,
    color: "#fbd36b",
    sound: "boxer",
    length: 3.85,
    roof: 1.55,
  },
  {
    id: "aurora",
    shape: {
      noseLength: 0.19,
      cabinStart: 0.19,
      cabinEnd: 0.66,
      roofHeight: 1.02,
      beltLine: 0.64,
      rearDeck: 0.69,
      hipWidth: 1.04,
      fenderFlare: 0.1,
      frontOverhang: 1,
      rearOverhang: 0.94,
      spoilerLip: 0.12,
    },
    name: "Aurora V12",
    type: "EXOTIC SUPERCAR",
    drive: "RWD",
    price: 90000,
    level: 9,
    stats: [9, 8, 8, 6],
    topSpeed: 325,
    acceleration: 3.2,
    massKg: 1380,
    powerKw: 520,
    color: "#fa756e",
    sound: "v12",
    length: 4.6,
    roof: 1.02,
  },
  {
    id: "phantom",
    shape: {
      noseLength: 0.22,
      cabinStart: 0.22,
      cabinEnd: 0.72,
      roofHeight: 1,
      beltLine: 0.61,
      rearDeck: 0.66,
      hipWidth: 1.08,
      fenderFlare: 0.12,
      frontOverhang: 1,
      rearOverhang: 1,
      spoilerLip: 0.16,
    },
    name: "Phantom X",
    type: "APEX HYPERCAR",
    drive: "AWD",
    price: 200000,
    level: 14,
    stats: [10, 10, 9, 5],
    topSpeed: 365,
    acceleration: 2.5,
    massKg: 1450,
    powerKw: 720,
    color: "#a8eff0",
    sound: "v12",
    length: 4.75,
    roof: 1,
  },
];
export const carById = (id: string) => CARS.find((c) => c.id === id) ?? CARS[0];
export const UPGRADES: { id: Upgrade; name: string; detail: string }[] = [
  { id: "engine", name: "Engine", detail: "More power. More possibilities." },
  { id: "turbo", name: "Turbo", detail: "Build boost. Leave them behind." },
  { id: "tires", name: "Tires", detail: "Find grip at the limit." },
  {
    id: "suspension",
    name: "Suspension",
    detail: "Sharper lines through every corner.",
  },
  { id: "nitro", name: "Nitro", detail: "A little more afterburn." },
  {
    id: "weight",
    name: "Weight reduction",
    detail: "Less weight. Quicker reactions.",
  },
];
export const UPGRADE_COSTS = [1000, 2500, 5000, 9000, 15000];
export const PALETTE = [
  "#bded74",
  "#e75d6d",
  "#e9e4d9",
  "#9bbdf1",
  "#bb9bf0",
  "#f0b971",
  "#252b35",
  "#4adcc6",
];
export const FINISHES = ["gloss", "metallic", "matte", "pearl", "chrome"];
export const BASE_PI: Record<string, number> = {
  kestrel: 285,
  vanta: 388,
  brutus: 445,
  ronin: 455,
  solace: 540,
  dunerat: 410,
  aurora: 675,
  phantom: 880,
};
export const PI = (c: CarSpec, u: Record<Upgrade, number>) =>
  Math.min(
    999,
    Math.round(
      (BASE_PI[c.id] ?? 285) + Object.values(u).reduce((a, b) => a + b, 0) * 12,
    ),
  );
export const carClass = (pi: number) =>
  pi < 350 ? "D" : pi < 450 ? "C" : pi < 550 ? "B" : pi < 700 ? "A" : "S";
