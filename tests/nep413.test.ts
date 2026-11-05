import test from "node:test";
import assert from "node:assert/strict";
import {
  base58Decode,
  nep413Bytes,
  verifySignature,
  type MessageParams,
} from "../src/keepers/nep413.js";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(bytes: Uint8Array) {
  let n = BigInt("0x" + (Buffer.from(bytes).toString("hex") || "0"));
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b) break;
    out = "1" + out;
  }
  return out;
}

async function wallet() {
  const keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keys.publicKey),
  );
  const publicKey = "ed25519:" + base58Encode(raw);
  return {
    publicKey,
    async sign(p: MessageParams) {
      const hash = await crypto.subtle.digest("SHA-256", nep413Bytes(p));
      const sig = await crypto.subtle.sign(
        { name: "Ed25519" },
        keys.privateKey,
        hash,
      );
      return {
        accountId: "alice.testnet",
        publicKey,
        signature: Buffer.from(sig).toString("base64"),
      };
    },
  };
}

const params = (): MessageParams => ({
  message: "Open the Keepers Vault as alice.testnet",
  recipient: "keepers-v1.everkeep-dev-mw0weth5.testnet",
  nonce: crypto.getRandomValues(new Uint8Array(32)),
});

test("NEP-413 payload starts with the 2^31+413 tag and ends with callbackUrl None", () => {
  const bytes = nep413Bytes({
    message: "hi",
    recipient: "r",
    nonce: new Uint8Array(32),
  });
  assert.deepEqual([...bytes.slice(0, 4)], [0x9d, 0x01, 0x00, 0x80]);
  // tag(4) + len(4) + "hi"(2) + nonce(32) + len(4) + "r"(1) + None(1)
  assert.equal(bytes.length, 48);
  assert.equal(bytes[bytes.length - 1], 0);
});

test("base58 decoding round-trips, including leading zeros", () => {
  const bytes = new Uint8Array([0, 0, 1, 2, 255]);
  assert.deepEqual([...base58Decode(base58Encode(bytes))], [...bytes]);
});

test("a valid NEP-413 signature verifies", async () => {
  const w = await wallet(),
    p = params();
  assert.equal(await verifySignature(await w.sign(p), p), true);
});

test("signature is bound to message, recipient, nonce and key", async () => {
  const w = await wallet(),
    other = await wallet(),
    p = params();
  const signed = await w.sign(p);
  assert.equal(
    await verifySignature(signed, { ...p, message: p.message + "!" }),
    false,
  );
  assert.equal(
    await verifySignature(signed, { ...p, recipient: "evil.testnet" }),
    false,
  );
  assert.equal(
    await verifySignature(signed, {
      ...p,
      nonce: crypto.getRandomValues(new Uint8Array(32)),
    }),
    false,
  );
  assert.equal(
    await verifySignature({ ...signed, publicKey: other.publicKey }, p),
    false,
  );
  assert.equal(
    await verifySignature({ ...signed, publicKey: "secp256k1:abc" }, p),
    false,
  );
});
