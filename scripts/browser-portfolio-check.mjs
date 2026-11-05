import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({executablePath:process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':process.env.CHROMIUM_PATH,headless:true,args:['--disable-gpu']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[], mutations=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')mutations.push(r.url())});
 await mkdir('.impeccable/review/portfolio',{recursive:true});
 await page.goto('http://127.0.0.1:5173/#portfolio');
 await expect(page.getByRole('heading',{name:'Tout commence par un plan.'})).toBeVisible();
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/state'));
 await page.getByRole('button',{name:'Charger le compte',exact:true}).click();
 const data=await (await responsePromise).json();
 await expect(page.getByRole('heading',{name:'Où sont vos fonds ?'})).toBeVisible();
 await page.getByRole('button',{name:'Examiner la proposition'}).click();
 await expect(page.locator('#portfolio-proposal')).toContainText('Ce calcul n’envoie aucune transaction');
 await expect(page.locator('.portfolio-strategy')).toContainText(data.snapshot.strategy);
 for(const [width,name]of [[1440,'desktop'],[1024,'1024'],[768,'tablet'],[650,'650'],[390,'390'],[320,'mobile']]){
  await page.setViewportSize({width,height:1100});await page.evaluate(()=>window.scrollTo(0,0));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(`Overflow at ${width}`);
  if(['desktop','tablet','mobile'].includes(name))await page.screenshot({path:`.impeccable/review/portfolio/${name}.png`,fullPage:true});
 }
 await page.getByRole('button',{name:'Ouvrir les commandes de l’agent'}).click();
 await expect(page).toHaveURL(/#security$/);await expect(page.locator('main h1')).toBeFocused();
 await page.goBack();await expect(page).toHaveURL(/#portfolio$/);
 const fixture=structuredClone(data);fixture.history=[{label:'allocate',ok:true,detail:'Allocation fixture confirmée.'},{label:'probe',ok:false,detail:'Plafond fixture refusé.'}];
 await page.route('**/state',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(fixture)}));
 await page.getByRole('button',{name:'Actualiser le portfolio'}).click();
 await expect(page.locator('.portfolio-events li')).toHaveCount(2);
 await page.getByRole('button',{name:'Refusées',exact:true}).click();await expect(page.locator('.portfolio-events li')).toHaveCount(1);await expect(page.locator('.portfolio-events')).toContainText('Plafond fixture refusé.');
 await page.getByRole('button',{name:'Traitées',exact:true}).click();await expect(page.locator('.portfolio-events')).toContainText('Allocation fixture confirmée.');
 fixture.history=[];
 await page.getByRole('button',{name:'Actualiser le portfolio'}).click();await expect(page.locator('.portfolio-empty')).toContainText('Aucune opération d’investissement connue');
 await page.unroute('**/state');
 if(errors.length||mutations.length)throw new Error(JSON.stringify({errors,mutations}));
 const report={date:new Date().toISOString(),liveSandboxRead:true,viewports:[1440,1024,768,650,390,320],checks:['empty/load','real balances and strategy identity','proposal inspection without transaction','agent commands route, focus and back','six widths without overflow','journal outcome filters and empty fixture'],pageErrors:errors,mutations,scope:'Read-only real sandbox state; journal outcome fixtures injected separately. No agent transaction, external DeFi integration or testnet wallet validated.'};
 await writeFile('docs/results/portfolio-ui.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await browser.close();}
