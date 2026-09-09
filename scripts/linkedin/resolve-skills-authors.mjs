/** Resolves learningApiSkill and learningApiAuthor URNs to human names. */
import { chromium } from '/srv/personales/trabajos/github_pages_certificaciones/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
const rows=[];
for(const f of ['harvest_courses.jsonl','harvest_paths.jsonl'])
  if(fs.existsSync(f)) rows.push(...fs.readFileSync(f,'utf8').split('\n').filter(Boolean).map(JSON.parse));
const skills=[...new Set(rows.flatMap(r=>((r.course||r.path||{}).skills)||[]))];
const authors=[...new Set(rows.flatMap(r=>((r.course||r.path||{}).authors)||[]))];
console.log('skills:',skills.length,' authors:',authors.length);
const b=await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx=b.contexts()[0];
const page=await ctx.newPage();
await page.goto('https://www.linkedin.com/learning/',{waitUntil:'domcontentloaded',timeout:90000});
await new Promise(r=>setTimeout(r,2000));
const out=await page.evaluate(async ({skills,authors})=>{
  const csrf=(document.cookie.match(/JSESSIONID="?([^";]+)/)||[])[1];
  const H={'accept':'application/json','csrf-token':csrf,'x-restli-protocol-version':'2.0.0'};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const S={},A={};
  for(let i=0;i<skills.length;i+=25){
    const ids=skills.slice(i,i+25).map(encodeURIComponent).join(',');
    try{ const r=await fetch('/learning-api/skillsV2?ids=List('+ids+')',{headers:H,credentials:'include'});
      const j=await r.json();
      for(const [k,v] of Object.entries(j.results||{})) S[k]={name:v.name,growth:v.growth,tracking:v.trackingUrn};
    }catch(e){}
    await sleep(400);
  }
  for(const a of authors){
    try{ const r=await fetch('/learning-api/authors/'+encodeURIComponent(a),{headers:H,credentials:'include'});
      const j=await r.json();
      const id=j.identity||{};
      const nm=[id.firstName,id.lastName].filter(Boolean).join(' ')
        || (j.slug||'').split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ') || null;
      A[a]={name:nm, headline:j.headline?.text||null, slug:j.slug||null, expert:!!j.expert,
            bio:(j.shortBiography?.text||j.biography?.text||'').slice(0,220)||null};
    }catch(e){}
    await sleep(300);
  }
  return {S,A};
},{skills,authors});
fs.writeFileSync('dict_skills.json',JSON.stringify(out.S,null,1));
fs.writeFileSync('dict_authors.json',JSON.stringify(out.A,null,1));
console.log('skills resueltas:',Object.keys(out.S).length,'/',skills.length);
console.log('authors resueltos:',Object.keys(out.A).length,'/',authors.length);
console.log('muestra skills:',Object.values(out.S).slice(0,12).map(x=>x.name).join(' | '));
console.log('muestra authors:',Object.values(out.A).slice(0,6).map(x=>x.name).join(' | '));
await page.close(); await b.close();
