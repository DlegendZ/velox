export default [
  ["u-title", ``, 2500],
  ["u-menu", `g.machine.go("menu"); await sleep(300); document.querySelector(".home-entry")?.focus()`, 1500],
  ["u-setup", `g.machine.go("tracks")`, 1400],
  ["u-garage", `g.machine.go("garage")`, 1800],
  ["u-settings", `g.machine.go("settings")`, 1200],
  ["u-race", `Object.assign(g.config,{mode:"race",track:"neon_gp",weather:"clear",laps:2,eventId:undefined,rivals:5,reverse:false}); g.machine.go("prerace"); for (let i=0;i<120 && g.machine.current!=="race"; i++) await sleep(250); await sleep(3600); g.input.keys.add("KeyW"); await sleep(3500);`, 200],
  ["u-pause", `g.machine.go("pause")`, 1000],
];
