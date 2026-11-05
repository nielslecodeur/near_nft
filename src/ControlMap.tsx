import { useState } from "react";
import { Icon } from "./Icon";

const scenes = [
  {
    name: "Le compte",
    owner: "Alice",
    agent: "Sans mandat",
    title: "Un titre. Une adresse.",
    detail:
      "Le NFT représente le contrôle du compte NEAR. Les fonds et les positions appartiennent au compte, pas à l’image du NFT.",
    permission: "Contrôle du plan",
    key: "Clé actuelle",
    allowed: false,
  },
  {
    name: "L’agent",
    owner: "Alice",
    agent: "Mandat limité",
    title: "Déléguer dans un cadre.",
    detail:
      "L’agent peut allouer vers la stratégie autorisée. Il ne peut ni retirer librement les fonds, ni changer le propriétaire. Le contrat impose les limites signées.",
    permission: "Route et plafonds signés",
    key: "Même propriétaire",
    allowed: true,
  },
  {
    name: "La transmission",
    owner: "Bob",
    agent: "Ancien mandat révoqué",
    title: "Le contrôle change de main.",
    detail:
      "La transmission demande le consentement de Bob et une preuve de sa nouvelle clé. Les anciennes générations sont invalidées, le mandat est supprimé ; le compte et ses positions restent.",
    permission: "Nouveau propriétaire",
    key: "Nouvelle clé",
    allowed: false,
  },
];
export function ControlMap() {
  const [step, setStep] = useState(0);
  const scene = scenes[step];
  return (
    <section
      className="control-map"
      aria-label="Explorer le contrôle du NFT-compte"
    >
      <div
        className="control-switch"
        role="group"
        aria-label="Étapes du contrôle, sans transaction"
      >
        {scenes.map((item, index) => (
          <button
            key={item.name}
            aria-pressed={index === step}
            onClick={() => setStep(index)}
          >
            {item.name}
            <Icon name="arrow" size={14} />
          </button>
        ))}
      </div>
      <div className={`control-plate control-plate--${step}`}>
        <div className="control-owner">
          <span>Propriétaire d’exemple</span>
          <strong>{scene.owner}</strong>
          <span>{scene.key}</span>
        </div>
        <div className="control-wire" aria-hidden="true">
          <span />
          <Icon name="arrow" size={20} />
        </div>
        <div className="control-account">
          <div>
            <span>NFT / COMPTE NEAR</span>
            <Icon name="key" size={18} />
          </div>
          <strong>
            KEEP<span>.</span>
          </strong>
          <p>MÊME ADRESSE</p>
          <div className="control-assets">
            <span>Disponible</span>
            <span>Positions</span>
          </div>
        </div>
        <div
          className={`control-wire control-wire--agent ${scene.allowed ? "is-allowed" : ""}`}
          aria-hidden="true"
        >
          <span />
          <Icon name="arrow" size={20} />
        </div>
        <div className="control-agent">
          <span>Agent d’investissement</span>
          <strong>{scene.allowed ? "AUTORISÉ" : "SANS ACCÈS"}</strong>
          <span>{scene.agent}</span>
        </div>
        <span className="control-annotation">{scene.permission}</span>
      </div>
      <div
        className="control-explanation"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <h2>{scene.title}</h2>
        <p>{scene.detail}</p>
      </div>
      <p className="control-disclaimer">
        Schéma explicatif. Aucun solde affiché, aucune transaction signée.
      </p>
    </section>
  );
}
