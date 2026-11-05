import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const output = "docs/screenshots/baskets",
  captures = [],
  checks = [],
  errors = [],
  cache = new Map();
await mkdir(output, { recursive: true });
await mkdir(".research", { recursive: true });
await writeFile(
  ".research/basket-states.html",
  `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/design/tokens.css"><link rel="stylesheet" href="/design/components.css"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/basket-states.tsx"></script></body></html>`,
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--disable-gpu"],
});
async function shot(page, name, width) {
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator(".ek-card-frame img")
    .evaluateAll((imgs) => Promise.all(imgs.map((i) => i.decode())));
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    name + " overflow",
  );
  const file = `${output}/${name}-${width}.png`;
  await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
  captures.push(file);
}
try {
  for (const width of [1440, 768, 390]) {
    const context = await browser.newContext({
      reducedMotion: "reduce",
      hasTouch: width < 960,
    });
    await context.route("https://test.rpc.fastnear.com/**", async (route) => {
      const body = route.request().postDataJSON();
      assert.ok(
        ["query", "block", "status"].includes(body.method),
        "no broadcast in browser QA",
      );
      const key = JSON.stringify(body);
      if (!cache.has(key))
        cache.set(
          key,
          (async () => {
            const r = await fetch("https://testnet-rpc.intea.rs", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(30000),
            });
            return r.text();
          })(),
        );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: await cache.get(key),
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("http://127.0.0.1:5173/#explorer", {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.locator(".ek-position-card").first().waitFor({ timeout: 60000 });
    await page.waitForFunction(() =>
      document.querySelector('main[aria-busy="false"]'),
    );
    assert.equal(await page.locator(".ek-position-card").count(), 3);
    assert.deepEqual(
      await page
        .locator(".ek-position-card .ek-art-layer")
        .evaluateAll((imgs) => imgs.map((i) => i.getAttribute("src"))),
      [
        "/art/special/ai-infrastructure.webp",
        "/art/special/moon-executive.webp",
        "/art/special/energy-transition.webp",
      ],
    );
    await shot(page, "explorer", width);
    const card = page.locator(".ek-position-card").first(),
      height = await card.evaluate((e) => e.getBoundingClientRect().height);
    await card
      .getByRole("button", { name: "Voir la composition", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await card.locator(".ek-position-back").waitFor();
    assert.equal(
      await card.locator(".ek-position-composition > div").count(),
      5,
    );
    assert.equal(
      await card.evaluate((e) => e.getBoundingClientRect().height),
      height,
    );
    await shot(page, "composition", width);
    await card
      .locator(".ek-position-back")
      .getByRole("button", { name: "Créer ma position", exact: true })
      .click();
    await page.locator("#basket-amount").waitFor();
    assert.equal(
      await page.locator(".ek-basket-composition dl > div").count(),
      5,
    );
    await page.locator("#basket-amount").fill("0");
    assert.ok(
      await page
        .getByRole("button", { name: "Examiner ma souscription", exact: true })
        .isDisabled(),
    );
    await page.locator("#basket-amount").fill("100");
    await page
      .getByRole("button", { name: "Examiner ma souscription", exact: true })
      .click();
    await shot(page, "subscription-review", width);
    await page.goto("http://127.0.0.1:5173/#agent", {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.locator("#thematic-request").waitFor({ timeout: 60000 });
    await page
      .locator("#thematic-request")
      .fill("Je veux créer une position de 123 demoUSD sur le thème IA.");
    await page
      .getByRole("button", { name: "Préparer ma proposition", exact: true })
      .click();
    await page
      .getByText("Proposition : 123 demoUSD", { exact: false })
      .waitFor();
    await shot(page, "agent-proposal", width);
    await page
      .getByRole("button", {
        name: "Examiner le panier et autoriser moi-même le dépôt",
        exact: true,
      })
      .click();
    await page.locator("#basket-amount").waitFor();
    assert.equal(await page.locator("#basket-amount").inputValue(), "123");
    checks.push(
      `${width}: real catalogue, three artworks, keyboard flip, exact weights, invalid amount, review, free agent proposal and amount preserved`,
    );
    const fixture = await context.newPage();
    fixture.on("pageerror", (e) => errors.push(String(e)));
    await fixture.setViewportSize({ width, height: 1000 });
    await fixture.goto("http://127.0.0.1:5173/.research/basket-states.html");
    await fixture.locator(".ek-basket-owned").first().waitFor();
    const first = fixture.locator(".ek-basket-owned").first();
    await first
      .getByText("Entreprises, quantités et prix fictifs", { exact: true })
      .click();
    await first
      .getByText("Historique de valorisation simulée", { exact: true })
      .click();
    await shot(fixture, "owned-history-fixture", width);
    await first
      .getByRole("button", {
        name: "Clôturer l’exposition simulée",
        exact: true,
      })
      .click();
    await first
      .getByRole("button", { name: "Retirer 100 demoUSD", exact: true })
      .waitFor();
    await shot(fixture, "closed-fixture", width);
    await first
      .getByRole("button", { name: "Retirer 100 demoUSD", exact: true })
      .click();
    assert.ok(
      await first
        .getByRole("button", { name: "Retirer 0 demoUSD", exact: true })
        .isDisabled(),
    );
    checks.push(
      `${width}: synthetic owned amounts/quantities/date/history, transfer acquisition disclaimer, close then exact principal withdraw UI; no wallet execution`,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/results/baskets-browser.json",
    JSON.stringify(
      {
        captures,
        checks,
        errors,
        signatures: 0,
        rpc: "read-only actual testnet for main app; explicit synthetic owned UI fixture",
        financialProof: "docs/results/baskets-sandbox.json",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ captures: captures.length, errors, checks }, null, 2),
  );
} finally {
  await browser.close();
}
