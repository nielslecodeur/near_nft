import { useState } from "react";
import { view, rpc } from "./client";
import { testnetDeployment } from "./testnet-network";
import type { Listing } from "../packages/shared/series";
/** Public settlement status remains accessible when NFT/index verification is pending. */
export function TestnetSaleRecovery({
  owner,
  working,
  ask,
}: {
  owner: string;
  working: boolean;
  ask: (c: { action: string; position: string; id: string }) => void;
}) {
  const [position, setPosition] = useState(""),
    [id, setId] = useState(""),
    [sale, setSale] = useState<Listing | null>(null),
    [claim, setClaim] = useState<{ beneficiary: string; state: string } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function read() {
    setBusy(true);
    setError("");
    setSale(null);
    setClaim(null);
    try {
      const d = await testnetDeployment();
      if (
        !d ||
        !position.endsWith("." + d.collection) ||
        position.slice(0, -d.collection.length - 1).includes(".") ||
        !/^[0-9]{1,20}$/.test(id)
      )
        throw new Error(
          "Compte enfant de la collection officielle et numéro d’annonce requis.",
        );
      const b = await rpc("block", { finality: "final" }),
        [s, c] = await Promise.all([
          view(d.collection, "listing", { position, id }, b.header.hash),
          view(d.collection, "sale_claim", { position, id }, b.header.hash),
        ]);
      if (!s || s.position !== position || s.id !== id)
        throw new Error("Annonce introuvable ou différente.");
      setSale(s);
      setClaim(c);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="sale-recovery">
      <summary>Suivre un achat ou un règlement interrompu</summary>
      <p>
        Relisez l’annonce même si le NFT et son index sont en cours de
        synchronisation. La reprise vérifie les résultats persistants et ne
        renvoie aucun prix d’achat.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void read();
        }}
      >
        <label htmlFor="recovery-position">Compte de la position</label>
        <input
          id="recovery-position"
          required
          value={position}
          onChange={(e) => {
            setPosition(e.target.value.trim());
            setSale(null);
          }}
        />
        <label htmlFor="recovery-sale">Numéro de l’annonce</label>
        <input
          id="recovery-sale"
          inputMode="numeric"
          required
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setSale(null);
          }}
        />
        <button disabled={working || busy}>Lire le règlement</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {sale && (
        <>
          <p role="status">
            État contractuel : {sale.state}. Acheteur :{" "}
            {sale.buyer || "aucun paiement accepté"}.
          </p>
          {[
            "Settling",
            "Resolving",
            "AwaitingIndex",
            "Settled",
            "Cancelled",
            "RefundClaimable",
          ].includes(sale.state) && (
            <button
              disabled={!owner || working || busy}
              onClick={() => ask({ action: "resume", position, id })}
            >
              Reprendre sans renvoyer le prix
            </button>
          )}
          {claim?.beneficiary === owner && claim.state === "Claimable" && (
            <button
              disabled={working || busy}
              onClick={() => ask({ action: "claim_sale", position, id })}
            >
              Réclamer la créance de vente
            </button>
          )}
          <p>
            Actualisez après confirmation. Un état incertain reste réservé ; un
            remboursement exige une créance confirmée.
          </p>
        </>
      )}
    </details>
  );
}
