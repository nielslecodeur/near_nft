import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const dir = "docs/screenshots/workspaces";
await mkdir(dir, { recursive: true });
const captures = [],
  checks = [],
  errors = [];
const rpcCache = new Map();
const b = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--disable-gpu"],
});
async function context(wallet = false, motion = "reduce") {
  const c = await b.newContext({ reducedMotion: motion, hasTouch: true });
  await c.route("https://test.rpc.fastnear.com/**", async (route) => {
    try {
      const body = route.request().postDataJSON();
      assert.ok(
        ["status", "block", "query"].includes(body.method),
        "read-only QA RPC",
      );
      const key = JSON.stringify({ method: body.method, params: body.params });
      if (!rpcCache.has(key))
        rpcCache.set(
          key,
          (async () => {
            const r = await fetch("https://testnet-rpc.intea.rs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(20000),
            });
            assert.equal(r.status, 200);
            const value = await r.text();
            assert.ok(!JSON.parse(value).error, value);
            return value;
          })(),
        );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: await rpcCache.get(key),
      });
    } catch (e) {
      if (!/disposed|closed/i.test(String(e))) throw e;
    }
  });
  if (wallet) {
    await c.route(/\/src\/client\.ts(?:\?.*)?$/, async (route) => {
      const r = await route.fetch(),
        s = await r.text(),
        changed = s.replace(
          /export async function walletSelector\(\)\s*\{[\s\S]*?(?=export async function connect)/,
          "export async function walletSelector(){return globalThis.__qaConnector;}\n",
        );
      assert.notEqual(changed, s);
      await route.fulfill({ response: r, body: changed });
    });
    await c.addInitScript(() => {
      const listeners = new Map();
      let signed = sessionStorage.getItem("qa-signed") === "yes";
      const owner = "nifelst.testnet",
        wallet = {
          manifest: {
            id: "intear-wallet",
            features: { signAndSendTransactions: true },
          },
          getAccounts: async () => (signed ? [{ accountId: owner }] : []),
          signAndSendTransaction: async () => {
            globalThis.__qaCalls = (globalThis.__qaCalls || 0) + 1;
            throw Error("User rejected signature (explicit UI fixture)");
          },
          signAndSendTransactions: async () => {
            globalThis.__qaCalls = (globalThis.__qaCalls || 0) + 1;
            throw Error("User rejected signature (explicit UI fixture)");
          },
        };
      globalThis.__qaConnector = {
        network: "testnet",
        on: (n, f) => listeners.set(n, f),
        off: (n) => listeners.delete(n),
        wallet: async () => wallet,
        connect: async () => {
          signed = true;
          sessionStorage.setItem("qa-signed", "yes");
          listeners.get("wallet:signIn")?.({
            accounts: [{ accountId: owner }],
          });
          return wallet;
        },
        getConnectedWallet: async () => {
          if (!signed) throw Error("Not connected");
          return { wallet, accounts: [{ accountId: owner }] };
        },
        disconnect: async () => {
          signed = false;
          sessionStorage.removeItem("qa-signed");
          listeners.get("wallet:signOut")?.();
        },
      };
    });
  }
  return c;
}
async function shot(p, name, width) {
  await p.waitForFunction(
    () =>
      !document.querySelector(
        'main[aria-busy="true"], .agent-missions[aria-busy="true"]',
      ),
  );
  await p.evaluate(() => document.fonts.ready);
  await p
    .locator(".ek-card-frame img")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode())),
    );
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await p.waitForTimeout(100);
  assert.equal(
    await p.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    ),
    false,
    name + " overflow",
  );
  const path = dir + "/" + name + "-" + width + ".png";
  await p.screenshot({ path, fullPage: true, animations: "disabled" });
  captures.push(path);
}

try {
  for (const width of [1440, 390]) {
    const c = await context(true),
      p = await c.newPage();
    await p.setViewportSize({ width, height: 1000 });
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto("http://127.0.0.1:5173/#positions");
    await p.locator(".community-empty").waitFor({ timeout: 60000 });
    await shot(p, "disconnected", width);
    await p
      .locator(".community-empty")
      .getByRole("button", { name: "Connecter un wallet", exact: true })
      .click();
    await p.locator(".ek-token-balances").waitFor({ timeout: 60000 });
    await p.locator(".owned-position").first().waitFor();
    const owned = await p.locator(".owned-position").count();
    assert.ok(owned > 0);
    await shot(p, "wallet-assets", width);
    if (width === 390) {
      assert.deepEqual(
        await p.locator(".ek-owned-cell-label").allTextContents(),
        ["Dans les positions", "Retirable maintenant", "NFT"],
      );
      assert.ok(
        await p
          .locator(".ek-owned-table-scroll")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        "mobile ledger exposes every value without horizontal scrolling",
      );
    }
    await p.getByText("Montant exact en NEAR", { exact: true }).click();
    assert.match(await p.locator(".ek-wallet-exact").innerText(), /NEAR/);
    await shot(p, "wallet-exact-amount", width);
    await p.getByText("Montant exact en NEAR", { exact: true }).click();
    await p.getByRole("button", { name: "Recevoir", exact: true }).click();
    await p.locator("#wallet-receive").waitFor();
    await shot(p, "receive", width);
    await p.getByRole("button", { name: "Recevoir", exact: true }).click();
    await p
      .getByRole("button", { name: "Voir ma position", exact: true })
      .first()
      .click();
    await p.locator(".owned-detail").waitFor();
    if (await p.getByText(/Retrait verrouillé jusqu’au/).count())
      assert.ok(
        await p
          .getByRole("button", {
            name: "Retirer les fonds disponibles",
            exact: true,
          })
          .isDisabled(),
      );
    await shot(p, "withdraw-details", width);
    await p.getByRole("button", { name: "Gérer l’agent", exact: true }).click();
    await shot(p, "position-permissions", width);
    await p
      .getByRole("button", { name: "Vendre la position", exact: true })
      .click();
    await shot(p, "position-sale", width);
    await p.getByRole("tab", { name: /Collection/ }).click();
    await p.locator(".ek-owned-card-grid .ek-position-card").first().waitFor();
    assert.equal(await p.locator(".ek-owned-card-grid .ek-position-card").count(), owned);
    await shot(p, "collection", width);
    await p
      .getByRole("searchbox", { name: "Rechercher dans mes cartes" })
      .fill("absent-nft-zzzz");
    assert.equal(await p.locator(".ek-owned-card-grid .ek-position-card").count(), 0);
    await shot(p, "collection-empty-filter", width);
    await p
      .getByRole("button", { name: "Réinitialiser la collection", exact: true })
      .click();
    await p.locator(".ek-owned-card-grid .ek-position-art").first().click();
    await p.locator(".owned-detail").waitFor();
    await p.waitForFunction(() =>
      document.activeElement?.matches(".owned-position"),
    );
    await shot(p, "collection-inspect", width);
    await p.getByRole("tab", { name: /Collection/ }).focus();
    await p.keyboard.press("ArrowLeft");
    assert.equal(
      await p
        .getByRole("tab", { name: "Actifs", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await p.getByRole("link", { name: "Agents", exact: true }).click();
    await p.getByText("Analyses payantes des modèles historiques", { exact: true }).click();
    await p.locator(".ek-expert-option").first().waitFor({ timeout: 60000 });
    assert.equal(await p.locator(".ek-expert-option").count(), 3);
    await shot(p, "agents", width);
    await p.getByRole("button", { name: /Spécialiste crypto/ }).click();
    assert.equal(
      await p
        .getByRole("button", { name: /Spécialiste crypto/ })
        .getAttribute("aria-pressed"),
      "true",
    );
    await shot(p, "crypto-selected", width);
    await p.getByRole("button", { name: /Analyste liquidité/ }).click();
    await p
      .getByRole("textbox", { name: "Que souhaitez-vous faire ?" })
      .fill(
        "J’ai 50 demoUSD, je veux garder 15 disponibles et peux attendre 30 jours jusqu’à l’échéance",
      );
    await p
      .getByRole("button", { name: "Préparer ma demande", exact: true })
      .click();
    await p.locator(".conversation-quote").waitFor();
    await shot(p, "agent-request-ready", width);
    await p
      .getByRole("button", { name: "Examiner et payer l’analyse", exact: true })
      .click();
    await p.locator("dialog[open]").waitFor();
    await shot(p, "agent-confirm-review", width);
    await p
      .locator("dialog[open]")
      .getByRole("button", { name: "Annuler", exact: true })
      .click();
    assert.equal(
      await p.evaluate(() => globalThis.__qaCalls || 0),
      0,
      "no financial signature sent",
    );
    checks.push({
      width,
      ownedCards: owned,
      wallet: "UI adapter with live read-only data; no signatures",
      status: "pass",
    });
    await c.close();
  }
  const c = await context(true),
    p = await c.newPage();
  await p.setViewportSize({ width: 390, height: 1000 });
  let fail = true,
    release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await c.route("https://test.rpc.fastnear.com/**", async (route) => {
    const request = route.request().postDataJSON();
    if (
      fail &&
      request.params?.request_type === "view_account" &&
      request.params?.account_id === "nifelst.testnet"
    ) {
      await gate;
      await route.fulfill({
        status: 503,
        body: "QA wallet balance read unavailable",
      });
    } else await route.fallback();
  });
  await p.goto("http://127.0.0.1:5173/#positions");
  await p.locator(".community-empty").waitFor({ timeout: 60000 });
  await p
    .locator(".community-empty")
    .getByRole("button", { name: "Connecter un wallet", exact: true })
    .click();
  await p.locator(".ek-wallet-skeletons").waitFor({ timeout: 60000 });
  await shot(p, "wallet-loading", 390);
  release();
  await p
    .getByText("Soldes du wallet indisponibles", { exact: true })
    .waitFor();
  await shot(p, "wallet-balance-error", 390);
  fail = false;
  await p
    .getByRole("button", { name: "Relire les soldes", exact: true })
    .click();
  await p.locator(".ek-token-balances").waitFor({ timeout: 45000 });
  await shot(p, "wallet-recovered", 390);
  checks.push({
    width: 390,
    status: "pass",
    fixture:
      "Held wallet-only read then HTTP503; explicit retry resumes real read-only RPC",
  });
  await c.close();
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/results/workspaces-browser.json",
    JSON.stringify(
      {
        checks,
        captures,
        errors,
        scope:
          "Actual positions, owned NFT collection and agents, real read-only RPC and UI-only wallet adapter. Confirmation cancelled without signing.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({ checks, captures: captures.length, errors }, null, 2),
  );
} finally {
  await b.close();
}
