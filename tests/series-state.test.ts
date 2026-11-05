import test from "node:test";
import assert from "node:assert/strict";
import { parseSeriesState } from "../packages/shared/series-state.js";
const terms = {
  id: "demo",
  name: "Demo",
  opens_at: "1",
  closes_at: "2",
  matures_at: "3",
  asset: "demo.testnet",
  strategy: "strategy.testnet",
  capacity: "1000000000",
  minimum: "1000000",
  max_operation: "10000000",
  max_period: "20000000",
  allocation_bps: 2000,
  version: "1",
};
const fixture = () => ({
  mode: "sandbox",
  series: {
    series: { terms: { ...terms }, mandate_hash: "a".repeat(44) },
    committed: "0",
    closed: false,
  },
  positions: [],
  listings: [],
  journal: [],
  now: "1",
  actors: { Alice: "alice.testnet" },
});

test("market provenance rejects future valuations and mismatched fixed claims", () => {
  const sale = {
    position: "p.testnet",
    id: "1",
    seller: "alice.testnet",
    buyer: "bob.testnet",
    price: "97",
    available: "100",
    principal: "0",
    expires_at: "2",
    ownership_epoch: "0",
    valuation_hash: "a",
    state: "Settled",
    valuation_at: "1",
    claim: {
      beneficiary: "alice.testnet",
      amount: "97",
      state: "Claimable",
      attempt: "1",
    },
  };
  const state = { ...fixture(), listings: [sale] };
  assert.equal(parseSeriesState(state).listings[0].valuation_at, "1");
  assert.throws(() =>
    parseSeriesState({ ...state, listings: [{ ...sale, valuation_at: "2" }] }),
  );
  assert.throws(() =>
    parseSeriesState({
      ...state,
      listings: [{ ...sale, claim: { ...sale.claim, amount: "98" } }],
    }),
  );
  assert.equal(
    parseSeriesState({
      ...state,
      listings: [{ ...sale, valuation_at: null, claim: null }],
    }).listings[0].claim,
    null,
  );
});
test("series state rejects malformed monetary/date/rule fields before rendering", () => {
  const good = fixture();
  assert.equal(parseSeriesState(good).series.committed, "0");
  for (const [field, bad] of [
    ["capacity", "0"],
    ["minimum", "NaN"],
    ["matures_at", "18446744073709551616"],
    ["allocation_bps", NaN],
    ["closes_at", "0"],
  ] as const) {
    const s = fixture();
    Object.assign(s.series.series.terms, { [field]: bad });
    assert.throws(() => parseSeriesState(s));
  }
  const broken = fixture();
  broken.series.committed = "invalid";
  assert.throws(() => parseSeriesState(broken));
});
test("series state rejects malformed market and incomplete responses", () => {
  assert.throws(() => parseSeriesState({}));
  const s: Record<string, unknown> = fixture();
  s.listings = [
    {
      position: "p.testnet",
      id: "1",
      seller: "alice.testnet",
      buyer: null,
      price: "bad",
      available: "0",
      principal: "0",
      expires_at: "2",
      ownership_epoch: "0",
      valuation_hash: "a",
      state: "Active",
    },
  ];
  assert.throws(() => parseSeriesState(s));
  s.listings = [];
  s.now = "-1";
  assert.throws(() => parseSeriesState(s));
});
