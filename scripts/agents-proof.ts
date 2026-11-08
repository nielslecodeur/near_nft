/**
 * Agent seats sandbox proof: deploys artifacts/agents.wasm on a real local NEAR
 * node, with two real Keepers collections (one is the Buyer's market, the other
 * stands in for a third-party NFT collection) and a real NEP-141 as USDC.
 * The agent signs with a real function-call key on the owner's account.
 * Run: npm run test:agents  (WSL/Linux; needs ~/.near/sandbox/near-sandbox)
 */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { KeyPair, actions } from "near-api-js";
import { startChain } from "./chain.js";
import { SandboxAccount } from "./harness.js";

const N = 10n ** 24n;
const USDC = 1_000_000n; // 6 decimals
const GAS = 300_000_000_000_000n;
const MINT_COST = N + N / 50n;
const SEAT_STORAGE = N / 10n;
const checks: string[] = [];
const gas: Record<string, string> = {};
const pass = (name: string) => {
  checks.push(name);
  console.log("✓", name);
};

type Seat = {
  seat_id: string;
  owner: string;
  kind: string;
  paused: boolean;
  policy: unknown;
  agent_key: string | null;
  balance: string;
  in_flight: number;
  spent_today: string;
  left_today: string;
  done: number;
  refused: number;
  failed: number;
};
type Log = { action: string; status: string; amount: string; detail: string };

const chain = await startChain();
try {
  const root = chain.rootAccount;
  const make = (name: string, near: bigint) =>
    root.createSubAccount(name, { initialBalance: near * N });
  const agents = await make("agents", 10n);
  const market = await make("market", 10n); // Keepers v2: the Buyer's market
  const gallery = await make("gallery", 10n); // another NFT collection
  const usdc = await make("usdc", 10n);
  const creator = await make("creator", 5n);
  const alice = await make("alice", 60n);
  const bob = await make("bob", 30n);
  const carol = await make("carol", 10n);
  const shop = await make("shop", 5n);
  const evil = await make("evil", 5n);

  assert.ok((await usdc.deploy("artifacts/demo_token.wasm")).succeeded);
  await usdc.call(usdc, "new", {
    owner_id: alice.accountId,
    total_supply: (1000n * USDC).toString(),
  });
  for (const who of [agents, shop, carol])
    await root.call(
      usdc,
      "storage_deposit",
      { account_id: who.accountId, registration_only: true },
      { attachedDeposit: N / 100n },
    );
  for (const c of [market, gallery]) {
    assert.ok((await c.deploy("artifacts/keepers.wasm")).succeeded);
    await c.call(c, "new", {
      creator: creator.accountId,
      tokens: [usdc.accountId],
    });
  }
  assert.ok((await agents.deploy("artifacts/agents.wasm")).succeeded);
  await agents.call(agents, "new", { usdc: usdc.accountId });
  pass("deploy: agents + two NEP-171 collections + USDC (NEP-141)");

  const ftBalance = async (account: string) =>
    BigInt(await usdc.view<string>("ft_balance_of", { account_id: account }));
  const seat = (id: string) => agents.view<Seat>("seat", { seat_id: id });
  const log = (id: string) => agents.view<Log[]>("seat_log", { seat_id: id });
  const solvent = async () => {
    const s = await agents.view<Record<string, string>>("stats");
    assert.ok(
      BigInt(s.account_balance) >=
        BigInt(s.owed_near) + BigInt(s.storage_cost),
      "NEAR solvency",
    );
    assert.ok(
      (await ftBalance(agents.accountId)) >= BigInt(s.owed_usdc),
      "USDC solvency",
    );
  };

  // Alice owns two NFTs in the "third-party" gallery collection.
  for (let i = 0; i < 2; i++)
    await alice.call(gallery, "mint", {}, { attachedDeposit: MINT_COST });
  // Bob owns Keeper #1 on the market and lists it at 1 NEAR.
  await bob.call(market, "mint", {}, { attachedDeposit: MINT_COST });
  await bob.call(
    market,
    "list",
    { token_id: "1", price: N.toString() },
    { attachedDeposit: 1n },
  );
  pass("Alice owns gallery #1 and #2; Bob lists market #1 at 1 NEAR");

  // ---- Payer seat on gallery #1 ----------------------------------------
  const payerPolicy = {
    per_tx_max: (2n * USDC).toString(),
    per_day_max: (5n * USDC).toString(),
    payees: [shop.accountId],
    market: null,
  };
  const created = await alice.call<string | null>(
    agents,
    "create_seat",
    {
      nft_contract: gallery.accountId,
      token_id: "1",
      kind: "Payer",
      policy: payerPolicy,
    },
    { attachedDeposit: SEAT_STORAGE, gas: GAS },
  );
  assert.equal(created, "1");
  const notMine = await bob.call<string | null>(
    agents,
    "create_seat",
    { nft_contract: gallery.accountId, token_id: "2", kind: "Payer" },
    { attachedDeposit: SEAT_STORAGE, gas: GAS },
  );
  assert.equal(notMine, null);
  pass("create_seat checks ownership on the NFT's own contract (Bob refused)");

  await alice.call(
    usdc,
    "ft_transfer_call",
    {
      receiver_id: agents.accountId,
      amount: (10n * USDC).toString(),
      msg: JSON.stringify({ seat_id: "1" }),
    },
    { attachedDeposit: 1n, gas: GAS },
  );
  assert.equal((await seat("1")).balance, (10n * USDC).toString());
  pass("Alice funds the Payer seat with 10 USDC (ft_transfer_call)");

  // Access once: a function-call key on Alice's own account, limited to agents.
  const payerKey = KeyPair.fromRandom("ed25519");
  const added = await alice.transact(alice.accountId, [
    actions.addFunctionCallAccessKey(
      payerKey.getPublicKey(),
      agents.accountId,
      ["agent_pay", "agent_buy", "pause"],
      N,
    ),
  ]);
  assert.ok(added.succeeded);
  await alice.call(
    agents,
    "set_agent_key",
    { seat_id: "1", public_key: payerKey.getPublicKey().toString() },
    { attachedDeposit: 1n },
  );
  const payerAgent = new SandboxAccount(
    alice.accountId,
    chain.rpcAddr,
    payerKey,
  );
  pass("access once: AddKey (function-call, agents only) + set_agent_key");

  const pay = async (payee: string, amount: bigint, label?: string) => {
    const r = await payerAgent.callRaw(
      agents,
      "agent_pay",
      { seat_id: "1", payee, amount: amount.toString(), memo: "invoice" },
      { gas: 100_000_000_000_000n },
    );
    assert.ok(r.succeeded && !r.receiptFailures.length, r.receiptFailureMessages.join());
    if (label) gas[label] = r.gas_burnt;
    const s = r.result.status as { SuccessValue?: string };
    return JSON.parse(Buffer.from(s.SuccessValue ?? "", "base64").toString());
  };
  assert.equal(await pay(shop.accountId, 1_500_000n, "agent_pay"), true);
  assert.equal(await ftBalance(shop.accountId), 1_500_000n);
  assert.equal((await log("1"))[0].status, "done");
  pass("agent pays 1.5 USDC to the shop with no wallet signature");

  assert.equal(await pay(shop.accountId, 3n * USDC), false);
  assert.equal((await log("1"))[0].detail, "over the per-action cap");
  assert.equal(await pay(evil.accountId, USDC), false);
  assert.equal((await log("1"))[0].detail, "payee not on the list");
  assert.equal(await ftBalance(evil.accountId).catch(() => 0n), 0n);
  const s1 = await seat("1");
  assert.equal(s1.refused, 2);
  assert.equal(s1.balance, 8_500_000n.toString());
  pass("refusals (cap, unknown payee) return false and are logged, no money moves");

  // The agent key cannot take the money or change its limits.
  const rejected = async (fn: () => Promise<{ failed: boolean; receiptFailures: unknown[] }>) => {
    try {
      const r = await fn();
      return r.failed || r.receiptFailures.length > 0;
    } catch {
      return true; // rejected before execution (protocol)
    }
  };
  assert.ok(
    await rejected(() =>
      payerAgent.callRaw(agents, "withdraw", { seat_id: "1" }, { attachedDeposit: 1n }),
    ),
    "function-call key attached a deposit",
  );
  assert.ok(
    await rejected(() => payerAgent.callRaw(agents, "withdraw", { seat_id: "1" })),
  );
  assert.ok(
    await rejected(() =>
      payerAgent.callRaw(agents, "set_policy", {
        seat_id: "1",
        policy: { ...payerPolicy, payees: [evil.accountId] },
      }),
    ),
  );
  assert.ok(
    await rejected(() =>
      payerAgent.callRaw(
        gallery,
        "nft_transfer",
        { receiver_id: evil.accountId, token_id: "1" },
        { attachedDeposit: 1n },
      ),
    ),
  );
  assert.ok(
    await rejected(() =>
      payerAgent.transact(evil.accountId, [actions.transfer(N)]),
    ),
  );
  assert.equal((await seat("1")).balance, 8_500_000n.toString());
  pass("agent key cannot withdraw, change policy, move the NFT or send NEAR");

  // Another key of Alice's (her full-access key) is not the agent.
  assert.ok(
    await rejected(() =>
      alice.callRaw(agents, "agent_pay", {
        seat_id: "1",
        payee: shop.accountId,
        amount: "1",
      }),
    ),
  );
  pass("only the registered agent key runs the seat (Alice's own key refused)");

  // ---- Buyer seat on gallery #2 -----------------------------------------
  await alice.call(
    agents,
    "create_seat",
    {
      nft_contract: gallery.accountId,
      token_id: "2",
      kind: "Buyer",
      policy: {
        per_tx_max: (2n * N).toString(),
        per_day_max: (3n * N).toString(),
        payees: [],
        market: market.accountId,
      },
    },
    { attachedDeposit: SEAT_STORAGE, gas: GAS },
  );
  await alice.call(agents, "fund", { seat_id: "2" }, { attachedDeposit: 3n * N });
  const buyerKey = KeyPair.fromRandom("ed25519");
  await alice.transact(alice.accountId, [
    actions.addFunctionCallAccessKey(
      buyerKey.getPublicKey(),
      agents.accountId,
      ["agent_pay", "agent_buy", "pause"],
      N,
    ),
  ]);
  await alice.call(
    agents,
    "set_agent_key",
    { seat_id: "2", public_key: buyerKey.getPublicKey().toString() },
    { attachedDeposit: 1n },
  );
  const buyerAgent = new SandboxAccount(alice.accountId, chain.rpcAddr, buyerKey);

  const listing = (
    await market.view<{ listing_id: string }>("card", { token_id: "1" })
  ).listing_id;
  const bobBefore = BigInt((await bob.accountView()).amount);
  const bought = await buyerAgent.callRaw(
    agents,
    "agent_buy",
    { seat_id: "2", token_id: "1", listing_id: listing, price: N.toString() },
    { gas: 200_000_000_000_000n },
  );
  assert.ok(bought.succeeded && !bought.receiptFailures.length, bought.receiptFailureMessages.join());
  gas.agent_buy = bought.gas_burnt;
  const card = await market.view<{ owner_id: string }>("nft_token", {
    token_id: "1",
  });
  assert.equal(card.owner_id, alice.accountId);
  assert.ok(BigInt((await bob.accountView()).amount) > bobBefore);
  assert.equal((await seat("2")).balance, (2n * N).toString());
  pass("Buyer agent buys market #1 at 1 NEAR; the card lands in Alice's wallet");

  // The listing id pins the offer: a stale id fails and is credited back.
  await alice.call(
    market,
    "list",
    { token_id: "1", price: N.toString() },
    { attachedDeposit: 1n },
  );
  const stale = await buyerAgent.callRaw(
    agents,
    "agent_buy",
    { seat_id: "2", token_id: "1", listing_id: "999", price: N.toString() },
    { gas: 200_000_000_000_000n },
  );
  assert.ok(stale.succeeded);
  assert.equal((await seat("2")).balance, (2n * N).toString());
  assert.equal((await log("2"))[0].status, "failed");
  pass("a stale listing fails at the market and the NEAR is credited back");

  // Kill switch: the agent key can pause, cannot resume.
  await buyerAgent.call(agents, "pause", { seat_id: "2" });
  assert.equal((await seat("2")).paused, true);
  assert.ok(
    await rejected(() =>
      buyerAgent.callRaw(agents, "resume", { seat_id: "2" }, { attachedDeposit: 1n }),
    ),
  );
  pass("the agent key can pause its seat but cannot resume it");

  // ---- The NFT changes hands --------------------------------------------
  await alice.call(
    gallery,
    "nft_transfer",
    { receiver_id: carol.accountId, token_id: "1" },
    { attachedDeposit: 1n, gas: GAS },
  );
  assert.equal(await pay(shop.accountId, USDC), false);
  const reset = await seat("1");
  assert.equal(reset.paused, true);
  assert.equal(reset.agent_key, null);
  assert.equal(reset.policy, null);
  assert.equal(reset.balance, "0");
  const refund = await agents.view<{ usdc: string }>("refund_of", {
    account_id: alice.accountId,
  });
  assert.equal(refund.usdc, 8_500_000n.toString());
  pass("after a sale the agent is refused, the seat resets, the funder keeps 8.5 USDC");

  await carol.call(agents, "claim_seat", { seat_id: "1" }, { attachedDeposit: 1n, gas: GAS });
  assert.equal((await seat("1")).owner, carol.accountId);
  assert.ok(
    await rejected(() =>
      bob.callRaw(agents, "claim_seat", { seat_id: "2" }, { attachedDeposit: 1n, gas: GAS }),
    ) || (await seat("2")).owner === alice.accountId,
  );
  assert.equal((await seat("2")).owner, alice.accountId);
  pass("Carol (new NFT owner) claims the empty seat; Bob cannot claim Alice's");

  const aliceUsdc = await ftBalance(alice.accountId);
  await alice.call(agents, "withdraw_refund", {}, { attachedDeposit: 1n, gas: GAS });
  assert.equal(await ftBalance(alice.accountId), aliceUsdc + 8_500_000n);
  pass("Alice withdraws her set-aside 8.5 USDC");

  await solvent();
  pass("solvency: NEAR and USDC held >= owed");

  const result = {
    at: new Date().toISOString(),
    wasm: "artifacts/agents.wasm",
    checks,
    gas_burnt: gas,
    final_stats: await agents.view("stats"),
  };
  await writeFile(
    "docs/results/agents-sandbox.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    `\n${checks.length} sandbox checks passed → docs/results/agents-sandbox.json`,
  );
} finally {
  await chain.tearDown();
}
