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
 * HTTP API (JSON), used by the Agent Dock:
 *   GET    /health
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

const DIR = process.env.AGENTS_RUNNER_DIR || join(homedir(), ".everkeep-agents");
const PORT = Number(process.env.AGENTS_RUNNER_PORT || 8788);
const TICK = Number(process.env.AGENTS_RUNNER_TICK || 20);
const RPC = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"];

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
const store = new FileStore();
const runner = new Runner({ rpc: RPC, agents: AGENTS, store });

if (process.argv.includes("--once")) {
  console.log(JSON.stringify(await runner.tick(), null, 2));
  process.exit(0);
}

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
  const m = url.pathname.match(/^\/jobs\/(\d+)(\/run|\/pause|\/act)?$/);
  if (req.method === "GET" && url.pathname === "/health")
    return send(200, { agents: AGENTS, rpc: RPC, tick_seconds: TICK, jobs: (await store.jobs()).length });
  if (req.method === "POST" && url.pathname === "/keys") {
    const { accountId } = await body(req);
    if (!isAccount(accountId)) return send(400, { error: "accountId required" });
    return send(200, { publicKey: await runner.createKey(accountId) });
  }
  if (req.method === "GET" && url.pathname === "/jobs") {
    const who = url.searchParams.get("accountId");
    const jobs = await store.jobs();
    return send(200, who ? jobs.filter((j) => j.accountId === who) : jobs);
  }
  if (m && req.method === "PUT" && !m[2]) {
    const b = await body(req);
    const known = (await store.keys()).some(
      (k) => k.accountId === b.accountId && k.publicKey === b.publicKey,
    );
    if (!known) return send(400, { error: "unknown agent key; POST /keys first" });
    if (b.kind !== "Buyer" && b.kind !== "Payer") return send(400, { error: "kind must be Buyer or Payer" });
    const prev = (await store.jobs()).find((j) => j.seatId === m[1]);
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
    await store.deleteJob(m[1]);
    return send(200, { deleted: m[1] });
  }
  if (m && req.method === "POST" && m[2]) {
    const job = (await store.jobs()).find((j) => j.seatId === m[1]);
    if (!job) return send(404, { error: "no job for this seat" });
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
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
  }
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  try {
    await route(req, res);
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
}).listen(PORT, "127.0.0.1", () =>
  console.log(`Agent runner on http://127.0.0.1:${PORT} · contract ${AGENTS} · tick ${TICK}s`),
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
