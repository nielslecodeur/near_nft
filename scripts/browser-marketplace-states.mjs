import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

// Render fixtures only. No transaction is sent and no chain state is changed.
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--disable-gpu"],
});
const base = await fetch("http://127.0.0.1:8791/state").then((r) => r.json());
const checks = [],
  errors = [];
let commands = 0;
try {
  async function fixture(value, { offline = false, delayed = false } = {}) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 1000 },
    });
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/command"))
        commands++;
    });
    let release;
    const gate = delayed
      ? new Promise((resolve) => {
          release = resolve;
        })
      : Promise.resolve();
    await page.route("http://127.0.0.1:8791/state", async (route) => {
      await gate;
      if (offline) await route.abort();
      else
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(value),
        });
    });
    await page.goto("http://127.0.0.1:5173/?session=orbite#explorer");
    return { page, release };
  }
  const loading = await fixture(base, { delayed: true });
  await loading.page
    .getByRole("status")
    .filter({ hasText: "Chargement du catalogue" })
    .waitFor();
  loading.release();
  await loading.page
    .getByRole("heading", { name: "Réserve demoUSD", exact: true })
    .waitFor();
  await loading.page.close();
  checks.push("delayed response shows loading then resolves to actual offer");
  const missing = await fixture(base, { offline: true });
  await missing.page
    .getByRole("heading", { name: "Le catalogue n’est pas disponible." })
    .waitFor();
  await missing.page
    .getByRole("button", { name: "Recharger les données" })
    .waitFor();
  await missing.page.close();
  checks.push("offline catalogue exposes an error and retry control");
  const empty = structuredClone(base);
  empty.series.series = null;
  const none = await fixture(empty);
  await none.page
    .getByRole("heading", { name: "Aucune stratégie disponible." })
    .waitFor();
  assert.equal(
    await none.page
      .getByRole("button", { name: "Créer une position", exact: true })
      .count(),
    0,
  );
  await none.page.close();
  checks.push("missing series has no invented issue or purchase action");
  const closed = structuredClone(base);
  closed.series.closed = true;
  const ended = await fixture(closed);
  assert.ok(
    await ended.page
      .getByRole("button", { name: "Créer une position", exact: true })
      .isDisabled(),
  );
  await ended.page.close();
  checks.push("closed series remains inspectable and blocks purchase");
  const over = await fixture(base);
  await over.page.getByLabel("Dépôt initial en demoUSD").fill("1000000");
  await over.page.getByRole("button",{name:"Créer une position",exact:true}).click();
  await over.page
    .getByRole("alert")
    .filter({ hasText: "capacité restante" })
    .waitFor();
  assert.equal(await over.page.locator(".transaction-dialog[open]").count(), 0);
  await over.page.close();
  checks.push(
    "amount exceeding remaining capacity never opens financial confirmation",
  );
  assert.equal(commands, 0);
  assert.deepEqual(errors, []);
  const report = {
    date: new Date().toISOString(),
    checks,
    commands,
    scope:
      "Render-only HTTP fixtures derived from actual sandbox state. No chain mutation or simulated financial proof.",
  };
  await writeFile(
    "docs/results/marketplace-states.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
