/**
 * The hosted runner (Cloudflare Worker, workers/runner) acting on NEAR testnet.
 *
 *   RUNNER_URL=http://127.0.0.1:8787 npx tsx scripts/hosted-runner-proof.ts   # wrangler dev (local D1)
 *   RUNNER_URL=https://<worker>.workers.dev RUNNER_ADMIN_TOKEN=... npx tsx scripts/hosted-runner-proof.ts
 *
 * The demo account hires an Allowance on agents v2 whose key is made BY THE
 * WORKER (only the public key leaves it), funds it with 0.3 USDC, and the
 * Worker's scheduled tick pays 0.1 USDC back to it, signed with WebCrypto.
 * Then a 0.2 USDC payment over the cap is sent through the Worker: refused.
 * SEAT_KEY=v2-6 checks an agent already hired by an earlier run instead of hiring a new one.
 * A freshly deployed Worker's cron can take a few minutes to start: the wait is 6 minutes.
 */
import { Account, JsonRpcProvider, KeyPairSigner, PublicKey, actions } from "near-api-js";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { credentialDirectory, testnetCredential } from "./testnet-credentials.js";

const N = 10n ** 24n;
const TGAS = 10n ** 12n;
const U = 1_000_000n;
const RUNNER = process.env.RUNNER_URL || "http://127.0.0.1:8787";
const local = /127\.0\.0\.1|localhost/.test(RUNNER);
const ADMIN =
  process.env.RUNNER_ADMIN_TOKEN ||
  (await readFile("workers/runner/.dev.vars", "utf8").then((t) => /ADMIN_TOKEN=([0-9a-f]{64})/.exec(t)?.[1] ?? ""));
const pub = JSON.parse(await readFile("public/testnet.json", "utf8"));
const AGENTS: string = pub.agents_v2.contract;
const USDC: string = pub.agents_v2.usdc;
const NFT = "nft.examples.testnet";
const ART = "https://raw.githubusercontent.com/nielslecodeur/near_nft/keepers/public/nft-art";

const provider = new JsonRpcProvider({ url: process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com" });
const { credential } = await testnetCredential();
const deployer = new Account(credential.account_id, provider, KeyPairSigner.fromSecretKey(credential.private_key as `ed25519:${string}`));
const DEMO = `demo-agent.${credential.account_id}`;
const demo = new Account(DEMO, provider, KeyPairSigner.fromSecretKey(JSON.parse(await readFile(join(credentialDirectory, `${DEMO}.json`), "utf8")).private_key));

const runner = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const r = await fetch(RUNNER + path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN}` } });
  const d = await r.json();
  if (!r.ok) throw new Error(`${path}: ${JSON.stringify(d)}`);
  return d as T;
};
const view = async <T>(method: string, args: object): Promise<T> => {
  const r = (await provider.query({ request_type: "call_function", account_id: AGENTS, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64"), finality: "optimistic" } as never)) as unknown as { result: number[] };
  return JSON.parse(Buffer.from(r.result).toString());
};
const txs: Record<string, string> = {};
async function call(who: Account, receiver: string, method: string, args: object, deposit: bigint, tgas: bigint, label: string) {
  const r = await who.signAndSendTransaction({ receiverId: receiver, actions: [actions.functionCall(method, args, tgas * TGAS, deposit)], waitUntil: "FINAL", throwOnFailure: true });
  txs[label] = r.transaction.hash;
  const s = r.status as { SuccessValue?: string };
  const text = s.SuccessValue ? Buffer.from(s.SuccessValue, "base64").toString() : "";
  return text ? JSON.parse(text) : null;
}
const checks: string[] = [];
const pass = (n: string) => (checks.push(n), console.log("✓", n));
type LogEntry = { action: string; status: string; amount: string; detail: string };

assert.ok(ADMIN, "admin token: RUNNER_ADMIN_TOKEN or workers/runner/.dev.vars");
const health = await runner<{ hosted?: boolean; agents_v2: string }>("/health");
assert.equal(health.agents_v2, AGENTS);
pass(`runner up at ${RUNNER} (hosted: ${!!health.hosted})`);

const reuse = process.env.SEAT_KEY;
let key: string;
let num: string;
if (reuse) {
  key = reuse;
  num = reuse.replace(/^v2-/, "");
  const job = (await runner<{ seatId: string; publicKey: string }[]>(`/jobs?accountId=${DEMO}`)).find((j) => j.seatId === key);
  assert.ok(job, `the runner has a job for ${key}`);
  pass(`checking ${key}, hired by an earlier run with the runner's key ${job!.publicKey.slice(0, 20)}…`);
} else {
// 1. The Worker makes the agent key; only its public key comes back.
const { publicKey } = await runner<{ publicKey: string }>("/keys", { method: "POST", body: JSON.stringify({ accountId: DEMO }) });
assert.match(publicKey, /^ed25519:/);
pass(`the runner made an agent key for ${DEMO}: ${publicKey.slice(0, 20)}…`);

// 2. The demo account hires an Allowance on v2 with that key, funded with 0.3 USDC.
const tokenId = `character-angel-hosted-${Date.now()}`;
await call(deployer, NFT, "nft_mint", { token_id: tokenId, receiver_id: DEMO, metadata: { title: "Angel", description: "Characters: paid by the hosted runner.", media: `${ART}/angel.webp`, copies: 1 } }, N / 10n, 100n, "mint");
const policy = { per_tx_max: (U / 10n).toString(), per_day_max: ((3n * U) / 10n).toString(), payees: [DEMO], market: null };
const profile = { name: "Hosted runner check", role: "allowance", tool: "runner", avatar: null, manifest: null };
num = await call(demo, AGENTS, "create_seat", { nft_contract: NFT, token_id: tokenId, kind: "Payer", policy, profile }, N / 10n, 150n, "create_seat");
key = `v2-${num}`;
await call(demo, USDC, "ft_transfer_call", { receiver_id: AGENTS, amount: ((3n * U) / 10n).toString(), msg: JSON.stringify({ seat_id: num }) }, 1n, 100n, "fund");
const added = await demo.signAndSendTransaction({ receiverId: DEMO, actions: [actions.addFunctionCallAccessKey(PublicKey.fromString(publicKey), AGENTS, ["agent_pay", "agent_buy", "pause"], N)], waitUntil: "FINAL", throwOnFailure: true });
txs.add_key = added.transaction.hash;
await call(demo, AGENTS, "set_agent_key", { seat_id: num, public_key: publicKey }, 1n, 30n, "set_agent_key");
pass(`seat ${key} hired by ${DEMO}: 0.1 USDC per payment, 0.3 a day, 0.3 USDC budget, the runner's key on it`);

// 3. The mission, then the scheduled tick pays on its own.
await runner(`/jobs/${key}`, {
  method: "PUT",
  body: JSON.stringify({ accountId: DEMO, publicKey, kind: "Payer", role: "allowance", name: "Hosted runner check", payer: { payments: [{ payee: DEMO, amount: (U / 10n).toString(), everySeconds: 3600, memo: "hosted runner" }] } }),
});
}
if (local) await fetch(`${RUNNER}/__scheduled?cron=*+*+*+*+*`);
let paid: LogEntry | undefined;
for (let i = 0; i < 72 && !paid; i++) {
  paid = (await view<LogEntry[]>("seat_log", { seat_id: num })).find((e) => e.action === "pay" && e.status === "done");
  if (!paid) await new Promise((r) => setTimeout(r, 5000));
}
assert.ok(paid, "the tick paid within the wait");
assert.equal(paid!.amount, (U / 10n).toString());
const job = (await runner<{ seatId: string; lastResult?: string }[]>(`/jobs?accountId=${DEMO}`)).find((j) => j.seatId === key);
pass(`the ${local ? "triggered" : "cron"} tick paid 0.1 USDC by itself, signed in the Worker: ${job?.lastResult ?? ""}`);

// 4. An action over the cap through the Worker: the contract refuses and logs it.
const over = await runner<{ ok: boolean; tx: string }>(`/jobs/${key}/act`, { method: "POST", body: JSON.stringify({ action: "pay", payee: DEMO, amount: ((2n * U) / 10n).toString(), memo: "over the cap" }) });
assert.equal(over.ok, false);
const top = (await view<LogEntry[]>("seat_log", { seat_id: num }))[0];
assert.equal(top.detail, "over the per-action cap");
pass(`0.2 USDC through the Worker is refused on chain (over the per-action cap), tx ${over.tx}`);

const out = { at: new Date().toISOString(), runner: RUNNER, contract: AGENTS, seat_key: key, checks, transactions: txs };
await mkdir("docs/results", { recursive: true });
const file = local ? "docs/results/hosted-runner-local-proof.json" : "docs/results/hosted-runner-proof.json";
await writeFile(file, JSON.stringify(out, null, 2) + "\n");
console.log(`\n${checks.length} checks passed → ${file}`);
