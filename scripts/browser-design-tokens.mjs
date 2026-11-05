import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const spec = JSON.parse(
  await readFile("design-system/terminal/tokens.json", "utf8"),
);
const out = ".impeccable/review/terminal-tokens";
await mkdir(out, { recursive: true });
const errors = [],
  captures = [],
  checks = [];
const b = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--disable-gpu"],
});
try {
  const c = await b.newContext(),
    p = await c.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  for (const width of [1440, 390]) {
    await p.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await p.goto("http://127.0.0.1:5173/design/tokens.html");
    await p.waitForFunction(
      () => document.documentElement.dataset.tokensReady === "true",
    );
    await p.evaluate(() => document.fonts.ready);
    assert.equal(await p.locator(".surface-item").count(), 4);
    assert.equal(await p.locator(".radius-shape").count(), 3);
    if (
      await p.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )
    ) {
      await p.screenshot({
        path: out + "/overflow-" + width + ".png",
        fullPage: true,
      });
      console.error(
        await p.evaluate(() =>
          [...document.querySelectorAll("main *")]
            .filter((e) => e.getBoundingClientRect().right > innerWidth)
            .map((e) => ({
              class: e.className,
              text: e.textContent.slice(0, 80),
            })),
        ),
      );
    }
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      "overflow " + width,
    );
    const fonts = await p.evaluate(() =>
      [...document.fonts]
        .filter((f) => f.status === "loaded")
        .map((f) => f.family),
    );
    assert.deepEqual([...new Set(fonts)].sort(), ["IBM Plex Mono", "Inter"]);
    assert.ok(
      await p
        .locator(".numeric")
        .first()
        .evaluate((e) =>
          getComputedStyle(e).fontVariantNumeric.includes("tabular-nums"),
        ),
    );
    assert.equal(
      (
        await p.request.get(
          "http://127.0.0.1:5173/design/everkeep-wordmark.svg",
        )
      ).status(),
      200,
    );
    assert.equal(
      await p
        .locator(".preview-header a")
        .evaluate((e) => e.getBoundingClientRect().height >= 44),
      true,
    );
    const path = out + "/tokens-" + width + ".png";
    await p.screenshot({ path, fullPage: true, animations: "disabled" });
    captures.push(path);
    checks.push(
      width +
        ": all4surfaces,3radii,2local fonts,tabular figures,wordmark,44pxheader target,no document overflow",
    );
  }
  function luminance(hex) {
    const c = hex
      .replace("#", "")
      .match(/../g)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  }
  function contrast(a, b) {
    const x = luminance(a),
      y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  const contrasts = [];
  for (const surface of ["bg", "s1", "s2", "s3"])
    for (const text of ["text", "muted", "up", "down"]) {
      const ratio = contrast(
        spec.tokens.color[surface],
        spec.tokens.color[text],
      );
      assert.ok(ratio >= 4.5, text + " on " + surface);
      contrasts.push({ text, surface, ratio: Number(ratio.toFixed(2)) });
    }
  assert.ok(
    contrast(spec.tokens.color["on-brand"], spec.tokens.color.brand) >= 4.5,
  );
  await p.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await p
      .locator(".preview-header a")
      .evaluate((e) => getComputedStyle(e).transitionDuration),
    "0s",
  );
  await p.getByRole("link", { name: "Retour à Explorer", exact: true }).focus();
  assert.ok(
    await p
      .getByRole("link", { name: "Retour à Explorer", exact: true })
      .evaluate((e) => e.matches(":focus-visible")),
  );
  assert.deepEqual(errors, []);
  checks.push(
    "Text/muted/up/down contrast >=4.5 on all4surfaces, brand-label contrast >=4.5, visible keyboard focus and reduced-motion0s",
  );
  await writeFile(
    "docs/results/terminal-tokens-browser.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        stage: 1,
        checks,
        contrasts,
        captures,
        errors,
        scope:
          "Design-token reference only. No product primitives, trading data, wallet calls or transactions.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, captures, errors }));
} finally {
  await b.close();
}
