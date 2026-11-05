import { useId, useState } from "react";
import { compactAmount, displayAmount } from "../packages/shared/ui";
import { Icon } from "./Icon";

/** Compact overview only; confirmations and exported amounts remain exact. */
export function FinancialAmount({ raw = "0" }: { raw?: string }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState("");
  if (BigInt(raw) < 1_000_000_000_000n) return <>{displayAmount(raw)}</>;
  return (
    <span className="financial-amount">
      <span
        className="financial-compact"
        aria-label={`Environ ${compactAmount(raw).slice(2)} demoUSD`}
      >
        {compactAmount(raw)}
      </span>
      <button
        type="button"
        className="exact-toggle"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded(!expanded)}
      >
        Valeur exacte
      </button>
      {expanded && (
        <span id={id} className="exact-value">
          <input
            aria-label="Montant exact en demoUSD"
            readOnly
            value={displayAmount(raw)}
          />
          <button
            type="button"
            aria-label="Copier le montant exact"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(displayAmount(raw));
                setNotice("Montant exact copié.");
              } catch {
                setNotice("Copie indisponible : sélectionnez le montant.");
              }
            }}
          >
            <Icon name="copy" size={16} />
          </button>
          <span role="status">{notice}</span>
        </span>
      )}
    </span>
  );
}
