import { useMemo, useState } from "react";
import {
  prepareInvestment,
  type InvestmentRequest,
} from "../packages/agent/investment";
import type { SeriesState } from "../packages/shared/series-state";
import { displayAmount } from "../packages/shared/ui";
import { AgentDirectory } from "./AgentDirectory";
type Command = {
  action: string;
  position?: string;
  expected_amount?: string;
  request?: InvestmentRequest;
  mandate_hash?: string;
};
export function InvestmentAgent({
  data,
  now,
  owner,
  local,
  working,
  ask,
}: {
  data: SeriesState;
  now: bigint;
  owner: string;
  local: boolean;
  working: boolean;
  ask: (command: Command) => void;
}) {
  const [request, setRequest] = useState<InvestmentRequest>({
    amount: "100",
    asset: "demoUSD",
    horizonDays: 1,
    liquidity: "at-maturity",
    excluded: "",
    maxInvestment: "100",
    notes: "",
  });
  const [prepared, setPrepared] = useState<{
    request: InvestmentRequest;
    at: string;
  } | null>(null);
  const available = data.balances?.[owner] ?? "0";
  const proposal = useMemo(
    () =>
      prepared
        ? prepareInvestment(
            prepared.request,
            data.series.series,
            available,
            BigInt(prepared.at),
            owner,
            data.series.series
              ? (
                  BigInt(data.series.series.terms.capacity) -
                  BigInt(data.series.committed)
                ).toString()
              : undefined,
          )
        : null,
    [prepared, data.series.series, data.series.committed, available, owner],
  );
  const owned = data.positions.filter(
    (p) => p.owner_id === owner && p.funding_permit,
  );
  function field<K extends keyof InvestmentRequest>(
    key: K,
    value: InvestmentRequest[K],
  ) {
    setRequest({ ...request, [key]: value });
    setPrepared(null);
  }
  return (
    <>
      <div className="page-title">
        <h1>Agent</h1>
        <p>Demander. Examiner. Autoriser. Chaque étape garde son rôle.</p>
      </div>
      <AgentDirectory />
      <section className="agent-workbench">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPrepared({ request: { ...request }, at: data.now });
          }}
        >
          <h2>Comment souhaitez-vous investir ?</h2>
          <p>
            Mode déterministe, sans clé API. Votre texte ne signe rien et ne
            déplace aucun fonds.
          </p>
          <label htmlFor="investment-notes">Votre demande</label>
          <textarea
            id="investment-notes"
            value={request.notes}
            onChange={(e) => field("notes", e.target.value)}
            placeholder="100 demoUSD, sans besoin de retrait immédiat, au plus 100 demoUSD engagés."
          />
          <button
            type="button"
            className="example-request"
            onClick={() => {
              setRequest({
                ...request,
                amount: "100",
                maxInvestment: "100",
                horizonDays: 1,
                liquidity: "at-maturity",
                notes:
                  "100 demoUSD, conserver l’échéance existante, pas de marché secondaire.",
              });
              setPrepared(null);
            }}
          >
            Utiliser cet exemple
          </button>
          <p className="muted">
            Le texte est une note. Les champs ci-dessous définissent seuls la
            demande validée.
          </p>
          <div className="agent-fields">
            <div>
              <label htmlFor="agent-amount">Budget en demoUSD</label>
              <input
                id="agent-amount"
                value={request.amount}
                inputMode="decimal"
                required
                pattern="[0-9]+(\.[0-9]{1,6})?"
                onChange={(e) => field("amount", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="agent-asset">Actif disponible</label>
              <select
                id="agent-asset"
                value={request.asset}
                onChange={(e) => field("asset", e.target.value)}
              >
                <option>demoUSD</option>
                <option>NEAR</option>
              </select>
              <small>{displayAmount(available)} demoUSD dans ce compte</small>
            </div>
            <div>
              <label htmlFor="agent-horizon">Horizon indicatif, jours</label>
              <input
                id="agent-horizon"
                type="number"
                min="0"
                max="36500"
                step="1"
                value={request.horizonDays}
                onChange={(e) => field("horizonDays", Number(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor="agent-liquidity">Besoin de liquidité</label>
              <select
                id="agent-liquidity"
                value={request.liquidity}
                onChange={(e) =>
                  field(
                    "liquidity",
                    e.target.value as InvestmentRequest["liquidity"],
                  )
                }
              >
                <option value="at-maturity">Disponible à l’échéance</option>
                <option value="immediate">Retrait immédiat nécessaire</option>
              </select>
            </div>
            <div>
              <label htmlFor="agent-max">Dépense maximale en demoUSD</label>
              <input
                id="agent-max"
                value={request.maxInvestment}
                inputMode="decimal"
                required
                onChange={(e) => field("maxInvestment", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="agent-exclusions">
                Actifs ou stratégies exclus
              </label>
              <input
                id="agent-exclusions"
                value={request.excluded}
                onChange={(e) => field("excluded", e.target.value)}
                placeholder="Séparés par des virgules"
              />
            </div>
          </div>
          <button className="primary" disabled={working || !local}>
            Préparer une proposition
          </button>
          {!local && (
            <p>
              Les souscriptions par agent ne sont pas disponibles sur ce
              déploiement. Les positions existantes restent consultables ; les
              opérations financières testnet ne sont pas activées.
            </p>
          )}
        </form>
        <div className="agent-proposal" aria-live="polite">
          <h2>Proposition</h2>
          {!proposal ? (
            <p>
              Définissez les contraintes et préparez la proposition. Aucune
              autorisation n’est créée à cette étape.
            </p>
          ) : (
            <>
              <h3>
                {proposal.status === "abstain"
                  ? "L’agent s’abstient"
                  : "Souscription proposée"}
              </h3>
              {proposal.allocations.map((a) => (
                <p className="proposed-amount" key={a.strategy}>
                  {displayAmount(a.amount)} demoUSD{" "}
                  <span>vers {a.strategy}</span>
                </p>
              ))}
              <p>
                Liquidités non engagées dans ce budget :{" "}
                <strong>{displayAmount(proposal.remaining)} demoUSD</strong>
              </p>
              <ul>
                {proposal.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <h3>Contraintes et risques</h3>
              <ul>
                {proposal.risks.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <h3>Permissions nécessaires</h3>
              <ul>
                {proposal.permissions.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <p>Agent désigné : {data.actors.Agent || "Non configuré"}</p>
              <p className="proposal-source">
                Données : mandat contractuel version{" "}
                {data.series.series?.terms.version}, solde demoUSD du compte et
                bloc sandbox du{" "}
                {new Date(
                  Number(BigInt(proposal.observedAt) / 1_000_000n),
                ).toLocaleString("fr-FR")}
                . Aucun rendement utilisé.
              </p>
              {proposal.status === "proposed" && (
                <button
                  className="primary"
                  disabled={working || !local || data.series.closed}
                  onClick={() =>
                    ask({
                      action: "prepare_agent",
                      request: prepared!.request,
                      mandate_hash: proposal.mandateHash,
                      expected_amount: proposal.allocations[0].amount,
                    })
                  }
                >
                  Examiner le mandat de souscription
                </button>
              )}
              <p className="muted">
                Une nouvelle position nécessite une réserve technique de 6 NEAR,
                séparée du capital demoUSD.
              </p>
            </>
          )}
        </div>
      </section>
      <section className="agent-authorizations">
        <h2>Autorisations de souscription</h2>
        <p>
          Le mandat signé n’engage pas encore les demoUSD. Après mise en
          séquestre du montant exact, seul l’agent désigné peut exécuter la
          souscription. Il ne peut ni vendre ni acheter une position sur le
          marché secondaire.
        </p>
        {!owned.length && <p>Aucun mandat de souscription en attente.</p>}
        {owned.map((s) => {
          const permit = s.funding_permit!,
            expired = now >= BigInt(permit.expires_at),
            sub = data.subscriptions?.find(
              (x) => x.position === s.account_id,
            )?.subscription;
          return (
            <article key={s.account_id}>
              <h3>
                {displayAmount(permit.amount)} demoUSD ·{" "}
                {sub?.state === "Authorized"
                  ? "Montant en séquestre"
                  : sub?.state === "Funding"
                    ? "Exécution en cours"
                    : "Mandat signé"}
              </h3>
              <p className="hash">{s.account_id}</p>
              <p>
                Agent : {permit.agent} · Bénéficiaire du NFT :{" "}
                {permit.beneficiary} · Version {permit.policy_version} ·
                Expiration :{" "}
                {new Date(
                  Number(BigInt(permit.expires_at) / 1_000_000n),
                ).toLocaleString("fr-FR")}
                {expired ? " — expiré" : ""}
              </p>
              <div className="action-row">
                {!sub && (
                  <button
                    disabled={working || !local || expired}
                    onClick={() =>
                      ask({
                        action: "escrow_agent",
                        position: s.account_id,
                        expected_amount: permit.amount,
                      })
                    }
                  >
                    Signer le dépôt en séquestre
                  </button>
                )}
                {sub?.state === "Authorized" && (
                  <button
                    className="primary"
                    disabled={working || !local || expired}
                    onClick={() =>
                      ask({
                        action: "execute_agent",
                        position: s.account_id,
                        expected_amount: permit.amount,
                      })
                    }
                  >
                    Exécuter la souscription autorisée
                  </button>
                )}
                {sub?.state !== "Funding" && (
                  <button
                    disabled={working || !local}
                    onClick={() =>
                      ask({ action: "cancel_agent", position: s.account_id })
                    }
                  >
                    Révoquer ce mandat
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
      <section className="agent-refunds">
        <h2>Remboursements de souscriptions</h2>
        {data.subscriptions
          ?.filter((x) => x.refund?.beneficiary === owner)
          .map((x) => (
            <article key={x.position}>
              <p>
                {displayAmount(x.refund!.amount)} demoUSD ·{" "}
                {x.refund!.state === "Paid"
                  ? "Remboursé"
                  : x.refund!.state === "Paying"
                    ? "Paiement en cours"
                    : "Créance disponible"}
              </p>
              <button
                disabled={working || !local || x.refund!.state !== "Claimable"}
                onClick={() =>
                  ask({
                    action: "claim_subscription",
                    position: x.position,
                    expected_amount: x.refund!.amount,
                  })
                }
              >
                Récupérer le remboursement
              </button>
            </article>
          ))}
      </section>
      <section className="journal">
        <h2>Résultats de l’agent</h2>
        <p>
          Journal de session confirmé par les contrats, sans exécution autonome
          en arrière-plan.
        </p>
        <ol>
          {data.journal
            .filter((e) =>
              [
                "prepare_agent",
                "escrow_agent",
                "execute_agent",
                "cancel_agent",
                "claim_subscription",
              ].includes(e.label),
            )
            .map((e, i) => (
              <li key={e.at + i}>
                <span>{e.ok ? "Confirmé" : "Refusé"}</span>
                <details>
                  <summary>
                    {
                      {
                        prepare_agent: "Mandat signé",
                        escrow_agent: "Dépôt en séquestre",
                        execute_agent: "Position financée",
                        cancel_agent: "Mandat révoqué",
                        claim_subscription: "Remboursement",
                      }[e.label]
                    }
                  </summary>
                  <p>{e.detail}</p>
                </details>
                <time>{new Date(e.at).toLocaleTimeString("fr-FR")}</time>
              </li>
            ))}
        </ol>
        <a href="#positions">Consulter mes positions NFT</a>
      </section>
    </>
  );
}
