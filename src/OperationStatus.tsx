import { Icon } from "./Icon";
export type Operation = {
  phase: "loading" | "signing" | "pending" | "success" | "error";
  label: string;
  detail?: string;
};
export function OperationStatus({
  operation,
  dismiss,
}: {
  operation: Operation;
  dismiss: () => void;
}) {
  const titles = {
    loading: "Lecture de l’état",
    signing: "Signature à confirmer",
    pending: "Exécution en attente",
    success: "Opération terminée",
    error: "Opération interrompue",
  };
  const ongoing = ["loading", "signing", "pending"].includes(operation.phase);
  return (
    <div
      className={`operation-status ${operation.phase}`}
      role={operation.phase === "error" ? "alert" : "status"}
      aria-live={operation.phase === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <span
        className={ongoing ? "operation-spinner" : "operation-result"}
        aria-hidden="true"
      >
        {!ongoing && <Icon name={operation.phase === "success" ? "check" : "alert"} size={16} />}
      </span>
      <div>
        <strong>{titles[operation.phase]}</strong>
        <p>{operation.label}</p>
        {operation.detail && <small>{operation.detail}</small>}
      </div>
      {!ongoing && (
        <button aria-label="Masquer le statut" onClick={dismiss}>
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
