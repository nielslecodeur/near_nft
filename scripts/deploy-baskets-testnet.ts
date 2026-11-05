/** Fresh collection only; old keyless reserve deployment is never upgraded. Default is read-only. */
import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { testnetCredential } from "./testnet-credentials.js";
import type { Deployment } from "../packages/shared/network.js";
const execute = process.argv.includes("--execute"),
  endpoint = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const { credential } = await testnetCredential(),
  parent = credential.account_id,
  id = "baskets-v1." + parent;
if (!parent.endsWith(".testnet") || id.length > 49)
  throw Error("Short testnet deployer required.");
const provider = new JsonRpcProvider({ url: endpoint }),
  root = new Account(
    parent,
    provider,
    KeyPairSigner.fromSecretKey(credential.private_key as `ed25519:${string}`),
  );
const rpc = async (method: string, params: object) => {
  const r = await (
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "basket-deployment",
        method,
        params,
      }),
    })
  ).json();
  if (r.error) throw Error(JSON.stringify(r.error));
  return r.result;
};
const view = async (account: string, method: string) => {
  const r = await rpc("query", {
    request_type: "call_function",
    account_id: account,
    method_name: method,
    args_base64: "e30=",
    finality: "final",
  });
  return JSON.parse(Buffer.from(r.result).toString());
};
const status = await rpc("status", {});
if (status.chain_id !== "testnet" || status.protocol_version < 88)
  throw Error("NEAR testnet protocol 88 required.");
const config = JSON.parse(await readFile("public/testnet.json", "utf8")),
  d: Deployment = config.deployment;
if (!d || d.network !== "testnet")
  throw Error("Existing asset deployment required.");
const code = await readFile("artifacts/collection.wasm"),
  wallet = await readFile("artifacts/wallet.wasm");
const hash = (data: Uint8Array) => {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
    digest = createHash("sha256").update(data).digest();
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
let prior: any = null;
try {
  prior = await rpc("query", {
    request_type: "view_account",
    account_id: id,
    finality: "final",
  });
} catch (e) {
  if (!/UNKNOWN_ACCOUNT/.test(String(e))) throw e;
}
if (prior && prior.code_hash !== hash(code))
  throw Error("Existing code differs: refusal to overwrite any account.");
console.log(
  JSON.stringify(
    {
      network: "testnet",
      collection: id,
      exists: !!prior,
      execute,
      funding: "6.8 test NEAR",
      asset: d.asset,
    },
    null,
    2,
  ),
);
if (!execute) process.exit(0);
const transactions: string[] = [];
if (!prior) {
  const r = await root.signAndSendTransaction({
    receiverId: id,
    actions: [
      actions.createAccount(),
      actions.transfer(68n * 10n ** 23n),
      actions.deployContract(code),
      actions.functionCall(
        "new",
        {
          network: "testnet",
          asset: d.asset,
          strategy: d.strategy,
          admin_key: null,
        },
        100_000_000_000_000n,
        0n,
      ),
    ],
    waitUntil: "FINAL",
    throwOnFailure: true,
  });
  if (
    r.receipts_outcome.some(
      (o) =>
        typeof o.outcome.status === "object" && "Failure" in o.outcome.status,
    )
  )
    throw Error("Deployment receipt failed.");
  transactions.push(r.transaction.hash);
}
const keys = await rpc("query", {
    request_type: "view_access_key_list",
    account_id: id,
    finality: "final",
  }),
  p = await view(id, "basket_protocol");
if (
  keys.keys.length ||
  !p.no_series ||
  !p.admin_disabled ||
  p.protocol !== "everkeep-fictional-v1" ||
  p.asset !== d.asset ||
  p.strategy !== d.strategy ||
  p.wallet_hash !== createHash("sha256").update(wallet).digest("base64")
)
  throw Error("Keyless route/protocol/wallet embedding mismatch.");
d.baskets = {
  collection: id,
  code_hash: hash(code),
  wallet_code_hash: hash(wallet),
  protocol: "everkeep-fictional-v1",
};
await writeFile(
  "public/testnet.json",
  JSON.stringify({ ...config, deployment: d }, null, 2) + "\n",
);
await mkdir("docs/results", { recursive: true });
await writeFile(
  "docs/results/baskets-testnet-deployment.json",
  JSON.stringify(
    {
      network: "testnet",
      collection: d.baskets,
      transactions,
      legacyCollection: d.collection,
      legacyUntouched: true,
      noUserTransactions: true,
    },
    null,
    2,
  ),
);
console.log(
  "Keyless thematic collection verified; public configuration updated.",
);
