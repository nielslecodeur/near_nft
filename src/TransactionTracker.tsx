import { useEffect, useState } from "react";
import {
  operations,
  followOperation,
  consumeWalletReturn,
} from "./transaction-journal";
import { TESTNET } from "../packages/shared/network";
export function TransactionTracker({
  owner,
  onRefresh,
}: {
  owner: string;
  onRefresh: () => void;
}) {
  const [version, setVersion] = useState(0),
    [step, setStep] = useState<{ method: string; phase: string } | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const update = () => setVersion((v) => v + 1);
    window.addEventListener("everkeep-operations", update);
    const progress = (e: Event) => setStep((e as CustomEvent).detail);
    window.addEventListener("everkeep-wallet-step", progress);
    void consumeWalletReturn()
      .then(onRefresh)
      .catch((e) => setError(String(e)));
    return () => {
      window.removeEventListener("everkeep-operations", update);
      window.removeEventListener("everkeep-wallet-step", progress);
    };
  }, []);
  const pending = operations()
    .filter(
      (o) =>
        o.owner === owner &&
        ["signing", "pending", "failed"].includes(o.status),
    )
    .slice(-5);
  async function refresh(id: string) {
    setBusy(id);
    setError("");
    try {
      const op = operations().find((o) => o.id === id)!;
      if (op.hash) await followOperation(op);
      onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
      setVersion((v) => v + 1);
    }
  }
  if (!pending.length && !error && !step) return null;
  const labels: Record<string, string> = {
    group: "Validation groupée",
    reserve_allocation: "Réservation de la position",
    create_plan: "Création du compte NFT · provision de 6 NEAR",
    register_position: "Enregistrement de la position · 0,02 NEAR",
    execute: "Autorisation ML-DSA de la position",
    authorize_allocation: "Consentement lié à cette mission",
    ft_transfer_call: "Dépôt du capital demoUSD",
    reconcile_allocation: "Confirmation finale de la souscription",
    quote: "Enregistrement du devis",
    pay: "Paiement de l’analyse",
  };
  return (
    <>
      {step && (
        <div className="wallet-progress" role="status">
          <strong>
            {labels[step.method] || "Opération dans votre wallet"}
          </strong>
          <p>
            {step.phase === "signing"
              ? "Examinez le récapitulatif dans Intear, puis validez une fois."
              : "Validation reçue. Création et vérification en cours…"}
          </p>
        </div>
      )}
      {(pending.length > 0 || error) && (
        <details className="transaction-tracker" data-version={version}>
          <summary>Suivi technique</summary>
          <p>
            Ce suivi relit les références publiques. Il ne demande aucune
            nouvelle dépense.
          </p>
          {pending.map((o) => (
            <article key={o.id}>
              <strong>
                {o.status === "signing"
                  ? "Signature ouverte"
                  : o.status === "failed"
                    ? "Transaction refusée"
                    : "Résultat en attente"}
              </strong>
              <p>
                {o.method} · {o.receiver}
              </p>
              <button disabled={!!busy} onClick={() => void refresh(o.id)}>
                {busy === o.id
                  ? "Vérification…"
                  : o.hash
                    ? "Vérifier les reçus"
                    : "Relire les contrats"}
              </button>
              {o.hash && (
                <a
                  href={TESTNET.explorer + "/txns/" + o.hash}
                  target="_blank"
                  rel="noreferrer"
                >
                  Voir la transaction
                </a>
              )}
            </article>
          ))}
          {error && <p role="alert">{error}</p>}
        </details>
      )}
    </>
  );
}
