// Explicit synthetic UI states only. Production entries never import this module.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BasketOwned } from "../../src/BasketExperience";
import {
  baskets,
  fictionalPrices,
  subscribeBasket,
  priceDay,
} from "../../packages/shared/baskets";
import type { Snapshot } from "../../packages/shared/index";
import "../../src/series.css";
import "../../src/orbite.css";
import "../../src/terminal/primitives.css";
import "../../src/terminal/pages.css";
import "../../src/testnet-ui.css";
import "../../src/terminal/workspace.css";
const entry = BigInt(Date.parse("2026-11-02T12:00:00Z")) * 1000000n,
  now = BigInt(Date.parse("2026-11-05T12:00:00Z")) * 1000000n;
const samples = baskets.map(
  (model, i) =>
    ({
      account_id: `p${i}.baskets-fixture.testnet`,
      owner_id: "viewer.testnet",
      collection_id: "baskets-fixture.testnet",
      asset: "demousd-fixture.testnet",
      network: "testnet",
      available: "100000000",
      principal: "0",
      reserved: "0",
      deposits: "100000000",
      withdrawals: "0",
      realized_gains: "0",
      ownership_epoch: i === 2 ? "1" : "0",
      status: "Active",
      pending: null,
      basket: subscribeBasket(
        model,
        "100000000",
        fictionalPrices(model, entry),
        entry,
      ),
    }) as Snapshot,
);
function Fixture() {
  const [positions, setPositions] = useState(samples);
  return (
    <main className="ek-reference-section ek-ui testnet-positions">
      <h1>États de test UI · données synthétiques</h1>
      <p>
        Cette page de vérification ne signe aucune transaction. Les preuves
        financières sont exécutées séparément dans la sandbox NEAR.
      </p>
      {positions.map((s) => (
        <BasketOwned
          key={s.account_id}
          snapshot={s}
          now={now}
          working={false}
          ask={(c) => {
            (globalThis as any).__qaBasketCommands = [
              ...((globalThis as any).__qaBasketCommands || []),
              c,
            ];
            setPositions((old) =>
              old.map((p) =>
                p.account_id !== c.position
                  ? p
                  : c.action === "close_basket"
                    ? {
                        ...p,
                        basket: {
                          ...p.basket!,
                          closed_day: priceDay(now).toString(),
                        },
                      }
                    : { ...p, available: "0", withdrawals: p.deposits },
              ),
            );
          }}
        />
      ))}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <div className="series-app marketplace-shell orbite-app ek-ui ek-app">
    <Fixture />
  </div>,
);
