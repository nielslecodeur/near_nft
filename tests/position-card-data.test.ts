import test from "node:test";
import assert from "node:assert/strict";
import type { Snapshot } from "../packages/shared/index";
import type { SeriesState } from "../packages/shared/series-state";
import {
  valueMovement,
  positionCardFacts,
  observationDate,
  type ValueHistory,
} from "../src/terminal/position-card-data";
const history = (a: number, b: number): ValueHistory => ({
  source: "demonstration",
  unit: "demoUSD",
  points: [
    { at: "2026-11-01T00:00:00Z", value: a },
    { at: "2026-11-02T00:00:00Z", value: b },
  ],
});
test("value changes distinguish rising, falling, stable and missing history without claiming performance", () => {
  assert.equal(valueMovement(history(100, 110))?.percent, 10);
  assert.equal(valueMovement(history(100, 90))?.percent, -10);
  assert.equal(valueMovement(history(100, 100))?.percent, 0);
  assert.equal(valueMovement(), null);
  assert.equal(valueMovement(history(0, 10)), null);
});
test("invalid, negative, non-finite or unordered valuation histories are rejected", () => {
  for (const h of [
    history(-1, 10),
    history(1, NaN),
    history(1, Infinity),
    { ...history(1, 2), points: history(1, 2).points.reverse() },
  ])
    assert.equal(valueMovement(h), null);
});
test("position facts keep exact balances and withdrawal locks distinct, without valuation", () => {
  const p = {
    account_id: "nft.testnet",
    asset: "demo.testnet",
    status: "Active",
    available: "15000000",
    principal: "10000000",
    reserved: "3000000",
    pending: null,
    series: { terms: { matures_at: "100" } },
  } as Snapshot;
  const data = { now: "99", listings: [] } as unknown as SeriesState;
  const facts = positionCardFacts(p, data, "demo.testnet");
  assert.deepEqual(
    facts.rows.map((r) => r.value),
    ["28 demoUSD", "0 demoUSD", "15 demoUSD", "10 demoUSD", "3 demoUSD"],
  );
  assert.equal(facts.composition.basis, "actual");
  assert.equal(facts.observedAt, "99");
  assert.equal("valuation" in facts, false);
});
test("unknown assets retain raw units and cannot acquire demoUSD decimals or a converted total", () => {
  const p = {
    account_id: "nft.testnet",
    asset: "unknown.testnet",
    status: "Active",
    available: "340282366920938463463374607431768211",
    principal: "1",
    reserved: "0",
    pending: null,
    series: null,
  } as unknown as Snapshot;
  const facts = positionCardFacts(
    p,
    { now: "100", listings: [] } as unknown as SeriesState,
    "demo.testnet",
  );
  assert.equal(
    facts.rows[0].value,
    "340282366920938463463374607431768212 unités brutes · unknown.testnet",
  );
  assert.ok(facts.rows.every((r) => !r.value.includes("demoUSD")));
  assert.equal(observationDate("invalid"), null);
});
