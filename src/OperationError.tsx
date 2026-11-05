export function OperationError({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  const text = /reject|denied|cancel|closed|refus/i.test(error)
    ? "La signature a été refusée ou interrompue. Vérifiez le suivi avant de reprendre : aucun succès n’est présumé."
    : /insuff|balance|solde/i.test(error)
      ? "Le solde disponible ne couvre pas cette opération. Obtenez les fonds de test nécessaires, puis revenez vérifier le montant."
      : /fetch|network|rpc|timeout|réseau|429|too many requests|rate.limit/i.test(
            error,
          )
        ? "Le réseau ne répond pas. Actualisez pour vérifier le résultat avant toute nouvelle signature."
        : "L’opération n’a pas pu être finalisée. Consultez le détail et le suivi avant de reprendre.";
  return (
    <div className="feedback error" role="alert">
      <p>{text}</p>
      {onRetry && <button onClick={onRetry}>Actualiser le suivi</button>}
      <details>
        <summary>Détails techniques</summary>
        <p>{error}</p>
      </details>
    </div>
  );
}
