import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const dir = "docs/screenshots/special-cards";
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
async function context(wallet = false, motion = "reduce", touch = true) {
  const c = await b.newContext({ reducedMotion: motion, hasTouch: touch });
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
  for (const width of [1440, 768, 390]) {
    const c = await context(true),
      p = await c.newPage();
    await p.setViewportSize({ width, height: 1000 });
    p.on("pageerror", (e) => errors.push(String(e)));
    await c.addInitScript(() => sessionStorage.setItem("everkeep.ui.v1:explore-category", "all"));
    await p.goto("http://127.0.0.1:5173/#explorer");
    await p.locator(".ek-position-card").first().waitFor({ timeout: 60000 });
    assert.equal(
      await p
        .locator('.ek-position-card[data-special-art][data-material="holo"]')
        .count(),
      5,
    );
    assert.deepEqual(
      await p
        .locator(".ek-position-card .ek-art-layer")
        .evaluateAll((imgs) => imgs.map((i) => i.getAttribute("src"))),
      [
        "/art/special/ai-infrastructure.webp",
        "/art/special/moon-executive.webp",
        "/art/special/energy-transition.webp",
        "/art/special/moon-executive.webp",
        "/art/special/reserve-keeper.webp",
      ],
    );
    assert.equal(
      await p.locator(".ek-frame-feed").count(),
      0,
      "art never invents live financial data",
    );
    await shot(p, "explorer-special", width);
    const card = p.locator(".ek-position-card").last();
    const h = await card.evaluate((el) => el.getBoundingClientRect().height);
    await card
      .getByRole("button", { name: "Voir la composition", exact: true })
      .focus();
    await p.keyboard.press("Enter");
    assert.equal(await card.getAttribute("data-flipped"), "true");
    assert.ok(
      Math.abs(
        h - (await card.evaluate((el) => el.getBoundingClientRect().height)),
      ) < 1,
    );
    assert.equal(
      await card.locator(".ek-position-front").getAttribute("inert"),
      "",
    );
    await shot(p, "composition", width);
    await card
      .getByRole("button", { name: "Revenir au visuel", exact: true })
      .click();
    await p.getByRole("button", { name: "Vue liste", exact: true }).click();
    await p.getByLabel("Densité", { exact: true }).selectOption("compact");
    await shot(p, "list-special", width);
    await p.getByRole("button", { name: "Vue grille", exact: true }).click();
    await p
      .getByRole("button", { name: "Voir Réserve demoUSD", exact: true })
      .click();
    await p.locator("#model-amount").waitFor();
    assert.equal(
      await p.locator(".model-detail img").first().getAttribute("src"),
      "/art/special/reserve-keeper.webp",
    );
    await shot(p, "model-special", width);
    await p.getByRole("link", { name: "Positions", exact: true }).click();
    await p.locator(".community-empty").waitFor();
    await p
      .locator(".community-empty")
      .getByRole("button", { name: "Connecter un wallet", exact: true })
      .click();
    await p.locator(".owned-position").first().waitFor({ timeout: 60000 });
    await p.getByRole("tab", { name: /Collection/ }).click();
    await p.locator(".ek-owned-card-grid [data-special-art]").waitFor();
    await shot(p, "owned-special", width);
    await p
      .getByRole("button", { name: "Consulter la position", exact: true })
      .first()
      .click();
    await p.locator(".owned-detail").waitFor();
    assert.equal(
      await p
        .locator(".ek-owned-position-visual img")
        .first()
        .getAttribute("src"),
      "/art/special/reserve-keeper.webp",
    );
    await shot(p, "owned-special-detail", width);
    assert.equal(await p.evaluate(() => globalThis.__qaCalls || 0), 0);
    await c.close();
  }
  const c = await context(false, "no-preference", false),
    p = await c.newPage();
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.goto("http://127.0.0.1:5173/#explorer");
  await p.locator(".ek-position-card").first().waitFor({ timeout: 60000 });
  await p.evaluate(() => document.fonts.ready);
  const frame = p.locator(".ek-position-card .ek-card-frame").nth(1),
    skin = frame.locator(".ek-frame-skin");
  await frame.scrollIntoViewIfNeeded();
  const box = await frame.boundingBox();
  await p.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2);
  await p.waitForTimeout(250);
  const pointer = await skin.evaluate((el) => ({
    dx: el.style.getPropertyValue("--dx"),
    transform: getComputedStyle(el).transform,
  }));
  assert.ok(Number(pointer.dx) > 0.2);
  assert.notEqual(pointer.transform, "none");
  await shot(p, "holo-pointer", 1440);
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.8);
  await p.waitForTimeout(250);
  assert.equal(
    await skin.evaluate((el) => getComputedStyle(el).transform),
    "none",
  );
  await shot(p, "holo-reduced-motion", 1440);
  await c.close();
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/results/special-cards-browser.json",
    JSON.stringify(
      {
        captures,
        errors,
        checks: [
          "3 optimized generated illustrations, no baked UI",
          "1440/768/390",
          "shared model/owned art and holo theme",
          "keyboard/inert/stable flip",
          "compact list",
          "fine-pointer tilt verified",
          "reduced motion disables tilt",
          "no live feed or synthetic financial figures",
          "no signatures",
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
