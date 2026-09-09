/** Expands the learning history to its full length.
 *  The "Show more" control only renders once the list bottom is on screen, and
 *  it is not exposed with the button role, so it is clicked in page context. */
import { chromium } from 'playwright-core';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.connectOverCDP('http://127.0.0.1:9333');
const page=b.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('my-library'));
let prev=0, stag=0;
for(let i=0;i<120;i++){
  const n=await page.locator('li.completed-body__card').count();
  if(n===prev){ if(++stag>=6) break; } else { stag=0; prev=n; process.stdout.write(`\r  ${n} tarjetas   `); }
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await sleep(700);
  const clicked=await page.evaluate(()=>{
    const el=[...document.querySelectorAll('button,a,span[role=button]')]
      .find(x=>/^\s*(Show more|Ver más|Mostrar más)\s*$/i.test(x.innerText||''));
    if(el){ el.click(); return true; }
    return false;
  });
  await sleep(clicked?1800:900);
}
const n=await page.locator('li.completed-body__card').count();
console.log(`\ntotal: ${n}`);
await b.close();
