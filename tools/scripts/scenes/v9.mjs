// 0.8.1 review: tunnels without street lamps, restart camera.
const race = (track) => `g.disposeRace?.(); Object.assign(g.config,{mode:"race",track:"${track}",weather:"clear",laps:2,eventId:undefined,rivals:3,reverse:false}); g.machine.go("prerace"); for (let i=0;i<160 && (g.machine.current!=="race"); i++) await sleep(250); await sleep(500);`;
const at = (t) => `const r=g.race; const p=r.track.at(${t}); p.point.y += 0.6; r.player.reset(p.point, p.yaw); r.countdown=0; g.camera.mode=0; g.camera.reset(); await sleep(1200);`;
export default [
  ["v9-neon-tunnel", race("neon_gp") + at(0.74), 1200],
  ["v9-neon-portal", at(0.68), 1200],
  ["v9-harbour-tunnel", race("neon_a") + at(0.62), 1200],
  ["v9-restart", `g.click("restart", document.body); for (let i=0;i<160 && (g.machine.current!=="race"); i++) await sleep(250); await sleep(400);`, 300],
];
