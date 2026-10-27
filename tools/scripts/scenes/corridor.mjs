const ids = [
  "neon_a",
  "neon_b",
  "coast_a",
  "coast_b",
  "canyon_a",
  "canyon_b",
  "neon_c",
  "coast_c",
  "canyon_c",
  "neon_gp",
  "coast_gp",
  "canyon_gp",
];
export default ids.flatMap((track) =>
  Array.from({ length: 10 }, (_, i) => [
    `${track}/${i}`,
    `
${i === 0 ? `g.disposeRace();Object.assign(g.config,{track:"${track}",mode:"race",rivals:0,laps:2,weather:"clear",reverse:false,eventId:undefined});g.machine.go("prerace");while(g.machine.current!=="race")await sleep(100);g.loop.stop();g.renderer.setQuality("medium");` : ""}
const r=g.race,p=r.track.at(${i / 10});p.point.y+=.66;r.player.reset(p.point,p.yaw);r.countdown=0;r.time=30;g.camera.mode=0;g.camera.reset();g.render(1/60,1);document.getElementById("app").style.opacity="0";for(let j=0;j<4;j++)g.renderer.render(1/60);`,
    60,
  ]),
);
