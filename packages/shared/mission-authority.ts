import type { Snapshot } from "./index.js";
import type { Mission, MissionConfiguration } from "./missions.js";
/** Reusing an existing account is a new, reviewed mission, never extending an expired authorization. */
export function verifyReusablePosition(
  source: Mission,
  s: Snapshot,
  subscription: unknown,
  owner: string,
  d: {
    collection: string;
    asset: string;
    strategy: string;
    mandate_hash: string;
  },
  now: string,
) {
  const op = source.operations[0];
  if (
    source.client !== owner ||
    source.state !== "Delivered" ||
    source.operations.length !== 1 ||
    op?.state !== "Authorized" ||
    BigInt(op.authorization_expires_at || "0") > BigInt(now) ||
    op.allocation.collection !== d.collection ||
    op.allocation.mandate_hash !== d.mandate_hash ||
    !op.position.endsWith("." + d.collection) ||
    op.position.split(".").length !== d.collection.split(".").length + 1 ||
    s.account_id !== op.position ||
    s.collection_id !== d.collection
  )
    throw new Error(
      "Seul le compte non financé d’une autorisation expirée de votre mission peut être réutilisé.",
    );
  if (
    subscription ||
    s.owner_id !== owner ||
    s.funded ||
    s.pending ||
    s.deposits !== "0" ||
    s.series?.mandate_hash !== d.mandate_hash ||
    s.asset !== d.asset ||
    s.strategy !== d.strategy ||
    !["Active", "SubscriptionAuthorized"].includes(s.status)
  )
    throw new Error(
      "Compte déjà financé, occupé ou incompatible : aucun nouveau dépôt préparé.",
    );
  return op;
}
/** Field order is normative and matches the Rust InvestmentAuthorization struct. */
export function investmentEnvelope(
  configuration: MissionConfiguration,
  contract: string,
  mission: Mission,
  index: number,
  s: Snapshot,
  expires_at: string,
) {
  const a = mission.operations[index]!.allocation;
  return {
    protocol: "EVERKEEP_MISSION_INVEST_V1",
    version: 1,
    network: configuration.network,
    verifier: contract,
    mission_id: mission.id,
    proposal_hash: mission.result_hash,
    request_hash: mission.request_hash,
    owner: mission.client,
    allocation_index: String(index),
    position: s.account_id,
    allocation: {
      collection: a.collection,
      strategy_id: a.strategy_id,
      strategy_version: a.strategy_version,
      asset: a.asset,
      strategy: a.strategy,
      amount: a.amount,
      mandate_hash: a.mandate_hash,
    },
    ownership_epoch: s.ownership_epoch,
    key_version: s.key_version,
    policy_version: s.policy_version,
    nonce: s.nonce,
    expires_at,
  };
}
