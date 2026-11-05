import test from "node:test";
import assert from "node:assert/strict";
import {
  baskets,
  basketById,
  validateBasket,
  fictionalPrices,
  validatePrices,
  priceDay,
  subscribeBasket,
  valueBasket,
  basketHistory,
  validateBasketPosition,
  DAY_NS,
} from "../packages/shared/baskets.js";
import {
  units,
  ml_dsa65,
  authorize,
  envelope,
} from "../packages/shared/index.js";
import { prepareThematic } from "../packages/agent/thematic.js";
import { positionExit } from "../packages/shared/position-exit.js";
const now = BigInt(Date.parse("2026-11-05T15:00:00Z")) * 1_000_000n;
test("three versioned baskets have five validated identifiers and exactly 100%", () => {
  assert.equal(baskets.length, 3);
  for (const b of baskets) {
    validateBasket(b);
    assert.equal(
      b.components.reduce((v, c) => v + c.weight_bps, 0),
      10000,
    );
    assert.equal(b.components.length, 5);
  }
  const wrong = structuredClone(baskets[0]);
  wrong.components[0].symbol = "FAKE";
  assert.throws(() => validateBasket(wrong), /INSTRUMENT/);
  wrong.components[0] = structuredClone(baskets[0].components[0]);
  wrong.components[0].weight_bps++;
  assert.throws(() => validateBasket(wrong), /WEIGHTS/);
  assert.throws(() => basketById("ai-infrastructure", "2"), /VERSION/);
});
test("price modes, missing/null/zero/stale/mixed prices fail explicitly; weekend uses Friday", () => {
  const b = baskets[0],
    p = fictionalPrices(b, now);
  validatePrices(b, p, now);
  for (const change of [
    { source: "historical" },
    { mode: "historical" },
    { day: (BigInt(p.day) - 1n).toString() },
    { prices: { ...p.prices, NVDA: "0" } },
    { prices: { ...p.prices, NVDA: null } },
    { prices: { ...p.prices, NVDA: "1" } },
    { prices: { NVDA: "1" } },
  ])
    assert.throws(() => validatePrices(b, { ...p, ...change } as any, now));
  const sunday = BigInt(Date.parse("2026-11-08T20:00:00Z")) * 1000000n,
    friday = BigInt(Date.parse("2026-11-06T00:00:00Z")) * 1000000n;
  assert.equal(priceDay(sunday), priceDay(friday));
  validatePrices(b, fictionalPrices(b, sunday), sunday);
});
test("exact allocations, quantities and residual reconcile without deposit-generated performance", () => {
  for (const b of baskets)
    for (const a of ["1", "100.000001", "99999.999999"]) {
      const p = subscribeBasket(
        b,
        units(a).toString(),
        fictionalPrices(b, now),
        now,
      );
      assert.equal(valueBasket(p, fictionalPrices(b, now)), p.capital);
      validateBasketPosition(p);
      assert.ok(BigInt(p.remainder) >= 0n);
      assert.ok(BigInt(p.remainder) < 100n);
      assert.equal(basketHistory(p, now).length, 1);
      assert.throws(
        () => subscribeBasket(b, "0", fictionalPrices(b, now), now),
        /LIMIT/,
      );
    }
});
test("valuation rises and falls, no rebalancing, frozen model and quantities survive editorial mutation", () => {
  const source = structuredClone(baskets[0]),
    p = subscribeBasket(
      source,
      units("100").toString(),
      fictionalPrices(source, now),
      now,
    ),
    before = JSON.stringify(p);
  source.name = "Changed";
  source.components[0].weight_bps = 9999;
  const values = Array.from({ length: 24 }, (_, i) =>
    BigInt(valueBasket(p, fictionalPrices(p.model, now + BigInt(i) * DAY_NS))),
  );
  assert.ok(values.some((v) => v > BigInt(p.capital)));
  assert.ok(values.some((v) => v < BigInt(p.capital)));
  assert.equal(JSON.stringify(p), before);
  const tampered = structuredClone(p);
  tampered.lots[0].quantity = "999";
  assert.throws(() => validateBasketPosition(tampered), /MISMATCH/);
  const closed = { ...p, closed_day: p.entry_day };
  assert.throws(
    () => valueBasket(closed, fictionalPrices(p.model, now + DAY_NS)),
    /CLOSED/,
  );
});
test("simulation never controls available tokens and closing is required before withdrawal", () => {
  const p = subscribeBasket(
    baskets[0],
    units("100").toString(),
    fictionalPrices(baskets[0], now),
    now,
  );
  const s = {
    basket: p,
    series: null,
    status: "Active",
    pending: null,
    principal: "0",
    available: "100000000",
    reserved: "0",
  };
  assert.equal(positionExit(s, now, false).withdrawable, "0");
  assert.equal(
    positionExit(
      { ...s, basket: { ...p, closed_day: p.entry_day } },
      now,
      false,
    ).withdrawable,
    s.available,
  );
  assert.equal(
    positionExit(
      { ...s, basket: { ...p, closed_day: p.entry_day }, pending: { id: 1 } },
      now,
      false,
    ).withdrawable,
    "0",
  );
});
test("ML-DSA signature binds all basket parameters and ownership/domain nonce", () => {
  const keys = ml_dsa65.keygen();
  const s = {
    network: "testnet",
    account_id: "p.b.testnet",
    collection_id: "b.testnet",
    ownership_epoch: "2",
    key_version: "1",
    policy_version: "3",
    nonce: "7",
  } as any;
  const e = envelope(
    s,
    {
      BindBasket: {
        basket_id: "ai-infrastructure",
        version: "1",
        amount: "100000000",
        snapshot_day: priceDay(now).toString(),
      },
    },
    "1794000000000000000",
  );
  const a = authorize(keys, e),
    message = Uint8Array.from(Buffer.from(a.message, "base64")),
    signature = Uint8Array.from(Buffer.from(a.signature, "base64"));
  assert.ok(ml_dsa65.verify(signature, message, keys.publicKey));
  for (const changed of [
    { ...e, nonce: "8" },
    { ...e, ownership_epoch: "3" },
    { ...e, network: "mainnet" },
    {
      ...e,
      action: {
        BindBasket: {
          ...(e.action && (e.action as any).BindBasket),
          amount: "999",
        },
      },
    },
  ])
    assert.equal(
      ml_dsa65.verify(
        signature,
        new TextEncoder().encode(JSON.stringify(changed)),
        keys.publicKey,
      ),
      false,
    );
  keys.secretKey.fill(0);
});
test("thematic agent asks only blocking questions, never changes weights, and separates crypto", () => {
  const r = prepareThematic(
    "Je veux créer une position de 100 demoUSD sur le thème IA.",
    now,
  );
  assert.equal(r.proposal?.model.id, "ai-infrastructure");
  assert.equal(r.proposal?.capital, "100000000");
  assert.equal(r.proposal?.model.components[0].weight_bps, 3000);
  assert.match(prepareThematic("sur le thème énergie", now).message, /montant/);
  assert.match(prepareThematic("100 demoUSD", now).message, /thème/);
  assert.equal(
    prepareThematic("100 demoUSD IA capital garanti", now).proposal,
    undefined,
  );
  assert.equal(prepareThematic("100 demoUSD crypto", now).proposal, undefined);
  assert.match(
    prepareThematic("100 demoUSD espace", now, {}, "liquidity").message,
    /aucune hausse fictive/,
  );
});
