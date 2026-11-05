import { test } from "node:test";
import assert from "node:assert/strict";
import { nftPassport } from "../packages/shared/passport.js";
import { ecosystem } from "../packages/shared/ecosystem.js";
import type { Snapshot } from "../packages/shared/index.js";
const snapshot = {
  account_id: "plan.collection.testnet",
  collection_id: "collection.testnet",
  owner_id: "bob.testnet",
  network: "testnet",
  status: "Active",
  pending: null,
  available: "900000000",
  reserved: "0",
  principal: "75000000",
  deposits: "1000000000",
  withdrawals: "25000000",
  realized_gains: "0",
  asset: "demo.testnet",
  strategy: "strategy.testnet",
  ownership_epoch: "2",
  key_version: "3",
  policy_version: "4",
  nonce: "9",
  sync_seq: "8",
  agent_paused: true,
  policy: null,
} as Snapshot;
test("NFT passport preserves identity, generations and exact amounts without exporting secrets", () => {
  const poisoned = {
    ...snapshot,
    private_key: "must-not-export",
    secretKey: "must-not-export",
  };
  const result = nftPassport(poisoned, "2026-11-02T00:00:00Z");
  assert.equal(result.nft.token_id, result.wallet.account_id);
  assert.equal(result.nft.owner_id, "bob.testnet");
  assert.equal(result.generations.ownership_epoch, "2");
  assert.equal(result.balances.principal, "75000000");
  assert.equal(JSON.stringify(result).includes("must-not-export"), false);
  assert.match(result.evidence, /not a signed proof/);
  assert.equal(result.controls.agent, null);
});
test("passport does not advertise a transfer-ready state while funds or ownership are pending", () => {
  assert.equal(
    nftPassport({ ...snapshot, pending: { id: "1" } }, "now").controls
      .transferable,
    false,
  );
  assert.equal(
    nftPassport({ ...snapshot, status: "TransferPending" }, "now").controls
      .transferable,
    false,
  );
  assert.throws(
    () => nftPassport({ ...snapshot, account_id: "fake.testnet" }, "now"),
    /collection/,
  );
  assert.throws(
    () =>
      nftPassport(
        { ...snapshot, account_id: "nested.plan.collection.testnet" },
        "now",
      ),
    /collection/,
  );
});
test("ecosystem links contain only HTTPS resources and no misleading Git fallback", () => {
  assert.equal(new Set(ecosystem.map((x) => x.name)).size, 15);
  for (const item of ecosystem) {
    for (const value of [item.website, item.docs, item.code, item.api])
      if (value) assert.equal(new URL(value).protocol, "https:");
    assert.ok(item.boundary.length > 0);
  }
  for (const name of ["HEX", "SVRN", "GoMining", "Gulf Labs"])
    assert.equal(ecosystem.find((x) => x.name === name)?.code, undefined);
});
