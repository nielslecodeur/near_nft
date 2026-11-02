import type { Policy, Snapshot } from "../shared/index.js";
export function interpret(text: string) {
  const normalized = text
    .toLowerCase()
    .replaceAll(",", ".")
    .replace(/\bdix\b/g, "10");
  const target = normalized.match(/(\d+(?:\.\d+)?)\s*%/);
  const horizon = normalized.match(/(\d+)\s*ans?/);
  const allocation = normalized.match(/(?:maximum|max|au plus)\s*(\d+)\s*%/);
  if (
    !target ||
    !horizon ||
    !allocation ||
    /(?:ignore|sans limite|tous les protocoles|clé privée)/i.test(text)
  )
    throw new Error(
      "Demande ambiguë ou interdite. Précisez objectif, horizon et maximum.",
    );
  const target_bps = Math.round(Number(target[1]) * 100),
    horizon_years = Number(horizon[1]),
    allocation_bps = Number(allocation[1]) * 100;
  if (
    target_bps > 10_000 ||
    horizon_years < 1 ||
    horizon_years > 100 ||
    allocation_bps > 10_000
  )
    throw new Error("Limites invalides");
  return {
    target_bps,
    horizon_years,
    allocation_bps,
    needs_confirmation: true as const,
  };
}
export function propose(s: Snapshot, p: Policy | null, now: bigint) {
  if (
    !p ||
    s.agent_paused ||
    s.status !== "Active" ||
    s.pending ||
    now >= BigInt(p.expires_at) ||
    p.ownership_epoch !== s.ownership_epoch ||
    p.policy_version !== s.policy_version ||
    p.asset !== s.asset ||
    p.strategy !== s.strategy
  )
    return {
      amount: "0",
      reason: "Mandat absent, expiré, révoqué ou compte indisponible.",
    };
  const available = BigInt(s.available),
    principal = BigInt(s.principal);
  const room =
    ((available + principal) * BigInt(p.allocation_bps)) / 10_000n - principal;
  const amount = [available, room, BigInt(p.max_operation)].reduce((a, b) =>
    a < b ? a : b,
  );
  return amount > 0n
    ? {
        amount: amount.toString(),
        reason:
          "Route et allocation admissibles ; le contrat contrôle encore le budget de période.",
      }
    : { amount: "0", reason: "Aucune allocation admissible dans le mandat." };
}
