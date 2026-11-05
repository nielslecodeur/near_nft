import { useRef } from "react";
import type { Snapshot } from "../packages/shared/index";
import { displayAmount } from "../packages/shared/ui";
export function SecurityPanel({
  positions,
  local,
  working,
  onRotate,
}: {
  positions: Snapshot[];
  local: boolean;
  working: boolean;
  onRotate: (position: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button disabled={working} onClick={() => dialog.current?.showModal()}>
        Sécurité et permissions
      </button>
      <dialog
        ref={dialog}
        className="security-dialog"
        aria-labelledby="security-title"
      >
        <div className="dialog-heading">
          <h2 id="security-title">Sécurité et permissions</h2>
          <button onClick={() => dialog.current?.close()}>
            Fermer la sécurité
          </button>
        </div>
        <p>
          Les autorisations sensibles utilisent ML-DSA-65, vérifié par le host
          du contrat NEAR. Le transport des transactions reste classique. Ce
          mécanisme ne constitue pas une garantie de sécurité globale.
        </p>
        {!positions.length && (
          <p>
            Ouvrez une position pour examiner sa clé publique et ses
            permissions.
          </p>
        )}
        {positions.map((s) => (
          <section key={s.account_id}>
            <h3 className="hash">{s.account_id}</h3>
            {s.funded === false && (
              <p>
                Compte préparé, non financé : aucun NFT de position émis à ce
                stade.
              </p>
            )}
            <dl className="audit-fields">
              <dt>Clé, version</dt>
              <dd>{s.key_version}</dd>
              <dt>Propriété, génération</dt>
              <dd>{s.ownership_epoch}</dd>
              <dt>Politique, version</dt>
              <dd>{s.policy_version}</dd>
              <dt>Agent d’allocation</dt>
              <dd>{s.policy && !s.agent_paused ? s.policy.agent : "Aucun"}</dd>
              <dt>Permissions</dt>
              <dd>
                {s.policy
                  ? `Actif ${s.policy.asset}, stratégie ${s.policy.strategy}. Aucun retrait propriétaire ou changement de contrôle.`
                  : "Aucune délégation d’allocation active."}
              </dd>
              <dt>Agent de souscription</dt>
              <dd>
                {s.funding_permit?.agent ||
                  "Aucun mandat de souscription en attente"}
              </dd>
              <dt>Plafonds d’allocation</dt>
              <dd>
                {s.policy
                  ? `${displayAmount(s.policy.max_operation)} demoUSD par opération ; ${displayAmount(s.policy.max_period)} par jour UTC ; allocation ${s.policy.allocation_bps / 100} % ; expiration ${new Date(Number(BigInt(s.policy.expires_at) / 1_000_000n)).toLocaleString("fr-FR")}.`
                  : "Aucun mandat actif."}
              </dd>
              <dt>Souscription autorisée</dt>
              <dd>
                {s.funding_permit
                  ? `${displayAmount(s.funding_permit.amount)} demoUSD, bénéficiaire ${s.funding_permit.beneficiary}, expiration ${new Date(Number(BigInt(s.funding_permit.expires_at) / 1_000_000n)).toLocaleString("fr-FR")}, génération ${s.funding_permit.ownership_epoch}, version ${s.funding_permit.policy_version}.`
                  : "Aucune."}
              </dd>
            </dl>
            <details>
              <summary>Lire la clé publique ML-DSA</summary>
              <textarea
                readOnly
                aria-label={"Clé publique de " + s.account_id}
                value={s.public_key}
              />
            </details>
            <button
              disabled={
                !local || working || s.status !== "Active" || !!s.pending
              }
              onClick={() => onRotate(s.account_id)}
            >
              Renouveler la clé
            </button>
            <p>
              La rotation remplace la clé propriétaire. Les délégations
              existantes restent actives tant qu’elles ne sont pas révoquées.
            </p>
            {!local && (
              <p>
                Rotation indisponible en lecture testnet ; utilisez le
                signataire propriétaire compatible avec le contrat existant.
              </p>
            )}
          </section>
        ))}
      </dialog>
    </>
  );
}
