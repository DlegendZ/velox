// Full UI walk-through used for visual polish reviews.
const race = `Object.assign(g.config,{mode:"race",track:"neon_gp",weather:"clear",laps:2,eventId:undefined,rivals:5,reverse:false}); g.machine.go("prerace"); for (let i=0;i<120 && g.machine.current!=="race"; i++) await sleep(250); await sleep(3800); g.input.keys.add("KeyW"); await sleep(3500); g.input.keys.delete("KeyW");`;
export default [
  ["p-title", ``, 2200],
  ["p-menu", `g.machine.go("menu")`, 1500],
  ["p-setup", `g.machine.go("tracks")`, 1400],
  ["p-career", `g.machine.go("career")`, 1200],
  ["p-garage", `g.machine.go("garage")`, 1800],
  ["p-garage-dealer", `document.querySelector('[data-action="tab-dealer"]')?.click()`, 1200],
  ["p-garage-perf", `document.querySelector('[data-action="tab-performance"]')?.click()`, 1200],
  ["p-garage-custom", `document.querySelector('[data-action="tab-visual"]')?.click()`, 1400],
  ["p-lobby", `g.machine.go("lobby")`, 1200],
  ["p-profile", `g.machine.go("profile")`, 1200],
  ["p-settings", `g.machine.go("settings")`, 1200],
  ["p-race", race, 200],
  ["p-pause", `g.machine.go("pause")`, 900],
  ["p-results", `g.machine.go("race"); await sleep(300); g.race.finish(true)`, 2600],
];
