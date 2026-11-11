/**
 * Agent seats: reads from the agents contract and the runner, and builds the
 * wallet requests. Every number in the UI comes from these calls.
 */
import { CHARACTERS, characterBySlug, characterFromMedia, characterMedia } from "./nft-art";
import {
  EXPLORER,
  KEEPERS_V1,
  KEEPERS_V2,
  YOCTO,
  fnCall,
  readyWallet,
  sendRaw,
  signNep413,
  returnedValue,
  viewAccessKey,
  viewOn,
  type RawTx,
} from "./chain";
import { rpc } from "../client";
export { friendlyError } from "./errors";
export { parseGitHub, pinnedLink, skillInstall } from "./skills";
import { parseGitHub as parseGitHubLink } from "./skills";

/** The latest commit of a GitHub link's repo (its branch if it names one), from GitHub's public API. */
export async function latestCommit(url: string): Promise<string | null> {
  const g = parseGitHubLink(url);
  if (!g) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${g.owner}/${g.repo}/commits/${g.branch ?? "HEAD"}`, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { sha?: string };
    return d.sha && /^[0-9a-f]{40}$/.test(d.sha) ? d.sha : null;
  } catch {
    return null;
  }
}
import { parseSeatKey, seatKey, seatLabel, type AgentsVersion } from "./seat-key";
export { parseSeatKey, seatKey, seatLabel, type AgentsVersion };

/** v1: the first agents contract (keyless, still running). */
export const AGENTS =
  import.meta.env.VITE_AGENTS_ID || "agents-v1.everkeep-dev-mw0weth5.testnet";
/** v2: profile and track record follow the NFT, flood-proof log, optional budget for the next owner. */
export const AGENTS_V2 =
  import.meta.env.VITE_AGENTS_V2_ID || "agents-v2.everkeep-dev-mw0weth5.testnet";
/** Where new agents are hired. */
export const NEW_AGENTS = AGENTS_V2;
export const contractOf = (v: AgentsVersion) => (v === "v2" ? AGENTS_V2 : AGENTS);
export const USDC =
  "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
/**
 * Which runner acts for the built-in roles. The hosted one (Cloudflare Worker,
 * workers/runner) on the hosted site; the one on this computer for local pages,
 * or when the user says they run one ("Use the runner on this computer"), which
 * is where agents hired before the hosted runner keep their keys.
 */
export const LOCAL_RUNNER = "http://127.0.0.1:8788";
export const HOSTED_RUNNER =
  (import.meta.env.VITE_HOSTED_RUNNER as string | undefined) || "https://agent-wallet-runner.nielshallgren.workers.dev";
const RUNNER_OPT_IN = "agentwallet.runner.local";
const pageIsLocal = /\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(location.origin);
function prefersLocalRunner() {
  try {
    return localStorage.getItem(RUNNER_OPT_IN) === "1";
  } catch {
    return false;
  }
}
export const RUNNER: string =
  (import.meta.env.VITE_AGENTS_RUNNER as string | undefined) || (pageIsLocal || prefersLocalRunner() ? LOCAL_RUNNER : HOSTED_RUNNER);
export const runnerIsHosted = RUNNER === HOSTED_RUNNER;
/** On the hosted site the user can pick either runner; local pages always use the local one. */
export const canSwitchRunner = !pageIsLocal && !import.meta.env.VITE_AGENTS_RUNNER;
/** The Buyer's market (Keepers v2, `buy(token_id, listing_id)`). */
export const MARKET = KEEPERS_V2;
export const SEAT_STORAGE = YOCTO / 10n;
/** Gas the agent key may burn over its lifetime. */
export const KEY_ALLOWANCE = YOCTO;
export const AGENT_METHODS = ["agent_pay", "agent_buy", "pause"];
export const USDC_DECIMALS = 6;
/** Account shown read-only at /agents?as=… for visitors without a wallet. */
export const DEMO_ACCOUNT = import.meta.env.VITE_AGENTS_DEMO || "nifelst.testnet";

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
/** Who the agent is (v2, on chain; it follows the NFT). */
export type Profile = {
  name: string;
  role: string;
  tool: string | null;
  avatar: string | null;
  manifest: string | null;
};
/**
 * A seat as the app sees it. `seat_id` is the seat KEY ("9" on v1, "v2-3" on
 * v2): routes, runner jobs and saved records use it. `num` is the id inside
 * its contract, for contract calls only.
 */
export type Seat = {
  seat_id: string;
  num: string;
  version: AgentsVersion;
  contract: string;
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
  /** v2 only. */
  profile?: Profile | null;
  owners?: number;
  budget_follows?: boolean;
  held_for_next_owner?: boolean;
};
export type LogEntry = {
  seq: string;
  at: string;
  action: string;
  status: "done" | "refused" | "failed" | "info" | "pending";
  amount: string;
  counterparty: string | null;
  detail: string;
  /** v2: identical refusals in a row, merged. */
  times?: number;
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

type RawSeat = Omit<Seat, "num" | "version" | "contract">;
/** Tags a contract's seat with its version and key. */
const tag = (v: AgentsVersion, s: RawSeat): Seat => ({ ...s, num: s.seat_id, version: v, contract: contractOf(v), seat_id: seatKey(v, s.seat_id) });
const VERSIONS: AgentsVersion[] = ["v1", "v2"];

/** The account's agents on both contracts (v1 first). A contract that cannot be read yields none. */
export async function seatsForOwner(account: string): Promise<Seat[]> {
  const lists = await Promise.all(
    VERSIONS.map((v) =>
      viewOn<RawSeat[]>(contractOf(v), "seats_for_owner", { account_id: account }).then(
        (l) => l.map((s) => tag(v, s)),
        (e) => (v === "v1" ? Promise.reject(e) : []),
      ),
    ),
  );
  return lists.flat();
}
/** One seat by key ("9", "v2-3"). */
export async function getSeat(key: string): Promise<Seat | null> {
  const k = parseSeatKey(key);
  if (!k) return null;
  const s = await viewOn<RawSeat | null>(contractOf(k.version), "seat", { seat_id: k.num });
  return s ? tag(k.version, s) : null;
}
export function seatLog(key: string) {
  const k = parseSeatKey(key);
  return k ? viewOn<LogEntry[]>(contractOf(k.version), "seat_log", { seat_id: k.num }) : Promise.resolve([] as LogEntry[]);
}
/** The seat on an NFT, on either contract. */
export async function seatForNft(contract: string, tokenId: string): Promise<Seat | null> {
  for (const v of ["v2", "v1"] as AgentsVersion[]) {
    const s = await viewOn<RawSeat | null>(contractOf(v), "seat_for_nft", { nft_contract: contract, token_id: tokenId }).catch(() => null);
    if (s) return tag(v, s);
  }
  return null;
}
type Refund = { near: string; usdc: string };
/** Money set aside for the account on each contract (from agents on NFTs it sold). */
export async function refundsOf(account: string) {
  const out: { contract: string; near: string; usdc: string }[] = [];
  for (const v of VERSIONS) {
    const r = await viewOn<Refund>(contractOf(v), "refund_of", { account_id: account }).catch(() => ({ near: "0", usdc: "0" }));
    out.push({ contract: contractOf(v), ...r });
  }
  return out;
}
/** Both contracts' refunds added up. */
export async function refundOf(account: string): Promise<Refund> {
  const all = await refundsOf(account);
  return {
    near: all.reduce((a, r) => a + BigInt(r.near), 0n).toString(),
    usdc: all.reduce((a, r) => a + BigInt(r.usdc), 0n).toString(),
  };
}
export const usdcBalance = async (account: string) =>
  BigInt(await viewOn<string>(USDC, "ft_balance_of", { account_id: account }));

/** Liquid NEAR on an account (yocto), 0 when it does not exist. */
export async function nearBalance(account: string): Promise<bigint> {
  try {
    const r = await rpc("query", { request_type: "view_account", account_id: account, finality: "final" });
    return BigInt((r as { amount: string }).amount);
  } catch {
    return 0n;
  }
}

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

export type Listing = {
  token_id: string;
  owner_id: string;
  tier: number;
  tier_name: string;
  list_price: string;
  listing_id: string;
};
/** Every Keeper listed on the Buyer's market. */
export async function marketListings(): Promise<Listing[]> {
  const supply = Number(await viewOn<string>(MARKET, "nft_total_supply"));
  const out: Listing[] = [];
  for (let from = 0; from < supply; from += 50)
    out.push(
      ...(await viewOn<Listing[]>(MARKET, "listings", { from_index: String(from), limit: 50 })),
    );
  return out.filter((l) => l.list_price && l.listing_id);
}

/** Image of an NFT when its metadata gives a usable URL (data:, https:, ipfs). */
export async function nftImage(contract: string, tokenId: string) {
  try {
    const t = await viewOn<{ metadata?: { media?: string | null } } | null>(contract, "nft_token", { token_id: tokenId });
    const m = t?.metadata?.media;
    if (!m) return null;
    // Our character art: serve the same file from this app (instant, same bytes).
    const character = characterFromMedia(m);
    if (character) return character.image;
    if (/^(data:|https:)/.test(m)) return m;
    if (/^(Qm|bafy)/.test(m)) return `https://ipfs.io/ipfs/${m}`;
    return null;
  } catch {
    return null;
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

/**
 * Creates a seat on the current contract (v2), with its profile on chain.
 * Returns its KEY, or null when the contract refused (not the NFT owner).
 */
export async function createSeat(
  nftContract: string,
  tokenId: string,
  kind: Kind,
  policy: Policy | null,
  profile?: Profile | null,
) {
  const { outcomes } = await sendRaw([
    {
      receiverId: NEW_AGENTS,
      actions: [
        fnCall(
          "create_seat",
          { nft_contract: nftContract, token_id: tokenId, kind, policy, profile: profile ?? null },
          SEAT_STORAGE,
          150n,
        ),
      ],
    },
  ]);
  const id = returnedValue<string | null>(outcomes[0]);
  return id ? seatKey("v2", id) : null;
}

/** The profile role of an agent that only carries an identity and a skill (no policy, no budget). */
export const SKILL_ROLE = "skill";
export const isSkillSeat = (s: Seat) => s.version === "v2" && !s.policy && s.profile?.role === SKILL_ROLE;

/** Where a shared agent link points: the hosted app when configured, else this page's origin. */
export const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined) || location.origin;
/** The public app, named on NFTs and transfers made from a local copy. */
export const HOSTED_APP = "https://near-nft-wheat.vercel.app";
export const isLocalUrl = (u: string) => /\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(u);
export const shareLink = (seat: Seat) => `${PUBLIC_URL}/agents/${seat.seat_id}`;
export function shareMessage(seat: Seat, name: string) {
  return `I sent you an AI agent on an NFT: "${name}". Open ${shareLink(seat)}, connect your NEAR testnet wallet and claim it: it becomes yours, with its profile and history${
    seat.balance !== "0" && seat.budget_follows ? " and its budget" : ""
  }.${parseGatedUrl(seat.profile?.manifest) ? " Its skill is private: the NFT is the key, so only you can open it now." : ""} Its record: ${agentRecord(seat)}.`;
}

/** Days since the agent was hired (block time in ns). */
export const ageDays = (seat: Seat) => Math.max(0, Math.floor((Date.now() - Number(BigInt(seat.created_at) / 1_000_000n)) / 86_400_000));

/** What the agent has to show, in one line: what it did, what the contract blocked, how long, how many hands. */
export function agentRecord(seat: Seat) {
  const days = ageDays(seat);
  const owners = seat.owners ?? 1;
  return [
    `${seat.done} done`,
    `${seat.refused} blocked`,
    `${formatAsset(seat.spent_total, seat.asset)} spent`,
    days < 1 ? "hired today" : `${days} day${days > 1 ? "s" : ""} on duty`,
    `${owners} owner${owners > 1 ? "s" : ""}`,
  ].join(", ");
}

/** Who gets the budget if the NFT changes hands. */
export const budgetGoesWithNft = (seat: Seat) => seat.balance !== "0" && !!(seat.budget_follows || seat.held_for_next_owner);

/** Profile fields the contract accepts: https links only, bounded lengths. Returns null without a name. */
export function profileFor(p: { name?: string; role: string; tool?: string | null; avatar?: string | null; manifest?: string | null }): Profile | null {
  const name = (p.name ?? "").trim().slice(0, 32);
  if (!name) return null;
  const link = (u?: string | null) => (u && /^https:\/\//.test(u) && u.length <= 160 ? u : null);
  return {
    name,
    role: p.role.slice(0, 24),
    tool: p.tool ? p.tool.slice(0, 24) : null,
    avatar: link(p.avatar),
    manifest: link(p.manifest),
  };
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
                receiverId: seat.contract,
                allowance: KEY_ALLOWANCE.toString(),
                methodNames: AGENT_METHODS,
              },
            },
          },
        },
      ],
    },
    {
      receiverId: seat.contract,
      actions: [
        ...(seat.kind === "Buyer" && amount > 0n
          ? [fnCall("fund", { seat_id: seat.num }, amount, 15n)]
          : []),
        fnCall("set_agent_key", { seat_id: seat.num, public_key: publicKey }, 1n, 15n),
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
            receiver_id: seat.contract,
            amount: amount.toString(),
            msg: JSON.stringify({ seat_id: seat.num }),
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
      ? { receiverId: seat.contract, actions: [fnCall("fund", { seat_id: seat.num }, amount, 15n)] }
      : {
          receiverId: USDC,
          actions: [
            fnCall(
              "ft_transfer_call",
              {
                receiver_id: seat.contract,
                amount: amount.toString(),
                msg: JSON.stringify({ seat_id: seat.num }),
              },
              1n,
              100n,
            ),
          ],
        },
  ]);

const ownerCall = (seat: Seat, method: string, args: Record<string, unknown>, gas = 30n) =>
  sendRaw([{ receiverId: seat.contract, actions: [fnCall(method, args, 1n, gas)] }]);

export const setPolicy = (seat: Seat, policy: Policy) =>
  ownerCall(seat, "set_policy", { seat_id: seat.num, policy });
export const pauseSeat = (seat: Seat) =>
  sendRaw([
    { receiverId: seat.contract, actions: [fnCall("pause", { seat_id: seat.num }, 0n, 15n)] },
  ]);
export const resumeSeat = (seat: Seat) =>
  ownerCall(seat, "resume", { seat_id: seat.num });
/** v2 with the budget promised to the next owner: the contract first proves NFT ownership (more gas). */
export const withdrawSeat = (seat: Seat) =>
  ownerCall(seat, "withdraw", { seat_id: seat.num, amount: null }, seat.budget_follows ? 150n : 50n);
/** Withdraws the set-aside money on every contract that holds some, in one wallet request. */
export async function withdrawRefund(account: string) {
  const owed = (await refundsOf(account)).filter((r) => r.near !== "0" || r.usdc !== "0");
  if (!owed.length) throw new Error("Nothing set aside for you.");
  return sendRaw(owed.map((r) => ({ receiverId: r.contract, actions: [fnCall("withdraw_refund", {}, 1n, 80n)] })));
}
export const claimSeat = (seat: Seat) =>
  ownerCall(seat, "claim_seat", { seat_id: seat.num }, 80n);
export const closeSeat = (seat: Seat) =>
  ownerCall(seat, "close_seat", { seat_id: seat.num });
/** v2: who the agent is; it stays with the NFT. */
export const setProfile = (seat: Seat, profile: Profile | null) =>
  ownerCall(seat, "set_profile", { seat_id: seat.num, profile }, 30n);
/** v2: leave the budget to the NFT's next owner (turning it off proves NFT ownership first). */
export const setBudgetFollows = (seat: Seat, follows: boolean) =>
  ownerCall(seat, "set_budget_follows", { seat_id: seat.num, follows }, follows ? 30n : 80n);

/** Revokes access in one request: clears the key on the seat and deletes it from the account. */
export const revokeAccess = (seat: Seat) =>
  sendRaw([
    {
      receiverId: seat.contract,
      actions: [fnCall("set_agent_key", { seat_id: seat.num, public_key: null }, 1n, 15n)],
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
  role?: string;
  name?: string;
  buyer?: BuyerMission;
  payer?: { payments: Payment[] };
  /** Payer: last payment time per "payee:amount" (ms), kept by the runner. */
  lastPaid?: Record<string, number>;
  lastRun?: number;
  lastResult?: string;
};

/**
 * Runner sign-in: the runner only obeys a session token it gave out against a
 * wallet-signed NEP-413 challenge (one signature, no transaction, 12 h), and
 * only for that account's agents. Tokens stay in this browser's localStorage.
 */
type RunnerSession = { accountId: string; token: string; expiresAt: number };
/** Per runner: a session from the hosted runner is no use on the local one, and the other way round. */
const sessionsKey = (base: string) => `agentwallet.runner.sessions:${base}`;
let currentAccount = "";

function sessions(base = RUNNER): Record<string, RunnerSession> {
  try {
    return JSON.parse(localStorage.getItem(sessionsKey(base)) || "{}");
  } catch {
    return {};
  }
}
function saveSessions(all: Record<string, RunnerSession>, base = RUNNER) {
  try {
    localStorage.setItem(sessionsKey(base), JSON.stringify(all));
  } catch {
    /* private mode: the session lasts for this page only */
  }
}
const memorySessions: Record<string, RunnerSession> = {};
function sessionOf(accountId: string, base = RUNNER): RunnerSession | null {
  const s = memorySessions[`${base}|${accountId}`] ?? sessions(base)[accountId];
  return s && s.expiresAt > Date.now() + 60_000 ? s : null;
}
function forgetSession(accountId: string, base = RUNNER) {
  delete memorySessions[`${base}|${accountId}`];
  const all = sessions(base);
  delete all[accountId];
  saveSessions(all, base);
}

/** The runner answered "sign in first": the page shows an Unlock button. */
export class RunnerLockedError extends Error {
  constructor() {
    super("The runner needs you to sign in (one wallet signature, no transaction).");
  }
}

export const runnerSignedIn = (accountId: string, base = RUNNER) => !!sessionOf(accountId, base);

/** One NEP-413 signature in the wallet; returns the account it signed for. */
export async function runnerSignIn(accountId?: string, base = RUNNER): Promise<string> {
  const who = accountId || currentAccount || (await readyWallet()).signer;
  const c = await runnerRequest<{ nonce: string; message: string; recipient: string }>(
    "/auth/challenge",
    { method: "POST", body: JSON.stringify({ accountId: who }) },
    undefined,
    base,
  );
  const signed = await signNep413({
    message: c.message,
    recipient: c.recipient,
    nonce: Uint8Array.from(atob(c.nonce), (ch) => ch.charCodeAt(0)),
  });
  if (signed.accountId !== who) throw new Error(`The wallet is connected as ${signed.accountId}, not ${who}.`);
  const session = await runnerRequest<RunnerSession>(
    "/auth/session",
    { method: "POST", body: JSON.stringify({ nonce: c.nonce, ...signed }) },
    undefined,
    base,
  );
  memorySessions[`${base}|${who}`] = session;
  saveSessions({ ...sessions(base), [who]: session }, base);
  if (base === RUNNER) currentAccount = who;
  return who;
}

export async function runnerSignOut(accountId: string) {
  const s = sessionOf(accountId);
  forgetSession(accountId);
  if (s) await runnerRequest("/auth/logout", { method: "POST" }, s.token).catch(() => {});
}

async function runnerRequest<T>(path: string, init?: RequestInit, token?: string, base = RUNNER): Promise<T> {
  let r: Response;
  try {
    r = await fetch(base + path, {
      ...init,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error(
      "The agent runner is not reachable. Start it with: npm run agent:runner",
    );
  }
  const data = await r.json();
  if (r.status === 401) throw new RunnerLockedError();
  if (!r.ok) throw new RunnerHttpError(r.status, data.error || `Runner error ${r.status}`);
  return data as T;
}

export class RunnerHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * A runner call with this account's session. `interactive`: when the session is
 * missing or expired, ask for the signature right away and retry once (the
 * user is acting); otherwise throw RunnerLockedError (background reads).
 */
async function runnerFetch<T>(path: string, init?: RequestInit, interactive = true, accountId = currentAccount, base = RUNNER): Promise<T> {
  const s = accountId ? sessionOf(accountId, base) : null;
  try {
    if (!s) throw new RunnerLockedError();
    return await runnerRequest<T>(path, init, s.token, base);
  } catch (e) {
    if (!(e instanceof RunnerLockedError)) throw e;
    if (accountId) forgetSession(accountId, base);
    if (!interactive) throw e;
    const who = await runnerSignIn(accountId || undefined, base);
    return runnerRequest<T>(path, init, sessionOf(who, base)!.token, base);
  }
}

// ---------------------------------------------------------------------------
// Private skills: the NFT is the key. Stored (encrypted) by the hosted runner;
// only the NFT's current holder, signed in with NEP-413, can read or replace one.
// ---------------------------------------------------------------------------

/** The on-chain profile's link to a private skill held for this NFT. */
export const gatedUrl = (nftContract: string, tokenId: string) =>
  `${HOSTED_RUNNER}/gated/${encodeURIComponent(nftContract)}/${encodeURIComponent(tokenId)}`;
export function parseGatedUrl(url: string | null | undefined) {
  const m = new RegExp(`^${HOSTED_RUNNER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/gated/([^/]+)/([^/]+)$`).exec(url ?? "");
  return m ? { nftContract: decodeURIComponent(m[1]), tokenId: decodeURIComponent(m[2]) } : null;
}
export type GatedMeta = { exists: false } | { exists: true; name: string; size: number; sha256: string; updatedAt: number };
export async function gatedMeta(nftContract: string, tokenId: string): Promise<GatedMeta> {
  const r = await fetch(`${gatedUrl(nftContract, tokenId)}/meta`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Skill service ${r.status}`);
  return r.json();
}
/** Opens the skill (one wallet signature the first time). Throws RunnerHttpError 403 when the account does not hold the NFT. */
export const gatedRead = (account: string, nftContract: string, tokenId: string) =>
  runnerFetch<{ name: string; content: string; sha256: string; updatedAt: number }>(
    `/gated/${encodeURIComponent(nftContract)}/${encodeURIComponent(tokenId)}`,
    undefined,
    true,
    account,
    HOSTED_RUNNER,
  );
export const gatedWrite = (account: string, nftContract: string, tokenId: string, name: string, content: string) =>
  runnerFetch<{ name: string; sha256: string; size: number }>(
    `/gated/${encodeURIComponent(nftContract)}/${encodeURIComponent(tokenId)}`,
    { method: "PUT", body: JSON.stringify({ name, content }) },
    true,
    account,
    HOSTED_RUNNER,
  );
/** A folder name for the skill: its SKILL.md front matter `name`, else the agent's name. */
export function skillFolder(content: string, fallback: string) {
  const fm = /^---\s*\n([\s\S]*?)\n---/.exec(content)?.[1] ?? "";
  const named = /^name:\s*["']?([^"'\n]+)["']?\s*$/m.exec(fm)?.[1]?.trim() ?? "";
  const slug = (named || fallback).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+|-+$/g, "").slice(0, 64);
  return slug || "agent-skill";
}
/** One command that writes the skill into Claude Code (~/.claude/skills/<name>/SKILL.md). */
export function gatedInstall(name: string, content: string) {
  // The text is never expanded (quoted marker); a skill that contains the marker line gets a longer one.
  let marker = "AGENT_WALLET_SKILL_END";
  while (content.split("\n").includes(marker)) marker += "_";
  return `mkdir -p ~/.claude/skills/${name} && cat > ~/.claude/skills/${name}/SKILL.md <<'${marker}'\n${content.replace(/\n?$/, "\n")}${marker}`;
}

/**
 * Always a runner to talk to now: the hosted one by default on the hosted site
 * (no stray probes of 127.0.0.1 from a website), the local one when chosen.
 */
export function runnerWanted() {
  return true;
}
export function setLocalRunner(on: boolean) {
  try {
    if (on) localStorage.setItem(RUNNER_OPT_IN, "1");
    else localStorage.removeItem(RUNNER_OPT_IN);
  } catch {
    /* private mode: nothing to remember */
  }
}
/** The command that starts a runner this page may reach. */
export const runnerCommand = () =>
  /\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(location.origin)
    ? "npm run agent:runner"
    : `AGENTS_RUNNER_ORIGINS="${location.origin}" npm run agent:runner`;

export const runnerHealth = () =>
  runnerWanted()
    ? runnerRequest<{ agents: string; tick_seconds: number }>("/health")
    : Promise.reject(new Error("No runner on this computer (not enabled on this site)."));
export const runnerNewKey = (accountId: string) =>
  runnerFetch<{ publicKey: string }>(
    "/keys",
    { method: "POST", body: JSON.stringify({ accountId }) },
    true,
    accountId,
  ).then((r) => r.publicKey);
/** Background read: throws RunnerLockedError instead of opening the wallet. */
export const runnerJobs = (accountId: string) => {
  currentAccount = accountId;
  return runnerFetch<Job[]>(`/jobs?accountId=${encodeURIComponent(accountId)}`, undefined, false, accountId);
};
export const runnerSaveJob = (job: Job) =>
  runnerFetch<Job>(
    `/jobs/${job.seatId}`,
    { method: "PUT", body: JSON.stringify(job) },
    true,
    job.accountId,
  );
export const runnerRunNow = (seatId: string) =>
  runnerFetch<{ result: string }>(`/jobs/${seatId}/run`, { method: "POST" });
export const runnerPause = (seatId: string) =>
  runnerFetch<{ tx: string }>(`/jobs/${seatId}/pause`, { method: "POST" });
export type ActResult = { ok: boolean; tx: string; result: string };
export const runnerAct = (
  seatId: string,
  action:
    | { action: "buy"; token_id: string; listing_id: string; price: string }
    | { action: "pay"; payee: string; amount: string; memo?: string },
) =>
  runnerFetch<ActResult>(`/jobs/${seatId}/act`, {
    method: "POST",
    body: JSON.stringify(action),
  });
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

/** Pauses several seats in one wallet transaction (no deposit: pause is not payable). */
export const pauseMany = (seats: Seat[]) =>
  sendRaw(
    [...new Set(seats.map((s) => s.contract))].map((contract) => ({
      receiverId: contract,
      actions: seats.filter((s) => s.contract === contract).map((s) => fnCall("pause", { seat_id: s.num }, 0n, 10n)),
    })),
  );

/** NEAR's public NFT tutorial contract: anyone can mint, so anyone can try an agent. */
export const EXAMPLE_NFT = "nft.examples.testnet";

/**
 * Mints a Character NFT for the user on nft.examples.testnet (not our
 * contract): a real NFT whose on-chain `media` is the character's public art
 * URL. 0.1 NEAR attached; the contract refunds what its storage does not use.
 */
export async function mintExampleNft(account: string, slug?: string) {
  const now = Date.now();
  const character = (slug && characterBySlug(slug)) || CHARACTERS[now % CHARACTERS.length];
  const tokenId = `character-${character.slug}-${now}`;
  await sendRaw([
    {
      receiverId: EXAMPLE_NFT,
      actions: [
        fnCall(
          "nft_mint",
          {
            token_id: tokenId,
            receiver_id: account,
            metadata: {
              title: character.name,
              // Shown by wallets: tells whoever receives the NFT where its agent lives.
              description: `${character.collection}: ${character.description} Can carry an AI agent: ${HOSTED_APP.replace("https://", "")}/agents`,
              media: characterMedia(character),
              copies: 1,
            },
          },
          YOCTO / 10n,
          100n,
        ),
      ],
    },
  ]);
  return tokenId;
}

/** True when `account` can receive USDC (it exists and is registered on the token). */
export async function usdcReady(account: string) {
  try {
    return (await viewOn<unknown>(USDC, "storage_balance_of", { account_id: account })) !== null;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Bring your own AI: seats driven by the user's own agent over MCP.
// The key is generated in the browser and handed over as a file; this app only
// remembers, in this browser, which seats are "yours" (role, name, public key).
// ---------------------------------------------------------------------------

export type AgentTool = "claude-code" | "codex" | "cursor" | "other";
export const AGENT_TOOLS: { id: AgentTool; label: string }[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "cursor", label: "Cursor" },
  { id: "other", label: "Other MCP agent" },
];
export type ByoRecord = {
  seatId: string;
  role: string;
  name?: string;
  publicKey: string;
  /** Imported agent identity (shown on the card), kept in this browser. */
  tool?: AgentTool;
  avatar?: string;
  source?: string;
  hiredAt?: number;
};
const BYO_STORE = "agentwallet.byo";

export function byoAgents(): Record<string, ByoRecord> {
  try {
    return JSON.parse(localStorage.getItem(BYO_STORE) || "{}");
  } catch {
    return {};
  }
}

export function rememberByo(r: ByoRecord) {
  try {
    localStorage.setItem(BYO_STORE, JSON.stringify({ ...byoAgents(), [r.seatId]: r }));
  } catch {
    // Storage unavailable: the seat still works; it just shows as a plain agent here.
  }
}

/** The file the user's own AI reads (scripts/agent-mcp.ts --key <file>). Keep it private. */
export function agentKeyFile(seat: Seat, key: { publicKey: string; secretKey: string }, name?: string) {
  return {
    note:
      "PRIVATE: give this file only to your own AI agent. It is a function-call key limited to agent_pay / agent_buy / pause on the agents contract, with no deposit: it cannot withdraw, change limits or move your NFT. Revoke it any time from the Agent Wallet.",
    network: "testnet",
    account_id: seat.owner,
    seat_id: seat.seat_id,
    kind: seat.kind,
    name,
    agents_contract: seat.contract,
    nft: `${seat.nft_contract} #${seat.token_id}`,
    public_key: key.publicKey,
    secret_key: key.secretKey,
  };
}

export function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The MCP server as ONE file that plain `node` (18+) runs: no clone, no npm
 * install. Built by `npm run build:mcp` into public/mcp/ and committed, so the
 * raw GitHub URL works even before the site is hosted.
 */
export const MCP_BUNDLE_URL =
  import.meta.env.VITE_MCP_BUNDLE_URL ||
  "https://raw.githubusercontent.com/nielslecodeur/near_nft/keepers/public/mcp/agent-wallet.mjs";

/** Downloads the bundle next to the key file; works in bash, zsh, PowerShell and cmd (node only). */
export const mcpDownload = `node -e "fetch('${MCP_BUNDLE_URL}').then(r=>r.text()).then(t=>require('fs').writeFileSync('agent-wallet.mjs',t))"`;

/** What to run so an MCP agent drives this seat (from the folder holding both files). */
export const mcpCommand = (file: string) => `node agent-wallet.mjs --key ${file}`;

/**
 * How to register the seat's MCP server in each tool: download the one-file
 * server next to the key file, then point the tool at both with full paths.
 * Returns where it goes and what to paste.
 */
export function mcpSetup(tool: AgentTool, name: string, file: string) {
  const dir = "<folder with the key file>";
  const args = [`${dir}/agent-wallet.mjs`, "--key", `${dir}/${file}`];
  const json = JSON.stringify({ mcpServers: { [name]: { command: "node", args } } }, null, 2);
  switch (tool) {
    case "claude-code":
      return {
        where: "In a terminal, in the folder where you saved the key file",
        snippet: `${mcpDownload}
claude mcp add ${name} -- node "$PWD/agent-wallet.mjs" --key "$PWD/${file}"`,
      };
    case "codex":
      return {
        where: "Download the server next to the key file, then add this to ~/.codex/config.toml",
        snippet: `${mcpDownload}

[mcp_servers.${name}]
command = "node"
args = [${args.map((a) => `"${a}"`).join(", ")}]`,
      };
    case "cursor":
      return { where: "Download the server next to the key file, then add this to .cursor/mcp.json", snippet: `${mcpDownload}\n\n${json}` };
    default:
      return { where: "Download the server next to the key file, then add this stdio server to your agent's MCP settings", snippet: `${mcpDownload}\n\n${json}` };
  }
}

/** A short, safe slug for MCP server names. */
export const mcpName = (name: string | undefined, seatId: string) =>
  `${(name || "my-agent").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "my-agent"}-${seatId}`;

// ---------------------------------------------------------------------------
// Explorer links for the on-chain log: the contract logs actions, not their
// transaction hash, so each entry is matched to the owner's transaction to the
// agents contract (NearBlocks v3, public, CORS open): same method family,
// latest transaction at or before the entry's time, within a minute.
// ---------------------------------------------------------------------------

type IndexedTx = { hash: string; ts: bigint; method: string; ok: boolean; contract: string };
const NEARBLOCKS = "https://api-testnet.nearblocks.io/v3";
const txCache = new Map<string, { at: number; txs: IndexedTx[] }>();
/** NearBlocks is rate-limited for anonymous use: after a 429, wait a minute. */
let explorerBackoffUntil = 0;
const inflight = new Map<string, Promise<IndexedTx[]>>();

const METHODS: Record<string, string[]> = {
  pay: ["agent_pay"],
  buy: ["agent_buy"],
  deliver: ["agent_buy"],
  fund: ["fund", "ft_transfer_call"],
  withdraw: ["withdraw"],
  create: ["create_seat"],
  key: ["set_agent_key"],
  pause: ["pause"],
  resume: ["resume"],
  policy: ["set_policy"],
  claim: ["claim_seat"],
  reset: ["agent_pay", "agent_buy", "claim_seat", "withdraw"],
  budget: ["set_budget_follows", "claim_seat", "withdraw", "agent_pay"],
  profile: ["set_profile", "create_seat"],
};

/**
 * The owner's recent transactions to the agents contract, newest first.
 * Cached `maxAgeMs` (a minute by default; live pages ask sooner while their
 * newest entry has no link yet), one request in flight per owner, and no call
 * at all for a minute after the explorer says 429.
 */
export function ownerTxs(owner: string, oldest: bigint, maxAgeMs = 60_000, contracts: string[] = [AGENTS]): Promise<IndexedTx[]> {
  const id = `${owner}|${[...contracts].sort().join(",")}`;
  const hit = txCache.get(id);
  if (hit && Date.now() - hit.at < maxAgeMs) return Promise.resolve(hit.txs);
  if (Date.now() < explorerBackoffUntil) return Promise.resolve(hit?.txs ?? []);
  const running = inflight.get(id);
  if (running) return running;
  const p = fetchOwnerTxs(owner, oldest, contracts, id).finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

async function fetchOwnerTxs(owner: string, oldest: bigint, contracts: string[], id: string): Promise<IndexedTx[]> {
  const txs: IndexedTx[] = [];
  for (const contract of contracts) {
  let next: string | undefined;
  for (let page = 0; page < 2; page++) {
    const url = `${NEARBLOCKS}/accounts/${contract}/txns?limit=100&signer=${encodeURIComponent(owner)}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (r.status === 429) {
      explorerBackoffUntil = Date.now() + 60_000;
      break;
    }
    if (!r.ok) break;
    const d = (await r.json()) as {
      data?: { transaction_hash: string; block_timestamp: string; actions?: { method?: string }[]; outcomes?: { status?: boolean } }[];
      meta?: { next_page?: string };
    };
    for (const t of d.data ?? [])
      txs.push({
        hash: t.transaction_hash,
        ts: BigInt(t.block_timestamp),
        method: t.actions?.[0]?.method ?? "",
        ok: t.outcomes?.status !== false,
        contract,
      });
    next = d.meta?.next_page;
    if (!next || (txs.at(-1)?.ts ?? 0n) <= oldest) break;
  }
  }
  // USDC top-ups are sent to the USDC contract (ft_transfer_call), not to the agents contract.
  try {
    const r = await fetch(`${NEARBLOCKS}/accounts/${USDC}/txns?limit=50&signer=${encodeURIComponent(owner)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 429) explorerBackoffUntil = Date.now() + 60_000;
    else if (r.ok) {
      const d = (await r.json()) as { data?: { transaction_hash: string; block_timestamp: string; actions?: { method?: string }[] }[] };
      for (const t of d.data ?? [])
        if (t.actions?.[0]?.method === "ft_transfer_call")
          txs.push({ hash: t.transaction_hash, ts: BigInt(t.block_timestamp), method: "ft_transfer_call", ok: true, contract: USDC });
    }
  } catch {
    // No link for top-ups if the explorer is unreachable; everything else still works.
  }
  txs.sort((a, b) => (b.ts > a.ts ? 1 : b.ts < a.ts ? -1 : 0));
  txCache.set(id, { at: Date.now(), txs });
  return txs;
}

/** Transaction hash for one log entry, or null when it cannot be matched. */
export function txForEntry(e: { action: string; at: string }, txs: IndexedTx[], contract?: string) {
  const methods = METHODS[e.action];
  if (!methods) return null;
  const at = BigInt(e.at);
  const best = txs.find(
    (t) =>
      t.ts <= at &&
      at - t.ts <= 60_000_000_000n &&
      methods.includes(t.method) &&
      (!contract || t.contract === contract || t.contract === USDC),
  );
  return best?.hash ?? null;
}

/**
 * Take over (or re-arm) a seat in ONE wallet request: set the limits, resume it
 * if paused, add the budget and give the agent its key.
 */
export async function setupSeat(seat: Seat, policy: Policy, amount: bigint, publicKey: string) {
  const agentCalls = [
    fnCall("set_policy", { seat_id: seat.num, policy }, 1n, 20n),
    ...(seat.paused ? [fnCall("resume", { seat_id: seat.num }, 1n, 15n)] : []),
    ...(seat.kind === "Buyer" && amount > 0n ? [fnCall("fund", { seat_id: seat.num }, amount, 15n)] : []),
    fnCall("set_agent_key", { seat_id: seat.num, public_key: publicKey }, 1n, 15n),
  ];
  const txs: RawTx[] = [
    {
      receiverId: "self",
      actions: [
        {
          type: "AddKey",
          params: {
            publicKey,
            accessKey: { permission: { receiverId: seat.contract, allowance: KEY_ALLOWANCE.toString(), methodNames: AGENT_METHODS } },
          },
        },
      ],
    },
    { receiverId: seat.contract, actions: agentCalls },
  ];
  if (seat.kind === "Payer" && amount > 0n)
    txs.push({
      receiverId: USDC,
      actions: [
        fnCall(
          "ft_transfer_call",
          { receiver_id: seat.contract, amount: amount.toString(), msg: JSON.stringify({ seat_id: seat.num }) },
          1n,
          100n,
        ),
      ],
    });
  return sendRaw(txs);
}

/** Written in the NFT's transfer event: what this NFT carries and where to claim it. */
export const transferMemo = (seat: Seat) =>
  `AI agent${seat.profile?.name ? ` "${seat.profile.name}"` : ""} on this NFT: claim it at ${isLocalUrl(PUBLIC_URL) ? HOSTED_APP : PUBLIC_URL}/agents/${seat.seat_id}`;

/**
 * Hand the NFT over in ONE wallet request: optionally take the budget back,
 * switch the agent off (clear its key on the seat and delete it from this
 * account), then nft_transfer to the new owner.
 */
export async function transferSeatNft(
  seat: Seat,
  receiver: string,
  budget: "withdraw" | "set-aside" | "follow",
  /** v2: the profile's skill link frozen on the commit of the handover, set in the same request. */
  frozenManifest?: string | null,
) {
  const txs: RawTx[] = [];
  const agentCalls = [
    ...(frozenManifest && seat.version === "v2" && seat.profile
      ? [fnCall("set_profile", { seat_id: seat.num, profile: { ...seat.profile, manifest: frozenManifest } }, 1n, 30n)]
      : []),
    ...(budget === "withdraw" && seat.balance !== "0" ? [fnCall("withdraw", { seat_id: seat.num, amount: null }, 1n, 50n)] : []),
    // v2 only: the budget stays on the NFT for whoever claims it.
    ...(budget === "follow" && seat.version === "v2" && !seat.budget_follows
      ? [fnCall("set_budget_follows", { seat_id: seat.num, follows: true }, 1n, 30n)]
      : []),
    ...(seat.agent_key ? [fnCall("set_agent_key", { seat_id: seat.num, public_key: null }, 1n, 15n)] : []),
  ];
  if (agentCalls.length) txs.push({ receiverId: seat.contract, actions: agentCalls });
  if (seat.agent_key) txs.push({ receiverId: "self", actions: [{ type: "DeleteKey", params: { publicKey: seat.agent_key } }] });
  txs.push({
    receiverId: seat.nft_contract,
    actions: [fnCall("nft_transfer", { receiver_id: receiver, token_id: seat.token_id, memo: transferMemo(seat) }, 1n, 50n)],
  });
  return sendRaw(txs);
}

/** True when `account` exists on testnet (to catch typos before a transfer). */
export async function accountExists(account: string) {
  try {
    await rpc("query", { request_type: "view_account", account_id: account, finality: "final" });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Agent market: sell an agent with the NFT that carries it (and, if promised,
// its budget). The market pays the seller only once the NFT has moved and the
// promised budget is still in the agent; otherwise it refunds the buyer.
// ---------------------------------------------------------------------------

export const AGENT_MARKET = import.meta.env.VITE_AGENT_MARKET_ID || "agent-market-v1.everkeep-dev-mw0weth5.testnet";
export type AgentListing = {
  nft_contract: string;
  token_id: string;
  seller: string;
  approval_id: string;
  /** yoctoNEAR */
  price: string;
  /** The v2 seat id (plain, not a key). */
  seat_id: string;
  /** Promised to the buyer, in the seat's asset (base units). */
  budget: string;
  listed_at: string;
};
export type AgentSale = Omit<AgentListing, "approval_id" | "listed_at"> & { buyer: string; at: string };

export const agentListings = () => viewOn<AgentListing[]>(AGENT_MARKET, "listings", { limit: 100 }).catch(() => [] as AgentListing[]);
export const agentListing = (nftContract: string, tokenId: string) =>
  viewOn<AgentListing | null>(AGENT_MARKET, "listing", { nft_contract: nftContract, token_id: tokenId }).catch(() => null);
export const agentSales = () => viewOn<AgentSale[]>(AGENT_MARKET, "sales", {}).catch(() => [] as AgentSale[]);
/** The agent a listing sells (v2). */
export const listedSeat = (l: AgentListing) => getSeat(seatKey("v2", l.seat_id));

/**
 * Lists a v2 agent in ONE wallet request. With a budget, the agent is paused and
 * its budget set to follow the NFT first (the market checks both), then the NFT
 * approves the market with the price and the promised budget.
 */
export async function listAgent(seat: Seat, price: bigint, withBudget: boolean) {
  if (seat.version !== "v2") throw new Error("Only v2 agents can be sold with their record.");
  const budget = withBudget ? BigInt(seat.balance) : 0n;
  const txs: RawTx[] = [];
  const agentCalls = [
    ...(budget > 0n && !seat.budget_follows ? [fnCall("set_budget_follows", { seat_id: seat.num, follows: true }, 1n, 30n)] : []),
    ...(budget > 0n && !seat.paused ? [fnCall("pause", { seat_id: seat.num }, 0n, 15n)] : []),
  ];
  if (agentCalls.length) txs.push({ receiverId: seat.contract, actions: agentCalls });
  txs.push({
    receiverId: seat.nft_contract,
    actions: [
      fnCall(
        "nft_approve",
        {
          token_id: seat.token_id,
          account_id: AGENT_MARKET,
          msg: JSON.stringify({ price: price.toString(), seat_id: seat.num, budget: budget.toString() }),
        },
        10n ** 22n, // 0.01 NEAR for the approval's storage; the rest is refunded
        100n,
      ),
    ],
  });
  return sendRaw(txs);
}

/** Takes the agent off the market and revokes the market's approval on the NFT. */
export function delistAgent(l: AgentListing) {
  return sendRaw([
    { receiverId: AGENT_MARKET, actions: [fnCall("delist", { nft_contract: l.nft_contract, token_id: l.token_id }, 1n, 20n)] },
    { receiverId: l.nft_contract, actions: [fnCall("nft_revoke", { token_id: l.token_id, account_id: AGENT_MARKET }, 1n, 30n)] },
  ]);
}

/**
 * Buys a listed agent at the price and budget the buyer saw. Then claim it on its page.
 * Says whether the NFT arrived; if not, the market refunded the price (with its reason when the chain gives it).
 */
export async function buyAgent(l: AgentListing, buyer: string): Promise<{ bought: boolean; reason?: string; tx?: string }> {
  let tx: string | undefined;
  let reason: string | undefined;
  try {
    const r = await sendRaw([
      {
        receiverId: AGENT_MARKET,
        actions: [fnCall("buy", { nft_contract: l.nft_contract, token_id: l.token_id, price: l.price, budget: l.budget }, BigInt(l.price), 150n)],
      },
    ]);
    const o = r.outcomes[0] as unknown as { transaction: { hash: string }; receipts_outcome?: { outcome: { logs?: string[] } }[] };
    tx = o.transaction.hash;
    for (const log of o.receipts_outcome?.flatMap((x) => x.outcome.logs ?? []) ?? [])
      if (log.includes('"event":"sale_refunded"')) reason = /"reason":"([^"]+)"/.exec(log)?.[1];
  } catch (e) {
    // A failed NFT transfer fails a receipt, but the market still refunds: the NFT's owner tells what happened.
    if (!/failed on chain/.test(String(e))) throw e;
    reason = "the NFT could not be transferred";
  }
  const owner = await nftOwner(l.nft_contract, l.token_id).catch(() => null);
  return owner === buyer && !reason ? { bought: true, tx } : { bought: owner === buyer, reason: reason ?? "the sale did not go through", tx };
}

// ---------------------------------------------------------------------------
// Proven limits: on a change of hands the contract clears the agent's limits
// (the new owner sets their own). They are still on chain, in the previous
// owner's create_seat / set_policy transaction; its log tells how the agent did
// under them. The new owner can take them back in one click.
// ---------------------------------------------------------------------------

export type PastLimits = {
  policy: Policy;
  /** Who set them. */
  owner: string;
  tx: string;
  /** Block time (ns) they were set, and the claim that ended them. */
  setAt: bigint;
  until: bigint;
  /** What the agent did under them, from its log (the last 50 entries). */
  done: number;
  blocked: number;
};

type NbAction = { method?: string; args?: { args_json?: Record<string, unknown> | null; args_base64?: string | null } };
type NbTx = { transaction_hash: string; block_timestamp: string; actions?: NbAction[]; outcomes?: { status?: boolean } };

const jsonFromBase64 = (b64?: string | null): Record<string, unknown> | null => {
  try {
    return b64 ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))) : null;
  } catch {
    return null;
  }
};

/** A call that set limits: its transaction, when, and the limits if it is about this agent. */
type LimitsHit = { tx: string; setAt: bigint; policy: Policy };
/** Tells whether a create_seat / set_policy call set limits on this agent. */
type LimitsMatch = (method: string | undefined, args: Record<string, unknown> | null) => Policy | null;

const FASTNEAR_TX = "https://tx.test.fastnear.com";
/**
 * The previous owner's last call that set this agent's limits, from FastNEAR's transaction index
 * (no key, CORS open). undefined = it could not answer; null = no such call in what it returned.
 */
async function limitsFromFastnear(contract: string, owner: string, until: bigint, match: LimitsMatch): Promise<LimitsHit | null | undefined> {
  try {
    const post = async <T>(path: string, body: object): Promise<T> => {
      const r = await fetch(FASTNEAR_TX + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`tx index ${r.status}`);
      return r.json();
    };
    const list = await post<{ account_txs?: { transaction_hash: string; tx_block_timestamp: string; is_signer?: boolean; is_success?: boolean }[] }>(
      "/v0/account",
      { account_id: owner },
    );
    // Every successful transaction the owner signed up to the claim; which ones called the agents contract shows in the details.
    const when = new Map<string, bigint>();
    for (const t of list.account_txs ?? [])
      if (t.is_signer && t.is_success !== false && BigInt(t.tx_block_timestamp) <= until) when.set(t.transaction_hash, BigInt(t.tx_block_timestamp));
    const hashes = [...when.keys()].sort((a, b) => (when.get(b)! > when.get(a)! ? 1 : -1)).slice(0, 60);
    for (let i = 0; i < hashes.length; i += 20) {
      const d = await post<{ transactions?: { transaction: { hash: string; receiver_id: string; actions?: Record<string, { method_name?: string; args?: string } | undefined>[] } }[] }>(
        "/v0/transactions",
        { tx_hashes: hashes.slice(i, i + 20) },
      );
      const txs = (d.transactions ?? []).filter((t) => t.transaction.receiver_id === contract && when.has(t.transaction.hash));
      txs.sort((a, b) => (when.get(b.transaction.hash)! > when.get(a.transaction.hash)! ? 1 : -1));
      for (const t of txs)
        for (const a of [...(t.transaction.actions ?? [])].reverse()) {
          const call = a.FunctionCall;
          const policy = call && match(call.method_name, jsonFromBase64(call.args));
          if (policy) return { tx: t.transaction.hash, setAt: when.get(t.transaction.hash)!, policy };
        }
    }
    return null;
  } catch {
    return undefined;
  }
}

/** The same answer from NearBlocks (rate-limited for anonymous use), as a second source. */
async function limitsFromNearblocks(contract: string, owner: string, until: bigint, match: LimitsMatch): Promise<LimitsHit | null | undefined> {
  if (Date.now() < explorerBackoffUntil) return undefined;
  try {
    const get = async (url: string) => {
      const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (r.status === 429) explorerBackoffUntil = Date.now() + 60_000;
      if (!r.ok) throw new Error(`explorer ${r.status}`);
      return r.json();
    };
    const d = (await get(`${NEARBLOCKS}/accounts/${contract}/txns?limit=100&signer=${encodeURIComponent(owner)}`)) as { txns?: NbTx[]; data?: NbTx[] };
    const candidates = (d.txns ?? d.data ?? [])
      .filter((t) => t.outcomes?.status !== false && BigInt(t.block_timestamp) <= until)
      .filter((t) => t.actions?.some((a) => a.method === "set_policy" || a.method === "create_seat"))
      .slice(0, 4);
    for (const c of candidates) {
      const tx = ((await get(`${NEARBLOCKS}/txns/${c.transaction_hash}`)) as { data?: NbTx }).data;
      for (const a of [...(tx?.actions ?? [])].reverse()) {
        const policy = match(a.method, a.args?.args_json ?? jsonFromBase64(a.args?.args_base64));
        if (policy) return { tx: c.transaction_hash, setAt: BigInt(c.block_timestamp), policy };
      }
    }
    return null;
  } catch {
    return undefined;
  }
}

/**
 * The limits the agent had before its last change(s) of hands. null: the chain shows none.
 * undefined: no transaction index could answer just now (ask again later).
 * A claim's answer never changes, so it is kept in this browser.
 */
export async function previousLimits(seat: Seat, log: LogEntry[]): Promise<PastLimits | null | undefined> {
  const claims = log.filter((e) => e.action === "claim" && e.counterparty).sort((a, b) => (BigInt(b.seq) > BigInt(a.seq) ? 1 : -1));
  if (!claims.length) return null;
  const cacheKey = `agentwallet.proven:${seat.contract}:${seat.num}:${claims[0].seq}`;
  try {
    const hit = localStorage.getItem(cacheKey);
    if (hit) {
      const p = JSON.parse(hit) as (Omit<PastLimits, "setAt" | "until"> & { setAt: string; until: string }) | null;
      return p && { ...p, setAt: BigInt(p.setAt), until: BigInt(p.until) };
    }
  } catch {
    /* no storage: ask the index */
  }
  const found = await findPreviousLimits(seat, log, claims);
  if (found !== undefined)
    try {
      localStorage.setItem(cacheKey, JSON.stringify(found && { ...found, setAt: String(found.setAt), until: String(found.until) }));
    } catch {
      /* private mode */
    }
  return found;
}

async function findPreviousLimits(seat: Seat, log: LogEntry[], claims: LogEntry[]): Promise<PastLimits | null | undefined> {
  const match: LimitsMatch = (method, args) => {
    const policy = args?.policy as Policy | null | undefined;
    if (!policy || typeof policy.per_tx_max !== "string" || typeof policy.per_day_max !== "string" || !Array.isArray(policy.payees)) return null;
    const mine =
      method === "set_policy"
        ? String(args!.seat_id) === seat.num
        : method === "create_seat" && args!.nft_contract === seat.nft_contract && args!.token_id === seat.token_id;
    return mine ? policy : null;
  };
  let unanswered = false;
  for (const claim of claims.slice(0, 2)) {
    const owner = claim.counterparty!;
    const until = BigInt(claim.at);
    // Two independent public indexes: the second is asked only when the first cannot answer.
    let hit = await limitsFromFastnear(seat.contract, owner, until, match);
    if (hit === undefined) hit = await limitsFromNearblocks(seat.contract, owner, until, match);
    if (hit === undefined) {
      unanswered = true;
      continue;
    }
    if (!hit) continue;
    const under = log.filter((e) => BigInt(e.at) >= hit.setAt && BigInt(e.at) <= until && (e.action === "pay" || e.action === "buy"));
    const count = (status: string) => under.filter((e) => e.status === status).reduce((n, e) => n + (e.times ?? 1), 0);
    return { policy: hit.policy, owner, tx: hit.tx, setAt: hit.setAt, until, done: count("done"), blocked: count("refused") };
  }
  return unanswered ? undefined : null;
}

// ---------------------------------------------------------------------------
// Inbox: agents on NFTs this account holds but has not claimed yet (sent to it,
// or bought). Found from chain alone, so the sender has no link to send: the
// agent is waiting when the receiver opens the Agent Wallet.
// ---------------------------------------------------------------------------

export type ReceivedAgent = { seat: Seat; nft: OwnedNft };
/** nft -> what the last check found; an NFT seen for the first time is always checked at once. */
const inboxChecked = new Map<string, { at: number; seat: Seat | null }>();

/** Every NFT contract the account holds tokens of (FastNEAR index), so any collection is covered. */
async function nftContractsOf(account: string): Promise<string[]> {
  try {
    const r = await fetch(`https://test.api.fastnear.com/v1/account/${encodeURIComponent(account)}/nft`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return [];
    const d = (await r.json()) as { tokens?: { contract_id: string }[] };
    return (d.tokens ?? []).map((t) => t.contract_id);
  } catch {
    return [];
  }
}

export async function receivedAgents(account: string): Promise<ReceivedAgent[]> {
  const collections = new Map(COLLECTIONS.map((c) => [c.id, c.label]));
  for (const id of await nftContractsOf(account)) if (!collections.has(id)) collections.set(id, id.split(".")[0]);
  const nfts = (await Promise.all([...collections].map(([id, label]) => nftsIn(id, label, account)))).flat().slice(0, 80);
  const out: ReceivedAgent[] = [];
  const now = Date.now();
  // A few at a time: public RPC nodes are rate-limited.
  for (let i = 0; i < nfts.length; i += 4)
    await Promise.all(
      nfts.slice(i, i + 4).map(async (nft) => {
        const key = `${nft.contract}:${nft.token_id}`;
        const known = inboxChecked.get(key);
        let seat = known?.seat ?? null;
        if (!known || now - known.at > (known.seat ? 15_000 : 90_000)) {
          seat = await seatForNft(nft.contract, nft.token_id);
          inboxChecked.set(key, { at: now, seat });
        }
        if (seat && seat.owner !== account) out.push({ seat, nft });
      }),
    );
  return out.sort((a, b) => (a.seat.seat_id < b.seat.seat_id ? -1 : 1));
}

/** Claims several agents in ONE wallet request (one transaction each: a claim proves NFT ownership on chain). */
export function claimSeats(seats: Seat[]) {
  for (const s of seats) inboxChecked.delete(`${s.nft_contract}:${s.token_id}`);
  return sendRaw(seats.map((s) => ({ receiverId: s.contract, actions: [fnCall("claim_seat", { seat_id: s.num }, 1n, 80n)] })));
}

/** What the receiver gets, in a few words. */
export function receivedSummary(seat: Seat) {
  const parts: string[] = [];
  if (budgetGoesWithNft(seat)) parts.push(`${formatAsset(seat.balance, seat.asset)} of budget`);
  const link = seat.profile?.manifest;
  if (parseGatedUrl(link)) parts.push("a private skill only you can open");
  else if (link) parts.push("its skill");
  parts.push(`its record (${seat.done} done, ${seat.refused} blocked)`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
}
