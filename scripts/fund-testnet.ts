/** Reproduces the official NEAR docs faucet flow, once: 5 test NEAR then cleanup. */
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  actions,
} from "near-api-js";
import { readFile, writeFile } from "node:fs/promises";
import {
  testnetCredential,
  credentialDirectory,
} from "./testnet-credentials.js";
import { join } from "node:path";
const target = (await testnetCredential()).credential.account_id;
const endpoint =
  process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const provider = new JsonRpcProvider({ url: endpoint });
const status = await (await fetch(endpoint + "/status")).json();
if (status.chain_id !== "testnet") throw new Error("TESTNET_ONLY");
const key = KeyPair.fromRandom("ed25519"),
  name = `everkeep-faucet-${Date.now().toString(36)}.testnet`;
await writeFile(
  join(credentialDirectory, "everkeep-faucet-pending.json"),
  JSON.stringify({ account_id: name, private_key: key.toString(), target }),
  { flag: "wx", mode: 0o600 },
);
const response = await fetch("https://helper.testnet.near.org/account", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    newAccountId: name,
    newAccountPublicKey: key.getPublicKey().toString(),
  }),
  signal: AbortSignal.timeout(20000),
});
if (!response.ok)
  throw new Error(
    `Official faucet refused ${response.status}; no automatic retry.`,
  );
const account = new Account(name, provider, new KeyPairSigner(key));
const result = await account.signAndSendTransaction({
  receiverId: target,
  actions: [actions.transfer(5n * 10n ** 24n)],
  waitUntil: "FINAL",
});
console.log(
  JSON.stringify({
    funded: target,
    testNEAR: 5,
    transaction: result.transaction.hash,
  }),
);
await account.signAndSendTransaction({
  receiverId: name,
  actions: [actions.deleteAccount("v2d.faucet.nonofficial.testnet")],
  waitUntil: "FINAL",
  throwOnFailure: false,
});
console.log(
  "Temporary account cleaned up using the beneficiary from the official docs faucet.",
);
