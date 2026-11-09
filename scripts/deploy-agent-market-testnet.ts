/**
 * Deploys artifacts/agent_market.wasm (sell an agent with its NFT) to
 * agent-market-v1.<deployer> on NEAR testnet, bound to the agents v2 contract.
 * Keyless: created, funded, deployed and initialised in one transaction with no
 * access key, so the code can never change.
 *   npx tsx scripts/deploy-agent-market-testnet.ts [--execute]
 * Default is a read-only dry run; pass --execute to deploy. Records the result
 * in public/testnet.json ("agent_market").
 */
import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { testnetCredential } from "./testnet-credentials.js";

const N = 10n ** 24n;
// Code storage (~198 KB ≈ 1.98 NEAR) plus room for 200 listings and the history.
const FUNDING = 27n * 10n ** 23n; // 2.7 NEAR
const execute = process.argv.includes("--execute");
const endpoint = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const { credential } = await testnetCredential();
const parent = credential.account_id;
const id = `agent-market-v1.${parent}`;
const pub = JSON.parse(await readFile("public/testnet.json", "utf8"));
const AGENTS: string = pub.agents_v2.contract;

const rpc = async (method: string, params: object) => {
  const r = await (await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "m", method, params }) })).json();
  if (r.error) throw Error(JSON.stringify(r.error));
  return r.result;
};
const view = async (method: string, args: object = {}) => {
  const r = await rpc("query", { request_type: "call_function", account_id: id, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64"), finality: "final" });
  return JSON.parse(Buffer.from(r.result).toString());
};
const bs58 = (data: Uint8Array) => {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digest = createHash("sha256").update(data).digest();
  let n = BigInt("0x" + digest.toString("hex")),
    out = "";
  while (n) {
    out = alphabet[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of digest) {
    if (b) break;
    out = "1" + out;
  }
  return out;
};

if ((await rpc("status", {})).chain_id !== "testnet") throw Error("TESTNET_ONLY");
const code = await readFile("artifacts/agent_market.wasm");
const codeHash = bs58(code);
const parentBalance = BigInt((await rpc("query", { request_type: "view_account", account_id: parent, finality: "final" })).amount);
let prior: { code_hash: string } | null = null;
try {
  prior = await rpc("query", { request_type: "view_account", account_id: id, finality: "final" });
} catch (e) {
  if (!/UNKNOWN_ACCOUNT/.test(String(e))) throw e;
}
if (prior && prior.code_hash !== codeHash) throw Error(`${id} already exists with different code; deploy v2 under another name.`);
const needed = FUNDING + N / 20n;
console.log(JSON.stringify({ network: "testnet", contract: id, agents: AGENTS, code_hash: codeHash, wasm_bytes: code.length, exists: !!prior, funding_near: Number(FUNDING) / 1e24, parent_balance_near: Number(parentBalance) / 1e24, enough_funds: !!prior || parentBalance >= needed, execute }, null, 2));
if (!execute) process.exit(0);

const transactions: string[] = [];
if (!prior) {
  if (parentBalance < needed) throw Error(`Deployer needs ${Number(needed) / 1e24} NEAR.`);
  const root = new Account(parent, new JsonRpcProvider({ url: endpoint }), KeyPairSigner.fromSecretKey(credential.private_key as `ed25519:${string}`));
  const r = await root.signAndSendTransaction({
    receiverId: id,
    actions: [actions.createAccount(), actions.transfer(FUNDING), actions.deployContract(code), actions.functionCall("new", { agents: AGENTS }, 30_000_000_000_000n, 0n)],
    waitUntil: "FINAL",
    throwOnFailure: true,
  });
  transactions.push(r.transaction.hash);
}

const keys = await rpc("query", { request_type: "view_access_key_list", account_id: id, finality: "final" });
const account = await rpc("query", { request_type: "view_account", account_id: id, finality: "final" });
const config = await view("config");
if (keys.keys.length) throw Error("Contract account must be keyless.");
if (account.code_hash !== codeHash) throw Error("Deployed code hash mismatch.");
if (config.agents !== AGENTS) throw Error("Config mismatch.");

pub.agent_market = { contract: id, code_hash: codeHash, network: "testnet", agents: AGENTS, keyless: true, deployed_at: new Date().toISOString(), transactions };
await writeFile("public/testnet.json", JSON.stringify(pub, null, 2) + "\n");
console.log(`deployed ${id} (${codeHash}), keyless; recorded in public/testnet.json`);
