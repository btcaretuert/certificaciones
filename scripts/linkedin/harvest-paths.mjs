import { chromium } from '/srv/personales/trabajos/github_pages_certificaciones/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
const OUT='harvest_paths.jsonl';
const cards=JSON.parse(fs.readFileSync('cards_dom.json','utf8'));
const paths=cards.map(c=>({title:c.title,dur:c.dur,thumb:c.thumb,link:(c.links||[]).find(h=>/^\/learning\/paths\//.test(h))}))
  .filter(c=>c.link).map(c=>({...c,slug:c.link.replace('/learning/paths/','')}));
console.log('itinerarios:',paths.length);
const done=new Set(fs.existsSync(OUT)?fs.readFileSync(OUT,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l).slug):[]);
const todo=paths.filter(p=>!done.has(p.slug));
console.log('pendientes:',todo.length);
const b=await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx=b.contexts()[0];
const page=await ctx.newPage();
await page.goto('https://www.linkedin.com/learning/',{waitUntil:'domcontentloaded',timeout:90000});
await new Promise(r=>setTimeout(r,2000));
for(let i=0;i<todo.length;i+=5){
  const slice=todo.slice(i,i+5);
  const res=await page.evaluate(async (items)=>{
    const csrf=(document.cookie.match(/JSESSIONID="?([^";]+)/)||[])[1];
    const H={'accept':'application/json','csrf-token':csrf,'x-restli-protocol-version':'2.0.0'};
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out=[];
    for(const it of items){
      const rec={slug:it.slug,title:it.title,dur:it.dur,thumb:it.thumb,err:null};
      try{
        const r=await fetch('/learning-api/paths?q=slug&slug='+encodeURIComponent(it.slug),{headers:H,credentials:'include'});
        const j=await r.json(); const e=j.elements?.[0];
        if(e) rec.path={
          title:e.title, slug:e.slug, entityUrn:e.entityUrn, trackingUrn:e.trackingUrn,
          difficulty:e.difficultyLevel, durationSec:e.duration?.duration,
          totalContents:e.totalContents, canDownloadCertificate:e.canDownloadCertificate,
          updatedAt:e.updatedAt, visibility:e.visibility, lifecycle:e.lifecycle,
          skills:e.skills||[], authors:e.authors||[], tagline:e.tagline,
          outcomes:(e.formattedLearningOutcomes||[]).map(o=>o.text).slice(0,10),
          desc:(e.descriptionV2?.text||e.descriptionV3?.text||'').slice(0,700)||null,
        };
        else rec.err='paths '+r.status;
      }catch(e){ rec.err=e.name; }
      await sleep(2500);
      // hex urn from the SSR page
      try{
        const r2=await fetch('/learning/paths/'+it.slug,{credentials:'include'});
        const h=await r2.text();
        rec.hexUrn=(h.match(/urn:li:lyndaLearningPath:[0-9a-f]{24}/)||[])[0]||null;
        rec.htmlStatus=r2.status;
      }catch(e){ rec.hexErr=e.name; }
      out.push(rec);
      await sleep(3500);
    }
    return out;
  },slice);
  fs.appendFileSync(OUT,res.map(x=>JSON.stringify(x)).join('\n')+'\n');
  console.log(`  ${i+slice.length}/${todo.length}  hex: ${res.filter(r=>r.hexUrn).length}/${slice.length}  ${String(res.at(-1).title).slice(0,40)}`);
}
await page.close(); await b.close();
console.log('listo');
