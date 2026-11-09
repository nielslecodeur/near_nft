// Loads the agent pages in headless Chrome (no wallet) and fails on any console
// error or missing heading. Screenshots go to docs/screenshots/agents-*.png.
// Run: node scripts/browser-agents-check.mjs  (needs npm run dev on 127.0.0.1:5173)
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  executablePath:
    process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--disable-gpu"],
});
await mkdir("docs/screenshots", { recursive: true });
const DEMO = process.env.DEMO_ACCOUNT || "nifelst.testnet";
const pages = [
  ["/agents", "Give an AI a card, not your wallet."],
  [`/agents?as=${DEMO}`, "Your agents control"],
  ["/agents/new", "Connect your wallet to hire an agent."],
  ["/agents/start", "Your first agent, step by step"],
  ["/market", "Where your buyer agents shop."],
  ["/keepers", "Where your buyer agents shop."],
  ["/agents/1", "Budget left"],
  ["/agents/v2-3", "Budget left"],
  ["/agents/5", "Budget left"],
  ["/agents/999999", "No agent #999999."],
];
let failed = false;
for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  // The explorer's anonymous rate limit (429) only hides "tx" links: not a page error.
  page.on("console", (m) => m.type() === "error" && !/status of 429/.test(m.text()) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [path, text] of pages) {
    // "load" + a pause: the pages poll the chain, so the network is never idle for long.
    await page.goto(BASE + path, { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(5000);
    const found = await page.getByText(text).first().isVisible().catch(() => false);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const name = `agents${path.replace(/[/?=.]/g, "-")}-${width}.png`;
    await page.screenshot({ path: `docs/screenshots/${name}`, fullPage: true });
    // FastNEAR's rate limit (429) reaches the browser as a CORS error with no header; the app then
    // fails over to another RPC node (src/client.ts). Those lines are noise when the page still renders.
    const rateLimited = errors.some((e) => /test\.rpc\.fastnear\.com.*blocked by CORS/.test(e));
    if (rateLimited) {
      const kept = errors.filter((e) => !/test\.rpc\.fastnear\.com.*blocked by CORS/.test(e) && !/net::ERR_FAILED/.test(e));
      errors.length = 0;
      errors.push(...kept);
    }
    const ok = found && !overflow && errors.length === 0;
    if (!ok) failed = true;
    console.log(`${ok ? "✓" : "✗"} ${path} @${width}px${found ? "" : " (text missing)"}${overflow ? " (horizontal overflow)" : ""}${errors.length ? " errors: " + errors.join(" | ") : ""}`);
    errors.length = 0;
  }
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
