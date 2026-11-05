import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifyTransaction,
  type TransactionIntent,
} from "../packages/shared/transactions.js";
const intent: TransactionIntent = {
  id: "op",
  network: "testnet",
  owner: "owner.testnet",
  receiver: "missions.testnet",
  method: "pay",
  args: { id: "mission" },
  deposit: "200",
  gas: "280000000000000",
  createdAt: "",
  fingerprint: "",
  status: "pending",
};
const receipt = () => ({
  final_execution_status: "FINAL",
  transaction: {
    hash: "public-hash",
    signer_id: intent.owner,
    receiver_id: intent.receiver,
    actions: [
      {
        FunctionCall: {
          method_name: "pay",
          deposit: "200",
          gas: intent.gas,
          args: Buffer.from(JSON.stringify(intent.args)).toString("base64"),
        },
      },
    ],
  },
  status: { SuccessValue: "" },
  receipts_outcome: [{ outcome: { status: { SuccessValue: "" } } }],
});
test("hash and top-level success cannot hide an intercontract failure", () => {
  const r = receipt();
  assert.equal(verifyTransaction(intent, r).failed, false);
  (r.receipts_outcome[0].outcome.status as any) = {
    Failure: { error: "CALLBACK_FAILED" },
  };
  assert.equal(verifyTransaction(intent, r).failed, true);
});
test("a single approval for quote and payment binds every action in its original order", () => {
  const r = receipt(),
    quote = {
      method: "quote",
      args: { id: "mission" },
      deposit: "500",
      gas: "80000000000000",
    };
  r.transaction.actions.unshift({
    FunctionCall: {
      method_name: quote.method,
      deposit: quote.deposit,
      gas: quote.gas,
      args: Buffer.from(JSON.stringify(quote.args)).toString("base64"),
    },
  });
  const combined = {
    ...intent,
    actions: [
      quote,
      {
        method: intent.method,
        args: intent.args,
        deposit: intent.deposit,
        gas: intent.gas,
      },
    ],
  };
  assert.equal(verifyTransaction(combined, r).failed, false);
  const altered = structuredClone(r);
  altered.transaction.actions[1].FunctionCall.deposit = "201";
  assert.throws(() => verifyTransaction(combined, altered));
  r.transaction.actions.reverse();
  assert.throws(() => verifyTransaction(combined, r));
});
test("signer, receiver, exact arguments and finality must match reviewed intent", () => {
  for (const mutate of [
    (r: any) => (r.transaction.signer_id = "other.testnet"),
    (r: any) => (r.transaction.receiver_id = "other.testnet"),
    (r: any) => (r.transaction.actions[0].FunctionCall.deposit = "201"),
    (r: any) => (r.transaction.actions[0].FunctionCall.gas = "300000000000000"),
    (r: any) =>
      (r.transaction.actions[0].FunctionCall.args =
        Buffer.from('{"id":"other"}').toString("base64")),
    (r: any) => (r.final_execution_status = "EXECUTED_OPTIMISTIC"),
    (r: any) => (r.receipts_outcome = []),
    (r: any) => (r.receipts_outcome = [{ outcome: {} }]),
  ]) {
    const r = receipt();
    mutate(r);
    assert.throws(() => verifyTransaction(intent, r));
  }
  assert.throws(() =>
    verifyTransaction({ ...intent, hash: "different-hash" }, receipt()),
  );
});
