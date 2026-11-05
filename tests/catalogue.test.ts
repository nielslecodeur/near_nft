import test from "node:test";
import assert from "node:assert/strict";
import {
  activeCatalogueListings,
  filterCatalogue,
  listingCatalogueItem,
  modelCatalogueItem,
} from "../packages/shared/catalogue.js";
import { officialModels, type Deployment } from "../packages/shared/network.js";
import type { SeriesState } from "../packages/shared/series-state.js";
import type { Snapshot } from "../packages/shared/index.js";
import type { Listing } from "../packages/shared/series.js";
const deployment = {
  series_id: "reserve",
  collection: "collection.testnet",
  asset: "asset.testnet",
  mandate_hash: "mandate",
} as Deployment;
const models = officialModels(deployment);
const terms = {
  id: "reserve",
  minimum: "10000000",
  capacity: "1000000000",
  opens_at: "1",
  closes_at: "100",
  matures_at: "200",
  allocation_bps: 2000,
};
const data = {
  series: {
    series: { terms, mandate_hash: "mandate" },
    committed: "0",
    closed: false,
  },
  positions: [],
  listings: [],
  now: "10",
} as unknown as SeriesState;
test("editorial models never invent instruments or holdings and verified terms gate the available deposit", () => {
  const future = modelCatalogueItem(models[0], data, 10n);
  assert.equal(future.composition.basis, "target");
  assert.deepEqual(future.composition.rows, []);
  assert.equal(future.actionable, false);
  assert.equal(future.money.value, "À définir");
  const current = modelCatalogueItem(models[2], data, 10n);
  assert.equal(current.money.value, "10 demoUSD");
  assert.match(current.composition.limits[0], /20 %/);
  assert.match(current.composition.limits[0], /pas une allocation cible/);
  assert.equal(current.actionable, true);
  assert.equal(
    modelCatalogueItem({ ...models[2], mandate_hash: "wrong" }, data, 10n)
      .actionable,
    false,
  );
  assert.equal(modelCatalogueItem(models[2], data, 100n).actionable, false);
});
test("real listed holdings are distinct from their sale price, target allocation and monetary valuation", () => {
  const p = {
    account_id: "position.testnet",
    owner_id: "owner.testnet",
    available: "8000000",
    principal: "2000000",
    reserved: "0",
    asset: deployment.asset,
    status: "SaleLocked",
    funded: true,
    sale: { id: "1" },
    series: { terms },
  } as unknown as Snapshot;
  const sale = {
    position: p.account_id,
    id: "1",
    seller: p.owner_id,
    price: "11000000",
    state: "Active",
    expires_at: "50",
  } as Listing;
  const item = listingCatalogueItem(sale, p, models[2], "10", deployment.asset);
  assert.equal(item.composition.basis, "actual");
  assert.equal(item.money.value, "11 demoUSD");
  assert.deepEqual(
    item.composition.rows.map((r) => r.amount),
    ["8 demoUSD", "2 demoUSD"],
  );
  assert.equal(item.composition.observedAt, "10");
  assert.equal(
    activeCatalogueListings({ ...data, positions: [p], listings: [sale] }, 10n)
      .length,
    1,
  );
  for (const bad of [
    { ...sale, state: "Cancelled" },
    { ...sale, expires_at: "10" },
    { ...sale, seller: "other.testnet" },
  ])
    assert.equal(
      activeCatalogueListings({ ...data, positions: [p], listings: [bad] }, 10n)
        .length,
      0,
    );
  assert.equal(
    activeCatalogueListings(
      { ...data, positions: [{ ...p, status: "Active" }], listings: [sale] },
      10n,
    ).length,
    0,
  );
});
test("search, category and theme intersect without changing availability or requiring hard-coded names", () => {
  const items = models.map((m) => modelCatalogueItem(m, data, 10n));
  assert.equal(
    filterCatalogue(items, "reserve DEMOusd", "liquidity", "demoUSD").length,
    1,
  );
  assert.equal(filterCatalogue(items, "reserve", "crypto", "all").length, 0);
  assert.equal(filterCatalogue(items, "", "all", "Protocoles").length, 1);
  const renamed = {
    ...items[2],
    name: "Équilibre demain",
    themes: ["Nouveau thème"],
  };
  assert.equal(
    filterCatalogue([renamed], "equilibre", "all", "Nouveau thème").length,
    1,
  );
  assert.equal(filterCatalogue([renamed], "Ethereum", "all", "all").length, 0);
});
