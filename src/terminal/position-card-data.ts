import type { CatalogueItem } from "../../packages/shared/catalogue";
import {
  categoryLabels,
  catalogueEditorial,
} from "../../packages/shared/catalogue";
import type { Snapshot } from "../../packages/shared/index";
import type { SeriesState } from "../../packages/shared/series-state";
import { displayAmount } from "../../packages/shared/ui";
import { positionPresentation } from "./owned-positions";
import {
  quantityLabel,
  dayLabel,
  PRICE_MODE,
} from "../../packages/shared/baskets";

export type ValueHistory = {
  source: "verified" | "demonstration";
  unit: string;
  points: { at: string; value: number }[];
};
export function valueMovement(history?: ValueHistory) {
  if (!history || history.points.length < 2 || !history.unit.trim())
    return null;
  const times = history.points.map((p) => Date.parse(p.at));
  if (
    history.points.some(
      (p, i) =>
        !Number.isFinite(p.value) ||
        p.value < 0 ||
        !Number.isFinite(times[i]) ||
        (i > 0 && times[i] <= times[i - 1]),
    )
  )
    return null;
  const first = history.points[0],
    last = history.points.at(-1)!;
  if (first.value === 0) return null;
  const percent = ((last.value - first.value) / first.value) * 100;
  return Number.isFinite(percent)
    ? {
        percent,
        from: first.at,
        to: last.at,
        points: history.points.map((p) => p.value),
        source: history.source,
        unit: history.unit,
      }
    : null;
}
export function observationDate(ns?: string) {
  if (!ns || !/^\d+$/.test(ns)) return null;
  const date = new Date(Number(BigInt(ns) / 1_000_000n));
  return Number.isFinite(date.getTime()) ? date.toLocaleString("fr-FR") : null;
}
export type PositionCardData = {
  kind: "model" | "listing" | "owned";
  category: string;
  identifier: string;
  moneyLabel: string;
  moneyValue: string;
  composition: CatalogueItem["composition"];
  exit: string;
  status: string;
  description?: string;
  history?: ValueHistory;
};
export function catalogueCardData(item: CatalogueItem): PositionCardData {
  return {
    kind: item.kind,
    category: categoryLabels[item.category],
    identifier: item.positionId || item.strategyId || item.key,
    moneyLabel: item.money.label,
    moneyValue: item.money.value,
    composition: item.composition,
    exit: item.exit,
    status: item.availability,
    description: item.description,
  };
}
export function positionCardFacts(
  position: Snapshot,
  data: SeriesState,
  assetId?: string,
) {
  const state = positionPresentation(position, data);
  const format = (raw: string) =>
    position.asset === assetId
      ? displayAmount(raw) + " demoUSD"
      : raw + " unités brutes · " + position.asset;
  return {
    observedAt: data.now,
    rows: [
      { label: "Actifs comptabilisés", value: format(state.total) },
      { label: "Disponibles au retrait", value: format(state.withdrawable) },
      { label: "Liquidités dans le compte", value: format(position.available) },
      { label: "Actifs engagés", value: format(position.principal) },
      {
        label: "Réservés pour une opération",
        value: format(position.reserved),
      },
    ],
    composition: {
      basis: "actual" as const,
      rows: [
        { label: "Dans le compte", amount: format(position.available) },
        { label: "Dans la stratégie", amount: format(position.principal) },
        { label: "Réservés", amount: format(position.reserved) },
      ],
      explanation:
        "Quantités comptabilisées sur chaîne, sans estimation de prix ni conversion entre actifs.",
      limits: [],
      observedAt: data.now,
    },
    status: state.status,
    exit: position.series
      ? "Retrait après le " +
        observationDate(position.series.terms.matures_at) +
        ", après dénouement et confirmation des opérations. La revente dépend d’un acheteur."
      : "Les contraintes et permissions du compte restent applicables. Consultez les règles avant tout retrait.",
  };
}
export function ownedCardData(
  position: Snapshot,
  data: SeriesState,
  assetId?: string,
): PositionCardData {
  const facts = positionCardFacts(position, data, assetId);
  if (position.basket) {
    const p = position.basket;
    return {
      kind: "owned",
      category: "Actions thématiques · simulation",
      identifier: position.account_id,
      moneyLabel: "Capital initial versé",
      moneyValue: displayAmount(p.capital) + " demoUSD",
      status:
        p.closed_day === null
          ? "Exposition simulée ouverte"
          : "Exposition clôturée",
      exit: "Clôture puis retrait du solde demoUSD. Aucun gain fictif payable.",
      composition: {
        basis: "actual",
        rows: p.lots.map((l) => ({
          label: l.name + " · " + l.symbol,
          amount: quantityLabel(l.quantity) + " simulées",
        })),
        explanation:
          "Quantités fixes de simulation, aucune action réelle détenue.",
        limits: [
          PRICE_MODE + " · entrée le " + dayLabel(p.entry_day) + " UTC.",
          p.model.limits,
        ],
      },
    };
  }
  return {
    kind: "owned",
    category: "Position NFT",
    identifier: position.account_id,
    moneyLabel: facts.rows[0].label,
    moneyValue: facts.rows[0].value,
    composition: facts.composition,
    status: facts.status,
    exit: facts.exit,
  };
}
export const defaultPositionArt = catalogueEditorial.liquidity.visual;
