import { useState } from "react";
export function PlanExample() {
  const [step, setStep] = useState(0);
  const steps = ["Voir le dépôt", "Voir l’allocation", "Voir la transmission"];
  return (
    <section
      id="fonctionnement"
      className="plan-example"
      aria-labelledby="example-title"
    >
      <div className="example-intro">
        <h2 id="example-title">
          DÉPOSER.
          <br />
          DÉLÉGUER.
          <br />
          TRANSMETTRE.
        </h2>
        <p>
          Alice crée un plan, y dépose des jetons de test et autorise un agent à
          en placer une partie. Elle peut ensuite transmettre ce même compte à
          Bob.
        </p>
        <p className="example-disclaimer">
          Exemple pédagogique de 1 000 demoUSD. Ces valeurs ne sont pas votre
          solde et les commandes ne signent aucune transaction.
        </p>
      </div>
      <div className="example-ledger">
        <div
          className="example-tabs"
          role="group"
          aria-label="Étapes de l’exemple, sans transaction"
        >
          {steps.map((label, index) => (
            <button
              key={label}
              aria-pressed={step === index}
              onClick={() => setStep(index)}
            >
              {index + 1}. {label}
            </button>
          ))}
        </div>
        <div
          className="example-state"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="example-owner">
            <span>Propriétaire du plan d’exemple</span>
            <strong>{step === 2 ? "Bob" : "Alice"}</strong>
          </div>
          <dl>
            <div>
              <dt>Disponible</dt>
              <dd>
                {step === 0 ? "1 000" : "900"}
                <small>demoUSD</small>
              </dd>
            </div>
            <div>
              <dt>En stratégie</dt>
              <dd>
                {step === 0 ? "0" : "100"}
                <small>demoUSD</small>
              </dd>
            </div>
          </dl>
          <p>
            {step === 0
              ? "Le dépôt est disponible dans le compte du plan. Aucun agent n’est encore autorisé."
              : step === 1
                ? "100 demoUSD sont placés dans la stratégie de test. Le mandat limite ce que l’agent peut faire."
                : "Même compte et mêmes positions. Bob contrôle la nouvelle clé ; le mandat précédent est supprimé."}
          </p>
        </div>
      </div>
    </section>
  );
}
