/** Real WASM feasibility gate, deliberately before the series/market UI. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { startChain } from "./chain.js";
import {
  ml_dsa65,
  units,
  initProof,
  recipientProof,
  authorize,
  envelope,
  type Snapshot,
  type Action,
} from "../packages/shared/index.js";
const chain = await startChain();
const N = 10n ** 24n,
  GAS = 280_000_000_000_000n;
const checks: string[] = [];
const gas: Record<string, string> = {};
function pass(name: string) {
  checks.push(name);
  console.log("✓", name);
}
try {
  const root = chain.rootAccount;
  const alice = await root.createSubAccount("alice", {
    initialBalance: 100n * N,
  });
  const bob = await root.createSubAccount("bob", { initialBalance: 50n * N });
  const agent = await root.createSubAccount("agent", {
    initialBalance: 30n * N,
  });
  const collection = await root.createSubAccount("market", {
    initialBalance: 50n * N,
  });
  const token = await root.createSubAccount("demousd", {
    initialBalance: 30n * N,
  });
  const strategy = await root.createSubAccount("strategy", {
    initialBalance: 30n * N,
  });
  for (const [account, file] of [
    [token, "demo_token"],
    [strategy, "strategy"],
    [collection, "collection"],
  ] as const)
    await account.deploy(`artifacts/${file}.wasm`);
  await token.call(token, "new", {
    owner_id: alice.accountId,
    total_supply: units("1000").toString(),
  });
  await strategy.call(strategy, "new", { asset: token.accountId });
  await collection.call(collection, "new", {
    network: "sandbox",
    asset: token.accountId,
    strategy: strategy.accountId,
  });
  for (const account of [token, strategy, collection]) {
    await account
      .batch(account)
      .deleteKey((await account.getKey())!.getPublicKey())
      .transact();
    assert.deepEqual(
      (await account.viewAccessKeys(account.accountId)).keys,
      [],
    );
  }
  const ownerKeys = ml_dsa65.keygen(),
    buyerKeys = ml_dsa65.keygen();
  const id = "position." + collection.accountId;
  const wallet = root.getAccount(id);
  await alice.call(
    collection,
    "create_plan",
    {
      name: "position",
      ...initProof(
        ownerKeys,
        "sandbox",
        id,
        collection.accountId,
        alice.accountId,
      ),
    },
    { attachedDeposit: 6n * N, gas: GAS },
  );
  await alice.call(wallet, "sync", {}, { gas: GAS });
  assert.deepEqual((await wallet.viewAccessKeys(id)).keys, []);
  const snap = () => wallet.view<Snapshot>("snapshot");
  const now = async () =>
    BigInt(
      (await wallet.rpc("block", { finality: "final" })).header
        .timestamp_nanosec,
    );
  const send = async (action: Action, keys = ownerKeys) =>
    alice.callRaw(
      wallet,
      "execute",
      authorize(
        keys,
        envelope(
          await snap(),
          action,
          ((await now()) + 600_000_000_000n).toString(),
        ),
      ),
      { gas: GAS },
    );
  for (const receiver of [
    bob.accountId,
    collection.accountId,
    strategy.accountId,
    id,
  ])
    await alice.call(
      token,
      "storage_deposit",
      { account_id: receiver, registration_only: true },
      { attachedDeposit: N / 10n },
    );
  await alice.call(
    strategy,
    "register_position",
    { wallet: id },
    { attachedDeposit: N / 50n },
  );
  await alice.call(
    token,
    "ft_transfer_call",
    { receiver_id: id, amount: units("100").toString(), msg: id },
    { attachedDeposit: 1n, gas: GAS },
  );
  const delegation = {
    agent: agent.accountId,
    asset: token.accountId,
    strategy: strategy.accountId,
    max_operation: units("10").toString(),
    max_period: units("20").toString(),
    allocation_bps: 2000,
    expires_at: ((await now()) + 800_000_000_000n).toString(),
    ownership_epoch: "0",
    policy_version: "1",
  };
  let result = await send({
    SetPolicy: { policy: delegation, horizon_years: 1, target_bps: 0 },
  });
  assert.equal(result.receiptFailures.length, 0);
  gas.delegation = result.gas_burnt;
  await agent.call(
    wallet,
    "agent_allocate",
    {
      amount: units("10").toString(),
      ownership_epoch: "0",
      policy_version: "1",
    },
    { gas: GAS },
  );
  result = await send({
    Redeem: { asset: token.accountId, amount: units("10").toString() },
  });
  assert.equal(result.receiptFailures.length, 0);
  assert.equal((await snap()).principal, "0");
  pass("allocation réelle puis dénouement avant gel");
  const consentExpiry = ((await now()) + 800_000_000_000n).toString();
  await bob.call(
    wallet,
    "register_recipient",
    recipientProof(buyerKeys, await snap(), bob.accountId, consentExpiry),
    { attachedDeposit: N / 10n, gas: GAS },
  );
  const expiry = ((await now()) + 600_000_000_000n).toString();
  const quote = await wallet.view<{ id: string; valuation_hash: string }>(
    "sale_quote",
    { price: units("97").toString(), expires_at: expiry },
  );
  result = await send({
    List: {
      id: quote.id,
      price: units("97").toString(),
      payment_token: token.accountId,
      expires_at: expiry,
      valuation_hash: quote.valuation_hash,
    },
  });
  assert.equal(result.receiptFailures.length, 0, JSON.stringify(result.result));
  gas.list = result.gas_burnt;
  let sale = await collection.view<any>("listing", {
    position: id,
    id: quote.id,
  });
  assert.equal(sale.state, "Active");
  assert.equal((await snap()).status, "SaleLocked");
  pass("annonce active seulement après gel ML-DSA réel du wallet");
  result = await send({
    Withdraw: {
      asset: token.accountId,
      amount: units("1").toString(),
      beneficiary: alice.accountId,
    },
  });
  assert.ok(
    result.receiptFailureMessages.some((m) => m.includes("SALE_LOCKED")),
  );
  pass("retrait signé refusé pendant l’annonce");
  await alice.call(
    token,
    "ft_transfer",
    { receiver_id: bob.accountId, amount: units("900").toString() },
    { attachedDeposit: 1n },
  );
  await alice.call(
    token,
    "storage_unregister",
    { force: false },
    { attachedDeposit: 1n },
  );
  const balance = (account: string) =>
    token.view<string>("ft_balance_of", { account_id: account });
  const before = await balance(bob.accountId);
  const msg = JSON.stringify({
    position: id,
    id: quote.id,
    valuation_hash: quote.valuation_hash,
  });
  result = await bob.callRaw(
    token,
    "ft_transfer_call",
    { receiver_id: collection.accountId, amount: units("96").toString(), msg },
    { attachedDeposit: 1n, gas: GAS },
  );
  assert.ok(
    result.receiptFailureMessages.some((m) =>
      m.includes("EXACT_PRICE_REQUIRED"),
    ),
  );
  assert.equal(await balance(bob.accountId), before);
  assert.equal((await snap()).owner_id, alice.accountId);
  pass("prix incorrect remboursé par NEP-141 sans transfert de contrôle");
  result = await bob.callRaw(
    token,
    "ft_transfer_call",
    { receiver_id: collection.accountId, amount: units("97").toString(), msg },
    { attachedDeposit: 1n, gas: GAS },
  );
  gas.purchase = result.gas_burnt;
  for (let i = 0; i < 5; i++) {
    sale = await collection.view<any>("listing", {
      position: id,
      id: quote.id,
    });
    if (sale.state === "Settled") break;
    await bob.call(
      collection,
      "resume_sale",
      { position: id, id: quote.id },
      { gas: GAS },
    );
  }
  assert.equal(sale.state, "Settled", JSON.stringify(sale));
  await bob.call(
    collection,
    "release_settled",
    { position: id, id: quote.id },
    { gas: GAS },
  );
  const after = await snap();
  assert.equal(after.owner_id, bob.accountId);
  assert.equal(after.account_id, id);
  assert.equal(after.available, units("100").toString());
  assert.equal(after.policy, null);
  assert.equal(after.agent_paused, true);
  assert.equal(after.status, "Active");
  const item = await collection.view<any>("nft_token", { token_id: id });
  assert.equal(item.owner_id, bob.accountId);
  assert.equal(item.ownership_epoch, after.ownership_epoch);
  pass(
    "contrôle transmis, NFT synchronisé, compte/actifs conservés, ancienne délégation supprimée",
  );
  const claim = await collection.view<any>("sale_claim", {
    position: id,
    id: quote.id,
  });
  assert.equal(claim.state, "Claimable");
  assert.equal(claim.beneficiary, alice.accountId);
  assert.equal(claim.amount, units("97").toString());
  assert.equal(
    await balance(bob.accountId),
    (BigInt(before) - units("97")).toString(),
  );
  assert.equal(await balance(collection.accountId), units("97").toString());
  pass(
    "versement vendeur échoué après transfert : créance vendeur, aucun remboursement acheteur",
  );
  result = await send(
    {
      Withdraw: {
        asset: token.accountId,
        amount: units("1").toString(),
        beneficiary: alice.accountId,
      },
    },
    ownerKeys,
  );
  assert.ok(
    result.receiptFailureMessages.some((m) => m.includes("ML_DSA_INVALID")),
  );
  pass("ancienne clé refusée même sur enveloppe de génération courante");
  result = await agent.callRaw(
    wallet,
    "agent_allocate",
    {
      amount: units("1").toString(),
      ownership_epoch: after.ownership_epoch,
      policy_version: after.policy_version,
    },
    { gas: GAS },
  );
  assert.ok(
    result.receiptFailureMessages.some((m) => m.includes("AGENT_REVOKED")),
  );
  pass("ancien agent sans autorité après vente");
  await alice.call(
    token,
    "storage_deposit",
    { account_id: alice.accountId, registration_only: true },
    { attachedDeposit: N / 10n },
  );
  await bob.call(
    collection,
    "claim_sale",
    { position: id, id: quote.id },
    { gas: GAS },
  );
  assert.equal(await balance(alice.accountId), units("97").toString());
  assert.equal(await balance(collection.accountId), "0");
  result = await bob.callRaw(
    collection,
    "claim_sale",
    { position: id, id: quote.id },
    { gas: GAS },
  );
  assert.ok(
    result.receiptFailureMessages.some((m) =>
      m.includes("CLAIM_NOT_AVAILABLE"),
    ),
  );
  assert.equal(await balance(alice.accountId), units("97").toString());
  pass("réclamation fixe payée une seule fois, seconde demande refusée");
  const report = {
    date: new Date().toISOString(),
    scope:
      "Feasibility of real escrow/control/payout protocol before series integration. NOT a complete Option 2 implementation or testnet proof.",
    checks,
    gas,
    keysRemoved: true,
  };
  await writeFile(
    "docs/results/settlement-feasibility.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await chain.tearDown();
}
