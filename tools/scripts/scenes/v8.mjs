// 0.8 track review: flat circuits, boost pads, lamp pools, tunnels and underglow.
const race = (track, weather = "clear") => `g.disposeRace?.(); Object.assign(g.config,{mode:"race",track:"${track}",weather:"${weather}",laps:2,eventId:undefined,rivals:3,reverse:false}); g.machine.go("prerace"); for (let i=0;i<160 && (g.machine.current!=="race"); i++) await sleep(250); await sleep(500);`;
const at = (t, cam = 0) => `const r=g.race; const p=r.track.at(${t}); p.point.y += 0.6; r.player.reset(p.point, p.yaw); r.countdown=0; g.camera.mode=${cam}; g.camera.reset(); await sleep(1200);`;
export default [
  ["v8-neon-start", `g.save.active.visual.underglow="#7ec8ff"; ` + race("neon_gp") + at(0.004), 1500],
  ["v8-neon-boost", at(0.112), 1200],
  ["v8-harbour", race("neon_a") + at(0.03), 1500],
  ["v8-harbour-tunnel", at(0.63), 1200],
  ["v8-coast-touge", race("coast_c") + at(0.2), 1500],
  ["v8-coast-gp", race("coast_gp") + at(0.25), 1500],
  ["v8-canyon-gp", race("canyon_gp") + at(0.45), 1500],
];
