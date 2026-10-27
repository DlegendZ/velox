import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const b=await chromium.launch({headless:true,channel:'chrome'}),report=[];
fs.mkdirSync('test-results/after/H',{recursive:true});
try{
const p=await b.newPage({viewport:{width:1920,height:1080}});await p.goto(process.env.VELOX_URL??'http://127.0.0.1:5174');await p.waitForFunction(()=>window.__velox);
await p.evaluate(()=>{const g=window.__velox;g.loop.stop();g.renderer.setQuality('low');g.machine.go('prerace')});await p.waitForFunction(()=>window.__velox.machine.current==='race');
assert.equal(await p.evaluate(()=>window.__velox.save.data.settings.hintRaces),1);
for(const [width,height] of [[1920,1080],[1366,768],[1280,720],[390,844],[844,390]]){
 await p.setViewportSize({width,height});await p.evaluate(()=>{const g=window.__velox;g.screen();g.race.countdown=0;g.race.time=12;g.race.popupTime=0;g.race.player.speed=150;g.render(1,1);g.updateHUD();g.drawStandings()});await p.waitForTimeout(700);
 const r=await p.evaluate(()=>{
 const visible=n=>n&&n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>0;
 const selectors=['.race-position','.race-laps','.hud-track','.hud-pause','.standings','.speedometer','.minimap','.drag-pad','.touch-pedals','.touch-utilities','.driving-hints'];
 const boxes=selectors.map(s=>({s,n:document.querySelector(s)})).filter(x=>visible(x.n)).map(x=>({s:x.s,...x.n.getBoundingClientRect().toJSON()}));
 const overlaps=[];for(let a=0;a<boxes.length;a++)for(let c=a+1;c<boxes.length;c++){const x=boxes[a],y=boxes[c];if(x.left<y.right-1&&x.right>y.left+1&&x.top<y.bottom-1&&x.bottom>y.top+1)overlaps.push([x.s,y.s])}
 return{boxes,overlaps,rows:document.querySelectorAll('.standings li').length,track:getComputedStyle(document.querySelector('.hud-track>span')).whiteSpace,modeFont:getComputedStyle(document.querySelector('.hud-track>small')).fontSize,lapBar:getComputedStyle(document.querySelector('.lap-progress')).height,checkpoint:document.querySelector('#checkpoint-distance').textContent,hintRaces:window.__velox.save.data.settings.hintRaces};
 });
 assert.deepEqual(r.overlaps,[],`${width}x${height}`);assert.ok(r.rows<=6);if(height<500){assert.equal(r.rows,3);assert.ok(!r.boxes.some(b=>b.s==='.minimap'))}
 assert.equal(r.track,'nowrap');assert.equal(r.modeFont,'12px');assert.equal(r.lapBar,'4px');assert.match(r.checkpoint,/\d+ m TO CHECKPOINT/);
 const margin=width>=1920?40:24;assert.ok(r.boxes.every(b=>b.left>=margin-1&&b.right<=width-margin+1&&b.top>=margin-1&&b.bottom<=height-margin+1),JSON.stringify(r.boxes));
 const gears=[];
 for(const speed of width>=1280?[0,40,150,300]:[150]){
  await p.evaluate(speed=>{const g=window.__velox;g.race.player.speed=speed;g.race.player.gear=speed<40?1:speed<150?2:speed<300?4:6;g.camera.reset();g.render(1/60,1);g.updateHUD()},speed);await p.waitForTimeout(200);
  const gear=await p.evaluate(()=>{
   const gear=document.querySelector('#hud-gear').getBoundingClientRect(),path=document.querySelector('#speed-arc'),m=path.getScreenCTM(),length=path.getTotalLength();let clearance=Infinity;
   for(let i=0;i<=300;i++){const v=path.getPointAtLength(length*i/300);const q=new DOMPoint(v.x,v.y).matrixTransform(m);clearance=Math.min(clearance,Math.hypot(q.x-gear.x-gear.width/2,q.y-gear.y-gear.height/2)-Math.max(gear.width,gear.height)/2-2*Math.hypot(m.a,m.b))}
   return{speed:document.querySelector('#hud-speed').textContent,clearance};
  });assert.equal(Number(gear.speed),speed);assert.ok(gear.clearance>=8,JSON.stringify(gear));gears.push(gear);
  if(!process.env.QA_NOSHOTS) await p.screenshot({path:`test-results/after/H/H-speed-${speed}-${width}x${height}.png`});
 }
 await p.evaluate(()=>{const g=window.__velox;g.screen();g.race.countdown=3;g.race.player.speed=40;g.race.checkpoints[0].wrongWay=true;g.race.popup='AIRTIME';g.race.popupTime=3;g.renderer.render(1/60);g.updateHUD()});await p.waitForTimeout(250);await p.evaluate(()=>window.__velox.updateHUD());
 const notices=await p.evaluate(()=>[...document.querySelectorAll('.race-center>div')].filter(n=>!n.hidden).map(n=>({id:n.id,...n.getBoundingClientRect().toJSON()})));
 assert.equal(notices.length,2);assert.ok(notices.every(n=>n.top>=height*.22-1&&n.bottom<=height*.4+1),JSON.stringify(notices));assert.ok(notices[0].bottom<=notices[1].top);
 const lapBottom=await p.locator('.race-laps').evaluate(n=>n.getBoundingClientRect().bottom);assert.ok(notices[0].top>lapBottom);
 if(!process.env.QA_NOSHOTS) await p.screenshot({path:`test-results/after/H/H-notices-${width}x${height}.png`});
 await p.waitForTimeout(1900);await p.evaluate(()=>window.__velox.updateHUD());assert.equal(await p.locator('.race-center>div:not([hidden])').count(),0);
 const names=await p.evaluate(async()=>{
  const g=window.__velox,r=g.race,cam=g.renderer.camera,f=r.player.position.clone().set(0,0,1).applyQuaternion(r.player.quaternion),side=f.clone().set(f.z,0,-f.x);
  r.countdown=0;r.time=12;r.popupTime=0;r.checkpoints[0].wrongWay=false;
  cam.position.copy(r.player.position).addScaledVector(f,-9);cam.position.y+=3;cam.lookAt(r.player.position.clone().addScaledVector(f,30));cam.updateMatrixWorld(true);
  r.ai.forEach((a,i)=>a.vehicle.position.copy(r.player.position).addScaledVector(f,20+i*10).addScaledVector(side,(i%3-1)*4));
  g.updateNameplates();await new Promise(r=>setTimeout(r,250));g.updateNameplates();
  const selected=[...document.querySelectorAll('.nameplate[data-visible=true]')];
  const {carBounds,boxCorners}=await import('/src/render/CarFraming.ts');const pts=boxCorners(carBounds(r.models[0].root)).map(v=>v.project(cam));
  const box={left:Math.min(...pts.map(v=>(v.x+1)*innerWidth/2)),right:Math.max(...pts.map(v=>(v.x+1)*innerWidth/2)),top:Math.min(...pts.map(v=>(1-v.y)*innerHeight/2)),bottom:Math.max(...pts.map(v=>(1-v.y)*innerHeight/2))};
  return{total:document.querySelectorAll('.nameplate').length,visible:selected.map(n=>({distance:+n.dataset.distance,cameraDistance:+n.dataset.cameraDistance,transition:getComputedStyle(n).transitionDuration,...n.getBoundingClientRect().toJSON()})),box};
 });assert.ok(names.total<=3);assert.ok(names.visible.length>0&&names.visible.length<=3,JSON.stringify(names));assert.ok(names.visible.every(n=>n.distance<=80&&n.cameraDistance>=6&&n.transition==='0.2s'&&!(n.left<names.box.right&&n.right>names.box.left&&n.top<names.box.bottom&&n.bottom>names.box.top)),JSON.stringify(names));
 report.push({width,height,...r,gears,notices,names});
}
await p.setViewportSize({width:1920,height:1080});await p.waitForTimeout(150);await p.evaluate(()=>{const g=window.__velox;g.camera.reset();g.render(1/60,1)});
const hints=await p.evaluate(()=>{
 const g=window.__velox;g.screen();const results=[];for(const race of [1,2,3,4])for(const time of [19,20]){g.hintRace=race;g.race.time=time;g.save.data.settings.showControlHints=false;g.updateHUD();results.push({race,time,visible:!document.querySelector('#driving-hints').classList.contains('hints-hidden')})}return results;
});assert.ok(hints.every(h=>h.visible===(h.race<=3&&h.time<20)));
await p.waitForTimeout(650);if(!process.env.QA_NOSHOTS) await p.screenshot({path:'test-results/after/H/H-hints-expired-1920x1080.png'});
await p.evaluate(()=>{const g=window.__velox;g.save.data.settings.showControlHints=true;g.updateHUD()});await p.waitForTimeout(650);assert.equal(await p.locator('#driving-hints').evaluate(n=>getComputedStyle(n).opacity),'1');if(!process.env.QA_NOSHOTS) await p.screenshot({path:'test-results/after/H/H-hints-forced-1920x1080.png'});
await p.evaluate(()=>{const g=window.__velox;g.settingsTab='controls';g.machine.go('settings');g.renderer.render(1)});await p.waitForTimeout(700);assert.equal(await p.locator('#showControlHints').isChecked(),true);await p.locator('#showControlHints').uncheck();assert.equal(await p.evaluate(()=>window.__velox.save.data.settings.showControlHints),false);await p.locator('#showControlHints').check();assert.equal(await p.evaluate(()=>window.__velox.save.data.settings.showControlHints),true);if(!process.env.QA_NOSHOTS) await p.screenshot({path:'test-results/after/H/H-controls-1920x1080.png'});
fs.writeFileSync('test-results/v06-H.json',JSON.stringify({sizes:report,hints},null,2));console.log('H1–H9 passed: physical margins/no overlaps, four speeds/gear clearance, first-three-race hints, minimap, compact order, three fading nameplates and two expiring notices');
}finally{await b.close()}
