/** Genuine NEAR sandbox, ML-DSA host verification, NEP-141 transfers and index sync. No accepting mocks. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { startChain } from "./chain.js";
import {
  ml_dsa65,
  initProof,
  authorize,
  envelope,
  recipientProof,
  b64,
  type Snapshot,
  type Action,
} from "../packages/shared/index.js";
import {
  baskets,
  fictionalPrices,
  subscribeBasket,
  priceDay,
  valueBasket,
} from "../packages/shared/baskets.js";
const chain = await startChain({ epochLength: 10000 }),
  N = 10n ** 24n,
  GAS = 280_000_000_000_000n,
  checks: string[] = [];
const pass = (name: string) => {
  checks.push(name);
  console.log("✓", name);
};
try {
  const root = chain.rootAccount;
  const alice = await root.createSubAccount("alice", {
      initialBalance: 150n * N,
    }),
    bob = await root.createSubAccount("bob", { initialBalance: 50n * N });
  const collection = await root.createSubAccount("baskets", {
      initialBalance: 10n * N,
    }),
    token = await root.createSubAccount("demousd", { initialBalance: 5n * N }),
    strategy = await root.createSubAccount("strategy", {
      initialBalance: 5n * N,
    });
  for (const [account, file] of [
    [collection, "collection"],
    [token, "demo_token"],
    [strategy, "strategy"],
  ] as const)
    assert.ok((await account.deploy(`artifacts/${file}.wasm`)).succeeded);
  await token.call(token, "new", {
    owner_id: alice.accountId,
    total_supply: "1000000000",
  });
  await strategy.call(strategy, "new", { asset: token.accountId });
  await collection.call(collection, "new", {
    network: "sandbox",
    asset: token.accountId,
    strategy: strategy.accountId,
    admin_key: null,
  });
  const clock = async () =>
    BigInt(
      (await root.rpc("block", { finality: "final" })).header.timestamp_nanosec,
    );
  const snap = async (id: string) =>
    root.getAccount(id).view<Snapshot>("snapshot");
  const records: {
    account: string;
    model: string;
    capital: string;
    value: string;
  }[] = [];
  for (const [i, model] of baskets.entries()) {
    const keys = ml_dsa65.keygen(),
      name = "position" + i,
      id = name + "." + collection.accountId;
    await alice.call(
      collection,
      "create_plan",
      {
        name,
        ...initProof(
          keys,
          "sandbox",
          id,
          collection.accountId,
          alice.accountId,
        ),
        basket_required: true,
      },
      { attachedDeposit: 6n * N, gas: GAS },
    );
    const s = await snap(id);
    assert.equal(s.basket_required, true);
    assert.equal(s.funded, false);
    const access = await root.rpc("query", {
      request_type: "view_access_key_list",
      account_id: id,
      finality: "final",
    });
    assert.equal(access.keys.length, 0);
    await alice.call(
      token,
      "storage_deposit",
      { account_id: id, registration_only: true },
      { attachedDeposit: N / 100n },
    );
    const before = await token.view<string>("ft_balance_of", {
      account_id: alice.accountId,
    });
    await alice.callRaw(
      token,
      "ft_transfer_call",
      { receiver_id: id, amount: "100000000", msg: id },
      { attachedDeposit: 1n, gas: GAS },
    );
    assert.equal(
      await token.view("ft_balance_of", { account_id: alice.accountId }),
      before,
    );
    assert.equal((await snap(id)).deposits, "0");
    pass(model.id + ": unbound deposit refunded");
    const now = await clock(),
      action: Action = {
        BindBasket: {
          basket_id: model.id,
          version: model.version,
          amount: "100000001",
          snapshot_day: priceDay(now).toString(),
        },
      };
    const auth = authorize(
      keys,
      envelope(await snap(id), action, (now + 600_000_000_000n).toString()),
    );
    const altered = JSON.parse(Buffer.from(auth.message, "base64").toString());
    altered.action.BindBasket.amount = "999";
    const bad = await alice.callRaw(
      id,
      "execute",
      {
        ...auth,
        message: Buffer.from(JSON.stringify(altered)).toString("base64"),
      },
      { gas: GAS },
    );
    assert.ok(bad.failed || bad.receiptFailures.length);
    assert.equal((await snap(id)).basket, null);
    pass(model.id + ": modified signed amount rejected by host");
    await alice.call(id, "execute", auth, { gas: GAS });
    const replay = await alice.callRaw(id, "execute", auth, { gas: GAS });
    assert.ok(replay.failed || replay.receiptFailures.length);
    pass(model.id + ": nonce replay rejected");
    const p = (await snap(id)).basket!,
      expected = subscribeBasket(
        model,
        "100000001",
        fictionalPrices(model, now),
        now,
      );
    assert.deepEqual(p.lots, expected.lots);
    assert.equal(p.remainder, expected.remainder);
    assert.equal(p.model.version, "1");
    await alice.callRaw(
      token,
      "ft_transfer_call",
      { receiver_id: id, amount: "100000000", msg: id },
      { attachedDeposit: 1n, gas: GAS },
    );
    assert.equal((await snap(id)).deposits, "0");
    await alice.call(
      token,
      "ft_transfer_call",
      { receiver_id: id, amount: "100000001", msg: id },
      { attachedDeposit: 1n, gas: GAS },
    );
    let funded = await snap(id);
    assert.equal(funded.deposits, "100000001");
    assert.equal(funded.available, "100000001");
    const tokenOwner = await collection.view<any>("nft_token", {
      token_id: id,
    });
    assert.equal(tokenOwner.owner_id, alice.accountId);
    const chainValue = await root.getAccount(id).view<any>("basket_value");
    assert.equal(
      chainValue.value,
      valueBasket(
        funded.basket!,
        fictionalPrices(model, BigInt(chainValue.day) * 86_400_000_000_000n),
      ),
    );
    assert.equal(chainValue.payable_gain, "0");
    const sign = async (action: Action) =>
      authorize(
        keys,
        envelope(
          await snap(id),
          action,
          ((await clock()) + 600_000_000_000n).toString(),
        ),
      );
    const early = await alice.callRaw(
      id,
      "execute",
      await sign({
        Withdraw: {
          asset: token.accountId,
          amount: "100000001",
          beneficiary: alice.accountId,
        },
      }),
      { gas: GAS },
    );
    assert.ok(early.failed || early.receiptFailures.length);
    pass(model.id + ": close required before withdrawal");
    const second = await alice.callRaw(
      token,
      "ft_transfer_call",
      { receiver_id: id, amount: "100000001", msg: id },
      { attachedDeposit: 1n, gas: GAS },
    );
    assert.ok(second.receiptFailures.length);
    assert.equal((await snap(id)).deposits, "100000001");
    pass(model.id + ": additional deposit rejected and refunded");
    const yieldResult = await alice.callRaw(
      token,
      "ft_transfer_call",
      { receiver_id: id, amount: "1", msg: "yield" },
      { attachedDeposit: 1n, gas: GAS },
    );
    assert.ok(yieldResult.receiptFailures.length);
    assert.equal((await snap(id)).realized_gains, "0");
    if (i === 1) {
      const bobKeys = ml_dsa65.keygen();
      funded = await snap(id);
      await bob.call(
        id,
        "register_recipient",
        recipientProof(
          bobKeys,
          funded,
          bob.accountId,
          ((await clock()) + 600_000_000_000n).toString(),
        ),
        { attachedDeposit: N / 10n, gas: GAS },
      );
      const memo = authorize(
        keys,
        envelope(
          await snap(id),
          {
            Transfer: {
              owner_id: bob.accountId,
              public_key: b64(bobKeys.publicKey),
            },
          },
          ((await clock()) + 600_000_000_000n).toString(),
        ),
        bobKeys,
      );
      await alice.call(
        collection,
        "nft_transfer",
        {
          receiver_id: bob.accountId,
          token_id: id,
          memo: JSON.stringify(memo),
        },
        { attachedDeposit: 1n, gas: GAS },
      );
      const transferred = await snap(id);
      assert.equal(transferred.owner_id, bob.accountId);
      assert.deepEqual(transferred.basket, funded.basket);
      assert.equal(transferred.policy, null);
      assert.ok(transferred.agent_paused);
      const old = await alice.callRaw(
        id,
        "execute",
        await sign("CloseBasket"),
        { gas: GAS },
      );
      assert.ok(old.failed || old.receiptFailures.length);
      const bobAuth = authorize(
        bobKeys,
        envelope(
          transferred,
          "CloseBasket",
          ((await clock()) + 600_000_000_000n).toString(),
        ),
      );
      await bob.call(id, "execute", bobAuth, { gas: GAS });
      await bob.call(
        token,
        "storage_deposit",
        { account_id: bob.accountId, registration_only: true },
        { attachedDeposit: N / 100n },
      );
      const afterClose = await snap(id),
        withdraw = authorize(
          bobKeys,
          envelope(
            afterClose,
            {
              Withdraw: {
                asset: token.accountId,
                amount: afterClose.available,
                beneficiary: bob.accountId,
              },
            },
            ((await clock()) + 600_000_000_000n).toString(),
          ),
        );
      await bob.call(id, "execute", withdraw, { gas: GAS });
      assert.equal((await snap(id)).available, "0");
      pass(
        "transfer preserves basket quantities and revokes old owner access; new owner withdraws",
      );
      bobKeys.secretKey.fill(0);
    } else {
      await alice.call(id, "execute", await sign("CloseBasket"), { gas: GAS });
      const inflated = await alice.callRaw(
        id,
        "execute",
        await sign({
          Withdraw: {
            asset: token.accountId,
            amount: "200000000",
            beneficiary: alice.accountId,
          },
        }),
        { gas: GAS },
      );
      assert.ok(inflated.failed || inflated.receiptFailures.length);
      assert.equal((await snap(id)).available, "100000001");
      pass(model.id + ": frontend-supplied gain cannot exceed actual tokens");
      const withdrawal = await sign({
        Withdraw: {
          asset: token.accountId,
          amount: "100000001",
          beneficiary: alice.accountId,
        },
      });
      await alice.call(id, "execute", withdrawal, { gas: GAS });
      const repeat = await alice.callRaw(id, "execute", withdrawal, {
        gas: GAS,
      });
      assert.ok(repeat.failed || repeat.receiptFailures.length);
      const done = await snap(id);
      assert.equal(done.available, "0");
      assert.equal(done.withdrawals, "100000001");
      assert.equal(done.realized_gains, "0");
      pass(
        model.id + ": exact token withdrawal once, no fictional gain payment",
      );
    }
    records.push({
      account: id,
      model: model.id,
      capital: p.capital,
      value: chainValue.value,
    });
    keys.secretKey.fill(0);
  }
  await mkdir("docs/results", { recursive: true });
  await writeFile(
    "docs/results/baskets-sandbox.json",
    JSON.stringify(
      {
        network: "sandbox",
        checks,
        records,
        realSignatures: true,
        realTokenTransfers: true,
        settlement: "informational valuation; principal tokens only",
      },
      null,
      2,
    ),
  );
} finally {
  await chain.tearDown();
}
