import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyError } from "../src/keepers/errors";

test("wallet cancellations read as cancelled, whatever the wallet says", () => {
  for (const m of ["User rejected the request.", "Error: User cancelled", "Transaction denied by user", "Popup window was closed"])
    assert.equal(friendlyError(new Error(m)), "Cancelled in your wallet: nothing was sent.");
});

test("a contract panic keeps only the contract's reason", () => {
  const raw =
    'Error: {"index":0,"kind":{"ExecutionError":"Smart contract panicked: over the daily cap"}} at signAndSendTransactions';
  assert.equal(friendlyError(new Error(raw)), "The contract refused: over the daily cap.");
  assert.equal(friendlyError("Smart contract panicked: Requires attached deposit of exactly 1 yoctoNEAR."), "The contract refused: Requires attached deposit of exactly 1 yoctoNEAR.");
});

test("missing NEAR points to the faucet", () => {
  assert.match(friendlyError(new Error('{"LackBalanceForState":{"amount":"1"}}')), /Not enough test NEAR.*faucet/);
  assert.match(friendlyError(new Error("NotEnoughBalance")), /Not enough test NEAR/);
});

test("network and rate-limit errors say what to do", () => {
  assert.equal(friendlyError(new TypeError("Failed to fetch")), "Could not reach the network. Check your connection and try again.");
  assert.match(friendlyError(new Error("HTTP 429 Too Many Requests")), /busy \(rate limit\)/);
});

test("an unknown account is named as such", () => {
  assert.equal(friendlyError(new Error("account bob.testnet does not exist while viewing")), "That account does not exist on testnet. Check the spelling.");
});

test("unknown errors keep their text, without the Error: prefix, trimmed when long", () => {
  assert.equal(friendlyError(new Error("Error: The runner refused this job")), "The runner refused this job");
  const long = friendlyError(new Error("x".repeat(400)));
  assert.ok(long.length <= 201 && long.endsWith("…"));
  assert.equal(friendlyError("plain string"), "plain string");
});
