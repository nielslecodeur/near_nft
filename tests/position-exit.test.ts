import test from "node:test";
import assert from "node:assert/strict";
import { positionExit } from "../packages/shared/position-exit.js";
import type { Snapshot } from "../packages/shared/index.js";
const base = {
  series: { terms: { matures_at: "100" } },
  status: "Active",
  pending: null,
  principal: "0",
  reserved: "0",
  available: "25000000",
} as Snapshot;
test("position liquidities remain unavailable before the exact contractual maturity", () => {
  assert.equal(positionExit(base, 99n, false).withdrawable, "0");
  assert.equal(positionExit(base, 100n, false).withdrawable, "25000000");
});
test("pending, sale, reserved funds and investments cannot be displayed as withdrawable", () => {
  for (const state of [
    { ...base, status: "SaleLocked" },
    { ...base, reserved: "1" },
    { ...base, principal: "1" },
    { ...base, pending: {} },
  ])
    assert.equal(
      positionExit(state as Snapshot, 101n, false).withdrawable,
      "0",
    );
  assert.equal(positionExit(base, 101n, true).withdrawable, "0");
});
