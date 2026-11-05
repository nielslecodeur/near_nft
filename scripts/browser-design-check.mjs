import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath:
    process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--disable-gpu"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/#app", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Aller au contenu" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  // Delay the real response to observe loading, without replacing chain data.
  await page.route("**/state", async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Charger le compte", exact: true })
    .click();
  await expect(page.locator(".operation-status.loading")).toBeVisible();
  await expect(
    page.getByText("Propriété vérifiée", { exact: false }),
  ).toBeVisible();
  await page.unroute("**/state");
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ({
    display: document.fonts.check('700 40px "Public Sans"'),
    body: document.fonts.check('400 14px "Public Sans"'),
  }));
  if (!fonts.display || !fonts.body) throw new Error("Local fonts not loaded");
  const projection = page.locator(".projection-studio");
  const original = await projection.locator(".projection-value").innerText();
  await page.getByLabel("Versement mensuel envisagé").fill("50");
  await expect(projection.locator(".projection-value")).not.toHaveText(
    original,
  );
  const rate = page.getByRole("slider", { name: /Hypothèse annuelle/ });
  await rate.focus();
  await page.keyboard.press("Home");
  await expect(rate).toHaveValue("0");
  await page.keyboard.press("ArrowRight");
  await expect(rate).toHaveValue("0.5");
  const scrub = page.getByRole("slider", { name: /Année observée/ });
  await scrub.focus();
  await page.keyboard.press("Home");
  await expect(scrub).toHaveValue("0");
  await page.keyboard.press("End");
  await expect(scrub).toHaveValue("10");
  await projection.getByRole("button", { name: "5 ans", exact: true }).click();
  await expect(scrub).toHaveValue("5");
  await page.getByRole("button", { name: "Retirer", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Fermer", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: /^Confirmer/ }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Fermer", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retirer", exact: true }),
  ).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const transition = await page
    .locator(".chart-point")
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  if (transition !== "0s") throw new Error("Reduced motion not respected");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mkdir(".research/screenshots", { recursive: true });
  const sizes = [];
  for (const width of [1440, 1024, 768, 650, 390, 320]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow) throw new Error(`Horizontal overflow at ${width}px`);
    sizes.push(width);
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: `.research/screenshots/design-${width}.png`,
        fullPage: true,
      });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const result = {
    date: new Date().toISOString(),
    liveSandbox: true,
    fonts,
    viewportsWithoutOverflow: sizes,
    checks: [
      "skip link and main focus",
      "real loading state",
      "projection deposits and horizon",
      "rate and inspection with keyboard",
      "modal focus trap, Escape and focus return",
      "reduced motion",
      "self-hosted fonts",
    ],
    pageErrors: errors,
    scope: "Local sandbox UI. External testnet wallet signing not exercised.",
  };
  await writeFile(
    "docs/results/frontend-design.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
