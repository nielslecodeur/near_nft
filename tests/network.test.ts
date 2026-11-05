import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateWalletBalances,
  officialModels,
  TESTNET,
  type Deployment,
} from "../packages/shared/network.js";
import { PersistentMissionDocuments } from "../scripts/persistent-mission-documents.js";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const N = 10n ** 24n;
test("wallet budget keeps exact NEAR storage and gas separate from demoUSD", () => {
  const b = calculateWalletBalances(
    "alice.testnet",
    (10n * N).toString(),
    1000,
    "0",
    TESTNET.storageByteCost,
    "90000000",
    "1",
    "block",
    "asset.testnet",
  );
  assert.equal(b.nearBalance, (10n * N).toString());
  assert.equal(b.storageReserved, (10n ** 22n).toString());
  assert.equal(b.spendableEstimate, ((989n * N) / 100n).toString());
  assert.equal(b.demoUSD, "90000000");
});
test("staking storage offset and insufficient balances never create negative spendable amounts", () => {
  const b = calculateWalletBalances(
    "a.testnet",
    "1",
    1000,
    N.toString(),
    TESTNET.storageByteCost,
    "0",
    "1",
    "b",
    null,
  );
  assert.equal(b.storageReserved, "0");
  assert.equal(b.spendableEstimate, "0");
  assert.equal(b.asset, null);
  for (const value of ["-1", "1.2", "01", "NaN"])
    assert.throws(() =>
      calculateWalletBalances("a", value, 0, "0", "1", "0", "1", "b", null),
    );
  assert.throws(() =>
    calculateWalletBalances("a", "1", 1.5, "0", "1", "0", "1", "b", null),
  );
});
test("official models have distinct rules and unavailable adapters cannot become subscriptions", () => {
  const d = {
      series_id: "liquidity-v3",
      collection: "reserve.testnet",
      mandate_hash: "verified",
    } as Deployment,
    m = officialModels(d);
  assert.equal(new Set(m.map((x) => x.id)).size, 3);
  assert.equal(new Set(m.map((x) => x.category)).size, 3);
  assert.equal(new Set(m.map((x) => JSON.stringify(x.rules))).size, 3);
  assert.deepEqual(
    m.map((x) => x.status),
    ["unavailable", "unavailable", "demonstration"],
  );
  assert.equal(m[2].mandate_hash, "verified");
  assert.equal(officialModels(null)[2].status, "unavailable");
});
test("persistent mission documents survive restart and reject wrong owner, capability and path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "everkeep-doc-test-"));
  try {
    const id = "private-mission-0001",
      cap = "a".repeat(43),
      doc = {
        request: {
          amount: "50",
          asset: "demoUSD" as const,
          horizonDays: 30,
          liquidity: "at-maturity" as const,
          avoid: "none" as const,
          excluded: "",
          notes: "private-note",
        },
        salt: "salt",
      };
    const first = new PersistentMissionDocuments(dir);
    await first.write(id, "alice.testnet", cap, doc);
    assert.ok(
      !(await readFile(join(dir, id + ".json"), "utf8")).includes(
        "private-note",
      ),
    );
    const restored = new PersistentMissionDocuments(dir);
    assert.deepEqual(await restored.read(id, "alice.testnet", cap), doc);
    await assert.rejects(restored.read(id, "bob.testnet", cap));
    await assert.rejects(restored.read(id, "alice.testnet", "b".repeat(43)));
    await assert.rejects(
      restored.write(id, "alice.testnet", "b".repeat(43), doc),
    );
    await assert.rejects(restored.exists("../escape"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
