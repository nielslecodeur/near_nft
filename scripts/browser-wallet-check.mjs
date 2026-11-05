import {chromium,expect}from'@playwright/test';
import{mkdir,writeFile}from'node:fs/promises';
const b=await chromium.launch({executablePath:process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':process.env.CHROMIUM_PATH,headless:true,args:['--disable-gpu']});
try {
 await mkdir('.impeccable/review/wallet',{recursive:true});
 const real=await b.newPage({viewport:{width:390,height:844}});await real.goto('http://127.0.0.1:5173/#app');await real.getByRole('button',{name:/Connecter mon wallet/}).click();await expect(real.getByText('MyNearWallet',{exact:false}).first()).toBeVisible({timeout:30000});await real.waitForTimeout(700);await real.screenshot({path:'.impeccable/review/wallet/provider-mobile.png'});await real.close();
 const p=await b.newPage({viewport:{width:1440,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const snapshot=structuredClone((await(await fetch('http://127.0.0.1:8787/state')).json()).snapshot);
 Object.assign(snapshot,{account_id:'plan.everkeep.testnet',collection_id:'everkeep.testnet',owner_id:'alice.testnet',network:'testnet',asset:'demo.testnet',strategy:'strategy.testnet'});
 let configured=true, sold=false, delay=false;const rpcCalls=[];
 await p.addInitScript(()=>{
  const listeners=new Set();let owner='alice.testnet';
  const state=()=>({accounts:owner?[{accountId:owner,active:true}]:[]});
  window.__walletFixture={update(value){owner=value;for(const listener of listeners)listener(state())},selector:{isSignedIn:()=>Boolean(owner),store:{getState:state,observable:{subscribe(listener){listeners.add(listener);listener(state());return{unsubscribe(){listeners.delete(listener)}}}}},wallet:async()=>({signOut:async()=>window.__walletFixture.update('')})}};
 });
 await p.route('**/src/client.ts*',async route=>{
  const response=await route.fetch();let source=await response.text();
  if(configured)source=source.replace('collection: import.meta.env.VITE_COLLECTION_ID || ""','collection: "everkeep.testnet"');
  const start=source.indexOf('export async function walletSelector()');const end=source.indexOf('export async function connect()',start);
  if(start<0||end<0)throw new Error('Wallet fixture cannot find selector boundary');
  source=source.slice(0,start)+'export async function walletSelector(){return window.__walletFixture.selector;}\n'+source.slice(end);await route.fulfill({response,body:source,contentType:'application/javascript'});
 });
 await p.route('https://rpc.testnet.near.org/',async route=>{
  const body=route.request().postDataJSON();rpcCalls.push(body);let result;
  if(body.method==='block')result={header:{hash:'same-final-block'}};
  else if(body.params.method_name==='nft_tokens_for_owner'){if(delay)await new Promise(r=>setTimeout(r,600));const tokens=body.params.args_base64===btoa(JSON.stringify({account_id:'alice.testnet',from_index:'0',limit:20}))?[{token_id:snapshot.account_id,owner_id:'alice.testnet'}]:[];result={result:[...new TextEncoder().encode(JSON.stringify(tokens))]};}
  else {const data=body.params.method_name==='snapshot'?{...snapshot,owner_id:sold?'bob.testnet':'alice.testnet'}:{token_id:snapshot.account_id,owner_id:sold?'bob.testnet':'alice.testnet',ownership_epoch:snapshot.ownership_epoch,sync_seq:snapshot.sync_seq};result={result:[...new TextEncoder().encode(JSON.stringify(data))]};}
  await route.fulfill({contentType:'application/json',body:JSON.stringify({jsonrpc:'2.0',id:'everkeep',result})});
 });
 await p.goto('http://127.0.0.1:5173/#app');await expect(p.getByRole('button',{name:/alice.testnet/})).toBeVisible();await expect(p.getByLabel('Environnement')).toHaveValue('local');
 await p.getByRole('button',{name:/alice.testnet/}).click();await expect(p.getByLabel('Environnement')).toHaveValue('testnet');await expect(p.getByRole('dialog')).toContainText('plan.everkeep.testnet');
 for(const[width,name]of[[1440,'desktop'],[768,'tablet'],[390,'mobile'],[320,'320']]){await p.setViewportSize({width,height:width<700?844:1000});if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(`Wallet overflow ${width}`);if(name!=='320')await p.screenshot({path:`.impeccable/review/wallet/session-${name}.png`});}
 await p.getByRole('button',{name:'Ouvrir le plan',exact:true}).click();await expect(p.locator('.plan-address')).toContainText(snapshot.account_id);await expect(p.locator('.modal')).toHaveCount(0);
 const pair=rpcCalls.filter(call=>['snapshot','nft_token'].includes(call.params?.method_name));if(pair.length!==2||pair.some(call=>call.params.block_id!=='same-final-block'))throw new Error('NFT pair not checked at same final block');
 await p.getByRole('button',{name:/alice.testnet/}).click();sold=true;await p.getByRole('button',{name:'Ouvrir le plan',exact:true}).click();await expect(p.getByRole('alert')).toContainText('changé de propriétaire');await p.getByRole('button',{name:'Fermer le wallet'}).click();
 await p.evaluate(()=>window.__walletFixture.update('bob.testnet'));await expect(p.locator('.plan-address')).toHaveCount(0);await expect(p.getByRole('button',{name:/bob.testnet/})).toBeVisible();await p.getByRole('button',{name:/bob.testnet/}).click();await expect(p.getByRole('dialog')).toContainText('Aucun NFT-compte');await p.getByRole('button',{name:'Déconnecter le wallet'}).click();await expect(p.getByRole('button',{name:/Connecter mon wallet/})).toBeVisible();
 configured=false;await p.reload();await p.getByRole('button',{name:/alice.testnet/}).click();await expect(p.getByRole('alert')).toContainText('n’est pas encore configurée');await p.screenshot({path:'.impeccable/review/wallet/unconfigured-mobile.png'});await p.getByRole('button',{name:'Fermer le wallet'}).click();
 // A delayed old enumeration must not survive an account change.
 configured=true;await p.reload();delay=true;await p.getByRole('button',{name:/alice.testnet/}).click();await p.evaluate(()=>window.__walletFixture.update('bob.testnet'));await p.waitForTimeout(800);await p.getByRole('button',{name:/bob.testnet/}).click();await expect(p.getByRole('dialog')).not.toContainText(snapshot.account_id);
 if(errors.length)throw new Error(errors.join('\n'));
 const report={date:new Date().toISOString(),checks:['real MyNearWallet provider selector without configured collection','public account session fixture restoration','separate sandbox and connected wallet','NFT discovery and real client pair verification against RPC fixtures at same final block','sold NFT refused on open','account change clears loaded plan','disconnect','unconfigured collection explained','stale enumeration discarded','320/390/768/1440 widths'],pageErrors:errors,scope:'Actual provider selector opened only; no external wallet login or signature. Account sessions and RPC responses are deliberate fixtures; verifyPair and client parsing are not bypassed. No deployment or transaction sent.'};await writeFile('docs/results/wallet-ui.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await b.close()}
