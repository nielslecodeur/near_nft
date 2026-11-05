/**
 * NEP-413 (signed off-chain messages) verification with WebCrypto only.
 * Spec: https://github.com/near/NEPs/blob/master/neps/nep-0413.md
 *
 * The wallet signs sha256(borsh(tag: u32 = 2^31 + 413) ++ borsh(Payload)) with
 * the account's ed25519 key, where Payload = { message: string, nonce: [u8; 32],
 * recipient: string, callbackUrl: Option<string> }.
 * A valid proof also requires that public key to be a FullAccess key of the
 * account on chain (checked separately with an RPC view_access_key).
 */

export type SignedMessage = {
  accountId: string;
  publicKey: string; // "ed25519:<base58>"
  signature: string; // base64
};
export type MessageParams = {
  message: string;
  recipient: string;
  nonce: Uint8Array; // 32 bytes
};

const TAG = 2 ** 31 + 413;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Decode(text: string): Uint8Array<ArrayBuffer> {
  let n = 0n;
  for (const c of text) {
    const v = B58.indexOf(c);
    if (v < 0) throw new Error("Invalid base58");
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const c of text) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

export function base64Decode(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};
const borshString = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  return [u32(bytes.length), bytes];
};

/** Exact bytes hashed and signed by a NEP-413 wallet. */
export function nep413Bytes(p: MessageParams): Uint8Array<ArrayBuffer> {
  if (p.nonce.length !== 32) throw new Error("Nonce must be 32 bytes");
  const parts = [
    u32(TAG),
    ...borshString(p.message),
    p.nonce,
    ...borshString(p.recipient),
    new Uint8Array([0]), // callbackUrl: None
  ];
  const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** True if `signed.signature` is a valid ed25519 signature of the NEP-413 payload by `signed.publicKey`. */
export async function verifySignature(
  signed: SignedMessage,
  params: MessageParams,
): Promise<boolean> {
  if (!signed.publicKey.startsWith("ed25519:")) return false;
  const key = base58Decode(signed.publicKey.slice("ed25519:".length));
  const signature = base64Decode(signed.signature);
  if (key.length !== 32 || signature.length !== 64) return false;
  const hash = await crypto.subtle.digest("SHA-256", nep413Bytes(params));
  const publicKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify({ name: "Ed25519" }, publicKey, signature, hash);
}

/** Proof message shown in the wallet. The timestamp lets the page reject stale proofs. */
export function vaultMessage(accountId: string, issuedAt: number) {
  return `Open the Keepers Vault as ${accountId} at ${new Date(issuedAt).toISOString()}`;
}
