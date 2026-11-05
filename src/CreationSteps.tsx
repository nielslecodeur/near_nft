export function CreationSteps({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="guided-steps" aria-label="Étapes de création">
      {["Choisir", "Vérifier", "Signer et créer"].map((label, i) => (
        <li key={label} aria-current={step === i + 1 ? "step" : undefined}>
          <span aria-hidden="true">{i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
