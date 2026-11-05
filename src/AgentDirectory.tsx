import { useId, useState } from "react";
import { OrbitGlyph } from "./OrbitGlyph";
export function AgentDirectory({
  compact = false,
  paid = false,
}: {
  compact?: boolean;
  paid?: boolean;
}) {
  const [open, setOpen] = useState(!compact),
    [instant, setInstant] = useState(false);
  const id = useId();
  return (
    <section
      className={"orbite-agents" + (compact ? " compact" : "")}
      aria-labelledby={id + "-title"}
    >
      <div className="orbite-agent-list">
        <h2 id={id + "-title"}>
          {compact
            ? "L’agent, à vos conditions."
            : "Votre agent d’investissement"}
        </h2>
        <button
          className="orbite-agent-row"
          aria-expanded={open}
          aria-controls={id + "-method"}
          onClick={(e) => {
            setInstant(e.detail === 0);
            setOpen(!open);
          }}
        >
          <OrbitGlyph />
          <span>
            <strong>{paid ? "TradFi · Crypto · Liquidité" : "Orbite"}</strong>
            <span>
              {paid
                ? "Trois méthodes d’analyse · Démonstration"
                : "Allocation à échéance · Démonstration"}
            </span>
          </span>
          <svg
            className="agent-row-toggle"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            style={{
              transform: open ? "rotate(45deg)" : undefined,
              transition: instant ? "none" : undefined,
            }}
          >
            <path
              d="M3 10H17M10 3V17"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </button>
      </div>
      <div id={id + "-method"} className="orbite-agent-method" hidden={!open}>
        <h3>Proposer. Puis agir sous mandat.</h3>
        <p>
          {paid ? (
            "Trois agents déterministes proposent une lecture par concentration, risques crypto ou disponibilité. Chaque mission payée prépare une proposition à examiner séparément."
          ) : (
            <>
              Orbite est le moteur déterministe existant : il examine budget,
              horizon, liquidité et exclusions. Il propose une souscription à la
              stratégie disponible ou s’abstient.
            </>
          )}
        </p>
        <dl>
          <div>
            <dt>Tarif applicatif</dt>
            <dd>
              {paid
                ? "Analyse à prix fixe en NEAR · devis dans l’onglet Agent"
                : "Aucune commission"}
            </dd>
          </div>
          <div>
            <dt>Autorisation</dt>
            <dd>Mandat signé, montant exact, durée limitée</dd>
          </div>
        </dl>
        <p className="orbite-agent-limit">
          Aucun achat ou vente secondaire. Aucune dépense pendant la discussion.
          Réserve technique et frais réseau séparés ; mode de production indiqué
          dans la mission.
        </p>
        {compact && (
          <a className="orbite-text-link" href="#agent">
            Examiner une proposition
          </a>
        )}
      </div>
    </section>
  );
}
