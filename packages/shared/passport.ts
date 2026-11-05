import type { Snapshot } from "./index.js";
/** Exported observation of a loaded wallet, not an ownership certificate or signed proof. */
export function nftPassport(s: Snapshot, observedAt: string) {
  if (
    !s.account_id.endsWith("." + s.collection_id) ||
    s.account_id.split(".").length !== s.collection_id.split(".").length + 1
  )
    throw new Error("Le compte ne correspond pas à la collection du passeport");
  const transferable = s.status === "Active" && !s.pending;
  return {
    format: "EVERKEEP_NFT_OBSERVATION_V1",
    observed_at: observedAt,
    evidence:
      "Loaded wallet snapshot only; not a signed proof, block proof, live ownership certificate or NEP-177 metadata update.",
    network: s.network,
    nft: {
      collection_id: s.collection_id,
      token_id: s.account_id,
      owner_id: s.owner_id,
    },
    wallet: {
      account_id: s.account_id,
      status: s.status,
      asset: s.asset,
      strategy: s.strategy,
      sync_seq: s.sync_seq,
    },
    generations: {
      ownership_epoch: s.ownership_epoch,
      key_version: s.key_version,
      policy_version: s.policy_version,
      nonce: s.nonce,
    },
    balances: {
      available: s.available,
      reserved: s.reserved,
      principal: s.principal,
      deposits: s.deposits,
      withdrawals: s.withdrawals,
      realized_gains: s.realized_gains,
    },
    controls: {
      transferable,
      agent_paused: s.agent_paused,
      agent: s.policy?.agent ?? null,
      max_operation: s.policy?.max_operation ?? null,
      max_period: s.policy?.max_period ?? null,
      allocation_bps: s.policy?.allocation_bps ?? null,
      mandate_expires_at: s.policy?.expires_at ?? null,
    },
  };
}
