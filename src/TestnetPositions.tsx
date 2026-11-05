import { TestnetWelcome } from "./TestnetWelcome";
import { useEffect, useRef, useState } from "react";
import type { SeriesState } from "../packages/shared/series-state";
import { displayAmount } from "../packages/shared/ui";
import { TESTNET } from "../packages/shared/network";
import { currentDeployment } from "./testnet-network";
import { positionExit } from "../packages/shared/position-exit";
import { requestWallet, usePublicChoice } from "./ux-intent";
import {
  PositionsWallet,
  PositionsViewSwitch,
  OwnedCollection,
} from "./terminal/PositionsWallet";
import { ownedPositions } from "./terminal/owned-positions";
type Command = {
  action: string;
  position?: string;
  amount?: string;
  id?: string;
};
export function TestnetPositions({
  data,
  owner,
  working,
  ask,
  onRefresh,
}: {
  data: SeriesState;
  owner: string;
  working: boolean;
  ask: (c: Command) => void;
  onRefresh: () => void;
}) {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [selected, setSelected] = usePublicChoice("owned-detail", "");
  const [panel, setPanel] = useState("withdraw");
  const [workspaceView, setWorkspaceView] = usePublicChoice(
    "positions-view",
    "assets",
    (value) => ["assets", "collection"].includes(value),
  );
  const focusPosition = useRef(false);
  const d = currentDeployment(),
    mine = ownedPositions(data, owner),
    now = BigInt(data.now);
  useEffect(() => {
    if (focusPosition.current && selected) {
      document
        .getElementById("owned-" + selected)
        ?.focus({ preventScroll: true });
      document
        .getElementById("owned-" + selected)
        ?.scrollIntoView({ block: "start", behavior: "instant" });
      focusPosition.current = false;
    }
  }, [selected, workspaceView]);
  return (
    <section
      className="testnet-positions ek-positions-page"
      data-view={workspaceView}
    >
      <div className="page-title">
        <h1>Mes positions</h1>
        <p>Votre wallet, vos actifs et les cartes de vos positions sur NEAR.</p>
        <button disabled={working} onClick={onRefresh}>
          Actualiser
        </button>
      </div>
      <PositionsViewSwitch
        value={workspaceView}
        onChange={(value) => {
          setWorkspaceView(value);
          setSelected("");
        }}
        count={mine.length}
      />
      <div
        id="owned-view-panel"
        role="tabpanel"
        aria-labelledby={"owned-tab-" + workspaceView}
      >
        {owner && workspaceView === "assets" && (
          <PositionsWallet owner={owner} data={data} />
        )}
        {!owner ? (
          <div className="community-empty">
            <h2>Retrouvez vos positions.</h2>
            <p>
              Connectez le wallet qui possède vos NFT pour consulter les fonds.
            </p>
            <button className="primary" onClick={requestWallet}>
              Connecter un wallet
            </button>
          </div>
        ) : !mine.length ? (
          <div className="community-empty">
            <h2>Vous n’avez pas encore de position.</h2>
            <p>
              Une création en cours apparaît dès que son financement et son NFT
              sont confirmés. Retrouvez sa progression dans le modèle ou dans
              Agents.
            </p>
            <a href="#explorer">Choisir un modèle</a>
            <TestnetWelcome owner={owner} onRefresh={onRefresh} />
          </div>
        ) : (
          <>
            {workspaceView === "collection" ? (
              <OwnedCollection
                positions={mine}
                data={data}
                selected={selected}
                onOpen={(id) => {
                  if (selected === id) {
                    document
                      .getElementById("owned-" + id)
                      ?.focus({ preventScroll: true });
                    document
                      .getElementById("owned-" + id)
                      ?.scrollIntoView({ block: "start", behavior: "instant" });
                    return;
                  }
                  focusPosition.current = true;
                  setSelected(id);
                  setPanel("withdraw");
                }}
              />
            ) : (
              <div className="ek-section-heading">
                <div>
                  <h2>Vos positions NFT</h2>
                  <p>
                    Les retraits restent soumis aux échéances et à l’état du
                    compte.
                  </p>
                </div>
                <a href="#explorer">Ajouter une position</a>
              </div>
            )}
            {mine.map((s) => {
              if (workspaceView === "collection" && selected !== s.account_id)
                return null;
              const mature =
                  !s.series || now >= BigInt(s.series.terms.matures_at),
                sale = data.listings.find(
                  (l) => l.position === s.account_id && l.id === s.sale?.id,
                ),
                frozen = s.status !== "Active" || !!s.pending;
              const listed =
                !!sale &&
                ["Active", "Settling", "Resolving", "AwaitingIndex"].includes(
                  sale.state,
                );
              const { withdrawable } = positionExit(s, now, listed);
              const known =
                  d?.collection === s.collection_id &&
                  d.mandate_hash === s.series?.mandate_hash,
                open = selected === s.account_id;
              return (
                <article
                  className="owned-position"
                  key={s.account_id}
                  id={"owned-" + s.account_id}
                  tabIndex={-1}
                >
                  <div className="owned-position-title">
                    <h2>{known ? "Réserve demoUSD" : "Position historique"}</h2>
                    <span>
                      {listed
                        ? "En vente · actions gelées"
                        : s.pending
                          ? "Opération en attente"
                          : mature
                            ? "Échéance atteinte"
                            : "Échéance à venir"}
                    </span>
                  </div>
                  <dl className="position-balances">
                    <div>
                      <dt>Actifs dans cette position</dt>
                      <dd>
                        {displayAmount(
                          (
                            BigInt(s.available) +
                            BigInt(s.principal) +
                            BigInt(s.reserved)
                          ).toString(),
                        )}{" "}
                        demoUSD
                      </dd>
                    </div>
                    <div>
                      <dt>Disponibles au retrait</dt>
                      <dd>{displayAmount(withdrawable)} demoUSD</dd>
                    </div>
                    <div>
                      <dt>Engagés dans la stratégie</dt>
                      <dd>{displayAmount(s.principal)} demoUSD</dd>
                    </div>
                  </dl>
                  <p>
                    {!mature && s.series
                      ? "Retrait après le " +
                        new Date(
                          Number(
                            BigInt(s.series.terms.matures_at) / 1_000_000n,
                          ),
                        ).toLocaleString("fr-FR") +
                        "."
                      : listed
                        ? "Annulez l’annonce ou suivez son règlement."
                        : s.pending
                          ? "Attendez la confirmation de l’opération."
                          : BigInt(s.principal) > 0n
                            ? "Dénouez les placements avant le retrait."
                            : "Consultez votre position pour retirer les fonds disponibles."}
                  </p>
                  <button
                    className={open ? "text-action" : "primary"}
                    aria-expanded={open}
                    onClick={() => {
                      setSelected(open ? "" : s.account_id);
                      setPanel("withdraw");
                    }}
                  >
                    {open ? "Masquer les détails" : "Voir ma position"}
                  </button>
                  {open && (
                    <div className="owned-detail">
                      <div
                        className="position-action-tabs"
                        role="group"
                        aria-label="Gérer cette position"
                      >
                        {[
                          ["withdraw", "Retirer"],
                          ["agent", "Gérer l’agent"],
                          ["sale", "Vendre la position"],
                        ].map(([id, label]) => (
                          <button
                            key={id}
                            aria-pressed={panel === id}
                            onClick={() => setPanel(id)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {panel === "withdraw" && (
                        <section aria-label="Retirer">
                          <h3>Récupérer mes fonds</h3>
                          <dl>
                            <div>
                              <dt>Liquidités dans le compte</dt>
                              <dd>{displayAmount(s.available)} demoUSD</dd>
                            </div>
                            <div>
                              <dt>Placements à dénouer</dt>
                              <dd>{displayAmount(s.principal)} demoUSD</dd>
                            </div>
                            <div>
                              <dt>Réservés pour une opération en cours</dt>
                              <dd>{displayAmount(s.reserved)} demoUSD</dd>
                            </div>
                          </dl>
                          <p>
                            Les liquidités du compte restent soumises à
                            l’échéance. Un placement doit d’abord être dénoué ;
                            attendez sa confirmation avant de retirer.
                          </p>
                          {!mature && (
                            <p role="status">
                              Retrait verrouillé jusqu’au{" "}
                              {s.series &&
                                new Date(
                                  Number(
                                    BigInt(s.series.terms.matures_at) /
                                      1_000_000n,
                                  ),
                                ).toLocaleString("fr-FR")}
                              . Aucun retrait anticipé.
                            </p>
                          )}
                          {(frozen || listed) && (
                            <p role="status">
                              Le compte est gelé ou une opération est en cours.
                              Actualisez ou terminez le règlement avant de
                              retirer.
                            </p>
                          )}
                          {BigInt(s.principal) > 0n ? (
                            <button
                              className="primary"
                              disabled={working || !mature || frozen || listed}
                              onClick={() =>
                                ask({
                                  action: "redeem",
                                  position: s.account_id,
                                })
                              }
                            >
                              Dénouer les fonds engagés
                            </button>
                          ) : (
                            <>
                              <p>
                                Montant à recevoir :{" "}
                                <strong>
                                  {displayAmount(withdrawable)} demoUSD
                                </strong>
                                . Destinataire :{" "}
                                <span className="wallet-address">{owner}</span>.
                              </p>
                              <button
                                className="primary"
                                disabled={
                                  working || BigInt(withdrawable) === 0n
                                }
                                onClick={() =>
                                  ask({
                                    action: "withdraw",
                                    position: s.account_id,
                                  })
                                }
                              >
                                Retirer les fonds disponibles
                              </button>
                            </>
                          )}
                        </section>
                      )}
                      {panel === "agent" && (
                        <section aria-label="Gérer l’agent">
                          <h3>Autorisations de l’agent</h3>
                          <p>
                            {s.policy && !s.agent_paused
                              ? `Agent autorisé : ${s.policy.agent}. Plafond de ${displayAmount(s.policy.max_operation)} demoUSD par opération.`
                              : "Aucune autorisation de gestion active."}{" "}
                            Les analyses payées n’autorisent ni retrait ni
                            vente.
                          </p>
                          {s.policy && (
                            <details>
                              <summary>
                                Limites de l’autorisation actuelle
                              </summary>
                              <p>
                                Plafond par jour UTC :{" "}
                                {displayAmount(s.policy.max_period)} demoUSD.
                                Allocation maximale :{" "}
                                {s.policy.allocation_bps / 100} %. Expiration :{" "}
                                {new Date(
                                  Number(
                                    BigInt(s.policy.expires_at) / 1_000_000n,
                                  ),
                                ).toLocaleString("fr-FR")}
                                .
                              </p>
                              <p>
                                Agent : {s.policy.agent}. Actif :{" "}
                                {s.policy.asset}. Stratégie :{" "}
                                {s.policy.strategy}.{" "}
                                {s.agent_paused
                                  ? "Agent en pause."
                                  : "Ces limites restent contrôlées par le contrat."}
                              </p>
                            </details>
                          )}
                          <button
                            disabled={working || frozen || listed || !s.policy}
                            onClick={() =>
                              ask({ action: "revoke", position: s.account_id })
                            }
                          >
                            Révoquer les autorisations
                          </button>
                          <p>
                            <a href="#agent">
                              Demander une nouvelle proposition
                            </a>
                          </p>
                        </section>
                      )}
                      {panel === "sale" && (
                        <section aria-label="Vendre">
                          <h3>Vendre la position</h3>
                          <p>
                            Le prix payé vous revient ; les actifs restent dans
                            le compte de la position. L’acheteur reprend les
                            contraintes et l’échéance. Aucun acheteur ni délai
                            de vente n’est garanti.
                          </p>
                          <p>
                            L’annonce gèle les retraits, dénouements et
                            changements d’autorisations jusqu’à son annulation
                            ou au règlement.
                          </p>
                          {listed && sale ? (
                            <>
                              <p>
                                Prix : {displayAmount(sale.price)} demoUSD.{" "}
                                {sale.state === "Active"
                                  ? "Annonce active."
                                  : "Règlement en cours : aucun nouveau paiement nécessaire."}
                              </p>
                              <button
                                className="primary"
                                disabled={working}
                                onClick={() =>
                                  ask({
                                    action:
                                      sale.state === "Active"
                                        ? now >= BigInt(sale.expires_at)
                                          ? "expire"
                                          : "cancel"
                                        : "resume",
                                    position: s.account_id,
                                    id: sale.id,
                                  })
                                }
                              >
                                {sale.state === "Active"
                                  ? "Annuler mon annonce"
                                  : "Reprendre le règlement"}
                              </button>
                            </>
                          ) : (
                            <div className="position-sale-form">
                              <label htmlFor={s.account_id + "-sale"}>
                                Prix de vente en demoUSD
                              </label>
                              <input
                                id={s.account_id + "-sale"}
                                inputMode="decimal"
                                value={prices[s.account_id] || "100"}
                                onChange={(e) =>
                                  setPrices({
                                    ...prices,
                                    [s.account_id]: e.target.value.replace(
                                      ",",
                                      ".",
                                    ),
                                  })
                                }
                              />
                              <button
                                className="primary"
                                disabled={
                                  working ||
                                  frozen ||
                                  mature ||
                                  BigInt(s.principal) > 0n
                                }
                                onClick={() =>
                                  ask({
                                    action: "list",
                                    position: s.account_id,
                                    amount: prices[s.account_id] || "100",
                                  })
                                }
                              >
                                Vérifier la mise en vente
                              </button>
                              {BigInt(s.principal) > 0n && (
                                <p>
                                  Dénouez les fonds engagés avant une mise en
                                  vente.
                                </p>
                              )}
                              {mature && (
                                <p>
                                  Après l’échéance, ce contrat permet le retrait
                                  et n’ouvre plus de nouvelle annonce.
                                </p>
                              )}
                            </div>
                          )}
                        </section>
                      )}
                      <details>
                        <summary>Détails techniques et sécurité</summary>
                        <p>
                          Compte NFT :{" "}
                          <a
                            target="_blank"
                            rel="noreferrer"
                            href={TESTNET.explorer + "/address/" + s.account_id}
                          >
                            {s.account_id}
                          </a>
                        </p>
                        <p>
                          Propriétaire : {s.owner_id}. Modèle :{" "}
                          {s.series?.terms.id}, version{" "}
                          {s.series?.terms.version}.
                        </p>
                        <p>
                          Une clé locale protège les autorisations de cette
                          position. Consultez Sécurité dans le menu du compte
                          pour son fonctionnement.
                        </p>
                        <button
                          disabled={working || frozen || listed}
                          onClick={() =>
                            ask({ action: "rotate", position: s.account_id })
                          }
                        >
                          Renouveler la clé locale
                        </button>
                        <PositionActivity
                          position={s.account_id}
                          owner={owner}
                        />
                      </details>
                    </div>
                  )}
                </article>
              );
            })}
          </>
        )}
      </div>
      {data.listings
        .filter(
          (l) => l.claim?.beneficiary === owner && l.claim.state !== "Paid",
        )
        .map((l) => (
          <section className="position-claim" key={l.position + l.id}>
            <h2>Paiement de vente à réclamer</h2>
            <p>
              {displayAmount(l.claim!.amount)} demoUSD pour {owner}.{" "}
              {l.claim!.state === "Claimable"
                ? "Paiement disponible."
                : "Paiement en attente de confirmation."}
            </p>
            <button
              disabled={working || l.claim!.state !== "Claimable"}
              onClick={() =>
                ask({ action: "claim_sale", position: l.position, id: l.id })
              }
            >
              Réclamer le paiement
            </button>
          </section>
        ))}
    </section>
  );
}
function PositionActivity({
  position,
  owner,
}: {
  position: string;
  owner: string;
}) {
  let entries: {
    position: string;
    method: string;
    hash: string;
    at: string;
  }[] = [];
  try {
    entries = JSON.parse(
      localStorage.getItem("everkeep.activity.v1:" + owner) || "[]",
    );
  } catch {}
  const rows = entries.filter((e) => e.position === position);
  return rows.length ? (
    <ul>
      {rows.map((e) => (
        <li key={e.hash}>
          <a
            href={TESTNET.explorer + "/txns/" + e.hash}
            target="_blank"
            rel="noreferrer"
          >
            {e.method} · {new Date(e.at).toLocaleString("fr-FR")}
          </a>
        </li>
      ))}
    </ul>
  ) : (
    <p>Aucun reçu de cet appareil pour cette position.</p>
  );
}
