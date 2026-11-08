// Browser-only fixtures. No production entry imports this module.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  PositionCard,
  ValueHistoryView,
} from "../../src/terminal/PositionCard";
import { parseCardTheme } from "../../src/terminal/card-theme";
import themes from "../../design-system/terminal/card-themes.json";
import type { PositionCardData } from "../../src/terminal/position-card-data";
import { Skeleton, Notice } from "../../src/terminal/primitives";
import "../../src/terminal/primitives.css";
import "../../src/terminal/pages.css";
const history = (value: number) => ({
  source: "demonstration" as const,
  unit: "demoUSD",
  points: [
    { at: "2026-11-01T12:00:00Z", value: 100 },
    { at: "2026-11-02T12:00:00Z", value },
  ],
});
const base: PositionCardData = {
  kind: "listing",
  category: "Liquidité",
  identifier: "position-fixture.testnet",
  moneyLabel: "Prix demandé",
  moneyValue: "1 220 demoUSD",
  status: "Démonstration UI · données fictives",
  composition: {
    basis: "actual",
    rows: [{ label: "demoUSD de test", amount: "25 demoUSD" }],
    explanation: "Données fictives de vérification, sans opération financière.",
    limits: [],
    observedAt: "1793620800000000000",
  },
  exit: "Retrait à échéance après dénouement. La revente dépend d’un acheteur.",
};
function Fixture() {
  const [opened, setOpened] = useState("");
  return (
    <main className="ek-reference-section">
      <h1>États des cartes · démonstration UI</h1>
      <p>Aucune donnée de ce banc de test n’est une performance réelle.</p>
      <div className="ek-card-grid">
        {[
          { name: "Hausse", data: { ...base, history: history(110) } },
          { name: "Baisse", data: { ...base, history: history(90) } },
          { name: "Stable", data: { ...base, history: history(100) } },
          {
            name: "Nom très long — une position de démonstration avec un montant élevé et un identifiant complet",
            data: {
              ...base,
              moneyValue:
                "340 282 366 920 938 463 463 374 607 431 768,211 demoUSD",
            },
          },
          {
            name: "Image manquante",
            data: base,
            art: "/art/catalogue/does-not-exist.svg",
          },
        ].map((f, i) => (
          <PositionCard
            key={f.name}
            name={f.name}
            data={f.data}
            art={f.art || "/art/catalogue/liquidity.svg"}
            alt="Illustration géométrique éditoriale de test"
            theme={parseCardTheme(themes.matte)}
            onOpen={() => setOpened(f.name)}
            index={i}
          />
        ))}
      </div>
      <p role="status">{opened && "Fiche ouverte : " + opened}</p>
      <section aria-label="Historiques de démonstration">
        {[history(110), history(90), history(100)].map((h, i) => (
          <ValueHistoryView key={i} history={h} />
        ))}
        <ValueHistoryView />
      </section>
      <section aria-label="Chargement">
        <Skeleton label="Chargement d’une carte" />
      </section>
      <Notice tone="error" title="Lecture réseau indisponible">
        <p>Les montants ne peuvent pas être vérifiés. Réessayez la lecture.</p>
      </Notice>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <div className="ek-ui ek-app">
    <Fixture />
  </div>,
);
