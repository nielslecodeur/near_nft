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
 *   claude mcp add agent-wallet -- npx tsx scripts/agent-mcp.ts
 *
 * Env: AGENTS_ACCOUNT (default: the account the runner holds keys for),
 *      AGENTS_RUNNER (default http://127.0.0.1:8788), NEAR_TESTNET_RPC.
 * stdout is the MCP channel: logs go to stderr only.
 */
import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const RPC = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const RUNNER = process.env.AGENTS_RUNNER || "http://127.0.0.1:8788";
const EXPLORER = "https://testnet.nearblocks.io";
const pub = JSON.parse(await readFile(new URL("../public/testnet.json", import.meta.url), "utf8"));
const AGENTS: string = process.env.AGENTS_CONTRACT || pub.agents.contract;
const MARKET: string = pub.keepers.contract;
const log = (...a: unknown[]) => console.error("[agent-mcp]", ...a);

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
type Job = { seatId: string; accountId: string; kind: string; role?: string; name?: string; lastResult?: string };

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

async function runner<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(RUNNER + path, { ...init, headers: { "content-type": "application/json" } });
  } catch {
    throw new Error(`The agent runner is not reachable at ${RUNNER}. Start it with: npm run agent:runner`);
  }
  const data = await res.json();
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
};
const roleName = (s: Seat, job?: Job) =>
  ROLE_NAMES[job?.role ?? ""] ?? (s.kind === "Buyer" ? "Collector" : "Subscriptions");

function describe(s: Seat, job?: Job) {
  const p = s.policy;
  return {
    seat_id: s.seat_id,
    name: job?.name || `${roleName(s, job)} #${s.seat_id}`,
    role: roleName(s, job),
    kind: s.kind,
    nft: `${s.nft_contract} #${s.token_id}`,
    status: !p ? "reset (no limits)" : s.paused ? "paused" : !s.agent_key ? "no access key" : !job ? "no key in this runner" : "active",
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
  };
}

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const fail = (e: unknown) => ({ ...text(`Error: ${(e as Error).message}`), isError: true });

async function seatOrThrow(id: string) {
  const s = await view<Seat | null>(AGENTS, "seat", { seat_id: id });
  if (!s) throw new Error(`No agent #${id}.`);
  return s;
}

/** After an action: what the contract wrote in the agent's log (the source of truth). */
async function outcome(seatId: string, r: { ok: boolean; tx: string }) {
  const latest = (await view<LogEntry[]>(AGENTS, "seat_log", { seat_id: seatId })).find((e) => e.status !== "pending");
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
        view<Seat[]>(AGENTS, "seats_for_owner", { account_id: who }),
        runner<Job[]>(`/jobs?accountId=${encodeURIComponent(who)}`).catch(() => [] as Job[]),
      ]);
      return text({ account: who, agents: seats.map((s) => describe(s, jobs.find((j) => j.seatId === s.seat_id))) });
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
    inputSchema: { seat_id: z.string().describe("The agent's seat id, e.g. \"1\"") },
  },
  async ({ seat_id }) => {
    try {
      const s = await seatOrThrow(seat_id);
      const job = (await runner<Job[]>("/jobs").catch(() => [] as Job[])).find((j) => j.seatId === seat_id);
      const entries = (await view<LogEntry[]>(AGENTS, "seat_log", { seat_id })).filter((e) => e.status !== "pending").slice(0, 10);
      return text({
        ...describe(s, job),
        last_runner_result: job?.lastResult ?? null,
        recent_activity: entries.map((e) => ({
          action: e.action,
          result: e.status === "refused" ? "blocked" : e.status,
          amount: e.amount !== "0" ? fmt(e.amount, s.asset) : null,
          with: e.counterparty,
          detail: e.detail,
          at: new Date(Number(BigInt(e.at) / 1_000_000n)).toISOString(),
        })),
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
      const r = await runner<{ ok: boolean; tx: string }>(`/jobs/${seat_id}/act`, {
        method: "POST",
        body: JSON.stringify({ action: "pay", payee, amount: amount.toString(), memo }),
      });
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
      const r = await runner<{ ok: boolean; tx: string }>(`/jobs/${seat_id}/act`, {
        method: "POST",
        body: JSON.stringify({ action: "buy", token_id: pick.token_id, listing_id: pick.listing_id, price: pick.list_price }),
      });
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
      const r = await runner<{ tx: string }>(`/jobs/${seat_id}/pause`, { method: "POST" });
      return text({ result: "paused", transaction: `${EXPLORER}/txns/${r.tx}` });
    } catch (e) {
      return fail(e);
    }
  },
);

await server.connect(new StdioServerTransport());
log(`ready · contract ${AGENTS} · runner ${RUNNER}`);
