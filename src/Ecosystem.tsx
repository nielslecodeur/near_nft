import { useState } from "react";
import { ecosystem } from "../packages/shared/ecosystem";
import observation from "../docs/results/ecosystem-capabilities.json";
const capabilities: {
  status: string;
  checked_at: string;
  token_count?: number;
} = observation;
export function Ecosystem() {
  const [filter, setFilter] = useState("Prioritaires");
  const resources = ecosystem.filter(
    (resource) =>
      filter === "Toutes" ||
      (filter === "Prioritaires" && resource.priority) ||
      resource.group === filter,
  );
  return (
    <section className="ecosystem-workspace" aria-labelledby="ecosystem-title">
      <div className="ecosystem-intro">
        <div>
          <h2 id="ecosystem-title">Ressources et intégrations.</h2>
          <p>
            Les 15 ressources sont étudiées pour le projet. Les cartes
            présentent des pistes ; elles ne sont pas des services branchés au
            compte.
          </p>
        </div>
        <div className="ecosystem-observation">
          <strong>NEAR Intents · Lecture seule</strong>
          <p>
            {capabilities.status === "available"
              ? `${capabilities.token_count} actifs recensés lors du contrôle public.`
              : "Catalogue public indisponible lors du dernier contrôle."}
          </p>
          <small>
            Relevé du{" "}
            {new Date(capabilities.checked_at).toLocaleString("fr-FR")} · Pas
            une cotation ni une disponibilité en direct.
          </small>
          <a
            href="https://docs.near-intents.org/integration/verifier-contract/introduction"
            target="_blank"
            rel="noreferrer"
          >
            Vérificateur sans testnet documenté
          </a>
        </div>
      </div>
      <div
        className="ecosystem-filters"
        role="group"
        aria-label="Filtrer les ressources"
      >
        {[
          "Prioritaires",
          "Toutes",
          "Financement",
          "Agent",
          "Collectif",
          "Recherche",
        ].map((name) => (
          <button
            key={name}
            aria-pressed={filter === name}
            onClick={() => setFilter(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="ecosystem-count" role="status">
        {resources.length} ressource{resources.length > 1 ? "s" : ""} ·
        Documentation étudiée, exécution non intégrée
      </p>
      <div className="ecosystem-grid">
        {resources.map((resource) => (
          <article className="ecosystem-resource" key={resource.name}>
            <div className="section-top">
              <h3>{resource.name}</h3>
              <span className="badge">{resource.group}</span>
            </div>
            <p>{resource.use}</p>
            <p className="ecosystem-boundary">{resource.boundary}</p>
            <div className="ecosystem-links">
              {Object.entries({
                Site: resource.website,
                Documentation: resource.docs,
                Git: resource.code,
                API: resource.api,
              })
                .filter(([, url]) => url)
                .map(([name, url]) => (
                  <a
                    key={name}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${resource.name} : ${name}`}
                  >
                    {name}
                  </a>
                ))}
              {!resource.code && !resource.api && (
                <small>Aucun Git/API fourni dans le catalogue</small>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
