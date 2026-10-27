export default ["neon_gp", "coast_gp", "canyon_gp"].flatMap((track) =>
  ["clear", "rain", "snow", "fog", "tunnel"].map((weather) => [
    `v05-3-${track}-${weather}`,
    `
g.disposeRace();Object.assign(g.config,{track:"${track}",mode:"race",rivals:0,laps:2,weather:"${weather === "tunnel" ? "fog" : weather}",reverse:false,eventId:undefined});g.machine.go("prerace");while(g.machine.current!=="race")await sleep(100);g.loop.stop();g.renderer.setQuality("medium");
const r=g.race,section=r.track.spec.sections.find(s=>s.type==="tunnel"),t=${weather === "tunnel" ? "(section.from+section.to)/2" : ".3"},p=r.track.at(t);p.point.y+=.66;r.player.reset(p.point,p.yaw);r.countdown=0;r.time=30;g.camera.reset();g.render(1/60,1);document.getElementById("app").style.opacity="0";for(let j=0;j<4;j++)g.renderer.render(1/60);`,
    80,
  ]),
);
