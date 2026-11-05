import {chromium,expect}from'@playwright/test';
import{mkdir,writeFile}from'node:fs/promises';
const b=await chromium.launch({executablePath:process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':process.env.CHROMIUM_PATH,headless:true,args:['--disable-gpu']});
try{
 const p=await b.newPage({viewport:{width:1440,height:1000}});const errors=[],posts=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST')posts.push(r.url())});await mkdir('.impeccable/review/v2',{recursive:true});
 await p.goto('http://127.0.0.1:5173/#presentation',{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);
 await expect(p.getByRole('heading',{level:1})).toHaveText('LE COMPTERESTE.');
 const map=p.locator('.control-map');await map.getByRole('button',{name:'L’agent',exact:true}).focus();await p.keyboard.press('Enter');await expect(p.locator('.control-agent')).toContainText('AUTORISÉ');await map.getByRole('button',{name:'La transmission',exact:true}).click();await expect(p.locator('.control-owner')).toContainText('Bob');await expect(p.locator('.control-explanation')).toContainText('anciennes générations');await map.getByRole('button',{name:'Le compte',exact:true}).click();
 const contrast=[];
 for(const [width,name]of [[1440,'desktop'],[768,'tablet'],[390,'mobile'],[320,'320']]){
  await p.setViewportSize({width,height:width<700?844:1000});await p.evaluate(()=>{window.scrollTo(0,0);document.activeElement?.blur()});
  if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(`Landing overflow ${width}`);
  if(width!==320)await p.screenshot({path:`.impeccable/review/v2/${name}.png`,fullPage:true});
 }
 await p.getByRole('link',{name:'Explorer la démo',exact:true}).click();await p.getByRole('button',{name:'Charger le compte',exact:true}).click();await p.getByText('Propriété vérifiée',{exact:false}).waitFor();
 for(const route of ['app','portfolio','nft','security','history','ecosystem']){
  const changed=await p.evaluate(hash=>{const changed=location.hash!==hash;location.hash=hash;return changed},'#'+route);if(changed)await expect(p.locator('main h1')).toBeFocused();
  for(const[width,name]of[[1440,'desktop'],[768,'tablet'],[390,'mobile'],[320,'320']]){
   await p.setViewportSize({width,height:width<700?844:1100});await p.mouse.move(0,0);await p.evaluate(()=>{window.scrollTo(0,0);document.activeElement?.blur()});
   if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(`${route} overflow ${width}`);
   if(name!=='320'&&(route==='app'||name!=='tablet'))await p.screenshot({path:`.impeccable/review/v2/${route}-${name}.png`,fullPage:true});
  }
 }
 await p.evaluate(()=>location.hash='#app');await p.getByRole('button',{name:'Retirer',exact:true}).click();await p.locator('.modal').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})))});await p.setViewportSize({width:390,height:844});await p.screenshot({path:'.impeccable/review/v2/confirmation-mobile.png'});await p.keyboard.press('Escape');
 const measured=await p.evaluate(()=>{
  const nums=s=>s.match(/[\d.]+/g).map(Number);const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  return ['.breadcrumb','.stats > div > span','.allocation > div > span','.assumption','footer','.primary'].map(selector=>{const el=document.querySelector(selector);let n=el,bg;while(n){const s=getComputedStyle(n).backgroundColor;if(nums(s)[3]!==0){bg=s;break}n=n.parentElement}const color=getComputedStyle(el).color;const[a,b]=[lum(nums(color)),lum(nums(bg))].sort((a,b)=>b-a);return{selector,color,background:bg,ratio:Math.round((a+.05)/(b+.05)*100)/100}});
 });
 if(measured.some(x=>x.ratio<4.5))throw new Error(JSON.stringify(measured));
 await p.emulateMedia({reducedMotion:'reduce'});await p.getByRole('button',{name:'Retirer',exact:true}).click();if(await p.locator('.modal').evaluate(el=>getComputedStyle(el).transitionDuration)!=='0s')throw new Error('Reduced motion ignored');await p.keyboard.press('Escape');
 if(errors.length||posts.length)throw new Error(JSON.stringify({errors,posts}));
 const report={date:new Date().toISOString(),routes:['presentation','app','portfolio','nft','security','history','ecosystem'],widths:[1440,768,390,320],checks:['control map keyboard and pointer','owner change and agent revocation explanation','all routes without overflow','route focus','exact confirmation','reduced motion'],contrasts:measured,pageErrors:errors,mutations:posts,scope:'Browser viewport QA and read-only sandbox; no physical device or external wallet testnet validation.'};await writeFile('docs/results/art-direction-v2.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await b.close()}
