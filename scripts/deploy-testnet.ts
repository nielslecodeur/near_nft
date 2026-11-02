import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const parent = process.argv[2],
  execute = process.argv.includes("--execute");
if (!parent?.endsWith(".testnet") || !/^[a-z0-9._-]+$/.test(parent))
  throw new Error(
    "Usage: npx tsx scripts/deploy-testnet.ts parent.testnet [--execute]",
  );
const endpoint = process.env.NEAR_TESTNET_RPC || "https://rpc.testnet.near.org";
const status = await (await fetch(endpoint + "/status")).json();
if (status.chain_id !== "testnet" || status.protocol_version < 87)
  throw new Error("Testnet protocole >=87 requis");
const collection = `everkeep.${parent}`,
  asset = `demousd.${parent}`,
  strategy = `strategy.${parent}`;
if ([collection, asset, strategy].some((id) => id.length > 64))
  throw new Error("Nom du parent trop long");
console.log(
  JSON.stringify(
    {
      network: "testnet",
      collection,
      asset,
      strategy,
      owner: parent,
      funding_test_NEAR: 20,
      immutable: true,
      execute,
    },
    null,
    2,
  ),
);
if (!execute) {
  console.log(
    "Préparation seulement. --execute envoie les transactions, sans publication de site.",
  );
  process.exit(0);
}
const credential = JSON.parse(
  await readFile(
    process.env.NEAR_CREDENTIAL_FILE ||
      join(homedir(), ".near-credentials/testnet", parent + ".json"),
    "utf8",
  ),
);
if (credential.account_id !== parent)
  throw new Error("Identité du credential incohérente");
const provider = new JsonRpcProvider({ url: endpoint });
const account = new Account(
  parent,
  provider,
  KeyPairSigner.fromSecretKey(credential.private_key),
);
for (const [id, file, method, args, funding] of [
  [
    asset,
    "demo_token",
    "new",
    { owner_id: parent, total_supply: "1000000000000" },
    5n,
  ],
  [strategy, "strategy", "new", { asset }, 5n],
  [
    collection,
    "collection",
    "new",
    { network: "testnet", asset, strategy },
    10n,
  ],
] as const) {
  // Single receipt: CreateAccount + DeployContract + Init. No access key ever added.
  const result = await account.signAndSendTransaction({
    receiverId: id,
    actions: [
      actions.createAccount(),
      actions.transfer(funding * 10n ** 24n),
      actions.deployContract(await readFile(`artifacts/${file}.wasm`)),
      actions.functionCall(method, args, 100_000_000_000_000n, 0n),
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
    throw new Error("Échec de déploiement : " + id);
  const keys = await provider.viewAccessKeyList({
    accountId: id,
    finalityQuery: { finality: "final" },
  });
  if (keys.keys.length) throw new Error("Clés résiduelles : " + id);
  console.log("Déployé sans clé :", id);
}
await mkdir(".local", { recursive: true });
await writeFile(
  ".local/testnet-deployment.json",
  JSON.stringify(
    {
      parent,
      collection,
      asset,
      strategy,
      endpoint,
      date: new Date().toISOString(),
    },
    null,
    2,
  ),
);
await writeFile(
  ".env.local",
  `VITE_RPC_URL=${endpoint}\nVITE_COLLECTION_ID=${collection}\nVITE_ASSET_ID=${asset}\nVITE_STRATEGY_ID=${strategy}\n`,
);
console.log(
  "Configuration locale écrite. Enregistrer le stockage FT des bénéficiaires et de chaque wallet avant les dépôts.",
);
