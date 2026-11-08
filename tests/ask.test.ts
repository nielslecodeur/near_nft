import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAsk } from "../src/keepers/ask";

test("buy with price and tier, English and French", () => {
  assert.deepEqual(parseAsk("buy a holo Keeper under 1 NEAR"), {
    type: "buy",
    tokenId: undefined,
    maxPrice: "1",
    tier: 2,
    agent: undefined,
  });
  const fr = parseAsk("achète-moi un keeper brossé sous 0,8 near");
  assert.equal(fr.type, "buy");
  assert.equal(fr.type === "buy" && fr.maxPrice, "0.8");
  assert.equal(fr.type === "buy" && fr.tier, 1);
});

test("buy a specific card", () => {
  const i = parseAsk("buy Keeper #3");
  assert.equal(i.type === "buy" && i.tokenId, "3");
});

test("pay with memo", () => {
  assert.deepEqual(parseAsk("Pay 2 USDC to shop.testnet for coffee"), {
    type: "pay",
    amount: "2",
    payee: "shop.testnet",
    memo: "coffee",
    agent: undefined,
  });
  const fr = parseAsk("envoie 1,5 usdc à nifelst.testnet");
  assert.equal(fr.type === "pay" && fr.amount, "1.5");
  assert.equal(fr.type === "pay" && fr.payee, "nifelst.testnet");
});

test("pay without payee or amount asks for it", () => {
  assert.equal(parseAsk("pay shop.testnet").type, "help");
  assert.equal(parseAsk("pay 3 usdc").type, "help");
});

test("kill switch and status", () => {
  assert.equal(parseAsk("pause all").type, "pause_all");
  assert.equal(parseAsk("stop everything").type, "pause_all");
  assert.equal(parseAsk("arrête tout").type, "pause_all");
  assert.equal(parseAsk("STOP").type, "pause_all");
  assert.equal(parseAsk("status").type, "status");
  assert.equal(parseAsk("hello").type, "help");
});
