import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionSummary,
  displayAmount,
  compactAmount,
  routeFromHash,
  routeHash,
  requireSnapshot,
} from "../packages/shared/ui.js";
import { units, type Snapshot } from "../packages/shared/index.js";
test("compact overview rounds with BigInt, including exponent rollover", () => {
  assert.equal(compactAmount(((1n << 128n) - 1n).toString()), "≈ 3,40e32");
  assert.equal(compactAmount("999999999999999999"), "≈ 1,00e12");
  assert.equal(displayAmount("999999999999999999"), "999 999 999 999,999999");
});
const snapshot = {
  account_id: "plan.everkeep.sandbox",
  owner_id: "bob.sandbox",
  available: "900000000",
  principal: "100000000",
} as Snapshot;
const input = {
  mode: "local" as const,
  snapshot,
  amount: "25",
  beneficiary: "",
  natural:
    "Je vise 4 % par an sur dix ans, avec au maximum 20 % par stratégie.",
};
test("financial formatting preserves all u128 units without Number rounding", () => {
  const maximum = (1n << 128n) - 1n;
  assert.equal(
    units(
      displayAmount(maximum.toString()).replace(/\s/g, "").replace(",", "."),
    ),
    maximum,
  );
  assert.equal(displayAmount("1"), "0,000001");
});
test("withdrawal and transfer summaries use the same sandbox recipient defaults as the backend", () => {
  assert.ok(
    actionSummary({ ...input, action: "withdraw" }).rows.some(
      ([label, value]) => label === "Destinataire" && value === "bob.sandbox",
    ),
  );
  assert.ok(
    actionSummary({ ...input, action: "transfer" }).rows.some(
      ([label, value]) =>
        label === "Nouveau propriétaire" && value === "alice.sandbox",
    ),
  );
  assert.ok(
    actionSummary({
      ...input,
      action: "transfer",
      beneficiary: "bob.testnet",
      mode: "testnet",
    }).rows.some(([, value]) => value === "bob.testnet"),
  );
});
test("summary explains policy limits and rejects zero, unavailable amounts and ambiguous intentions", () => {
  assert.match(
    actionSummary({ ...input, action: "withdraw", amount: "1000" }).error,
    /disponible/,
  );
  assert.match(
    actionSummary({ ...input, action: "redeem", amount: "101" }).error,
    /principal/,
  );
  assert.match(
    actionSummary({ ...input, action: "withdraw", amount: "0" }).error,
    /supérieur/,
  );
  assert.equal(
    actionSummary({ ...input, action: "policy", amount: "100" }).rows.find(
      ([label]) => label === "Allocation maximale",
    )?.[1],
    "20 %",
  );
  assert.match(
    actionSummary({ ...input, action: "policy", amount: "201" }).error,
    /budget/,
  );
  assert.ok(
    actionSummary({ ...input, action: "policy", natural: "sans limites" })
      .error,
  );
});
test("rotation and revocation summaries do not promise the wrong permission changes", () => {
  assert.match(
    actionSummary({ ...input, action: "rotate" }).effect,
    /mandat existant n’est pas automatiquement révoqué/,
  );
  assert.match(
    actionSummary({ ...input, action: "revoke" }).effect,
    /supprimé/,
  );
});
test("presentation and app have distinct shareable routes, preserving legacy dashboard links", () => {
  assert.equal(routeFromHash(""), "presentation");
  assert.equal(routeFromHash("#top"), "presentation");
  assert.equal(routeFromHash("#app"), "overview");
  assert.equal(routeFromHash("#plan-dashboard"), "overview");
  for (const route of [
    "presentation",
    "overview",
    "nft",
    "security",
    "history",
    "ecosystem",
  ] as const)
    assert.equal(routeFromHash(routeHash(route)), route);
});
test("incomplete API data is refused rather than presented as a zero balance", () => {
  const complete = {
    ...snapshot,
    collection_id: "everkeep.sandbox",
    network: "sandbox",
    asset: "demo.sandbox",
    strategy: "strategy.sandbox",
    status: "Active",
    public_key: "public-test-data",
    reserved: "0",
    deposits: "1000000000",
    withdrawals: "0",
    realized_gains: "0",
    ownership_epoch: "0",
    key_version: "0",
    policy_version: "0",
    nonce: "0",
    sync_seq: "0",
    pending: null,
    policy: null,
    agent_paused: true,
    horizon_years: 10,
    target_bps: 400,
  };
  assert.equal(requireSnapshot(complete).available, "900000000");
  assert.throws(
    () => requireSnapshot({ ...complete, available: undefined }),
    /incomplet/,
  );
  assert.throws(
    () => requireSnapshot({ ...complete, reserved: "-1" }),
    /incomplet/,
  );
  assert.throws(
    () =>
      requireSnapshot({
        ...complete,
        available: ((1n << 128n) + 1n).toString(),
      }),
    /incomplet/,
  );
});
