/**
 * Agent runner core for Node: the shared mission logic (scripts/runner-logic.ts)
 * on a near-api-js chain. Used by scripts/agent-runner.ts (local HTTP service),
 * scripts/agent-mcp.ts (key and demo modes) and scripts/agents-runner-proof.ts
 * (sandbox proof). The Cloudflare Worker (workers/runner) runs the same logic
 * on a WebCrypto chain.
 */
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from "near-api-js";
import { RunnerLogic, type Chain, type Store, type StoredKey } from "./runner-logic.js";

export { MemoryStore, type BuyerMission, type Chain, type Job, type Payment, type PayerMission, type Store, type StoredKey } from "./runner-logic.js";

/** NEAR through near-api-js and one RPC endpoint. */
export class NearApiChain implements Chain {
  constructor(readonly rpc: string) {}

  async view<T>(contract: string, method: string, args: object = {}): Promise<T> {
    const r = await (
      await fetch(this.rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "runner",
          method: "query",
          params: {
            request_type: "call_function",
            account_id: contract,
            method_name: method,
            args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
            finality: "final",
          },
        }),
      })
    ).json();
    if (r.error || r.result?.error) throw new Error(JSON.stringify(r.error ?? r.result.error));
    return JSON.parse(Buffer.from(r.result.result).toString());
  }

  async act(key: StoredKey, receiver: string, method: string, args: object, gas: bigint) {
    const account = new Account(key.accountId, new JsonRpcProvider({ url: this.rpc }), KeyPairSigner.fromSecretKey(key.secretKey as `ed25519:${string}`));
    const r = await account.signAndSendTransaction({
      receiverId: receiver,
      actions: [actions.functionCall(method, args, gas, 0n)],
      waitUntil: "FINAL",
      throwOnFailure: false,
    });
    const s = r.status as { SuccessValue?: string; Failure?: unknown };
    if (s && typeof s === "object" && "Failure" in s) throw new Error(`${method} failed: ${JSON.stringify(s.Failure)}`);
    const text = Buffer.from(s?.SuccessValue ?? "", "base64").toString();
    return { ok: text ? JSON.parse(text) === true : false, hash: r.transaction.hash as string };
  }

  async newKey() {
    const kp = KeyPair.fromRandom("ed25519");
    return { publicKey: kp.getPublicKey().toString(), secretKey: kp.toString() };
  }
}

/** The runner as before: same constructor, near-api-js underneath. */
export class Runner extends RunnerLogic {
  constructor(opts: { rpc: string; agents: string; agentsV2?: string; store: Store; log?: (line: string) => void }) {
    super({ agents: opts.agents, agentsV2: opts.agentsV2, store: opts.store, log: opts.log, chain: new NearApiChain(opts.rpc) });
  }
}
