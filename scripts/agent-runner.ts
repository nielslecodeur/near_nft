/**
 * Agent runner service (testnet). Holds agent keys and runs Buyer/Payer jobs
 * every TICK seconds, with no wallet signature. Listens on 127.0.0.1 only.
 *
 *   npm run agent:runner            # serve + loop
 *   npm run agent:runner -- --once  # run every job once and exit
 *
 * Keys and jobs live outside the repo in ~/.everkeep-agents (file mode 600).
 * A leaked agent key can only call agent_pay / agent_buy / pause on the agents
 * contract, inside the seat's on-chain policy; it cannot withdraw or change it.
 *
 * Every route but /health and /auth/* needs `Authorization: Bearer <token>`:
 * a session token from a wallet-signed NEP-413 challenge (only that account's
 * agents), or the admin token in .local/runner-token for local tools such as
 * the MCP server (see scripts/runner-auth.ts). Requests must name this host
 * (127.0.0.1 or localhost), which blocks DNS-rebinding pages, and only the
 * Agent Wallet's origins are let in from a browser.
 *
 * Seats are named by key: "9" for the v1 contract, "v2-3" for v2 (public/testnet.json
 * "agents" and "agents_v2"); :seatId below is such a key.
 *
 * HTTP API (JSON), used by the Agent Wallet:
 *   GET    /health
 *   POST   /auth/challenge    {accountId}            -> {nonce, message, recipient}
 *   POST   /auth/session      {nonce, accountId, publicKey, signature} -> {token, accountId, expiresAt}
 *   GET    /auth/me                                  -> {accountId|admin}
 *   POST   /auth/logout
 *   POST   /keys              {accountId}            -> {publicKey}
 *   GET    /jobs?accountId=…                         -> Job[]
 *   PUT    /jobs/:seatId      {accountId, publicKey, kind, buyer?|payer?}
 *   DELETE /jobs/:seatId
 *   POST   /jobs/:seatId/run                         -> {result}
 *   POST   /jobs/:seatId/pause                       -> {tx}  (signed by the agent key)
 *   POST   /jobs/:seatId/act  {action:"buy", token_id, listing_id, price}
 *                             {action:"pay", payee, amount, memo?}  -> {ok, tx, result}
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Runner, type Job, type Store, type StoredKey } from "./agent-runner-core.js";
import { AuthError, RunnerAuth, type Principal } from "./runner-auth.js";

const DIR = process.env.AGENTS_RUNNER_DIR || join(homedir(), ".everkeep-agents");
const PORT = Number(process.env.AGENTS_RUNNER_PORT || 8788);
const TICK = Number(process.env.AGENTS_RUNNER_TICK || 20);
const RPC = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const ORIGINS = (process.env.AGENTS_RUNNER_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const HOSTS = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
const ADMIN_TOKEN_FILE = process.env.AGENTS_RUNNER_TOKEN_FILE || join(process.cwd(), ".local", "runner-token");

class FileStore implements Store {
  private async read<T>(name: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await readFile(join(DIR, name), "utf8"));
    } catch {
      return fallback;
    }
  }
  private async write(name: string, data: unknown) {
    await mkdir(DIR, { recursive: true, mode: 0o700 });
    const path = join(DIR, name);
    await writeFile(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
    await chmod(path, 0o600).catch(() => {});
  }
  keys() {
    return this.read<StoredKey[]>("keys.json", []);
  }
  async saveKey(k: StoredKey) {
    await this.write("keys.json", [...(await this.keys()), k]);
  }
  jobs() {
    return this.read<Job[]>("jobs.json", []);
  }
  async saveJob(j: Job) {
    const all = (await this.jobs()).filter((x) => x.seatId !== j.seatId);
    await this.write("jobs.json", [...all, j]);
  }
  async deleteJob(seatId: string) {
    await this.write("jobs.json", (await this.jobs()).filter((x) => x.seatId !== seatId));
  }
}

const pub = JSON.parse(await readFile("public/testnet.json", "utf8"));
const AGENTS: string = process.env.AGENTS_CONTRACT || pub.agents?.contract;
if (!AGENTS) throw new Error("No agents contract in public/testnet.json");
const AGENTS_V2: string | undefined = process.env.AGENTS_V2_CONTRACT || pub.agents_v2?.contract;
const store = new FileStore();
const runner = new Runner({ rpc: RPC, agents: AGENTS, agentsV2: AGENTS_V2, store });
const auth = new RunnerAuth({ rpc: RPC, sessionsFile: join(DIR, "sessions.json"), adminTokenFile: ADMIN_TOKEN_FILE });

if (process.argv.includes("--once")) {
  console.log(JSON.stringify(await runner.tick(), null, 2));
  process.exit(0);
}
await auth.start();

/** Owner of a seat on chain right now (after a transfer + claim it changes). `seatId` is a seat key. */
async function seatOwner(seatId: string): Promise<string | null> {
  const { contract, id } = runner.target({ seatId });
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "seat",
      method: "query",
      params: {
        request_type: "call_function",
        account_id: contract,
        method_name: "seat",
        args_base64: Buffer.from(JSON.stringify({ seat_id: id })).toString("base64"),
        finality: "optimistic",
      },
    }),
  });
  const data = (await r.json()) as { result?: { result: number[] } };
  if (!data.result) return null;
  const seat = JSON.parse(Buffer.from(data.result.result).toString()) as { owner: string } | null;
  return seat?.owner ?? null;
}
const may = (p: Principal, accountId: string) => p.admin || p.accountId === accountId;
const nameOf = (p: Principal) => (p.admin ? "admin" : p.accountId);

const body = async (req: IncomingMessage) => {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new Error("body too large");
  }
  return raw ? JSON.parse(raw) : {};
};
const isAccount = (s: unknown): s is string =>
  typeof s === "string" && /^[a-z0-9._-]{2,64}$/.test(s);

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const send = (code: number, data: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  // Seat keys: "9" (v1) or "v2-3" (v2).
  const m = url.pathname.match(/^\/jobs\/((?:v2-)?\d+)(\/run|\/pause|\/act)?$/);
  if (req.method === "GET" && url.pathname === "/health")
    return send(200, { agents: AGENTS, agents_v2: AGENTS_V2 ?? null, tick_seconds: TICK, auth: "nep413" });

  if (req.method === "POST" && url.pathname === "/auth/challenge") {
    const { accountId } = await body(req);
    if (!isAccount(accountId)) return send(400, { error: "accountId required" });
    return send(200, auth.challenge(accountId));
  }
  if (req.method === "POST" && url.pathname === "/auth/session") {
    const b = await body(req);
    if (typeof b.nonce !== "string" || !isAccount(b.accountId) || typeof b.publicKey !== "string" || typeof b.signature !== "string")
      return send(400, { error: "nonce, accountId, publicKey and signature required" });
    return send(200, await auth.session(b.nonce, { accountId: b.accountId, publicKey: b.publicKey, signature: b.signature }));
  }

  const who = auth.principal(req.headers.authorization);
  if (!who) return send(401, { error: "sign in to the runner first", code: "auth" });
  if (req.method === "GET" && url.pathname === "/auth/me") return send(200, who);
  if (req.method === "POST" && url.pathname === "/auth/logout") {
    await auth.logout(req.headers.authorization);
    return send(200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/keys") {
    const { accountId } = await body(req);
    if (!isAccount(accountId)) return send(400, { error: "accountId required" });
    if (!may(who, accountId)) return send(403, { error: `signed in as ${nameOf(who)}, not ${accountId}` });
    return send(200, { publicKey: await runner.createKey(accountId) });
  }
  if (req.method === "GET" && url.pathname === "/jobs") {
    const scope = who.admin ? url.searchParams.get("accountId") : who.accountId;
    const jobs = await store.jobs();
    return send(200, scope ? jobs.filter((j) => j.accountId === scope) : jobs);
  }
  if (m && req.method === "PUT" && !m[2]) {
    const b = await body(req);
    if (!isAccount(b.accountId) || !may(who, b.accountId))
      return send(403, { error: `signed in as ${nameOf(who)}: you can only save jobs for your own account` });
    const known = (await store.keys()).some(
      (k) => k.accountId === b.accountId && k.publicKey === b.publicKey,
    );
    if (!known) return send(400, { error: "unknown agent key; POST /keys first" });
    if (b.kind !== "Buyer" && b.kind !== "Payer") return send(400, { error: "kind must be Buyer or Payer" });
    const prev = (await store.jobs()).find((j) => j.seatId === m[1]);
    // Replacing another account's job is fine only for the seat's owner on chain (after a transfer + claim).
    if (prev && prev.accountId !== b.accountId && !who.admin && (await seatOwner(m[1])) !== b.accountId)
      return send(403, { error: "this agent belongs to another account" });
    const job: Job = {
      seatId: m[1],
      accountId: b.accountId,
      publicKey: b.publicKey,
      kind: b.kind,
      role: typeof b.role === "string" ? b.role.slice(0, 32) : prev?.role,
      name: typeof b.name === "string" ? b.name.slice(0, 48) : prev?.name,
      buyer: b.kind === "Buyer" ? b.buyer : undefined,
      payer: b.kind === "Payer" ? b.payer : undefined,
      lastPaid: prev?.lastPaid,
    };
    await store.saveJob(job);
    return send(200, job);
  }
  if (m && req.method === "DELETE" && !m[2]) {
    const job = (await store.jobs()).find((j) => j.seatId === m[1]);
    if (job && !may(who, job.accountId) && (await seatOwner(m[1])) !== nameOf(who))
      return send(403, { error: "this agent belongs to another account" });
    await store.deleteJob(m[1]);
    return send(200, { deleted: m[1] });
  }
  if (m && req.method === "POST" && m[2]) {
    const job = (await store.jobs()).find((j) => j.seatId === m[1]);
    if (!job) return send(404, { error: "no job for this seat" });
    if (!may(who, job.accountId)) return send(403, { error: "this agent belongs to another account" });
    if (m[2] === "/pause") return send(200, { tx: await runner.pause(job) });
    if (m[2] === "/act") {
      const a = await body(req);
      if (a.action === "buy" && job.kind === "Buyer")
        return send(200, await runner.buyNow(job, String(a.token_id), String(a.listing_id), String(a.price)));
      if (a.action === "pay" && job.kind === "Payer" && isAccount(a.payee))
        return send(200, await runner.payNow(job, a.payee, String(a.amount), a.memo ? String(a.memo) : undefined));
      return send(400, { error: "action does not match this agent" });
    }
    return send(200, { result: await runner.runJob(job) });
  }
  send(404, { error: "not found" });
}

createServer(async (req, res) => {
  const deny = (error: string) => {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error }));
  };
  // DNS rebinding: a page on evil.example resolving to 127.0.0.1 still sends its own Host.
  if (!HOSTS.includes(req.headers.host ?? "")) return deny("unknown host");
  const origin = req.headers.origin;
  if (origin && !ORIGINS.includes(origin)) return deny("origin not allowed"); // other sites: no CORS, no side effects
  if (origin) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type,authorization");
  }
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  try {
    await route(req, res);
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: (e as Error).message, ...(status === 401 ? { code: "auth" } : {}) }));
  }
}).listen(PORT, "127.0.0.1", () =>
  console.log(`Agent runner on http://127.0.0.1:${PORT} · contracts ${AGENTS}${AGENTS_V2 ? ` + ${AGENTS_V2}` : ""} · tick ${TICK}s`),
);

let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await runner.tick();
  } finally {
    running = false;
  }
}, TICK * 1000);
