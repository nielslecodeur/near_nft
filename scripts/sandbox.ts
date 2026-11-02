import type { SandboxAccount as NearAccount } from "./harness.js";
import { startChain } from "./chain.js";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import {
  ml_dsa65,
  initProof,
  recipientProof,
  authorize,
  envelope,
  b64,
  units,
  verifyPair,
  type Keys,
  type Snapshot,
  type Action,
} from "../packages/shared/index.js";
import { propose } from "../packages/agent/index.js";
import { interpret } from "../packages/agent/index.js";
import { createServer } from "node:http";

const N = 10n ** 24n,
  GAS = 200_000_000_000_000n;
const worker = await startChain();
const checks: string[] = [],
  measurements: Record<string, unknown> = {};
function pass(name: string) {
  checks.push(name);
  console.log("✓", name);
}
const expectedReasons:Record<string,string>={
  "initialisation unique":"NAME_RESERVED",
  "faux FT refusé":"FT_ONLY",
  "callback externe refusé":"private",
  "faux item refusé":"UNKNOWN_ITEM",
  "rejeu du nonce refusé":"NONCE",
  "rejeu d’un ancien mandat refusé":"STALE_GENERATION",
  "plafond agent imposé par le contrat":"AGENT_BUDGET",
  "double distribution refusée":"ALREADY_DISTRIBUTED_OR_PENDING",
  "message altéré refusé par ML-DSA":"ML_DSA_INVALID",
  "rejeu inter-réseau refusé":"DOMAIN",
  "rejeu inter-NFT refusé":"NFT_DOMAIN",
  "signature expirée refusée":"EXPIRED_OR_TOO_LONG",
  "rotation sans preuve de nouvelle clé refusée":"NEW_KEY_PROOF_REQUIRED",
  "rotation signée par un tiers refusée":"ML_DSA_INVALID",
  "ancienne génération de signature refusée":"STALE_GENERATION",
  "ancienne clé refusée sur un message de génération courante":"ML_DSA_INVALID",
  "ancien propriétaire sans autorité":"OWNER_ONLY",
  "signature pré-transfert refusée":"STALE_GENERATION",
  "clé du vendeur sans autorité après transfert":"ML_DSA_INVALID",
  "ancien agent révoqué au transfert":"AGENT_REVOKED",
  "transfert NFT classique ne contourne pas ML-DSA":"SIGNED_AUTHORIZATION_REQUIRED_IN_MEMO",
  "transfer_call sans autorisation ML-DSA refusé":"SIGNED_AUTHORIZATION_REQUIRED_IN_MEMO",
  "autorisation du transfert rejeté non rejouable":"STALE_GENERATION",
  "signature du détenteur temporaire refusée après retour":"STALE_GENERATION",
};
function assertReason(result:{receiptFailureMessages:string[]},name:string){
  const expected=expectedReasons[name];
  assert.ok(expected,'Missing expected rejection reason for '+name);
  assert.ok(result.receiptFailureMessages.some(message=>message.toLowerCase().includes(expected.toLowerCase())),`Expected ${expected}, got ${result.receiptFailureMessages.join('; ')}`);
}
try {
  const root = worker.rootAccount;
  const alice = await root.createSubAccount("alice", {
    initialBalance: 100n * N,
  });
  const bob = await root.createSubAccount("bob", { initialBalance: 30n * N });
  const agent = await root.createSubAccount("agent", {
    initialBalance: 30n * N,
  });
  const collection = await root.createSubAccount("everkeep", {
    initialBalance: 30n * N,
  });
  const token = await root.createSubAccount("demousd", {
    initialBalance: 20n * N,
  });
  const strategy = await root.createSubAccount("strategy", {
    initialBalance: 20n * N,
  });
  for (const [account, file] of [
    [token, "demo_token"],
    [strategy, "strategy"],
    [collection, "collection"],
  ] as const)
    await account.deploy(`artifacts/${file}.wasm`);
  await token.call(token, "new", {
    owner_id: alice.accountId,
    total_supply: units("1000000").toString(),
  });
  await strategy.call(strategy, "new", { asset: token.accountId });
  await collection.call(collection, "new", {
    network: "sandbox",
    asset: token.accountId,
    strategy: strategy.accountId,
  });
  // Remove every deployment access key before proving the invariants.
  for (const account of [token, strategy, collection]) {
    const key = (await account.getKey())!;
    try {
      await account.batch(account).deleteKey(key.getPublicKey()).transact();
    } catch (error) {
      // A retrying legacy client can ask for the nonce after successful DeleteKey.
      // Accept only if an independent RPC read proves the account has zero keys.
      if ((await account.viewAccessKeys(account.accountId)).keys.length !== 0)
        throw error;
    }
    assert.deepEqual(
      (await account.viewAccessKeys(account.accountId)).keys,
      [],
    );
  }
  let id = "avenir." + collection.accountId;
  const keys = ml_dsa65.keygen(),
    next = ml_dsa65.keygen(),
    bobKeys = ml_dsa65.keygen();
  let wallet = root.getAccount(id);
  const raw = await alice.callRaw(
    collection,
    "create_plan",
    {
      name: "avenir",
      ...initProof(keys, "sandbox", id, collection.accountId, alice.accountId),
    },
    { gas: GAS, attachedDeposit: 6n * N },
  );
  assert.ok(raw.succeeded, JSON.stringify(raw));
  assert.ok(await wallet.exists(), "wallet creation failed");
  await alice.call(wallet, "sync", {}, { gas: GAS });
  const snap = () => wallet.view<Snapshot>("snapshot");
  let s = await snap();
  assert.equal(s.status, "Active");
  assert.deepEqual((await wallet.viewAccessKeys(id)).keys, []);
  pass("mint + ML-DSA-65 réelle dans le WASM + comptes sans access key");
  async function send(action: Action, k: Keys = keys, nextKey?: Keys) {
    const state = await snap();
    return alice.callRaw(
      wallet,
      "execute",
      authorize(k, envelope(state, action), nextKey),
      { gas: GAS },
    );
  }
  async function denied(
    who: NearAccount,
    target: NearAccount,
    method: string,
    args: Record<string, unknown>,
    name: string,
    deposit = 0n,
  ) {
    const result = await who.callRaw(target, method, args, {
      gas: GAS,
      attachedDeposit: deposit,
    });
    assert.ok(
      result.failed || result.receiptFailures.length > 0,
      "Unexpected acceptance: " + name,
    );
    assertReason(result,name);pass(name);
  }
  async function signedDenied(action: Action, name: string, k = keys) {
    const result = await send(action, k);
    assert.ok(
      result.failed || result.receiptFailures.length > 0,
      "Unexpected acceptance: " + name,
    );
    assertReason(result,name);pass(name);
  }
  await denied(
    alice,
    collection,
    "create_plan",
    {
      name: "avenir",
      ...initProof(keys, "sandbox", id, collection.accountId, alice.accountId),
    },
    "initialisation unique",
    6n * N,
  );
  await denied(
    alice,
    wallet,
    "ft_on_transfer",
    { sender_id: alice.accountId, amount: "1000", msg: id },
    "faux FT refusé",
  );
  await denied(
    alice,
    wallet,
    "on_payment",
    { id: "1" },
    "callback externe refusé",
  );
  await denied(
    alice,
    collection,
    "sync_item",
    { owner_id: alice.accountId, sequence: "999", epoch: "999" },
    "faux item refusé",
  );
  for (const account of [wallet, bob, strategy])
    await alice.call(
      token,
      "storage_deposit",
      { account_id: account.accountId },
      { attachedDeposit: N / 100n },
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
    {
      receiver_id: strategy.accountId,
      amount: units("100").toString(),
      msg: "reserve",
    },
    { attachedDeposit: 1n, gas: GAS },
  );
  await alice.call(
    token,
    "ft_transfer_call",
    { receiver_id: id, amount: units("1000").toString(), msg: id },
    { attachedDeposit: 1n, gas: GAS },
  );
  s = await snap();
  assert.equal(s.available, units("1000").toString());
  pass("dépôt réel de 1 000 demoUSD et réserve préfinancée");
  const policy = {
    agent: agent.accountId,
    asset: token.accountId,
    strategy: strategy.accountId,
    max_operation: units("100").toString(),
    max_period: units("200").toString(),
    allocation_bps: 2000,
    expires_at: (
      BigInt(Date.now()) * 1_000_000n +
      80_000_000_000_000n
    ).toString(),
    ownership_epoch: s.ownership_epoch,
    policy_version: "1",
  };
  const policyAction: Action = {
    SetPolicy: { policy, horizon_years: 10, target_bps: 400 },
  };
  const policyMsg = authorize(keys, envelope(s, policyAction));
  const policyResult = await alice.callRaw(wallet, "execute", policyMsg, {
    gas: GAS,
  });
  assert.ok(
    policyResult.succeeded && !policyResult.receiptFailures.length,
    JSON.stringify(policyResult),
  );
  measurements.policy_total_gas = policyResult.gas_burnt.toString();
  measurements.message_bytes = Buffer.from(policyMsg.message, "base64").length;
  pass("mandat ML-DSA confirmé : objectif 4 %, allocation maximum 20 %");
  await denied(alice, wallet, "execute", policyMsg, "rejeu d’un ancien mandat refusé");
  s = await snap();
  const proposal = propose(s, s.policy, BigInt(Date.now()) * 1_000_000n);
  await agent.call(
    wallet,
    "agent_allocate",
    {
      amount: proposal.amount,
      ownership_epoch: s.ownership_epoch,
      policy_version: s.policy_version,
    },
    { gas: GAS },
  );
  s = await snap();
  assert.equal(s.principal, units("100").toString());
  assert.equal(s.available, units("900").toString());
  pass(
    "allocation réelle de 100 demoUSD, comptabilité réservée puis finalisée",
  );
  await denied(
    agent,
    wallet,
    "agent_allocate",
    {
      amount: units("101").toString(),
      ownership_epoch: s.ownership_epoch,
      policy_version: s.policy_version,
    },
    "plafond agent imposé par le contrat",
  );
  await alice.call(strategy, "distribute", { wallet: id }, { gas: GAS });
  s = await snap();
  assert.equal(s.realized_gains, units("1").toString());
  pass("distribution de 1 demoUSD depuis une réserve réelle de test");
  await denied(
    alice,
    strategy,
    "distribute",
    { wallet: id },
    "double distribution refusée",
  );
  const withdraw: Action = {
    Withdraw: {
      asset: token.accountId,
      amount: units("10").toString(),
      beneficiary: bob.accountId,
    },
  };
  const original = envelope(s, withdraw);
  const tampered = authorize(keys, original);
  const decoded = JSON.parse(
    Buffer.from(tampered.message, "base64").toString(),
  );
  decoded.action.Withdraw.amount = "999";
  tampered.message = Buffer.from(JSON.stringify(decoded)).toString("base64");
  await denied(
    alice,
    wallet,
    "execute",
    tampered,
    "message altéré refusé par ML-DSA",
  );
  await denied(
    alice,
    wallet,
    "execute",
    authorize(keys, { ...original, network: "testnet" }),
    "rejeu inter-réseau refusé",
  );
  await denied(
    alice,
    wallet,
    "execute",
    authorize(keys, { ...original, token_id: "faux." + collection.accountId }),
    "rejeu inter-NFT refusé",
  );
  await denied(
    alice,
    wallet,
    "execute",
    authorize(keys, { ...original, expires_at: "1" }),
    "signature expirée refusée",
  );
  await signedDenied(
    { Rotate: { public_key: b64(next.publicKey) } },
    "rotation sans preuve de nouvelle clé refusée",
  );
  await signedDenied({Rotate:{public_key:b64(next.publicKey)}},"rotation signée par un tiers refusée",bobKeys);
  const oldSignature = authorize(keys, envelope(await snap(), withdraw));
  const rotated = await send(
    { Rotate: { public_key: b64(next.publicKey) } },
    keys,
    next,
  );
  assert.ok(
    rotated.succeeded && !rotated.receiptFailures.length,
    JSON.stringify(rotated),
  );
  pass("rotation signée et preuve de possession de nouvelle clé");
  await denied(
    alice,
    wallet,
    "execute",
    oldSignature,
    "ancienne génération de signature refusée",
  );
  await signedDenied(
    withdraw,
    "ancienne clé refusée sur un message de génération courante",
    keys,
  );
  const failedWithdrawal = await send(
    {
      Withdraw: {
        asset: token.accountId,
        amount: units("2").toString(),
        beneficiary: agent.accountId,
      },
    },
    next,
  );
  // agent deliberately not storage-registered: the FT rejects and the wallet restores the reservation.
  assert.ok(failedWithdrawal.receiptFailures.length > 0);
  s = await snap();
  assert.equal(s.reserved, "0");
  assert.equal(s.available, units("901").toString());
  pass("retrait FT échoué : réservation restituée une seule fois");
  const before = await snap();
  const stale = authorize(next, envelope(before, withdraw));
  await bob.call(
    wallet,
    "register_recipient",
    recipientProof(
      bobKeys,
      before,
      bob.accountId,
      (BigInt(Date.now()) * 1_000_000n + 3_600_000_000_000n).toString(),
    ),
    { attachedDeposit: N / 10n, gas: GAS },
  );
  pass(
    "Bob associe lui-même sa nouvelle clé à son identité avant le transfert",
  );
  const transferred = await send(
    {
      Transfer: { owner_id: bob.accountId, public_key: b64(bobKeys.publicKey) },
    },
    next,
    bobKeys,
  );
  assert.ok(
    transferred.succeeded && !transferred.receiptFailures.length,
    JSON.stringify(transferred),
  );
  s = await snap();
  assert.equal(s.owner_id, bob.accountId);
  assert.equal(s.available, before.available);
  assert.equal(s.principal, before.principal);
  assert.equal(s.status, "Active");
  assert.equal(s.policy, null);
  verifyPair(
    collection.accountId,
    id,
    s,
    await collection.view("nft_token", { token_id: id }),
  );
  pass(
    "transfert Alice → Bob, compte/positions/historique conservés et collection synchronisée",
  );
  await denied(
    alice,
    wallet,
    "pause_agent",
    {},
    "ancien propriétaire sans autorité",
  );
  await denied(
    alice,
    wallet,
    "execute",
    stale,
    "signature pré-transfert refusée",
  );
  await signedDenied(
    withdraw,
    "clé du vendeur sans autorité après transfert",
    next,
  );
  await denied(
    agent,
    wallet,
    "agent_allocate",
    { amount: "1", ownership_epoch: "0", policy_version: "1" },
    "ancien agent révoqué au transfert",
  );
  await denied(
    bob,
    collection,
    "nft_transfer",
    {
      receiver_id: alice.accountId,
      token_id: id,
      approval_id: null,
      memo: null,
    },
    "transfert NFT classique ne contourne pas ML-DSA",
    1n,
  );
  await denied(
    bob,
    collection,
    "nft_transfer_call",
    {
      receiver_id: alice.accountId,
      token_id: id,
      approval_id: null,
      memo: null,
      msg: "",
    },
    "transfer_call sans autorisation ML-DSA refusé",
    1n,
  );
  const balanceBefore: string = await token.view("ft_balance_of", {
    account_id: bob.accountId,
  });
  const withdrawalAuthorization=authorize(bobKeys,envelope(await snap(),withdraw));
  const paid=await alice.callRaw(wallet,"execute",withdrawalAuthorization,{gas:GAS});
  assert.ok(
    paid.succeeded && !paid.receiptFailures.length,
    JSON.stringify(paid),
  );
  assert.equal(
    BigInt(
      await token.view<string>("ft_balance_of", { account_id: bob.accountId }),
    ) - BigInt(balanceBefore),
    units("10"),
  );
  s = await snap();
  assert.equal(s.withdrawals, units("10").toString());
  assert.equal(s.reserved, "0");
  pass("Bob retire 10 demoUSD avec sa propre clé ML-DSA");
  await denied(alice,wallet,"execute",withdrawalAuthorization,"rejeu du nonce refusé");
  const equation =
    BigInt(s.available) + BigInt(s.reserved) + BigInt(s.principal);
  assert.equal(
    equation,
    BigInt(s.deposits) - BigInt(s.withdrawals) + BigInt(s.realized_gains),
  );
  pass("conservation exacte des actifs");
  const NFT_GAS = 300_000_000_000_000n;
  const consentExpiry = () =>
    (BigInt(Date.now()) * 1_000_000n + 3_600_000_000_000n).toString();
  const aliceReturn = ml_dsa65.keygen();
  await alice.call(
    wallet,
    "register_recipient",
    recipientProof(aliceReturn, s, alice.accountId, consentExpiry()),
    { attachedDeposit: N / 10n, gas: GAS },
  );
  const standardAuth = authorize(
    bobKeys,
    envelope(s, {
      Transfer: {
        owner_id: alice.accountId,
        public_key: b64(aliceReturn.publicKey),
      },
    }),
    aliceReturn,
  );
  const standardTx = await bob.callRaw(
    collection,
    "nft_transfer",
    {
      receiver_id: alice.accountId,
      token_id: id,
      approval_id: null,
      memo: JSON.stringify(standardAuth),
    },
    { attachedDeposit: 1n, gas: NFT_GAS },
  );
  assert.ok(
    standardTx.succeeded && !standardTx.receiptFailures.length,
    JSON.stringify(standardTx),
  );
  s = await snap();
  assert.equal(s.owner_id, alice.accountId);
  assert.equal(s.status, "Active");
  pass("nft_transfer standard avec autorisation ML-DSA dans memo");
  await bob.call(
    wallet,
    "register_recipient",
    recipientProof(bobKeys, s, bob.accountId, consentExpiry()),
    { attachedDeposit: N / 10n, gas: GAS },
  );
  const restoreBob = await send(
    {
      Transfer: { owner_id: bob.accountId, public_key: b64(bobKeys.publicKey) },
    },
    aliceReturn,
    bobKeys,
  );
  assert.ok(
    restoreBob.succeeded && !restoreBob.receiptFailures.length,
    JSON.stringify(restoreBob),
  );
  s = await snap();
  for (const reject of [true, false]) {
    const receiver = await root.createSubAccount(
      reject ? "rejector" : "acceptor",
      { initialBalance: 12n * N },
    );
    await receiver.deploy("artifacts/test_receiver.wasm");
    await receiver.call(receiver, "new", {
      collection: collection.accountId,
      reject,
    });
    const receiverKeys = ml_dsa65.keygen();
    const previous = await snap();
    await receiver.call(
      receiver,
      "consent",
      {
        wallet: id,
        ...recipientProof(
          receiverKeys,
          previous,
          receiver.accountId,
          consentExpiry(),
        ),
      },
      { attachedDeposit: N / 10n, gas: GAS },
    );
    const temporary = {
      ...previous,
      owner_id: receiver.accountId,
      public_key: b64(receiverKeys.publicKey),
      ownership_epoch: (BigInt(previous.ownership_epoch) + 1n).toString(),
      key_version: (BigInt(previous.key_version) + 1n).toString(),
      policy_version: (BigInt(previous.policy_version) + 1n).toString(),
      nonce: (BigInt(previous.nonce) + 1n).toString(),
    };
    await receiver.call(receiver, "set_attack", {
      authorization: authorize(receiverKeys, envelope(temporary, withdraw)),
    });
    const msg = "inspect-frozen-wallet";
    const nftAuth = authorize(
      bobKeys,
      envelope(previous, {
        TransferCall: {
          owner_id: receiver.accountId,
          public_key: b64(receiverKeys.publicKey),
          msg,
        },
      }),
      receiverKeys,
    );
    const nftTx = await bob.callRaw(
      collection,
      "nft_transfer_call",
      {
        receiver_id: receiver.accountId,
        token_id: id,
        approval_id: null,
        memo: JSON.stringify(nftAuth),
        msg,
      },
      { attachedDeposit: 1n, gas: NFT_GAS },
    );
    const status = nftTx.result.status;
    assert.ok(
      typeof status === "object" && "SuccessValue" in status,
      JSON.stringify(nftTx),
    );
    assert.equal(
      JSON.parse(Buffer.from(status.SuccessValue, "base64").toString()),
      !reject,
      JSON.stringify(nftTx),
    );
    assert.deepEqual(await receiver.view("observations"), {
      status: "TransferPending",
      attack_blocked: true,
    });
    assert.ok(nftTx.receiptFailureMessages.some(message=>message.includes('SYNC_REQUIRED')),'The receiver withdrawal must fail specifically because the wallet is frozen');
    s = await snap();
    assert.equal(s.available, previous.available);
    assert.equal(s.principal, previous.principal);
    assert.equal(s.status, "Active");
    verifyPair(
      collection.accountId,
      id,
      s,
      await collection.view("nft_token", { token_id: id }),
    );
    if (reject) {
      assert.equal(s.owner_id, bob.accountId);
      assert.equal(s.public_key, b64(bobKeys.publicKey));
      assert.equal(
        BigInt(s.ownership_epoch),
        BigInt(previous.ownership_epoch) + 2n,
      );
      pass(
        "nft_transfer_call rejeté : compte gelé, retrait hostile refusé et NFT retourné à Bob",
      );
      await denied(
        bob,
        wallet,
        "execute",
        nftAuth,
        "autorisation du transfert rejeté non rejouable",
      );
      await denied(receiver,wallet,"execute",authorize(receiverKeys,envelope(temporary,withdraw)),"signature du détenteur temporaire refusée après retour");
    } else {
      assert.equal(s.owner_id, receiver.accountId);
      pass(
        "nft_transfer_call accepté : contrôle activé uniquement après résolution",
      );
      await bob.call(
        wallet,
        "register_recipient",
        recipientProof(bobKeys, s, bob.accountId, consentExpiry()),
        { attachedDeposit: N / 10n, gas: GAS },
      );
      const returned = await send(
        {
          Transfer: {
            owner_id: bob.accountId,
            public_key: b64(bobKeys.publicKey),
          },
        },
        receiverKeys,
        bobKeys,
      );
      assert.ok(
        returned.succeeded && !returned.receiptFailures.length,
        JSON.stringify(returned),
      );
      s = await snap();
    }
  }
  const redemption = await send(
    { Redeem: { asset: token.accountId, amount: units("25").toString() } },
    bobKeys,
  );
  assert.ok(
    redemption.succeeded && !redemption.receiptFailures.length,
    JSON.stringify(redemption),
  );
  s = await snap();
  assert.equal(s.principal, units("75").toString());
  assert.equal(s.available, units("916").toString());
  assert.equal(
    (await strategy.view<{ principal: string }>("position", { wallet: id }))
      .principal,
    s.principal,
  );
  assert.equal(
    BigInt(s.available) + BigInt(s.principal) + BigInt(s.reserved),
    BigInt(s.deposits) - BigInt(s.withdrawals) + BigInt(s.realized_gains),
  );
  pass(
    "rachat signé de 25 demoUSD du principal, avec conservation exacte et principal concordant",
  );
  measurements.public_key_bytes = keys.publicKey.length;
  measurements.signature_bytes = 3309;
  measurements.wallet_wasm_bytes = (await stat("artifacts/wallet.wasm")).size;
  measurements.wallet_storage_bytes = (
    await wallet.accountView()
  ).storage_usage;
  assert.ok(
    BigInt(String(measurements.policy_total_gas)) < 15_000_000_000_000n,
  );
  assert.ok(Number(measurements.wallet_wasm_bytes) < 1_048_576);
  assert.ok(
    Number(measurements.wallet_storage_bytes) -
      Number(measurements.wallet_wasm_bytes) <
      65_536,
  );
  pass(
    "bornes mesurées : mandat < 15 Tgas, wallet < 1 Mio, surcoût de stockage du scénario < 64 Kio",
  );
  const finalBlock = await root.rpc("block", { finality: "final" });
  const [finalSnapshot, finalToken] = await Promise.all([
    wallet.view<Snapshot>("snapshot", {}, finalBlock.header.hash),
    collection.view<any>("nft_token", { token_id: id }, finalBlock.header.hash),
  ]);
  verifyPair(collection.accountId, id, finalSnapshot, finalToken);
  s = finalSnapshot;
  measurements.verification_block = finalBlock.header.hash;
  pass("wallet et collection vérifiés au même bloc final");
  await mkdir("docs/results", { recursive: true });
  const runtime = await (await fetch(worker.rpcAddr + "/status")).json();
  await writeFile(
    "docs/results/sandbox.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        sandbox: runtime.version,
        protocol_version: runtime.protocol_version,
        stable_clock: !!process.env.EVERKEEP_SANDBOX_CLOCK_LIBRARY,
        checks,
        measurements,
        final: s,
      },
      null,
      2,
    ),
  );
  console.log(
    `\n${checks.length} vérifications sandbox réussies. Rapport : docs/results/sandbox.json`,
  );
  if (process.argv.includes("--serve")) {
    let currentKeys = bobKeys,
      serial = false,
      counter = 0;
    const history = checks
      .map((label) => ({
        label,
        ok: true,
        detail: "Vérifié dans une vraie sandbox NEAR.",
        plan: id,
      }))
      .reverse();
    const server = createServer(async (req, res) => {
      const origin = req.headers.origin;
      if (
        origin &&
        !["http://127.0.0.1:5173", "http://localhost:5173"].includes(origin)
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Content-Type", "application/json");
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.writeHead(204);
        res.end();
        return;
      }
      const respond = async (message = "") =>
        res.end(
          JSON.stringify({
            snapshot: await snap(),
            agent: agent.accountId,
            history: history.filter((entry) => entry.plan === id),
            message,
          }),
        );
      if (req.method === "GET" && req.url === "/state") {
        await respond();
        return;
      }
      if (
        req.method !== "POST" ||
        req.url !== "/action" ||
        req.headers["content-type"] !== "application/json" ||
        !origin
      ) {
        res.writeHead(400);
        res.end(
          JSON.stringify({
            error: "Requête locale JSON depuis l’interface requise",
          }),
        );
        return;
      }
      if (serial) {
        res.writeHead(409);
        res.end(JSON.stringify({ error: "Une opération est déjà en cours" }));
        return;
      }
      serial = true;
      let command = "";
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 65536) throw new Error("Requête trop grande");
        }
        const args = JSON.parse(body);
        command = args.command;
        const current = await snap();
        let tx;
        let action: Action | undefined;
        let replacement: Keys | undefined;
        if (command === "deposit")
          tx = await alice.callRaw(
            token,
            "ft_transfer_call",
            { receiver_id: id, amount: args.amount, msg: id },
            { attachedDeposit: 1n, gas: GAS },
          );
        else if (command === "policy") {
          const interpreted = interpret(args.natural);
          action = {
            SetPolicy: {
              policy: {
                agent: agent.accountId,
                asset: token.accountId,
                strategy: strategy.accountId,
                max_operation: args.amount,
                max_period: units("200").toString(),
                allocation_bps: interpreted.allocation_bps,
                expires_at: (
                  BigInt(Date.now()) * 1_000_000n +
                  80_000_000_000_000n
                ).toString(),
                ownership_epoch: current.ownership_epoch,
                policy_version: (
                  BigInt(current.policy_version) + 1n
                ).toString(),
              },
              horizon_years: interpreted.horizon_years,
              target_bps: interpreted.target_bps,
            },
          };
        } else if (command === "probe") {
          if (!current.policy) throw new Error("Activez d’abord un mandat.");
          tx = await agent.callRaw(
            wallet,
            "agent_allocate",
            {
              amount: (BigInt(current.policy.max_operation) + 1n).toString(),
              ownership_epoch: current.ownership_epoch,
              policy_version: current.policy_version,
            },
            { gas: GAS },
          );
        } else if (command === "allocate") {
          const p = propose(
            current,
            current.policy,
            BigInt(Date.now()) * 1_000_000n,
          );
          if (p.amount === "0") throw new Error(p.reason);
          tx = await agent.callRaw(
            wallet,
            "agent_allocate",
            {
              amount: p.amount,
              ownership_epoch: current.ownership_epoch,
              policy_version: current.policy_version,
            },
            { gas: GAS },
          );
        } else if (command === "withdraw")
          action = {
            Withdraw: {
              asset: token.accountId,
              amount: args.amount,
              beneficiary: args.beneficiary || current.owner_id,
            },
          };
        else if (command === "redeem")
          action = { Redeem: { asset: token.accountId, amount: args.amount } };
        else if (command === "rotate") {
          replacement = ml_dsa65.keygen();
          action = { Rotate: { public_key: b64(replacement.publicKey) } };
        } else if (command === "transfer") {
          replacement = ml_dsa65.keygen();
          const receiver =
            args.beneficiary ||
            (current.owner_id === bob.accountId
              ? alice.accountId
              : bob.accountId);
          const recipient =
            receiver === bob.accountId
              ? bob
              : receiver === alice.accountId
                ? alice
                : null;
          if (!recipient)
            throw new Error(
              "Sandbox : choisissez alice.test.near ou bob.test.near",
            );
          await recipient.call(
            wallet,
            "register_recipient",
            recipientProof(
              replacement,
              current,
              receiver,
              (BigInt(Date.now()) * 1_000_000n + 3_600_000_000_000n).toString(),
            ),
            { attachedDeposit: N / 10n, gas: GAS },
          );
          action = {
            Transfer: {
              owner_id: receiver,
              public_key: b64(replacement.publicKey),
            },
          };
        } else if (command === "revoke") action = "Revoke";
        else if (command === "yield")
          tx = await alice.callRaw(
            strategy,
            "distribute",
            { wallet: id },
            { gas: GAS },
          );
        else if (command === "create") {
          const name = "plan-" + ++counter;
          const fresh = ml_dsa65.keygen();
          const newId = name + "." + collection.accountId;
          tx = await alice.callRaw(
            collection,
            "create_plan",
            {
              name,
              ...initProof(
                fresh,
                "sandbox",
                newId,
                collection.accountId,
                alice.accountId,
              ),
            },
            { gas: GAS, attachedDeposit: 6n * N },
          );
          if (tx.failed || tx.receiptFailures.length)
            throw new Error(tx.receiptFailureMessages.join("; "));
          wallet = root.getAccount(newId);
          id = newId;
          currentKeys = fresh;
          await alice.call(wallet, "sync", {}, { gas: GAS });
          await alice.call(
            token,
            "storage_deposit",
            { account_id: id },
            { attachedDeposit: N / 100n },
          );
          await alice.call(
            strategy,
            "register_position",
            { wallet: id },
            { attachedDeposit: N / 50n },
          );
        } else throw new Error("Commande inconnue");
        if (action)
          tx = await alice.callRaw(
            wallet,
            "execute",
            authorize(currentKeys, envelope(current, action), replacement),
            { gas: GAS },
          );
        if (!tx || tx.failed || tx.receiptFailures.length)
          throw new Error(
            tx?.receiptFailureMessages.join("; ") || "Transaction refusée",
          );
        if (replacement) currentKeys = replacement;
        verifyPair(
          collection.accountId,
          id,
          await snap(),
          await collection.view("nft_token", { token_id: id }),
        );
        history.unshift({
          label: command,
          ok: true,
          detail: "Transaction exécutée et état vérifié dans la sandbox.",
          plan: id,
        });
        await respond("Transaction exécutée dans la sandbox.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        history.unshift({
          label: command,
          ok: false,
          detail: message,
          plan: id,
        });
        res.writeHead(422);
        res.end(JSON.stringify({ error: message }));
      } finally {
        serial = false;
      }
    });
    server.listen(8787, "127.0.0.1");
    console.log("Signataire et API sandbox : http://127.0.0.1:8787");
    await new Promise<void>((resolve) => {
      const stop = () => server.close(() => resolve());
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  }
} finally {
  await worker.tearDown();
}
