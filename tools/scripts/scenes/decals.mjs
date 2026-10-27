const spots = [
  ["neon_gp", 0],
  ["coast_gp", 0],
  ["canyon_gp", 0],
  ["neon_gp", 0.12],
  ["neon_gp", 0.55],
  ["coast_gp", 0.25],
  ["canyon_gp", 0.38],
  ["neon_gp", 0.54],
];
export default spots.map(([track, t]) => [
  `v05-2-decals-${track}-${t}`,
  `
g.disposeRace();document.getElementById("app").style.opacity="1";Object.assign(g.config,{track:"${track}",mode:"race",rivals:0,laps:2,weather:"clear",reverse:false,eventId:undefined});g.machine.go("prerace");while(g.machine.current!=="race")await sleep(100);g.loop.stop();g.renderer.setQuality("medium");
const r=g.race,p=r.track.at(${t});p.point.y+=.66;r.player.reset(p.point,p.yaw);r.countdown=0;g.camera.mode=0;g.camera.reset();g.render(1/60,1);document.getElementById("app").style.opacity="0";for(let i=0;i<4;i++)g.renderer.render(1/60);`,
  150,
]);
