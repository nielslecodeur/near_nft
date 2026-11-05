/** Real WASM feasibility gate, deliberately before the series/market UI. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { startChain } from "./chain.js";
import { proveMarketplace } from "./marketplace-proof.js";
import { settleSandboxFinality } from "./harness.js";
import {
  ml_dsa65,
  bytes,
  b64,
  units,
  initProof,
  recipientProof,
  authorize,
  envelope,
  type Snapshot,
  type Action,
} from "../packages/shared/index.js";
const chain = await startChain({ epochLength: 10000 });
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
  const admin = ml_dsa65.keygen();
  const clock = async () =>
    BigInt(
      (await root.rpc("block", { finality: "final" })).header.timestamp_nanosec,
    );
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
    admin_key: b64(admin.publicKey),
  });
  const start = await clock();
  const series = {
    id: "demo-1",
    name: "Everkeep demo — échéance fixe",
    opens_at: (start + 60_000_000_000n).toString(),
    closes_at: (
      start +
      (process.argv.includes("--serve")
        ? 7_200_000_000_000n
        : 1_800_000_000_000n)
    ).toString(),
    matures_at: (
      start +
      (process.argv.includes("--serve")
        ? 14_400_000_000_000n
        : 3_600_000_000_000n)
    ).toString(),
    asset: token.accountId,
    strategy: strategy.accountId,
    capacity: units("1000").toString(),
    minimum: units("10").toString(),
    allocation_bps: 2000,
    max_operation: units("10").toString(),
    max_period: units("20").toString(),
    version: "1",
  };
  const adminMessage = bytes(
    JSON.stringify({
      protocol: "EVERKEEP_ADMIN_V1",
      network: "sandbox",
      verifier: collection.accountId,
      nonce: "0",
      expires_at: (start + 600_000_000_000n).toString(),
      action: { Configure: { series } },
    }),
  );
  await alice.call(
    collection,
    "administer",
    {
      message: b64(adminMessage),
      signature: b64(ml_dsa65.sign(adminMessage, admin.secretKey)),
    },
    { gas: GAS },
  );
  let replay = await alice.callRaw(
    collection,
    "administer",
    {
      message: b64(adminMessage),
      signature: b64(ml_dsa65.sign(adminMessage, admin.secretKey)),
    },
    { gas: GAS },
  );
  assert.ok(
    replay.receiptFailureMessages.some((m) =>
      m.includes("ADMIN_NONCE_OR_EXPIRY"),
    ),
  );
  pass("administration ML-DSA réelle, rejeu refusé");
  const advance = async (target: bigint) => {
    for (let i = 0; i < 200 && (await clock()) < target; i++)
      await root.rpc("sandbox_fast_forward", {
        delta_height: target - (await clock()) > 600_000_000_000n ? 5000 : 500,
      });
    assert.ok((await clock()) >= target, "sandbox timestamp reached target");
    await settleSandboxFinality(root);
  };
  await advance(BigInt(series.opens_at));
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
  if (process.argv.includes("--serve"))
    await (
      await import("./series-api.js")
    ).serveSeries({
      root,
      alice,
      bob,
      agent,
      collection,
      token,
      strategy,
      series,
      wallet,
      id,
      ownerKeys,
      buyerKeys,
      clock,
      missions: process.argv.includes("--missions")
        ? await (
            await import("./missions-service.js")
          ).deployMissions(root, agent, [collection])
        : undefined,
    });
  assert.equal(await collection.view("nft_token", { token_id: id }), null);
  const small = await alice.callRaw(
    token,
    "ft_transfer_call",
    {
      receiver_id: collection.accountId,
      amount: units("1").toString(),
      msg: JSON.stringify({ Subscribe: id }),
    },
    { attachedDeposit: 1n, gas: GAS },
  );
  assert.ok(
    small.receiptFailureMessages.some((m) =>
      m.includes("SUBSCRIPTION_CAPACITY_OR_MINIMUM"),
    ),
  );
  assert.equal((await snap()).available, "0");
  pass("below-minimum subscription refunded before credit or mint");
  await alice.call(
    token,
    "ft_transfer_call",
    {
      receiver_id: collection.accountId,
      amount: units("100").toString(),
      msg: JSON.stringify({ Subscribe: id }),
    },
    { attachedDeposit: 1n, gas: GAS },
  );
  assert.equal((await snap()).available, units("100").toString());
  assert.equal(
    (await collection.view<any>("subscription", { position: id })).state,
    "Funded",
  );
  assert.equal(
    (await collection.view<any>("nft_token", { token_id: id })).owner_id,
    alice.accountId,
  );
  pass("souscription exacte 100, NFT émis après crédit seulement");
  await proveMarketplace({ root, alice, bob, collection, token, clock, pass });
  let refusal = await send({
    Withdraw: {
      asset: token.accountId,
      amount: units("1").toString(),
      beneficiary: alice.accountId,
    },
  });
  assert.ok(
    refusal.receiptFailureMessages.some((m) =>
      m.includes("CAPITAL_LOCKED_UNTIL_MATURITY"),
    ),
  );
  pass("capital verrouillé avant échéance malgré signature valide");
  refusal = await alice.callRaw(
    token,
    "ft_transfer_call",
    { receiver_id: id, amount: units("1").toString(), msg: id },
    { attachedDeposit: 1n, gas: GAS },
  );
  assert.ok(
    refusal.receiptFailureMessages.some((m) =>
      m.includes("SINGLE_INITIAL_SUBSCRIPTION_ONLY"),
    ),
  );
  assert.equal((await snap()).available, units("100").toString());
  pass("apport ultérieur refusé et remboursé");
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
  const admin2 = async (action: unknown) =>
    bytes(
      JSON.stringify({
        protocol: "EVERKEEP_ADMIN_V1",
        network: "sandbox",
        verifier: collection.accountId,
        nonce: "1",
        expires_at: ((await clock()) + 600_000_000_000n).toString(),
        action,
      }),
    );
  let adminBytes = await admin2({
    Configure: { series: { ...series, allocation_bps: 9000 } },
  });
  let adminResult = await bob.callRaw(
    collection,
    "administer",
    {
      message: b64(adminBytes),
      signature: b64(ml_dsa65.sign(adminBytes, admin.secretKey)),
    },
    { gas: GAS },
  );
  assert.ok(
    adminResult.receiptFailureMessages.some((m) =>
      m.includes("SERIES_IMMUTABLE"),
    ),
  );
  pass("even genuine admin cannot broaden existing mandate");
  adminBytes = await admin2({
    Close: { mandate_hash: (await snap()).series!.mandate_hash },
  });
  adminResult = await bob.callRaw(
    collection,
    "administer",
    {
      message: b64(adminBytes),
      signature: b64(ml_dsa65.sign(adminBytes, buyerKeys.secretKey)),
    },
    { gas: GAS },
  );
  assert.ok(
    adminResult.receiptFailureMessages.some((m) =>
      m.includes("ML_DSA_INVALID"),
    ),
  );
  await bob.call(
    collection,
    "administer",
    {
      message: b64(adminBytes),
      signature: b64(ml_dsa65.sign(adminBytes, admin.secretKey)),
    },
    { gas: GAS },
  );
  assert.equal((await collection.view<any>("series")).closed, true);
  pass(
    "close subscriptions requires real admin ML-DSA without changing position rights",
  );
  let result = await send({
    SetPolicy: { policy: delegation, horizon_years: 0, target_bps: 0 },
  });
  assert.equal(result.receiptFailures.length, 0);
  gas.delegation = result.gas_burnt;
  result = await send({
    SetPolicy: {
      policy: {
        ...delegation,
        policy_version: "2",
        max_operation: units("11").toString(),
      },
      horizon_years: 0,
      target_bps: 0,
    },
  });
  assert.ok(
    result.receiptFailureMessages.some((m) =>
      m.includes("SERIES_MANDATE_LIMIT"),
    ),
  );
  pass("owner delegation cannot broaden the series mandate");
  result = await agent.callRaw(
    wallet,
    "agent_allocate",
    {
      amount: units("11").toString(),
      ownership_epoch: "0",
      policy_version: "1",
    },
    { gas: GAS },
  );
  assert.ok(
    result.receiptFailureMessages.some((m) => m.includes("AGENT_BUDGET")),
  );
  pass("agent execution above cap rejected on chain");
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
  let expiry = ((await now()) + 600_000_000_000n).toString();
  let quote = await wallet.view<{ id: string; valuation_hash: string }>(
    "sale_quote",
    { price: units("97").toString(), expires_at: expiry },
  );
  const listingAction = () =>
    ({
      List: {
        id: quote.id,
        price: units("97").toString(),
        payment_token: token.accountId,
        expires_at: expiry,
        valuation_hash: quote.valuation_hash,
      },
    }) as Action;
  result = await send(listingAction());
  assert.equal(result.receiptFailures.length, 0);
  result = await send({ CancelListing: { id: quote.id } });
  assert.equal(result.receiptFailures.length, 0);
  assert.equal((await snap()).status, "Active");
  assert.equal(
    (await collection.view<any>("listing", { position: id, id: quote.id }))
      .state,
    "Cancelled",
  );
  pass("signed cancellation waits for acknowledgement before unfreezing");
  expiry = ((await now()) + 30_000_000_000n).toString();
  quote = await wallet.view("sale_quote", {
    price: units("97").toString(),
    expires_at: expiry,
  });
  await send(listingAction());
  await advance(BigInt(expiry));
  result = await alice.callRaw(
    token,
    "ft_transfer_call",
    {
      receiver_id: collection.accountId,
      amount: units("97").toString(),
      msg: JSON.stringify({
        position: id,
        id: quote.id,
        valuation_hash: quote.valuation_hash,
      }),
    },
    { attachedDeposit: 1n, gas: GAS },
  );
  assert.ok(
    result.receiptFailureMessages.some((m) =>
      m.includes("LISTING_UNAVAILABLE"),
    ),
  );
  await bob.call(
    collection,
    "expire_listing",
    { position: id, id: quote.id },
    { gas: GAS },
  );
  assert.equal((await snap()).status, "Active");
  assert.equal((await snap()).owner_id, alice.accountId);
  pass("expired listing rejects payment and releases through durable abort");
  expiry = ((await now()) + 600_000_000_000n).toString();
  quote = await wallet.view("sale_quote", {
    price: units("97").toString(),
    expires_at: expiry,
  });
  const badAuthorization = authorize(
    buyerKeys,
    envelope(
      await snap(),
      {
        List: {
          id: quote.id,
          price: units("97").toString(),
          payment_token: token.accountId,
          expires_at: expiry,
          valuation_hash: quote.valuation_hash,
        },
      },
      expiry,
    ),
  );
  const staleAuthorization = authorize(
    ownerKeys,
    envelope(await snap(), listingAction(), expiry),
  );
  result = await bob.callRaw(wallet, "execute", badAuthorization, { gas: GAS });
  assert.ok(
    result.receiptFailureMessages.some((m) => m.includes("ML_DSA_INVALID")),
  );
  assert.equal((await snap()).status, "Active");
  pass("invalid ML-DSA listing cannot freeze the position");
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
  for (const action of [
    "Revoke",
    { Redeem: { asset: token.accountId, amount: units("1").toString() } },
    { Rotate: { public_key: b64(buyerKeys.publicKey) } },
    {
      Transfer: {
        owner_id: bob.accountId,
        public_key: b64(buyerKeys.publicKey),
      },
    },
  ] as Action[]) {
    result = await send(action);
    assert.ok(
      result.receiptFailureMessages.some((m) => m.includes("SALE_LOCKED")),
    );
  }
  pass(
    "listing freezes delegation, redemption, rotation and direct control transfer",
  );
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
    {
      receiver_id: bob.accountId,
      amount: await token.view<string>("ft_balance_of", {
        account_id: alice.accountId,
      }),
    },
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
    collection,
    "ft_on_transfer",
    { sender_id: bob.accountId, amount: units("97").toString(), msg },
    { gas: GAS },
  );
  assert.ok(result.receiptFailureMessages.some((m) => m.includes("FT_ONLY")));
  assert.equal((await snap()).owner_id, alice.accountId);
  pass("non-asset predecessor cannot trigger settlement");
  result = await bob.callRaw(
    token,
    "ft_transfer_call",
    {
      receiver_id: collection.accountId,
      amount: units("97").toString(),
      msg: JSON.stringify({
        position: id,
        id: quote.id,
        valuation_hash: b64(new Uint8Array(32)),
      }),
    },
    { attachedDeposit: 1n, gas: GAS },
  );
  assert.ok(
    result.receiptFailureMessages.some((m) => m.includes("STALE_VALUATION")),
  );
  assert.equal(await balance(bob.accountId), before);
  pass("stale valuation refunded without changing owner");
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
  result = await alice.callRaw(wallet, "execute", staleAuthorization, {
    gas: GAS,
  });
  assert.ok(
    result.receiptFailureMessages.some((m) => m.includes("STALE_GENERATION")),
  );
  pass("pre-sale signature replay rejected after transfer");
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
  assert.equal(
    ((await snap()) as any).series.terms.matures_at,
    series.matures_at,
  );
  const immutable = ((await snap()) as any).series;
  await advance(BigInt(series.matures_at));
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
    result.receiptFailureMessages.some((m) =>
      m.includes("SERIES_NOT_INVESTABLE"),
    ),
  );
  pass("maturity prevents every new allocation");
  result = await send(
    {
      Withdraw: {
        asset: token.accountId,
        amount: units("100").toString(),
        beneficiary: bob.accountId,
      },
    },
    buyerKeys,
  );
  assert.equal(result.receiptFailures.length, 0, JSON.stringify(result.result));
  assert.equal((await snap()).available, "0");
  assert.equal((await snap()).withdrawals, units("100").toString());
  assert.deepEqual(((await snap()) as any).series, immutable);
  pass(
    "échéance absolue atteinte par fast-forward, Bob retire 100, mandat conservé",
  );
  const report = {
    date: new Date().toISOString(),
    scope:
      "Real WASM series subscription, immutable mandate, escrow/control/payout and maturity demo. Not a testnet or exhaustive adversarial proof.",
    checks,
    gas,
    keysRemoved: true,
  };
  await writeFile(
    "docs/results/series-demo.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await chain.tearDown();
}
