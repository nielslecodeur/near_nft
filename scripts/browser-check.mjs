import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const executablePath =
  process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : process.env.CHROMIUM_PATH;
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-gpu"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.setDefaultTimeout(60000);
  const errors = [];
  let depositRequests = 0;
  page.on("request",request=>{if(request.method()==="POST"&&request.url().endsWith(":8787/action")&&request.postDataJSON()?.command==="deposit")depositRequests++;});
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/#app", { waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: "Votre plan d’épargne." })
    .waitFor();
  await mkdir(".research/screenshots", { recursive: true });
  await page.screenshot({
    path: ".research/screenshots/desktop-empty.png",
    fullPage: true,
  });
  const localAvailable = await fetch("http://127.0.0.1:8787/state")
    .then((r) => r.ok)
    .catch(() => false);
  if (localAvailable) {
    await page
      .getByRole("button", { name: "Charger le compte", exact: true })
      .click();
    await page
      .getByText("Propriété vérifiée", { exact: false })
      .waitFor({ timeout: 30000 });
    await page.screenshot({
      path: ".research/screenshots/desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Renouveler ma clé", exact: false })
      .click();
    await page.getByRole("heading", { name: "Une nouvelle clé." }).waitFor();
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    const confirm = async (double = false) => {
      const dialog = page.getByRole("dialog");
      if (double) await dialog.getByRole("button", { name: /^Confirmer/ }).evaluate(button=>{button.click();button.click();});
      else await dialog.getByRole("button", { name: /^Confirmer/ }).click();
      await expect(dialog.locator(".operation-status.pending")).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Fermer", exact: true }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveCount(0, { timeout: 60000 });
    };
    await page
      .getByRole("button", { name: "Nouveau plan", exact: true })
      .click();
    await confirm();
    await expect(page.locator(".security-card dd").first()).toHaveText(
      "alice.sandbox",
    );
    await page.getByRole("button", { name: "Déposer", exact: true }).click();
    await page.getByLabel("Montant (demoUSD)").fill("1000");
    await confirm(true);
    if(depositRequests!==1)throw new Error("Double submission sent more than one deposit request");
    await expect(page.locator(".allocation").first()).toContainText("1 000");
    await page
      .getByRole("button", { name: "Définir le mandat", exact: true })
      .click();
    await page.getByLabel("Plafond par opération (demoUSD)").fill("100");
    await page
      .getByLabel("Votre intention")
      .fill(
        "Je vise 4 % par an sur dix ans, avec au maximum 20 % par stratégie.",
      );
    await confirm();
    await page.getByRole("button", { name: "Lancer", exact: true }).click();
    await expect(page.locator(".allocation>div").nth(1)).toContainText("100");
    await page
      .getByRole("button", { name: "Tester le plafond", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("plafond");
    await page.getByRole("button", { name: "Révoquer", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Le mandat sera supprimé");
    await confirm();
    await expect(
      page.getByRole("button", { name: "Lancer", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Renouveler ma clé", exact: false })
      .click();
    await confirm();
    await expect(page.locator(".security-card dd").nth(1)).toContainText("v1");
    await page
      .getByRole("button", { name: "Transférer le plan", exact: false })
      .click();
    await confirm();
    await expect(page.locator(".security-card dd").first()).toHaveText(
      "bob.sandbox",
    );
    await page.getByRole("button", { name: "Retirer", exact: true }).click();
    await page.getByLabel("Montant (demoUSD)").fill("25");
    await confirm();
    await page
      .getByRole("button", {
        name: "Récupérer une partie de la position",
        exact: false,
      })
      .click();
    await page.getByLabel("Montant (demoUSD)").fill("25");
    await confirm();
    await expect(page.locator(".allocation>div").nth(1)).toContainText("75");
    await expect(page.locator(".operation-status.success")).toBeVisible();
    await expect(page.locator(".change-receipt")).toContainText("rachetés");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: ".research/screenshots/desktop-after-actions.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: ".research/screenshots/mobile.png",
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow) throw new Error("Mobile horizontal overflow");
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const report = {
    date: new Date().toISOString(),
    browser: "Chromium",
    version: browser.version(),
    empty: true,
    liveSandbox: localAvailable,
    pageErrors: errors,
    flows: localAvailable
      ? [
          "lecture vérifiée",
          "création",
          "dépôt 1000",
          "mandat en français",
          "allocation",
          "refus réel du plafond",
          "révocation",
          "rotation",
          "transfert Alice → Bob",
          "retrait",
          "rachat du principal",
          "desktop et mobile sans débordement",
        ]
      : [],
  };
  await mkdir("docs/results", { recursive: true });
  await writeFile("docs/results/browser.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
