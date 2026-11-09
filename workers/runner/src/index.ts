/**
 * Agent Wallet runner, hosted on Cloudflare Workers (free plan).
 *
 * Same HTTP API and same missions as the local runner (scripts/agent-runner.ts,
 * scripts/runner-logic.ts), so the app and the MCP server talk to either:
 *   - fetch: /health, /auth/* (NEP-413 sign-in), /keys, /jobs (one account's agents per session)
 *   - scheduled (every minute): runs every job once
 * Storage is D1; agent secret keys are encrypted with AES-GCM under SECRETS_KEY
 * (a Worker secret). Each agent key can only call agent_pay / agent_buy / pause
 * with no deposit, inside the limits the agents contract enforces.
 * Secrets: SECRETS_KEY (32 bytes, base64), ADMIN_TOKEN (64 hex, for local tools).
 */
import { RunnerLogic, type Job, type Store, type StoredKey } from "../../../scripts/runner-logic.js";
import { verifySignature } from "../../../src/keepers/nep413.js";
import { WorkerChain, fromBase64, toBase64 } from "./near.js";

type Env = {
  DB: D1Database;
  AGENTS: string;
  AGENTS_V2: string;
  ORIGINS: string;
  RPC_NODES: string;
  SECRETS_KEY: string;
  ADMIN_TOKEN: string;
};

const RECIPIENT = "agent-wallet-runner";
const CHALLENGE_MS = 5 * 60_000;
const SESSION_MS = 12 * 3600_000;

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (text: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const isAccount = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9._-]{2,64}$/.test(s);

// ---------------------------------------------------------------- D1 store, secrets encrypted
class D1Store implements Store {
  private aes?: CryptoKey;
  constructor(private env: Env) {}
  private async key() {
    this.aes ??= await crypto.subtle.importKey("raw", fromBase64(this.env.SECRETS_KEY), "AES-GCM", false, ["encrypt", "decrypt"]);
    return this.aes;
  }
  private async seal(text: string) {
    const iv = random(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await this.key(), new TextEncoder().encode(text)));
    return `${toBase64(iv)}.${toBase64(ct)}`;
  }
  private async open(sealed: string) {
    const [iv, ct] = sealed.split(".");
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await this.key(), fromBase64(ct)));
  }
  async keys(): Promise<StoredKey[]> {
    const { results } = await this.env.DB.prepare("SELECT public_key, account, secret_enc, created_at FROM keys").all<{
      public_key: string; account: string; secret_enc: string; created_at: string;
    }>();
    return Promise.all(results.map(async (r) => ({ accountId: r.account, publicKey: r.public_key, secretKey: await this.open(r.secret_enc), createdAt: r.created_at })));
  }
  async hasKey(accountId: string, publicKey: string) {
    return !!(await this.env.DB.prepare("SELECT 1 FROM keys WHERE account = ? AND public_key = ?").bind(accountId, publicKey).first());
  }
  async saveKey(k: StoredKey) {
    await this.env.DB.prepare("INSERT INTO keys (public_key, account, secret_enc, created_at) VALUES (?, ?, ?, ?)")
      .bind(k.publicKey, k.accountId, await this.seal(k.secretKey), k.createdAt)
      .run();
  }
  async jobs(): Promise<Job[]> {
    const { results } = await this.env.DB.prepare("SELECT json FROM jobs").all<{ json: string }>();
    return results.map((r) => JSON.parse(r.json));
  }
  async saveJob(j: Job) {
    await this.env.DB.prepare("INSERT INTO jobs (seat_key, account, json) VALUES (?, ?, ?) ON CONFLICT(seat_key) DO UPDATE SET account = excluded.account, json = excluded.json")
      .bind(j.seatId, j.accountId, JSON.stringify(j))
      .run();
  }
  async deleteJob(seatId: string) {
    await this.env.DB.prepare("DELETE FROM jobs WHERE seat_key = ?").bind(seatId).run();
  }
}

function setup(env: Env) {
  const chain = new WorkerChain(env.RPC_NODES.split(",").map((s) => s.trim()).filter(Boolean));
  const store = new D1Store(env);
  const runner = new RunnerLogic({ agents: env.AGENTS, agentsV2: env.AGENTS_V2, store, chain, log: (l) => console.log(l) });
  return { chain, store, runner };
}

// ---------------------------------------------------------------- auth
type Principal = { admin: true } | { admin: false; accountId: string };

async function principal(env: Env, header: string | null): Promise<Principal | null> {
  const m = header?.match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) return null;
  const h = await sha(m[1]);
  if (env.ADMIN_TOKEN && h === (await sha(env.ADMIN_TOKEN))) return { admin: true };
  const s = await env.DB.prepare("SELECT account FROM sessions WHERE hash = ? AND expires > ?").bind(h, Date.now()).first<{ account: string }>();
  return s ? { admin: false, accountId: s.account } : null;
}

function challengeMessage(accountId: string, issuedAt: number) {
  return `Agent Wallet: let the hosted agent runner manage the agents of ${accountId}. Issued ${new Date(issuedAt).toISOString()}. This is not a transaction.`;
}

// ---------------------------------------------------------------- HTTP
async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const send = (code: number, data: unknown) => Response.json(data, { status: code });
  const body = async () => (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { chain, store, runner } = setup(env);
  const m = url.pathname.match(/^\/jobs\/((?:v2-)?\d+)(\/run|\/pause|\/act)?$/);

  if (req.method === "GET" && url.pathname === "/health")
    return send(200, { agents: env.AGENTS, agents_v2: env.AGENTS_V2, tick_seconds: 60, auth: "nep413", hosted: true });

  if (req.method === "POST" && url.pathname === "/auth/challenge") {
    const { accountId } = await body();
    if (!isAccount(accountId)) return send(400, { error: "accountId required" });
    const nonce = toBase64(random(32));
    const now = Date.now();
    const message = challengeMessage(accountId, now);
    await env.DB.prepare("DELETE FROM challenges WHERE expires < ?").bind(now).run();
    await env.DB.prepare("INSERT INTO challenges (nonce, account, message, expires) VALUES (?, ?, ?, ?)").bind(nonce, accountId, message, now + CHALLENGE_MS).run();
    return send(200, { nonce, message, recipient: RECIPIENT });
  }
  if (req.method === "POST" && url.pathname === "/auth/session") {
    const b = await body();
    if (typeof b.nonce !== "string" || !isAccount(b.accountId) || typeof b.publicKey !== "string" || typeof b.signature !== "string")
      return send(400, { error: "nonce, accountId, publicKey and signature required" });
    const c = await env.DB.prepare("SELECT account, message, expires FROM challenges WHERE nonce = ?").bind(b.nonce).first<{ account: string; message: string; expires: number }>();
    await env.DB.prepare("DELETE FROM challenges WHERE nonce = ?").bind(b.nonce).run(); // single use
    const refuse = (error: string) => send(401, { error, code: "auth" });
    if (!c || c.expires < Date.now()) return refuse("sign-in expired: ask for a new challenge");
    if (b.accountId !== c.account) return refuse("signed for a different account");
    const ok = await verifySignature(
      { accountId: b.accountId, publicKey: b.publicKey, signature: b.signature },
      { message: c.message, recipient: RECIPIENT, nonce: fromBase64(b.nonce) },
    ).catch(() => false);
    if (!ok) return refuse("the signature does not match the message");
    const access = await chain
      .rpc<{ permission?: unknown }>("query", { request_type: "view_access_key", account_id: c.account, public_key: b.publicKey, finality: "final" })
      .catch(() => null);
    if (access?.permission !== "FullAccess") return refuse("the signing key is not a full-access key of this account");
    const token = hex(random(32));
    const expiresAt = Date.now() + SESSION_MS;
    await env.DB.prepare("INSERT INTO sessions (hash, account, expires) VALUES (?, ?, ?)").bind(await sha(token), c.account, expiresAt).run();
    return send(200, { token, accountId: c.account, expiresAt });
  }

  const who = await principal(env, req.headers.get("authorization"));
  if (!who) return send(401, { error: "sign in to the runner first", code: "auth" });
  const may = (accountId: string) => who.admin || who.accountId === accountId;
  const seatOwner = async (key: string) => {
    const t = runner.target({ seatId: key });
    return (await chain.view<{ owner: string } | null>(t.contract, "seat", { seat_id: t.id }))?.owner ?? null;
  };

  if (req.method === "GET" && url.pathname === "/auth/me") return send(200, who);
  if (req.method === "POST" && url.pathname === "/auth/logout") {
    const t = req.headers.get("authorization")!.slice(7);
    await env.DB.prepare("DELETE FROM sessions WHERE hash = ?").bind(await sha(t)).run();
    return send(200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/keys") {
    const { accountId } = await body();
    if (!isAccount(accountId)) return send(400, { error: "accountId required" });
    if (!may(accountId)) return send(403, { error: `signed in as ${who.admin ? "admin" : who.accountId}, not ${accountId}` });
    return send(200, { publicKey: await runner.createKey(accountId) });
  }
  if (req.method === "GET" && url.pathname === "/jobs") {
    const scope = who.admin ? url.searchParams.get("accountId") : who.accountId;
    const jobs = await store.jobs();
    return send(200, scope ? jobs.filter((j) => j.accountId === scope) : jobs);
  }
  if (m && req.method === "PUT" && !m[2]) {
    const b = await body();
    if (!isAccount(b.accountId) || !may(b.accountId)) return send(403, { error: "you can only save jobs for your own account" });
    if (typeof b.publicKey !== "string" || !(await store.hasKey(b.accountId, b.publicKey))) return send(400, { error: "unknown agent key; POST /keys first" });
    if (b.kind !== "Buyer" && b.kind !== "Payer") return send(400, { error: "kind must be Buyer or Payer" });
    const prev = (await store.jobs()).find((j) => j.seatId === m[1]);
    if (prev && prev.accountId !== b.accountId && !who.admin && (await seatOwner(m[1])) !== b.accountId)
      return send(403, { error: "this agent belongs to another account" });
    const job: Job = {
      seatId: m[1],
      accountId: b.accountId,
      publicKey: b.publicKey,
      kind: b.kind,
      role: typeof b.role === "string" ? b.role.slice(0, 32) : prev?.role,
      name: typeof b.name === "string" ? b.name.slice(0, 48) : prev?.name,
      buyer: b.kind === "Buyer" ? (b.buyer as Job["buyer"]) : undefined,
      payer: b.kind === "Payer" ? (b.payer as Job["payer"]) : undefined,
      lastPaid: prev?.lastPaid,
    };
    await store.saveJob(job);
    return send(200, job);
  }
  if (m && req.method === "DELETE" && !m[2]) {
    const job = (await store.jobs()).find((j) => j.seatId === m[1]);
    if (job && !may(job.accountId) && (await seatOwner(m[1])) !== (who.admin ? "" : who.accountId))
      return send(403, { error: "this agent belongs to another account" });
    await store.deleteJob(m[1]);
    return send(200, { deleted: m[1] });
  }
  if (m && req.method === "POST" && m[2]) {
    const job = (await store.jobs()).find((j) => j.seatId === m[1]);
    if (!job) return send(404, { error: "no job for this seat" });
    if (!may(job.accountId)) return send(403, { error: "this agent belongs to another account" });
    if (m[2] === "/pause") return send(200, { tx: await runner.pause(job) });
    if (m[2] === "/act") {
      const a = await body();
      if (a.action === "buy" && job.kind === "Buyer")
        return send(200, await runner.buyNow(job, String(a.token_id), String(a.listing_id), String(a.price)));
      if (a.action === "pay" && job.kind === "Payer" && isAccount(a.payee))
        return send(200, await runner.payNow(job, a.payee, String(a.amount), a.memo ? String(a.memo) : undefined));
      return send(400, { error: "action does not match this agent" });
    }
    return send(200, { result: await runner.runJob(job) });
  }
  return send(404, { error: "not found" });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origins = env.ORIGINS.split(",").map((s) => s.trim());
    const origin = req.headers.get("origin");
    if (origin && !origins.includes(origin)) return Response.json({ error: "origin not allowed" }, { status: 403 });
    const cors: Record<string, string> = origin
      ? {
          "access-control-allow-origin": origin,
          vary: "origin",
          "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
          "access-control-allow-headers": "content-type,authorization",
        }
      : {};
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    let res: Response;
    try {
      res = await route(req, env);
    } catch (e) {
      res = Response.json({ error: (e as Error).message }, { status: 500 });
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const { runner } = setup(env);
    ctx.waitUntil(
      (async () => {
        await env.DB.prepare("DELETE FROM sessions WHERE expires < ?").bind(Date.now()).run();
        const out = await runner.tick();
        console.log(JSON.stringify(out));
      })(),
    );
  },
};
