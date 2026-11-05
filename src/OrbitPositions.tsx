import { useEffect, useId, useRef, useState } from "react";
import type { Snapshot } from "../packages/shared/index";
import { NftCover } from "./PositionArtwork";
import { FinancialAmount } from "./FinancialAmount";
export function OrbitPositions({
  positions,
  owner,
}: {
  positions: Snapshot[];
  owner: string;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    dialog = useRef<HTMLDialogElement>(null),
    id = useId();
  const position = positions.find((p) => p.account_id === selected);
  useEffect(() => {
    if (position && !dialog.current?.open) dialog.current?.showModal();
    if (!position) dialog.current?.close();
  }, [position, selected]);
  return (
    <>
      <div className="orbite-satellites">
        {positions
          .filter((p) => p.funded)
          .slice(0, 2)
          .map((p, i) => (
            <button
              key={p.account_id}
              className={"orbite-position-card satellite-" + i}
              onClick={() => setSelected(p.account_id)}
              aria-label={"Consulter la position émise " + p.account_id}
            >
              <NftCover code={p.account_id.split(".")[0]} />
              <span className="satellite-caption">
                <strong>{p.account_id.split(".")[0]}</strong>
                <span>Position émise</span>
              </span>
            </button>
          ))}
      </div>
      <dialog
        ref={dialog}
        className="orbite-preview-sheet"
        aria-labelledby={id}
        onClose={() => setSelected(null)}
        onCancel={() => setSelected(null)}
      >
        <div className="dialog-heading">
          <h2 id={id}>Position déjà émise</h2>
          <button onClick={() => dialog.current?.close()}>
            Fermer la position
          </button>
        </div>
        {position && (
          <>
            <p>
              Cette carte montre une position existante. Elle n’indique pas une
              offre de vente.
            </p>
            <dl className="audit-fields">
              <dt>NFT et compte associé</dt>
              <dd>{position.account_id}</dd>
              <dt>Propriétaire courant</dt>
              <dd>{position.owner_id}</dd>
              <dt>Stratégie</dt>
              <dd>{position.series?.terms.name || "Position historique"}</dd>
              <dt>Disponible comptabilisé</dt>
              <dd>
                <FinancialAmount raw={position.available} /> demoUSD
              </dd>
              <dt>Engagé dans la stratégie</dt>
              <dd>
                <FinancialAmount raw={position.principal} /> demoUSD
              </dd>
              <dt>Échéance conservée</dt>
              <dd>
                {position.series
                  ? new Date(
                      Number(
                        BigInt(position.series.terms.matures_at) / 1_000_000n,
                      ),
                    ).toLocaleString("fr-FR")
                  : "Sans échéance contractuelle"}
              </dd>
            </dl>
            <p>
              Les conditions de sortie restent celles du contrat. Les actifs
              comptabilisés ne constituent pas une somme garantie à l’échéance.
            </p>
            {position.owner_id === owner && (
              <a
                className="button"
                href="#positions"
                onClick={() => dialog.current?.close()}
              >
                Gérer ma position
              </a>
            )}
            <p className="orbite-agent-limit">
              Actifs demoUSD sans valeur monétaire.
            </p>
          </>
        )}
      </dialog>
    </>
  );
}
