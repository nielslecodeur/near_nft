/**
 * Agent Wallet MCP server: lets any MCP client (Claude Code, Codex, other
 * agents) drive the agents on your NFTs, inside the limits the contract enforces.
 *
 * The AI never sees a key. Actions go through the local runner
 * (scripts/agent-runner.ts), which signs with each agent's function-call key
 * (agent_pay / agent_buy / pause only, no deposit). The agents contract checks
 * every action on chain and logs refusals; this server reports what the chain
 * decided, including the refusal reason.
 *
 *   npm run agent:runner            # in another terminal
 *   npm run build:mcp               # once: one-file bundle, starts in < 1 s
 *   claude mcp add agent-wallet -- node scripts/agent-mcp-launch.mjs
 *
 * Key mode (--key <file>): drives YOUR agent with the key file the Agent Wallet
 * gave you when you hired "Your AI agent" (no runner needed).
 *
 * Demo mode (--demo or AGENTS_DEMO=1): drives the public demo agent with the
 * key published in demo/agent-key.json (agent_pay only, 1 USDC per payment,
 * 2 USDC a day, one allowed payee). No runner, no wallet: try to make it
 * overspend and watch the contract refuse.
 *
 * Env: AGENTS_ACCOUNT (default: the account the runner holds keys for),
 *      AGENTS_RUNNER (default http://127.0.0.1:8788), NEAR_TESTNET_RPC.
 * stdout is the MCP channel: logs go to stderr only.
 */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MemoryStore, Runner } from "./agent-runner-core.js";
import { parseSeatKey, seatKey, seatLabel, type AgentsVersion } from "../src/keepers/seat-key.js";
import { skillInstall } from "../src/keepers/skills.js";
// Bundled in, so the one-file build (public/mcp/agent-wallet.mjs) runs anywhere, without the repo.
import pub from "../public/testnet.json";
import publicDemoKey from "../demo/agent-key.json";

const RPC = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const RUNNER = process.env.AGENTS_RUNNER || "http://127.0.0.1:8788";
const EXPLORER = "https://testnet.nearblocks.io";
const AGENTS: string = process.env.AGENTS_CONTRACT || pub.agents.contract;
const AGENTS_V2: string | undefined = process.env.AGENTS_V2_CONTRACT || (pub as { agents_v2?: { contract: string } }).agents_v2?.contract;
/** A seat key ("9" on v1, "v2-3" on v2) -> its contract and in-contract id. */
function locate(key: string) {
  const k = parseSeatKey(key);
  if (!k) throw new Error(`Not a seat id: ${key}. Use "9" (v1) or "v2-3" (v2).`);
  if (k.version === "v2" && !AGENTS_V2) throw new Error("No v2 agents contract configured.");
  return { contract: k.version === "v2" ? AGENTS_V2! : AGENTS, num: k.num, version: k.version };
}
const MARKET: string = pub.keepers.contract;
const log = (...a: unknown[]) => console.error("[agent-mcp]", ...a);

/**
 * Key mode: the server signs itself with ONE agent key from a file, no runner.
 *   --key <file>  your own agent (file downloaded from the Agent Wallet when you
 *                 hired "Your AI agent"); everything that key may do
 *   --demo        the public demo agent (demo/agent-key.json), agent_pay only
 */
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.error(`Agent Wallet MCP server (stdio). NEAR testnet, agents contract ${AGENTS}.

  node agent-wallet.mjs --demo              drive the public demo agent (no wallet, no setup)
  node agent-wallet.mjs --key <file>        drive YOUR agent with the key file the Agent Wallet gave you
  node agent-wallet.mjs                     drive the agents of a local runner (npm run agent:runner)

Register it, e.g. in Claude Code:  claude mcp add agent-wallet -- node /path/agent-wallet.mjs --key /path/agent-12-key.json
Tools: list_agents, agent_status, received_agents, list_market, pay, buy, pause. The contract enforces every limit.
Env: AGENTS_KEY_FILE, AGENTS_DEMO=1, AGENTS_ACCOUNT, AGENTS_RUNNER, AGENTS_RUNNER_TOKEN, NEAR_TESTNET_RPC.
Docs: https://github.com/nielslecodeur/near_nft/blob/keepers/AGENTS.md`);
  process.exit(0);
}
const keyArg = process.argv.indexOf("--key");
const KEY_FILE =
  keyArg > 0 ? process.argv[keyArg + 1] : process.env.AGENTS_KEY_FILE || null;
const DEMO_MODE = !KEY_FILE && (process.argv.includes("--demo") || process.env.AGENTS_DEMO === "1");
type DemoKey = { account_id: string; seat_id: string; public_key: string; secret_key: string; kind?: "Buyer" | "Payer"; name?: string };
const demoKey: DemoKey | null = KEY_FILE
  ? JSON.parse(await readFile(KEY_FILE, "utf8"))
  : DEMO_MODE
    ? (publicDemoKey as DemoKey)
    : null;
/** In demo mode the server signs itself with the public key (no runner needed). */
const demoRunner = demoKey
  ? await (async () => {
      const store = new MemoryStore();
      await store.saveKey({ accountId: demoKey.account_id, publicKey: demoKey.public_key, secretKey: demoKey.secret_key, createdAt: "" });
      return { store, core: new Runner({ rpc: RPC, agents: AGENTS, agentsV2: AGENTS_V2, store, log: (l) => log(l) }) };
    })()
  : null;
const demoJob = demoKey
  ? {
      seatId: demoKey.seat_id,
      accountId: demoKey.account_id,
      publicKey: demoKey.public_key,
      kind: demoKey.kind ?? ("Payer" as const),
      role: KEY_FILE ? "byo" : "allowance",
      name: demoKey.name ?? (KEY_FILE ? `Your AI agent #${demoKey.seat_id}` : "Public demo agent"),
    }
  : null;

type Seat = {
  seat_id: string;
  nft_contract: string;
  token_id: string;
  kind: "Buyer" | "Payer";
  asset: "NEAR" | "USDC";
  owner: string;
  agent_key: string | null;
  paused: boolean;
  policy: { per_tx_max: string; per_day_max: string; payees: string[]; market: string | null } | null;
  balance: string;
  spent_today: string;
  left_today: string;
  done: number;
  refused: number;
  failed: number;
};
type LogEntry = { seq: string; at: string; action: string; status: string; amount: string; counterparty: string | null; detail: string };
type Listing = { token_id: string; owner_id: string; tier_name: string; list_price: string; listing_id: string };
type Job = { seatId: string; accountId: string; kind: string; role?: string; name?: string; lastResult?: string; publicKey?: string; keyFile?: boolean };

async function view<T>(contract: string, method: string, args: object = {}): Promise<T> {
  const r = await (
    await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "mcp",
        method: "query",
        params: {
          request_type: "call_function",
          account_id: contract,
          method_name: method,
          args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
          finality: "optimistic",
        },
      }),
    })
  ).json();
  if (r.error || r.result?.error) throw new Error(JSON.stringify(r.error ?? r.result.error));
  return JSON.parse(Buffer.from(r.result.result).toString());
}

/** Jobs the server can act for: the demo job in demo mode, the runner's otherwise. */
/**
 * Imported agents ("Import an agent") are driven by the user's own AI with a
 * key file, not by the runner. Their name lives only in that file, so read the
 * agent-<seat>-key.json files next to this server (cwd and repo root) for the
 * name, never the secret. Used only while the file's key is the seat's key.
 */
async function keyFileJobs(): Promise<Job[]> {
  const dirs = [...new Set([process.cwd(), fileURLToPath(new URL("..", import.meta.url))])];
  const found = new Map<string, Job>();
  for (const dir of dirs) {
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const n of names.filter((n) => /^agent-\d+-key\.json$/.test(n))) {
      try {
        const f = JSON.parse(await readFile(`${dir}/${n}`, "utf8")) as Partial<DemoKey>;
        if (f.seat_id && f.public_key && f.account_id)
          found.set(f.seat_id, { seatId: f.seat_id, accountId: f.account_id, kind: f.kind ?? "Payer", role: "byo", name: f.name, publicKey: f.public_key, keyFile: true });
      } catch {
        /* not a key file */
      }
    }
  }
  return [...found.values()];
}

/** The runner's job for a seat, else the imported agent whose key file matches the seat's key. */
const jobOf = (s: Seat, jobs: Job[]) =>
  jobs.find((j) => j.seatId === s.seat_id && !j.keyFile) ?? jobs.find((j) => j.seatId === s.seat_id && j.keyFile && j.publicKey === s.agent_key);

async function jobsFor(who?: string): Promise<Job[]> {
  if (demoJob) return [demoJob];
  const [fromRunner, fromFiles] = await Promise.all([
    runner<Job[]>(who ? `/jobs?accountId=${encodeURIComponent(who)}` : "/jobs").catch(() => [] as Job[]),
    keyFileJobs(),
  ]);
  return [...fromRunner, ...fromFiles.filter((j) => !who || j.accountId === who)];
}

/** Pay or buy through the runner, or directly with the public key in demo mode. */
async function act(seatId: string, body: Record<string, string | undefined>): Promise<{ ok: boolean; tx: string }> {
  if (demoRunner && demoJob) {
    if (seatId !== demoJob.seatId) throw new Error(`This key drives agent #${demoJob.seatId} only.`);
    const job = { ...demoJob };
    if (body.action === "buy") return demoRunner.core.buyNow(job, body.token_id!, body.listing_id!, body.price!);
    return demoRunner.core.payNow(job, body.payee!, body.amount!, body.memo);
  }
  return runner<{ ok: boolean; tx: string }>(`/jobs/${seatId}/act`, { method: "POST", body: JSON.stringify(body) });
}

/**
 * The runner's admin token: AGENTS_RUNNER_TOKEN, else the file the runner
 * writes at each start (.local/runner-token in the repo, or in the cwd). Read
 * on every call, so a runner restart (new token) needs no MCP restart.
 */
async function runnerToken(): Promise<string | null> {
  if (process.env.AGENTS_RUNNER_TOKEN) return process.env.AGENTS_RUNNER_TOKEN.trim();
  for (const file of [fileURLToPath(new URL("../.local/runner-token", import.meta.url)), `${process.cwd()}/.local/runner-token`]) {
    const t = await readFile(file, "utf8").catch(() => "");
    if (t.trim()) return t.trim();
  }
  return null;
}

async function runner<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await runnerToken();
  let res: Response;
  try {
    res = await fetch(RUNNER + path, {
      ...init,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    throw new Error(`The agent runner is not reachable at ${RUNNER}. Start it with: npm run agent:runner`);
  }
  const data = await res.json();
  if (res.status === 401)
    throw new Error("The runner refused this server's token. Start the runner from this repo (it writes .local/runner-token) or set AGENTS_RUNNER_TOKEN.");
  if (!res.ok) throw new Error(data.error || `runner error ${res.status}`);
  return data as T;
}

/** Units: NEAR has 24 decimals, USDC 6. */
const UNITS = { NEAR: 24, USDC: 6 } as const;
function fmt(amount: string | bigint, asset: "NEAR" | "USDC") {
  const v = BigInt(amount);
  const d = UNITS[asset];
  const unit = 10n ** BigInt(d);
  const frac = (v % unit).toString().padStart(d, "0").slice(0, 3).replace(/0+$/, "");
  return `${v / unit}${frac ? "." + frac : ""} ${asset}`;
}
function parse(text: string, asset: "NEAR" | "USDC"): bigint {
  const m = text.trim().match(/^(\d+)(?:[.,](\d+))?$/);
  if (!m) throw new Error(`Not an amount: ${text}`);
  const d = UNITS[asset];
  return BigInt(m[1]) * 10n ** BigInt(d) + BigInt((m[2] ?? "").slice(0, d).padEnd(d, "0") || "0");
}

async function account(given?: string) {
  if (given) return given;
  if (demoKey) return demoKey.account_id;
  if (process.env.AGENTS_ACCOUNT) return process.env.AGENTS_ACCOUNT;
  const jobs = await runner<Job[]>("/jobs");
  const owners = [...new Set(jobs.map((j) => j.accountId))];
  if (owners.length === 1) return owners[0];
  throw new Error(
    owners.length
      ? `The runner holds agents for several accounts (${owners.join(", ")}): pass "account".`
      : "No agent found in the runner. Hire one in the Agent Wallet (/agents/new) first, or pass \"account\".",
  );
}

/** Same role names as the Agent Wallet UI (src/keepers/roles.ts). */
const ROLE_NAMES: Record<string, string> = {
  collector: "Collector",
  bargain: "Bargain hunter",
  subscription: "Subscriptions",
  allowance: "Allowance",
  splitter: "Bill splitter",
  payroll: "Payroll & tips",
  byo: "Imported agent",
};
const roleName = (s: Seat, job?: Job) =>
  ROLE_NAMES[job?.role ?? ""] ?? (s.kind === "Buyer" ? "Buyer" : "Payer");

function describe(s: Seat & { profile?: { name: string; role: string; tool: string | null; manifest: string | null } | null; owners?: number }, job?: Job) {
  const p = s.policy;
  return {
    seat_id: s.seat_id,
    name: job?.name || s.profile?.name || `${ROLE_NAMES[job?.role ?? ""] ?? "Agent"} ${seatLabel(s.seat_id)}`,
    contract: parseSeatKey(s.seat_id)?.version === "v2" ? "v2" : "v1",
    ...(s.profile !== undefined ? { profile: s.profile, owners_so_far: s.owners } : {}),
    role: roleName(s, job),
    kind: s.kind,
    nft: `${s.nft_contract} #${s.token_id}`,
    status: !p ? (s.profile?.role === "skill" ? "skill card (no budget, carries a skill link)" : "reset (no limits)") : s.paused ? "paused" : !s.agent_key ? "no access key" : !job ? "no key in this runner" : job.keyFile ? "active (your own AI, key file)" : "active",
    budget: fmt(s.balance, s.asset),
    spent_today: fmt(s.spent_today, s.asset),
    left_today: fmt(s.left_today, s.asset),
    limits: p
      ? {
          per_action: fmt(p.per_tx_max, s.asset),
          per_day: fmt(p.per_day_max, s.asset),
          ...(s.kind === "Payer" ? { allowed_payees: p.payees } : { market: p.market }),
        }
      : null,
    counts: { done: s.done, blocked: s.refused, failed: s.failed },
    ...(s.profile?.manifest ? { skill: skillOf(s.profile.manifest, s.seat_id) } : {}),
  };
}

const APP = "https://near-nft-wheat.vercel.app";
/** Collections always looked at; the FastNEAR index adds every other one the account holds. */
const NFT_COLLECTIONS = [pub.keepers.contract, "nft.examples.testnet", "paras-token-v2.testnet"];

/** How to get the agent's skill: a shell command for a public GitHub skill, the page for a private one. */
function skillOf(manifest: string | null | undefined, seatId: string) {
  if (!manifest) return null;
  if (/\/gated\/[^/]+\/[^/]+$/.test(manifest))
    return { private: true, how: `Only the NFT's holder can open it: ${APP}/agents/${seatId} with the wallet that holds the NFT (one signed message).` };
  const i = skillInstall(manifest);
  return i
    ? { source: manifest, ...(i.commit ? { frozen_at_commit: i.commit } : {}), install_claude_code: i.claudeCode }
    : { source: manifest, how: "Open the link and follow its instructions." };
}

/** Agents on NFTs `who` holds but has not claimed. */
async function received(who: string) {
  const contracts = new Set(NFT_COLLECTIONS);
  try {
    const r = await fetch(`https://test.api.fastnear.com/v1/account/${encodeURIComponent(who)}/nft`, { signal: AbortSignal.timeout(10_000) });
    if (r.ok) for (const t of ((await r.json()) as { tokens?: { contract_id: string }[] }).tokens ?? []) contracts.add(t.contract_id);
  } catch {
    // The known collections are still checked.
  }
  type Found = Seat & { profile?: { name: string; manifest: string | null } | null; budget_follows?: boolean; held_for_next_owner?: boolean };
  const out: Found[] = [];
  for (const nft of contracts) {
    const tokens = await view<{ token_id: string }[]>(nft, "nft_tokens_for_owner", { account_id: who, from_index: "0", limit: 50 }).catch(() => []);
    for (const t of tokens)
      for (const [v, c] of [["v2", AGENTS_V2], ["v1", AGENTS]] as [AgentsVersion, string | undefined][]) {
        if (!c) continue;
        const seat = await view<Found | null>(c, "seat_for_nft", { nft_contract: nft, token_id: t.token_id }).catch(() => null);
        if (!seat) continue;
        if (seat.owner !== who) out.push({ ...seat, seat_id: seatKey(v, seat.seat_id) });
        break;
      }
  }
  return out;
}

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const fail = (e: unknown) => ({ ...text(`Error: ${(e as Error).message}`), isError: true });

/** One seat by key, with seat_id set to its key. */
async function seatOrThrow(id: string) {
  const at = locate(id);
  const raw = await view<Seat | null>(at.contract, "seat", { seat_id: at.num });
  const s = raw ? { ...raw, seat_id: id } : null;
  if (!s) throw new Error(`No agent #${id}.`);
  return s;
}

/** After an action: what the contract wrote in the agent's log (the source of truth). */
async function outcome(seatId: string, r: { ok: boolean; tx: string }) {
  const at = locate(seatId);
  const latest = (await view<LogEntry[]>(at.contract, "seat_log", { seat_id: at.num })).find((e) => e.status !== "pending");
  return {
    result: r.ok ? "done" : "blocked or failed by the contract",
    contract_log: latest ? `${latest.action}: ${latest.status}${latest.detail ? ` (${latest.detail})` : ""}` : null,
    transaction: `${EXPLORER}/txns/${r.tx}`,
  };
}

const server = new McpServer({ name: "agent-wallet", version: "1.0.0" });

server.registerTool(
  "list_agents",
  {
    title: "List my agents",
    description:
      "Lists the AI agents living on the user's NFTs, with their budget, what they spent today and the on-chain limits they cannot exceed.",
    inputSchema: { account: z.string().optional().describe("NEAR testnet account; defaults to the runner's account") },
  },
  async ({ account: given }) => {
    try {
      const who = await account(given);
      const [seats, jobs] = await Promise.all([
        Promise.all(
          ([["v1", AGENTS], ...(AGENTS_V2 ? [["v2", AGENTS_V2]] : [])] as [AgentsVersion, string][]).map(([v, c]) =>
            view<Seat[]>(c, "seats_for_owner", { account_id: who }).then(
              (l) => l.map((x) => ({ ...x, seat_id: seatKey(v, x.seat_id) })),
              () => [] as Seat[],
            ),
          ),
        ).then((l) => l.flat()),
        jobsFor(who).catch(() => [] as Job[]),
      ]);
      return text({ account: who, agents: seats.map((s) => describe(s, jobOf(s, jobs))) });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "agent_status",
  {
    title: "Agent status and recent activity",
    description: "One agent's limits, budget and its last on-chain log entries (done, blocked with the reason, failed).",
    inputSchema: { seat_id: z.string().describe("The agent's seat id: \"9\" on the v1 contract, \"v2-3\" on v2 (as list_agents shows)") },
  },
  async ({ seat_id }) => {
    try {
      const s = await seatOrThrow(seat_id);
      const job = jobOf(s, await jobsFor().catch(() => [] as Job[]));
      const at = locate(seat_id);
      const entries = (await view<LogEntry[]>(at.contract, "seat_log", { seat_id: at.num })).filter((e) => e.status !== "pending").slice(0, 10);
      return text({
        ...describe(s, job),
        last_runner_result: job?.lastResult ?? null,
        recent_activity: entries.map((e) => ({
          action: e.action,
          result: e.status === "refused" ? "blocked" : e.status,
          amount: e.amount !== "0" ? fmt(e.amount, s.asset) : null,
          with: e.counterparty,
          detail: e.detail,
          ...(((e as { times?: number }).times ?? 1) > 1 ? { times: (e as { times?: number }).times } : {}),
          at: new Date(Number(BigInt(e.at) / 1_000_000n)).toISOString(),
        })),
      });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "received_agents",
  {
    title: "Agents that arrived in a wallet",
    description:
      "Agents sitting on NFTs the account holds but has not claimed yet (someone sent the NFT, or it was bought). For each: who it comes from, what comes with it, the page where the user claims it (one wallet signature), and, when its skill is public on GitHub, the shell command that installs it into Claude Code. You can run that command yourself to install the skill; never ask for a seed phrase or full-access key.",
    inputSchema: { account: z.string().optional().describe("NEAR testnet account that received the NFT; defaults to this server's account") },
  },
  async ({ account: given }) => {
    try {
      const who = await account(given);
      const found = await received(who);
      return text({
        account: who,
        received: found.map((s) => ({
          seat_id: s.seat_id,
          name: s.profile?.name ?? `Agent ${seatLabel(s.seat_id)}`,
          from: s.owner,
          nft: `${s.nft_contract} #${s.token_id}`,
          budget_for_you: s.balance !== "0" && (s.budget_follows || s.held_for_next_owner) ? fmt(s.balance, s.asset) : null,
          record: { done: s.done, blocked: s.refused },
          skill: skillOf(s.profile?.manifest, s.seat_id),
          claim: `${APP}/agents/${s.seat_id} (connect the wallet, one signature)`,
        })),
        ...(found.length ? {} : { note: "Nothing waiting: every agent on this account's NFTs is already claimed." }),
      });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "list_market",
  {
    title: "Keepers for sale",
    description: "Keeper NFTs listed on the market a Buyer agent may buy from, cheapest first.",
    inputSchema: { max_price_near: z.string().optional().describe("Only listings at or under this price, in NEAR") },
  },
  async ({ max_price_near }) => {
    try {
      const max = max_price_near ? parse(max_price_near, "NEAR") : null;
      const supply = Number(await view<string>(MARKET, "nft_total_supply"));
      const all: Listing[] = [];
      for (let from = 0; from < supply; from += 50)
        all.push(...(await view<Listing[]>(MARKET, "listings", { from_index: String(from), limit: 50 })));
      const shown = all
        .filter((l) => l.list_price && (!max || BigInt(l.list_price) <= max))
        .sort((a, b) => (BigInt(a.list_price) < BigInt(b.list_price) ? -1 : 1))
        .map((l) => ({ token_id: l.token_id, tier: l.tier_name, price: fmt(l.list_price, "NEAR"), seller: l.owner_id }));
      return text({ market: MARKET, listings: shown });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "pay",
  {
    title: "Pay with a Payer agent",
    description:
      "Asks a Payer agent to pay USDC to an account. The agents contract decides: it refuses (and logs why) any payee not on the agent's list, any amount over the per-action or daily cap, or over the budget. No wallet signature is needed.",
    inputSchema: {
      seat_id: z.string(),
      payee: z.string().describe("NEAR account to pay, e.g. shop.testnet"),
      amount_usdc: z.string().describe("Amount in USDC, e.g. \"1.5\""),
      memo: z.string().max(48).optional(),
    },
  },
  async ({ seat_id, payee, amount_usdc, memo }) => {
    try {
      const s = await seatOrThrow(seat_id);
      if (s.kind !== "Payer") throw new Error(`Agent #${seat_id} is a ${s.kind}; use buy.`);
      const amount = parse(amount_usdc, "USDC");
      const r = await act(seat_id, { action: "pay", payee, amount: amount.toString(), memo });
      log(`pay #${seat_id} ${amount_usdc} USDC -> ${payee}: ${r.ok}`);
      return text(await outcome(seat_id, r));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "buy",
  {
    title: "Buy a Keeper with a Buyer agent",
    description:
      "Asks a Buyer agent to buy a Keeper: a given token, or the cheapest one under a price. The contract enforces the market, per-action and daily caps and the budget; the card is delivered to the owner's wallet. No wallet signature is needed.",
    inputSchema: {
      seat_id: z.string(),
      token_id: z.string().optional().describe("A specific Keeper to buy"),
      max_price_near: z.string().optional().describe("Otherwise: the cheapest listing at or under this price"),
    },
  },
  async ({ seat_id, token_id, max_price_near }) => {
    try {
      const s = await seatOrThrow(seat_id);
      if (s.kind !== "Buyer") throw new Error(`Agent #${seat_id} is a ${s.kind}; use pay.`);
      const max = max_price_near ? parse(max_price_near, "NEAR") : null;
      const supply = Number(await view<string>(MARKET, "nft_total_supply"));
      const all: Listing[] = [];
      for (let from = 0; from < supply; from += 50)
        all.push(...(await view<Listing[]>(MARKET, "listings", { from_index: String(from), limit: 50 })));
      const pick = all
        .filter((l) => l.list_price && l.owner_id !== s.owner)
        .filter((l) => (token_id ? l.token_id === token_id : true))
        .filter((l) => (max ? BigInt(l.list_price) <= max : true))
        .sort((a, b) => (BigInt(a.list_price) < BigInt(b.list_price) ? -1 : 1))[0];
      if (!pick) return text("No Keeper listed matches. Try list_market.");
      const r = await act(seat_id, { action: "buy", token_id: pick.token_id, listing_id: pick.listing_id, price: pick.list_price });
      log(`buy #${seat_id} Keeper #${pick.token_id}: ${r.ok}`);
      return text({ keeper: pick.token_id, price: fmt(pick.list_price, "NEAR"), ...(await outcome(seat_id, r)) });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "pause",
  {
    title: "Pause an agent",
    description:
      "Stops an agent immediately. Signed by the agent's own key (no wallet). Only the owner's wallet can resume it.",
    inputSchema: { seat_id: z.string() },
  },
  async ({ seat_id }) => {
    try {
      if (DEMO_MODE) throw new Error("The public demo key cannot pause (it may only call agent_pay), so nobody can stop the demo for others.");
      const r =
        demoRunner && demoJob
          ? { tx: await demoRunner.core.pause({ ...demoJob, seatId: seat_id }) }
          : await runner<{ tx: string }>(`/jobs/${seat_id}/pause`, { method: "POST" });
      return text({ result: "paused", transaction: `${EXPLORER}/txns/${r.tx}` });
    } catch (e) {
      return fail(e);
    }
  },
);

await server.connect(new StdioServerTransport());
log(
  KEY_FILE
    ? `ready · your agent #${demoKey!.seat_id} of ${demoKey!.account_id} (key file)`
    : DEMO_MODE
      ? `ready · DEMO agent #${demoKey!.seat_id} of ${demoKey!.account_id}`
      : `ready · contracts ${AGENTS}${AGENTS_V2 ? ` + ${AGENTS_V2}` : ""} · runner ${RUNNER}`,
);
