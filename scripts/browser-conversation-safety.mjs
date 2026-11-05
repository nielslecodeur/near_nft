import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--disable-gpu"],
});
const context = await browser.newContext(),
  page = await context.newPage();
const report = {
  at: new Date().toISOString(),
  mode: "isolated browser; synthetic transaction receipts; no wallet or chain mutation",
  checks: [],
};
try {
  await page.goto("http://127.0.0.1:5173/");
  const saved = await page.evaluate(async () => {
    const v = await import("/src/key-vault.ts");
    const owner = "fixture.testnet",
      password = crypto.randomUUID();
    await v.createVault(owner, password);
    const keys = await v.createPositionKey(owner, "fixture-position.testnet");
    const publicKey = btoa(String.fromCharCode(...keys.publicKey));
    keys.secretKey.fill(0);
    await v.saveVaultData(owner, "capabilities", {
      mission: crypto.randomUUID(),
    });
    const backup = await v.exportVault(owner);
    const database = await new Promise((resolve, reject) => {
      const r = indexedDB.open("everkeep-private-v1");
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    const count = await new Promise((resolve) => {
      const t = database.transaction("records"),
        r = t.objectStore("records").count();
      r.onsuccess = () => resolve(r.result);
    });
    database.close();
    if (count !== 3)
      throw Error("Encrypted vault records were not saved durably");
    if (Object.keys(localStorage).some((k) => /fixture|capabilities/.test(k)))
      throw Error("Private data in localStorage");
    return { owner, password, publicKey, backup };
  });
  await page.reload();
  const vault = await page.evaluate(async (saved) => {
    const v = await import("/src/key-vault.ts");
    if (!(await v.hasVault(saved.owner)) || v.vaultUnlocked(saved.owner))
      throw Error(
        "Encrypted vault missing or plaintext unlock survived reload",
      );
    await v.importVault(saved.backup, saved.owner);
    let wrong = false;
    try {
      await v.unlockVault(saved.owner, "incorrect-password");
    } catch {
      wrong = true;
    }
    await v.unlockVault(saved.owner, saved.password);
    const key = await v.positionKey(
      saved.owner,
      "fixture-position.testnet",
      saved.publicKey,
    );
    key.secretKey.fill(0);
    if (!(await v.vaultData(saved.owner, "capabilities")).mission)
      throw Error("Capability not restored");
    let other = false;
    try {
      await v.importVault(saved.backup, "other.testnet");
    } catch {
      other = true;
    }
    const invalid = structuredClone(saved.backup);
    invalid.records.push({
      id: "meta:other.testnet",
      value: { owner: saved.owner },
    });
    let invalidRejected = false;
    try {
      await v.importVault(invalid, saved.owner);
    } catch {
      invalidRejected = true;
    }
    return { wrong, other, invalidRejected };
  }, saved);
  assert.deepEqual(vault, { wrong: true, other: true, invalidRejected: true });
  report.checks.push(
    "Encrypted vault and capability persist locally; reload locks decrypted keys; password unlock and optional export restore work; wrong password, owner and namespace rejected",
  );
  const session = await page.evaluate(async () => {
    const s = await import("/src/wallet-session.ts");
    s.installWalletSessionStorage();
    localStorage.setItem(
      "intear-wallet:appPrivateKey",
      "synthetic-session-value",
    );
    localStorage.setItem("public-preference", "visible");
    const physicalKeys = Array.from({ length: localStorage.length }, (_, i) =>
      localStorage.key(i),
    );
    return {
      memory: s.hasWalletApprovalSession(),
      read:
        localStorage.getItem("intear-wallet:appPrivateKey") ===
        "synthetic-session-value",
      persisted: physicalKeys.includes("intear-wallet:appPrivateKey"),
      publicPreference: physicalKeys.includes("public-preference"),
    };
  });
  assert.deepEqual(session, {
    memory: true,
    read: true,
    persisted: false,
    publicPreference: true,
  });
  await page.reload();
  assert.equal(
    await page.evaluate(async () => {
      const s = await import("/src/wallet-session.ts");
      s.installWalletSessionStorage();
      return s.hasWalletApprovalSession();
    }),
    false,
  );
  report.checks.push(
    "Intear app-approval secret is readable by connector in current tab but absent from persistent storage and lost after reload; public preferences retained",
  );
  const input = {
    network: "testnet",
    owner: "fixture.testnet",
    receiver: "missions.testnet",
    method: "pay",
    args: { id: "fixture-mission" },
    deposit: "15000000000000000000000",
    gas: "280000000000000",
  };
  const first = await page.evaluate(async (input) => {
    const j = await import("/src/transaction-journal.ts");
    return j.prepareOperation(input);
  }, input);
  await page.reload();
  const retry = await page.evaluate(async (input) => {
    const j = await import("/src/transaction-journal.ts");
    return j.prepareOperation(input);
  }, input);
  assert.equal(retry.fresh, false);
  assert.equal(retry.operation.id, first.operation.id);
  const cancelled = await page.evaluate(async (input) => {
    const j = await import("/src/transaction-journal.ts");
    const old = j.operations().at(-1);
    j.saveOperation({ ...old, status: "rejected" });
    return j.prepareOperation(input);
  }, input);
  assert.equal(cancelled.fresh, true);
  const confirmed = await page.evaluate(async (input) => {
    const j = await import("/src/transaction-journal.ts");
    const old = j.operations().at(-1);
    j.saveOperation({ ...old, status: "confirmed" });
    return j.prepareOperation(input);
  }, input);
  assert.equal(confirmed.fresh, false);
  report.checks.push(
    "reload reuses pending payment identity; explicit user rejection permits retry; final confirmed payment is never submitted twice",
  );
  const op = await page.evaluate(async () => {
    const j = await import("/src/transaction-journal.ts");
    return (
      await j.prepareOperation({
        network: "testnet",
        owner: "fixture.testnet",
        receiver: "missions.testnet",
        method: "reconcile_allocation",
        args: { id: "fixture-mission", index: "0" },
        deposit: "0",
        gas: "280000000000000",
      })
    ).operation;
  });
  const hash = "A".repeat(44);
  let failure = false;
  await page.route("https://test.rpc.fastnear.com", async (route) => {
    const req = route.request().postDataJSON();
    if (req.method !== "tx") return route.continue();
    await route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: req.id,
        result: {
          final_execution_status: "FINAL",
          transaction: {
            hash,
            signer_id: op.owner,
            receiver_id: op.receiver,
            actions: [
              {
                FunctionCall: {
                  method_name: op.method,
                  deposit: op.deposit,
                  gas: op.gas,
                  args: Buffer.from(JSON.stringify(op.args)).toString("base64"),
                },
              },
            ],
          },
          status: { SuccessValue: "" },
          receipts_outcome: [
            {
              outcome: {
                status: failure
                  ? { Failure: { error: "synthetic failure" } }
                  : { SuccessValue: "" },
              },
            },
          ],
        },
      },
    });
  });
  const returned = await page.evaluate(
    async ({ op, hash }) => {
      const j = await import("/src/transaction-journal.ts");
      const url = new URL(location.href);
      url.searchParams.set("ek_op", op.id);
      url.searchParams.set("transactionHashes", hash);
      history.replaceState(null, "", url);
      await j.consumeWalletReturn();
      return {
        status: j.operations().find((x) => x.id === op.id).status,
        query: location.search,
      };
    },
    { op, hash },
  );
  assert.equal(returned.status, "confirmed");
  assert.equal(returned.query.includes("transactionHashes"), false);
  const reconcile = await page.evaluate(async (op) => {
    const j = await import("/src/transaction-journal.ts");
    const { id, createdAt, status, fingerprint, hash, error, ...input } = op;
    return j.prepareOperation(input);
  }, op);
  assert.equal(reconcile.fresh, true);
  failure = true;
  assert.equal(
    await page.evaluate(
      async ({ op, hash }) => {
        const j = await import("/src/transaction-journal.ts");
        try {
          await j.followOperation(
            j.saveOperation({ ...op, hash, status: "pending" }),
          );
          return false;
        } catch {
          return j.operations().find((x) => x.id === op.id).status === "failed";
        }
      },
      { op: reconcile.operation, hash },
    ),
    true,
  );
  report.checks.push(
    "wallet-return hash automatically verified against final exact receipt and URL cleaned; zero-deposit reconciliation can be explicitly repeated; failed child receipt remains failure despite top-level success and hash",
  );
  await writeFile(
    "docs/results/conversation-safety.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
