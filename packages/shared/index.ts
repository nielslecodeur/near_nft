import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
export { ml_dsa65 };
export const bytes = (s: string) => new TextEncoder().encode(s);
export const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export type Keys = ReturnType<typeof ml_dsa65.keygen>;
export type Policy = {
  agent: string;
  asset: string;
  strategy: string;
  max_operation: string;
  max_period: string;
  allocation_bps: number;
  expires_at: string;
  ownership_epoch: string;
  policy_version: string;
};
export type Action =
  | {
      AuthorizeSubscription: {
        agent: string;
        asset: string;
        strategy: string;
        amount: string;
        expires_at: string;
        beneficiary: string;
      };
    }
  | "CancelSubscription"
  | Redemption
  | {
      List: {
        id: string;
        price: string;
        payment_token: string;
        expires_at: string;
        valuation_hash: string;
      };
    }
  | { CancelListing: { id: string } }
  | { Withdraw: { asset: string; amount: string; beneficiary: string } }
  | { SetPolicy: { policy: Policy; horizon_years: number; target_bps: number } }
  | "Revoke"
  | { Rotate: { public_key: string } }
  | { Transfer: { owner_id: string; public_key: string } }
  | { TransferCall: { owner_id: string; public_key: string; msg: string } };
export type Snapshot = {
  funding_permit?: {
    agent: string;
    amount: string;
    expires_at: string;
    beneficiary: string;
    ownership_epoch: string;
    policy_version: string;
  } | null;
  series?: import("./series.js").SeriesRules | null;
  funded?: boolean;
  sale?: {
    id: string;
    price: string;
    expires_at: string;
    state: string;
  } | null;
  account_id: string;
  collection_id: string;
  owner_id: string;
  network: string;
  asset: string;
  strategy: string;
  ownership_epoch: string;
  key_version: string;
  policy_version: string;
  nonce: string;
  public_key: string;
  status: string;
  available: string;
  reserved: string;
  principal: string;
  deposits: string;
  withdrawals: string;
  realized_gains: string;
  policy: Policy | null;
  agent_paused: boolean;
  pending: unknown;
  sync_seq: string;
  horizon_years: number;
  target_bps: number;
  started_at: string;
};
export type Redemption = { Redeem: { asset: string; amount: string } };
export function initProof(
  keys: Keys,
  network: string,
  account: string,
  collection: string,
  owner: string,
) {
  const message = bytes(
    JSON.stringify([
      "EVERKEEP_INIT_V1",
      network,
      account,
      collection,
      owner,
      b64(keys.publicKey),
    ]),
  );
  return {
    public_key: b64(keys.publicKey),
    proof: b64(ml_dsa65.sign(message, keys.secretKey)),
  };
}
export function recipientProof(
  keys: Keys,
  s: Snapshot,
  receiver: string,
  expiresAt: string,
) {
  const message = bytes(
    JSON.stringify([
      "EVERKEEP_RECIPIENT_V1",
      s.network,
      s.account_id,
      s.collection_id,
      receiver,
      s.ownership_epoch,
      expiresAt,
      b64(keys.publicKey),
    ]),
  );
  return {
    public_key: b64(keys.publicKey),
    proof: b64(ml_dsa65.sign(message, keys.secretKey)),
    expires_at: expiresAt,
  };
}
export function envelope(
  s: Snapshot,
  action: Action,
  expiresAt = (BigInt(Date.now()) * 1_000_000n + 3_600_000_000_000n).toString(),
) {
  // Order is normative and must match the Rust Envelope and Action field declarations.
  return {
    protocol: "EVERKEEP",
    version: 1,
    network: s.network,
    verifier: s.account_id,
    collection: s.collection_id,
    token_id: s.account_id,
    ownership_epoch: s.ownership_epoch,
    key_version: s.key_version,
    policy_version: s.policy_version,
    nonce: s.nonce,
    expires_at: expiresAt,
    action,
  };
}
export function authorize(
  keys: Keys,
  e: ReturnType<typeof envelope>,
  next?: Keys,
) {
  const message = bytes(JSON.stringify(e));
  const pop = new Uint8Array([...bytes("EVERKEEP_POP_V1\0"), ...message]);
  return {
    message: b64(message),
    signature: b64(ml_dsa65.sign(message, keys.secretKey)),
    new_key_proof: next ? b64(ml_dsa65.sign(pop, next.secretKey)) : null,
  };
}
export function units(input: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(input))
    throw new Error("Montant demoUSD invalide (6 décimales maximum)");
  const [whole, frac = ""] = input.split(".");
  const n = BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, "0"));
  if (n > (1n << 128n) - 1n) throw new Error("Montant trop grand");
  return n;
}
export function verifyPair(
  expected: string,
  account: string,
  item: Snapshot,
  token: {
    token_id: string;
    owner_id: string;
    ownership_epoch: string;
    sync_seq: string;
  } | null,
  readOnly = false,
) {
  if (
    item.collection_id !== expected ||
    item.account_id !== account ||
    !account.endsWith("." + expected) ||
    account.split(".").length !== expected.split(".").length + 1 ||
    !token ||
    token.token_id !== account
  )
    throw new Error("Compte étranger à la collection configurée");
  if (
    item.owner_id !== token.owner_id ||
    item.ownership_epoch !== token.ownership_epoch ||
    item.sync_seq !== token.sync_seq ||
    (!readOnly && item.status !== "Active")
  )
    throw new Error("Synchronisation en cours : opérations refusées");
  return item;
}
