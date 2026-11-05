import { actionSummary } from "../packages/shared/ui";
export function ActionSummary({
  summary,
}: {
  summary: ReturnType<typeof actionSummary>;
}) {
  return (
    <section
      className="action-summary"
      aria-label="Récapitulatif avant confirmation"
    >
      <h3>Avant de confirmer</h3>
      <dl>
        {summary.rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>{summary.effect}</p>
      {summary.error && (
        <p className="field-error" id="operation-input-error" role="alert">
          {summary.error}
        </p>
      )}
    </section>
  );
}
