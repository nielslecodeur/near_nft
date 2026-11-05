import test from "node:test";
import assert from "node:assert/strict";
import type { Snapshot } from "../packages/shared/index";
import type { SeriesState } from "../packages/shared/series-state";
import {
  ownedPositions,
  ownedAssetTotals,
  positionPresentation,
} from "../src/terminal/owned-positions";
const position = (id: string, extra: Partial<Snapshot> = {}) =>
  ({
    account_id: id,
    owner_id: "alice.testnet",
    asset: "demo.testnet",
    funded: true,
    status: "Active",
    pending: null,
    available: "25000000",
    principal: "0",
    reserved: "0",
    series: { terms: { matures_at: "100" } },
    ...extra,
  }) as Snapshot;
const state = (positions: Snapshot[], now = "100") =>
  ({ positions, listings: [], now }) as unknown as SeriesState;
test("owned inventory excludes other owners and unfinished accounts without collapsing distinct NFTs", () => {
  const data = state([
    position("a"),
    position("b"),
    position("c", { owner_id: "bob.testnet" }),
    position("d", { funded: false }),
  ]);
  assert.deepEqual(
    ownedPositions(data, "alice.testnet").map((p) => p.account_id),
    ["a", "b"],
  );
  assert.deepEqual(ownedPositions(data, ""), []);
});
test("wallet position totals preserve exact units and keep distinct asset contracts separate", () => {
  const huge = "340282366920938463463374607431768211455";
  const totals = ownedAssetTotals(
    state([
      position("a", { available: huge }),
      position("b", { available: "1" }),
      position("c", { asset: "other.testnet", available: "90" }),
    ]),
    "alice.testnet",
  );
  assert.equal(totals.length, 2);
  assert.equal(totals[0].total, BigInt(huge) + 1n);
  assert.equal(totals[0].count, 2);
  assert.equal(totals[1].total, 90n);
});
test("owned collection never equates held assets to immediately withdrawable capital", () => {
  const p = position("a");
  assert.equal(positionPresentation(p, state([p], "99")).withdrawable, "0");
  assert.equal(positionPresentation(p, state([p])).withdrawable, "25000000");
  assert.equal(
    positionPresentation({ ...p, pending: {} } as Snapshot, state([p]))
      .withdrawable,
    "0",
  );
  const sale = { position: "a", id: "s", state: "Active" };
  const listed = { ...p, sale: { id: "s" } } as Snapshot;
  const data = { ...state([listed]), listings: [sale] } as SeriesState;
  assert.equal(positionPresentation(listed, data).listed, true);
  assert.equal(positionPresentation(listed, data).withdrawable, "0");
});
