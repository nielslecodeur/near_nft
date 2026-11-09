// Opens the read-only demo Agent Wallet, then makes the RPC answer of seat_log
// for seat #9 grow by one entry (a payment, then a block), as if the agent had
// just acted. Checks the toast, the highlighted row, the live dot and the tab
// title badge. Signs nothing: only the browser's view of the RPC is changed.
// Run: node scripts/browser-live-check.mjs  (needs npm run dev on 127.0.0.1:5173)
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const OUT = process.argv[2] || "docs/screenshots";
const browser = await chromium.launch({
  executablePath: process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : process.env.CHROMIUM_PATH,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && !/429|Too Many/.test(m.text()) && errors.push(m.text()));

let extra = []; // synthetic entries prepended to seat #9's log
await page.route("**/*", async (route) => {
  const req = route.request();
  if (req.method() !== "POST" || !/rpc/.test(req.url())) return route.continue();
  let body;
  try {
    body = JSON.parse(req.postData() || "{}");
  } catch {
    return route.continue();
  }
  const p = body.params || {};
  const args = p.args_base64 ? JSON.parse(Buffer.from(p.args_base64, "base64").toString()) : {};
  if (p.method_name !== "seat_log" || String(args.seat_id) !== "9" || !extra.length) return route.continue();
  const res = await route.fetch();
  const json = await res.json();
  const log = JSON.parse(Buffer.from(json.result.result).toString());
  const merged = [...extra, ...log];
  json.result.result = [...Buffer.from(JSON.stringify(merged))];
  return route.fulfill({ response: res, json });
});

const ok = [];
const fail = [];
const check = (name, cond, detail = "") => ((cond ? ok : fail).push(name), console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`));

await page.goto(`${BASE}/agents?as=demo-agent.everkeep-dev-mw0weth5.testnet`);
await page.waitForSelector("text=Your agents control", { timeout: 30_000 });
await page.waitForSelector(".ag-live", { timeout: 30_000 });
await page.waitForTimeout(7000);
check("live indicator shows a fresh read", /Live · updated/.test(await page.textContent(".ag-live")), await page.textContent(".ag-live"));
check("no toast on first load", (await page.locator(".ag-toast").count()) === 0);

// The agent "pays" 1 USDC.
const nowNs = (BigInt(Date.now()) * 1_000_000n).toString();
extra = [{ seq: "900001", at: nowNs, action: "pay", status: "done", amount: "1000000", counterparty: "demo-agent.everkeep-dev-mw0weth5.testnet", detail: "live check" }];
await page.waitForSelector(".ag-toast", { timeout: 15_000 }).catch(() => null);
const t1 = (await page.locator(".ag-toast").first().textContent()) || "";
check("toast for a new payment", /paid 1 USDC/.test(t1) && /no signature/.test(t1), t1.slice(0, 120));
check("new feed row highlighted", (await page.locator('.ag-feed li[data-new]').count()) >= 1);
if (OUT) await page.screenshot({ path: `${OUT}/live-toast-1280.png` });

// Tab hidden, then the agent is "blocked".
await page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
});
await page.waitForTimeout(500);
check("indicator says paused while hidden", /Paused while this tab is hidden/.test(await page.textContent(".ag-live")));
extra = [
  { seq: "900002", at: (BigInt(nowNs) + 5_000_000_000n).toString(), action: "pay", status: "refused", amount: "5000000", counterparty: "attacker.testnet", detail: "payee not allowed" },
  ...extra,
];
// Hidden polling is every 30 s.
await page.waitForFunction(() => /^\(\d+\) /.test(document.title), null, { timeout: 40_000 }).catch(() => null);
check("tab title counts what happened while hidden", /^\(1\) /.test(await page.title()), await page.title());
const t2 = (await page.locator(".ag-toast").last().textContent()) || "";
check("toast for a blocked attempt", /tried to pay 5 USDC/.test(t2) && /Blocked on chain: payee not allowed/.test(t2), t2.slice(0, 140));

await page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
});
await page.waitForTimeout(800);
check("badge cleared when the tab is back", !/^\(\d+\) /.test(await page.title()), await page.title());

await page.locator(".ag-toast-close").first().click();
check("toast can be dismissed", (await page.locator(".ag-toast").count()) <= 1);

// Mobile layout of a toast.
await page.setViewportSize({ width: 390, height: 844 });
extra = [{ seq: "900003", at: (BigInt(nowNs) + 9_000_000_000n).toString(), action: "pay", status: "done", amount: "1000000", counterparty: "demo-agent.everkeep-dev-mw0weth5.testnet", detail: "live check" }, ...extra];
await page.waitForSelector("text=paid 1 USDC", { timeout: 15_000 }).catch(() => null);
const box = await page.locator(".ag-toast").last().boundingBox();
check("toast fits a phone screen", !!box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
if (OUT) await page.screenshot({ path: `${OUT}/live-toast-390.png` });

check("no console errors", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();
console.log(`\n${ok.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
