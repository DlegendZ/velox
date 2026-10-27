import {chromium} from 'playwright';
import fs from 'node:fs';
const b=await chromium.launch({headless:true,channel:'chrome'}),report=[];
try{
for(const [width,height] of [[1920,1080],[1366,768],[390,844]]){
const p=await b.newPage({viewport:{width,height},reducedMotion:'reduce'});await p.goto(process.env.VELOX_URL??'http://127.0.0.1:5174');await p.waitForFunction(()=>window.__velox);await p.evaluate(()=>{const g=window.__velox;g.loop.stop();g.renderer.setQuality('low')});
for(const state of ['title','menu','tracks','career','garage','garage:dealer','garage:performance','garage:visual','profile','settings','settings:controls','settings:graphics','settings:audio','settings:online','lobby','lobby:host','pause','results']){
if(state==='pause'){await p.evaluate(()=>{const g=window.__velox;g.net?.close();g.net=null;g.machine.go('prerace')});await p.waitForFunction(()=>window.__velox.machine.current==='race')}
await p.evaluate(state=>{const g=window.__velox,[name,tab]=state.split(':');if(tab&&name==='garage')g.garageTab=tab;if(tab&&name==='settings')g.settingsTab=tab;if(name==='results'){g.race.finish(true);return}g.machine.go(name);if(name==='lobby'&&tab==='host')g.click('net-host',document.body);g.renderer.render(1)},state);await p.waitForTimeout(state==='results'?2600:120);
const r=await p.evaluate(async()=>{
const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(!r.width||!r.height||s.visibility==='hidden'||s.display==='none'||r.right<0||r.left>innerWidth||r.bottom<0||r.top>innerHeight)return false;for(let a=e.parentElement;a&&a.id!=='app';a=a.parentElement){const c=getComputedStyle(a),b=a.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(c.overflowX+c.overflowY)&&(r.bottom<b.top||r.top>b.bottom||r.right<b.left||r.left>b.right))return false}return true};
const nodes=[...document.querySelectorAll('#app *')].filter(visible),targets=nodes.filter(e=>e.matches('button,[data-action],input:not([type=hidden]),select')),ports=[...document.querySelectorAll('#app *')].filter(e=>/auto|scroll/.test(getComputedStyle(e).overflowX+getComputedStyle(e).overflowY));
const audit=(await import('/tools/scripts/ui-audit.js')).auditUI();
return{targets:targets.filter(e=>{const r=e.getBoundingClientRect();return r.height<43.5||(r.width<43.5&&!e.matches('input[type=text],input[type=range]'))}).map(e=>({html:e.outerHTML.slice(0,200),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),fonts:nodes.filter(e=>/Inter/.test(getComputedStyle(e).fontFamily)&&(parseFloat(getComputedStyle(e).fontSize)>=18||e.tagName==='BUTTON')).map(e=>e.outerHTML.slice(0,140)),portsMissing:ports.filter(e=>!e.dataset.scrollKey).map(e=>e.className),audit};
});report.push({width,height,state,...r});
}
await p.close();}
fs.writeFileSync('test-results/v06-I-inventory.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.filter(r=>r.targets.length||r.fonts.length||r.portsMissing.length||r.audit.nowrap.length||r.audit.textBounds.length).map(r=>({width:r.width,state:r.state,targets:r.targets,fonts:r.fonts,portsMissing:r.portsMissing,text:r.audit.textBounds,nowrap:r.audit.nowrap})),null,2));
}finally{await b.close()}
