/** New keyless testnet deployment. Inspects existing IDs; never upgrades or replaces code. */
import { actions, KeyPairSigner, Account, JsonRpcProvider } from "near-api-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  testnetCredential,
  credentialDirectory,
} from "./testnet-credentials.js";
import { join } from "node:path";
import { ml_dsa65, bytes, b64 } from "../packages/shared/index.js";
import type { Deployment } from "../packages/shared/network.js";
import { demoProfiles } from "./missions-service.js";
const N = 10n ** 24n,
  endpoint = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com",
  execute = process.argv.includes("--execute");
const { credential } = await testnetCredential(),
  parent = credential.account_id,
  provider = new JsonRpcProvider({ url: endpoint }),
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
        id: "deployment",
        method,
        params,
      }),
    })
  ).json();
  if (r.error) throw new Error(JSON.stringify(r.error));
  return r.result;
};
const status = await (await fetch(endpoint + "/status")).json();
if (status.chain_id !== "testnet" || status.protocol_version < 88)
  throw new Error("NEAR testnet protocol 88 required");
const ids = {
  collection: `reserve-v3.${parent}`,
  asset: `demousd-v3.${parent}`,
  strategy: `strategy-v3.${parent}`,
  missions: `missions-v3.${parent}`,
};
if (Object.values(ids).some((id) => id.length > 49))
  throw new Error("Parent too long for named NFT accounts.");
const view = async (account: string, method: string, args = {}) => {
  const r = await rpc("query", {
    request_type: "call_function",
    account_id: account,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    finality: "final",
  });
  return JSON.parse(Buffer.from(r.result).toString());
};
async function state(id: string) {
  try {
    return await rpc("query", {
      request_type: "view_account",
      account_id: id,
      finality: "final",
    });
  } catch (e) {
    if (String(e).includes("UNKNOWN_ACCOUNT")) return null;
    throw e;
  }
}
const existing = await Promise.all(
  Object.entries(ids).map(async ([role, id]) => ({
    role,
    id,
    exists: !!(await state(id)),
  })),
);
console.log(
  JSON.stringify(
    { network: "testnet", parent, contracts: existing, execute },
    null,
    2,
  ),
);
if (!execute) process.exit(0);
await mkdir(".local", { recursive: true });
const secretsFile = join(credentialDirectory, "everkeep-v3-admin.json");
let admin: { publicKey: Uint8Array; secretKey: Uint8Array };
try {
  const k = JSON.parse(await readFile(secretsFile, "utf8"));
  admin = {
    publicKey: Buffer.from(k.public, "base64"),
    secretKey: Buffer.from(k.secret, "base64"),
  };
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT")
    throw new Error("Admin credential unreadable");
  admin = ml_dsa65.keygen();
  await writeFile(
    secretsFile,
    JSON.stringify({
      public: b64(admin.publicKey),
      secret: b64(admin.secretKey),
    }),
    { flag: "wx", mode: 0o600 },
  );
}
const contracts: [string, string, object, bigint][] = [
  [
    ids.asset,
    "demo_token",
    { owner_id: parent, total_supply: "1000000000000" },
    (17n * N) / 10n,
  ],
  [ids.strategy, "strategy", { asset: ids.asset }, (17n * N) / 10n],
  [
    ids.collection,
    "collection",
    {
      network: "testnet",
      asset: ids.asset,
      strategy: ids.strategy,
      admin_key: b64(admin.publicKey),
    },
    (65n * N) / 10n,
  ],
  [
    ids.missions,
    "missions",
    {
      network: "testnet",
      operator: parent,
      collections: [ids.collection],
      profiles: demoProfiles,
    },
    3n * N,
  ],
];
const transactions: string[] = [];
const hashes: Record<string, string> = {};
for (const [id, file, args, funding] of contracts) {
  const code = await readFile(`artifacts/${file}.wasm`),
    expected = base58(createHash("sha256").update(code).digest()),
    prior = await state(id);
  if (prior && prior.code_hash !== expected)
    throw new Error(`Existing code differs at ${id}; no overwrite permitted.`);
  if (!prior) {
    const result = await root.signAndSendTransaction({
      receiverId: id,
      actions: [
        actions.createAccount(),
        actions.transfer(funding),
        actions.deployContract(code),
        actions.functionCall("new", args, 150_000_000_000_000n, 0n),
      ],
      waitUntil: "FINAL",
      throwOnFailure: true,
    });
    if (
      result.receipts_outcome.some(
        (r) =>
          typeof r.outcome.status === "object" && "Failure" in r.outcome.status,
      )
    )
      throw new Error(`Deployment receipt failed at ${id}`);
    transactions.push(result.transaction.hash);
    console.log("Deployed:", id);
  }
  const keys = await rpc("query", {
    request_type: "view_access_key_list",
    account_id: id,
    finality: "final",
  });
  if (keys.keys.length) throw new Error(`Account is not keyless: ${id}`);
  hashes[id] = expected;
}
let series = await view(ids.collection, "series");
if (!series.series) {
  const now = BigInt(
      (await rpc("block", { finality: "final" })).header.timestamp_nanosec,
    ),
    terms = {
      id: "liquidity-v3",
      name: "Réserve demoUSD testnet",
      opens_at: (now + 60_000_000_000n).toString(),
      closes_at: (now + 7n * 86400n * 1_000_000_000n).toString(),
      matures_at: (now + 8n * 86400n * 1_000_000_000n).toString(),
      asset: ids.asset,
      strategy: ids.strategy,
      capacity: "10000000000",
      minimum: "10000000",
      allocation_bps: 2000,
      max_operation: "10000000",
      max_period: "20000000",
      version: "1",
    };
  const message = bytes(
    JSON.stringify({
      protocol: "EVERKEEP_ADMIN_V1",
      network: "testnet",
      verifier: ids.collection,
      nonce: "0",
      expires_at: (now + 600_000_000_000n).toString(),
      action: { Configure: { series: terms } },
    }),
  );
  const r = await root.signAndSendTransaction({
    receiverId: ids.collection,
    actions: [
      actions.functionCall(
        "administer",
        {
          message: b64(message),
          signature: b64(ml_dsa65.sign(message, admin.secretKey)),
        },
        200_000_000_000_000n,
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
    throw new Error("Series configuration failed");
  transactions.push(r.transaction.hash);
  series = await view(ids.collection, "series");
}
if (
  series.series.terms.asset !== ids.asset ||
  series.series.terms.strategy !== ids.strategy
)
  throw new Error("Existing series route mismatch; not modified.");
// All FT receivers must be registered before money is sent; registration is idempotent.
for (const id of [ids.collection, ids.strategy])
  await root.signAndSendTransaction({
    receiverId: ids.asset,
    actions: [
      actions.functionCall(
        "storage_deposit",
        { account_id: id, registration_only: true },
        30_000_000_000_000n,
        N / 100n,
      ),
    ],
    waitUntil: "FINAL",
  });
const deployment: Deployment = {
  network: "testnet",
  rpc: endpoint,
  parent,
  ...ids,
  mandate_hash: series.series.mandate_hash,
  series_id: series.series.terms.id,
  category: "liquidity",
  code_hashes: hashes,
  deployed_at: new Date().toISOString(),
};
await writeFile(
  "public/testnet.json",
  JSON.stringify({ network: "testnet", deployment }, null, 2),
);
await writeFile(
  ".local/testnet-deployment.json",
  JSON.stringify(deployment, null, 2),
);
await writeFile(
  "docs/results/testnet-deployment.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      deployment,
      transactions,
      verification:
        "Fresh keyless contracts, exact code hashes and genuine on-chain ML-DSA admin signature. No existing deployment modified.",
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ deployment, transactions }, null, 2));
admin.secretKey.fill(0);
function base58(data: Uint8Array) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = BigInt("0x" + Buffer.from(data).toString("hex")),
    out = "";
  while (n) {
    out = alphabet[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of data) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}
