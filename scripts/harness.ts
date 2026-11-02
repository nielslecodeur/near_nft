// Real RPC/transactions using near-api-js 7.4. The legacy workspaces client is not used.
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  actions,
  type Action,
} from "near-api-js";
type RpcTransactionResponse = Awaited<
  ReturnType<Account["signAndSendTransaction"]>
>;
import { readFile } from "node:fs/promises";
export class Receipt {
  constructor(readonly result: RpcTransactionResponse) {}
  get receiptFailures() {
    return this.result.receipts_outcome
      .filter(
        (r) =>
          typeof r.outcome.status === "object" && "Failure" in r.outcome.status,
      )
      .map((r) => r.outcome.status);
  }
  get receiptFailureMessages() {
    return this.receiptFailures.map((r) => JSON.stringify(r));
  }
  get failed() {
    return (
      typeof this.result.status === "object" && "Failure" in this.result.status
    );
  }
  get succeeded() {
    return !this.failed;
  }
  get gas_burnt() {
    return (
      BigInt(this.result.transaction_outcome.outcome.gas_burnt) +
      this.result.receipts_outcome.reduce(
        (a, r) => a + BigInt(r.outcome.gas_burnt),
        0n,
      )
    ).toString();
  }
}
export class SandboxAccount {
  private native: Account;
  constructor(
    readonly accountId: string,
    readonly endpoint: string,
    readonly key?: KeyPair,
  ) {
    this.native = new Account(
      accountId,
      new JsonRpcProvider({ url: endpoint }),
      key ? new KeyPairSigner(key) : undefined,
    );
  }
  async rpc(method: string, params: object): Promise<any> {
    const r = await (
      await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "everkeep",
          method,
          params,
        }),
      })
    ).json();
    if (r.error) throw new Error(JSON.stringify(r.error));
    return r.result;
  }
  async transact(receiver: string, list: Action[]) {
    return new Receipt(
      await this.native.signAndSendTransaction({
        receiverId: receiver,
        actions: list,
        waitUntil: "FINAL",
        throwOnFailure: false,
      }),
    );
  }
  async createSubAccount(name: string, options: { initialBalance: bigint }) {
    const key = KeyPair.fromRandom("ed25519"),
      id = name + "." + this.accountId;
    const tx = await this.transact(id, [
      actions.createAccount(),
      actions.transfer(options.initialBalance),
      actions.addFullAccessKey(key.getPublicKey()),
    ]);
    if (tx.failed || tx.receiptFailures.length)
      throw new Error(JSON.stringify(tx.result));
    return new SandboxAccount(id, this.endpoint, key);
  }
  getAccount(id: string) {
    return new SandboxAccount(id, this.endpoint);
  }
  async getKey() {
    return this.key ?? null;
  }
  async deploy(path: string) {
    return this.transact(this.accountId, [
      actions.deployContract(await readFile(path)),
    ]);
  }
  async callRaw(
    target: SandboxAccount | string,
    method: string,
    args: object,
    options: { gas?: bigint; attachedDeposit?: bigint } = {},
  ) {
    return this.transact(
      typeof target === "string" ? target : target.accountId,
      [
        actions.functionCall(
          method,
          args,
          options.gas ?? 100_000_000_000_000n,
          options.attachedDeposit ?? 0n,
        ),
      ],
    );
  }
  async call<T>(
    target: SandboxAccount | string,
    method: string,
    args: object,
    options: { gas?: bigint; attachedDeposit?: bigint } = {},
  ): Promise<T> {
    const r = await this.callRaw(target, method, args, options);
    if (r.failed || r.receiptFailures.length)
      throw new Error(
        JSON.stringify(r.result.status) +
          " " +
          r.receiptFailureMessages.join("; "),
      );
    const status = r.result.status;
    if (typeof status === "object" && "SuccessValue" in status) {
      const text = Buffer.from(status.SuccessValue, "base64").toString();
      return (text ? JSON.parse(text) : null) as T;
    }
    return null as T;
  }
  async view<T>(method: string, args: object = {}, block?: string): Promise<T> {
    const r = await this.rpc("query", {
      request_type: "call_function",
      account_id: this.accountId,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      ...(block ? { block_id: block } : { finality: "final" }),
    });
    return JSON.parse(Buffer.from(r.result).toString());
  }
  async viewAccessKeys(id: string) {
    return this.rpc("query", {
      request_type: "view_access_key_list",
      account_id: id,
      finality: "final",
    }) as Promise<{ keys: unknown[] }>;
  }
  async accountView() {
    return this.rpc("query", {
      request_type: "view_account",
      account_id: this.accountId,
      finality: "final",
    });
  }
  async exists() {
    try {
      await this.accountView();
      return true;
    } catch {
      return false;
    }
  }
  batch(target: SandboxAccount) {
    return {
      deleteKey: (key: ReturnType<KeyPair["getPublicKey"]>) => ({
        transact: () =>
          this.transact(target.accountId, [actions.deleteKey(key)]),
      }),
    };
  }
}
