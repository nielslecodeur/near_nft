import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const b = await chromium.launch({
  executablePath:
    process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--disable-gpu"],
});
try {
  const page = await b.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const checks = [];
  await mkdir(".impeccable/review", { recursive: true });
  await page.goto("http://127.0.0.1:5173/#presentation", {
    waitUntil: "networkidle",
  });
  const mechanism = page.locator(".control-map");
  await expect(mechanism).toBeVisible();
  await mechanism.getByRole("button", {name:"L’agent",exact:true}).click();
  await expect(mechanism.locator(".control-agent")).toContainText("AUTORISÉ");
  await mechanism.getByRole("button", {name:"La transmission",exact:true}).click();
  await expect(mechanism.locator(".control-owner")).toContainText("Bob");
  await expect(mechanism.locator(".control-agent")).toContainText("révoqué");
  await page
    .getByRole("button", { name: "3. Voir la transmission", exact: true })
    .click();
  await expect(page.locator(".example-state")).toContainText("Bob");
  await expect(page.locator(".example-state")).toContainText("900");
  checks.push("interactive control mechanism and explicit Alice/Bob example");
  await page
    .getByRole("link", { name: "Explorer la démo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Votre plan d’épargne." }),
  ).toBeFocused();
  await expect(page.locator(".control-map")).toHaveCount(0);
  await page.goBack();
  await expect(mechanism).toBeVisible();
  await page.goForward();
  checks.push("separate app route, keyboard focus and browser history");
  await page.route("**/state", (route) => route.abort("failed"));
  await page
    .getByRole("button", { name: "Charger le compte", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Connexion indisponible");
  await expect(
    page.getByRole("button", { name: "Charger le compte", exact: true }),
  ).toBeEnabled();
  await page.unroute("**/state");
  await page.route("**/state", async (route) => {
    await new Promise((r) => setTimeout(r, 500));
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Charger le compte", exact: true })
    .click();
  await expect(page.locator(".account-skeleton")).toBeVisible();
  await expect(
    page.getByText("Propriété vérifiée", { exact: false }),
  ).toBeVisible();
  await page.unroute("**/state");
  const data = await (await fetch("http://127.0.0.1:8787/state")).json();
  checks.push("offline recovery and real read loading state");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", { name: "Copier l’adresse", exact: true })
    .click();
  if (
    (await page.evaluate(() => navigator.clipboard.readText())) !==
    data.snapshot.account_id
  )
    throw new Error("Address copy differs from loaded account");
  await page.getByRole("button", { name: "Retirer", exact: true }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  if (
    (await dialog.evaluate((el) => getComputedStyle(el).transitionDuration)) !==
    "0s"
  )
    throw new Error("Keyboard opens an animated modal");
  const amount = page.getByLabel("Montant (demoUSD)");
  await amount.fill("0");
  await expect(
    dialog.getByRole("button", { name: /^Confirmer/ }),
  ).toBeDisabled();
  await expect(dialog.locator(".action-summary")).toContainText(
    "supérieur à zéro",
  );
  await amount.fill("25");
  await expect(dialog.locator(".action-summary")).toContainText(
    data.snapshot.owner_id,
  );
  let injectedPosts = 0;
  await page.route("**/action", async (route) => {
    injectedPosts++;
    await new Promise((r) => setTimeout(r, 700));
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Échec simulé de transport, aucune transaction envoyée.",
      }),
    });
  });
  await dialog.getByRole("button", { name: /^Confirmer/ }).click();
  await expect(amount).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Fermer", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole("alert")).toContainText(
    "Échec simulé de transport",
  );
  await expect(amount).toHaveValue("25");
  await expect(amount).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: /^Confirmer/ }),
  ).toBeEnabled();
  await page.screenshot({
    path: ".impeccable/review/error-desktop.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await page.unroute("**/action");
  if (injectedPosts !== 1)
    throw new Error("Injected failure was submitted more than once");
  checks.push(
    "exact recipient summary, invalid amount, locked parameters and preserved failed form",
  );
  await page.getByRole("button", { name: "Activité", exact: true }).click();
  await page.getByRole("button", { name: "Refusées", exact: true }).click();
  await expect(page.locator(".activity-row")).toContainText(["Refusé"]);
  if (await page.locator(".activity-row .positive").count())
    throw new Error("Success entries remain in rejected filter");
  await page.getByRole("button", { name: "Mes plans", exact: false }).click();
  checks.push("activity filtering");
  const incomplete = {
    ...data,
    snapshot: { ...data.snapshot, available: undefined },
  };
  await page.route("**/state", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(incomplete),
    }),
  );
  await page
    .locator(".activity")
    .getByRole("button", { name: /Actualiser/ })
    .click();
  await expect(page.getByRole("alert")).toContainText("État du plan incomplet");
  await expect(page.locator(".allocation").first()).toContainText("Disponible");
  await page.unroute("**/state");
  checks.push("incomplete data refused without replacing the known balance");
  const large = structuredClone(data);
  const max = (1n << 128n) - 1n;
  large.snapshot.account_id =
    "a".repeat(64 - large.snapshot.collection_id.length - 1) +
    "." +
    large.snapshot.collection_id;
  large.snapshot.owner_id = "o".repeat(56) + ".testnet";
  large.snapshot.reserved = "1000000";
  large.snapshot.principal = "100000000";
  large.snapshot.available = (max - 101000000n).toString();
  large.snapshot.deposits = max.toString();
  large.snapshot.withdrawals = "0";
  large.snapshot.realized_gains = "0";
  large.snapshot.pending = { id: "1", kind: "test-layout" };
  await page.route("**/state", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(large),
    }),
  );
  await page
    .locator(".activity")
    .getByRole("button", { name: /Actualiser/ })
    .click();
  await expect(page.locator(".pending-account")).toBeVisible();
  await expect(page.locator(".projection-card")).toContainText(
    "Projection indisponible pour ce montant.",
  );
  await expect(page.locator(".projection-card svg")).toHaveCount(0);
  await page
    .locator(".stats")
    .getByRole("button", { name: "Valeur exacte", exact: true })
    .first()
    .click();
  const exactBalance = page
    .locator(".stats")
    .getByRole("textbox", { name: "Montant exact en demoUSD" })
    .first();
  await expect(exactBalance).toHaveValue(
    "340 282 366 920 938 463 463 374 607 431 768,211455",
  );
  await page
    .locator(".stats")
    .getByRole("button", { name: "Copier le montant exact" })
    .first()
    .click();
  await expect(page.locator(".stats [role=status]").first()).toHaveText(
    "Montant exact copié.",
  );
  if (
    (await page.evaluate(() => navigator.clipboard.readText())) !==
    (await exactBalance.inputValue())
  )
    throw new Error("Exact large amount copy mismatch");
  await expect(
    page.getByRole("button", { name: "Retirer", exact: true }),
  ).toBeDisabled();
  const widths = [];
  for (const width of [1440, 1024, 768, 650, 390, 320]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw new Error(`Large u128 or address overflows ${width}px`);
    widths.push(width);
    if (width === 320)
      await page.screenshot({
        path: ".impeccable/review/large-mobile.png",
        fullPage: true,
      });
  }
  checks.push(
    "u128 max, 64-character addresses, pending controls and six widths",
    "compact magnitude, accessible exact u128 copy and unsafe projection guard",
  );
  await page.unroute("**/state");
  await page
    .locator(".activity")
    .getByRole("button", { name: /Actualiser/ })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Retirer", exact: true }).click();
  if (
    (await page
      .getByRole("dialog")
      .evaluate((el) => getComputedStyle(el).transitionDuration)) !== "0s"
  )
    throw new Error("Modal ignores reduced motion");
  await page.keyboard.press("Escape");
  checks.push("reduced-motion modal");
  if (errors.length) throw new Error(errors.join("\n"));
  const report = {
    date: new Date().toISOString(),
    checks,
    viewportsWithoutOverflow: widths,
    pageErrors: errors,
    scope:
      "UI-only transport, incomplete and oversized states injected deliberately. No real transaction sent by this script; actual sandbox fund flow is checked separately in browser.json.",
  };
  await writeFile(
    "docs/results/ui-quality.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await b.close();
}
