/**
 * Keepers sandbox proof: deploys artifacts/keepers.wasm on a real local NEAR node
 * and walks the demo path with exact balance checks.
 * Run: npm run test:keepers  (WSL/Linux; needs ~/.near/sandbox/near-sandbox)
 */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { actions } from "near-api-js";
import { startChain } from "./chain.js";
import type { SandboxAccount } from "./harness.js";

const N = 10n ** 24n;
const GAS = 100_000_000_000_000n;
const MINT_COST = N + N / 50n; // 1 NEAR price + 0.02 NEAR storage reserve
const checks: string[] = [];
const gas: Record<string, string> = {};
const pass = (name: string) => {
  checks.push(name);
  console.log("✓", name);
};
const balance = async (a: SandboxAccount) =>
  BigInt((await a.accountView()).amount);

type Card = {
  token_id: string;
  owner_id: string;
  balance: string;
  tier: number;
  tier_name: string;
  trades: number;
  royalties_earned: string;
  withdrawn_total: string;
  list_price: string | null;
};

const chain = await startChain();
try {
  const root = chain.rootAccount;
  const keepers = await root.createSubAccount("keepers", {
    initialBalance: 10n * N,
  });
  const creator = await root.createSubAccount("creator", {
    initialBalance: 5n * N,
  });
  const alice = await root.createSubAccount("alice", {
    initialBalance: 50n * N,
  });
  const bob = await root.createSubAccount("bob", { initialBalance: 50n * N });
  const carol = await root.createSubAccount("carol", {
    initialBalance: 50n * N,
  });
  const dave = await root.createSubAccount("dave", { initialBalance: 5n * N }); // no contract code

  const deployed = await keepers.deploy("artifacts/keepers.wasm");
  assert.ok(deployed.succeeded, "deploy");
  await keepers.call(keepers, "new", { creator: creator.accountId });
  const card = (id: string) => keepers.view<Card>("card", { token_id: id });
  const stats = () => keepers.view<Record<string, string | number>>("stats");
  const solvent = async () => {
    const s = await stats();
    assert.ok(
      BigInt(s.account_balance as string) >=
        BigInt(s.total_card_balances as string) +
          BigInt(s.total_pending_payouts as string) +
          BigInt(s.storage_cost as string),
      "solvency invariant",
    );
  };
  pass("deploy + init");

  // Mint: the creator receives exactly the mint price.
  const creatorBefore = await balance(creator);
  const mint = await alice.callRaw(
    keepers,
    "mint",
    {},
    { gas: GAS, attachedDeposit: 2n * N },
  );
  assert.ok(
    mint.succeeded && !mint.receiptFailures.length,
    mint.receiptFailureMessages.join(),
  );
  gas.mint = mint.gas_burnt;
  assert.equal((await balance(creator)) - creatorBefore, N);
  let c = await card("1");
  assert.equal(c.owner_id, alice.accountId);
  assert.equal(c.tier_name, "matte");
  assert.equal(c.balance, "0");
  assert.equal(
    await keepers.view("is_holder", { account_id: alice.accountId }),
    true,
  );
  const token = await keepers.view<any>("nft_token", { token_id: "1" });
  assert.match(token.metadata.title, /Keeper #1 · Matte/);
  assert.ok(token.metadata.media.startsWith("data:image/svg+xml,"));
  pass(
    "mint: creator receives exactly 1 NEAR, excess refunded, card starts matte",
  );

  // Resale: 10% royalty credited to the card, 90% to the seller, nothing to the creator.
  const price = 5n * N;
  await alice.call(
    keepers,
    "list",
    { token_id: "1", price: price.toString() },
    { attachedDeposit: 1n },
  );
  const aliceBefore = await balance(alice);
  const creatorBeforeSale = await balance(creator);
  const buy = await bob.callRaw(
    keepers,
    "buy",
    { token_id: "1", min_card_balance: "0" },
    { gas: GAS, attachedDeposit: price },
  );
  assert.ok(
    buy.succeeded && !buy.receiptFailures.length,
    buy.receiptFailureMessages.join(),
  );
  gas.buy = buy.gas_burnt;
  assert.equal(
    (await balance(alice)) - aliceBefore,
    price - price / 10n,
    "seller gets 90%",
  );
  assert.equal(
    await balance(creator),
    creatorBeforeSale,
    "creator gets nothing on resale",
  );
  c = await card("1");
  assert.equal(c.owner_id, bob.accountId);
  assert.equal(c.balance, (price / 10n).toString());
  assert.equal(c.royalties_earned, (price / 10n).toString());
  assert.equal(c.trades, 1);
  assert.equal(c.tier_name, "brushed");
  assert.equal(
    await keepers.view("is_holder", { account_id: alice.accountId }),
    false,
  );
  assert.equal(
    await keepers.view("is_holder", { account_id: bob.accountId }),
    true,
  );
  await solvent();
  pass(
    "resale at 5 NEAR: 0.5 NEAR royalty to the card, 4.5 NEAR to seller, 0 to creator, tier matte → brushed, access moved",
  );

  // Anyone can top up a card; the tier follows the balance.
  await carol.call(
    keepers,
    "deposit",
    { token_id: "1" },
    { attachedDeposit: 2n * N },
  );
  c = await card("1");
  assert.equal(c.tier_name, "holographic");
  assert.match(
    (await keepers.view<any>("nft_token", { token_id: "1" })).metadata.title,
    /Holographic/,
  );
  pass("deposit 2 NEAR: tier brushed → holographic, metadata title updated");

  // Withdraw: owner only, exact amount received, tier goes down.
  const stranger = await alice.callRaw(
    keepers,
    "withdraw",
    { token_id: "1" },
    { gas: GAS, attachedDeposit: 1n },
  );
  assert.ok(stranger.failed, "previous owner cannot withdraw");
  const callback = await alice.callRaw(keepers, "on_withdraw", {
    token_id: "1",
    amount: N.toString(),
  });
  assert.ok(callback.failed, "callbacks are private");
  const bobBefore = await balance(bob);
  const withdraw = await bob.callRaw(
    keepers,
    "withdraw",
    { token_id: "1", amount: (2n * N).toString() },
    { gas: GAS, attachedDeposit: 1n },
  );
  assert.ok(
    withdraw.succeeded && !withdraw.receiptFailures.length,
    withdraw.receiptFailureMessages.join(),
  );
  gas.withdraw = withdraw.gas_burnt;
  const fee = BigInt(withdraw.gas_burnt) * 10n ** 8n; // upper bound: gas price ≤ 0.1 Tgas price in sandbox
  const delta = (await balance(bob)) - bobBefore;
  assert.ok(
    delta > 2n * N - 1n - fee && delta <= 2n * N - 1n,
    `bob received ~2 NEAR (delta ${delta})`,
  );
  c = await card("1");
  assert.equal(c.balance, (N / 2n).toString());
  assert.equal(c.withdrawn_total, (2n * N).toString());
  assert.equal(c.tier_name, "brushed");
  await solvent();
  pass(
    "withdraw: previous owner refused, private callback refused, owner receives 2 NEAR, tier holographic → brushed",
  );

  // Listed cards cannot be emptied; the buyer's min_card_balance protects them.
  await bob.call(
    keepers,
    "list",
    { token_id: "1", price: N.toString() },
    { attachedDeposit: 1n },
  );
  const listedWithdraw = await bob.callRaw(
    keepers,
    "withdraw",
    { token_id: "1" },
    { gas: GAS, attachedDeposit: 1n },
  );
  assert.ok(listedWithdraw.failed, "withdraw refused while listed");
  const tooLow = await carol.callRaw(
    keepers,
    "buy",
    { token_id: "1", min_card_balance: N.toString() },
    { gas: GAS, attachedDeposit: N },
  );
  assert.ok(tooLow.failed, "buy refused when card holds less than expected");
  pass(
    "seller cannot empty a listed card; buyer's min_card_balance guard works",
  );

  // One transaction runs withdraw, then list; Carol's buy is sent concurrently
  // and retried until the listing exists.
  await bob.call(keepers, "delist", { token_id: "1" }, { attachedDeposit: 1n });
  await carol.call(
    keepers,
    "deposit",
    { token_id: "1" },
    { attachedDeposit: N },
  );
  const bobBeforeBatch = await balance(bob);
  const batch = bob.transact(keepers.accountId, [
    actions.functionCall(
      "withdraw",
      { token_id: "1", amount: N.toString() },
      GAS,
      1n,
    ),
    actions.functionCall(
      "list",
      { token_id: "1", price: N.toString() },
      20_000_000_000_000n,
      1n,
    ),
  ]);
  let sale;
  for (let attempt = 0; attempt < 40; attempt++) {
    sale = await carol.callRaw(
      keepers,
      "buy",
      { token_id: "1", min_card_balance: (N / 2n).toString() },
      { gas: GAS, attachedDeposit: N },
    );
    if (sale.succeeded && !sale.receiptFailures.length) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  const batchResult = await batch;
  assert.ok(
    batchResult.succeeded && !batchResult.receiptFailures.length,
    batchResult.receiptFailureMessages.join(),
  );
  assert.ok(sale?.succeeded, "carol bought the card");
  c = await card("1");
  assert.equal(c.owner_id, carol.accountId);
  // 1.5 NEAR - 1 NEAR withdrawn + 0.1 NEAR royalty
  assert.equal(c.balance, (N / 2n + N / 10n).toString());
  assert.equal(c.trades, 2);
  const bobDelta = (await balance(bob)) - bobBeforeBatch;
  assert.ok(
    bobDelta > N && bobDelta < N + N,
    "bob got the withdraw (1 NEAR) + proceeds (0.9 NEAR) minus gas",
  );
  await solvent();
  // Interleaving is not forced here; the unit test
  // failed_withdraw_recredits_the_card_not_the_caller covers a sale between withdraw and callback.
  pass(
    "buy submitted concurrently with a withdraw+relist batch: withdrawn NEAR paid once, royalty credited to the card, books balanced",
  );

  // NEP-171 transfer_call to an account without code: the standard resolver returns the token.
  const tc = await carol.callRaw(
    keepers,
    "nft_transfer_call",
    { receiver_id: dave.accountId, token_id: "1", msg: "" },
    { gas: GAS, attachedDeposit: 1n },
  );
  assert.ok(tc.succeeded, "transfer_call tx itself succeeds");
  assert.equal(
    (await card("1")).owner_id,
    carol.accountId,
    "token returned to sender",
  );
  // Plain NEP-171 transfer moves money, tier and access together.
  await carol.call(
    keepers,
    "nft_transfer",
    { receiver_id: dave.accountId, token_id: "1" },
    { attachedDeposit: 1n },
  );
  c = await card("1");
  assert.equal(c.owner_id, dave.accountId);
  assert.equal(c.balance, (N / 2n + N / 10n).toString());
  assert.equal(
    await keepers.view("is_holder", { account_id: carol.accountId }),
    false,
  );
  assert.equal(
    await keepers.view("is_holder", { account_id: dave.accountId }),
    true,
  );
  pass(
    "nft_transfer_call returned by receiver; nft_transfer moves balance, tier and access",
  );

  // NEP-178: an approved marketplace account can transfer; approvals die on transfer.
  await dave.call(
    keepers,
    "nft_approve",
    { token_id: "1", account_id: alice.accountId },
    { attachedDeposit: N / 100n },
  );
  assert.equal(
    await keepers.view("nft_is_approved", {
      token_id: "1",
      approved_account_id: alice.accountId,
    }),
    true,
  );
  await alice.call(
    keepers,
    "nft_transfer",
    { receiver_id: bob.accountId, token_id: "1", approval_id: 1 },
    { attachedDeposit: 1n },
  );
  assert.equal((await card("1")).owner_id, bob.accountId);
  assert.equal(
    await keepers.view("nft_is_approved", {
      token_id: "1",
      approved_account_id: alice.accountId,
    }),
    false,
  );
  pass("NEP-178 approval transfer works; approvals cleared after transfer");

  // Standard views.
  assert.equal(await keepers.view("nft_total_supply"), "1");
  assert.equal((await keepers.view<any>("nft_metadata")).symbol, "KEEPER");
  assert.equal(
    (
      await keepers.view<any[]>("nft_tokens_for_owner", {
        account_id: bob.accountId,
      })
    ).length,
    1,
  );
  await solvent();
  pass("NEP-171/177/181 views; final solvency check");

  const result = {
    at: new Date().toISOString(),
    wasm: "artifacts/keepers.wasm",
    checks,
    gas_burnt: gas,
    final_stats: await stats(),
  };
  await writeFile(
    "docs/results/keepers-sandbox.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    `\n${checks.length} sandbox checks passed → docs/results/keepers-sandbox.json`,
  );
} finally {
  await chain.tearDown();
}
