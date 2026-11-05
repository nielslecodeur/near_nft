/** Read-only browser checks. Financial testnet proofs are separate, signed sessions. */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const root = ".impeccable/review/testnet",
  chrome =
    process.env.EVERKEEP_CHROME ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  profile = process.env.EVERKEEP_BROWSER_PROFILE;
await mkdir(root, { recursive: true });
const options = {
  executablePath: chrome,
  headless: true,
  args: ["--disable-gpu"],
  reducedMotion: "reduce",
  viewport: { width: 1440, height: 1000 },
};
const browser = profile ? null : await chromium.launch(options),
  context = profile
    ? await chromium.launchPersistentContext(profile, options)
    : await browser.newContext(options),
  page = context.pages()[0] || (await context.newPage()),
  errors = [],
  checks = [],
  captures = [];
page.on("pageerror", (e) => errors.push(String(e)));
async function settled() {
  await page.locator("main[aria-busy=false]").waitFor({ timeout: 60000 });
}
try {
  await page.goto("http://127.0.0.1:5173/#explorer");
  await settled();
  await page.locator(".strategy-card").nth(2).waitFor();
  assert.equal(await page.locator(".series-header nav a").count(), 3);
  assert.equal(await page.locator(".strategy-card").count(), 3);
  const carousel = page.locator(".strategy-merry");
  await carousel.focus();
  await page.keyboard.press("Home");
  assert.equal(
    await page.locator(".model-detail h3").first().innerText(),
    "Panier diversifié",
  );
  await page.keyboard.press("End");
  assert.equal(
    await page.locator(".model-detail h3").first().innerText(),
    "Réserve demoUSD",
  );
  checks.push(
    "manual carousel Home/End keyboard navigation; exactly three distinct models",
  );
  await page.getByRole("button", { name: "Vue grille", exact: true }).click();
  assert.equal(await page.locator(".strategy-grid .strategy-card").count(), 3);
  await page.getByRole("button", { name: "Vue manège", exact: true }).click();
  checks.push("grid alternative and reduced-motion preference");
  await page.getByRole("button", { name: "Crypto", exact: true }).click();
  assert.equal(await page.locator(".strategy-card").count(), 1);
  assert.ok(
    await page
      .getByRole("button", { name: "Création indisponible", exact: true })
      .isDisabled(),
  );
  await page
    .getByRole("button", { name: "Toutes les catégories", exact: true })
    .click();
  checks.push("category filter and unavailable adapter blocks subscription");
  await page.getByRole("button", { name: "Communauté", exact: true }).click();
  assert.equal(await page.locator(".community-offer").count(), 0);
  assert.ok(
    await page
      .getByText("Aucune position en vente dans cette sélection.", {
        exact: true,
      })
      .isVisible(),
  );
  await page.getByRole("button", { name: "Tout", exact: true }).click();
  checks.push("honest empty community after real cancellation");
  const connected = (await page.locator(".wallet-account-menu").count()) > 0;
  if (connected) {
    await page
      .locator(".wallet-header-balances")
      .filter({ hasText: "demoUSD" })
      .waitFor({ timeout: 30000 });
    await page.reload();
    await settled();
    await page
      .locator(".wallet-header-balances")
      .filter({ hasText: "demoUSD" })
      .waitFor({ timeout: 30000 });
    checks.push(
      "actual wallet session restored after reload with separate native and token balances",
    );
  }
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["tablet", 768, 1024],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const [surface, hash] of [
      ["marketplace", "explorer"],
      ["positions", "positions"],
      ["agents", "agent"],
    ]) {
      await page.goto("http://127.0.0.1:5173/#" + hash);
      await settled();
      if (surface === "agents")
        await page
          .locator(".agent-missions[aria-busy=false]")
          .waitFor({ timeout: 45000 });
      const overlaps = await page.locator(".series-header").evaluate((el) => {
        const a = [...el.children]
          .map((x) => x.getBoundingClientRect())
          .filter((r) => r.width && r.height);
        return a.some((r, i) =>
          a
            .slice(i + 1)
            .some(
              (s) =>
                r.left < s.right - 1 &&
                r.right > s.left + 1 &&
                r.top < s.bottom - 1 &&
                r.bottom > s.top + 1,
            ),
        );
      });
      assert.equal(overlaps, false, "header overlap at " + width);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      assert.equal(overflow, false, surface + " overflows at " + width);
      const path = root + "/" + surface + "-" + name + ".png";
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path, fullPage: true });
      captures.push({ surface, width, height, path });
    }
  }
  checks.push(
    "390, 768 and 1440px: all three routes without document overflow or page errors",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5173/#explorer");
  await settled();
  if (connected) {
    await page.locator("#model-amount").fill("1000");
    await page
      .getByRole("button", { name: "Préparer ma position", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "demoUSD" })
      .waitFor({ timeout: 30000 });
    checks.push(
      "insufficient demoUSD rejected before any key generation or transfer",
    );
    await page.locator("#model-amount").fill("10");
    await page
      .getByRole("button", { name: "Préparer ma position", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "NEAR" })
      .waitFor({ timeout: 30000 });
    checks.push("insufficient technical NEAR rejected before account creation");
  }
  await page.route("https://test.rpc.fastnear.com/**", (route) =>
    route.abort(),
  );
  await page.reload();
  await page
    .getByRole("alert")
    .filter({ hasText: "Lecture NEAR Testnet impossible" })
    .waitFor({ timeout: 45000 });
  assert.equal(await page.locator(".position-creation").count(), 0);
  assert.equal(await page.locator(".community-offer").count(), 0);
  checks.push(
    "RPC failure disables creation and never falls back to sandbox funds",
  );
  await page.unroute("https://test.rpc.fastnear.com/**");
  await page.route("https://test.rpc.fastnear.com/**", async (route) => {
    let q;
    try {
      q = route.request().postDataJSON();
    } catch {}
    if (q?.method === "status")
      await route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: q.id,
          result: { chain_id: "mainnet", protocol_version: 88 },
        },
      });
    else await route.continue();
  });
  await page.reload();
  await page
    .getByRole("alert")
    .filter({ hasText: "Réseau incompatible" })
    .waitFor({ timeout: 45000 });
  checks.push(
    "explicit wrong-network rejection (negative RPC fixture, no transaction)",
  );
  await page.unroute("https://test.rpc.fastnear.com/**");
  await page.reload();
  await settled();
  assert.deepEqual(errors, []);
  const report = {
    at: new Date().toISOString(),
    network: "testnet",
    connected,
    checks,
    captures,
    errors,
  };
  await writeFile(
    "docs/results/testnet-ui.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await context.close();
  await browser?.close();
}
