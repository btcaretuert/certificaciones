import { chromium } from '/srv/personales/trabajos/github_pages_certificaciones/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
const b=await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx=b.contexts()[0];
let page=ctx.pages().find(p=>p.url().includes('udemy.com'));
if(!page){ page=await ctx.newPage(); await page.goto('https://www.udemy.com/home/my-courses/learning/',{waitUntil:'domcontentloaded',timeout:90000}); await page.waitForTimeout(4000); }
const all=await page.evaluate(async ()=>{
  const F='fields[certificate]=code,completion_date,long_url,course&fields[course]=@min,title,content_info';
  const res={};
  for(const ep of ['/api-2.0/users/me/certificates/','/api-2.0/users/me/subscribed-courses/']){
    const out=[]; let url=`${ep}?page_size=100&${ep.includes('certificates')?F:'fields[course]=@min,title,completion_ratio,content_info'}`;
    let guard=0;
    while(url && guard++<12){
      const r=await fetch(url,{headers:{'accept':'application/json'},credentials:'include'});
      if(!r.ok){ out.push({_error:r.status}); break; }
      const j=await r.json();
      out.push(...(j.results||[]));
      url=j.next?j.next.replace(/^https?:\/\/[^/]+/,''):null;
      await new Promise(s=>setTimeout(s,500));
    }
    res[ep]=out;
  }
  return res;
});
fs.writeFileSync('udemy_mine.json',JSON.stringify(all,null,1));
for(const [k,v] of Object.entries(all)) console.log(k,'->',v.length, v[0]&&v[0]._error?('ERROR '+v[0]._error):'');
const certs=all['/api-2.0/users/me/certificates/'].filter(x=>x.code);
console.log('\ncertificados en la cuenta:',certs.length);
for(const c of certs) console.log('  ',c.code,'|',(c.course&&c.course.title||'?').slice(0,52));
await b.close();
