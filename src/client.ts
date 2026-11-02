import type { WalletSelector } from "@near-wallet-selector/core";
import { verifyPair, type Snapshot } from "../packages/shared/index.js";
export const config = {
  rpc: import.meta.env.VITE_RPC_URL || "https://rpc.testnet.near.org",
  collection: import.meta.env.VITE_COLLECTION_ID || "",
  asset: import.meta.env.VITE_ASSET_ID || "",
  strategy: import.meta.env.VITE_STRATEGY_ID || "",
};
let selector: WalletSelector | undefined;
export async function walletSelector() {
  if (!selector) {
    const [{ setupWalletSelector }, { setupMyNearWallet }] = await Promise.all([
      import("@near-wallet-selector/core"),
      import("@near-wallet-selector/my-near-wallet"),
    ]);
    selector = await setupWalletSelector({
      network: "testnet",
      modules: [setupMyNearWallet()],
    });
  }
  return selector;
}
export async function connect() {
  if (!config.collection)
    throw new Error(
      "Configurez VITE_COLLECTION_ID après un déploiement testnet. La sandbox locale reste disponible.",
    );
  const s = await walletSelector();
  if (!s.isSignedIn()) {
    const { setupModal } = await import("@near-wallet-selector/modal-ui");
    setupModal(s, { contractId: config.collection }).show();
    return "";
  }
  return s.store.getState().accounts[0]?.accountId ?? "";
}
export async function rpc(method: string, params: object) {
  const response = await fetch(config.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "everkeep", method, params }),
  });
  const data = await response.json();
  if (!response.ok || data.error)
    throw new Error(data.error?.message || "RPC indisponible");
  return data.result;
}
export async function view(
  account: string,
  method: string,
  args: object,
  block: string,
) {
  const result = await rpc("query", {
    request_type: "call_function",
    account_id: account,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
    block_id: block,
  });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result)));
}
export async function verified(account: string): Promise<Snapshot> {
  if (!config.collection) throw new Error("Collection testnet non configurée");
  let reason = "Lecture non convergente";
  for (let retry = 0; retry < 3; retry++) {
    const block = await rpc("block", { finality: "final" });
    const [item, token] = await Promise.all([
      view(account, "snapshot", {}, block.header.hash),
      view(
        config.collection,
        "nft_token",
        { token_id: account },
        block.header.hash,
      ),
    ]);
    try {
      return verifyPair(config.collection, account, item, token);
    } catch (e) {
      reason = String(e);
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error(reason);
}
export async function transaction(
  receiver: string,
  method: string,
  args: object,
  deposit = "0",
) {
  const s = await walletSelector();
  const wallet = await s.wallet();
  const { actionCreators } = await import("@near-js/transactions");
  const result = await wallet.signAndSendTransaction({
    receiverId: receiver,
    actions: [
      actionCreators.functionCall(
        method,
        args,
        200_000_000_000_000n,
        BigInt(deposit),
      ),
    ],
  });
  if (
    result &&
    ((typeof result.status === "object" && "Failure" in result.status) ||
      result.receipts_outcome?.some(
        (r) =>
          typeof r.outcome.status === "object" && "Failure" in r.outcome.status,
      ))
  )
    throw new Error(
      "La transaction ou un reçu a échoué. Consultez l’explorateur.",
    );
  if (result?.transaction.hash)
    window.dispatchEvent(
      new CustomEvent("everkeep-transaction", {
        detail: result.transaction.hash,
      }),
    );
  return result;
}
export async function depositPlan(s: Snapshot, amount: string) {
  const selector = await walletSelector(),
    wallet = await selector.wallet();
  const { actionCreators } = await import("@near-js/transactions");
  const results = await wallet.signAndSendTransactions({
    transactions: [
      {
        receiverId: s.strategy,
        actions: [
          actionCreators.functionCall(
            "register_position",
            { wallet: s.account_id },
            30_000_000_000_000n,
            20_000_000_000_000_000_000_000n,
          ),
        ],
      },
      {
        receiverId: s.asset,
        actions: [
          actionCreators.functionCall(
            "storage_deposit",
            { account_id: s.account_id, registration_only: true },
            30_000_000_000_000n,
            10_000_000_000_000_000_000_000n,
          ),
          actionCreators.functionCall(
            "ft_transfer_call",
            { receiver_id: s.account_id, amount, msg: s.account_id },
            170_000_000_000_000n,
            1n,
          ),
        ],
      },
    ],
  });
  for (const result of results || []) {
    if (
      (typeof result.status === "object" && "Failure" in result.status) ||
      result.receipts_outcome.some(
        (r) =>
          typeof r.outcome.status === "object" && "Failure" in r.outcome.status,
      )
    )
      throw new Error(
        "Dépôt ou financement du stockage refusé. Consultez les reçus.",
      );
    window.dispatchEvent(
      new CustomEvent("everkeep-transaction", {
        detail: result.transaction.hash,
      }),
    );
  }
}
export async function local(command?: string, args: object = {}) {
  const response = await fetch(
    "http://127.0.0.1:8787/" + (command ? "action" : "state"),
    command
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command, ...args }),
        }
      : {},
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Sandbox indisponible");
  return data;
}
