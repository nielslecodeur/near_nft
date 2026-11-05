import { Icon } from "./Icon";
import { FinancialAmount } from "./FinancialAmount";
import { useState } from "react";
import { nftPassport } from "../packages/shared/passport";
import type { Snapshot } from "../packages/shared/index";
export function NftPassport({
  snapshot: s,
  busy,
  transfer,
  rotate,
}: {
  snapshot: Snapshot;
  busy: boolean;
  transfer: () => void;
  rotate: () => void;
}) {
  const [notice, setNotice] = useState("");
  const ready = s.status === "Active" && !s.pending && !busy;
  const exportPassport = () => {
    try {
      const data = nftPassport(s, new Date().toISOString());
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "everkeep-nft-passport.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        "Passeport exporté : relevé de l’état chargé, sans secret ni preuve de propriété signée.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <section className="nft-workspace" aria-labelledby="nft-title">
      <article className="nft-identity">
        <div className="nft-art" aria-hidden="true">
          <div className="nft-seal"><span>NFT / COMPTE NEAR</span><Icon name="key" size={32}/><strong>KEEP.</strong><span>LE CONTRÔLE PASSE. LE COMPTE RESTE.</span></div>
        </div>
        <div className="nft-identity-body">
          <span className="pill">
            NFT-compte · {s.network === "sandbox" ? "Sandbox" : "Testnet"}
          </span>
          <h2 id="nft-title">Un NFT qui détient un compte.</h2>
          <p>
            Ce titre transmet le contrôle du plan. Le compte, ses fonds et ses
            positions restent à la même adresse.
          </p>
          <dl>
            <dt>Identifiant NFT</dt>
            <dd>{s.account_id}</dd>
            <dt>Collection</dt>
            <dd>{s.collection_id}</dd>
            <dt>Propriétaire du plan chargé</dt>
            <dd>{s.owner_id}</dd>
          </dl>
          <button className="secondary" onClick={exportPassport}>
            Exporter le passeport
          </button>
          <p className="passport-disclaimer">
            Relevé de l’état chargé, pas un certificat signé. Le motif ci-dessus
            appartient à l’interface ; il n’est pas une image inscrite dans les
            métadonnées NFT.
          </p>
        </div>
      </article>
      <div className="nft-details">
        <section className="nft-panel">
          <h2>Ce que le compte conserve</h2>
          <div className="nft-balances">
            <div>
              <span>Disponible</span>
              <strong>
                <FinancialAmount raw={s.available} />
              </strong>
            </div>
            <div>
              <span>En stratégie</span>
              <strong>
                <FinancialAmount raw={s.principal} />
              </strong>
            </div>
            <div>
              <span>Réservé</span>
              <strong>
                <FinancialAmount raw={s.reserved} />
              </strong>
            </div>
          </div>
          <p>
            Montants en demoUSD, sans valeur en dollars. La position est la
            stratégie de démonstration actuelle ; aucun protocole externe n’est
            connecté.
          </p>
        </section>
        <section className="nft-panel">
          <h2>Un contrôle renouvelable</h2>
          <dl className="nft-generations">
            <div>
              <dt>Époque propriétaire</dt>
              <dd>{s.ownership_epoch}</dd>
            </div>
            <div>
              <dt>Version de clé</dt>
              <dd>{s.key_version}</dd>
            </div>
            <div>
              <dt>Version de mandat</dt>
              <dd>{s.policy_version}</dd>
            </div>
          </dl>
          <p>
            {s.agent_paused
              ? "L’agent est suspendu ou sans mandat actif."
              : "Un agent peut allouer uniquement dans les limites du mandat enregistré."}
          </p>
          <div className="button-row">
            <button className="primary" disabled={!ready} onClick={transfer}>
              Transmettre ce NFT
            </button>
            <button className="secondary" disabled={!ready} onClick={rotate}>
              Renouveler la clé NFT
            </button>
          </div>
          {!ready && (
            <p>
              Attendez la fin des opérations et de la synchronisation avant de
              transmettre le plan.
            </p>
          )}
        </section>
        <section className="nft-panel nft-transfer-explainer">
          <h3>Transmettre sans laisser les anciens accès</h3>
          <ol>
            <li>
              Le destinataire enregistre sa propre clé et son consentement.
            </li>
            <li>
              Le propriétaire signe ; la nouvelle clé prouve sa possession.
            </li>
            <li>
              Les générations changent, l’ancien mandat est supprimé et le
              compte attend la synchronisation.
            </li>
          </ol>
          <p>
            Le transfert n’est pas une vente ni une succession automatique. Une
            marketplace doit intégrer les signatures et le consentement
            supplémentaires.
          </p>
        </section>
      </div>
      {notice && (
        <p className="passport-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
