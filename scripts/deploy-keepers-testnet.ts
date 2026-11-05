/**
 * Deploys artifacts/keepers.wasm to keepers-v1.<deployer> on NEAR testnet.
 * Keyless: the account is created, funded, deployed and initialised in one
 * transaction with no access key, so the code can never change. A new version
 * goes to a new account (keepers-v2…). Default is a read-only dry run;
 * pass --execute to deploy.
 */
import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { testnetCredential } from "./testnet-credentials.js";

const N = 10n ** 24n;
// Code storage (~293 KB ≈ 2.93 NEAR) plus a buffer for state and the first mints.
const FUNDING = 34n * 10n ** 23n; // 3.4 NEAR
const execute = process.argv.includes("--execute"),
  version = process.env.KEEPERS_VERSION || "v1",
  endpoint = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const { credential } = await testnetCredential(),
  parent = credential.account_id,
  id = `keepers-${version}.${parent}`;
if (!parent.endsWith(".testnet") || id.length > 64)
  throw Error("Short testnet deployer required.");

const rpc = async (method: string, params: object) => {
  const r = await (
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "keepers", method, params }),
    })
  ).json();
  if (r.error) throw Error(JSON.stringify(r.error));
  return r.result;
};
const view = async (method: string, args: object = {}) => {
  const r = await rpc("query", {
    request_type: "call_function",
    account_id: id,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    finality: "final",
  });
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

const status = await rpc("status", {});
if (status.chain_id !== "testnet") throw Error("TESTNET_ONLY");
const code = await readFile("artifacts/keepers.wasm"),
  codeHash = bs58(code);
const parentBalance = BigInt(
  (
    await rpc("query", {
      request_type: "view_account",
      account_id: parent,
      finality: "final",
    })
  ).amount,
);
let prior: { code_hash: string } | null = null;
try {
  prior = await rpc("query", {
    request_type: "view_account",
    account_id: id,
    finality: "final",
  });
} catch (e) {
  if (!/UNKNOWN_ACCOUNT/.test(String(e))) throw e;
}
if (prior && prior.code_hash !== codeHash)
  throw Error(
    `${id} already exists with different code; use KEEPERS_VERSION=v2.`,
  );
const needed = FUNDING + N / 20n; // + gas margin
console.log(
  JSON.stringify(
    {
      network: "testnet",
      contract: id,
      creator: parent,
      code_hash: codeHash,
      wasm_bytes: code.length,
      exists: !!prior,
      funding_near: Number(FUNDING) / 1e24,
      parent_balance_near: Number(parentBalance) / 1e24,
      enough_funds: !!prior || parentBalance >= needed,
      execute,
    },
    null,
    2,
  ),
);
if (!execute) process.exit(0);

const transactions: string[] = [];
if (!prior) {
  if (parentBalance < needed)
    throw Error(
      `Deployer needs ${Number(needed) / 1e24} NEAR; has ${Number(parentBalance) / 1e24}.`,
    );
  const root = new Account(
    parent,
    new JsonRpcProvider({ url: endpoint }),
    KeyPairSigner.fromSecretKey(credential.private_key as `ed25519:${string}`),
  );
  const r = await root.signAndSendTransaction({
    receiverId: id,
    actions: [
      actions.createAccount(),
      actions.transfer(FUNDING),
      actions.deployContract(code),
      actions.functionCall("new", { creator: parent }, 30_000_000_000_000n, 0n),
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

// Post-deploy verification, all read-only.
const keys = await rpc("query", {
  request_type: "view_access_key_list",
  account_id: id,
  finality: "final",
});
const account = await rpc("query", {
  request_type: "view_account",
  account_id: id,
  finality: "final",
});
const config = await view("config"),
  metadata = await view("nft_metadata"),
  supply = await view("nft_total_supply");
if (keys.keys.length) throw Error("Contract account must be keyless.");
if (account.code_hash !== codeHash) throw Error("Deployed code hash mismatch.");
if (config.creator !== parent || config.royalty_bps !== 1000)
  throw Error("Config mismatch.");
if (metadata.symbol !== "KEEPER") throw Error("Metadata mismatch.");

const record = {
  network: "testnet",
  contract: id,
  creator: parent,
  code_hash: codeHash,
  keyless: true,
  deployed_at: new Date().toISOString(),
  transactions,
  config,
  nft_total_supply: supply,
};
const pub = JSON.parse(await readFile("public/testnet.json", "utf8"));
pub.keepers = {
  contract: id,
  code_hash: codeHash,
  creator: parent,
  network: "testnet",
};
await writeFile("public/testnet.json", JSON.stringify(pub, null, 2) + "\n");
await mkdir("docs/results", { recursive: true });
await writeFile(
  "docs/results/keepers-testnet-deployment.json",
  JSON.stringify(record, null, 2) + "\n",
);
console.log(`Verified keyless deployment: ${id}`);
