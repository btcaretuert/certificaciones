import { chromium } from '/srv/personales/trabajos/github_pages_certificaciones/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
const b=await chromium.connectOverCDP('http://127.0.0.1:9333');
const page=b.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('my-library'));
const rows=await page.$$eval('li.completed-body__card',(cards)=>cards.map((c,i)=>{
  const html=c.outerHTML;
  const urns=[...new Set([...html.matchAll(/urn(?::|%3A)li(?::|%3A)([a-zA-Z]+)(?::|%3A)([\w:%.-]+?)(?=["'&,)\s]|%22)/g)].map(m=>`urn:li:${m[1]}:${decodeURIComponent(m[2])}`))];
  const links=[...new Set([...c.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>h.startsWith('/learning')))];
  const more=c.querySelector('button[aria-controls^="hue-menu"]');
  const dur=c.querySelector('.lls-card-thumbnail-label');
  const img=c.querySelector('img');
  return {
    i,
    title: more?more.innerText.replace(/^Show more options for/,'').trim():null,
    text: c.innerText.replace(/\s+/g,' ').trim().slice(0,220),
    links, urns,
    dur: dur?dur.innerText.trim():null,
    thumb: img?img.getAttribute('src'):null,
    menuId: more?more.getAttribute('aria-controls'):null,
  };
}));
fs.writeFileSync('cards_dom.json',JSON.stringify(rows,null,1));
console.log('tarjetas:',rows.length);
const withUrn=rows.filter(r=>r.urns.length);
console.log('con urn en HTML:',withUrn.length);
const tipos={}; for(const r of rows) for(const u of r.urns){const k=u.split(':')[2]; tipos[k]=(tipos[k]||0)+1;}
console.log('tipos urn:',JSON.stringify(tipos));
console.log('\n=== sin link /learning/<slug> (posibles itinerarios) ===');
const noSlug=rows.filter(r=>!r.links.some(h=>/^\/learning\/[a-z0-9-]+/.test(h)));
console.log('n =',noSlug.length);
for(const r of noSlug.slice(0,6)) console.log(JSON.stringify({t:r.title,links:r.links,urns:r.urns,dur:r.dur},null,1));
console.log('\n=== muestra con slug ===');
for(const r of rows.filter(r=>!noSlug.includes(r)).slice(0,3)) console.log(JSON.stringify({t:r.title,links:r.links,urns:r.urns},null,1));
await b.close();
