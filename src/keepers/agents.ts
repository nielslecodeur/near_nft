/**
 * Agent seats: reads from the agents contract and the runner, and builds the
 * wallet requests. Every number in the UI comes from these calls.
 */
import {
  EXPLORER,
  KEEPERS_V1,
  KEEPERS_V2,
  YOCTO,
  fnCall,
  sendRaw,
  returnedValue,
  viewAccessKey,
  viewOn,
} from "./chain";

export const AGENTS =
  import.meta.env.VITE_AGENTS_ID || "agents-v1.everkeep-dev-mw0weth5.testnet";
export const USDC =
  "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
export const RUNNER =
  import.meta.env.VITE_AGENTS_RUNNER || "http://127.0.0.1:8788";
/** The Buyer's market (Keepers v2, `buy(token_id, listing_id)`). */
export const MARKET = KEEPERS_V2;
export const SEAT_STORAGE = YOCTO / 10n;
/** Gas the agent key may burn over its lifetime. */
export const KEY_ALLOWANCE = YOCTO;
export const AGENT_METHODS = ["agent_pay", "agent_buy", "pause"];
export const USDC_DECIMALS = 6;

/** Collections scanned for the user's NFTs. Any NEP-171 contract also works by name. */
export const COLLECTIONS: { id: string; label: string }[] = [
  { id: KEEPERS_V2, label: "Keepers" },
  { id: KEEPERS_V1, label: "Keepers v1" },
  { id: "nft.examples.testnet", label: "NEAR NFT examples" },
  { id: "paras-token-v2.testnet", label: "Paras" },
];

export type Kind = "Buyer" | "Payer";
export type Policy = {
  per_tx_max: string;
  per_day_max: string;
  payees: string[];
  market: string | null;
};
export type Seat = {
  seat_id: string;
  nft_contract: string;
  token_id: string;
  kind: Kind;
  asset: "NEAR" | "USDC";
  owner: string;
  agent_key: string | null;
  paused: boolean;
  policy: Policy | null;
  balance: string;
  in_flight: number;
  spent_today: string;
  left_today: string;
  spent_total: string;
  done: number;
  refused: number;
  failed: number;
  created_at: string;
};
export type LogEntry = {
  seq: string;
  at: string;
  action: string;
  status: "done" | "refused" | "failed" | "info" | "pending";
  amount: string;
  counterparty: string | null;
  detail: string;
};
export type OwnedNft = {
  contract: string;
  label: string;
  token_id: string;
  title: string;
  media: string | null;
};

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const viewAgents = <T>(method: string, args: object = {}) =>
  viewOn<T>(AGENTS, method, args);

export const seatsForOwner = (account: string) =>
  viewAgents<Seat[]>("seats_for_owner", { account_id: account });
export const getSeat = (id: string) =>
  viewAgents<Seat | null>("seat", { seat_id: id });
export const seatLog = (id: string) =>
  viewAgents<LogEntry[]>("seat_log", { seat_id: id });
export const seatForNft = (contract: string, tokenId: string) =>
  viewAgents<Seat | null>("seat_for_nft", {
    nft_contract: contract,
    token_id: tokenId,
  });
export const refundOf = (account: string) =>
  viewAgents<{ near: string; usdc: string }>("refund_of", {
    account_id: account,
  });
export const usdcBalance = async (account: string) =>
  BigInt(await viewOn<string>(USDC, "ft_balance_of", { account_id: account }));

/** Who owns an NFT right now, read from its own contract. */
export async function nftOwner(contract: string, tokenId: string) {
  const t = await viewOn<{ owner_id: string } | null>(contract, "nft_token", {
    token_id: tokenId,
  });
  return t?.owner_id ?? null;
}

type RawToken = {
  token_id: string;
  metadata?: { title?: string | null; media?: string | null } | null;
};

/** The user's NFTs in one collection (first 50). Never throws: a dead contract yields []. */
export async function nftsIn(
  contract: string,
  label: string,
  account: string,
): Promise<OwnedNft[]> {
  try {
    const tokens = await viewOn<RawToken[]>(contract, "nft_tokens_for_owner", {
      account_id: account,
      from_index: "0",
      limit: 50,
    });
    return tokens.map((t) => ({
      contract,
      label,
      token_id: t.token_id,
      title: t.metadata?.title || `${label} #${t.token_id}`,
      media: t.metadata?.media ?? null,
    }));
  } catch {
    return [];
  }
}

/** Gas left on the agent key, or null when the key is gone from the account. */
export async function keyAllowance(account: string, publicKey: string) {
  const p = await viewAccessKey(account, publicKey);
  if (!p || p === "FullAccess") return null;
  return p.FunctionCall.allowance;
}

// ---------------------------------------------------------------------------
// Wallet requests
// ---------------------------------------------------------------------------

/** Creates a seat. Returns its id, or null when the contract refused (not the NFT owner). */
export async function createSeat(
  contract: string,
  tokenId: string,
  kind: Kind,
  policy: Policy,
) {
  const { outcomes } = await sendRaw([
    {
      receiverId: AGENTS,
      actions: [
        fnCall(
          "create_seat",
          { nft_contract: contract, token_id: tokenId, kind, policy },
          SEAT_STORAGE,
          120n,
        ),
      ],
    },
  ]);
  return returnedValue<string | null>(outcomes[0]);
}

/**
 * Access once: in one wallet request, funds the seat, adds the runner's public
 * key to the user's account (function-call key, agents contract only) and
 * registers it on the seat.
 */
export async function fundAndGrant(seat: Seat, amount: bigint, publicKey: string) {
  const txs = [
    {
      receiverId: "self",
      actions: [
        {
          type: "AddKey",
          params: {
            publicKey,
            accessKey: {
              permission: {
                receiverId: AGENTS,
                allowance: KEY_ALLOWANCE.toString(),
                methodNames: AGENT_METHODS,
              },
            },
          },
        },
      ],
    },
    {
      receiverId: AGENTS,
      actions: [
        ...(seat.kind === "Buyer" && amount > 0n
          ? [fnCall("fund", { seat_id: seat.seat_id }, amount, 15n)]
          : []),
        fnCall("set_agent_key", { seat_id: seat.seat_id, public_key: publicKey }, 1n, 15n),
      ],
    },
  ];
  if (seat.kind === "Payer" && amount > 0n)
    txs.push({
      receiverId: USDC,
      actions: [
        fnCall(
          "ft_transfer_call",
          {
            receiver_id: AGENTS,
            amount: amount.toString(),
            msg: JSON.stringify({ seat_id: seat.seat_id }),
          },
          1n,
          100n,
        ),
      ],
    });
  return sendRaw(txs);
}

export const fundSeat = (seat: Seat, amount: bigint) =>
  sendRaw([
    seat.kind === "Buyer"
      ? { receiverId: AGENTS, actions: [fnCall("fund", { seat_id: seat.seat_id }, amount, 15n)] }
      : {
          receiverId: USDC,
          actions: [
            fnCall(
              "ft_transfer_call",
              {
                receiver_id: AGENTS,
                amount: amount.toString(),
                msg: JSON.stringify({ seat_id: seat.seat_id }),
              },
              1n,
              100n,
            ),
          ],
        },
  ]);

const ownerCall = (method: string, args: Record<string, unknown>, gas = 30n) =>
  sendRaw([{ receiverId: AGENTS, actions: [fnCall(method, args, 1n, gas)] }]);

export const setPolicy = (seat: Seat, policy: Policy) =>
  ownerCall("set_policy", { seat_id: seat.seat_id, policy });
export const pauseSeat = (seat: Seat) =>
  sendRaw([
    { receiverId: AGENTS, actions: [fnCall("pause", { seat_id: seat.seat_id }, 0n, 15n)] },
  ]);
export const resumeSeat = (seat: Seat) =>
  ownerCall("resume", { seat_id: seat.seat_id });
export const withdrawSeat = (seat: Seat) =>
  ownerCall("withdraw", { seat_id: seat.seat_id, amount: null }, 50n);
export const withdrawRefund = () => ownerCall("withdraw_refund", {}, 80n);
export const claimSeat = (seat: Seat) =>
  ownerCall("claim_seat", { seat_id: seat.seat_id }, 80n);
export const closeSeat = (seat: Seat) =>
  ownerCall("close_seat", { seat_id: seat.seat_id });

/** Revokes access in one request: clears the key on the seat and deletes it from the account. */
export const revokeAccess = (seat: Seat) =>
  sendRaw([
    {
      receiverId: AGENTS,
      actions: [fnCall("set_agent_key", { seat_id: seat.seat_id, public_key: null }, 1n, 15n)],
    },
    ...(seat.agent_key
      ? [{ receiverId: "self", actions: [{ type: "DeleteKey", params: { publicKey: seat.agent_key } }] }]
      : []),
  ]);

/** Registers the user on USDC (needed before receiving USDC back). */
export const registerUsdc = (account: string) =>
  sendRaw([
    {
      receiverId: USDC,
      actions: [
        fnCall(
          "storage_deposit",
          { account_id: account, registration_only: true },
          125n * 10n ** 19n,
          30n,
        ),
      ],
    },
  ]);

// ---------------------------------------------------------------------------
// Runner (local service, scripts/agent-runner.ts)
// ---------------------------------------------------------------------------

export type BuyerMission = { maxPrice: string; minTier?: number };
export type Payment = { payee: string; amount: string; everySeconds: number; memo?: string };
export type Job = {
  seatId: string;
  accountId: string;
  publicKey: string;
  kind: Kind;
  buyer?: BuyerMission;
  payer?: { payments: Payment[] };
  lastRun?: number;
  lastResult?: string;
};

async function runnerFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(RUNNER + path, {
      ...init,
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error(
      "The agent runner is not reachable. Start it with: npm run agent:runner",
    );
  }
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `Runner error ${r.status}`);
  return data as T;
}

export const runnerHealth = () =>
  runnerFetch<{ agents: string; tick_seconds: number }>("/health");
export const runnerNewKey = (accountId: string) =>
  runnerFetch<{ publicKey: string }>("/keys", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  }).then((r) => r.publicKey);
export const runnerJobs = (accountId: string) =>
  runnerFetch<Job[]>(`/jobs?accountId=${encodeURIComponent(accountId)}`);
export const runnerSaveJob = (job: Job) =>
  runnerFetch<Job>(`/jobs/${job.seatId}`, {
    method: "PUT",
    body: JSON.stringify(job),
  });
export const runnerRunNow = (seatId: string) =>
  runnerFetch<{ result: string }>(`/jobs/${seatId}/run`, { method: "POST" });
export const runnerPause = (seatId: string) =>
  runnerFetch<{ tx: string }>(`/jobs/${seatId}/pause`, { method: "POST" });
export const runnerDelete = (seatId: string) =>
  runnerFetch<{ deleted: string }>(`/jobs/${seatId}`, { method: "DELETE" });

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatAsset(amount: string | bigint, asset: "NEAR" | "USDC") {
  const v = BigInt(amount);
  const decimals = asset === "NEAR" ? 24 : USDC_DECIMALS;
  const unit = 10n ** BigInt(decimals);
  const whole = v / unit;
  const frac = (v % unit).toString().padStart(decimals, "0").slice(0, asset === "NEAR" ? 3 : 2);
  const text = `${whole}${/[1-9]/.test(frac) ? "." + frac.replace(/0+$/, "") : ""}`;
  return `${text} ${asset}`;
}

/** Parses "1.5" into base units of the asset, or null. */
export function parseAsset(text: string, asset: "NEAR" | "USDC"): bigint | null {
  const decimals = asset === "NEAR" ? 24 : USDC_DECIMALS;
  const m = text.trim().match(/^(\d+)(?:[.,](\d+))?$/);
  if (!m) return null;
  const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0");
  return BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

export const txLink = (hash: string) => `${EXPLORER}/txns/${hash}`;
export const assetOf = (kind: Kind) => (kind === "Buyer" ? "NEAR" : "USDC") as "NEAR" | "USDC";
