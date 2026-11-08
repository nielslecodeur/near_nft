// Screenshots of every themed page at 1440 px and 390 px (viewport, so the
// carousel keeps its scroll position), and a console-error / overflow check.
// Run: node scripts/browser-theme-check.mjs  (needs npm run dev on 127.0.0.1:5173)
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const DEMO = process.env.DEMO_ACCOUNT || "nifelst.testnet";
const PAGES = [
  ["wallet", `/agents?as=${DEMO}`],
  ["intro", "/agents"],
  ["hire", "/agents/new"],
  ["agent", "/agents/6"],
  ["collection", "/keepers"],
  ["keeper", "/keepers/1"],
  ["vault", "/vault"],
];
const browser = await chromium.launch({
  executablePath:
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--disable-gpu"],
});
await mkdir("docs/screenshots/theme", { recursive: true });
let failed = false;
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width > 500 ? 1000 : 844 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [name, path] of PAGES) {
    await page.goto(BASE + path, { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(5000);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await page.screenshot({ path: `docs/screenshots/theme/${name}-${width}.png` });
    const ok = !overflow && errors.length === 0;
    if (!ok) failed = true;
    console.log(`${ok ? "✓" : "✗"} ${name} ${path} @${width}px${overflow ? " (horizontal overflow)" : ""}${errors.length ? " errors: " + errors.join(" | ") : ""}`);
    errors.length = 0;
  }
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
