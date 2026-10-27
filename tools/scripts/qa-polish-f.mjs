import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true,channel:'chrome'}),report=[];
try {
 for(const [width,height] of [[1920,1080],[1366,768],[1280,720],[390,844]]) {
  const p=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  await p.goto(process.env.VELOX_URL??'http://127.0.0.1:5174'); await p.waitForFunction(()=>window.__velox);
  await p.evaluate(()=>window.__velox.machine.go('prerace')); await p.waitForFunction(()=>window.__velox.machine.current==='race');
  await p.evaluate(()=>{const g=window.__velox;g.loop.stop();g.race.finish(true)}); await p.waitForFunction(()=>window.__velox.machine.current==='results');await p.waitForTimeout(2600);
  const r=await p.evaluate(()=>{
   const g=window.__velox;const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();
   document.querySelectorAll('.results-page,.result-card').forEach(n=>n.scrollTop=9999);
   g.machine.go('menu');g.machine.go('results');g.renderer.render(1);
   const cs=getComputedStyle(document.querySelector('.result-stars'));
   return {header:rect('.result-heading'),position:rect('.result-position'),action:rect('.result-actions .primary'),scroll:[...document.querySelectorAll('.results-page,.result-card')].map(n=>n.scrollTop),focus:document.activeElement.dataset.action,starsGap:cs.marginTop,notes:[...document.querySelectorAll('.projected-note')].map(n=>getComputedStyle(n).padding),names:[...document.querySelectorAll('.standing-row .who b')].map(n=>({nowrap:getComputedStyle(n).whiteSpace,ellipsis:getComputedStyle(n).textOverflow}))};
  });
  assert.ok(r.header.height<=110.1);assert.ok(r.position.height<=96.1);
  assert.ok(r.scroll.every(x=>x===0));assert.equal(r.focus,'garage');assert.equal(r.starsGap,'16px');assert.ok(r.names.every(n=>n.nowrap==='nowrap'&&n.ellipsis==='ellipsis'));
  if(width>=1280) assert.ok(r.action.y>=64&&r.action.bottom<=height-56,JSON.stringify(r.action));
  assert.ok(r.notes.every(n=>n==='8px'));report.push({width,height,...r});
  await p.waitForTimeout(2600);
  await p.screenshot({path:`test-results/after/F/F-final-p-results-${width}x${height}.png`});
  await p.evaluate(()=>{document.querySelectorAll('.result-card').forEach(n=>n.scrollTop=n.scrollHeight);document.querySelector('.results-page').scrollTop=9999});
  await p.waitForTimeout(100);
  await p.screenshot({path:`test-results/after/F/F-final-p-payoff-${width}x${height}.png`});
  await p.close();
 }
 fs.writeFileSync('test-results/v06-F.json',JSON.stringify(report,null,2));console.log('F1–F3 results entry, header/action bounds, names and XP spacing passed');
} finally {await browser.close()}

