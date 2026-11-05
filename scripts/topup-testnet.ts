/** One official-faucet top-up per target. All transient keys stay outside the repository. */
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  actions,
} from "near-api-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { TESTNET } from "../packages/shared/network.js";
const target = process.argv[2],
  execute = process.argv.includes("--execute");
if (!target || !/^([a-z0-9_-]+\.)+testnet$/.test(target))
  throw new Error("A real testnet account is required.");
const provider = new JsonRpcProvider({ url: TESTNET.rpc }),
  status = await (await fetch(TESTNET.rpc + "/status")).json();
if (status.chain_id !== "testnet") throw new Error("TESTNET_ONLY");
const current = await provider.viewAccount({ accountId: target });
console.log(
  JSON.stringify({
    target,
    network: "testnet",
    balance: current.amount.toString(),
    topupTestNEAR: 5,
    execute,
  }),
);
if (!execute) process.exit(0);
const dir = join(homedir(), ".near-credentials/testnet/faucet-topups");
await mkdir(dir, { recursive: true, mode: 0o700 });
const file = join(dir, target + ".json");
let job: any;
try {
  job = JSON.parse(await readFile(file, "utf8"));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  const key = KeyPair.fromRandom("ed25519");
  job = {
    target,
    phase: "prepared",
    account_id: "everkeep-topup-" + Date.now().toString(36) + ".testnet",
    private_key: key.toString(),
    public_key: key.getPublicKey().toString(),
  };
  await writeFile(file, JSON.stringify(job), { flag: "wx", mode: 0o600 });
}
const save = async () => writeFile(file, JSON.stringify(job), { mode: 0o600 });
if (job.phase === "completed") {
  console.log("Top-up already completed; no transfer.");
  process.exit(0);
}
if (job.phase === "paying")
  throw new Error(
    "Unknown transfer outcome. Inspect the public account before any new top-up.",
  );
const key = KeyPair.fromString(job.private_key);
if (job.phase === "prepared") {
  const r = await fetch("https://helper.testnet.near.org/account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      newAccountId: job.account_id,
      newAccountPublicKey: job.public_key,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok)
    throw new Error(
      "Official faucet refused " + r.status + "; no automatic retry.",
    );
  job.phase = "created";
  await save();
}
const transient = new Account(job.account_id, provider, new KeyPairSigner(key));
job.phase = "paying";
await save();
const receipt = await transient.signAndSendTransaction({
  receiverId: target,
  actions: [actions.transfer(5n * 10n ** 24n)],
  waitUntil: "FINAL",
});
if (
  receipt.receipts_outcome.some(
    (r) =>
      typeof r.outcome.status === "object" && "Failure" in r.outcome.status,
  )
)
  throw new Error("Transfer receipt failed; inspect before retrying.");
job.phase = "completed";
job.hash = receipt.transaction.hash;
await save();
await transient.signAndSendTransaction({
  receiverId: job.account_id,
  actions: [actions.deleteAccount("v2d.faucet.nonofficial.testnet")],
  waitUntil: "FINAL",
  throwOnFailure: false,
});
const report = {
  at: new Date().toISOString(),
  target,
  network: "testnet",
  transaction: job.hash,
  balance: (
    await provider.viewAccount({ accountId: target })
  ).amount.toString(),
};
await writeFile(
  "docs/results/faucet-topup-" + target + ".json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
