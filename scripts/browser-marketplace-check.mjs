import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--disable-gpu"],
});
const checks = [],
  captures = [],
  errors = [];
const dir = ".impeccable/review/marketplace";
await mkdir(dir, { recursive: true });
const transact = process.env.MARKETPLACE_TRANSACTIONS === "1";
const state = () => fetch("http://127.0.0.1:8790/state").then((r) => r.json());
try {
  const initial = await state();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  const ready = () =>
    page
      .getByRole("heading", { name: "Réserve demoUSD", exact: true })
      .waitFor({ timeout: 60000 });
  const sheet = page.locator(".nft-detail-sheet");
  const capture = async (name) => {
    const path = `${dir}/${name}.png`;
    await page.screenshot({ path, fullPage: true });
    captures.push(path);
  };
  const noOverflow = async () =>
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  await page.goto("http://127.0.0.1:5173/#explorer");
  await ready();
  assert.deepEqual(
    await page
      .locator('nav[aria-label="Navigation principale"] a')
      .allTextContents(),
    ["Explorer", "Mes NFT"],
  );
  assert.equal(await page.locator(".strategy-card").count(), 0);
  assert.equal(await page.locator(".nft-featured").count(), 1);
  assert.equal(await page.locator(".nft-marketplace > form").count(), 0);
  checks.push(
    "NFT-first catalogue: two primary destinations, one actual demo offer, no unavailable concepts or carousel",
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await noOverflow();
    await capture(`explorer-${width}`);
    await page
      .getByRole("button", { name: "Voir le NFT", exact: true })
      .click();
    await sheet.waitFor();
    assert.ok((await sheet.innerText()).includes("6 NEAR"));
    assert.ok((await sheet.innerText()).includes("verrouillé"));
    await noOverflow();
    assert.ok(await sheet.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
    await capture(`detail-${width}`);
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "hidden" });
  }
  checks.push(
    "catalogue and contract sheet fit 320/390/768/1440; lock, maturity, technical reserve disclosed before confirmation",
  );
  await page.getByRole("button", { name: "Voir le NFT", exact: true }).focus();
  await page.keyboard.press("Enter");
  await sheet.waitFor();
  await sheet.getByLabel("Montant de votre position en demoUSD").fill("1");
  await sheet
    .getByRole("button", { name: "Préparer l’achat du NFT", exact: true })
    .click();
  await sheet.getByRole("alert").waitFor();
  assert.equal(await page.locator(".transaction-dialog[open]").count(), 0);
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Voir le NFT", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".nft-featured .nft-cover")
      .evaluate((e) => getComputedStyle(e).transitionDuration),
    "0s",
  );
  checks.push(
    "keyboard opens/closes sheet and restores focus; below-minimum amount blocked; reduced motion removes cover animation",
  );
  await page.getByRole("button", { name: "Revente", exact: true }).click();
  if (
    !initial.listings.some((l) =>
      ["Active", "Settling", "Resolving", "AwaitingIndex"].includes(l.state),
    )
  ) {
    await page
      .getByRole("heading", { name: "Aucun NFT en revente pour le moment." })
      .waitFor();
    await capture("resale-empty");
    checks.push(
      "empty resale contains no fabricated offers and links back to issuance",
    );
  }
  await page.getByRole("button", { name: "Nouveaux NFT", exact: true }).click();
  await page.getByRole("link", { name: /Besoin d’aide pour choisir/ }).click();
  await page.waitForURL(/#agent$/);
  await page.getByRole("link", { name: "Explorer", exact: true }).click();
  await ready();
  checks.push(
    "optional agent assistance remains accessible outside primary navigation",
  );

  async function confirm(heading) {
    const dialog = page.locator(".transaction-dialog");
    await dialog.getByRole("heading", { name: heading, exact: true }).waitFor();
    await dialog
      .getByRole("button", { name: "Confirmer en sandbox", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden", timeout: 120000 });
  }
  if (transact) {
    await page
      .getByRole("button", { name: "Voir le NFT", exact: true })
      .click();
    await sheet.getByLabel("Montant de votre position en demoUSD").fill("20");
    await sheet
      .getByRole("button", { name: "Préparer l’achat du NFT", exact: true })
      .click();
    await confirm("Acheter le NFT à l’émission");
    await page.waitForURL(/#positions$/);
    const bought = await state();
    const position = bought.positions.find(
      (p) =>
        p.funded &&
        !initial.positions.some(
          (old) => old.funded && old.account_id === p.account_id,
        ),
    );
    assert.ok(position, "a distinct NFT was funded");
    assert.equal(position.owner_id, initial.actors.Alice);
    const card = page
      .locator("article.position")
      .filter({ has: page.getByText(position.account_id, { exact: true }) });
    await card.waitFor();
    await card.getByLabel("Prix en demoUSD", { exact: true }).fill("19");
    await card
      .getByRole("button", { name: "Mettre en vente", exact: true })
      .click();
    await confirm("Mettre en vente");
    await page.getByRole("link", { name: "Explorer", exact: true }).click();
    await page.getByRole("button", { name: "Revente", exact: true }).click();
    const offer = page.locator(".nft-sale-card").filter({
      has: page.getByRole("heading", {
        name: position.account_id.split(".")[0],
        exact: true,
      }),
    });
    await offer.waitFor();
    await capture("resale-populated");
    await page.getByText("Mon compte", { exact: true }).click();
    await page
      .getByLabel("Compte de démo", { exact: true })
      .selectOption("Bob");
    await page.getByText("Mon compte", { exact: true }).click();
    await offer
      .getByRole("button", { name: "Voir le NFT", exact: true })
      .click();
    assert.ok((await sheet.innerText()).includes("19 demoUSD"));
    await sheet
      .getByRole("button", { name: "Préparer l’achat du NFT", exact: true })
      .click();
    await confirm("Acheter la position");
    const sold = await state();
    assert.equal(
      sold.positions.find((p) => p.account_id === position.account_id).owner_id,
      initial.actors.Bob,
    );
    for (const old of initial.positions.filter((p) => p.funded)) {
      assert.equal(
        sold.positions.find((p) => p.account_id === old.account_id).owner_id,
        old.owner_id,
      );
    }
    checks.push(
      "real sandbox: Alice purchases a new 20 demoUSD NFT, lists at 19, Bob buys through Explorer; existing funded NFTs preserved",
    );
    await page.getByRole("link", { name: "Mes NFT", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 1000 });
    await noOverflow();
    await capture("owned-nft-390");
  }
  assert.deepEqual(errors, []);
  const report = {
    date: new Date().toISOString(),
    checks,
    captures,
    transactions: transact,
    scope:
      "Actual local Chrome. Optional transactions use real sandbox WASM and test assets only; no external wallet login or financial testnet transaction.",
  };
  await writeFile(
    `docs/results/marketplace-${transact ? "flow" : "ui"}.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
