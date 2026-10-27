export default [0, 40, 150, 300].map((speed, i) => [
  `v05-4-speed-${speed}`,
  `
${i === 0 ? `g.disposeRace();Object.assign(g.config,{track:"neon_gp",mode:"race",rivals:5,laps:2,weather:"clear",reverse:false,eventId:undefined});g.machine.go("prerace");while(g.machine.current!=="race")await sleep(100);g.loop.stop();g.renderer.setQuality("medium");` : ""}
g.race.countdown=0;g.race.time=30;g.render(1/60,1);g.race.player.speed=${speed};g.race.player.rpm=${1000 + speed * 23};g.updateHUD();
const arc=document.getElementById("speed-arc"),length=arc.getTotalLength();if(Math.abs(Number(arc.getAttribute("stroke-dashoffset"))-length*(1-${speed}/360))>.01)throw Error("speed arc ratio");if(document.querySelectorAll(".speed-ticks line").length!==12)throw Error("ticks");
const ledRects=[...document.querySelectorAll(".shift-lights i")].map(e=>e.getBoundingClientRect()),matrix=arc.getScreenCTM();for(let j=0;j<=100;j++){const p=arc.getPointAtLength(length*j/100);const q=new DOMPoint(p.x,p.y).matrixTransform(matrix);if(ledRects.some(r=>q.x>=r.left-2&&q.x<=r.right+2&&q.y>=r.top-2&&q.y<=r.bottom+2))throw Error("LED overlaps arc");}
`,
  120,
]);
