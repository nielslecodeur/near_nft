/**
 * Proof that the agent runner obeys only its owner (scripts/runner-auth.ts).
 *
 * Starts a second runner on port 8799 with a throwaway data folder, seeds two
 * accounts' jobs, then tries what an attacker would: no token, another site's
 * page, DNS rebinding, a replayed or tampered signature, an agent's
 * function-call key, another account's agents. Real NEP-413 signatures by the
 * demo account; the FullAccess check runs against testnet. Signs no transaction.
 *
 *   npx tsx scripts/runner-auth-proof.ts
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KeyPair } from "near-api-js";
import { nep413Bytes } from "../src/keepers/nep413.js";
import { credentialDirectory, testnetCredential } from "./testnet-credentials.js";

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const { credential } = await testnetCredential();
const DEMO = `demo-agent.${credential.account_id}`;
const OTHER = "nifelst.testnet";
const demoFull = JSON.parse(await readFile(join(credentialDirectory, `${DEMO}.json`), "utf8"));
const demoAgentKey = JSON.parse(await readFile("demo/agent-key.json", "utf8")); // function-call key, public on purpose

// Throwaway runner data: jobs for two accounts, on seats they own on chain (#1 = OTHER, #11 = DEMO after the
// transfer test), plus a job OTHER left on #11 before handing the NFT over.
const dir = await mkdtemp(join(tmpdir(), "runner-auth-"));
const tokenFile = join(dir, "runner-token");
const demoJobKey = KeyPair.fromRandom("ed25519").getPublicKey().toString();
await writeFile(
  join(dir, "keys.json"),
  JSON.stringify([
    { accountId: DEMO, publicKey: demoJobKey, secretKey: "ed25519:unused", createdAt: "" },
    { accountId: OTHER, publicKey: "ed25519:other", secretKey: "ed25519:unused", createdAt: "" },
  ]),
);
await writeFile(
  join(dir, "jobs.json"),
  JSON.stringify([
    { seatId: "1", accountId: OTHER, publicKey: "ed25519:other", kind: "Payer", payer: { payments: [] } },
    { seatId: "11", accountId: OTHER, publicKey: "ed25519:other", kind: "Payer", payer: { payments: [] } },
  ]),
);

const child = spawn("npx", ["--no-install", "tsx", "scripts/agent-runner.ts"], {
  env: { ...process.env, AGENTS_RUNNER_PORT: String(PORT), AGENTS_RUNNER_DIR: dir, AGENTS_RUNNER_TOKEN_FILE: tokenFile, AGENTS_RUNNER_TICK: "3600" },
  stdio: ["ignore", "pipe", "inherit"],
  // Its own process group, so the whole npx -> tsx -> node chain stops at the end.
  detached: true,
});
const stopRunner = () => {
  try {
    process.kill(-child.pid!, "SIGTERM");
  } catch {
    child.kill();
  }
};
await new Promise<void>((ok, fail) => {
  const t = setTimeout(() => fail(new Error("runner did not start")), 60_000);
  child.stdout!.on("data", (d) => String(d).includes("Agent runner on") && (clearTimeout(t), ok()));
});

let passed = 0;
const failed: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failed.push(name);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
type Res = { status: number; body: any; headers: Record<string, string | string[] | undefined> };
const http = (method: string, path: string, opts: { token?: string; body?: unknown; host?: string; origin?: string } = {}) =>
  new Promise<Res>((ok, fail) => {
    const headers: Record<string, string> = { "content-type": "application/json", host: opts.host ?? `127.0.0.1:${PORT}` };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.origin) headers.origin = opts.origin;
    const req = request(`${BASE}${path}`, { method, headers }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => ok({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : null, headers: res.headers }));
    });
    req.on("error", fail);
    if (opts.body !== undefined) req.write(JSON.stringify(opts.body));
    req.end();
  });

/** Signs the runner's challenge like a NEP-413 wallet does. */
function sign(c: { nonce: string; message: string; recipient: string }, secret: string, accountId: string) {
  const kp = KeyPair.fromString(secret as `ed25519:${string}`);
  const hash = createHash("sha256").update(nep413Bytes({ message: c.message, recipient: c.recipient, nonce: Buffer.from(c.nonce, "base64") })).digest();
  return { nonce: c.nonce, accountId, publicKey: kp.getPublicKey().toString(), signature: Buffer.from(kp.sign(hash).signature).toString("base64") };
}
const challenge = async (accountId: string) => (await http("POST", "/auth/challenge", { body: { accountId } })).body;

try {
  check("health is open", (await http("GET", "/health")).status === 200);
  check("no token: jobs refused", (await http("GET", "/jobs")).status === 401);
  check("no token: act refused", (await http("POST", "/jobs/1/act", { body: { action: "pay", payee: OTHER, amount: "1" } })).status === 401);
  check("DNS rebinding (foreign Host) refused", (await http("GET", "/health", { host: "evil.example:8799" })).status === 403);
  const evil = await http("POST", "/auth/challenge", { origin: "https://evil.example", body: { accountId: DEMO } });
  check("another site's page refused, no CORS", evil.status === 403 && !evil.headers["access-control-allow-origin"]);
  const okOrigin = await http("GET", "/health", { origin: "http://127.0.0.1:5173" });
  check("Agent Wallet origin gets CORS", okOrigin.headers["access-control-allow-origin"] === "http://127.0.0.1:5173");

  // Sign in as the demo account with its full-access key.
  const c1 = await challenge(DEMO);
  check("challenge message names the account", typeof c1.message === "string" && c1.message.includes(DEMO), c1.message);
  const s1 = await http("POST", "/auth/session", { body: sign(c1, demoFull.private_key, DEMO) });
  check("full-access signature gives a session", s1.status === 200 && /^[0-9a-f]{64}$/.test(s1.body.token), `status ${s1.status}`);
  const token = s1.body.token as string;
  check("replayed signature refused", (await http("POST", "/auth/session", { body: sign(c1, demoFull.private_key, DEMO) })).status === 401);

  const c2 = await challenge(DEMO);
  const tampered = sign(c2, demoFull.private_key, DEMO);
  tampered.signature = Buffer.from(Buffer.from(tampered.signature, "base64").map((b, i) => (i === 0 ? b ^ 1 : b))).toString("base64");
  const t2 = await http("POST", "/auth/session", { body: tampered });
  check("tampered signature refused", t2.status === 401, t2.body?.error);

  const c3 = await challenge(DEMO);
  const fc = await http("POST", "/auth/session", { body: sign(c3, demoAgentKey.secret_key, DEMO) });
  check("agent function-call key cannot sign in", fc.status === 401 && /full-access/.test(fc.body?.error), fc.body?.error);

  const c4 = await challenge(OTHER);
  const wrong = await http("POST", "/auth/session", { body: sign(c4, demoFull.private_key, DEMO) });
  check("challenge for another account refused", wrong.status === 401, wrong.body?.error);

  // Scoping with the demo session.
  const me = await http("GET", "/auth/me", { token });
  check("session is bound to the account", me.body?.accountId === DEMO);
  const mine = await http("GET", `/jobs?accountId=${OTHER}`, { token });
  check("sees only its own jobs, even when asking for another account", mine.status === 200 && mine.body.length === 0, `${mine.body?.length} jobs`);
  check("cannot act for another account's agent", (await http("POST", "/jobs/1/act", { token, body: { action: "pay", payee: OTHER, amount: "1" } })).status === 403);
  check("cannot run another account's agent", (await http("POST", "/jobs/1/run", { token })).status === 403);
  check("cannot pause another account's agent via the runner", (await http("POST", "/jobs/1/pause", { token })).status === 403);
  check("cannot delete another account's job", (await http("DELETE", "/jobs/1", { token })).status === 403);
  check("cannot create keys for another account", (await http("POST", "/keys", { token, body: { accountId: OTHER } })).status === 403);
  const steal = await http("PUT", "/jobs/1", { token, body: { accountId: DEMO, publicKey: demoJobKey, kind: "Payer", payer: { payments: [] } } });
  check("cannot take over a job on a seat it does not own", steal.status === 403, steal.body?.error);
  const takeover = await http("PUT", "/jobs/11", { token, body: { accountId: DEMO, publicKey: demoJobKey, kind: "Payer", payer: { payments: [] } } });
  check("CAN replace the old owner's job on a seat it now owns on chain (#11)", takeover.status === 200, takeover.body?.error);

  // Local tools: the admin token file.
  const admin = (await readFile(tokenFile, "utf8")).trim();
  const all = await http("GET", "/jobs", { token: admin });
  check("admin token (MCP) sees every job", all.status === 200 && all.body.length === 2, `${all.body?.length} jobs`);
  check("a made-up token is refused", (await http("GET", "/jobs", { token: "ab".repeat(32) })).status === 401);

  await http("POST", "/auth/logout", { token });
  check("logged-out session refused", (await http("GET", "/jobs", { token })).status === 401);
} finally {
  stopRunner();
}
console.log(`\n${passed} passed, ${failed.length} failed${failed.length ? ": " + failed.join("; ") : ""}`);
process.exit(failed.length ? 1 : 0);
