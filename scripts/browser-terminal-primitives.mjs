import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.UI_BASE_URL || "http://127.0.0.1:5173";
const out = ".impeccable/review/terminal-primitives";
await mkdir(out, { recursive: true });
const checks = [],
  captures = [],
  errors = [],
  requests = [];
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--disable-gpu"],
});
const noOverflow = async (p) =>
  assert.equal(
    await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    "document overflow",
  );
async function capture(p, name, fullPage = false) {
  await noOverflow(p);
  const path = `${out}/${name}.png`;
  if (fullPage) await p.evaluate(() => scrollTo(0, 0));
  await p.screenshot({ path, fullPage, animations: "disabled" });
  captures.push(path);
}
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 1000 },
      isMobile: width === 390,
      hasTouch: width === 390,
    });
    const p = await context.newPage();
    p.setDefaultTimeout(15000);
    p.on("pageerror", (e) => errors.push(String(e)));
    p.on("response", (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
    });
    p.on("request", (r) => {
      if (!r.url().startsWith(base) && !r.url().startsWith("data:"))
        requests.push(r.url());
    });
    await p.goto(`${base}/design/primitives.html`, {
      timeout: 120000,
      waitUntil: "domcontentloaded",
    });
    await expect(p.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 90000,
    });
    await p.evaluate(() => document.fonts.ready);
    await expect(
      p.getByRole("button", { name: "Continuer", exact: true }),
    ).toHaveCSS("background-color", "rgb(181, 243, 107)");
    await capture(p, `primitives-${width}`, true);

    const targets = await p
      .locator(".ek-button, .ek-input, .ek-check, .ek-switch, .ek-tab")
      .evaluateAll((es) =>
        es
          .filter((e) => e.getClientRects().length)
          .map((e) => ({
            name:
              e.textContent ||
              e.getAttribute("aria-label") ||
              e.getAttribute("id"),
            h: e.getBoundingClientRect().height,
          })),
      );
    assert.ok(
      targets.every((t) => t.h >= 44),
      JSON.stringify(targets.filter((t) => t.h < 44)),
    );
    const fonts = await p.evaluate(() =>
      [
        ...new Set(
          [...document.fonts]
            .filter((f) => f.status === "loaded")
            .map((f) => f.family),
        ),
      ].sort(),
    );
    assert.deepEqual(fonts, ["IBM Plex Mono", "Inter"]);
    assert.ok(
      await p
        .locator(".ek-number")
        .first()
        .evaluate((e) =>
          getComputedStyle(e).fontVariantNumeric.includes("tabular-nums"),
        ),
    );
    await expect(
      p.getByRole("button", { name: "Indisponible", exact: true }),
    ).toBeDisabled();
    await expect(
      p.getByRole("button", { name: "Vérification en cours", exact: true }),
    ).toBeDisabled();
    await expect(
      p.getByRole("button", { name: "Vérification en cours", exact: true }),
    ).toHaveAttribute("aria-busy", "true");

    const proceed = p.getByRole("button", { name: "Continuer", exact: true });
    await proceed.focus();
    assert.ok(await proceed.evaluate((e) => e.matches(":focus-visible")));
    await capture(p, `focus-${width}`);
    await proceed.hover();
    await expect(proceed).toHaveCSS("background-color", "rgb(240, 242, 234)");
    await capture(p, `hover-${width}`);
    await p.mouse.down();
    await expect(proceed).toHaveCSS("background-color", "rgb(181, 243, 107)");
    await capture(p, `pressed-${width}`);
    await p.mouse.up();
    await expect(p.locator("#actions output")).toContainText(
      "Action de démonstration déclenchée",
    );
    await p.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(p.locator("#actions output")).toContainText("annulée");
    await p.getByRole("button", { name: "Retirer", exact: true }).click();
    await expect(p.locator("#actions output")).toContainText("Retrait simulé");
    const help = p.getByRole("button", {
      name: "Aide des raccourcis",
      exact: true,
    });
    await help.focus();
    await expect(p.getByRole("tooltip")).toBeVisible();
    await capture(p, `tooltip-${width}`);
    await p.keyboard.press("Escape");
    await expect(p.getByRole("tooltip")).toBeHidden();

    const search = p.getByRole("searchbox", {
      name: "Rechercher une position",
      exact: true,
    });
    await search.fill(
      "Position-obligataire-NEAR-avec-identifiant-très-long-".repeat(4),
    );
    await noOverflow(p);
    const amount = p.getByRole("textbox", {
      name: "Montant de l’offre (exemple)",
      exact: true,
    });
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await amount.fill("incorrect");
    await amount.focus();
    const errorId = await amount.getAttribute("aria-describedby");
    assert.ok(errorId.includes("error"));
    await p.locator("#fields").scrollIntoViewIfNeeded();
    await capture(p, `validation-${width}`);
    await amount.fill("12,50");
    assert.ok(await amount.evaluate(e => getComputedStyle(e).fontFamily.includes("IBM Plex Mono")));
    assert.ok(await amount.evaluate(e => getComputedStyle(e).fontVariantNumeric.includes("tabular-nums")));
    await expect(amount).not.toHaveAttribute("aria-invalid", "true");
    await expect(
      p.getByText("Saisissez un montant supérieur à zéro.", { exact: true }),
    ).toHaveCount(0);
    await p
      .getByLabel("Trier les positions", { exact: true })
      .selectOption("price");
    await expect(p.locator("#fields output")).toContainText("Tri : prix");
    await p
      .getByRole("checkbox", {
        name: "Masquer les positions indisponibles",
        exact: true,
      })
      .uncheck();
    await expect(p.locator("#fields output")).toContainText(
      "Toutes les positions",
    );
    const details = p.getByRole("switch", {
      name: "Afficher les détails",
      exact: true,
    });
    await details.check();
    await expect(p.locator("#preview-details")).toBeVisible();
    await details.uncheck();
    await expect(p.locator("#preview-details")).toBeHidden();

    const items = p.getByRole("tab", { name: "Items", exact: true });
    await items.focus();
    await p.keyboard.press("ArrowRight");
    await expect(
      p.getByRole("tab", { name: "Activité", exact: true }),
    ).toBeFocused();
    await expect(p.getByRole("tabpanel")).toContainText(
      "événements vérifiés sur NEAR",
    );
    await p.keyboard.press("ArrowRight");
    await expect(items).toBeFocused();
    await expect(
      p.getByRole("tab", { name: "Analytics", exact: true }),
    ).toBeDisabled();
    const menuTrigger = p.getByRole("button", {
      name: "Affichage",
      exact: true,
    });
    await menuTrigger.focus();
    await p.keyboard.press("Enter");
    await expect(
      p.getByRole("menu", { name: "Densité d’affichage" }),
    ).toBeVisible();
    await expect(
      p.getByRole("menuitem", { name: "Affichage confortable", exact: true }),
    ).toBeFocused();
    await capture(p, `menu-${width}`);
    await p.keyboard.press("ArrowDown");
    await expect(
      p.getByRole("menuitem", { name: "Affichage compact", exact: true }),
    ).toBeFocused();
    await p.keyboard.press("Enter");
    await expect(p.locator("#navigation output")).toContainText("Compact");
    await expect(menuTrigger).toBeFocused();
    await menuTrigger.click();
    await expect(
      p.getByRole("menuitem", { name: "Enregistrer une vue" }),
    ).toHaveAttribute("aria-disabled", "true");
    await p.keyboard.press("Escape");
    await expect(menuTrigger).toBeFocused();

    const preferences = p.getByRole("button", {
      name: "Préférences",
      exact: true,
    });
    await preferences.click();
    const dialog = p.getByRole("dialog", {
      name: "Votre affichage",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await capture(p, `dialog-${width}`);
    for (let i = 0; i < 9; i++) {
      await p.keyboard.press("Tab");
      assert.ok(
        await dialog.evaluate((e) => e.contains(document.activeElement)),
        "focus escaped dialog",
      );
    }
    await p.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(preferences).toBeFocused();
    await preferences.click();
    await p
      .getByRole("switch", { name: "Afficher les identifiants", exact: true })
      .check();
    await p.getByRole("button", { name: "Appliquer", exact: true }).click();
    await expect(p.locator("#navigation output")).toContainText(
      "Identifiants : visibles",
    );
    await preferences.click();
    await p
      .getByRole("switch", { name: "Afficher les identifiants", exact: true })
      .uncheck();
    await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(p.locator("#navigation output")).toContainText(
      "Identifiants : visibles",
    );
    await expect(preferences).toBeFocused();
    await p
      .getByRole("button", { name: "Réinitialiser les filtres", exact: true })
      .click();
    await expect(search).toHaveValue("");
    await p
      .getByRole("button", { name: "Réessayer dans l’aperçu", exact: true })
      .click();
    await expect(p.locator("#actions output")).toContainText(
      "Nouvelle tentative",
    );
    await p.locator("#feedback").scrollIntoViewIfNeeded();
    await capture(p, `states-${width}`);
    await p.emulateMedia({ reducedMotion: "reduce" });
    await expect(proceed).toHaveCSS("transition-duration", "0s");
    await preferences.click();
    await expect(dialog).toHaveCSS("animation-name", "none");
    await capture(p, `reduced-motion-${width}`);
    await p.keyboard.press("Escape");
    checks.push({
      width,
      touch: width === 390,
      checks: [
        "no overflow including long query",
        "all interactive targets >=44px",
          "two local fonts, tabular numbers including monetary input",
        "disabled + busy guards",
        "hover + pressed + visible keyboard focus",
        "accessible tooltip Escape",
        "error associations + corrected value",
        "search + select + checkbox + switch",
        "keyboard tabs skip disabled",
        "keyboard menu + disabled item + focus restoration",
        "dialog focus trap + Escape + cancel/apply + focus restoration",
        "error/empty recovery + static accessible skeleton",
        "reduced motion: zero transitions, no animations",
      ],
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(
    requests,
    [],
    "reference must not call a wallet or external service",
  );
  await writeFile(
    "docs/results/terminal-primitives-browser.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        stage: 2,
        base,
        checks,
        captures,
        errors,
        externalRequests: requests,
        scope:
          "UI primitives reference only; no signatures, market data or financial operations.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      widths: checks.map((c) => c.width),
      captures: captures.length,
      errors,
      externalRequests: requests,
    }),
  );
} finally {
  await browser.close();
}
