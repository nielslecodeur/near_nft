import type {
  Allocation,
  Profile,
  Proposal,
  MissionRequest,
  CatalogueEntry,
} from "../agent/missions.js";
export type MissionOperation = {
  position: string;
  allocation: Allocation;
  state:
    | "Reserved"
    | "Verifying"
    | "Rejected"
    | "Authorized"
    | "Funding"
    | "Uncertain"
    | "Confirmed";
  attempt: string;
  authorization_hash: string | null;
  authorization_expires_at?: string | null;
  policy_version: string | null;
  error: string | null;
};
export type Mission = {
  id: string;
  client: string;
  profile: Profile;
  request_hash: string;
  quote_expires_at: string;
  paid_at: string | null;
  deadline: string | null;
  state:
    | "Quote"
    | "Paid"
    | "Processing"
    | "Delivered"
    | "Failed"
    | "RefundClaimable"
    | "Refunded";
  result_hash: string | null;
  proposal_expires_at: string | null;
  outcome: "proposed" | "abstain" | null;
  allocation_hashes: string[];
  operations: (MissionOperation | null)[];
  refund: Claim | null;
  provider: Claim | null;
  failure: string | null;
};
type Claim = {
  beneficiary: string;
  amount: string;
  state: string;
  attempt: string;
};
export type MissionDocument = {
  reuse_from?: string;
  reuse_position?: string;
  request: MissionRequest;
  salt: string;
  proposal?: Proposal;
  reviewed_hash?: string;
};
export type MissionConfiguration = {
  network: string;
  operator: string;
  collections: string[];
  profiles: Profile[];
  storage_reserve: string;
  max_allocations: number;
};
export type MissionView = {
  mission: Mission;
  document: MissionDocument;
  now: string;
  subscriptions: ({
    state: string;
    refund: { state: string; amount: string } | null;
  } | null)[];
};
export type MissionCatalogue = {
  worker_ready?: boolean;
  configuration: MissionConfiguration;
  catalogue: CatalogueEntry[];
  contract: string;
  mode: "demonstration" | "server-adapter";
  now: string;
};
/** Sorted object keys only for commitments. Investment envelopes use their explicit struct order. */
export function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJSON).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + stableJSON(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
