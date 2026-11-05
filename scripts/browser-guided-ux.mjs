import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const dir = ".impeccable/review/ux-guided";
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
async function context(wallet = false) {
  const c = await b.newContext({ reducedMotion: "reduce" });
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
            throw Error("User rejected signature (explicit UI fixture)");
          },
          signAndSendTransactions: async () => {
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
  await p.waitForTimeout(100);
  assert.equal(
    await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    name + " overflow",
  );
  const path = dir + "/" + name + "-" + width + ".png";
  await p.screenshot({ path, fullPage: true, animations: "disabled" });
  captures.push(path);
}
try {
  for (const width of [390, 768, 1440]) {
    const c = await context(true),
      p = await c.newPage();
    await p.setViewportSize({ width, height: 1000 });
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto("http://127.0.0.1:5173/#explorer");
    await p
      .locator(".catalogue-price")
      .filter({ hasText: "10 demoUSD" })
      .waitFor({ timeout: 60000 });
    assert.equal(await p.locator(".catalogue-position-id").count(), 0);
    await shot(p, "discover", width);
    await p
      .getByRole("link", {
        name: "Voir le modèle Réserve demoUSD",
        exact: true,
      })
      .click();
    await p.getByLabel("Montant en demoUSD", { exact: true }).fill("25");
    await p
      .getByRole("button", { name: "Vérifier ma position", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Connecter pour créer", exact: true })
      .waitFor();
    await shot(p, "create-disconnected", width);
    await p
      .getByRole("button", { name: "Connecter pour créer", exact: true })
      .click();
    await p.locator(".wallet-account-menu").waitFor();
    await p
      .getByRole("button", { name: "Obtenir des fonds de test", exact: true })
      .waitFor();
    assert.equal(
      await p.getByLabel("Montant en demoUSD", { exact: true }).inputValue(),
      "25",
    );
    await shot(p, "create-funding", width);
    await p
      .getByRole("button", { name: "Obtenir des fonds de test", exact: true })
      .click();
    await p
      .getByRole("link", { name: "Ouvrir le faucet NEAR officiel" })
      .waitFor();
    await p
      .getByRole("button", { name: "Revenir à mon action", exact: true })
      .click();
    assert.equal(
      await p.getByLabel("Montant en demoUSD", { exact: true }).inputValue(),
      "25",
    );
    await p.reload();
    await p
      .getByRole("button", { name: "Obtenir des fonds de test", exact: true })
      .waitFor();
    assert.equal(
      await p.getByLabel("Montant en demoUSD", { exact: true }).inputValue(),
      "25",
    );
    checks.push(
      width +
        ": discovery, connect with public wallet adapter, original model/amount/review restored, funding links and return, reload preserved; no signature sent",
    );
    await p
      .getByRole("tab", { name: "Acheter une position", exact: true })
      .click();
    await p.locator(".catalogue-card").first().waitFor();
    assert.equal(await p.locator(".catalogue-model-detail").count(), 0);
    await p
      .getByRole("button", { name: "Voir la composition", exact: true })
      .first()
      .click();
    await p
      .getByRole("button", { name: "Voir la position", exact: true })
      .first()
      .click();
    await shot(p, "buy-detail", width);
    await p.getByRole("link", { name: "Mes positions", exact: true }).click();
    await p.locator(".owned-position").waitFor();
    await p
      .getByRole("button", { name: "Voir ma position", exact: true })
      .first()
      .click();
    await shot(p, "owned-withdraw-locked", width);
    assert.equal(
      await p
        .getByRole("button", {
          name: "Retirer les fonds disponibles",
          exact: true,
        })
        .isDisabled(),
      true,
    );
    await p
      .getByRole("button", { name: "Vendre la position", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Vérifier la mise en vente", exact: true })
      .click();
    await p.locator("dialog[open]").waitFor();
    assert.match(await p.locator("dialog[open]").innerText(), /gèle/);
    await shot(p, "sale-review", width);
    await p.keyboard.press("Escape");
    await p.getByRole("link", { name: "Agents", exact: true }).click();
    await p
      .getByLabel("Que souhaitez-vous faire ?", { exact: true })
      .waitFor({ timeout: 60000 });
    await shot(p, "agent", width);
    await p
      .getByRole("button", {
        name: "Explique-moi les différences entre ces modèles.",
        exact: true,
      })
      .click();
    await p
      .getByRole("button", { name: "Préparer ma demande", exact: true })
      .click();
    assert.match(
      await p.locator(".conversation-thread").innerText(),
      /gratuite/,
    );
    assert.equal(await p.locator(".conversation-quote").count(), 0);
    await p
      .getByLabel("Que souhaitez-vous faire ?", { exact: true })
      .fill("J’ai 50 demoUSD, garder 15 disponibles, 30 jours à échéance");
    await p
      .getByRole("button", { name: "Préparer ma demande", exact: true })
      .click();
    await p.locator(".conversation-quote").waitFor();
    assert.match(await p.locator(".conversation-quote").innerText(), /35|15/);
    await shot(p, "agent-request", width);
    await p.reload();
    await p.locator(".conversation-quote").waitFor({ timeout: 60000 });
    checks.push(
      width +
        ": separate resale details and actual listing; real nifelst position read, locked withdrawal, guarded sale review; free explanation, exact agent reserve and paid review restored",
    );
    const outage = (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "429 RPC unavailable — explicit recovery fixture",
        }),
      });
    await c.route("https://test.rpc.fastnear.com/**", outage);
    await p.reload();
    await p
      .getByRole("button", { name: "Actualiser le suivi", exact: true })
      .waitFor();
    await shot(p, "rpc-error", width);
    await c.unroute("https://test.rpc.fastnear.com/**", outage);
    await p
      .getByRole("button", { name: "Actualiser le suivi", exact: true })
      .click();
    await p.locator(".conversation-quote").waitFor({ timeout: 60000 });
    checks.push(
      width +
        ": explicit RPC 429 fixture recovers the exact unpaid request without sending a transaction",
    );
    await c.close();
  }
  // Explicit component fixtures exercise eligible and pending states without
  // changing time, balances, ownership, keys or contracts on the real network.
  const c = await context(),
    p = await c.newPage();
  await p.goto("http://127.0.0.1:5173/#explorer");
  await p.locator(".catalogue-card").first().waitFor({ timeout: 60000 });
  await p.evaluate(async () => {
    const { readTestnetState } = await import("/src/testnet-state.ts");
    globalThis.__fixtureState = await readTestnetState("nifelst.testnet");
  });
  for (const width of [390, 768, 1440]) {
    await p.setViewportSize({ width, height: 1000 });
    await p.evaluate(async () => {
      const React = (await import("/node_modules/.vite/deps/react.js")).default,
        DOM = (await import("/node_modules/.vite/deps/react-dom_client.js"))
          .default,
        { TestnetPositions } = await import("/src/TestnetPositions.tsx");
      document.querySelector("#root").style.display = "none";
      document.querySelector("#fixture")?.remove();
      const n = document.createElement("main");
      n.id = "fixture";
      n.className = "orbite-app";
      n.style.padding = "24px";
      document.body.append(n);
      const state = structuredClone(globalThis.__fixtureState);
      state.now = (
        BigInt(
          state.positions.find((p) => p.owner_id === "nifelst.testnet").series
            .terms.matures_at,
        ) + 1n
      ).toString();
      const root = DOM.createRoot(n);
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "p",
            null,
            "Cas UI simulé — échéance atteinte. Aucune opération envoyée.",
          ),
          React.createElement(TestnetPositions, {
            data: state,
            owner: "nifelst.testnet",
            working: false,
            ask: (c) => {
              globalThis.__asked = c;
            },
            onRefresh: () => {},
          }),
        ),
      );
    });
    if (
      await p
        .getByRole("button", { name: "Voir ma position", exact: true })
        .count()
    )
      await p
        .getByRole("button", { name: "Voir ma position", exact: true })
        .first()
        .click();
    await p
      .getByRole("button", {
        name: "Retirer les fonds disponibles",
        exact: true,
      })
      .click();
    assert.equal(await p.evaluate(() => globalThis.__asked.action), "withdraw");
    await shot(p, "fixture-mature-withdraw", width);
  }
  checks.push(
    "Explicit matured component fixtures: 25 demoUSD withdrawable to current owner; UI command bound to existing ask callback only. No real withdrawal or on-chain maturity changed.",
  );
  await c.close();
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/results/guided-ux-browser.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks,
        captures,
        errors,
        limits: [
          "Wallet connection uses a public-address UI adapter, no Intear popup approval tested.",
          "Creation and sale checked through review only; no financial mutation sent.",
          "Real withdrawal locked until 11 November 2026; eligible UI tested with labelled fixture.",
          "Faucet external link and return tested; no new grant sent.",
          "Responsive matrix uses real read-only Intear RPC responses cached at one final block. Production RPC configuration is unchanged.",
        ],
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, captures, errors }));
} catch (e) {
  for (const c of b.contexts())
    for (const p of c.pages()) {
      console.error((await p.locator("body").innerText()).slice(0, 10000));
      console.error(
        await p.evaluate(() =>
          Object.fromEntries(Object.entries(sessionStorage)),
        ),
      );
      await p.screenshot({ path: dir + "/failure.png", fullPage: true });
    }
  throw e;
} finally {
  await b.close();
}
