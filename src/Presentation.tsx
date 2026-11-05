import { ControlMap } from "./ControlMap";
import { PlanExample } from "./PlanExample";
import { Icon } from "./Icon";

export function Presentation() {
  return (
    <>
      <section className="editorial-hero" aria-labelledby="hero-title">
        <div className="hero-statement">
          <h1 id="hero-title" tabIndex={-1}>
            <span>LE COMPTE</span>
            <span>
              RESTE<span className="signal-dot">.</span>
            </span>
          </h1>
          <div className="hero-copy">
            <p>Le contrôle se transmet.</p>
            <p>
              Un NFT transmet le contrôle d’un compte NEAR. Les fonds et
              positions restent à la même adresse.
            </p>
          </div>
          <a className="primary" href="#app">
            Explorer la démo <Icon name="arrow" />
          </a>
          <p className="hero-footnote">
            Démo locale · Jetons sans valeur réelle
          </p>
        </div>
        <ControlMap />
      </section>
      <div className="mechanism-strip">
        <span>UN COMPTE PERSISTANT</span>
        <Icon name="plus" size={18} />
        <span>DES ACCÈS RENOUVELABLES</span>
        <Icon name="plus" size={18} />
        <span>UN AGENT SOUS MANDAT</span>
      </div>
      <PlanExample />
      <section
        className="agent-editorial"
        id="agent-work"
        aria-labelledby="agent-editorial-title"
      >
        <h2 id="agent-editorial-title">
          L’AGENT PROPOSE.
          <br />
          LE CONTRAT
          <br />
          <span>DISPOSE.</span>
        </h2>
        <div>
          <p>
            Vous fixez le mandat. L’agent détermine une allocation admissible.
            Le contrat vérifie les plafonds et les permissions avant de déplacer
            les fonds.
          </p>
          <ol>
            <li>
              <strong>Une route autorisée</strong>
              <span>
                La stratégie et l’actif sont définis dans le mandat signé.
              </span>
            </li>
            <li>
              <strong>Des montants limités</strong>
              <span>
                Un plafond par opération, un budget journalier et une part
                maximale du plan.
              </span>
            </li>
            <li>
              <strong>Un résultat observable</strong>
              <span>
                Le Portfolio montre la position et les opérations connues, avec
                leurs refus éventuels.
              </span>
            </li>
          </ol>
          <a href="#portfolio" className="secondary">
            Voir le travail de l’agent <Icon name="arrow" />
          </a>
        </div>
      </section>
      <section
        id="prototype"
        className="prototype-editorial"
        aria-labelledby="prototype-title"
      >
        <h2 id="prototype-title">
          DU CODE.
          <br />
          DES LIMITES CLAIRES.
        </h2>
        <div>
          <dl>
            <div>
              <dt>Exécuté en sandbox</dt>
              <dd>
                Créer un plan, déposer et retirer des demoUSD, allouer et
                racheter une position, révoquer l’agent, renouveler la clé et
                transmettre le NFT-compte.
              </dd>
            </div>
            <div>
              <dt>Rendement de démonstration</dt>
              <dd>
                Une réserve préfinancée distribue des jetons de test. Objectifs
                et projections restent hypothétiques.
              </dd>
            </div>
            <div>
              <dt>À connecter ensuite</dt>
              <dd>
                Les protocoles DeFi externes et les swaps cross-chain ne sont
                pas connectés aux fonds. Le prototype n’est pas audité et n’a
                pas été déployé sur testnet.
              </dd>
            </div>
          </dl>
          <a href="#app" className="primary">
            Ouvrir le plan de démonstration <Icon name="arrow" />
          </a>
        </div>
      </section>
    </>
  );
}
