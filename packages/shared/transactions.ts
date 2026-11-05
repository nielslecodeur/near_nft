import { stableJSON } from "./missions.js";
export type FunctionIntent = {
  method: string;
  args: Record<string, unknown>;
  deposit: string;
  gas: string;
};
export type TransactionIntent = {
  actions?: FunctionIntent[];
  id: string;
  network: "testnet";
  owner: string;
  receiver: string;
  method: string;
  args: Record<string, unknown>;
  deposit: string;
  gas: string;
  createdAt: string;
  fingerprint: string;
  status: "signing" | "pending" | "confirmed" | "failed" | "rejected";
  hash?: string;
  error?: string;
};
/** An SDK hash is a reference. Only the exact final transaction and all its receipts establish success. */
export function verifyTransaction(intent: TransactionIntent, result: any) {
  if (result?.final_execution_status !== "FINAL")
    throw new Error(
      "Transaction non finalisée ; suivi conservé sans nouvel envoi.",
    );
  if (
    result.transaction.signer_id !== intent.owner ||
    result.transaction.receiver_id !== intent.receiver ||
    !Array.isArray(result.transaction.actions) ||
    result.transaction.actions.length !== (intent.actions?.length || 1) ||
    (intent.hash && result.transaction.hash !== intent.hash)
  )
    throw new Error(
      "Le reçu du wallet ne correspond pas à l’opération examinée.",
    );
  for (const [index, expected] of (intent.actions || [intent]).entries()) {
    const action = result.transaction.actions[index]?.FunctionCall;
    if (
      !action ||
      action.method_name !== expected.method ||
      action.deposit !== expected.deposit ||
      String(action.gas) !== expected.gas
    )
      throw new Error("Action différente du récapitulatif autorisé.");
    let decoded: unknown;
    try {
      decoded = JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(atob(action.args), (c) => c.charCodeAt(0)),
        ),
      );
    } catch {
      throw new Error("Paramètres du reçu illisibles.");
    }
    if (stableJSON(decoded) !== stableJSON(expected.args))
      throw new Error(
        "Les paramètres du reçu sont différents de votre autorisation.",
      );
  }
  if (
    !Array.isArray(result.receipts_outcome) ||
    !result.receipts_outcome.length ||
    !result.status ||
    typeof result.status !== "object" ||
    !("SuccessValue" in result.status || "Failure" in result.status)
  )
    throw new Error("Reçus intercontrats incomplets ; aucun succès présumé.");
  if (
    result.receipts_outcome.some((r: any) => {
      const status = r?.outcome?.status;
      return (
        !status ||
        typeof status !== "object" ||
        !(
          "SuccessValue" in status ||
          "SuccessReceiptId" in status ||
          "Failure" in status
        )
      );
    })
  )
    throw new Error("Reçu intercontrat illisible ; aucun succès présumé.");
  const failed =
    "Failure" in result.status ||
    result.receipts_outcome.some(
      (r: any) =>
        r.outcome?.status &&
        typeof r.outcome.status === "object" &&
        "Failure" in r.outcome.status,
    );
  return { failed, hash: String(result.transaction.hash) };
}
