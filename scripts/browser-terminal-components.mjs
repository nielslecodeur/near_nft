import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = process.env.UI_BASE_URL || "http://127.0.0.1:5174";
const out = ".impeccable/review/terminal-components";
await mkdir(out, { recursive: true });
const captures = [], checks = [], errors = [], external = [];
const presets = JSON.parse(await readFile("design-system/terminal/card-themes.json", "utf8"));
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--disable-gpu"] });
async function noOverflow(p) {
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, "document overflow");
}
async function shot(p, name, width, target) {
  await noOverflow(p);
  const path = `${out}/${name}-${width}.png`;
  if (name === "components") { await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path, fullPage: true, animations: "disabled" }); }
  else if (target) await target.screenshot({ path, animations: "disabled", style: ".ek-terminal-header,.ek-terminal-skip {visibility:hidden!important}" });
  else await p.screenshot({ path, animations: "disabled" });
  captures.push(path);
}
try {
  for (const width of [1440, 390]) {
    const c = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, isMobile: width === 390, hasTouch: width === 390 });
    const p = await c.newPage(); p.setDefaultTimeout(15000);
    await p.addInitScript(() => {
      window.__ekFramePulseCalls = [];
      const nativeAnimate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const animation = nativeAnimate.apply(this, args);
        if (this.classList.contains("ek-frame-pulse") && this.closest(".ek-frame-showcase")) {
          const timing = animation.effect.getTiming();
          window.__ekFramePulseCalls.push({ duration: timing.duration, iterations: timing.iterations });
        }
        return animation;
      };
    });
    p.on("pageerror", e => errors.push(String(e)));
    p.on("response", r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    p.on("request", r => { if (!r.url().startsWith(base) && !r.url().startsWith("data:")) external.push(r.url()); });
    await p.goto(`${base}/design/components.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await expect(p.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 90000 });
    await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
    assert.deepEqual(await p.evaluate(() => [...new Set([...document.fonts].filter(f => f.status === "loaded").map(f => f.family))].sort()), ["IBM Plex Mono", "Inter"]);
    await expect(p.locator(".ek-nft-card")).toHaveCount(3);
    await expect(p.locator(".recharts-area")).toHaveCount(1);
    await shot(p, "components", width);
    const input = p.getByRole("searchbox", { name: "Filtrer l’inventaire", exact: true });
    await input.focus();
    await p.keyboard.press("Control+k");
    const searchDialog = p.getByRole("dialog", { name: "Rechercher dans l’aperçu", exact: true });
    await expect(searchDialog).toBeVisible();
    const combo = searchDialog.getByRole("combobox"); await expect(combo).toBeFocused();
    await p.keyboard.press("Control+k"); await p.keyboard.press("Meta+k");
    await expect(combo).toBeFocused();
    await p.keyboard.press("Escape");
    await expect(input).toBeFocused();
    await p.keyboard.press("Control+k");
    await expect(combo).toBeFocused();
    await p.keyboard.press("ArrowDown");
    await expect(searchDialog.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
    await shot(p, "search", width);
    await p.keyboard.press("Enter");
    await expect(searchDialog).toBeHidden(); await expect(input).toBeFocused();
    await expect(p.locator(".ek-reference-feedback")).toContainText("Orbite #024");
    await p.keyboard.press("Meta+k");
    await expect(searchDialog).toBeVisible();
    await combo.fill("introuvable-".repeat(30));
    await expect(searchDialog.getByRole("status")).toContainText("Aucun résultat");
    await shot(p, "search-empty", width);
    await p.keyboard.press("Escape"); await expect(input).toBeFocused();
    await p.getByRole("button", { name: "Connecter un wallet", exact: true }).click();
    await expect(p.locator(".ek-reference-feedback")).toContainText("Connexion demandée dans l’aperçu");

    const table = p.locator(".ek-market-table");
    await table.getByRole("button", { name: "Prix plancher", exact: true }).click();
    await expect(table.getByRole("columnheader", { name: "Prix plancher", exact: true })).toHaveAttribute("aria-sort", "ascending");
    await expect(table.locator("tbody tr").first()).toContainText("Études de protocoles");
    await table.getByRole("button", { name: "Prix plancher", exact: true }).click();
    await expect(table.locator("tbody tr").first()).toContainText("Études d’allocation");
    if (width === 390) {
      const region = p.getByRole("region", { name: "Collections : tableau défilant horizontalement" });
      assert.ok(await region.evaluate(e => e.scrollWidth > e.clientWidth));
      await region.evaluate(e => { e.scrollLeft = e.scrollWidth; });
      assert.ok(await region.evaluate(e => e.scrollLeft > 0));
      await region.evaluate(e => { e.scrollLeft = 0; });
    }
    await p.getByRole("button", { name: /^Filtres/ }).click();
    await p.getByRole("checkbox", { name: "Liquidité", exact: true }).check();
    await expect(p.locator(".ek-nft-card")).toHaveCount(1);
    await shot(p, "inventory-filters", width, p.locator("#inventory"));
    await p.getByRole("button", { name: "Effacer les filtres", exact: true }).click();
    await p.getByRole("button", { name: "Fermer les filtres", exact: true }).click();
    await p.getByRole("button", { name: "Vue liste", exact: true }).click();
    await p.getByLabel("Densité", { exact: true }).selectOption("compact");
    await p.getByLabel("Tri de l’inventaire", { exact: true }).selectOption("price");
    await expect(p.locator(".ek-inventory")).toHaveAttribute("data-view", "list");
    await expect(p.locator(".ek-nft-card").first()).toContainText("Réserve #018");
    await shot(p, "inventory-list", width, p.locator("#inventory"));
    await input.fill("aucun-resultat-".repeat(30));
    await expect(p.getByText("Aucune position ne correspond", { exact: true })).toBeVisible();
    await shot(p, "inventory-empty", width, p.locator("#inventory"));
    await p.getByRole("button", { name: "Réinitialiser l’inventaire", exact: true }).click();
    await expect(input).toHaveValue("");
    await p.getByRole("button", { name: "Vue grille", exact: true }).click();
    await p.getByLabel("Densité", { exact: true }).selectOption("comfortable");
    await p.getByLabel("État de l’aperçu", { exact: true }).selectOption("loading");
    await expect(p.locator(".ek-inventory-content")).toHaveAttribute("aria-busy", "true");
    await expect(p.getByRole("status", { name: "Chargement d’une position" })).toHaveCount(3);
    await shot(p, "inventory-loading", width, p.locator("#inventory"));
    await p.getByLabel("État de l’aperçu", { exact: true }).selectOption("error");
    await expect(p.getByRole("alert")).toContainText("Inventaire indisponible");
    await shot(p, "inventory-error", width, p.locator("#inventory"));
    await p.getByRole("button", { name: "Réessayer la lecture", exact: true }).click();
    const first = p.locator(".ek-nft-card").first();
    const buy = first.getByRole("button", { name: "Examiner l’achat", exact: true });
    const cardHeight = await first.locator(".ek-card-frame").evaluate(e => e.getBoundingClientRect().height);
    await first.getByRole("button", { name: /Ajouter .* aux favoris/ }).click();
    await expect(first.getByRole("button", { name: /Retirer .* des favoris/ })).toHaveAttribute("aria-pressed", "true");
    await p.keyboard.press("Tab"); await p.keyboard.press("Tab");
    await expect(buy).toBeFocused(); await expect(buy).toHaveCSS("opacity", "1");
    assert.ok(await buy.evaluate(e => e.matches(":focus-visible")));
    if (width === 1440) {
      await first.hover();
      await expect(first).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -4)");
      await expect(first.locator(".ek-art-layer--background")).toHaveCSS("scale", "1.04");
    }
    await shot(p, "card-focus", width, first);
    await buy.click();
    const review = p.getByRole("dialog", { name: "Examiner le spécimen", exact: true });
    await expect(review).toBeVisible();
    await expect(review).toContainText("11,00");
    await shot(p, "purchase", width);
    await p.keyboard.press("Escape"); await expect(buy).toBeFocused();
    await expect(p.locator(".ek-nft-card").last().getByRole("button", { name: "Indisponible", exact: true })).toBeDisabled();

    const material = p.getByLabel("Matière de la carte", { exact: true });
    const lab = p.locator(".ek-frame-lab"), frame = p.locator(".ek-frame-showcase .ek-card-frame"), skin = frame.locator(".ek-frame-skin");
    for (const value of ["matte", "metal", "holo"]) {
      await material.selectOption(value); await expect(frame).toHaveClass(new RegExp(`ek-card-frame--${value}`));
      await shot(p, `frame-${value}`, width, lab);
    }
    await frame.scrollIntoViewIfNeeded(); const box = await frame.boundingBox();
    await p.mouse.move(box.x + box.width * .8, box.y + box.height * .3);
    if (width === 1440) {
      await expect(skin).not.toHaveCSS("--mx", "50%");
      assert.equal(await frame.locator(".ek-art-layer").count(), 3);
      const transforms = await frame.locator(".ek-art-layer").evaluateAll(es => es.map(e => getComputedStyle(e).transform));
      assert.ok(new Set(transforms).size > 1, "parallax depths must differ");
    } else { await expect(skin).toHaveCSS("--mx", "50%"); await expect(skin).toHaveCSS("transform", "none"); }
    await shot(p, "frame-tilt", width);
    await p.mouse.move(0, 0); await expect(skin).toHaveCSS("--mx", "50%");
    await material.selectOption("live");
    const pulseCount = await p.evaluate(() => window.__ekFramePulseCalls.length);
    await p.getByRole("button", { name: "Simuler une hausse", exact: true }).click();
    await expect(frame).toHaveAttribute("data-tone", "up"); await expect(frame).toContainText("11,40");
    await expect.poll(() => p.evaluate(() => window.__ekFramePulseCalls.length)).toBe(pulseCount + 1);
    const pulse = await p.evaluate(() => window.__ekFramePulseCalls.slice(-1));
    assert.ok(pulse.every(a => a.duration <= 250 && a.iterations === 1));
    await shot(p, "frame-live-up", width, lab);
    await p.getByRole("button", { name: "Simuler une baisse", exact: true }).click();
    await expect(frame).toHaveAttribute("data-tone", "down"); await expect(frame).toContainText("10,60");
    await expect(p.locator(".ek-ticker")).toContainText("10,60");
    await shot(p, "frame-live-down", width, lab);
    await p.getByText("Personnaliser le thème JSON", { exact: true }).click();
    const editor = p.getByLabel("Configuration du cadre", { exact: true });
    const invalid = structuredClone(presets.live); invalid.palette.accent = "red;position:fixed";
    await editor.fill(JSON.stringify(invalid)); await p.getByRole("button", { name: "Appliquer le thème", exact: true }).click();
    await expect(p.locator("#card-theme-error")).toContainText("Accent non reconnu");
    await expect(frame).toHaveClass(/ek-card-frame--animated/);
    await shot(p, "theme-error", width, p.locator(".ek-theme-editor"));
    invalid.palette.accent = "brand"; invalid.layers[0].src = "https://example.invalid/asset.svg";
    await editor.fill(JSON.stringify(invalid)); await p.getByRole("button", { name: "Appliquer le thème", exact: true }).click();
    await expect(p.locator("#card-theme-error")).toContainText("fichier local");
    await editor.fill("{"); await p.getByRole("button", { name: "Appliquer le thème", exact: true }).click();
    await expect(p.locator("#card-theme-error")).toContainText("JSON invalide");
    const custom = structuredClone(presets.holo); custom.palette.surface = "s3"; custom.layers[1].opacity = .5;
    await editor.fill(JSON.stringify(custom)); await p.getByRole("button", { name: "Appliquer le thème", exact: true }).click();
    await expect(frame).toHaveClass(/ek-card-frame--holo/); await expect(frame.locator(".ek-frame-feed")).toHaveCount(0);
    await expect(material).toHaveValue("custom"); await expect(editor).toHaveAttribute("aria-invalid", "false");
    await p.getByText("Personnaliser le thème JSON", { exact: true }).click();
    await shot(p, "theme-custom", width, lab);
    await material.selectOption("live");

    await p.getByRole("button", { name: "7 j", exact: true }).click();
    assert.ok(await p.locator(".ek-trade-panel").evaluate(e => e.querySelector("h3").compareDocumentPosition(e.querySelector(".ek-badge")) & Node.DOCUMENT_POSITION_FOLLOWING));
    await expect(p.getByRole("button", { name: "7 j", exact: true })).toHaveAttribute("aria-pressed", "true");
    await p.getByText("Lire les données du graphique", { exact: true }).click();
    await expect(p.locator(".ek-chart-data tbody tr")).toHaveCount(4);
    await p.locator(".recharts-surface").focus();
    await p.keyboard.press("ArrowRight");
    await expect(p.locator(".ek-chart-tooltip")).toBeVisible();
    await shot(p, "chart", width, p.locator("#details"));
    await p.getByText("Lire les données du graphique", { exact: true }).click();
    const activity = p.getByRole("tab", { name: "Activité", exact: true });
    await activity.focus(); await p.keyboard.press("Enter");
    await expect(p.locator(".ek-activity-table tbody tr")).toHaveCount(2);
    await shot(p, "activity", width, p.locator("#details"));
    await p.getByRole("button", { name: "Faire une offre", exact: true }).click();
    const offer = p.getByRole("dialog", { name: "Préparer une offre — exemple", exact: true });
    const proposed = offer.getByRole("textbox", { name: "Montant proposé (demoUSD)", exact: true });
    await expect(offer.getByRole("button", { name: "Vérifier le montant", exact: true })).toBeDisabled();
    await proposed.fill("0"); await expect(proposed).toHaveAttribute("aria-invalid", "true");
    await shot(p, "offer", width);
    await proposed.fill("9,50");
    assert.ok(await proposed.evaluate(e => getComputedStyle(e).fontFamily.includes("IBM Plex Mono") && getComputedStyle(e).fontVariantNumeric.includes("tabular-nums")));
    await offer.getByRole("button", { name: "Vérifier le montant", exact: true }).click();
    await expect(p.locator(".ek-reference-feedback")).toContainText("Aucune offre envoyée");
    await expect(p.getByRole("button", { name: "Faire une offre", exact: true })).toBeFocused();
    await p.emulateMedia({ reducedMotion: "reduce" });
    await frame.scrollIntoViewIfNeeded(); const reducedBox = await frame.boundingBox();
    await p.mouse.move(reducedBox.x + reducedBox.width * .8, reducedBox.y + reducedBox.height * .3);
    await expect(skin).toHaveCSS("transform", "none"); await expect(skin).toHaveCSS("--mx", "50%");
    const reducedPulseCount = await p.evaluate(() => window.__ekFramePulseCalls.length);
    await p.getByRole("button", { name: "Simuler une hausse", exact: true }).click();
    assert.equal(await p.evaluate(() => window.__ekFramePulseCalls.length), reducedPulseCount);
    assert.equal(await frame.locator(".ek-frame-pulse").evaluate(e => e.getAnimations().length), 0);
    await shot(p, "reduced-motion", width, lab);
    await p.emulateMedia({ reducedMotion: "no-preference" });
    await p.route("**/art/catalogue/liquidity.svg", route => route.abort());
    await p.reload({ waitUntil: "domcontentloaded" });
    await expect(p.locator(".ek-nft-card").first().getByText("Visuel indisponible", { exact: true })).toBeVisible();
    const failedHeight = await p.locator(".ek-nft-card").first().locator(".ek-card-frame").evaluate(e => e.getBoundingClientRect().height);
    assert.ok(Math.abs(failedHeight - cardHeight) < 1, "image failure shifts art height");
    await shot(p, "image-failure", width, p.locator(".ek-nft-card").first());
    checks.push({ width, cases: ["2 local fonts; no document overflow", "Cmd/Ctrl+K including repeats, combobox arrows/Enter, empty search, Escape, restore prior focus", "chain/gas disconnected truth; wallet callback only", "table sorting/aria-sort + mobile horizontal scroll", "filters + long query + empty recovery", "list/grid/density/sort", "loading/error/retry", "favorite, focus-revealed quick buy, recap and restoration, unavailable guard", "4 JSON materials, 3-layer parallax, mouse-only tilt + reset", "manual up/down quote, semantic tone, ticker update, bounded single pulse", "JSON invalid syntax/palette/remote URL rejected; last valid theme kept; custom theme applied", "chart period, keyboard tooltip and accessible data table, activity", "numeric offer guard/mono/tabular; no operation sent", "reduced motion no tilt/pulse", "image fallback keeps art height"] });
    await c.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await writeFile("docs/results/terminal-components-browser.json", JSON.stringify({ at: new Date().toISOString(), stage: 3, base, checks, captures, errors, externalRequests: external, captureNotes: "Full-page overview from top at each viewport; state captures include component crops rendered at the same viewport width. All values are synthetic. No wallet/contract calls.", scope: "Composed UI component library/reference only; stage 4 pages and existing business flow integration deferred." }, null, 2) + "\n");
  console.log(JSON.stringify({ widths: checks.map(c => c.width), captures: captures.length, errors, externalRequests: external }));
} finally { await b.close(); }
