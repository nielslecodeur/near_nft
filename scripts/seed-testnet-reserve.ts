/** Explicit, idempotent test-token reserve top-up. No yield credited to any NFT. */
import { readFile, writeFile } from "node:fs/promises";
import { KeyPair } from "near-api-js";
import { SandboxAccount } from "./harness.js";
import { testnetCredential } from "./testnet-credentials.js";
import { TESTNET } from "../packages/shared/network.js";
const { deployment: d } = JSON.parse(
  await readFile("public/testnet.json", "utf8"),
);
const { credential } = await testnetCredential();
if (credential.account_id !== d.parent)
  throw new Error("Testnet deployer required.");
const operator = new SandboxAccount(
  d.parent,
  process.env.NEAR_TESTNET_RPC || TESTNET.rpc,
  KeyPair.fromString(credential.private_key as `ed25519:${string}`),
);
if ((await operator.rpc("status", [])).chain_id !== "testnet")
  throw new Error("TESTNET_ONLY");
const p = await operator
    .getAccount(d.strategy)
    .view<{ reserve: string }>("position", { wallet: d.parent }),
  target = 1000_000_000n;
if (BigInt(p.reserve) >= target) {
  await writeFile(
    "docs/results/testnet-reserve.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        asset: d.asset,
        strategy: d.strategy,
        reserve: p.reserve,
        verification:
          "On-chain reserve read; no additional transfer submitted.",
      },
      null,
      2,
    ),
  );
  console.log("Reserve already funded; no transfer.");
  process.exit(0);
}
const amount = (target - BigInt(p.reserve)).toString();
if (!process.argv.includes("--execute")) {
  console.log(
    JSON.stringify({
      dryRun: true,
      amount,
      asset: d.asset,
      strategy: d.strategy,
    }),
  );
  process.exit(0);
}
const r = await operator.callRaw(
  d.asset,
  "ft_transfer_call",
  { receiver_id: d.strategy, amount, msg: "reserve" },
  { attachedDeposit: 1n, gas: 150_000_000_000_000n },
);
if (r.failed || r.receiptFailures.length)
  throw new Error("Reserve funding failed; inspect receipts before retrying.");
const after = await operator
  .getAccount(d.strategy)
  .view<{ reserve: string }>("position", { wallet: d.parent });
if (BigInt(after.reserve) < target)
  throw new Error("Reserve not confirmed; no automatic retry.");
const report = {
  at: new Date().toISOString(),
  asset: d.asset,
  strategy: d.strategy,
  reserve: after.reserve,
  transaction: r.result.transaction.hash,
};
await writeFile(
  "docs/results/testnet-reserve.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
