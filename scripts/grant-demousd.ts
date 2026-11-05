import { readFile } from "node:fs/promises";
import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import { testnetCredential } from "./testnet-credentials.js";
import { units } from "../packages/shared/index.js";
const target = process.argv[2],
  amount = units(process.argv[3] || "100"),
  execute = process.argv.includes("--execute");
if (
  !target ||
  !/^([a-z0-9_-]+\.)+testnet$/.test(target) ||
  amount <= 0n ||
  amount > units("1000")
)
  throw new Error(
    "Usage: testnet:grant -- compte.testnet 100 [--execute], maximum 1 000 demoUSD de test.",
  );
const { deployment: d } = JSON.parse(
  await readFile("public/testnet.json", "utf8"),
);
if (!d) throw new Error("Déploiement manquant.");
const { credential } = await testnetCredential();
if (credential.account_id !== d.parent)
  throw new Error(
    "Le distributeur est différent du propriétaire de la réserve.",
  );
const provider = new JsonRpcProvider({ url: d.rpc }),
  status = await (await fetch(d.rpc + "/status")).json();
if (status.chain_id !== "testnet") throw new Error("TESTNET_ONLY");
await provider.viewAccount({ accountId: target });
const owner = new Account(
  d.parent,
  provider,
  KeyPairSigner.fromSecretKey(credential.private_key as `ed25519:${string}`),
);
const balance = (await provider.callFunction({
  contractId: d.asset,
  method: "ft_balance_of",
  args: { account_id: target },
})) as string;
console.log(
  JSON.stringify({
    account: target,
    token: d.asset,
    targetBalance: amount.toString(),
    currentBalance: balance,
    execute,
  }),
);
if (!execute || BigInt(balance) >= amount) process.exit(0);
const bounds = (await provider.callFunction({
  contractId: d.asset,
  method: "storage_balance_bounds",
  args: {},
})) as { min: string };
await owner.signAndSendTransaction({
  receiverId: d.asset,
  actions: [
    actions.functionCall(
      "storage_deposit",
      { account_id: target, registration_only: true },
      30_000_000_000_000n,
      BigInt(bounds.min),
    ),
  ],
  waitUntil: "FINAL",
});
const r = await owner.signAndSendTransaction({
  receiverId: d.asset,
  actions: [
    actions.functionCall(
      "ft_transfer",
      {
        receiver_id: target,
        amount: (amount - BigInt(balance)).toString(),
        memo: "Everkeep demoUSD test distribution; no investment authority",
      },
      30_000_000_000_000n,
      1n,
    ),
  ],
  waitUntil: "FINAL",
});
console.log(
  JSON.stringify({ distributed: target, transaction: r.transaction.hash }),
);
