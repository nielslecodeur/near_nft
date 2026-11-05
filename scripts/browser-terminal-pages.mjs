import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const dir = "docs/screenshots/terminal-pages";
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
    await p.goto("http://127.0.0.1:5173/#explorer");
    await p
      .getByRole("button", { name: "Créer ma position", exact: true })
      .waitFor({ timeout: 60000 });
    assert.equal(await p.locator(".ek-nft-card").count(), 3);
    assert.equal(
      await p
        .getByRole("button", { name: "Filtres", exact: true })
        .getAttribute("aria-expanded"),
      width === 390 ? "false" : "true",
    );
    if (width === 390) {
      const boxes = await Promise.all([
        p.locator(".ek-header-search").boundingBox(),
        p.locator(".wallet-connect").boundingBox(),
        p.locator(".wallet-header-zone > .user-menu > summary").boundingBox(),
      ]);
      assert.ok(
        Math.max(...boxes.map((b) => b.y)) -
          Math.min(...boxes.map((b) => b.y)) <=
          2,
        "mobile controls share a row",
      );
    }
    assert.equal(
      await p
        .locator(".ek-nft-card")
        .filter({ hasText: "Spécimen UI" })
        .count(),
      0,
    );
    await shot(p, "explorer", width);
    // The verified library operates on real catalogue records, with no fixture imports.
    await p.getByRole("button", { name: "Vue liste", exact: true }).click();
    assert.equal(
      await p.locator(".ek-catalogue-inventory").getAttribute("data-view"),
      "list",
    );
    await p.getByLabel("Densité", { exact: true }).selectOption("compact");
    await shot(p, "list-compact", width);
    await p.getByRole("button", { name: "Vue grille", exact: true }).click();
    await p.getByLabel("Densité", { exact: true }).selectOption("comfortable");
    if (width === 390)
      await p.getByRole("button", { name: "Filtres", exact: true }).click();
    await p
      .getByRole("checkbox", { name: "Disponibles uniquement", exact: true })
      .check();
    assert.equal(await p.locator(".ek-nft-card").count(), 3);
    await p
      .getByRole("checkbox", { name: "Disponibles uniquement", exact: true })
      .uncheck();
    await p.getByRole("button", { name: "Crypto", exact: true }).click();
    assert.equal(await p.locator(".ek-nft-card").count(), 1);
    await p.getByRole("button", { name: "Toutes", exact: true }).click();
    await p
      .getByRole("searchbox", { name: "Rechercher dans le catalogue" })
      .fill("no-such-position");
    await shot(p, "empty-search", width);
    await p.getByRole("button", { name: "Réinitialiser les filtres" }).click();
    await p.getByRole("button", { name: "Filtres", exact: true }).click();
    await p.locator("#catalogue-filters").waitFor({ state: "hidden" });
    await p.getByRole("button", { name: "Filtres", exact: true }).click();
    // Global search: repeated shortcut, keyboard selection, and opening the actual detail.
    const trigger = p.getByRole("button", {
      name: "Rechercher dans Everkeep",
      exact: true,
    });
    await trigger.focus();
    await p.keyboard.press("Control+k");
    await p.keyboard.press("Control+k");
    await p.keyboard.press("Escape");
    assert.ok(await trigger.evaluate((el) => el === document.activeElement));
    await trigger.click();
    await p
      .getByRole("combobox", { name: "Nom ou identifiant" })
      .fill("Réserve");
    await p.keyboard.press("ArrowDown");
    await p.keyboard.press("Enter");
    await p.locator("#model-amount").waitFor();
    await shot(p, "model-detail", width);
    await p.locator("#model-amount").fill("25");
    await p
      .getByRole("button", { name: "Vérifier ma position", exact: true })
      .click();
    await p
      .getByRole("heading", { name: "Vérifier avant de signer", exact: true })
      .waitFor();
    assert.match(await p.locator(".review-facts").innerText(), /25 demoUSD/);
    assert.equal(await p.evaluate(() => globalThis.__qaCalls || 0), 0);
    await shot(p, "creation-review-no-signature", width);
    await p.getByRole("tab", { name: "Historique", exact: true }).click();
    await p.getByText("Historique indisponible", { exact: true }).waitFor();
    assert.equal(await p.locator(".recharts-wrapper").count(), 0);
    await shot(p, "history-unavailable", width);
    await p.getByRole("tab", { name: "Activité", exact: true }).click();
    await p
      .getByRole("link", {
        name: "Consulter le contrat sur l’explorateur NEAR",
      })
      .waitFor();
    await p.getByRole("button", { name: "Retour au catalogue" }).click();
    await p.waitForFunction(
      () => document.activeElement?.matches(".ek-art-button"),
      null,
      { timeout: 3000 },
    );
    assert.ok(
      (await p
        .locator('[data-item-key="model:liquidity-v1"] .ek-art-button')
        .evaluate((el) => el === document.activeElement)
        .catch(() => false)) ||
        (await p.locator(".ek-art-button:focus").count()) === 1,
    );
    // Unavailable models stay inspectable but cannot start a financial action.
    await p
      .getByRole("button", { name: "Voir Exposition crypto", exact: true })
      .click();
    assert.ok(
      await p
        .getByRole("button", { name: "Création indisponible", exact: true })
        .isDisabled(),
    );
    await shot(p, "inactive-model", width);
    await p.getByRole("button", { name: "Retour au catalogue" }).click();
    await p
      .getByRole("tab", { name: "Acheter une position", exact: true })
      .click();
    await shot(p, "resale-catalogue", width);
    if (await p.locator(".ek-nft-card").count()) {
      await p
        .getByRole("button", { name: "Examiner l’achat", exact: true })
        .first()
        .click();
      await p.locator(".catalogue-purchase").waitFor();
      await p
        .getByText("Prix demandé, payé au vendeur", { exact: true })
        .waitFor();
      await p
        .getByText("Actifs comptabilisés dans la position", { exact: true })
        .waitFor();
      await shot(p, "resale-detail", width);
      await p.getByRole("button", { name: "Retour au catalogue" }).click();
    }
    // Exercise the preserved wallet connection through a rejecting UI adapter only.
    await p
      .getByRole("button", { name: "Connecter un wallet", exact: true })
      .first()
      .click();
    await p
      .locator(".wallet-account-menu > summary")
      .waitFor({ timeout: 45000 });
    await p.locator(".wallet-account-menu > summary").click();
    await p
      .getByRole("button", { name: "Se déconnecter", exact: true })
      .waitFor();
    await shot(p, "wallet-connected-adapter", width);
    const panel = p.locator(".wallet-account-panel");
    const bounds = await panel.boundingBox();
    if (width === 390) {
      assert.ok(
        bounds.x >= 0 && bounds.x + bounds.width <= width,
        "wallet panel within viewport horizontally",
      );
      assert.ok(
        bounds.y >= 0 && bounds.y + bounds.height <= 1000,
        "wallet panel within viewport vertically",
      );
      assert.equal(
        await panel.evaluate((el) => getComputedStyle(el).overflowY),
        "auto",
      );
      await p
        .getByRole("button", { name: "Se déconnecter", exact: true })
        .scrollIntoViewIfNeeded();
      await shot(p, "wallet-actions-scroll", width);
    }
    await p.locator(".wallet-account-menu > summary").click();
    await p.evaluate(() =>
      history.replaceState(
        null,
        "",
        "?terminal-navigation=keep" + location.hash,
      ),
    );
    await p.getByRole("link", { name: "Positions", exact: true }).click();
    assert.equal(new URL(p.url()).search, "?terminal-navigation=keep");
    await p
      .getByRole("heading", { name: "Mes positions", exact: true })
      .waitFor();
    await shot(p, "positions", width);
    await p.getByRole("link", { name: "Agents", exact: true }).click();
    await p.getByText("Analyses payantes des modèles historiques", { exact: true }).click();
    await p.locator(".agent-missions").waitFor({ timeout: 60000 });
    await shot(p, "agents", width);
    assert.equal(
      await p.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
      true,
    );
    assert.equal(
      await p.evaluate(() => globalThis.__qaCalls || 0),
      0,
      "navigation never requests a signature",
    );
    checks.push({
      width,
      status: "pass",
      wallet:
        "UI adapter, real read-only RPC; no signature or transaction sent",
    });
    await c.close();
  }
  const c = await context(false),
    p = await c.newPage();
  await p.setViewportSize({ width: 390, height: 1000 });
  await c.route("**/api/testnet/**", (r) => r.abort());
  await c.route("https://test.rpc.fastnear.com/**", (r) =>
    r.fulfill({ status: 503, body: "unavailable" }),
  );
  await p.goto("http://127.0.0.1:5173/#market");
  await p
    .getByRole("button", { name: "Réessayer la lecture", exact: true })
    .waitFor({ timeout: 60000 });
  assert.equal(await p.locator(".ek-nft-card").count(), 0);
  await shot(p, "rpc-error", 390);
  await c.close();
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/results/terminal-pages-browser.json",
    JSON.stringify(
      {
        checks,
        captures,
        errors,
        scope:
          "Actual product pages. Wallet adapter exercises connection UI only. RPC reads are live; no financial signature, mainnet call or deployment.",
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
