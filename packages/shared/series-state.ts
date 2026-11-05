import type { Snapshot } from "./index.js";
import type { Listing, SeriesRules } from "./series.js";
import { requireSnapshot } from "./ui.js";
export type SeriesState = {
  capabilities?: string[];
  balances?: Record<string, string>;
  subscriptions?: {
    position: string;
    subscription: { owner: string; amount: string; state: string } | null;
    refund?: { beneficiary: string; amount: string; state: string } | null;
  }[];
  mode: string;
  series: { series: SeriesRules | null; committed: string; closed: boolean };
  positions: Snapshot[];
  listings: Listing[];
  journal: {
    label: string;
    ok: boolean;
    detail: string;
    at: string;
    position?: string;
    actor?: string;
  }[];
  now: string;
  actors: Record<string, string>;
};
export function parseSeriesState(value: unknown): SeriesState {
  const fail = () => {
    throw new Error(
      "Réponse de séries incomplète ou invalide. Rechargez les données.",
    );
  };
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return fail();
    return v as Record<string, unknown>;
  };
  const text = (v: unknown, max = 254) => {
    if (typeof v !== "string" || !v.length || v.length > max) return fail();
    return v;
  };
  const uint = (v: unknown, bits = 128) => {
    if (
      typeof v !== "string" ||
      !/^\d{1,39}$/.test(v) ||
      BigInt(v) >= 1n << BigInt(bits)
    )
      return fail();
    return BigInt(v);
  };
  const rules = (v: unknown) => {
    const r = object(v),
      t = object(r.terms);
    text(r.mandate_hash, 100);
    for (const k of ["id", "name", "asset", "strategy"]) text(t[k]);
    for (const k of ["opens_at", "closes_at", "matures_at", "version"])
      uint(t[k], 64);
    for (const k of ["capacity", "minimum", "max_operation", "max_period"])
      if (uint(t[k]) === 0n) fail();
    if (
      uint(t.opens_at, 64) >= uint(t.closes_at, 64) ||
      uint(t.closes_at, 64) >= uint(t.matures_at, 64) ||
      uint(t.minimum) > uint(t.capacity)
    )
      fail();
    if (
      !Number.isInteger(t.allocation_bps) ||
      Number(t.allocation_bps) < 0 ||
      Number(t.allocation_bps) > 10000
    )
      fail();
  };
  const s = object(value),
    series = object(s.series);
  if (s.capabilities) {
    if (!Array.isArray(s.capabilities) || s.capabilities.length > 20) fail();
    for (const c of s.capabilities as unknown[]) text(c, 100);
  }
  if (s.balances)
    for (const amount of Object.values(object(s.balances))) uint(amount);
  if (s.subscriptions) {
    if (!Array.isArray(s.subscriptions) || s.subscriptions.length > 1000)
      fail();
    for (const item of s.subscriptions as unknown[]) {
      const record = object(item);
      text(record.position);
      if (record.subscription !== null) {
        const sub = object(record.subscription);
        text(sub.owner);
        uint(sub.amount);
        if (
          !["Authorized", "Funding", "Funded", "RefundClaimable"].includes(
            String(sub.state),
          )
        )
          fail();
      }
      if (record.refund) {
        const refund = object(record.refund);
        text(refund.beneficiary);
        uint(refund.amount);
        if (!["Claimable", "Paying", "Paid"].includes(String(refund.state)))
          fail();
      }
    }
  }
  if (
    !["sandbox", "testnet"].includes(String(s.mode)) ||
    typeof series.closed !== "boolean"
  )
    fail();
  uint(s.now, 64);
  uint(series.committed);
  if (series.series !== null) {
    rules(series.series);
    if (
      uint(series.committed) >
      uint(object(object(series.series).terms).capacity)
    )
      fail();
  }
  if (
    !Array.isArray(s.positions) ||
    s.positions.length > 1000 ||
    !Array.isArray(s.listings) ||
    s.listings.length > 100 ||
    !Array.isArray(s.journal) ||
    s.journal.length > 100
  )
    fail();
  for (const p of s.positions as unknown[]) {
    const position = requireSnapshot(p);
    if (position.funding_permit) {
      const permit = position.funding_permit;
      text(permit.agent);
      text(permit.beneficiary);
      uint(permit.amount);
      uint(permit.expires_at, 64);
      uint(permit.ownership_epoch, 64);
      uint(permit.policy_version, 64);
    }
    if (position.series) rules(position.series);
    if (position.funded !== undefined && typeof position.funded !== "boolean")
      fail();
    if (position.sale) {
      const sale = object(position.sale);
      uint(sale.id, 64);
      uint(sale.price);
      uint(sale.expires_at, 64);
      text(sale.state, 40);
    }
  }
  for (const v of s.listings as unknown[]) {
    const l = object(v);
    for (const k of ["position", "seller"]) text(l[k]);
    if (l.buyer !== null) text(l.buyer);
    text(l.valuation_hash, 100);
    if (
      ![
        "Active",
        "Cancelled",
        "Settling",
        "Resolving",
        "AwaitingIndex",
        "Settled",
        "RefundClaimable",
      ].includes(String(l.state))
    )
      fail();
    for (const k of ["id", "expires_at", "ownership_epoch"]) uint(l[k], 64);
    for (const k of ["price", "available", "principal"]) uint(l[k]);
    if (uint(l.price) === 0n) fail();
    if (l.valuation_at !== undefined && l.valuation_at !== null) {
      if (uint(l.valuation_at, 64) > uint(s.now, 64)) fail();
    }
    if (l.claim !== undefined && l.claim !== null) {
      const claim = object(l.claim);
      text(claim.beneficiary);
      if (uint(claim.amount) !== uint(l.price)) fail();
      uint(claim.attempt, 64);
      if (!["Claimable", "Paying", "Paid"].includes(String(claim.state)))
        fail();
    }
  }
  for (const v of s.journal as unknown[]) {
    const e = object(v);
    text(e.label, 100);
    text(e.detail, 10000);
    text(e.at, 50);
    if (e.position !== undefined) text(e.position);
    if (e.actor !== undefined) text(e.actor);
    if (typeof e.ok !== "boolean" || !Number.isFinite(Date.parse(String(e.at))))
      fail();
  }
  for (const account of Object.values(object(s.actors))) text(account);
  return s as unknown as SeriesState;
}
