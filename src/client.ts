import type { NearConnector } from "@hot-labs/near-connect";
import { installWalletSessionStorage } from "./wallet-session";
import { TESTNET } from "../packages/shared/network";
import { verifyPair, type Snapshot } from "../packages/shared/index.js";
import { parseOwnedPlans } from "../packages/shared/wallet.js";
export const config = {
  rpc: import.meta.env.VITE_RPC_URL || TESTNET.rpc,
  collection: import.meta.env.VITE_COLLECTION_ID || "",
  asset: import.meta.env.VITE_ASSET_ID || "",
  strategy: import.meta.env.VITE_STRATEGY_ID || "",
  basketCollection: "",
};
let selector: NearConnector | undefined;
let selectorPromise: Promise<NearConnector> | undefined;
export async function walletSelector() {
  installWalletSessionStorage();
  if (selector) return selector;
  if (!selectorPromise)
    selectorPromise = (async () => {
      const { NearConnector } = await import("@hot-labs/near-connect");
      const candidate = new NearConnector({
        network: "testnet",
        providers: { testnet: [config.rpc] },
        features: {
          testnet: true,
          signInWithoutAddKey: true,
          signAndSendTransaction: true,
        },
        excludedWallets: ["near-cli"],
        autoConnect: true,
        logger: { log: () => {} },
      });
      await Promise.race([
        candidate.whenManifestLoaded,
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  "Le catalogue des wallets ne répond pas. Réessayez la connexion.",
                ),
              ),
            20000,
          ),
        ),
      ]);
      selector = candidate;
      return selector;
    })().catch((error) => {
      selectorPromise = undefined;
      throw error;
    });
  return selectorPromise;
}
export async function connect(walletId?: string) {
  const s = await walletSelector();
  const connected = await s.connect(walletId ? { walletId } : undefined);
  return (await connected.getAccounts())[0]?.accountId || "";
}
export async function disconnect() {
  const s = await walletSelector();
  await s.disconnect();
}
export async function ownedPlans(owner: string, offset = 0) {
  if (!config.collection)
    throw new Error(
      "La collection Everkeep testnet n’est pas encore configurée. La connexion wallet fonctionne ; la recherche des NFT-comptes sera disponible après son déploiement.",
    );
  const block = await rpc("block", { finality: "final" });
  const tokens = await view(
    config.collection,
    "nft_tokens_for_owner",
    { account_id: owner, from_index: String(offset), limit: 20 },
    block.header.hash,
  );
  return parseOwnedPlans(tokens, owner, config.collection);
}
/**
 * Public testnet RPC nodes, in order. FastNEAR rate-limits bursts and its 429
 * carries no CORS header, so the browser sees a network error: on that, a 429
 * or a 5xx, the call moves to the next node and the busy one rests 30 s.
 * An RPC-level error (unknown account, contract panic) is an answer: no failover.
 */
const RPC_NODES = import.meta.env.VITE_RPC_URL
  ? [import.meta.env.VITE_RPC_URL as string]
  : [TESTNET.rpc, "https://rpc.testnet.near.org"];
const restingUntil = new Map<string, number>();

export async function rpc(method: string, params: object) {
  const now = Date.now();
  const nodes = [...RPC_NODES].sort((a, b) => Number((restingUntil.get(a) ?? 0) > now) - Number((restingUntil.get(b) ?? 0) > now));
  let lastError: unknown;
  for (const node of nodes) {
    let response: Response;
    try {
      response = await fetch(node, {
        signal: AbortSignal.timeout(18000),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "everkeep", method, params }),
      });
    } catch (e) {
      restingUntil.set(node, Date.now() + 30_000);
      lastError = e;
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      restingUntil.set(node, Date.now() + 30_000);
      lastError = new Error(`RPC ${response.status}`);
      continue;
    }
    const data = await response.json();
    if (!response.ok || data.error)
      throw new Error(
        data.error ? JSON.stringify(data.error) : "RPC indisponible",
      );
    return data.result;
  }
  throw lastError instanceof Error ? lastError : new Error("RPC indisponible");
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
export async function verified(
  account: string,
  readOnly = false,
): Promise<Snapshot> {
  if (!config.collection) throw new Error("Collection testnet non configurée");
  if (
    config.basketCollection &&
    account.endsWith("." + config.basketCollection)
  ) {
    const { readBasketPosition } = await import("./basket-network");
    const block = await rpc("block", { finality: "final" }),
      s = await readBasketPosition(account, block.header.hash);
    if (!readOnly && s.status !== "Active")
      throw Error("Position thématique gelée.");
    return s;
  }
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
      return verifyPair(config.collection, account, item, token, readOnly);
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
  window.dispatchEvent(
    new CustomEvent("everkeep-phase", { detail: "signing" }),
  );
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
  window.dispatchEvent(
    new CustomEvent("everkeep-phase", { detail: "pending" }),
  );
  if (!result)
    throw new Error(
      "Le wallet n’a pas encore retourné de résultat. Vérifiez l’historique avant de réessayer cette opération.",
    );
  if (
    result &&
    ((typeof result.status === "object" && "Failure" in result.status) ||
      result.receipts_outcome?.some(
        (r: { outcome: { status: Record<string, unknown> } }) =>
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
  window.dispatchEvent(
    new CustomEvent("everkeep-phase", { detail: "signing" }),
  );
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
  window.dispatchEvent(
    new CustomEvent("everkeep-phase", { detail: "pending" }),
  );
  if (!results?.length)
    throw new Error(
      "Le wallet n’a pas encore retourné les résultats du dépôt. Vérifiez l’historique avant de réessayer.",
    );
  for (const result of results) {
    if (
      (typeof result.status === "object" && "Failure" in result.status) ||
      result.receipts_outcome.some(
        (r: { outcome: { status: Record<string, unknown> } }) =>
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
