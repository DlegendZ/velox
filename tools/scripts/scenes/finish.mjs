export default ["neon_gp", "coast_gp", "canyon_gp"].map((track) => [
  `v05-1-finish-${track}`,
  `g.disposeRace(); Object.assign(g.config,{track:"${track}",mode:"race",laps:1,rivals:0,weather:"clear",reverse:false,eventId:undefined});g.machine.go("prerace");
  while(g.machine.current!=="race") await sleep(100);
  g.loop.stop();g.renderer.setQuality("medium");
  const r=g.race,s=r.track.at(0);r.onFinish=()=>{};r.countdown=0;r.time=90;
  const p=s.point.clone().addScaledVector(s.tangent,-(r.player.spec.length/2+2));p.y+=.66;r.player.reset(p,s.yaw);
  r.player.body.setLinvel(s.tangent.clone().multiplyScalar(18),true);
  r.checkpoints[0].expected=0;r.checkpoints[0].passed=11;
  for(let i=0;i<120&&!r.finished;i++)r.fixed(1/60,g.input.read(1/60));
  if(!r.finished)throw Error("finish did not trigger");
  r.render(1);g.updateHUD();g.renderer.controls.enabled=false;
  g.renderer.camera.position.copy(s.point).addScaledVector(s.normal,11).addScaledVector(s.tangent,-1);g.renderer.camera.position.y+=3.4;
  g.renderer.camera.lookAt(s.point.clone().addScaledVector(s.tangent,-1));
  document.getElementById("app").style.opacity="0";
  for(let i=0;i<4;i++)g.renderer.render(1/60);`,
  150,
]);
