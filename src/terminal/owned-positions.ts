import type { Snapshot } from "../../packages/shared/index";
import type { SeriesState } from "../../packages/shared/series-state";
import { positionExit } from "../../packages/shared/position-exit";

export function ownedPositions(data: SeriesState, owner: string) {
  return owner
    ? data.positions.filter((p) => p.owner_id === owner && p.funded)
    : [];
}
export function positionPresentation(position: Snapshot, data: SeriesState) {
  const sale = data.listings.find(
    (l) => l.position === position.account_id && l.id === position.sale?.id,
  );
  const listed =
    !!sale &&
    ["Active", "Settling", "Resolving", "AwaitingIndex"].includes(sale.state);
  const mature =
    !position.series ||
    BigInt(data.now) >= BigInt(position.series.terms.matures_at);
  const { withdrawable } = positionExit(position, BigInt(data.now), listed);
  return {
    listed,
    mature,
    withdrawable,
    total: (
      BigInt(position.available) +
      BigInt(position.principal) +
      BigInt(position.reserved)
    ).toString(),
    status: listed
      ? "En vente"
      : position.pending
        ? "Opération en attente"
        : position.status !== "Active"
          ? "Compte gelé"
          : position.basket
            ? position.basket.closed_day === null
              ? "Simulation ouverte"
              : "Exposition clôturée"
            : mature
              ? "Échéance atteinte"
              : "À échéance",
  };
}
// Group by token contract. Unknown assets never acquire demoUSD decimals or pricing.
export function ownedAssetTotals(data: SeriesState, owner: string) {
  const totals = new Map<
    string,
    { asset: string; total: bigint; withdrawable: bigint; count: number }
  >();
  for (const position of ownedPositions(data, owner)) {
    const state = positionPresentation(position, data);
    const row = totals.get(position.asset) || {
      asset: position.asset,
      total: 0n,
      withdrawable: 0n,
      count: 0,
    };
    row.total += BigInt(state.total);
    row.withdrawable += BigInt(state.withdrawable);
    row.count++;
    totals.set(position.asset, row);
  }
  return [...totals.values()];
}
