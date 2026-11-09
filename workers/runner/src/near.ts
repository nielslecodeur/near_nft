/**
 * NEAR for the Cloudflare Worker, with no NEAR library: RPC with failover, a
 * borsh encoder for one-FunctionCall transactions, and ed25519 through
 * WebCrypto (native, so signing stays well inside the free plan's 10 ms of CPU).
 * tests/worker-near.test.ts checks the bytes and signatures against near-api-js.
 */
import type { Chain, StoredKey } from "../../../scripts/runner-logic.js";

// ---------------------------------------------------------------- encodings
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

export function base58Decode(text: string): Uint8Array {
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

export const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
export const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const b64url = (bytes: Uint8Array) => toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (text: string) => fromBase64(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));

// ---------------------------------------------------------------- borsh
class Writer {
  private parts: Uint8Array[] = [];
  u8(n: number) {
    this.parts.push(new Uint8Array([n]));
  }
  u32(n: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    this.parts.push(b);
  }
  uint(n: bigint, bytes: number) {
    const b = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) b[i] = Number((n >> BigInt(8 * i)) & 0xffn);
    this.parts.push(b);
  }
  bytes(b: Uint8Array) {
    this.parts.push(b);
  }
  vec(b: Uint8Array) {
    this.u32(b.length);
    this.bytes(b);
  }
  string(s: string) {
    this.vec(new TextEncoder().encode(s));
  }
  out(): Uint8Array<ArrayBuffer> {
    const all = new Uint8Array(this.parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of this.parts) {
      all.set(p, o);
      o += p.length;
    }
    return all;
  }
}

export type FunctionCallTx = {
  signerId: string;
  publicKey: Uint8Array; // 32 bytes, ed25519
  nonce: bigint;
  receiverId: string;
  blockHash: Uint8Array; // 32 bytes
  method: string;
  args: object;
  gas: bigint;
  deposit: bigint;
};

/** Borsh of a NEAR Transaction (V0) holding one FunctionCall action. */
export function encodeTransaction(t: FunctionCallTx): Uint8Array<ArrayBuffer> {
  const w = new Writer();
  w.string(t.signerId);
  w.u8(0); // KeyType::ED25519
  w.bytes(t.publicKey);
  w.uint(t.nonce, 8);
  w.string(t.receiverId);
  w.bytes(t.blockHash);
  w.u32(1); // one action
  w.u8(2); // Action::FunctionCall
  w.string(t.method);
  w.vec(new TextEncoder().encode(JSON.stringify(t.args)));
  w.uint(t.gas, 8);
  w.uint(t.deposit, 16);
  return w.out();
}

/** SignedTransaction = transaction ++ Signature::ED25519(64 bytes). */
export function encodeSigned(tx: Uint8Array, signature: Uint8Array): Uint8Array {
  const w = new Writer();
  w.bytes(tx);
  w.u8(0);
  w.bytes(signature);
  return w.out();
}

// ---------------------------------------------------------------- ed25519 (WebCrypto)
/** "ed25519:<base58 of seed(32) ++ public(32)>" -> a signing key. */
async function importSecret(secretKey: string) {
  const raw = base58Decode(secretKey.replace(/^ed25519:/, ""));
  if (raw.length !== 64) throw new Error("Expected a 64-byte ed25519 secret key");
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "OKP", crv: "Ed25519", d: b64url(raw.slice(0, 32)), x: b64url(raw.slice(32)) },
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  return { key, publicKey: raw.slice(32) };
}

export async function signTransaction(secretKey: string, tx: FunctionCallTx) {
  const { key } = await importSecret(secretKey);
  const bytes = encodeTransaction(tx);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, hash));
  return { signed: encodeSigned(bytes, signature), hash: base58Encode(hash) };
}

export async function newEd25519() {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  const seed = fromB64url(jwk.d!);
  const pub = fromB64url(jwk.x!);
  const full = new Uint8Array(64);
  full.set(seed);
  full.set(pub, 32);
  return { publicKey: `ed25519:${base58Encode(pub)}`, secretKey: `ed25519:${base58Encode(full)}` };
}

// ---------------------------------------------------------------- RPC + Chain
export class WorkerChain implements Chain {
  private resting = new Map<string, number>();
  constructor(readonly nodes: string[]) {}

  /** JSON-RPC with failover: a network error, 429 or 5xx moves on and rests that node 30 s. */
  async rpc<T>(method: string, params: object): Promise<T> {
    const now = Date.now();
    const order = [...this.nodes].sort((a, b) => Number((this.resting.get(a) ?? 0) > now) - Number((this.resting.get(b) ?? 0) > now));
    let last: unknown;
    for (const node of order) {
      let res: Response;
      try {
        res = await fetch(node, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "worker", method, params }) });
      } catch (e) {
        this.resting.set(node, Date.now() + 30_000);
        last = e;
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        this.resting.set(node, Date.now() + 30_000);
        last = new Error(`RPC ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { result?: T; error?: unknown };
      if (data.error) throw new Error(JSON.stringify(data.error));
      return data.result as T;
    }
    throw last instanceof Error ? last : new Error("RPC unavailable");
  }

  async view<T>(contract: string, method: string, args: object = {}): Promise<T> {
    const r = await this.rpc<{ result: number[]; error?: string }>("query", {
      request_type: "call_function",
      account_id: contract,
      method_name: method,
      args_base64: toBase64(new TextEncoder().encode(JSON.stringify(args))),
      finality: "final",
    });
    if (r.error) throw new Error(r.error);
    return JSON.parse(new TextDecoder().decode(new Uint8Array(r.result)));
  }

  async act(key: StoredKey, receiver: string, method: string, args: object, gas: bigint) {
    const access = await this.rpc<{ nonce: number; block_hash: string }>("query", {
      request_type: "view_access_key",
      account_id: key.accountId,
      public_key: key.publicKey,
      finality: "final",
    });
    const { signed, hash } = await signTransaction(key.secretKey, {
      signerId: key.accountId,
      publicKey: base58Decode(key.publicKey.replace(/^ed25519:/, "")),
      nonce: BigInt(access.nonce) + 1n,
      receiverId: receiver,
      blockHash: base58Decode(access.block_hash),
      method,
      args,
      gas,
      deposit: 0n,
    });
    const r = await this.rpc<{ status?: { SuccessValue?: string; Failure?: unknown } }>("send_tx", {
      signed_tx_base64: toBase64(signed),
      wait_until: "EXECUTED_OPTIMISTIC",
    });
    const s = r.status ?? {};
    if ("Failure" in s) throw new Error(`${method} failed: ${JSON.stringify(s.Failure)}`);
    const text = s.SuccessValue ? new TextDecoder().decode(fromBase64(s.SuccessValue)) : "";
    return { ok: text ? JSON.parse(text) === true : false, hash };
  }

  newKey() {
    return newEd25519();
  }
}
