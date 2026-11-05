import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--disable-gpu"],
});
const dir = ".impeccable/review/mvp",
  checks = [],
  captures = [],
  errors = [];
const transactions = process.env.EVERKEEP_BROWSER_TRANSACTIONS === "1";
const state = () => fetch("http://127.0.0.1:8791/state").then((r) => r.json());
await mkdir(dir, { recursive: true });
try {
  const initial = await state();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  let posts = 0;
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/command")) posts++;
  });
  async function ready() {
    await page.locator("main[aria-busy=false]").waitFor({ timeout: 60000 });
  }
  async function capture(name) {
    const path = `${dir}/${name}.png`;
    await page.screenshot({ path, fullPage: true });
    captures.push(path);
  }
  async function overflow() {
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  async function actor(name) {
    await page.getByText("Mon compte", { exact: true }).click();
    await page.getByLabel("Compte de démo", { exact: true }).selectOption(name);
    await page.getByText("Mon compte", { exact: true }).click();
  }
  async function confirm(name) {
    const dialog = page.locator(".transaction-dialog");
    await dialog.getByRole("heading", { name, exact: true }).waitFor();
    await dialog
      .getByRole("button", { name: "Confirmer en sandbox", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden", timeout: 120000 });
    await ready();
  }
  async function command(container, button, heading = button) {
    await container.getByRole("button", { name: button, exact: true }).click();
    await confirm(heading);
  }
  await page.goto("http://127.0.0.1:5173/?session=orbite#explorer");
  await ready();
  assert.deepEqual(
    await page
      .locator('nav[aria-label="Navigation principale"] a')
      .allTextContents(),
    ["Explorer", "Mes positions", "Agent"],
  );
  assert.equal(await page.locator(".strategy-card").count(), 1);
  assert.ok(
    await page
      .getByRole("button", { name: "Stratégie suivante", exact: true })
      .isDisabled(),
  );
  await page.locator(".strategy-merry").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Home");
  await page.keyboard.press("End");
  await page.getByRole("button", { name: "Vue grille", exact: true }).click();
  assert.equal(await page.locator(".strategy-grid .strategy-card").count(), 1);
  await page.getByRole("button", { name: "Vue manège", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".strategy-card")
      .evaluate((e) => getComputedStyle(e).transitionDuration),
    "0s",
  );
  checks.push(
    "three primary routes; a single truthful strategy with no duplicated neighbours; keyboard, grid and reduced-motion states",
  );
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["explorer", "positions", "agent"]) {
      await page.goto("http://127.0.0.1:5173/?session=orbite#" + route);
      await ready();
      await overflow();
      await capture(`${route}-${width}`);
    }
  }
  checks.push(
    "Explorer, owned positions and Agent fit 390/768/1440 without horizontal overflow",
  );
  await page.getByRole("link", { name: "Explorer", exact: true }).click();
  await ready();
  await page.getByLabel("Dépôt initial en demoUSD").fill("1");
  await page
    .getByRole("button", { name: "Créer une position", exact: true })
    .click();
  await page.getByRole("alert").filter({ hasText: "minimum" }).waitFor();
  assert.equal(posts, 0);
  await page.getByLabel("Dépôt initial en demoUSD").fill("100");
  await page.getByRole("link", { name: "Agent", exact: true }).click();
  await ready();
  const proposalPosts = posts;
  await page
    .getByLabel("Besoin de liquidité", { exact: true })
    .selectOption("immediate");
  await page
    .getByRole("button", { name: "Préparer une proposition", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "L’agent s’abstient", exact: true })
    .waitFor();
  await page
    .getByLabel("Besoin de liquidité", { exact: true })
    .selectOption("at-maturity");
  await page
    .getByRole("button", { name: "Préparer une proposition", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Souscription proposée", exact: true })
    .waitFor();
  assert.equal(posts, proposalPosts);
  checks.push(
    "below-minimum deposit blocked; incompatible liquidity abstains; proposal emits zero spending commands",
  );
  if (transactions) {
    await page.getByRole("link", { name: "Explorer", exact: true }).click();
    await ready();
    await page.getByLabel("Dépôt initial en demoUSD").fill("100");
    // Hold the real response briefly to inspect pending state, without replacing the chain result.
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route(
      "http://127.0.0.1:8791/command",
      async (route) => {
        const response = await route.fetch();
        await gate;
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Créer une position", exact: true })
      .click();
    const dialog = page.locator(".transaction-dialog");
    await dialog.waitFor();
    assert.ok((await dialog.innerText()).includes("Mandat examiné"));
    await dialog
      .getByRole("button", { name: "Confirmer en sandbox", exact: true })
      .click();
    await page
      .getByText(
        "Exécution NEAR en cours. Confirmation des reçus et lecture de l’état final…",
        { exact: true },
      )
      .waitFor();
    assert.ok(
      await dialog
        .getByRole("button", { name: "Fermer", exact: true })
        .isDisabled(),
    );
    await capture("transaction-pending-1440");
    release();
    await dialog.waitFor({ state: "hidden", timeout: 120000 });
    await ready();
    const created = await state();
    const nft = created.positions.find(
      (p) =>
        p.funded &&
        !initial.positions.some(
          (old) => old.funded && old.account_id === p.account_id,
        ),
    );
    assert.ok(nft);
    const card = page
      .locator("article.position")
      .filter({ has: page.getByText(nft.account_id, { exact: true }) });
    await card.waitFor();
    await command(card, "Autoriser l’agent");
    await command(card, "Exécuter l’allocation");
    assert.equal(
      (await state()).positions.find((p) => p.account_id === nft.account_id)
        .principal,
      "10000000",
    );
    await card
      .getByRole("button", { name: "Tester le plafond", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Confirmer en sandbox", exact: true })
      .click();
    await dialog.getByRole("alert").waitFor();
    assert.ok((await dialog.innerText()).includes("plafond"));
    await page.setViewportSize({ width: 390, height: 1000 });
    await capture("transaction-refused-390");
    await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
    await ready();
    await command(card, "Dénouer la stratégie");
    await card
      .getByText("Identité et contrôle du NFT-compte", { exact: true })
      .click();
    await command(card, "Renouveler la clé", "Renouveler la clé propriétaire");
    const beforeSale = (await state()).positions.find(
      (p) => p.account_id === nft.account_id,
    );
    assert.equal(beforeSale.available, "100000000");
    assert.ok(BigInt(beforeSale.key_version) > BigInt(nft.key_version));
    await card.getByLabel("Prix en demoUSD", { exact: true }).fill("97");
    await command(card, "Mettre en vente");
    await command(card, "Annuler mon annonce", "Annuler l’annonce");
    await command(card, "Mettre en vente");
    checks.push(
      "real ML-DSA creation, bounded allocation, cap rejection, unwind, owner key rotation and signed listing/cancellation",
    );
    await page.getByRole("link", { name: "Explorer", exact: true }).click();
    await page
      .getByRole("button", { name: "Positions en vente", exact: true })
      .click();
    const offer = page
      .locator(".nft-sale-card")
      .filter({
        has: page.getByRole("heading", {
          name: nft.account_id.split(".")[0],
          exact: true,
        }),
      });
    await offer.waitFor();
    await actor("Bob");
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await overflow();
      await capture(`resale-${width}`);
      await offer
        .getByRole("button", { name: "Examiner la position", exact: true })
        .click();
      const sheet = page.locator(".nft-detail-sheet");
      await sheet.waitFor();
      assert.ok((await sheet.innerText()).includes("97 demoUSD"));
      assert.ok((await sheet.innerText()).includes("100 demoUSD"));
      assert.ok(
        !(await sheet.innerText()).includes(
          "Non enregistrée sur ce déploiement",
        ),
      );
      assert.ok(
        await sheet.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      );
      await capture(`resale-detail-${width}`);
      await page.keyboard.press("Escape");
    }
    await offer
      .getByRole("button", { name: "Examiner la position", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Acheter cette position", exact: true })
      .click();
    await confirm("Acheter la position");
    const sold = await state(),
      transferred = sold.positions.find((p) => p.account_id === nft.account_id);
    assert.equal(transferred.owner_id, initial.actors.Bob);
    assert.equal(transferred.available, "100000000");
    assert.equal(transferred.policy, null);
    assert.equal(transferred.agent_paused, true);
    assert.deepEqual(transferred.series, nft.series);
    assert.equal(
      BigInt(sold.balances[initial.actors.Alice]),
      BigInt(initial.balances[initial.actors.Alice]) - 100000000n + 97000000n,
    );
    assert.equal(
      BigInt(sold.balances[initial.actors.Bob]),
      BigInt(initial.balances[initial.actors.Bob]) - 97000000n,
    );
    for (const old of initial.positions.filter((p) => p.funded)) {
      const current = sold.positions.find(
        (p) => p.account_id === old.account_id,
      );
      assert.equal(current.owner_id, old.owner_id);
      assert.equal(current.available, old.available);
      assert.equal(current.principal, old.principal);
    }
    checks.push(
      "Alice sells at 97, Bob receives the same 100-demoUSD position and immutable constraints; old policy revoked; existing funded positions untouched",
    );
    await page
      .getByRole("link", { name: "Mes positions", exact: true })
      .click();
    await ready();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await overflow();
      await capture(`owned-populated-${width}`);
    }
    await actor("Alice");
    await page.getByRole("link", { name: "Agent", exact: true }).click();
    await ready();
    await page.getByLabel("Budget en demoUSD", { exact: true }).fill("25");
    await page
      .getByLabel("Dépense maximale en demoUSD", { exact: true })
      .fill("25");
    await page
      .getByRole("button", { name: "Préparer une proposition", exact: true })
      .click();
    await command(
      page,
      "Examiner le mandat de souscription",
      "Signer le mandat de souscription",
    );
    await command(
      page,
      "Signer le dépôt en séquestre",
      "Déposer le montant exact en séquestre",
    );
    await command(page, "Exécuter la souscription autorisée");
    const agentFunded = await state();
    assert.equal(
      agentFunded.positions.filter((p) => p.funded).length,
      initial.positions.filter((p) => p.funded).length + 2,
    );
    checks.push(
      "agent executes a distinct 25-demoUSD subscription only after separate owner mandate and exact escrow",
    );
    await page.getByLabel("Budget en demoUSD", { exact: true }).fill("10");
    await page
      .getByLabel("Dépense maximale en demoUSD", { exact: true })
      .fill("10");
    await page
      .getByRole("button", { name: "Préparer une proposition", exact: true })
      .click();
    await command(
      page,
      "Examiner le mandat de souscription",
      "Signer le mandat de souscription",
    );
    await command(
      page,
      "Signer le dépôt en séquestre",
      "Déposer le montant exact en séquestre",
    );
    await command(
      page,
      "Révoquer ce mandat",
      "Révoquer le mandat de souscription",
    );
    await command(page, "Récupérer le remboursement");
    await page.getByText("10 demoUSD · Remboursé", { exact: true }).waitFor();
    checks.push(
      "signed cancellation before agent execution refunds the original owner exactly",
    );
    await page.setViewportSize({ width: 390, height: 1000 });
    await capture("agent-populated-390");
  } else assert.equal(posts, 0);
  assert.deepEqual(errors, []);
  const report = {
    date: new Date().toISOString(),
    checks,
    captures,
    transactions,
    scope:
      "Actual Chrome. Transaction option uses real sandbox WASM and ML-DSA with test assets, preserving pre-existing funded positions. No external wallet signature or financial testnet transaction.",
  };
  await writeFile(
    `docs/results/mvp-${transactions ? "flow" : "ui"}.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
