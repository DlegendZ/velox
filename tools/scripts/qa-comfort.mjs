import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const b=await chromium.launch({headless:true,channel:'chrome'}),report=[];
try{
for(const [width,height] of [[1920,1080],[1366,768],[390,844]]){
 const p=await b.newPage({viewport:{width,height},reducedMotion:'reduce'});await p.goto(process.env.VELOX_URL??'http://127.0.0.1:5174');await p.waitForFunction(()=>window.__velox);await p.evaluate(()=>{const g=window.__velox;g.loop.stop();g.renderer.setQuality('low')});
 for(const state of ['menu','tracks','career','garage','garage:dealer','garage:performance','garage:visual','profile','settings:controls','settings:audio','lobby:host','pause','results']){
  if(state==='pause'){await p.evaluate(()=>{const g=window.__velox;g.net?.close();g.net=null;g.machine.go('prerace')});await p.waitForFunction(()=>window.__velox.machine.current==='race')}
  await p.evaluate(state=>{const g=window.__velox,[name,tab]=state.split(':');if(tab&&name==='garage')g.garageTab=tab;if(tab&&name==='settings')g.settingsTab=tab;if(name==='results'){g.race.finish(true);return}g.machine.go(name);if(state==='lobby:host')g.click('net-host',document.body)},state);await p.waitForTimeout(state==='results'?2300:100);
  const ports=await p.evaluate(async()=>{
   const g=window.__velox;document.querySelectorAll('[data-scroll-key]').forEach(n=>{n.scrollTop=Math.min(75,n.scrollHeight-n.clientHeight);n.scrollLeft=Math.min(232,n.scrollWidth-n.clientWidth)});await new Promise(r=>setTimeout(r,150));
   const before=[...document.querySelectorAll('[data-scroll-key]')].map(n=>({key:n.dataset.scrollKey,top:n.scrollTop,left:n.scrollLeft,moreY:n.scrollHeight>n.clientHeight+1,moreX:n.scrollWidth>n.clientWidth+1,mask:getComputedStyle(n).maskImage,start:n.style.getPropertyValue('--scroll-before'),end:n.style.getPropertyValue('--scroll-after')}));
   g.screen();await new Promise(r=>setTimeout(r,150));
   return before.map(n=>{const after=document.querySelector(`[data-scroll-key="${CSS.escape(n.key)}"]`);return {...n,after:after?{top:after.scrollTop,left:after.scrollLeft}:null}});
  });
  for(const port of ports){assert.ok(port.after,`${state} ${port.key}`);assert.ok(Math.abs(port.top-port.after.top)<=1&&Math.abs(port.left-port.after.left)<=1,JSON.stringify({width,state,port}));assert.ok(port.mask.includes('linear-gradient'));if(port.moreY||port.moreX)assert.ok(port.start==='24px'||port.end==='24px',JSON.stringify(port));}
  const controls=await p.evaluate(()=>({icons:[...document.querySelectorAll('button')].filter(n=>n.querySelector('svg')&&!n.textContent.trim()).map(n=>({action:n.dataset.action,label:n.getAttribute('aria-label'),title:n.title})),disabled:[...document.querySelectorAll('button:disabled')].map(n=>n.title),checks:[...document.querySelectorAll('input[type=checkbox]')].map(n=>({appearance:getComputedStyle(n).appearance,height:n.getBoundingClientRect().height})),ranges:[...document.querySelectorAll('input[type=range]')].map(n=>n.style.getPropertyValue('--range-fill'))}));
  assert.ok(controls.icons.every(n=>n.label&&n.title));assert.ok(controls.disabled.every(Boolean));assert.ok(controls.checks.every(n=>n.appearance==='none'&&n.height>=44));assert.ok(controls.ranges.every(n=>/%$/.test(n)));
  report.push({width,height,state,ports,controls});
 }
 await p.close();
}
fs.writeFileSync('test-results/v06-I-comfort.json',JSON.stringify(report,null,2));console.log('I4/I5/I6/I7: all nested scrollports retained positions/edge fades, disabled reasons, styled toggles/ranges and icon labels passed');
}finally{await b.close()}
