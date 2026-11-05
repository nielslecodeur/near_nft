import { Icon } from "./Icon";
import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../packages/shared/index";
import { displayAmount } from "../packages/shared/ui";
const amount = (raw: bigint) => displayAmount(raw.toString());
export function ChangeReceipt({ snapshot }: { snapshot: Snapshot }) {
  const previous = useRef<Snapshot>(snapshot);
  const [change, setChange] = useState<{
    from: string;
    to: string;
    detail: string;
    serial: number;
  } | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = snapshot;
    if (before.account_id !== snapshot.account_id) {
      setChange(null);
      return;
    }
    let from = "",
      to = "",
      detail = "";
    const principal = BigInt(snapshot.principal) - BigInt(before.principal);
    const deposited = BigInt(snapshot.deposits) - BigInt(before.deposits);
    const withdrawn = BigInt(snapshot.withdrawals) - BigInt(before.withdrawals);
    if (before.owner_id !== snapshot.owner_id) {
      from = before.owner_id;
      to = snapshot.owner_id;
      detail =
        "Propriétaire renouvelé. Ancien mandat supprimé ; même compte et mêmes actifs.";
    } else if (before.key_version !== snapshot.key_version) {
      from = `Clé v${before.key_version}`;
      to = `Clé v${snapshot.key_version}`;
      detail =
        "Nouvelle clé active. Les signatures de l’ancienne génération ne sont plus valides.";
    } else if (before.policy_version !== snapshot.policy_version) {
      from = "Permissions précédentes";
      to = snapshot.policy ? "Nouveau mandat" : "Agent révoqué";
      detail = snapshot.policy
        ? "Les nouveaux plafonds sont enregistrés sur le compte."
        : "Aucune nouvelle allocation autorisée pour l’ancien agent.";
    } else if (deposited > 0n) {
      from = "Compte de dépôt";
      to = "Disponible";
      detail = `${amount(deposited)} demoUSD crédités au plan.`;
    } else if (withdrawn > 0n) {
      from = "Disponible";
      to = "Bénéficiaire";
      detail = `${amount(withdrawn)} demoUSD retirés du plan.`;
    } else if (principal !== 0n) {
      from = principal > 0n ? "Disponible" : "Stratégie";
      to = principal > 0n ? "Stratégie" : "Disponible";
      detail = `${amount(principal < 0n ? -principal : principal)} demoUSD ${principal > 0n ? "alloués" : "rachetés"}.`;
    }
    if (detail)
      setChange((old) => ({
        from,
        to,
        detail,
        serial: (old?.serial || 0) + 1,
      }));
  }, [snapshot]);
  if (!change) return null;
  return (
    <div className="change-receipt" key={change.serial} role="status">
      <div className="fund-path">
        <span>{change.from}</span>
        <span className="fund-track" aria-hidden="true">
          <i />
        </span>
        <span>{change.to}</span>
      </div>
      <p>{change.detail}</p>
      <button aria-label="Masquer le mouvement" onClick={() => setChange(null)}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
