import{chromium}from"@playwright/test";
import assert from"node:assert/strict";
import{writeFile}from"node:fs/promises";
const b=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--disable-gpu"]});
try{const p=await b.newPage({reducedMotion:"reduce"});await p.goto("http://127.0.0.1:5173/#positions");await p.locator("main[aria-busy=false]").waitFor();await p.getByLabel("Compte de démo").selectOption("Bob");const captures=[];assert.equal(await p.locator("article.position").count(),1);
for(const width of[320,390,768,1440]){await p.setViewportSize({width,height:1000});for(const route of["positions","market"]){await p.getByRole("link",{name:route==="positions"?"Mes positions":"Marché",exact:true}).click();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+" overflow "+width);const path=`.impeccable/review/series/${route}-populated-${width}.png`;await p.screenshot({path,fullPage:true});captures.push(path);}}
await writeFile("docs/results/series-responsive.json",JSON.stringify({date:new Date().toISOString(),checks:["populated Bob position and market at 320/390/768/1440 without horizontal overflow"],captures,scope:"Read-only browser inspection after actual sandbox sale and withdrawal."},null,2)+"\n");console.log("Populated responsive views passed.");}finally{await b.close()}
