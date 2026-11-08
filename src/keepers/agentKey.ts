/**
 * Agent keys: a fresh ed25519 key pair the owner's wallet adds to their own
 * account as a function-call key, limited to the Keepers contract.
 *
 * NEAR key strings are "ed25519:<base58>". The secret form is the 32-byte seed
 * followed by the 32-byte public key (64 bytes), as near-api-js expects.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";

export type AgentKey = { publicKey: string; secretKey: string };

export function generateAgentKey(): AgentKey {
  const seed = ed25519.utils.randomSecretKey();
  const pub = ed25519.getPublicKey(seed);
  const secret = new Uint8Array(64);
  secret.set(seed, 0);
  secret.set(pub, 32);
  return {
    publicKey: `ed25519:${base58.encode(pub)}`,
    secretKey: `ed25519:${base58.encode(secret)}`,
  };
}
