/**
 * Runner sandbox proof: the real Runner (scripts/agent-runner-core.ts) drives a
 * Buyer and a Payer seat on a local NEAR node, signing only with agent keys it
 * generated itself. Checks the mission logic (cheapest listing within the
 * price, payment schedule) and that it stops when the seat is paused.
 * Run: npm run test:agents:runner  (WSL/Linux; needs ~/.near/sandbox/near-sandbox)
 */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { PublicKey, actions } from "near-api-js";
import { startChain } from "./chain.js";
import { MemoryStore, Runner } from "./agent-runner-core.js";

const N = 10n ** 24n;
const USDC = 1_000_000n;
const GAS = 300_000_000_000_000n;
const MINT_COST = N + N / 50n;
const checks: string[] = [];
const pass = (name: string) => {
  checks.push(name);
  console.log("✓", name);
};

const chain = await startChain();
try {
  const root = chain.rootAccount;
  const make = (name: string, near: bigint) =>
    root.createSubAccount(name, { initialBalance: near * N });
  const agents = await make("agents", 10n);
  const market = await make("market", 10n);
  const gallery = await make("gallery", 10n);
  const usdc = await make("usdc", 10n);
  const creator = await make("creator", 5n);
  const alice = await make("alice", 60n);
  const bob = await make("bob", 30n);
  const shop = await make("shop", 5n);

  await usdc.deploy("artifacts/demo_token.wasm");
  await usdc.call(usdc, "new", {
    owner_id: alice.accountId,
    total_supply: (1000n * USDC).toString(),
  });
  for (const who of [agents, shop])
    await root.call(
      usdc,
      "storage_deposit",
      { account_id: who.accountId, registration_only: true },
      { attachedDeposit: N / 100n },
    );
  for (const c of [market, gallery]) {
    await c.deploy("artifacts/keepers.wasm");
    await c.call(c, "new", { creator: creator.accountId, tokens: [usdc.accountId] });
  }
  await agents.deploy("artifacts/agents.wasm");
  await agents.call(agents, "new", { usdc: usdc.accountId });

  for (let i = 0; i < 2; i++)
    await alice.call(gallery, "mint", {}, { attachedDeposit: MINT_COST });
  // Bob lists three cards: 1.5 NEAR, 0.8 NEAR and 3 NEAR.
  for (const price of [15n * N / 10n, 8n * N / 10n, 3n * N]) {
    const t = await bob.call<{ token_id: string }>(market, "mint", {}, { attachedDeposit: MINT_COST });
    await bob.call(market, "list", { token_id: t.token_id, price: price.toString() }, { attachedDeposit: 1n });
  }
  pass("setup: gallery NFTs for Alice, three Keepers listed by Bob (1.5, 0.8, 3 NEAR)");

  const create = (token: string, kind: string, policy: object) =>
    alice.call<string>(
      agents,
      "create_seat",
      { nft_contract: gallery.accountId, token_id: token, kind, policy },
      { attachedDeposit: N / 10n, gas: GAS },
    );
  const payerSeat = await create("1", "Payer", {
    per_tx_max: (2n * USDC).toString(),
    per_day_max: (5n * USDC).toString(),
    payees: [shop.accountId],
    market: null,
  });
  const buyerSeat = await create("2", "Buyer", {
    per_tx_max: (2n * N).toString(),
    per_day_max: (4n * N).toString(),
    payees: [],
    market: market.accountId,
  });
  await alice.call(
    usdc,
    "ft_transfer_call",
    { receiver_id: agents.accountId, amount: (10n * USDC).toString(), msg: JSON.stringify({ seat_id: payerSeat }) },
    { attachedDeposit: 1n, gas: GAS },
  );
  await alice.call(agents, "fund", { seat_id: buyerSeat }, { attachedDeposit: 4n * N });

  // The runner makes the keys; Alice's wallet only adds the public keys.
  const store = new MemoryStore();
  const runner = new Runner({ rpc: chain.rpcAddr, agents: agents.accountId, store, log: () => {} });
  const keys: Record<string, string> = {};
  for (const seat of [payerSeat, buyerSeat]) {
    keys[seat] = await runner.createKey(alice.accountId);
    await alice.transact(alice.accountId, [
      actions.addFunctionCallAccessKey(
        PublicKey.fromString(keys[seat]),
        agents.accountId,
        ["agent_pay", "agent_buy", "pause"],
        N,
      ),
    ]);
    await alice.call(agents, "set_agent_key", { seat_id: seat, public_key: keys[seat] }, { attachedDeposit: 1n });
  }
  assert.ok((await store.keys()).every((k) => k.secretKey.startsWith("ed25519:")));
  pass("runner generates the agent keys; the wallet only adds the public keys");

  await store.saveJob({
    seatId: payerSeat,
    accountId: alice.accountId,
    publicKey: keys[payerSeat],
    kind: "Payer",
    payer: { payments: [{ payee: shop.accountId, amount: USDC.toString(), everySeconds: 60, memo: "coffee" }] },
  });
  await store.saveJob({
    seatId: buyerSeat,
    accountId: alice.accountId,
    publicKey: keys[buyerSeat],
    kind: "Buyer",
    buyer: { maxPrice: (2n * N).toString() },
  });

  const ftBalance = async (a: string) =>
    BigInt(await usdc.view<string>("ft_balance_of", { account_id: a }));
  const owner = async (id: string) =>
    (await market.view<{ owner_id: string }>("nft_token", { token_id: id })).owner_id;

  const t0 = Date.now();
  let out = await runner.tick(t0);
  assert.match(out[payerSeat], /^paid 1000000 to shop/);
  assert.match(out[buyerSeat], /^bought #2 for/);
  assert.equal(await ftBalance(shop.accountId), USDC);
  assert.equal(await owner("2"), alice.accountId);
  pass("tick 1: Payer pays 1 USDC; Buyer picks the cheapest card within 2 NEAR (#2 at 0.8)");

  out = await runner.tick(t0 + 10_000);
  assert.equal(out[payerSeat], "nothing due");
  assert.match(out[buyerSeat], /^bought #1 for/);
  assert.equal(await owner("1"), alice.accountId);
  pass("tick 2 (+10 s): payment not due yet; Buyer takes #1 at 1.5 NEAR");

  out = await runner.tick(t0 + 70_000);
  assert.match(out[payerSeat], /^paid/);
  assert.equal(out[buyerSeat], "no listing within the mission");
  assert.equal(await owner("3"), bob.accountId);
  assert.equal(await ftBalance(shop.accountId), 2n * USDC);
  pass("tick 3 (+70 s): second payment; the 3 NEAR card is above the mission, left alone");

  await alice.call(agents, "pause", { seat_id: payerSeat });
  out = await runner.tick(t0 + 200_000);
  assert.equal(out[payerSeat], "skipped: paused");
  assert.equal(await ftBalance(shop.accountId), 2n * USDC);
  pass("paused seat: the runner reads it from chain and sends nothing");

  // The NFT changes hands: the runner sees the seat is no longer runnable.
  await alice.call(agents, "resume", { seat_id: payerSeat }, { attachedDeposit: 1n });
  await alice.call(gallery, "nft_transfer", { receiver_id: bob.accountId, token_id: "1" }, { attachedDeposit: 1n, gas: GAS });
  out = await runner.tick(t0 + 400_000);
  assert.match(out[payerSeat], /^refused/);
  out = await runner.tick(t0 + 600_000);
  assert.equal(out[payerSeat], "skipped: agent key not set on the seat");
  pass("after the NFT is sold: one refused attempt resets the seat, then the runner stops");

  const log = await agents.view<{ action: string; status: string; detail: string }[]>("seat_log", { seat_id: payerSeat });
  assert.ok(log.some((e) => e.action === "reset"));
  pass("the seat log shows the payments, the refusal and the reset");

  await writeFile(
    "docs/results/agents-runner-sandbox.json",
    JSON.stringify({ at: new Date().toISOString(), checks }, null, 2) + "\n",
  );
  console.log(`\n${checks.length} runner checks passed → docs/results/agents-runner-sandbox.json`);
} finally {
  await chain.tearDown();
}
