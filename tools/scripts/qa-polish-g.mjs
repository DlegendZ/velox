import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true,channel:'chrome'}),report=[];
try {
 for(const [width,height] of [[1920,1080],[1366,768],[1280,720],[390,844]]) {
  const p=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  await p.goto(process.env.VELOX_URL??'http://127.0.0.1:5174');await p.waitForFunction(()=>window.__velox);
  await p.evaluate(()=>{const g=window.__velox;g.loop.stop();g.machine.go('menu');g.renderer.render(1)});await p.waitForTimeout(300);
  const r=await p.evaluate(async()=>{
   const g=window.__velox,{carBounds,boxCorners}=await import('/src/render/CarFraming.ts');g.renderer.camera.updateMatrixWorld(true);
   const pts=boxCorners(carBounds(g.renderer.stageCar.root)).map(v=>v.project(g.renderer.camera)).map(v=>({x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2}));
   const box={left:Math.min(...pts.map(v=>v.x)),right:Math.max(...pts.map(v=>v.x)),top:Math.min(...pts.map(v=>v.y)),bottom:Math.max(...pts.map(v=>v.y))};
   return {box,centre:(box.left+box.right)/2/innerWidth,ride:document.querySelector('.your-ride').getBoundingClientRect().toJSON(),daily:document.querySelector('.daily-ticket').getBoundingClientRect().toJSON(),gap:getComputedStyle(document.querySelector('.ride-ticket')).gap,numbers:getComputedStyle(document.querySelector('.home-entry'),'::before').content};
  });
  if(width>=1280){assert.ok(r.centre>=.55&&r.centre<=.65,JSON.stringify(r));assert.ok(r.box.right<r.ride.left&&r.box.right<r.daily.left,JSON.stringify(r));assert.ok(r.daily.bottom<=height-56);assert.equal(r.gap,'16px');}
  report.push({width,height,...r});await p.close();
 }
 fs.writeFileSync('test-results/v06-G.json',JSON.stringify(report,null,2));console.log('G1–G2 home car framing, cards above footer and numbered entries passed');
}finally{await browser.close()}
