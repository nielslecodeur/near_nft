import { useState } from "react";
import type { Snapshot } from "../packages/shared/index";
import { propose } from "../packages/agent/index";
import { FinancialAmount } from "./FinancialAmount";
import { Icon } from "./Icon";
import "./portfolio.css";

type Entry = { label: string; ok: boolean; detail: string; hash?: string };
export function Portfolio({
  snapshot: s,
  entries,
  busy,
  refresh,
  commands,
  formatLabel,
  formatError,
}: {
  snapshot: Snapshot;
  entries: Entry[];
  busy: boolean;
  refresh: () => void;
  commands: () => void;
  formatLabel: (label: string) => string;
  formatError: (detail: string) => string;
}) {
  const [filter, setFilter] = useState("all");
  const [inspect, setInspect] = useState(false);
  const proposal = propose(s, s.policy, BigInt(Date.now()) * 1_000_000n);
  const total = BigInt(s.available) + BigInt(s.principal) + BigInt(s.reserved);
  const invested =
    total > 0n ? Number((BigInt(s.principal) * 100n) / total) : 0;
  const journal = entries.filter((e) =>
    /allocat|agent|rendement|yield|rachat|redeem|mandat|policy|revoke|probe/i.test(
      e.label,
    ),
  );
  const visible = journal.filter(
    (e) => filter === "all" || (filter === "success" ? e.ok : !e.ok),
  );
  return (
    <section className="portfolio-workspace" aria-label="Portfolio du plan">
      <div className="portfolio-toolbar">
        <p>
          Compte suivi <strong>{s.account_id}</strong>
        </p>
        <button className="secondary" disabled={busy} onClick={refresh}>
          <Icon name="refresh" size={16} />
          {busy ? "Actualisation…" : "Actualiser le portfolio"}
        </button>
      </div>
      <section aria-labelledby="portfolio-position-title">
        <h2 id="portfolio-position-title">Où sont vos fonds ?</h2>
        <dl className="portfolio-balances">
          {[
            ["Disponible", s.available],
            ["Placé en stratégie", s.principal],
            ["Réservé en attente", s.reserved],
            ["Gains reçus", s.realized_gains],
          ].map(([label, raw]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <FinancialAmount raw={raw} />
                <small>demoUSD</small>
              </dd>
            </div>
          ))}
        </dl>
        <div
          className="portfolio-allocation"
          role="img"
          aria-label={`${invested} % de la valeur du plan actuellement placés en stratégie.`}
        >
          <span style={{ width: `${invested}%` }} />
        </div>
        <p className="portfolio-caption">
          Environ {invested} % du plan en stratégie. Les gains affichés sont
          effectivement crédités ; ce ne sont pas des projections.
        </p>
      </section>
      <div className="portfolio-columns">
        <section
          className="portfolio-strategy"
          aria-labelledby="portfolio-strategy-title"
        >
          <h2 id="portfolio-strategy-title">La position sur NEAR</h2>
          <p>
            {s.network === "sandbox"
              ? "Contrats exécutés dans une vraie sandbox NEAR locale."
              : "État du plan chargé sur NEAR testnet."}{" "}
            Jetons de test sans valeur en dollars.
          </p>
          <dl className="portfolio-details">
            <div>
              <dt>Contrat de stratégie</dt>
              <dd>{s.strategy}</dd>
            </div>
            <div>
              <dt>Actif accepté</dt>
              <dd>{s.asset}</dd>
            </div>
            <div>
              <dt>Position observée</dt>
              <dd>
                {BigInt(s.principal) > 0n
                  ? "Capital placé"
                  : "Aucune position ouverte"}
              </dd>
            </div>
            <div>
              <dt>Opération en attente</dt>
              <dd>
                {s.pending || s.status !== "Active"
                  ? "Oui — attendez la finalisation"
                  : "Aucune"}
              </dd>
            </div>
          </dl>
          <p className="portfolio-caption">
            Stratégie de démonstration financée par une réserve préfinancée.
            Rhea et les autres protocoles DeFi externes ne reçoivent pas encore
            les fonds du plan.
          </p>
        </section>
        <section
          className="portfolio-agent"
          aria-labelledby="portfolio-agent-title"
        >
          <h2 id="portfolio-agent-title">Le travail de votre agent</h2>
          <p>
            {BigInt(proposal.amount) > 0n
              ? "Une allocation peut être proposée selon l’état chargé."
              : "L’agent s’abstient dans l’état chargé."}{" "}
            L’agent est déterministe et ne tourne pas en arrière-plan dans cette
            interface.
          </p>
          <dl className="portfolio-details">
            <div>
              <dt>Agent autorisé</dt>
              <dd>{s.policy?.agent || "Aucun mandat enregistré"}</dd>
            </div>
            <div>
              <dt>Allocation maximale</dt>
              <dd>{s.policy ? s.policy.allocation_bps / 100 : 0} %</dd>
            </div>
            <div>
              <dt>Plafond par opération</dt>
              <dd>
                <FinancialAmount raw={s.policy?.max_operation} /> demoUSD
              </dd>
            </div>
            <div>
              <dt>Plafond journalier signé</dt>
              <dd>
                <FinancialAmount raw={s.policy?.max_period} /> demoUSD
              </dd>
            </div>
          </dl>
          <button
            className="secondary"
            aria-expanded={inspect}
            aria-controls="portfolio-proposal"
            onClick={() => setInspect(!inspect)}
          >
            Examiner la proposition
          </button>
          {inspect && (
            <div id="portfolio-proposal" className="portfolio-proposal">
              <h3>Proposition à l’état chargé</h3>
              <p>
                <FinancialAmount raw={proposal.amount} /> demoUSD
              </p>
              <p>{proposal.reason}</p>
              <p>
                Ce calcul n’envoie aucune transaction. Le contrat vérifie encore
                les plafonds, l’expiration et les permissions à l’exécution.
              </p>
            </div>
          )}
          <button className="text-button" onClick={commands}>
            Ouvrir les commandes de l’agent <Icon name="arrow" size={16} />
          </button>
        </section>
      </div>
      <section
        className="portfolio-journal"
        aria-labelledby="portfolio-journal-title"
      >
        <h2 id="portfolio-journal-title">Journal d’investissement</h2>
        <p>
          Allocations, rachats et changements de mandat connus du plan chargé.
          Ce journal de session n’est pas un index complet de la blockchain et
          ne fournit pas de chronologie horodatée.
        </p>
        <div
          className="portfolio-filters"
          role="group"
          aria-label="Filtrer le journal d’investissement"
        >
          {[
            ["all", "Tout"],
            ["success", "Traitées"],
            ["error", "Refusées"],
          ].map(([value, label]) => (
            <button
              className="secondary"
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <p className="portfolio-empty">
            {journal.length
              ? "Aucune opération pour ce filtre."
              : "Aucune opération d’investissement connue. Définissez un mandat, puis lancez l’agent depuis ses commandes pour observer son résultat ici."}
          </p>
        ) : (
          <ol className="portfolio-events">
            {visible.map((entry, i) => (
              <li key={i}>
                <Icon name={entry.ok ? "check" : "alert"} size={18} />
                <div>
                  <strong>{formatLabel(entry.label)}</strong>
                  <p>{entry.ok ? entry.detail : formatError(entry.detail)}</p>
                  {entry.hash && s.network === "testnet" && (
                    <a
                      href={`https://testnet.nearblocks.io/txns/${encodeURIComponent(entry.hash)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Voir la transaction NEAR{" "}
                      <Icon name="external" size={14} />
                    </a>
                  )}
                </div>
                <span>{entry.ok ? "Traitée" : "Refusée"}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
