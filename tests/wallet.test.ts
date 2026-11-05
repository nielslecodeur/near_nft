import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOwnedPlans } from "../packages/shared/wallet.js";
test("wallet discovery accepts only immediate collection children owned by the connected account", () => {
  assert.deepEqual(
    parseOwnedPlans(
      [{ token_id: "plan.everkeep.testnet", owner_id: "alice.testnet" }],
      "alice.testnet",
      "everkeep.testnet",
    ),
    ["plan.everkeep.testnet"],
  );
  for (const token of [
    { token_id: "plan.foreign.testnet", owner_id: "alice.testnet" },
    { token_id: "sub.plan.everkeep.testnet", owner_id: "alice.testnet" },
    { token_id: "plan.everkeep.testnet", owner_id: "bob.testnet" },
    { token_id: ".everkeep.testnet", owner_id: "alice.testnet" },
  ])
    assert.throws(
      () => parseOwnedPlans([token], "alice.testnet", "everkeep.testnet"),
      /étranger/,
    );
});
test("wallet discovery refuses duplicates, malformed data and unbounded pages", () => {
  const token = {
    token_id: "plan.everkeep.testnet",
    owner_id: "alice.testnet",
  };
  assert.throws(
    () => parseOwnedPlans([token, token], "alice.testnet", "everkeep.testnet"),
    /dupliquée/,
  );
  assert.throws(
    () => parseOwnedPlans({}, "alice.testnet", "everkeep.testnet"),
    /invalide/,
  );
  assert.throws(
    () =>
      parseOwnedPlans(
        Array(21).fill(token),
        "alice.testnet",
        "everkeep.testnet",
      ),
    /invalide/,
  );
  assert.deepEqual(
    parseOwnedPlans([], "alice.testnet", "everkeep.testnet"),
    [],
  );
});
