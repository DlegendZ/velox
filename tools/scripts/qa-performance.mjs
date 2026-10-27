import {chromium} from 'playwright';
import fs from 'node:fs';
const ready='test-results/v06-performance-ready';
const b=await chromium.launch({headless:true,channel:'chrome',args:['--window-size=1920,1080']});
const p=await b.newPage({viewport:{width:1366,height:768}}),actions=[];
try{
await p.goto(process.env.VELOX_URL??'http://127.0.0.1:5174');await p.waitForFunction(()=>window.__velox);await p.evaluate(()=>{document.title='VELOX — UI performance audit';window.__velox.renderer.setQuality('low')});
console.log('CDP fallback after Computer Use stopped; native Performance panel unverified');
while(!fs.existsSync(ready))await new Promise(r=>setTimeout(r,500));
await p.evaluate(()=>window.__velox.machine.go('title'));
await p.evaluate(()=>{
 window.__qaLongTasks=[];window.__qaClicks=[];
 new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.duration>100)window.__qaLongTasks.push({start:e.startTime,duration:e.duration,name:e.name})}).observe({type:'longtask',buffered:false});
 addEventListener('click',e=>{const start=performance.now(),action=e.target.closest('[data-action]')?.dataset.action;requestAnimationFrame(()=>window.__qaClicks.push({action,start,nextFrame:performance.now()-start,loadingPaint:!!document.querySelector('.loading-screen')}))},true);
});
await b.startTracing(p,{path:'test-results/v06-performance-trace.json',screenshots:false,categories:['devtools.timeline','v8.execute','blink.user_timing','disabled-by-default-devtools.timeline']});
const click=async(action,wait=350)=>{
 const start=await p.evaluate(()=>performance.now());await p.locator(`[data-action="${action}"]`).first().click();await p.waitForTimeout(wait);actions.push({action,start,end:await p.evaluate(()=>performance.now()),state:await p.evaluate(()=>window.__velox.machine.current)});console.log('action',action);
};
await click('enter');await click('career');await click('back');await click('garage');
for(const tab of ['dealer','performance','visual','collection'])await click('tab-'+tab);
await click('tab-dealer');await click('preview-vanta');await click('back');
await click('modes');await click('mode-time');await click('mode-drift');await click('mode-race');await click('track-next');await click('back');
await click('profile');await click('back');await click('settings');for(const tab of ['controls','graphics','audio','online','gameplay'])await click('settings-tab-'+tab);await click('back');
await click('lobby');await click('net-host');await click('net-leave');await click('back');
await click('modes');await click('start',100);await p.waitForFunction(()=>window.__velox.machine.current==='race',{timeout:60000});await p.waitForTimeout(4000);
await click('pause');await click('photo');await click('photo-back');await click('settings');await click('back');await click('resume');
await p.evaluate(()=>window.__velox.race.finish(true));await p.waitForFunction(()=>window.__velox.machine.current==='results');await p.waitForTimeout(600);
await click('replay');await click('results');await click('garage');
await p.waitForTimeout(300);
const metrics=await p.evaluate(()=>({longTasks:window.__qaLongTasks,clicks:window.__qaClicks}));
for(const task of metrics.longTasks)task.action=actions.find(a=>task.start>=a.start&&task.start<=a.end)?.action??'race loading / render';
await b.stopTracing();fs.writeFileSync('test-results/v06-performance.json',JSON.stringify({actions,...metrics},null,2));console.log(JSON.stringify({actions:actions.length,longTasks:metrics.longTasks,maxNextFrame:Math.max(...metrics.clicks.map(c=>c.nextFrame)),loadingPaint:metrics.clicks.filter(c=>c.action==='start')},null,2));
}finally{await b.close()}
