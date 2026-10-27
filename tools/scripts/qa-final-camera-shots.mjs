import {chromium} from 'playwright';
const b=await chromium.launch({headless:true,channel:'chrome'});
try{const p=await b.newPage({reducedMotion:'reduce'});await p.goto('http://127.0.0.1:5174');await p.waitForFunction(()=>window.__velox);await p.evaluate(()=>{const g=window.__velox;g.loop.stop();g.renderer.setQuality('low');g.garageTab='performance';g.machine.go('garage')});
for(const [width,height] of [[1920,1080],[1366,768],[1280,720],[390,844]]){await p.setViewportSize({width,height});await p.waitForTimeout(150);await p.evaluate(()=>{const g=window.__velox;g.screen();g.renderer.render(1)});await p.waitForTimeout(200);await p.evaluate(()=>window.__velox.renderer.render(1/60));await p.screenshot({path:`test-results/after/p-garage-perf-${width}x${height}.png`})}}
finally{await b.close()}
