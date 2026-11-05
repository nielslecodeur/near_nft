/**
 * Local Keepers preview: starts a sandbox node, deploys artifacts/keepers.wasm,
 * seeds cards in every tier (one listed, one resold), then keeps running.
 * Point the front end at it:
 *   VITE_RPC_URL=<printed rpc> VITE_KEEPERS_ID=keepers.sandbox npm run dev
 * then open http://127.0.0.1:5173/keepers. Ctrl+C stops the node.
 */
import { writeFile } from "node:fs/promises";
import { startChain } from "./chain.js";

const N = 10n ** 24n;
const GAS = 100_000_000_000_000n;
const MINT = N + N / 50n;
const chain = await startChain();
const stop = async () => {
  await chain.tearDown();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const root = chain.rootAccount;
const keepers = await root.createSubAccount("keepers", {
  initialBalance: 10n * N,
});
const creator = await root.createSubAccount("creator", {
  initialBalance: 5n * N,
});
const alice = await root.createSubAccount("alice", {
  initialBalance: 100n * N,
});
const bob = await root.createSubAccount("bob", { initialBalance: 100n * N });
await keepers.deploy("artifacts/keepers.wasm");
await keepers.call(keepers, "new", { creator: creator.accountId });

// Six Keepers for Alice, then balances that land in each tier.
for (let i = 0; i < 6; i++)
  await alice.call(keepers, "mint", {}, { gas: GAS, attachedDeposit: MINT });
const deposits: [string, bigint][] = [
  ["2", (6n * N) / 10n], // brushed
  ["3", (25n * N) / 10n], // holographic
  ["4", 12n * N], // animated
  ["6", N / 10n], // matte, partly filled
];
for (const [id, amount] of deposits)
  await bob.call(
    keepers,
    "deposit",
    { token_id: id },
    { attachedDeposit: amount },
  );
// #5 is resold: Alice lists at 5 NEAR, Bob buys → 0.5 NEAR royalty, brushed.
await alice.call(
  keepers,
  "list",
  { token_id: "5", price: (5n * N).toString() },
  { attachedDeposit: 1n },
);
await bob.call(
  keepers,
  "buy",
  { token_id: "5", min_card_balance: "0" },
  { gas: GAS, attachedDeposit: 5n * N },
);
// #3 stays listed.
await alice.call(
  keepers,
  "list",
  { token_id: "3", price: (3n * N).toString() },
  { attachedDeposit: 1n },
);

const info = {
  rpc: chain.rpcAddr,
  contract: keepers.accountId,
  alice: alice.accountId,
  bob: bob.accountId,
};
await writeFile(
  ".research/keepers-preview.json",
  JSON.stringify(info, null, 2),
);
console.log("Keepers preview ready:", JSON.stringify(info));
console.log(
  `VITE_RPC_URL=${chain.rpcAddr} VITE_KEEPERS_ID=${keepers.accountId} npm run dev  →  http://127.0.0.1:5173/keepers`,
);
await new Promise(() => {});
