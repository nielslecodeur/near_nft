import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  await page.getByRole("button", { name: "NFT du plan", exact: true }).click();
  await page
    .getByRole("button", { name: "Charger le compte", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Un NFT qui détient un compte." }),
  ).toBeVisible();
  const before = await (await fetch("http://127.0.0.1:8787/state")).json();
  await expect(page.locator(".nft-identity dd").first()).toHaveText(
    before.snapshot.account_id,
  );
  await mkdir(".research/screenshots", { recursive: true });
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le passeport" }).click();
  const download = await downloaded;
  await download.saveAs(".research/nft-passport-check.json");
  const passport = JSON.parse(
    await readFile(".research/nft-passport-check.json", "utf8"),
  );
  if (
    passport.nft.token_id !== before.snapshot.account_id ||
    passport.nft.owner_id !== before.snapshot.owner_id ||
    passport.balances.principal !== before.snapshot.principal ||
    passport.generations.ownership_epoch !== before.snapshot.ownership_epoch
  )
    throw new Error("Passport differs from loaded chain state");
  if (
    !passport.evidence.includes("not a signed proof") ||
    JSON.stringify(passport).includes("secretKey")
  )
    throw new Error("Misleading or unsafe export");
  await page
    .getByRole("button", { name: "Transmettre ce NFT", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Transmettre votre plan." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Transmettre ce NFT", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: ".research/screenshots/nft-passport-desktop.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "Écosystème", exact: true }).click();
  await page.getByRole("button", { name: "Toutes", exact: true }).click();
  await expect(page.locator(".ecosystem-resource")).toHaveCount(15);
  await expect(page.locator(".ecosystem-observation")).toContainText(
    "Lecture seule",
  );
  await page.getByRole("button", { name: "Agent", exact: true }).click();
  await expect(page.locator(".ecosystem-resource")).toHaveCount(3);
  await page.getByRole("button", { name: "Toutes", exact: true }).click();
  await page.screenshot({
    path: ".research/screenshots/ecosystem-desktop.png",
    fullPage: false,
  });
  const sizes = [];
  for (const width of [1440, 1024, 768, 650, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ["NFT du plan", "Écosystème"]) {
      await page.getByRole("button", { name, exact: true }).click();
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw new Error(`${name} overflows ${width}px`);
      if (width === 390 && name === "NFT du plan")
        await page.screenshot({
          path: ".research/screenshots/nft-passport-mobile.png",
          fullPage: true,
        });
    }
    sizes.push(width);
  }
  const after = await (await fetch("http://127.0.0.1:8787/state")).json();
  if (JSON.stringify(before.snapshot) !== JSON.stringify(after.snapshot))
    throw new Error("Read-only NFT flow changed wallet state");
  if (errors.length) throw new Error(errors.join("\n"));
  const result = {
    date: new Date().toISOString(),
    liveSandbox: true,
    checks: [
      "loaded NFT identity and amounts",
      "JSON passport export without ownership-proof claim",
      "existing transfer dialog, Escape and focus return",
      "all 15 ecosystem resources and category filter",
      "Intents observation labelled read-only",
      "six viewports for both pages",
      "wallet state unchanged",
    ],
    viewportsWithoutOverflow: sizes,
    pageErrors: errors,
    scope:
      "Read-only observation and cancelled transfer preparation. No new NFT minted, external integration executed or testnet transaction sent.",
  };
  await writeFile(
    "docs/results/nft-workspace.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
