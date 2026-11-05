/** Extra real-WASM checks. Called only by the isolated series proof, never the user API. */
import assert from "node:assert/strict";
import {
  ml_dsa65,
  b64,
  initProof,
  recipientProof,
  authorize,
  envelope,
  units,
  type Snapshot,
  type Action,
} from "../packages/shared/index.js";
import type { SandboxAccount } from "./harness.js";

export async function proveMarketplace({
  root,
  alice,
  bob,
  collection,
  token,
  clock,
  pass,
}: {
  root: SandboxAccount;
  alice: SandboxAccount;
  bob: SandboxAccount;
  collection: SandboxAccount;
  token: SandboxAccount;
  clock: () => Promise<bigint>;
  pass: (name: string) => void;
}) {
  const N = 10n ** 24n,
    GAS = 280_000_000_000_000n;
  const balance = (a: string) =>
    token.view<string>("ft_balance_of", { account_id: a });
  const failedId = "failed." + collection.accountId,
    failedKeys = ml_dsa65.keygen();
  const bad = initProof(
    failedKeys,
    "sandbox",
    failedId,
    collection.accountId,
    alice.accountId,
  );
  const badBytes = Buffer.from(bad.proof, "base64");
  badBytes[0] ^= 1;
  bad.proof = badBytes.toString("base64");
  const creation = await alice.callRaw(
    collection,
    "create_plan",
    { name: "failed", ...bad },
    { attachedDeposit: 6n * N, gas: GAS },
  );
  assert.ok(
    creation.receiptFailureMessages.some((m) => m.includes("ML_DSA_INVALID")),
  );
  const beforeFailure = await balance(alice.accountId);
  const deposit = await alice.callRaw(
    token,
    "ft_transfer_call",
    {
      receiver_id: collection.accountId,
      amount: units("10").toString(),
      msg: JSON.stringify({ Subscribe: failedId }),
    },
    { attachedDeposit: 1n, gas: GAS },
  );
  assert.ok(
    deposit.receiptFailureMessages.some((m) =>
      m.includes("POSITION_NOT_PREPARED"),
    ),
  );
  assert.equal(await balance(alice.accountId), beforeFailure);
  assert.equal(
    await collection.view("nft_token", { token_id: failedId }),
    null,
  );
  pass(
    "failed ML-DSA account creation cannot mint or retain the subsequent deposit; exact NEP-141 refund",
  );
  const wrongToken = await alice.callRaw(
    collection,
    "ft_on_transfer",
    {
      sender_id: alice.accountId,
      amount: units("10").toString(),
      msg: JSON.stringify({ Subscribe: failedId }),
    },
    { gas: GAS },
  );
  assert.ok(
    wrongToken.receiptFailureMessages.some((m) => m.includes("FT_ONLY")),
  );
  pass("subscription rejects a non-asset predecessor in real WASM");

  const carol = await root.createSubAccount("carol", {
    initialBalance: 30n * N,
  });
  await alice.call(
    token,
    "storage_deposit",
    { account_id: carol.accountId, registration_only: true },
    { attachedDeposit: N / 10n },
  );
  const id = "race." + collection.accountId,
    wallet = root.getAccount(id),
    keys = ml_dsa65.keygen();
  await alice.call(
    collection,
    "create_plan",
    {
      name: "race",
      ...initProof(keys, "sandbox", id, collection.accountId, alice.accountId),
    },
    { attachedDeposit: 6n * N, gas: GAS },
  );
  await alice.call(
    token,
    "ft_transfer_call",
    {
      receiver_id: collection.accountId,
      amount: units("10").toString(),
      msg: JSON.stringify({ Subscribe: id }),
    },
    { attachedDeposit: 1n, gas: GAS },
  );
  const snap = () => wallet.view<Snapshot>("snapshot");
  const sign = async (action: Action) =>
    authorize(
      keys,
      envelope(
        await snap(),
        action,
        ((await clock()) + 600_000_000_000n).toString(),
      ),
    );
  const expiry = ((await clock()) + 600_000_000_000n).toString();
  const quote = await wallet.view<{ id: string; valuation_hash: string }>(
    "sale_quote",
    { price: units("7").toString(), expires_at: expiry },
  );
  await alice.call(
    wallet,
    "execute",
    await sign({
      List: {
        id: quote.id,
        price: units("7").toString(),
        payment_token: token.accountId,
        expires_at: expiry,
        valuation_hash: quote.valuation_hash,
      },
    }),
    { gas: GAS },
  );
  const frozen = await wallet.view<string>("sale_valuation_at", {
    id: quote.id,
  });
  assert.ok(BigInt(frozen) > 0n && BigInt(frozen) <= (await clock()));
  const recipientKeys = ml_dsa65.keygen();
  for (const method of ["nft_transfer", "nft_transfer_call"]) {
    const transfer = {
      owner_id: bob.accountId,
      public_key: b64(recipientKeys.publicKey),
    };
    const auth = await sign(
      method === "nft_transfer"
        ? { Transfer: transfer }
        : { TransferCall: { ...transfer, msg: "inspect" } },
    );
    const result = await alice.callRaw(
      collection,
      method,
      {
        receiver_id: bob.accountId,
        token_id: id,
        memo: JSON.stringify(auth),
        ...(method === "nft_transfer_call" ? { msg: "inspect" } : {}),
      },
      { attachedDeposit: 1n, gas: 300_000_000_000_000n },
    );
    assert.ok(
      result.receiptFailureMessages.some((m) => m.includes("SALE_LOCKED")),
      result.receiptFailureMessages.join(" "),
    );
    assert.equal((await snap()).owner_id, alice.accountId);
  }
  const approval = await alice.callRaw(
    collection,
    "nft_transfer",
    { receiver_id: bob.accountId, token_id: id, approval_id: 1, memo: "{}" },
    { attachedDeposit: 1n, gas: GAS },
  );
  assert.ok(
    approval.receiptFailureMessages.some((m) =>
      m.includes("APPROVAL_EXTENSION_NOT_SUPPORTED"),
    ),
  );
  pass(
    "nft_transfer and nft_transfer_call cannot bypass a sale freeze; approval-based transfer rejected",
  );
  const msg = JSON.stringify({
    position: id,
    id: quote.id,
    valuation_hash: quote.valuation_hash,
  });
  const selfBuy = await alice.callRaw(
    token,
    "ft_transfer_call",
    { receiver_id: collection.accountId, amount: units("7").toString(), msg },
    { attachedDeposit: 1n, gas: GAS },
  );
  assert.ok(
    selfBuy.receiptFailureMessages.some((m) => m.includes("SELF_PURCHASE")),
  );
  pass("seller self-purchase is rejected by the escrow hook");
  for (const buyer of [bob, carol]) {
    await alice.call(
      token,
      "ft_transfer",
      { receiver_id: buyer.accountId, amount: units("7").toString() },
      { attachedDeposit: 1n },
    );
    const consentKeys = ml_dsa65.keygen();
    await buyer.call(
      wallet,
      "register_recipient",
      recipientProof(consentKeys, await snap(), buyer.accountId, expiry),
      { attachedDeposit: N / 10n, gas: GAS },
    );
  }
  const sellerBefore = BigInt(await balance(alice.accountId));
  const results = await Promise.all(
    [bob, carol].map((buyer) =>
      buyer.callRaw(
        token,
        "ft_transfer_call",
        {
          receiver_id: collection.accountId,
          amount: units("7").toString(),
          msg,
        },
        { attachedDeposit: 1n, gas: GAS },
      ),
    ),
  );
  assert.equal(
    results.filter((r) =>
      r.receiptFailureMessages.some((m) => m.includes("LISTING_UNAVAILABLE")),
    ).length,
    1,
  );
  let sale = await collection.view<any>("listing", {
    position: id,
    id: quote.id,
  });
  for (let i = 0; i < 4 && sale.state !== "Settled"; i++) {
    await alice.call(
      collection,
      "resume_sale",
      { position: id, id: quote.id },
      { gas: GAS },
    );
    sale = await collection.view("listing", { position: id, id: quote.id });
  }
  assert.equal(sale.state, "Settled");
  await alice.call(
    collection,
    "release_settled",
    { position: id, id: quote.id },
    { gas: GAS },
  );
  assert.ok([bob.accountId, carol.accountId].includes(sale.buyer));
  assert.equal((await snap()).owner_id, sale.buyer);
  assert.equal((await snap()).available, units("10").toString());
  assert.equal(await balance(sale.buyer), "0");
  assert.equal(
    await balance(
      sale.buyer === bob.accountId ? carol.accountId : bob.accountId,
    ),
    units("7").toString(),
  );
  assert.equal(
    BigInt(await balance(alice.accountId)),
    sellerBefore + units("7"),
  );
  assert.equal(
    await wallet.view("sale_valuation_at", { id: quote.id }),
    frozen,
  );
  const claim = await collection.view<any>("sale_claim", {
    position: id,
    id: quote.id,
  });
  assert.equal(claim.state, "Paid");
  pass(
    "two real concurrent buyers: one control transfer, one exact loser refund, one seller payment; deposit remains separate",
  );
  pass("valuation timestamp is immutable across payment, transfer and release");
}
