import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--disable-gpu"],
});
const dir = ".impeccable/review/orbite",
  checks = [],
  captures = [],
  errors = [];
await mkdir(dir, { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  let posts = 0;
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/command")) posts++;
  });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["explorer", "positions", "agent"]) {
      await page.goto("http://127.0.0.1:5173/?session=orbite#" + route);
      await page.locator("main[aria-busy=false]").waitFor({ timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator("vite-error-overlay").count(), 0);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        route + " " + width + " overflow",
      );
      const path = `${dir}/${route}-${width}.png`;
      await page.screenshot({ path, fullPage: true });
      captures.push(path);
    }
  }
  checks.push(
    "three routes at 390/768/1440 with no Vite overlay, JS error or horizontal overflow",
  );
  await page.goto("http://127.0.0.1:5173/?session=orbite#explorer");
  await page.locator("main[aria-busy=false]").waitFor();
  const css = await page.request.get("http://127.0.0.1:5173/src/orbite.css");
  assert.equal(css.status(), 200);
  assert.ok((await css.text()).includes(".orbite-hero"));
  assert.equal(
    await page
      .locator(".orbite-app")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(9, 13, 11)",
  );
  assert.ok(
    await page.evaluate(
      () =>
        document.fonts.check('600 24px "Space Grotesk"') &&
        document.fonts.check("400 16px Inter"),
    ),
  );
  checks.push(
    "real Orbite stylesheet resolves; exact dark palette and both self-hosted font families loaded",
  );
  const agent = page.locator(".orbite-agent-row");
  await agent.focus();
  await page.keyboard.press("Enter");
  assert.equal(await agent.getAttribute("aria-expanded"), "true");
  await page
    .getByRole("heading", {
      name: "Proposer. Puis agir sous mandat.",
      exact: true,
    })
    .waitFor();
  assert.ok(
    (await page.locator(".orbite-agent-method").innerText()).includes(
      "Aucune commission",
    ),
  );
  assert.equal(posts, 0);
  checks.push(
    "agent selection reveals real method, fee and permissions without a spending command",
  );
  if (await page.locator(".orbite-position-card").count()) {
    const preview = page.locator(".orbite-position-card").first();
    await preview.click();
    const dialog = page.locator(".orbite-preview-sheet");
    await dialog.waitFor();
    assert.ok(
      (await dialog.innerText()).includes(
        "Elle n’indique pas une offre de vente",
      ),
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await preview.evaluate((e) => e === document.activeElement),
      true,
    );
    checks.push(
      "actual issued-position preview is read-only, distinct from a listing; Escape restores focus",
    );
  }
  await page.getByRole("button", { name: "Vue grille", exact: true }).click();
  assert.equal(await page.locator(".strategy-grid .strategy-card").count(), 1);
  await page.getByRole("button", { name: "Vue manège", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".strategy-card.selected")
      .evaluate((e) => getComputedStyle(e).transitionDuration),
    "0s",
  );
  assert.equal(posts, 0);
  checks.push(
    "single real strategy, grid and reduced motion preserved; zero financial commands",
  );
  assert.deepEqual(errors, []);
  const report = {
    date: new Date().toISOString(),
    checks,
    captures,
    commands: posts,
    scope:
      "Actual local Chrome and read-only live sandbox state. No contract change or financial transaction in this design pass.",
  };
  await writeFile(
    "docs/results/orbite-ui.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
