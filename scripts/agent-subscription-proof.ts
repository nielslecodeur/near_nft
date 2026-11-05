/** Real WASM feasibility gate, deliberately before the series/market UI. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { startChain } from "./chain.js";
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
    closes_at: (start + 1_800_000_000_000n).toString(),
    matures_at: (start + 3_600_000_000_000n).toString(),
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

  const balance=(account:string)=>token.view<string>("ft_balance_of",{account_id:account});
  const action:Action={AuthorizeSubscription:{agent:agent.accountId,asset:token.accountId,strategy:strategy.accountId,amount:units("100").toString(),expires_at:((await now())+600_000_000_000n).toString(),beneficiary:alice.accountId}};
  const invalid=await send(action,buyerKeys);assert.ok(invalid.receiptFailureMessages.some(m=>m.includes("ML_DSA_INVALID")));assert.equal((await snap()).funding_permit,null);pass("invalid signature cannot create a spending mandate");
  let r=await send(action);assert.equal(r.receiptFailures.length,0);assert.equal((await snap()).status,"SubscriptionAuthorized");assert.equal(await collection.view("nft_token",{token_id:id}),null);pass("genuine ML-DSA mandate alone moves no capital and mints no NFT");
  const permit=(await snap()).funding_permit!;const msg=JSON.stringify({AgentSubscribe:{position:id,policy_version:permit.policy_version}});
  const before=await balance(alice.accountId);
  r=await alice.callRaw(token,"ft_transfer_call",{receiver_id:collection.accountId,amount:units("99").toString(),msg},{attachedDeposit:1n,gas:GAS});assert.ok(r.receiptFailureMessages.some(m=>m.includes("FUNDING_MANDATE_LIMIT")));assert.equal(await balance(alice.accountId),before);pass("non-exact deposit refunded without consuming authorization");
  await alice.call(token,"ft_transfer_call",{receiver_id:collection.accountId,amount:units("100").toString(),msg},{attachedDeposit:1n,gas:GAS});
  assert.equal((await collection.view<any>("subscription",{position:id})).state,"Authorized");assert.equal((await snap()).available,"0");assert.equal(await collection.view("nft_token",{token_id:id}),null);pass("exact owner deposit reserved in escrow, not yet invested");
  r=await bob.callRaw(collection,"agent_subscribe",{position:id,policy_version:permit.policy_version},{gas:GAS});assert.ok(r.receiptFailureMessages.some(m=>m.includes("AGENT_ONLY")));pass("different agent refused by contract");
  r=await agent.callRaw(collection,"agent_subscribe",{position:id,policy_version:"0"},{gas:GAS});assert.ok(r.receiptFailureMessages.some(m=>m.includes("EXPIRED_OR_STALE_MANDATE")));pass("stale policy refused");
  r=await agent.callRaw(collection,"agent_subscribe",{position:id,policy_version:permit.policy_version},{gas:GAS});assert.equal(r.receiptFailures.length,0,JSON.stringify(r.result));assert.equal((await snap()).available,units("100").toString());assert.equal((await snap()).funding_permit,null);assert.equal((await collection.view<any>("nft_token",{token_id:id})).owner_id,alice.accountId);pass("designated agent creates one credited NFT position for original owner");
  r=await agent.callRaw(collection,"agent_subscribe",{position:id,policy_version:permit.policy_version},{gas:GAS});assert.ok(r.receiptFailureMessages.some(m=>m.includes("SUBSCRIPTION_NOT_AUTHORIZED")));assert.equal((await snap()).deposits,units("100").toString());pass("execution replay cannot spend escrow twice");
  const cancelId="cancelled."+collection.accountId,cancelWallet=root.getAccount(cancelId),cancelKeys=ml_dsa65.keygen();
  await alice.call(collection,"create_plan",{name:"cancelled",...initProof(cancelKeys,"sandbox",cancelId,collection.accountId,alice.accountId)},{attachedDeposit:6n*N,gas:GAS});
  const cancelSnap=()=>cancelWallet.view<Snapshot>("snapshot");
  const cancelSend=async(a:Action)=>alice.callRaw(cancelWallet,"execute",authorize(cancelKeys,envelope(await cancelSnap(),a,((await now())+600_000_000_000n).toString())),{gas:GAS});
  await cancelSend(action);const cp=(await cancelSnap()).funding_permit!;const cancelBefore=await balance(alice.accountId);
  await alice.call(token,"ft_transfer_call",{receiver_id:collection.accountId,amount:cp.amount,msg:JSON.stringify({AgentSubscribe:{position:cancelId,policy_version:cp.policy_version}})},{attachedDeposit:1n,gas:GAS});
  r=await cancelSend("CancelSubscription");assert.equal(r.receiptFailures.length,0);assert.equal((await cancelSnap()).funding_permit,null);assert.equal((await collection.view<any>("subscription",{position:cancelId})).state,"RefundClaimable");
  await bob.call(collection,"claim_subscription",{position:cancelId},{gas:GAS});assert.equal(await balance(alice.accountId),cancelBefore);pass("signed revocation refunds only the original beneficiary exactly once");
  r=await agent.callRaw(collection,"agent_subscribe",{position:cancelId,policy_version:cp.policy_version},{gas:GAS});assert.ok(r.receiptFailureMessages.some(m=>m.includes("EXPIRED_OR_STALE_MANDATE")));pass("revoked mandate cannot be executed later");
  await writeFile("docs/results/agent-subscription.json",JSON.stringify({date:new Date().toISOString(),checks,scope:"Real WASM, real ML-DSA, owner escrow and designated agent subscription. Sandbox only."},null,2)+"\n");
}finally{await chain.tearDown();}
