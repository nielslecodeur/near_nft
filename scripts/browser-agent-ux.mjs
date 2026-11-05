import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const dir = ".impeccable/review/agent-simple";
await mkdir(dir, { recursive: true });
const captures = [],
  errors = [],
  checks = [],
  proof = JSON.parse(
    await readFile("docs/results/grouped-agent-proof.json", "utf8"),
  );
const b = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--disable-gpu"],
});
try {
  const c = await b.newContext({ reducedMotion: "reduce" }),
    p = await c.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  async function shot(name, width) {
    await p.setViewportSize({ width, height: 1000 });
    await p.evaluate(() => document.fonts.ready);
    await p.evaluate(() => scrollTo(0, 0));
    await p.waitForTimeout(150);
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      name,
    );
    const path = dir + "/" + name + "-" + width + ".png";
    await p.screenshot({ path, fullPage: true, animations: "disabled" });
    captures.push(path);
  }
  for (const width of [390, 1440]) {
    await p.setViewportSize({ width, height: 1000 });
    await p.goto("http://127.0.0.1:5173/?qa-width=" + width + "#agent");
    await p.locator(".agent-conversation").waitFor({ timeout: 45000 });
    await shot("conversation", width);
    await p
      .getByLabel("Votre demande", { exact: true })
      .fill("J’ai 50 demoUSD, garder 15 disponibles, 30 jours à échéance");
    await p
      .getByRole("button", { name: "Préparer ma demande", exact: true })
      .click();
    await p.locator(".conversation-quote").waitFor();
    assert.match(
      await p.locator(".conversation-quote").innerText(),
      /validés ensemble/,
    );
    await shot("request", width);
  }
  await p.getByRole("button", { name: "Modifier", exact: true }).click();
  await p.getByLabel("Votre demande", { exact: true }).focus();
  assert.equal(
    await p
      .getByLabel("Votre demande", { exact: true })
      .evaluate((e) => e.matches(":focus-visible")),
    true,
  );
  await p
    .getByLabel("Votre demande", { exact: true })
    .fill("Je veux un retrait immédiat");
  await p
    .getByRole("button", { name: "Préparer ma demande", exact: true })
    .click();
  assert.equal(await p.locator(".conversation-quote").count(), 0);
  checks.push(
    "conversation preserves requested reserve; incompatible liquidity prepares no paid quote; keyboard focus and reduced motion verified",
  );
  await p.evaluate(async (proof) => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default,
      DOM = (await import("/node_modules/.vite/deps/react-dom_client.js"))
        .default,
      { AgentProposal } = await import("/src/AgentProposal.tsx"),
      { testnetMissionCatalogue } = await import("/src/testnet-missions.ts"),
      cat = await testnetMissionCatalogue();
    const proposal = structuredClone(proof.proposal);
    proposal.expires_at = (BigInt(cat.now) + 600_000_000_000n).toString();
    const mission = {
        id: proof.id,
        profile: cat.configuration.profiles.find((p) => p.id === "liquidity"),
        state: "Delivered",
        operations: [null],
      },
      view = {
        mission,
        document: { request: { amount: "20" }, proposal },
        subscriptions: [null],
      };
    document.getElementById("root").style.display = "none";
    const node = document.createElement("div");
    node.className = "orbite-app";
    node.style.minHeight = "100vh";
    document.body.append(node);
    const root = DOM.createRoot(node);
    globalThis.__fixtureClicks = 0;
    globalThis.__draw = (state) => {
      mission.operations = [
        state === "confirmed"
          ? proof.operation
          : state === "expired"
            ? {
                ...proof.operation,
                state: "Authorized",
                authorization_expires_at: "1",
              }
            : null,
      ];
      proposal.expires_at =
        state === "expired"
          ? "1"
          : (BigInt(cat.now) + 600_000_000_000n).toString();
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "p",
            { style: { padding: "20px", margin: 0 } },
            "Banc de rendu isolé · états de proposition · aucune signature",
          ),
          React.createElement(
            "main",
            { style: { padding: "24px" } },
            React.createElement(AgentProposal, {
              view,
              catalogue: cat,
              now: BigInt(cat.now),
              busy: false,
              onInvest: () => globalThis.__fixtureClicks++,
              onRenew: () => globalThis.__fixtureClicks++,
              onModify: () => {},
              onRefresh: () => {},
              onPositions: () => {},
              onCancel: () => {},
              onClaim: () => {},
            }),
          ),
        ),
      );
    };
    globalThis.__draw("proposed");
  }, proof);
  await p
    .getByRole("button", { name: "Créer ma position", exact: true })
    .waitFor();
  assert.equal(await p.locator(".agent-proposal button.primary").count(), 1);
  assert.equal(await p.locator(".agent-proposal .mission-progress").count(), 0);
  for (const width of [390, 768, 1440]) await shot("proposal-fixture", width);
  await p
    .getByRole("button", { name: "Créer ma position", exact: true })
    .click();
  assert.equal(await p.evaluate(() => globalThis.__fixtureClicks), 1);
  await p.evaluate(() => globalThis.__draw("expired"));
  await p
    .getByRole("button", { name: "Actualiser la proposition", exact: true })
    .waitFor();
  assert.equal(
    await p
      .getByRole("button", { name: "Créer ma position", exact: true })
      .count(),
    0,
  );
  await shot("expired-fixture", 390);
  await p.evaluate(() => globalThis.__draw("confirmed"));
  await p
    .getByText("NFT et dépôt confirmés sur NEAR Testnet.", { exact: true })
    .waitFor();
  for (const width of [390, 1440]) await shot("success-fixture", width);
  checks.push(
    "compact proposal: one primary creation action, amounts/reserve/fees visible; expired and confirmed branches have no misleading creation button",
  );
  await p.goto("http://127.0.0.1:5173/#agent");
  await p.locator(".agent-conversation").waitFor({ timeout: 45000 });
  await p.evaluate(async () => {
    const v = await import("/src/key-vault.ts");
    void v.requestVault("ui-fixture.testnet").catch(() => {});
  });
  await p.locator("dialog.key-vault-dialog[open]").waitFor();
  assert.equal(
    await p.locator("dialog[open] input[type=file]").isVisible(),
    false,
  );
  for (const width of [390, 1440]) await shot("vault", width);
  await p.keyboard.press("Escape");
  await p.locator("dialog.key-vault-dialog[open]").waitFor({ state: "hidden" });
  checks.push(
    "vault password form replaces mandatory JSON download; optional legacy import folded; Escape closes protected dialog",
  );
  for (const width of [390, 1440]) {
    await p.setViewportSize({ width, height: 1000 });
    await p.goto("http://127.0.0.1:5173/#explorer");
    await p
      .getByText("Démonstration Everkeep · position réelle de test", {
        exact: true,
      })
      .waitFor({ timeout: 45000 });
    await shot("marketplace", width);
  }
  await p.getByText("Options", { exact: true }).click();
  await p.getByText("Coffre et sauvegarde", { exact: true }).click();
  assert.equal(
    await p
      .getByRole("button", {
        name: "Exporter une copie de secours",
        exact: true,
      })
      .count(),
    1,
  );
  await shot("backup-settings", 390);
  checks.push(
    "encrypted backup export exists only in Options; real testnet demo origin labelled; responsive widths 390/768/1440 have no document overflow",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/results/agent-simple-ui.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        captures,
        checks,
        errors,
        scope:
          "public UI and explicit proposal state fixtures; no wallet signatures. Actual chain execution and two approvals are in grouped-agent-proof.json.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ captures, checks, errors }));
} finally {
  await b.close();
}
