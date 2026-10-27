const race = (track, weather = "clear") => `g.disposeRace(); Object.assign(g.config,{mode:"race",track:"${track}",weather:"${weather}",laps:2,eventId:undefined,rivals:0,reverse:false}); g.machine.go("prerace"); for (let i=0;i<120 && (g.machine.current!=="race"); i++) await sleep(250); await sleep(500);`;
const at = (t, cam = 0) => `const r=g.race; const p=r.track.at(${t}); p.point.y += 0.6; r.player.reset(p.point, p.yaw); r.countdown=0; g.camera.mode=${cam}; g.camera.reset(); await sleep(900);`;
const list = (process.env.SPOTS ?? "canyon_gp:0.38,coast_gp:0.25,coast_gp:0.64,neon_gp:0.55,neon_gp:0.76").split(",");
let last = "";
export default list.map((spot) => {
  const [track, t] = spot.split(":");
  const code = (track !== last ? race(track) : "") + at(t);
  last = track;
  return [`m-${track}-${t}`, code, 600];
});
