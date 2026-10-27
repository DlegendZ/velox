const race = (track, weather = "clear") => `Object.assign(g.config,{mode:"race",track:"${track}",weather:"${weather}",laps:2,eventId:undefined,rivals:5,reverse:false}); g.machine.go("prerace"); for (let i=0;i<120 && (g.machine.current!=="race"); i++) await sleep(250); await sleep(500);`;
const at = (t, cam = 0) => `const r=g.race; const p=r.track.at(${t}); p.point.y += 0.6; r.player.reset(p.point, p.yaw); r.countdown=0; g.camera.mode=${cam}; g.camera.reset(); await sleep(900);`;
export default [
  ["a-garage", `g.machine.go("garage")`, 1500],
  ["a-setup", `g.machine.go("tracks")`, 1500],
  ["a-career", `g.machine.go("career")`, 1200],
  ["a-settings", `g.machine.go("settings")`, 1200],
  ["a-neon-start", race("neon_gp"), 3500],
  ["a-neon-hud", `g.race.countdown=0; g.input.keys.add("KeyW"); await sleep(4000); g.input.keys.delete("KeyW")`, 300],
  ["a-neon-30", at(0.3), 600],
  ["a-neon-55", at(0.55), 600],
  ["a-neon-75", at(0.76), 600],
  ["a-pause", `g.machine.go("pause")`, 900],
  ["a-coast-start", `g.machine.go("race"); g.disposeRace(); ` + race("coast_gp"), 3000],
  ["a-coast-25", at(0.25), 600],
  ["a-coast-64", at(0.64), 600],
  ["a-coast-80", at(0.81), 600],
  ["a-canyon-start", `g.disposeRace(); ` + race("canyon_gp"), 3000],
  ["a-canyon-38", at(0.38), 600],
  ["a-canyon-58", at(0.58), 600],
  ["a-canyon-91", at(0.915), 600],
  ["a-legacy", `g.disposeRace(); ` + race("coast_a", "rain"), 3000],
  ["a-results", `g.race.finish(true)`, 2500],
];
