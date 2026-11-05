/** Read-only rendering fixtures. Never submits a financial command. */
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const response = await fetch("http://127.0.0.1:8792/missions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "http://127.0.0.1:5173",
  },
  body: JSON.stringify({ action: "history", actor: "Alice" }),
});
const data = await response.json(),
  base = data.missions.find((m) =>
    m.operations.some((o) => o?.state === "Confirmed"),
  );
assert.ok(base, "Run test:missions:browser first");
const confirmed = base.operations.find((o) => o?.state === "Confirmed"),
  pending = {
    ...structuredClone(confirmed),
    state: "Uncertain",
    position: "fixture-pending.market.sandbox",
  };
const fixtures = [
  {
    ...structuredClone(base),
    id: "fixture-partial-0001",
    operations: [confirmed, pending],
  },
  {
    ...structuredClone(base),
    id: "fixture-pending-0001",
    operations: [{ ...pending, state: "Authorized" }],
  },
  { ...structuredClone(base), id: "fixture-proposal-001", operations: [null] },
  {
    ...structuredClone(base),
    id: "fixture-abstain-0001",
    outcome: "abstain",
    operations: [],
  },
  {
    ...structuredClone(base),
    id: "fixture-confirmed-01",
    operations: [confirmed],
  },
  {
    ...structuredClone(base),
    id: "fixture-private-001",
    operations: [confirmed],
  },
];
const dir = ".impeccable/review/missions",
  captures = [];
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--disable-gpu"],
});
let commands = 0;
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await page.route("http://127.0.0.1:8792/missions", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action !== "history") {
      commands++;
      throw new Error("No command allowed in render fixtures");
    }
    await route.fulfill({ json: { missions: fixtures, now: data.now } });
  });
  await page.addInitScript(
    ({ owner, ids }) => {
      localStorage.setItem(
        `everkeep.missions.v1:http://127.0.0.1:8792:${owner}`,
        JSON.stringify(
          Object.fromEntries(
            ids.map((id) => [id, "test-fixture-capability-only"]),
          ),
        ),
      );
    },
    {
      owner: base.client,
      ids: fixtures
        .filter((m) => m.id !== "fixture-private-001")
        .map((m) => m.id),
    },
  );
  await page.goto("http://127.0.0.1:5173/#agent");
  await page.locator(".agent-missions[aria-busy=false]").waitFor();
  await page.getByRole("button", { name: "Historique", exact: true }).click();
  await page.evaluate(() => {
    const p = document.createElement("p");
    p.textContent =
      "Banc de rendu isolé — données fictives, aucune transaction";
    p.style.cssText = "padding:16px;background:#151c17;color:#f0f2ea;margin:0";
    document.body.prepend(p);
  });
  for (const text of [
    "Résultat partiel · 1/2 NFT confirmés",
    "Investissement en attente · 0/1 NFT confirmé",
    "Proposition à examiner · aucun investissement",
    "Abstention · aucun investissement",
    "1 position NFT confirmée",
    "Résultat privé indisponible dans ce navigateur",
  ])
    assert.ok((await page.getByText(text, { exact: true }).count()) > 0, text);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    const path = `${dir}/history-results-fixture-${width}.png`;
    await page.screenshot({ path, fullPage: true });
    captures.push(path);
  }
  assert.equal(commands, 0);
  await writeFile(
    "docs/results/agent-missions-states.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        scope:
          "Explicitly fictitious history rendering cases, zero financial calls",
        checks: [
          "abstention/proposal/pending/partial/confirmed/private-unavailable results distinct at 390 and 1440",
          "zero financial commands",
        ],
        captures,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ captures, commands }));
} finally {
  await browser.close();
}
