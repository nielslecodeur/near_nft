import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyReusablePosition } from "../packages/shared/mission-authority.js";
const d = {
  collection: "collection.testnet",
  asset: "demousd.testnet",
  strategy: "strategy.testnet",
  mandate_hash: "fixed",
};
const source: any = {
  client: "owner.testnet",
  state: "Delivered",
  operations: [
    {
      position: "position.collection.testnet",
      state: "Authorized",
      authorization_expires_at: "99",
      allocation: { collection: d.collection, mandate_hash: d.mandate_hash },
    },
  ],
};
const snapshot: any = {
  account_id: "position.collection.testnet",
  collection_id: d.collection,
  owner_id: "owner.testnet",
  funded: false,
  pending: null,
  deposits: "0",
  series: { mandate_hash: d.mandate_hash },
  asset: d.asset,
  strategy: d.strategy,
  status: "SubscriptionAuthorized",
};
test("expired unfunded account can be reused only by its current owner on the exact official route", () => {
  assert.equal(
    verifyReusablePosition(source, snapshot, null, "owner.testnet", d, "100")
      .position,
    snapshot.account_id,
  );
  for (const mutate of [
    (m: any, s: any) => (m.client = "other.testnet"),
    (m: any, s: any) => (s.owner_id = "other.testnet"),
    (m: any, s: any) => (s.funded = true),
    (m: any, s: any) => (s.deposits = "1"),
    (m: any, s: any) => (s.pending = {}),
    (m: any, s: any) => (m.operations[0].state = "Funding"),
    (m: any, s: any) => (m.operations[0].authorization_expires_at = "101"),
    (m: any, s: any) => m.operations.push(null),
    (m: any, s: any) => (s.strategy = "evil.testnet"),
    (m: any, s: any) => (s.account_id = "nested.position.collection.testnet"),
    (m: any, s: any) => (s.series.mandate_hash = "changed"),
    (m: any, s: any) => (s.status = "SaleLocked"),
  ]) {
    const m = structuredClone(source),
      s = structuredClone(snapshot);
    mutate(m, s);
    assert.throws(() =>
      verifyReusablePosition(m, s, null, "owner.testnet", d, "100"),
    );
  }
  assert.throws(() =>
    verifyReusablePosition(
      source,
      snapshot,
      { state: "Authorized" },
      "owner.testnet",
      d,
      "100",
    ),
  );
});
