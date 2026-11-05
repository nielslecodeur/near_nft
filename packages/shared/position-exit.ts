import type { Snapshot } from "./index.js";
type ExitSnapshot = Pick<
  Snapshot,
  "series" | "status" | "pending" | "principal" | "available" | "reserved"
>;
/** Presentation only. The wallet contract remains the authority for all exits. */
export function positionExit(s: ExitSnapshot, now: bigint, listed: boolean) {
  const mature = !s.series || now >= BigInt(s.series.terms.matures_at);
  const frozen = s.status !== "Active" || !!s.pending;
  const withdrawable =
    mature &&
    !frozen &&
    !listed &&
    BigInt(s.principal) === 0n &&
    BigInt(s.reserved) === 0n
      ? s.available
      : "0";
  return { mature, frozen, withdrawable };
}
