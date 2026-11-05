import { stableJSON } from "../packages/shared/missions";
import {
  verifyTransaction,
  type TransactionIntent,
} from "../packages/shared/transactions";
import { rpc } from "./client";
const key = "everkeep.operations.v2";
export function operations(): TransactionIntent[] {
  const data = JSON.parse(localStorage.getItem(key) || "[]");
  if (!Array.isArray(data) || data.length > 500)
    throw new Error(
      "Journal d’opérations illisible. Aucun nouvel envoi avant vérification.",
    );
  return data;
}
export function saveOperation(operation: TransactionIntent) {
  const all = operations(),
    i = all.findIndex((x) => x.id === operation.id);
  if (i >= 0) all[i] = operation;
  else {
    if (all.length >= 500)
      throw new Error(
        "Journal complet. Conservez le suivi avant une nouvelle opération.",
      );
    all.push(operation);
  }
  localStorage.setItem(key, JSON.stringify(all));
  window.dispatchEvent(new Event("everkeep-operations"));
  return operation;
}
export async function prepareOperation(
  input: Omit<TransactionIntent, "id" | "createdAt" | "status" | "fingerprint">,
) {
  const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(stableJSON(input)),
    ),
    fingerprint = Array.from(new Uint8Array(hash), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
  const prior = operations()
    .slice()
    .reverse()
    .find((x) => x.fingerprint === fingerprint && x.status !== "rejected");
  // Reconciliation may need several explicit reads of changing asynchronous state.
  // Only these zero-deposit, contract-idempotent methods may be submitted again
  // after final success. Never resubmit an unknown operation or a capital payment.
  const repeatRead =
    prior?.status === "confirmed" &&
    input.deposit === "0" &&
    [
      "reconcile_allocation",
      "resume_sale",
      "release_settled",
      "release_cancelled",
    ].includes(input.method);
  if (prior && !repeatRead) return { operation: prior, fresh: false };
  return {
    operation: saveOperation({
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      fingerprint,
      status: "signing",
    }),
    fresh: true,
  };
}
export async function followOperation(operation: TransactionIntent) {
  if (!operation.hash)
    throw new Error(
      "Autorisation interrompue sans référence retournée par le wallet. Relisez la mission ou la position ; aucun second paiement n’est envoyé.",
    );
  const result = await rpc("tx", {
    tx_hash: operation.hash,
    sender_account_id: operation.owner,
    wait_until: "FINAL",
  });
  const verified = verifyTransaction(operation, result);
  saveOperation({
    ...operation,
    status: verified.failed ? "failed" : "confirmed",
    error: verified.failed
      ? "Transaction ou reçu intercontrat refusé."
      : undefined,
  });
  window.dispatchEvent(new Event("everkeep-balances"));
  if (verified.failed)
    throw new Error(
      "Transaction ou reçu intercontrat refusé. Le hash ne prouve pas la réussite ; consultez la créance prévue par le contrat.",
    );
  return result;
}
export async function consumeWalletReturn() {
  const url = new URL(location.href),
    id = url.searchParams.get("ek_op"),
    hashes = url.searchParams.get("transactionHashes"),
    error = url.searchParams.get("errorCode");
  if (!id || (!hashes && !error)) return;
  const operation = operations().find((x) => x.id === id);
  if (!operation) throw new Error("Retour wallet sans opération connue.");
  try {
    if (error) {
      saveOperation({
        ...operation,
        status: /reject|cancel/i.test(error) ? "rejected" : "pending",
        error: "Le wallet a refusé ou interrompu cette opération.",
      });
      return;
    }
    const list = hashes!.split(",");
    if (list.length !== 1 || !/^[1-9A-HJ-NP-Za-km-z]{40,46}$/.test(list[0]))
      throw new Error("Retour wallet invalide.");
    await followOperation(
      saveOperation({ ...operation, status: "pending", hash: list[0] }),
    );
  } finally {
    for (const field of [
      "ek_op",
      "transactionHashes",
      "errorCode",
      "errorMessage",
    ])
      url.searchParams.delete(field);
    history.replaceState(null, "", url);
  }
}
