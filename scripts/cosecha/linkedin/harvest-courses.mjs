/**
 * Harvests LinkedIn Learning course metadata + certificate tokens over CDP.
 * Read-only: it calls GET endpoints the app itself calls. Nothing is published.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT='harvest_courses.jsonl';
const cards=JSON.parse(fs.readFileSync('cards_dom.json','utf8'));
const courses=cards
  .map(c=>({title:c.title,dur:c.dur,thumb:c.thumb,link:(c.links||[]).find(h=>/^\/learning\/[a-z0-9-]+$/i.test(h))}))
  .filter(c=>c.link)
  .map(c=>({...c,slug:c.link.replace('/learning/','')}));
console.log('cursos a cosechar:',courses.length);
const done=new Set(fs.existsSync(OUT)?fs.readFileSync(OUT,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l).slug):[]);
const todo=courses.filter(c=>!done.has(c.slug));
console.log('pendientes:',todo.length);

const b=await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx=b.contexts()[0];
const page=await ctx.newPage();
await page.goto('https://www.linkedin.com/learning/',{waitUntil:'domcontentloaded',timeout:90000});
await new Promise(r=>setTimeout(r,2500));

const CHUNK=10;
for(let i=0;i<todo.length;i+=CHUNK){
  const slice=todo.slice(i,i+CHUNK);
  const res=await page.evaluate(async (items)=>{
    const csrf=(document.cookie.match(/JSESSIONID="?([^";]+)/)||[])[1];
    const H={'accept':'application/json','csrf-token':csrf,'x-restli-protocol-version':'2.0.0'};
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const j=async(u)=>{ const ac=new AbortController(); const t=setTimeout(()=>ac.abort(),20000);
      try{ const r=await fetch(u,{headers:H,credentials:'include',signal:ac.signal}); const txt=await r.text();
        try{ return {s:r.status,j:JSON.parse(txt)}; }catch{ return {s:r.status,raw:txt.slice(0,300)}; } }
      catch(e){ return {s:-1,err:e.name}; } finally{ clearTimeout(t); } };
    const out=[];
    for(const it of items){
      const rec={slug:it.slug,title:it.title,dur:it.dur,thumb:it.thumb,err:null};
      const c=await j('/learning-api/courses?q=slug&slug='+encodeURIComponent(it.slug));
      if(c.s===200 && c.j?.elements?.[0]){
        const e=c.j.elements[0];
        rec.course={
          title:e.title, localTitle:e.primaryLocaleTitle, slug:e.slug,
          entityUrn:e.entityUrn, trackingUrn:e.trackingUrn,
          difficulty:e.difficultyLevel, durationSec:e.duration?.duration,
          videos:e.videosCount, assessments:e.assessmentsCount,
          activatedAt:e.activatedAt, deprecatedAt:e.deprecatedAt, lifecycle:e.lifecycle,
          visibility:e.visibility, locale:e.primaryLocale,
          skills:e.skills||[], authors:e.authors||[],
          shortDesc:e.shortDescription?.text||e.shortDescriptionV2?.text||null,
          desc:(e.description?.text||e.descriptionV2?.text||'').slice(0,900)||null,
          objectives:(e.objectives||[]).map(o=>o?.text||o).slice(0,12),
          credentialing:(e.credentialingPrograms||[]).map(p=>({v:p.metricValue,d:(p.description||'').slice(0,140)})),
          parents:(e.parentV2Unions||[]).slice(0,20),
        };
      } else { rec.err='courses '+c.s; }
      await sleep(250);
      const urn=rec.course?.trackingUrn;
      if(urn){
        const st=await j('/learning-api/contentCertificateStatus/'+encodeURIComponent(urn));
        if(st.s===200 && st.j?.certificates){
          rec.certs=st.j.certificates.map(x=>({
            program:x.credentialingProgram, name:x.name,
            shareId:x.shareId, shareUrl:x.shareUrl,
            enabled:x.publicShareEnabled, earned:x.earned, urn:x.urn,
          }));
        } else rec.err=(rec.err||'')+' certStatus '+st.s;
      }
      out.push(rec);
      await sleep(400);
    }
    return out;
  },slice);
  fs.appendFileSync(OUT,res.map(x=>JSON.stringify(x)).join('\n')+'\n');
  const ok=res.filter(r=>r.certs?.length).length;
  console.log(`  ${String(i+slice.length).padStart(3)}/${todo.length}  con token: ${ok}/${slice.length}  ultimo: ${String(res.at(-1).title).slice(0,42)}`);
}
await page.close();
await b.close();
console.log('listo');
