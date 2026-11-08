import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const dir = "docs/screenshots/position-cards";
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

const { readFile } = await import("node:fs/promises");
await mkdir(".research", { recursive: true });
await writeFile(
  ".research/position-cards.html",
  `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/design/tokens.css"><link rel="stylesheet" href="/design/components.css"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/position-card-states.tsx"></script></body></html>`,
);
async function flip(p, card, width, name) {
  const height = await card.evaluate((el) => el.getBoundingClientRect().height);
  await card
    .getByRole("button", { name: "Voir la composition", exact: true })
    .focus();
  await p.keyboard.press("Enter");
  await card
    .getByRole("button", { name: "Revenir au visuel", exact: true })
    .waitFor();
  assert.ok(
    await card
      .getByRole("button", { name: "Revenir au visuel", exact: true })
      .evaluate((el) => el === document.activeElement),
  );
  assert.equal(
    await card
      .getByRole("button", { name: "Voir la composition", exact: true })
      .count(),
    0,
    "hidden face absent from accessibility tree",
  );
  assert.ok(
    Math.abs(
      height - (await card.evaluate((el) => el.getBoundingClientRect().height)),
    ) < 1,
    "no flip layout shift",
  );
  assert.equal(
    await card.locator(".ek-position-front").getAttribute("inert"),
    "",
  );
  await shot(p, name, width);
  await card
    .getByRole("button", { name: "Revenir au visuel", exact: true })
    .click();
}
try {
  for (const width of [1440, 768, 390]) {
    const c = await context(true),
      p = await c.newPage();
    await p.setViewportSize({ width, height: 1000 });
    p.on("pageerror", (e) => errors.push(String(e)));
    await c.addInitScript(() => sessionStorage.setItem("everkeep.ui.v1:explore-category", "all"));
    await p.goto("http://127.0.0.1:5173/#explorer");
    await p.locator(".ek-position-card").first().waitFor({ timeout: 60000 });
    assert.equal(await p.locator(".ek-position-card").count(), 5);
    assert.equal(
      await p.locator(".ek-position-history").count(),
      0,
      "no invented production history",
    );
    await shot(p, "explorer-front", width);
    const favorite = p.getByRole("button", {
      name: "Ajouter Réserve demoUSD aux favoris",
      exact: true,
    });
    await favorite.click();
    assert.equal(
      await p
        .getByRole("button", {
          name: "Retirer Réserve demoUSD des favoris",
          exact: true,
        })
        .getAttribute("aria-pressed"),
      "true",
    );
    await p
      .getByRole("button", {
        name: "Retirer Réserve demoUSD des favoris",
        exact: true,
      })
      .click();
    if (width !== 390) {
      const bounds = await p
        .locator(".ek-position-card")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getBoundingClientRect().height),
        );
      assert.ok(
        Math.max(...bounds) - Math.min(...bounds) < 1,
        "same-row grid cards have equal heights",
      );
      const bottoms = await p
        .locator(".ek-position-card .ek-position-front .ek-position-actions")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getBoundingClientRect().bottom),
        );
      assert.ok(
        Math.max(...bottoms) - Math.min(...bottoms) < 1,
        "grid actions share a baseline",
      );
    }
    await p.getByRole("button", { name: "Vue liste", exact: true }).click();
    await p.getByLabel("Densité", { exact: true }).selectOption("compact");
    assert.ok(
      (
        await p
          .locator(".ek-position-card .ek-position-art")
          .first()
          .boundingBox()
      ).width <= 208,
      "list thumbnails stay compact",
    );
    assert.ok(
      (await p.locator(".ek-position-card").first().boundingBox()).height <=
        (width === 390 ? 306 : 242),
      "list row stays compact",
    );
    assert.ok(
      await p
        .locator(".ek-position-actions .ek-button")
        .evaluateAll((buttons) =>
          buttons.every(
            (button) => button.scrollWidth <= button.clientWidth + 1,
          ),
        ),
      "list action labels stay within their buttons",
    );
    assert.ok(
      await p.locator(".ek-position-card").evaluateAll((cards) =>
        cards.every((card) => {
          const bounds = card.getBoundingClientRect();
          return [
            ...card.querySelectorAll(
              ".ek-position-front .ek-position-actions button",
            ),
          ].every((button) => {
            const box = button.getBoundingClientRect();
            return box.top >= bounds.top && box.bottom <= bounds.bottom - 8;
          });
        }),
      ),
      "both list actions remain fully visible with bottom padding",
    );
    await shot(p, "list-compact", width);
    await p.getByRole("button", { name: "Vue grille", exact: true }).click();
    await p.getByLabel("Densité", { exact: true }).selectOption("comfortable");
    await flip(
      p,
      p.locator(".ek-position-card").last(),
      width,
      "official-composition",
    );
    await p
      .getByRole("button", { name: "Voir Réserve demoUSD", exact: true })
      .click();
    await p.locator("#model-amount").waitFor();
    await shot(p, "model-detail", width);
    await p
      .getByRole("button", { name: "Retour au catalogue", exact: true })
      .click();
    await p.getByRole("link", { name: "Positions", exact: true }).click();
    await p.locator(".community-empty").waitFor();
    await p
      .locator(".community-empty")
      .getByRole("button", { name: "Connecter un wallet", exact: true })
      .click();
    await p.locator(".owned-position").first().waitFor({ timeout: 60000 });
    await p.getByRole("tab", { name: /Collection/ }).click();
    await p.locator(".ek-owned-card-grid .ek-position-card").first().waitFor();
    await shot(p, "owned-collection", width);
    await flip(
      p,
      p.locator(".ek-position-card").first(),
      width,
      "owned-composition",
    );
    await p
      .getByRole("button", { name: "Consulter la position", exact: true })
      .first()
      .click();
    await p.locator(".owned-detail").waitFor();
    await p.locator(".ek-position-facts").waitFor();
    assert.match(
      await p.locator(".ek-position-facts").innerText(),
      /Valeur indicative\s+Non disponible/,
    );
    await shot(p, "owned-detail", width);
    assert.equal(await p.evaluate(() => globalThis.__qaCalls || 0), 0);
    await c.close();
    const fc = await b.newContext({ reducedMotion: "reduce", hasTouch: true }),
      fp = await fc.newPage();
    await fp.setViewportSize({ width, height: 1000 });
    fp.on("pageerror", (e) => errors.push(String(e)));
    await fp.goto("http://127.0.0.1:5173/.research/position-cards.html");
    await fp.locator(".ek-position-card").first().waitFor();
    await fp.getByText("Visuel indisponible", { exact: true }).waitFor();
    await shot(fp, "edge-states", width);
    const missing = fp.getByRole("article", {
      name: "Image manquante",
      exact: true,
    });
    await flip(fp, missing, width, "missing-image-composition");
    const card = fp.getByRole("article", { name: "Hausse", exact: true });
    await card
      .getByRole("button", { name: "Voir la composition", exact: true })
      .tap();
    assert.equal(await card.getAttribute("data-flipped"), "true");
    assert.equal(
      await card
        .locator(".ek-position-back")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
      "0s",
    );
    await card
      .getByRole("button", { name: "Voir la fiche complète", exact: true })
      .click();
    await fp.getByText("Fiche ouverte : Hausse", { exact: true }).waitFor();
    await fc.close();
  }
  const ec = await b.newContext({ reducedMotion: "reduce" }),
    ep = await ec.newPage();
  await ep.setViewportSize({ width: 390, height: 1000 });
  let release;
  const gate = new Promise((r) => (release = r));
  let failing = true;
  await ec.route("https://test.rpc.fastnear.com/**", async (route) => {
    await gate;
    await route
      .fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"QA unavailable"}',
      })
      .catch(() => {});
  });
  await ep.goto("http://127.0.0.1:5173/#market");
  await ep
    .getByRole("status")
    .filter({ hasText: "Lecture des annonces sur NEAR" })
    .waitFor();
  await ep.evaluate(() => document.fonts.ready);
  await ep.screenshot({
    path: dir + "/network-loading-390.png",
    fullPage: true,
    animations: "disabled",
  });
  captures.push(dir + "/network-loading-390.png");
  release();
  await ep
    .getByRole("heading", {
      name: "Les annonces n’ont pas pu être chargées.",
      exact: true,
    })
    .waitFor({ timeout: 60000 });
  await shot(ep, "network-error", 390);
  assert.equal(
    await ep
      .getByRole("button", { name: "Réessayer la lecture", exact: true })
      .count(),
    1,
  );
  await ec.close();
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/results/position-cards-browser.json",
    JSON.stringify(
      {
        captures,
        errors,
        checks: [
          "1440/768/390",
          "official/owned/fixture listing",
          "grid/list/density",
          "keyboard focus/inert/stable height",
          "touch/reduced motion",
          "up/down/stable/absent history",
          "long amount/missing image/actual network loading/error",
          "existing owned detail/no signatures",
        ],
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ captures: captures.length, errors }));
} finally {
  await b.close();
}
