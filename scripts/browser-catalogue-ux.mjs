import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const dir = ".impeccable/review/catalogue";
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
    assert.equal(
      await p.getByRole("heading", { name: "Explorer", exact: true }).count(),
      1,
    );
    assert.equal(await p.locator(".catalogue-card").count(), 3);
    assert.equal(
      await p.locator(".strategy-merry, .market-heading").count(),
      0,
    );
    assert.ok(
      (await p.locator(".catalogue-image").first().boundingBox()).y < 1000,
    );
    for (const img of await p.locator(".catalogue-image img").all())
      assert.ok(await img.evaluate((i) => i.complete && i.naturalWidth > 0));
    await shot(p, "fronts", width);
    const reserve = p.getByRole("article", {
        name: "Réserve demoUSD",
        exact: true,
      }),
      flip = reserve.getByRole("button", {
        name: "Voir la composition",
        exact: true,
      });
    const before = await reserve.boundingBox(),
      neighbour = await p.locator(".catalogue-card").first().boundingBox(),
      scrollBefore = await p.evaluate(() => scrollY);
    await flip.tap();
    assert.equal(
      await reserve
        .getByRole("link", {
          name: "Voir le modèle Réserve demoUSD",
          exact: true,
        })
        .count(),
      0,
    );
    assert.equal(
      await reserve.locator(".catalogue-front").getAttribute("aria-hidden"),
      "true",
    );
    assert.equal(
      await reserve.locator(".catalogue-front").evaluate((e) => e.inert),
      true,
    );
    assert.ok(
      await reserve
        .getByRole("button", { name: "Revenir au visuel", exact: true })
        .evaluate((e) => e === document.activeElement),
    );
    assert.ok(
      Math.abs((await reserve.boundingBox()).height - before.height) < 1,
    );
    assert.ok(
      Math.abs(
        (await p.locator(".catalogue-card").first().boundingBox()).y +
          (await p.evaluate(() => scrollY)) -
          neighbour.y -
          scrollBefore,
      ) < 1,
    );
    assert.equal(
      await reserve
        .locator(".catalogue-back")
        .evaluate((e) => e.scrollHeight > e.clientHeight + 1),
      false,
    );
    await shot(p, "composition", width);
    await reserve
      .getByRole("button", { name: "Revenir au visuel", exact: true })
      .press("Enter");
    assert.ok(await flip.evaluate((e) => e === document.activeElement));
    await flip.press("Enter");
    assert.ok((await reserve.getAttribute("class")).includes("instant-flip"));
    await reserve
      .getByRole("link", { name: "Fiche complète", exact: true })
      .click();
    await p.getByLabel("Montant en demoUSD", { exact: true }).waitFor();
    assert.equal(await p.locator(".catalogue-grid").count(), 0);
    assert.ok(
      await p
        .locator(".catalogue-detail")
        .evaluate((e) => e === document.activeElement),
    );
    await p.getByLabel("Montant en demoUSD", { exact: true }).fill("25");
    await p
      .getByRole("button", { name: "Vérifier ma position", exact: true })
      .click();
    await shot(p, "model-review", width);
    await p
      .getByRole("button", { name: "Connecter pour créer", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Obtenir des fonds de test", exact: true })
      .waitFor({ timeout: 60000 });
    assert.equal(
      await p.getByLabel("Montant en demoUSD", { exact: true }).inputValue(),
      "25",
    );
    assert.equal(await p.evaluate(() => globalThis.__qaCalls || 0), 0);
    await shot(p, "creation-resumed", width);
    await p.reload();
    await p
      .getByRole("button", { name: "Obtenir des fonds de test", exact: true })
      .waitFor({ timeout: 60000 });
    assert.equal(
      await p.getByLabel("Montant en demoUSD", { exact: true }).inputValue(),
      "25",
    );
    await p
      .getByRole("button", { name: "Retour au catalogue", exact: true })
      .click();
    await p
      .getByRole("searchbox", {
        name: "Rechercher dans le catalogue",
        exact: true,
      })
      .fill("réserve");
    assert.equal(await p.locator(".catalogue-card").count(), 1);
    await p.getByRole("button", { name: "Crypto", exact: true }).click();
    await p
      .getByRole("heading", {
        name: "Aucun résultat dans cette sélection.",
        exact: true,
      })
      .waitFor();
    await shot(p, "no-results", width);
    await p
      .getByRole("button", { name: "Réinitialiser les filtres", exact: true })
      .click();
    assert.equal(await p.locator(".catalogue-card").count(), 3);
    await p.getByLabel("Thème", { exact: true }).selectOption("Protocoles");
    assert.equal(await p.locator(".catalogue-card").count(), 1);
    await p.getByRole("button", { name: "Liquidité", exact: true }).click();
    assert.equal(await p.locator(".catalogue-card").count(), 0);
    await p
      .getByRole("button", { name: "Réinitialiser les filtres", exact: true })
      .click();
    await p
      .getByRole("tab", { name: "Créer une position", exact: true })
      .focus();
    await p.keyboard.press("ArrowRight");
    await p.locator(".catalogue-card").waitFor();
    assert.equal(await p.locator(".catalogue-card").count(), 1);
    await p
      .getByRole("button", { name: "Voir la composition", exact: true })
      .click();
    assert.match(
      await p.locator(".catalogue-back").innerText(),
      /réellement comptabilisés/,
    );
    assert.match(await p.locator(".catalogue-back").innerText(), /Lecture du/);
    await shot(p, "listing-composition", width);
    await p
      .getByRole("button", { name: "Voir la position", exact: true })
      .click();
    await p.getByRole("button", { name: "Acheter", exact: true }).waitFor();
    assert.match(
      await p.locator(".catalogue-purchase").innerText(),
      /11 demoUSD/,
    );
    assert.match(
      await p.locator(".catalogue-purchase").innerText(),
      /10 demoUSD/,
    );
    await p.getByRole("button", { name: "Acheter", exact: true }).click();
    await p.locator("dialog[open]").waitFor();
    assert.equal(
      (await p.locator("dialog[open] .confirmation-amount").innerText())
        .replace(/\s+/g, " ")
        .trim(),
      "11 demoUSD",
    );
    await shot(p, "purchase-review", width);
    await p.keyboard.press("Escape");
    assert.equal(await p.evaluate(() => globalThis.__qaCalls || 0), 0);
    checks.push(
      width +
        ": immediate visual catalogue, real images, actual listings separated; intersected search/category/theme and empty reset; touch/keyboard flip, logical focus/inert and stable heights; model review and public-wallet adapter return with exact amount; listing purchase confirmation with no financial signature.",
    );
    await c.close();
  }
  const c = await context(true, "no-preference"),
    p = await c.newPage();
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.goto("http://127.0.0.1:5173/#explorer");
  await p.locator(".catalogue-card").first().waitFor();
  const card = p.locator(".catalogue-card").first();
  await card.hover();
  assert.equal(
    await card.locator(".catalogue-front").getAttribute("aria-hidden"),
    "false",
  );
  assert.equal(
    await card
      .locator(".catalogue-card-turner")
      .evaluate((e) => getComputedStyle(e).transitionDuration),
    "0.24s",
  );
  await card
    .getByRole("button", { name: "Voir la composition", exact: true })
    .click();
  await shot(p, "motion-flip", 1440);
  await c.close();
  const broken = await context();
  await broken.route("**/art/catalogue/*.svg", (r) => r.abort());
  const q = await broken.newPage();
  await q.setViewportSize({ width: 390, height: 1000 });
  await q.goto("http://127.0.0.1:5173/#explorer");
  await q.getByText("Visuel indisponible", { exact: true }).first().waitFor();
  await q
    .getByRole("button", { name: "Voir la composition", exact: true })
    .first()
    .click();
  await shot(q, "image-error", 390);
  await broken.close();
  checks.push(
    "Explicit-click 240ms desktop rotation, no hover flip; immediate keyboard/mobile/reduced-motion; image failures retain text and controls.",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/results/catalogue-browser.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks,
        captures,
        errors,
        source:
          "Actual read-only testnet state at one cached final block through Intear RPC. Wallet connection uses public-account QA adapter; financial signatures always reject.",
        limits: [
          "No new on-chain creation or sale sent.",
          "No actual Intear popup or user signature verified. Financial transport and contracts unchanged.",
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
      console.error((await p.locator("body").innerText()).slice(0, 6000));
      await p.screenshot({ path: dir + "/failure.png", fullPage: true });
    }
  throw e;
} finally {
  await b.close();
}
