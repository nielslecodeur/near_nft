import type {
  MissionView,
  MissionCatalogue,
} from "../packages/shared/missions";
import { displayAmount } from "../packages/shared/ui";
const date = (v: string) =>
  new Date(Number(BigInt(v) / 1_000_000n)).toLocaleString("fr-FR");
export function AgentProposal({
  view,
  catalogue,
  now,
  busy,
  onInvest,
  onRenew,
  onModify,
  onRefresh,
  onPositions,
  onCancel,
  onClaim,
}: {
  view: MissionView;
  catalogue: MissionCatalogue;
  now: bigint;
  busy: boolean;
  onInvest: () => void;
  onRenew: () => void;
  onModify: () => void;
  onRefresh: () => void;
  onPositions: () => void;
  onCancel: () => void;
  onClaim: () => void;
}) {
  const { mission, document: doc } = view,
    p = doc.proposal!,
    a = p.allocations[0],
    op = mission.operations[0],
    sub = view.subscriptions[0],
    model = catalogue.catalogue.find((c) => c.collection === a?.collection),
    confirmed = op?.state === "Confirmed",
    expired =
      now >= BigInt(p.expires_at) ||
      (op?.state === "Authorized" &&
        now >= BigInt(op.authorization_expires_at || "0")),
    renewable = expired && op?.state === "Authorized" && !sub,
    reconcile = ["Funding", "Uncertain"].includes(op?.state || ""),
    cost = doc.reuse_position ? "0" : "6,02";
  return (
    <section className="agent-proposal" aria-label="Proposition de l’agent">
      <h2>
        {confirmed
          ? "Votre position est créée"
          : p.status === "abstain"
            ? "Aucun placement compatible"
            : "Votre proposition"}
      </h2>
      <p className="proposal-receipt">
        Analyse payée · {displayAmount(mission.profile.price, 24)} NEAR ·{" "}
        {p.mode === "demonstration"
          ? "Démonstration sans IA"
          : "Analyse serveur"}
      </p>
      {p.status === "abstain" ? (
        <p>{p.reasons.at(-1)} Aucun capital investi.</p>
      ) : (
        <>
          <h3>{model?.terms.name || a.strategy_id}</h3>
          <dl className="proposal-amounts">
            <div>
              <dt>À investir</dt>
              <dd>
                {displayAmount(a.amount)} <span>demoUSD</span>
              </dd>
            </div>
            <div>
              <dt>Réserve sur ce budget</dt>
              <dd>
                {displayAmount(p.reserve)} <span>demoUSD</span>
              </dd>
            </div>
          </dl>
          <p>
            Capital conservé jusqu’au{" "}
            {model ? date(model.terms.matures_at) : "terme du modèle"}. La
            revente dépend de la présence d’un acheteur.
          </p>
          {!confirmed && !renewable && (
            <p className="proposal-cost">
              {doc.reuse_position
                ? "Compte existant réutilisé. "
                : "Création et enregistrement : "}
              <strong>{cost} NEAR</strong>
              {doc.reuse_position
                ? " de nouvelle provision"
                : " de provision technique"}
              , plus gas. Le capital demoUSD est séparé.
            </p>
          )}
          <details>
            <summary>Risques et autorisations</summary>
            <p>
              Dépôt initial exact uniquement. L’agent ne reçoit aucun droit de
              retrait, de revente ou de gestion continue.
            </p>
            {[...p.risks, ...p.exits].map((s, i) => (
              <p key={i}>{s}</p>
            ))}
            <p>{p.reasons.join(" ")}</p>
          </details>
          {confirmed ? (
            <>
              <p role="status">NFT et dépôt confirmés sur NEAR Testnet.</p>
              <a
                className="proposal-open"
                href="#positions"
                onClick={onPositions}
              >
                Voir ma position
              </a>
            </>
          ) : renewable ? (
            <div className="proposal-renewal">
              <p>
                <strong>
                  Prochaine validation :{" "}
                  {displayAmount(
                    (
                      BigInt(catalogue.configuration.storage_reserve) +
                      BigInt(mission.profile.price)
                    ).toString(),
                    24,
                  )}{" "}
                  NEAR
                </strong>
                , plus gas.
              </p>
              <p>
                L’autorisation a expiré avant le dépôt. Le compte est conservé.
                Actualiser demande un nouveau devis de{" "}
                {displayAmount(catalogue.configuration.storage_reserve, 24)}{" "}
                NEAR et une analyse de{" "}
                {displayAmount(mission.profile.price, 24)} NEAR, en une
                validation. Aucune nouvelle provision de 6 NEAR.
              </p>
              <button className="primary" disabled={busy} onClick={onRenew}>
                Actualiser la proposition
              </button>
            </div>
          ) : (
            <>
              <div className="proposal-actions">
                <button
                  className="primary"
                  disabled={busy || (expired && !reconcile)}
                  onClick={onInvest}
                >
                  {busy
                    ? "Création en cours…"
                    : reconcile
                      ? "Vérifier la création"
                      : op
                        ? "Reprendre la création"
                        : "Continuer"}
                </button>
                {!op && (
                  <button disabled={busy} onClick={onModify}>
                    Modifier
                  </button>
                )}
              </div>
              {expired && !reconcile && (
                <p role="alert">
                  La proposition a expiré. Aucun nouveau dépôt n’est envoyé.
                </p>
              )}
              {!expired && (
                <p className="proposal-validity">
                  Une validation groupée dans Intear. Proposition valable
                  jusqu’au {date(p.expires_at)}.
                </p>
              )}
            </>
          )}
          {sub?.state === "Authorized" && expired && (
            <button disabled={busy} onClick={onCancel}>
              Annuler la souscription et réserver le remboursement
            </button>
          )}
          {sub?.refund?.state === "Claimable" && (
            <button disabled={busy} onClick={onClaim}>
              Recevoir le capital remboursable
            </button>
          )}
        </>
      )}
      <details className="proposal-technical">
        <summary>Suivi et détails techniques</summary>
        <p>Mission : {mission.id}</p>
        <p>
          État : {mission.state} ·{" "}
          {op?.state || "aucun investissement autorisé"}
        </p>
        {op && <p>Compte : {op.position}</p>}
        <p>
          Les opérations réseau sont distinctes. Un résultat inconnu reste en
          attente ; aucun second paiement automatique.
        </p>
        <button disabled={busy} onClick={onRefresh}>
          Actualiser le suivi
        </button>
      </details>
    </section>
  );
}
