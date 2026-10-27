import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true,channel:'chrome'}),report=[];
try {
 for(const [width,height] of [[1920,1080],[1366,768],[1280,720],[1099,768],[799,768],[390,844]]) {
  const p=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  await p.goto(process.env.VELOX_URL??'http://127.0.0.1:5174');
  await p.waitForFunction(()=>window.__velox);
  await p.evaluate(()=>{const g=window.__velox;g.machine.go('prerace')});
  await p.waitForFunction(()=>window.__velox.machine.current==='race');
  const r=await p.evaluate(()=>{
   const g=window.__velox;g.loop.stop();g.machine.go('pause');
   const style=s=>getComputedStyle(document.querySelector(s)), rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();
   const order=g.race.standings(),mine=order.find(s=>s.kind==='player');
   const gaps=order.map(s=>s.out?'OUT':s.time!==null&&!s.estimated?'FIN':s.kind==='player'?'':`${s.progress>mine.progress?'+':'−'}${Math.round(Math.abs(s.progress-mine.progress)*g.race.track.length/12)} m`);
   return {padding:style('.pause-panel').padding,gap:style('.pause-layout').gap,cols:style('.pause-layout').gridTemplateColumns,map:style('.pause-map').display,standings:style('.pause-status').display,panel:rect('.pause-panel'),title:rect('.pause-panel h1'),actual:[...document.querySelectorAll('.pause-status .standing-row>strong')].map(n=>n.textContent),gaps};
  });
  assert.equal(r.padding,'28px'); assert.equal(r.gap,'24px');
  assert.equal(r.map==='none',width<1100); assert.equal(r.standings==='none',width<800);
  assert.ok(r.title.x>=r.panel.x+27&&r.title.right<=r.panel.right-27);
  assert.deepEqual(r.actual,r.gaps); assert.ok(r.actual.every(s=>!s.includes('RACING')));
  report.push({width,height,...r}); await p.close();
 }
 fs.writeFileSync('test-results/v06-E.json',JSON.stringify(report,null,2));console.log('E1–E3 pause padding, responsive columns and matching HUD gaps passed');
} finally {await browser.close()}
