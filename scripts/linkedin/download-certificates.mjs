/**
 * Downloads every LinkedIn Learning certificate PDF from the already-open
 * learning-history tab, and records each certificate's public share token.
 *
 * It only ever clicks "Download certificate" and "Download PDF only". It never
 * touches the "Create certificate link" checkbox and never clicks "Post", so it
 * cannot publish anything: downloading was verified to leave publicShareEnabled
 * untouched.
 *
 * Resumable: progress lives in download_log.jsonl, keyed by card index.
 */
import { chromium } from '/srv/personales/trabajos/github_pages_certificaciones/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DL='/srv/personales/trabajos/github_pages_certificaciones/certs-src/_reimpresos';
const LOG='download_log.jsonl';
const FROM=parseInt(process.argv[2]||'0',10);
const TO=parseInt(process.argv[3]||'220',10);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync(DL,{recursive:true});

const done=new Set(fs.existsSync(LOG)?fs.readFileSync(LOG,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l).i):[]);

const b=await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx=b.contexts()[0];
const page=ctx.pages().find(p=>p.url().includes('my-library'));
if(!page) throw new Error('no encuentro la pestana de my-library');
const cdp=await ctx.newCDPSession(page);
await cdp.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:DL,eventsEnabled:true});
const pending=new Map();          // guid -> suggestedFilename
cdp.on('Browser.downloadWillBegin',e=>pending.set(e.guid,e.suggestedFilename||'certificado.pdf'));

/** The list degrades after ~60 modal cycles: the dropdown stops rendering its
 *  items and every download silently yields nothing. Reloading and re-expanding
 *  restores it, so the run refreshes itself on a fixed cadence. */
async function expand(){
  let prev=0, stag=0;
  for(let i=0;i<160;i++){
    const n=await page.locator('li.completed-body__card').count();
    if(n===prev){ if(++stag>=6) break; } else { stag=0; prev=n; }
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await sleep(600);
    const hit=await page.evaluate(()=>{
      const el=[...document.querySelectorAll('button,a,span[role=button]')]
        .find(x=>/^\s*(Show more|Ver más|Mostrar más)\s*$/i.test(x.innerText||''));
      if(el){ el.click(); return true; } return false;
    });
    await sleep(hit?1700:800);
  }
  return page.locator('li.completed-body__card').count();
}
async function refresh(){
  await page.goto('https://www.linkedin.com/learning/me/my-library/completed',
                  {waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForSelector('li.completed-body__card',{timeout:60000});
  const n=await expand();
  console.log(`  [pagina recargada y expandida: ${n} tarjetas]`);
  return n;
}

let total=await page.locator('li.completed-body__card').count();
if(total<220) total=await refresh();
console.log(`tarjetas en la pagina: ${total}   rango: ${FROM}..${Math.min(TO,total)}   ya hechas: ${done.size}`);

const dialogState=()=>page.evaluate(()=>{
  const d=document.querySelector('[role="dialog"]');
  if(!d) return null;
  const t=d.innerText.replace(/\s+/g,' ').trim();
  return {
    text:t.slice(0,600),
    chooser:/Select a certificate/i.test(t),
    ready:[...d.querySelectorAll('button')].some(x=>/Download PDF only/i.test(x.innerText||'')),
    token:(t.match(/learning\/certificates\/([0-9a-f]{64})/)||[])[1]||null,
    buttons:[...d.querySelectorAll('button')].map(x=>(x.innerText||'').trim()).filter(Boolean),
    checked:!!(d.querySelector('input[type=checkbox]')||{}).checked,
  };
});
const closeAll=async()=>{ for(let i=0;i<3;i++){ await page.keyboard.press('Escape').catch(()=>{}); await sleep(250);} };

/** Claims whatever finished downloading and gives it its real filename. */
function claim(suffix){
  const files=fs.readdirSync(DL);
  const out=[];
  for(const f of files){
    if(f.endsWith('.crdownload')) continue;
    if(!pending.has(f)) continue;
    let name=pending.get(f).replace(/[\/\\]/g,'-');
    if(!/\.pdf$/i.test(name)) name+='.pdf';
    if(suffix) name=name.replace(/\.pdf$/i,` ${suffix}.pdf`);
    let dest=path.join(DL,name), n=1;
    while(fs.existsSync(dest)){ dest=path.join(DL,name.replace(/\.pdf$/i,` (${++n}).pdf`)); }
    fs.renameSync(path.join(DL,f),dest);
    pending.delete(f);
    out.push(path.basename(dest));
  }
  return out;
}

let hechos=0;
for(let i=FROM;i<Math.min(TO,total);i++){
  if(done.has(i)) continue;
  if(hechos && hechos%28===0){ await closeAll(); await refresh(); }
  hechos++;
  const rec={i,title:null,token:null,checked:null,options:null,files:[],err:null};
  try{
    await closeAll();
    const card=page.locator('li.completed-body__card').nth(i);
    await card.scrollIntoViewIfNeeded().catch(()=>{});
    await sleep(300);
    const more=card.locator('button[aria-controls^="hue-menu"]').first();
    rec.title=(await more.innerText().catch(()=>'')).replace(/^Show more options for/,'').trim()||null;
    const menuId=await more.getAttribute('aria-controls');
    await more.click({force:true});
    for(let k=0;k<20;k++){ await sleep(250); if(await page.locator(`#${menuId} button`).count()) break; }
    const dl=page.locator(`#${menuId} button:has-text("Download certificate")`);
    if(!(await dl.count())){ rec.err='sin boton de descarga'; fs.appendFileSync(LOG,JSON.stringify(rec)+'\n'); console.log(`${String(i).padStart(3)} --  ${rec.title}`); continue; }
    await dl.first().click({force:true});

    let st=null;
    for(let k=0;k<45;k++){ await sleep(400); st=await dialogState(); if(st&&(st.ready||st.chooser)) break; }
    if(!st){ rec.err='modal no abrio'; fs.appendFileSync(LOG,JSON.stringify(rec)+'\n'); console.log(`${String(i).padStart(3)} !!  ${rec.title}`); continue; }

    if(st.chooser && !st.buttons.filter(x=>!/^Dismiss$/i.test(x)).length){
      for(let k=0;k<15;k++){ await sleep(500); st=await dialogState(); if(st&&(st.ready||st.buttons.filter(x=>!/^Dismiss$/i.test(x)).length)) break; }
    }
    const variants=[];
    if(st.chooser && st.buttons.filter(x=>!/^Dismiss$/i.test(x)).length){
      rec.options=st.buttons.filter(x=>!/^Dismiss$/i.test(x));
      variants.push(...rec.options);
    } else if(st.ready){ variants.push(null); }
    else { rec.err='modal sin opciones ni pantalla de descarga'; }

    for(const v of variants){
      if(v){
        // re-enter the modal for each certificate variant
        if(variants.indexOf(v)>0){
          await closeAll();
          await more.click({force:true});
          for(let k=0;k<20;k++){ await sleep(250); if(await page.locator(`#${menuId} button`).count()) break; }
          await page.locator(`#${menuId} button:has-text("Download certificate")`).first().click({force:true});
          for(let k=0;k<45;k++){ await sleep(400); st=await dialogState(); if(st&&st.chooser) break; }
        }
        await page.locator('[role="dialog"] button',{hasText:v}).first().click({force:true});
        for(let k=0;k<45;k++){ await sleep(400); st=await dialogState(); if(st&&st.ready) break; }
      }
      if(!st||!st.ready){ rec.err=(rec.err||'')+` variante "${v}" sin pantalla de descarga;`; continue; }
      rec.checked=st.checked;
      if(st.token) rec.token=rec.token?rec.token+','+st.token:st.token;
      await page.locator('[role="dialog"] button:has-text("Download PDF only")').first().click({force:true});
      let got=[];
      const sfx = !v || /LinkedIn Learning/i.test(v) ? '' : (/PMI/i.test(v) ? '(PMI)' : '('+v.replace(/[^A-Za-z0-9]+/g,' ').trim().split(' ').map(w=>w[0]).join('').slice(0,5).toUpperCase()+')');
      for(let k=0;k<50;k++){ await sleep(600); got=claim(sfx); if(got.length) break; }
      rec.files.push(...got);
      if(!got.length) rec.err=(rec.err||'')+` variante "${v}" sin archivo;`;
      await sleep(800);
    }
  }catch(e){ rec.err=(rec.err||'')+' '+e.message.split('\n')[0].slice(0,90); }
  fs.appendFileSync(LOG,JSON.stringify(rec)+'\n');
  const mark=rec.files.length?'OK ':'-- ';
  console.log(`${String(i).padStart(3)} ${mark} ${String(rec.title).slice(0,44).padEnd(46)} tok=${String(rec.token||'').slice(0,10)} pub=${rec.checked} ${rec.files.length} arch. ${rec.err||''}`);
  await sleep(2000);
}
await closeAll();
await b.close();
console.log('fin del rango');
