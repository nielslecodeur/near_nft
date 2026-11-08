/**
 * Local Keepers preview: starts a sandbox node and deploys
 * - keepers v2 (artifacts/keepers.wasm) with two NEP-141 tokens on its allowlist
 *   (the repo's demo-token; both report the symbol "demoUSD"),
 * - keepers v1 (artifacts/keepers-v1.wasm) for the legacy pages,
 * seeds cards in every tier, two filled baskets, one listing and one resale,
 * then keeps running. Point the front end at it with the printed command and
 * open http://127.0.0.1:5173/keepers. Ctrl+C stops the node.
 */
import { writeFile } from "node:fs/promises";
import { startChain } from "./chain.js";
import type { SandboxAccount } from "./harness.js";

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
const sub = (name: string, near: bigint) =>
  root.createSubAccount(name, { initialBalance: near * N });
const [keepers, legacy, creator, alice, bob] = await Promise.all([
  sub("keepers", 10n),
  sub("keepers-v1", 10n),
  sub("creator", 5n),
  sub("alice", 100n),
  sub("bob", 100n),
]);
const tokens: SandboxAccount[] = [];
for (const name of ["tok-a", "tok-b"]) {
  const t = await sub(name, 10n);
  await t.deploy("artifacts/demo_token.wasm");
  await t.call(t, "new", {
    owner_id: alice.accountId,
    total_supply: "1000000000000",
  });
  for (const who of [keepers.accountId, bob.accountId])
    await root.call(
      t,
      "storage_deposit",
      { account_id: who, registration_only: true },
      { attachedDeposit: N / 100n },
    );
  tokens.push(t);
}

await keepers.deploy("artifacts/keepers.wasm");
await keepers.call(keepers, "new", {
  creator: creator.accountId,
  tokens: tokens.map((t) => t.accountId),
});
await legacy.deploy("artifacts/keepers-v1.wasm");
await legacy.call(legacy, "new", { creator: creator.accountId });

// v2: six Keepers for Alice, balances in each tier, two filled baskets.
for (let i = 0; i < 6; i++)
  await alice.call(keepers, "mint", {}, { gas: GAS, attachedDeposit: MINT });
for (const [id, amount] of [
  ["2", (6n * N) / 10n],
  ["3", (25n * N) / 10n],
  ["4", 12n * N],
  ["6", N / 10n],
] as const)
  await bob.call(
    keepers,
    "deposit",
    { token_id: id },
    { attachedDeposit: amount },
  );
const fill = (token: SandboxAccount, card: string, amount: string) =>
  alice.call(
    token,
    "ft_transfer_call",
    {
      receiver_id: keepers.accountId,
      amount,
      msg: JSON.stringify({ token_id: card }),
    },
    { gas: GAS, attachedDeposit: 1n },
  );
await fill(tokens[0], "3", "25000000"); // 25 (6 decimals)
await fill(tokens[1], "3", "12500000"); // 12.5
await fill(tokens[0], "4", "7000000"); // 7
// #5 resold, #3 listed with its basket.
await alice.call(
  keepers,
  "list",
  { token_id: "5", price: (5n * N).toString() },
  { attachedDeposit: 1n },
);
const card5 = await keepers.view<{ listing_id: string }>("card", {
  token_id: "5",
});
await bob.call(
  keepers,
  "buy",
  { token_id: "5", listing_id: card5.listing_id },
  { gas: GAS, attachedDeposit: 5n * N },
);
await alice.call(
  keepers,
  "list",
  { token_id: "3", price: (3n * N).toString() },
  { attachedDeposit: 1n },
);

// v1 legacy: one card for Alice.
await alice.call(legacy, "mint", {}, { gas: GAS, attachedDeposit: MINT });
await bob.call(legacy, "deposit", { token_id: "1" }, { attachedDeposit: N });

const info = {
  rpc: chain.rpcAddr,
  contract: keepers.accountId,
  v1: legacy.accountId,
  alice: alice.accountId,
  bob: bob.accountId,
};
await writeFile(
  ".research/keepers-preview.json",
  JSON.stringify(info, null, 2),
);
console.log("Keepers preview ready:", JSON.stringify(info));
console.log(
  `VITE_RPC_URL=${chain.rpcAddr} VITE_KEEPERS_ID=${keepers.accountId} VITE_KEEPERS_V1_ID=${legacy.accountId} npm run dev  →  http://127.0.0.1:5173/keepers`,
);
await new Promise(() => {});
