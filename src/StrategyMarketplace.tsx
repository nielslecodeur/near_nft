import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SeriesState } from "../packages/shared/series-state";
import type { Listing } from "../packages/shared/series";
import { displayAmount } from "../packages/shared/ui";
import { FinancialAmount } from "./FinancialAmount";
import { units } from "../packages/shared/index";
import { NftCover } from "./PositionArtwork";
import { StrategyCarousel, type StrategyIdentity } from "./StrategyCarousel";
import { AgentDirectory } from "./AgentDirectory";
import { OrbitPositions } from "./OrbitPositions";

type Command = {
  action: string;
  position?: string;
  amount?: string;
  id?: string;
  mandate_hash?: string;
};
const date = (value: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(Number(BigInt(value) / 1_000_000n)));
const money = (value: string) => (
  <>
    <FinancialAmount raw={value} />
    <span className="nft-currency"> demoUSD</span>
  </>
);
const progress = ["Settling", "Resolving", "AwaitingIndex"];
const status = (sale: Listing, now: bigint) =>
  sale.state === "Active"
    ? now >= BigInt(sale.expires_at)
      ? "Annonce expirée"
      : "En vente"
    : progress.includes(sale.state)
      ? "Règlement en cours"
      : sale.state === "Settled"
        ? "Vente confirmée"
        : sale.state === "RefundClaimable"
          ? "Remboursement dû"
          : "Annonce annulée";

export function NftMarketplace({
  data,
  loading,
  now,
  owner,
  local,
  working,
  tab,
  onTab,
  ask,
}: {
  data: SeriesState | null;
  loading: boolean;
  now: bigint;
  owner: string;
  local: boolean;
  working: boolean;
  tab: "strategies" | "resale";
  onTab: (value: "strategies" | "resale") => void;
  ask: (command: Command) => void;
}) {
  const [selected, setSelected] = useState(0),
    [amount, setAmount] = useState("100"),
    [error, setError] = useState("");
  const [product, setProduct] = useState<{
    position: string;
    id: string;
  } | null>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const rules = data?.series.series,
    terms = rules?.terms;
  const closed =
    !terms ||
    !!data?.series.closed ||
    now < BigInt(terms.opens_at) ||
    now >= BigInt(terms.closes_at) ||
    BigInt(data?.series.committed || "0") >= BigInt(terms.capacity);
  const offers =
    data?.listings.filter(
      (l) =>
        (l.state === "Active" &&
          (now < BigInt(l.expires_at) || l.seller === owner)) ||
        progress.includes(l.state),
    ) || [];
  const identities: StrategyIdentity[] = terms
    ? [
        {
          id: terms.id,
          name: "Réserve demoUSD",
          description:
            "Une position individuelle à échéance, financée en une seule fois.",
          assets: "demoUSD",
          exit: "Retrait après échéance et dénouement",
          status: local ? "demo" : "read-only",
          theme: "reserve",
        },
      ]
    : [];
  const sale = product
    ? data?.listings.find(
        (l) => l.position === product.position && l.id === product.id,
      )
    : undefined;
  const position = sale
    ? data?.positions.find((p) => p.account_id === sale.position)
    : undefined;
  const history = sale
    ? data?.listings.filter((l) => l.position === sale.position)
    : [];
  useEffect(() => {
    if (product && !sheet.current?.open) sheet.current?.showModal();
  }, [product]);
  useEffect(() => {
    sheet.current?.close();
    setProduct(null);
    setError("");
  }, [owner, data?.mode]);
  function act(command: Command) {
    sheet.current?.close();
    setProduct(null);
    ask(command);
  }
  function subscribe(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const raw = units(amount);
      if (!terms || raw < BigInt(terms.minimum))
        throw new Error(
          "Le minimum est de " +
            displayAmount(terms?.minimum || "0") +
            " demoUSD.",
        );
      if (raw > BigInt(terms.capacity) - BigInt(data?.series.committed || "0"))
        throw new Error("La capacité restante est insuffisante.");
      if (closed || !local || working) return;
      ask({ action: "subscribe", amount, mandate_hash: rules!.mandate_hash });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <div className="nft-marketplace">
      <header className="orbite-hero">
        <div className="orbite-hero-copy">
          <h1>
            Votre capital.
            <br />
            Vos règles.
          </h1>
          <p>
            Des stratégies, des positions NFT et un agent qui agit avec votre
            accord. Créez votre position ou reprenez celle d’un autre
            propriétaire.
          </p>
          <div className="orbite-hero-actions">
            <button
              className="primary"
              onClick={() =>
                document.getElementById("orbite-catalogue")?.scrollIntoView({
                  behavior: matchMedia("(prefers-reduced-motion: reduce)")
                    .matches
                    ? "instant"
                    : "smooth",
                })
              }
            >
              Explorer les stratégies
            </button>
            <a href="#agent">Découvrir l’agent</a>
          </div>
        </div>
        <div className="orbite-scene">
          <svg
            className="orbite-trajectories"
            viewBox="0 0 620 620"
            fill="none"
            aria-hidden="true"
          >
            <g stroke="currentColor" strokeWidth="1">
              <ellipse
                cx="310"
                cy="300"
                rx="275"
                ry="170"
                transform="rotate(-38 310 300)"
              />
              <ellipse
                cx="310"
                cy="300"
                rx="220"
                ry="125"
                transform="rotate(-38 310 300)"
              />
            </g>
            <g fill="currentColor">
              <circle cx="87" cy="425" r="3" />
              <circle cx="533" cy="175" r="3" />
              <circle cx="430" cy="482" r="3" />
            </g>
          </svg>
          {terms ? (
            <StrategyCarousel
              items={identities}
              selected={selected}
              onSelect={setSelected}
            />
          ) : (
            <div className="orbite-scene-empty">
              <p>
                {loading
                  ? "Lecture des stratégies…"
                  : "Aucune stratégie chargée"}
              </p>
            </div>
          )}
          <OrbitPositions positions={data?.positions || []} owner={owner} />
        </div>
      </header>
      <AgentDirectory
        compact
        paid={data?.capabilities?.includes("paid-missions-v1")}
      />
      <div className="nft-catalog-toolbar" id="orbite-catalogue">
        <div role="group" aria-label="Catalogue">
          <button
            aria-pressed={tab === "strategies"}
            onClick={() => onTab("strategies")}
          >
            Stratégies
          </button>
          <button
            aria-pressed={tab === "resale"}
            onClick={() => onTab("resale")}
          >
            Positions en vente
          </button>
        </div>
        <span>Sur NEAR</span>
      </div>
      {loading ? (
        <div className="nft-catalog-loading" role="status">
          Chargement du catalogue…
        </div>
      ) : !data ? (
        <div className="nft-market-empty">
          <h2>Le catalogue n’est pas disponible.</h2>
          <p>
            Rechargez les données pour consulter les offres et leurs conditions
            réelles.
          </p>
        </div>
      ) : tab === "strategies" ? (
        <>
          {terms ? (
            <>
              <section
                className="strategy-subscription"
                aria-labelledby="strategy-detail-title"
              >
                <div className="strategy-description">
                  <h2 id="strategy-detail-title">Réserve demoUSD</h2>
                  <p>
                    Vous souscrivez à des règles communes. Chaque souscription
                    crée votre propre NFT et son compte, avec ses actifs et ses
                    permissions. Vous n’achetez pas le code de la stratégie.
                  </p>
                  <dl className="strategy-overview">
                    <div>
                      <dt>Actif autorisé</dt>
                      <dd>demoUSD</dd>
                    </div>
                    <div>
                      <dt>Dépôt minimum</dt>
                      <dd>{money(terms.minimum)}</dd>
                    </div>
                    <div>
                      <dt>Échéance</dt>
                      <dd>{date(terms.matures_at)}</dd>
                    </div>
                    <div>
                      <dt>Sortie</dt>
                      <dd>
                        Retrait après échéance et dénouement ; revente si un
                        acheteur se présente.
                      </dd>
                    </div>
                  </dl>
                  <details className="nft-contract-details">
                    <summary>Mandat, contrats et risques</summary>
                    <dl className="audit-fields">
                      <dt>Stratégie et version</dt>
                      <dd>
                        {terms.id} · v{terms.version}
                      </dd>
                      <dt>Token autorisé</dt>
                      <dd>{terms.asset}</dd>
                      <dt>Contrat sous-jacent</dt>
                      <dd>{terms.strategy}</dd>
                      <dt>Allocation maximale</dt>
                      <dd>{terms.allocation_bps / 100} %</dd>
                      <dt>Par opération / jour UTC</dt>
                      <dd>
                        {money(terms.max_operation)} / {money(terms.max_period)}
                      </dd>
                      <dt>Capacité totale / restante</dt>
                      <dd>
                        {money(terms.capacity)} /{" "}
                        {money(
                          (
                            BigInt(terms.capacity) -
                            BigInt(data.series.committed)
                          ).toString(),
                        )}
                      </dd>
                      <dt>Clôture des souscriptions</dt>
                      <dd>{date(terms.closes_at)}</dd>
                      <dt>Mandat immuable</dt>
                      <dd>{rules?.mandate_hash}</dd>
                    </dl>
                    <p>
                      Stratégie de démonstration : les distributions éventuelles
                      viennent d’une réserve demoUSD préfinancée, pas d’une
                      croissance de marché. Aucun capital ni rendement garanti ;
                      la liquidité de revente dépend d’un acheteur.
                    </p>
                  </details>
                </div>
                <form onSubmit={subscribe} className="position-subscribe-form">
                  <h3>Créer votre position</h3>
                  <label htmlFor="nft-purchase-amount">
                    Dépôt initial en demoUSD
                  </label>
                  <input
                    id="nft-purchase-amount"
                    inputMode="decimal"
                    required
                    pattern="[0-9]+(\.[0-9]{1,6})?"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value.replace(",", "."));
                      setError("");
                    }}
                  />
                  <p>
                    Dépôt unique : aucun versement complémentaire. Capital
                    verrouillé jusqu’au {date(terms.matures_at)}.
                  </p>
                  <p className="nft-purchase-condition">
                    Réserve technique : 6 NEAR par nouveau compte, séparés du
                    capital demoUSD. Aucune commission applicative.
                  </p>
                  {error && (
                    <p role="alert" className="nft-purchase-error">
                      {error}
                    </p>
                  )}
                  <button
                    className="primary"
                    disabled={!local || working || closed}
                  >
                    Créer une position
                  </button>
                  <p className="nft-offer-note">
                    {!local
                      ? "Testnet en lecture seule ; souscription non activée."
                      : closed
                        ? "La fenêtre de souscription est fermée ou la capacité est atteinte."
                        : "Une confirmation détaillée précède la signature locale de démonstration."}
                  </p>
                  <a href="#agent" className="nft-agent-help">
                    Demander une proposition à l’agent
                  </a>
                </form>
              </section>
            </>
          ) : (
            <div className="nft-market-empty">
              <h2>Aucune stratégie disponible.</h2>
              <p>
                Seules les stratégies reliées aux contrats apparaissent ici.
              </p>
            </div>
          )}
        </>
      ) : offers.length ? (
        <div className="nft-resale-grid">
          {offers.map((l) => {
            const p = data.positions.find((p) => p.account_id === l.position);
            return (
              <article className="nft-sale-card" key={l.position + l.id}>
                <button
                  className="nft-art-link"
                  aria-label={"Examiner la position " + l.position}
                  onClick={() => setProduct({ position: l.position, id: l.id })}
                >
                  <NftCover code={l.position.split(".")[0]} />
                </button>
                <div className="nft-sale-caption">
                  <h2>{l.position.split(".")[0]}</h2>
                  <span>{status(l, now)}</span>
                </div>
                <p className="nft-sale-strategy">
                  {p?.series?.terms.name || "Stratégie non indexée"}
                  {p?.series ? ` · v${p.series.terms.version}` : ""}
                </p>
                <dl className="sale-card-facts">
                  <div>
                    <dt>Prix demandé</dt>
                    <dd>{money(l.price)}</dd>
                  </div>
                  <div>
                    <dt>Actifs comptabilisés au gel</dt>
                    <dd>
                      {money(
                        (BigInt(l.available) + BigInt(l.principal)).toString(),
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="nft-offer-note">
                  Échéance :{" "}
                  {p?.series ? date(p.series.terms.matures_at) : "Non indexée"}
                </p>
                <button
                  onClick={() => setProduct({ position: l.position, id: l.id })}
                >
                  Examiner la position
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="nft-market-empty">
          <h2>Aucune position en vente pour le moment.</h2>
          <p>Les annonces à prix fixe des propriétaires apparaîtront ici.</p>
          <button onClick={() => onTab("strategies")}>
            Explorer les stratégies
          </button>
        </div>
      )}
      <p className="nft-market-footnote">
        Prototype avec actifs de test. Aucun capital ni rendement garanti.
      </p>
      <dialog
        ref={sheet}
        className="nft-detail-sheet"
        aria-labelledby="nft-detail-title"
        onCancel={() => setProduct(null)}
        onClose={() => setProduct(null)}
      >
        <div className="nft-detail-head">
          <span>Achat d’une position existante</span>
          <button
            onClick={() => {
              sheet.current?.close();
              setProduct(null);
            }}
          >
            Fermer la fiche
          </button>
        </div>
        {sale ? (
          <div className="nft-detail-layout">
            <NftCover code={sale.position.split(".")[0]} />
            <div>
              <h2 id="nft-detail-title">{sale.position.split(".")[0]}</h2>
              <p>
                {position?.series?.terms.name || "Stratégie non indexée"}
                {position?.series ? ` · v${position.series.terms.version}` : ""}
              </p>
              <p className="nft-product-type">{status(sale, now)}</p>
              <dl className="nft-detail-facts">
                <div>
                  <dt>Prix demandé</dt>
                  <dd>{money(sale.price)}</dd>
                </div>
                <div>
                  <dt>Actifs comptabilisés au gel</dt>
                  <dd>
                    {money(
                      (
                        BigInt(sale.available) + BigInt(sale.principal)
                      ).toString(),
                    )}
                  </dd>
                </div>
              </dl>
              <dl className="audit-fields">
                <dt>NFT et compte associé</dt>
                <dd>{sale.position}</dd>
                <dt>Vendeur</dt>
                <dd>{sale.seller}</dd>
                <dt>Propriétaire courant</dt>
                <dd>{position?.owner_id || "Non indexé"}</dd>
                <dt>Disponible / engagé au gel</dt>
                <dd>
                  {money(sale.available)} / {money(sale.principal)}
                </dd>
                <dt>Date de valorisation au gel</dt>
                <dd>
                  {sale.valuation_at
                    ? date(sale.valuation_at)
                    : "Non enregistrée sur ce déploiement"}
                </dd>
                <dt>Données observées le</dt>
                <dd>{data ? date(data.now) : "Indisponibles"}</dd>
                <dt>Échéance conservée</dt>
                <dd>
                  {position?.series
                    ? date(position.series.terms.matures_at)
                    : position
                      ? "Sans échéance contractuelle"
                      : "Non indexée"}
                </dd>
                <dt>Expiration de l’annonce</dt>
                <dd>{date(sale.expires_at)}</dd>
              </dl>
              <p>
                Le prix est versé au vendeur. Il n’ajoute aucun actif à la
                position. La valeur comptabilisée et le montant récupérable à la
                sortie sont distincts ; aucune somme n’est garantie à
                l’échéance.
              </p>
              <div className="nft-secondary-purchase">
                {sale.state === "Active" && now < BigInt(sale.expires_at) ? (
                  <button
                    className="primary"
                    disabled={!local || working}
                    onClick={() =>
                      act({
                        action: sale.seller === owner ? "cancel" : "buy",
                        position: sale.position,
                        id: sale.id,
                        amount: sale.price,
                      })
                    }
                  >
                    {sale.seller === owner
                      ? "Annuler mon annonce"
                      : "Acheter cette position"}
                  </button>
                ) : sale.state === "Active" ? (
                  <button
                    disabled={!local || working}
                    onClick={() =>
                      act({
                        action: "expire",
                        position: sale.position,
                        id: sale.id,
                      })
                    }
                  >
                    Libérer l’annonce expirée
                  </button>
                ) : progress.includes(sale.state) ? (
                  <button
                    disabled={!local || working}
                    onClick={() =>
                      act({
                        action: "resume",
                        position: sale.position,
                        id: sale.id,
                      })
                    }
                  >
                    Suivre le règlement
                  </button>
                ) : (
                  <p>Cette annonce est clôturée.</p>
                )}
              </div>
              <details className="nft-contract-details">
                <summary>Contraintes et historique</summary>
                <p>
                  Le compte, ses actifs, sa stratégie et son échéance restent
                  identiques après l’achat. Les anciennes clés et permissions
                  d’agent sont invalidées. Vous configurez ensuite vos propres
                  permissions. Le contrat reste déployé ; son code n’est pas
                  vendu.
                </p>
                {position?.series && (
                  <p>
                    Mandat v{position.series.terms.version} : allocation
                    maximale {position.series.terms.allocation_bps / 100} %,{" "}
                    {money(position.series.terms.max_operation)} par opération.{" "}
                    <span className="hash">{position.series.mandate_hash}</span>
                  </p>
                )}
                <h3>Annonces enregistrées</h3>
                <ol className="position-history">
                  {history?.map((l) => (
                    <li key={l.id}>
                      Annonce {l.id} · {money(l.price)} · {status(l, now)}
                      {l.valuation_at
                        ? " · " + date(l.valuation_at)
                        : " · date non enregistrée"}
                    </li>
                  ))}
                </ol>
                <h3>Activité de cette session</h3>
                {data?.journal.some((e) => e.position === sale.position) ? (
                  <ol className="position-history">
                    {data.journal
                      .filter((e) => e.position === sale.position)
                      .map((e, i) => (
                        <li key={i}>
                          {e.ok ? "Confirmé" : "Refusé"} · {e.label} ·{" "}
                          {new Date(e.at).toLocaleString("fr-FR")}
                        </li>
                      ))}
                  </ol>
                ) : (
                  <p>
                    Aucun événement de cette session indexé pour cette position.
                    Ce journal n’est pas un historique exhaustif de la chaîne.
                  </p>
                )}
              </details>
              <p className="nft-detail-risk">
                Démonstration en demoUSD, sans valeur monétaire.
                {!local ? " Achat testnet désactivé." : ""}
              </p>
            </div>
          </div>
        ) : (
          <>
            <h2 id="nft-detail-title">Annonce indisponible</h2>
            <p>Rechargez les données avant de préparer un achat.</p>
          </>
        )}
      </dialog>
    </div>
  );
}
