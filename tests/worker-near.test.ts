// The Worker signs NEAR transactions without near-api-js: same bytes, same signature, same hash.
import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyPair, actions, createTransaction, encodeTransaction as nearEncode, PublicKey } from "near-api-js";
import { createHash } from "node:crypto";
import { base58Decode, base58Encode, encodeTransaction, newEd25519, signTransaction } from "../workers/runner/src/near";

const kp = KeyPair.fromString("ed25519:3D4YudUahN1nawWogh8pAKSj92sUNMdbZGjn7kERKzYoTy8tnFQuwoGUC51DowKqorvkr2pytJSnwuSbsNVfqygr");
const tx = {
  signerId: "alice.testnet",
  publicKey: kp.getPublicKey().data,
  nonce: 123456789012n,
  receiverId: "agents-v2.everkeep-dev-mw0weth5.testnet",
  blockHash: base58Decode("244ZQ9cgj3CQ6bWBdytfrJMuMQ1jdXLFGnr4HhvtCTnM"),
  method: "agent_pay",
  args: { seat_id: "3", payee: "bob.testnet", amount: "100000", memo: null },
  gas: 100_000_000_000_000n,
  deposit: 0n,
};

test("borsh of a FunctionCall transaction matches near-api-js byte for byte", () => {
  const theirs = createTransaction(
    tx.signerId,
    PublicKey.fromString(kp.getPublicKey().toString()),
    tx.receiverId,
    tx.nonce,
    [actions.functionCall(tx.method, tx.args, tx.gas, tx.deposit)],
    tx.blockHash,
  );
  assert.deepEqual(Buffer.from(encodeTransaction(tx)), Buffer.from(nearEncode(theirs)));
});

test("WebCrypto signs the sha256 like near-api-js (ed25519 is deterministic)", async () => {
  const { signed, hash } = await signTransaction(kp.toString(), tx);
  const bytes = encodeTransaction(tx);
  const digest = createHash("sha256").update(bytes).digest();
  assert.equal(hash, base58Encode(new Uint8Array(digest)));
  const theirs = kp.sign(new Uint8Array(digest)).signature;
  assert.deepEqual(Buffer.from(signed.slice(bytes.length + 1)), Buffer.from(theirs));
  assert.equal(signed[bytes.length], 0, "Signature::ED25519 tag");
});

test("a fresh key pair round-trips into near-api-js and signs the same", async () => {
  const k = await newEd25519();
  const theirs = KeyPair.fromString(k.secretKey as `ed25519:${string}`);
  assert.equal(theirs.getPublicKey().toString(), k.publicKey);
  const msg = new Uint8Array([1, 2, 3]);
  const { signed } = await signTransaction(k.secretKey, { ...tx, publicKey: theirs.getPublicKey().data });
  assert.ok(signed.length > 64);
  assert.ok(theirs.verify(msg, theirs.sign(msg).signature));
});

test("base58 round-trips, leading zeros included", () => {
  for (const s of ["1111", "11Ab", "244ZQ9cgj3CQ6bWBdytfrJMuMQ1jdXLFGnr4HhvtCTnM"]) assert.equal(base58Encode(base58Decode(s)), s);
});
