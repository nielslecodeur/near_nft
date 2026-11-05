import { config, rpc, view, walletSelector } from "./client";
import { hasWalletApprovalSession } from "./wallet-session";
import {
  calculateWalletBalances,
  TESTNET,
  type WalletBalances,
  type Deployment,
} from "../packages/shared/network";
import {
  prepareOperation,
  saveOperation,
  followOperation,
  operations,
} from "./transaction-journal";
import type { FunctionIntent } from "../packages/shared/transactions";
export type WalletTransaction = { receiver: string; calls: FunctionIntent[] };
/** One native approval, several ordered transactions. Intear's queue awaits execution
 * between transactions. Every result is independently finalized and bound to its intent. */
export async function walletTransactions(
  transactions: WalletTransaction[],
  expectedOwner?: string,
) {
  await assertTestnet();
  if (!transactions.length || transactions.length > 8)
    throw new Error("Groupe de transactions invalide.");
  const connector = await walletSelector(),
    wallet = await connector.wallet(),
    owner = await connectedAccount();
  if (expectedOwner && owner !== expectedOwner)
    throw new Error(
      "Le wallet connecté a changé. Relisez le récapitulatif avant de signer.",
    );
  if (
    !owner ||
    wallet.manifest.id !== "intear-wallet" ||
    !wallet.manifest.features.signAndSendTransactions
  )
    throw new Error("Choisissez Intear pour valider ce parcours groupé.");
  if (!hasWalletApprovalSession()) {
    await wallet.signOut({ network: "testnet" });
    const restored = await connector.connect({ walletId: "intear-wallet" });
    if ((await restored.getAccounts())[0]?.accountId !== owner)
      throw new Error(
        "Le compte a changé pendant la reconnexion. Relisez le récapitulatif.",
      );
  }
  const prepared = [];
  try {
    for (const transaction of transactions) {
      if (
        !transaction.calls.length ||
        transaction.calls.reduce((n, c) => n + BigInt(c.gas), 0n) >
          300_000_000_000_000n
      )
        throw new Error("Budget de gas du groupe invalide.");
      prepared.push(
        await prepareOperation({
          network: "testnet",
          owner,
          receiver: transaction.receiver,
          ...transaction.calls[0],
          actions: transaction.calls,
        }),
      );
    }
    for (const p of prepared.filter((p) => !p.fresh))
      await followOperation(p.operation);
  } catch (e) {
    for (const p of prepared.filter((p) => p.fresh))
      saveOperation({
        ...p.operation,
        status: "rejected",
        error: "Préparation interrompue avant ouverture du wallet.",
      });
    throw e;
  }
  const fresh = prepared
    .map((p, i) => ({ ...p, index: i }))
    .filter((p) => p.fresh);
  if (!fresh.length) return prepared.map((p) => p.operation);
  window.dispatchEvent(
    new CustomEvent("everkeep-wallet-step", {
      detail: { method: "group", phase: "signing" },
    }),
  );
  try {
    const returned = await wallet.signAndSendTransactions({
      network: "testnet",
      signerId: owner,
      transactions: fresh.map((p) => ({
        receiverId: p.operation.receiver,
        actions: transactions[p.index].calls.map((c) => ({
          type: "FunctionCall" as const,
          params: {
            methodName: c.method,
            args: c.args,
            gas: c.gas,
            deposit: c.deposit,
          },
        })),
      })),
    });
    // Preserve every returned hash before verification so one failed receipt cannot
    // hide successful or pending siblings. Missing outcomes remain unknown.
    fresh.forEach((p, i) =>
      saveOperation({
        ...p.operation,
        status: "pending",
        hash: returned[i]?.transaction?.hash,
      }),
    );
    if (returned.length !== fresh.length)
      throw new Error(
        "Retour du wallet incomplet : relisez le suivi avant toute reprise.",
      );
    window.dispatchEvent(
      new CustomEvent("everkeep-wallet-step", {
        detail: { method: "group", phase: "pending" },
      }),
    );
    const checked = await Promise.allSettled(
      fresh.map((p) =>
        followOperation(operations().find((o) => o.id === p.operation.id)!),
      ),
    );
    const failure = checked.find((r) => r.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    return prepared.map((p) =>
      operations().find((o) => o.id === p.operation.id)!,
    );
  } catch (e) {
    for (const p of fresh) {
      const current = operations().find((o) => o.id === p.operation.id)!;
      if (current.status === "signing")
        saveOperation({
          ...current,
          status: /user rejected|user denied/i.test(String(e))
            ? "rejected"
            : "pending",
          error: String(e),
        });
    }
    throw e;
  } finally {
    window.dispatchEvent(
      new CustomEvent("everkeep-wallet-step", { detail: null }),
    );
  }
}
let deployment: Deployment | null = null;
export function currentDeployment() {
  return deployment;
}
export async function testnetDeployment(): Promise<Deployment | null> {
  const r = await fetch("/testnet.json", { cache: "no-store" });
  if (!r.ok) throw new Error("Configuration testnet illisible.");
  const data = await r.json();
  if (data.network !== "testnet")
    throw new Error("Configuration réseau incompatible.");
  deployment = data.deployment || null;
  if (deployment) {
    if (
      deployment.network !== "testnet" ||
      !deployment.collection.endsWith(".testnet") ||
      !deployment.asset.endsWith(".testnet")
    )
      throw new Error("Contrats non testnet refusés.");
    config.collection = deployment.collection;
    config.asset = deployment.asset;
    config.strategy = deployment.strategy;
  }
  return deployment;
}
export async function assertTestnet() {
  const status = await rpc("status", []);
  if (status.chain_id !== "testnet" || status.protocol_version < 88)
    throw new Error("Réseau incompatible : NEAR testnet protocole 88 requis.");
  return status;
}
export async function readWalletBalances(
  account: string,
): Promise<WalletBalances> {
  await assertTestnet();
  if (!/^([a-z0-9_-]+\.)*[a-z0-9_-]+$/.test(account) || account.length > 64)
    throw new Error("Compte NEAR invalide.");
  const block = await rpc("block", { finality: "final" });
  const native = await rpc("query", {
    request_type: "view_account",
    account_id: account,
    block_id: block.header.hash,
  });
  const token = config.asset
    ? await view(
        config.asset,
        "ft_balance_of",
        { account_id: account },
        block.header.hash,
      )
    : "0";
  return calculateWalletBalances(
    account,
    native.amount,
    native.storage_usage,
    native.locked,
    TESTNET.storageByteCost,
    token,
    block.header.timestamp_nanosec,
    block.header.hash,
    config.asset || null,
  );
}
export async function connectedAccount() {
  const connector = await walletSelector();
  if (connector.network !== "testnet")
    throw new Error("Wallet configuré sur un autre réseau.");
  return (await (await connector.wallet()).getAccounts())[0]?.accountId || "";
}
export async function walletCall(
  receiver: string,
  method: string,
  args: Record<string, unknown>,
  deposit = "0",
  gas = "280000000000000",
) {
  await assertTestnet();
  const connector = await walletSelector(),
    wallet = await connector.wallet(),
    signer = await connectedAccount();
  if (!signer) throw new Error("Connectez un wallet avant de signer.");
  if (wallet.manifest.id === "near-cli")
    throw new Error(
      "Choisissez un wallet navigateur pour signer dans l’application.",
    );
  if (wallet.manifest.id === "intear-wallet" && !hasWalletApprovalSession()) {
    await wallet.signOut({ network: "testnet" });
    const restored = await connector.connect({ walletId: "intear-wallet" });
    if ((await restored.getAccounts())[0]?.accountId !== signer)
      throw new Error(
        "Le compte sélectionné a changé pendant la reconnexion. Relisez la proposition avant de signer.",
      );
  }
  const { operation, fresh } = await prepareOperation({
    network: "testnet",
    owner: signer,
    receiver,
    method,
    args,
    deposit,
    gas,
  });
  if (!fresh) return followOperation(operation);
  const url = new URL(location.href);
  url.searchParams.set("ek_op", operation.id);
  history.replaceState(null, "", url);
  window.dispatchEvent(
    new CustomEvent("everkeep-phase", { detail: "signing" }),
  );
  let tracked = operation;
  window.dispatchEvent(
    new CustomEvent("everkeep-wallet-step", {
      detail: { method, phase: "signing" },
    }),
  );
  try {
    const returned = await wallet.signAndSendTransaction({
      network: "testnet",
      signerId: signer,
      receiverId: receiver,
      actions: [
        {
          type: "FunctionCall",
          params: { methodName: method, args, gas, deposit },
        },
      ],
    });
    tracked = saveOperation({
      ...operation,
      status: "pending",
      hash: returned?.transaction?.hash,
    });
    window.dispatchEvent(
      new CustomEvent("everkeep-wallet-step", {
        detail: { method, phase: "pending" },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("everkeep-phase", { detail: "pending" }),
    );
    const result = await followOperation(tracked);
    window.dispatchEvent(
      new CustomEvent("everkeep-transaction", {
        detail: result.transaction.hash,
      }),
    );
    let position =
      typeof args.position === "string"
        ? args.position
        : typeof args.wallet === "string"
          ? args.wallet
          : method === "create_plan"
            ? String(args.name) + "." + receiver
            : receiver;
    if (typeof args.msg === "string") {
      try {
        const m = JSON.parse(args.msg);
        position =
          m.Subscribe || m.position || m.AgentSubscribe?.position || position;
      } catch {}
    }
    const activityKey = "everkeep.activity.v1:" + signer;
    let entries: unknown[] = [];
    try {
      entries = JSON.parse(localStorage.getItem(activityKey) || "[]");
    } catch {}
    localStorage.setItem(
      activityKey,
      JSON.stringify(
        [
          {
            position,
            method,
            hash: result.transaction.hash,
            at: new Date().toISOString(),
          },
          ...entries,
        ].slice(0, 100),
      ),
    );
    return result;
  } catch (error) {
    const current = operations().find((o) => o.id === operation.id)!;
    if (current.status !== "confirmed" && current.status !== "failed")
      saveOperation({
        ...current,
        status:
          /user rejected|rejected by user|user denied|user cancelled|user canceled/i.test(
            String(error),
          )
            ? "rejected"
            : "pending",
        error: String(error),
      });
    throw error;
  } finally {
    window.dispatchEvent(
      new CustomEvent("everkeep-wallet-step", { detail: null }),
    );
    const current = new URL(location.href);
    if (
      current.searchParams.get("ek_op") === operation.id &&
      operations().find((o) => o.id === operation.id)?.status !== "pending"
    ) {
      current.searchParams.delete("ek_op");
      history.replaceState(null, "", current);
    }
  }
}
