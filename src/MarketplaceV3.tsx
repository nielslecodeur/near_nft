import { useEffect, useRef, useState } from "react";
import {
  officialModels,
  TESTNET,
  type Category,
} from "../packages/shared/network";
import {
  activeCatalogueListings,
  categoryLabels,
  filterCatalogue,
  listingCatalogueItem,
  modelCatalogueItem,
  basketCatalogueItem,
  type CatalogueItem,
} from "../packages/shared/catalogue";
import type { SeriesState } from "../packages/shared/series-state";
import { displayAmount } from "../packages/shared/ui";
import { units } from "../packages/shared/index";
import { currentDeployment, readWalletBalances } from "./testnet-network";
import { TestnetWelcome } from "./TestnetWelcome";
import { OperationError } from "./OperationError";
import { PositionCreation } from "./PositionCreation";
import { CreationSteps } from "./CreationSteps";
import {
  NFTCard,
  CollectionStats,
  PriceHistory,
} from "./terminal/market-components";
import { CardFrame } from "./terminal/CardFrame";
import {
  Button,
  IconButton,
  Select,
  Checkbox,
  Skeleton,
  Tabs,
} from "./terminal/primitives";
import { LayoutGrid, List, SlidersHorizontal, RefreshCw } from "lucide-react";
import { presentCatalogueItem } from "./terminal/catalogue-presentation";
import { PositionFacts } from "./terminal/PositionCard";
import { positionCardFacts } from "./terminal/position-card-data";
import terminalTokens from "../design-system/terminal/tokens.json";
import { requestWallet, usePublicChoice } from "./ux-intent";
import "./catalogue.css";
import { baskets } from "../packages/shared/baskets";
import { BasketComposition, BasketCreation } from "./BasketExperience";
type Command = {
  action: string;
  position?: string;
  amount?: string;
  id?: string;
  mandate_hash?: string;
};
const date = (n: string) =>
  new Date(Number(BigInt(n) / 1_000_000n)).toLocaleString("fr-FR");
export function NftMarketplace({
  data,
  loading,
  now,
  owner,
  local,
  working,
  ask,
  onChanged,
  onWorking,
  selection,
}: {
  data: SeriesState | null;
  loading: boolean;
  now: bigint;
  owner: string;
  local: boolean;
  working: boolean;
  ask: (c: Command) => void;
  onChanged: () => void;
  onWorking: (v: boolean) => void;
  selection?: { id: string; revision: number };
  tab?: unknown;
  onTab?: (v: "strategies" | "resale") => void;
}) {
  const [source, setSource] = usePublicChoice(
    "explore-source",
    location.hash === "#market" ? "community" : "official",
    (v) => ["official", "community"].includes(v),
  );
  const [category, setCategory] = usePublicChoice<
    Category | "equities" | "all"
  >("explore-category", "equities", (v) =>
    ["all", "equities", "crypto", "liquidity"].includes(v),
  );
  const [query, setQuery] = usePublicChoice(
    "catalogue-query",
    "",
    (v) => v.length <= 160,
  );
  const [theme, setTheme] = usePublicChoice("catalogue-theme", "all");
  const [modelId, setModelId] = usePublicChoice("explore-model", "");
  const [saleId, setSaleId] = usePublicChoice("explore-sale", "");
  const [amount, setAmount] = usePublicChoice("create-amount", "100", (v) =>
    /^[0-9.,]{0,20}$/.test(v),
  );
  const [error, setError] = useState(""),
    [funding, setFunding] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid"),
    [density, setDensity] = useState<"comfortable" | "compact">("comfortable"),
    [filtersOpen, setFiltersOpen] = useState(
      () =>
        !window.matchMedia(
          `(max-width: ${terminalTokens.tokens.breakpoint.tablet})`,
        ).matches,
    ),
    [availableOnly, setAvailableOnly] = useState(false),
    [sort, setSort] = useState("catalogue");
  const buyLock = useRef(false),
    detail = useRef<HTMLDivElement>(null),
    grid = useRef<HTMLDivElement>(null),
    returnItem = useRef(""),
    focusDetail = useRef(false);
  const deployment = currentDeployment(),
    models = officialModels(local ? null : deployment),
    rules = data?.series.series,
    terms = rules?.terms,
    clock = now || BigInt(data?.now || "0");
  if (local && rules)
    Object.assign(models[2], {
      id: rules.terms.id,
      status: "demonstration",
      collection: data?.positions[0]?.collection_id,
      mandate_hash: rules.mandate_hash,
    });
  const model = models.find(
    (m) =>
      m.id === modelId ||
      (modelId === "liquidity-v1" && m.category === "liquidity"),
  );
  const basket =
    source === "official" ? baskets.find((b) => b.id === modelId) : undefined;
  const basketAvailable =
    !local && !!data?.capabilities?.includes("thematic-baskets-v1");
  const operational =
    !!model &&
    model.status === "demonstration" &&
    !!terms &&
    model.mandate_hash === rules?.mandate_hash;
  const closed =
    !terms ||
    !!data?.series.closed ||
    clock < BigInt(terms.opens_at) ||
    clock >= BigInt(terms.closes_at) ||
    BigInt(data?.series.committed || "0") >= BigInt(terms.capacity);
  const offers = activeCatalogueListings(data, clock);
  const offerModel = (position: string) => {
    const p = data?.positions.find((p) => p.account_id === position);
    return models.find(
      (m) =>
        m.collection === p?.collection_id &&
        m.mandate_hash === p?.series?.mandate_hash,
    );
  };
  const items: CatalogueItem[] =
    source === "official"
      ? [
          ...baskets.map((b) =>
            basketCatalogueItem(
              b,
              clock || BigInt(Date.now()) * 1000000n,
              basketAvailable,
            ),
          ),
          ...models
            .filter((m) => m.category !== "diversification")
            .map((m) => modelCatalogueItem(m, data, clock)),
        ]
      : offers.map((s) =>
          listingCatalogueItem(
            s,
            data!.positions.find((p) => p.account_id === s.position)!,
            offerModel(s.position),
            data!.now,
            deployment?.asset,
          ),
        );
  const filtered = filterCatalogue(items, query, category, theme)
    .filter((item) => !availableOnly || item.actionable)
    .sort((a, b) => {
      if (sort !== "price") return 0;
      const value = (item: CatalogueItem) =>
        /demoUSD$/.test(item.money.value)
          ? units(item.money.value.replace(/\s|demoUSD/g, "").replace(",", "."))
          : null;
      const left = value(a),
        right = value(b);
      return left === right
        ? 0
        : left === null
          ? 1
          : right === null
            ? -1
            : left < right
              ? -1
              : 1;
    });
  const themes = [...new Set(items.flatMap((i) => i.themes))].filter(
    (t) => !Object.values(categoryLabels).includes(t),
  );
  const sale =
      source === "community"
        ? offers.find((s) => s.position === saleId)
        : undefined,
    p = sale
      ? data!.positions.find((p) => p.account_id === sale.position)
      : undefined;
  const viewingModel = source === "official" && (!!model || !!basket),
    viewingSale = source === "community" && !!sale,
    viewing = viewingModel || viewingSale;
  const selectedItem =
    viewingModel && basket
      ? basketCatalogueItem(
          basket,
          clock || BigInt(Date.now()) * 1000000n,
          basketAvailable,
        )
      : viewingModel && model
        ? modelCatalogueItem(model, data, clock)
        : viewingSale && sale && p
          ? listingCatalogueItem(
              sale,
              p,
              offerModel(sale.position),
              data!.now,
              deployment?.asset,
            )
          : null;
  useEffect(() => {
    if (!selection) return;
    focusDetail.current = true;
    returnItem.current = selection.id;
    setError("");
    setFunding(false);
    if (selection.id.startsWith("model:")) {
      setSource("official");
      setModelId(selection.id.slice(6));
      setSaleId("");
    } else if (selection.id.startsWith("listing:")) {
      setSource("community");
      setSaleId(selection.id.split(":")[1]);
      setModelId("");
    }
  }, [selection]);
  useEffect(() => {
    const redirect = () => {
      if (location.hash === "#market") setSource("community");
    };
    redirect();
    addEventListener("hashchange", redirect);
    return () => removeEventListener("hashchange", redirect);
  }, []);
  useEffect(() => {
    if (focusDetail.current && viewing) {
      detail.current?.focus({ preventScroll: true });
      detail.current?.scrollIntoView({ block: "start" });
      focusDetail.current = false;
    }
  }, [modelId, saleId, viewing]);
  function back() {
    const targetKey =
      returnItem.current ||
      (viewingModel && model
        ? "model:" + model.id
        : sale
          ? "listing:" + sale.position + ":" + sale.id
          : "");
    setModelId("");
    setSaleId("");
    setFunding(false);
    setError("");
    setTimeout(() => {
      const el = grid.current?.querySelector<HTMLElement>(
        '[data-item-key="' + CSS.escape(targetKey) + '"] .ek-art-button',
      );
      (el || document.getElementById("catalogue-search"))?.focus({
        preventScroll: true,
      });
      grid.current?.scrollIntoView({ block: "start" });
    }, 0);
  }
  function open(item: CatalogueItem, create = false) {
    returnItem.current = item.key;
    focusDetail.current = true;
    setError("");
    setFunding(false);
    if (item.kind === "model") {
      setModelId(item.strategyId!);
      setSaleId("");
    } else {
      setSaleId(item.positionId!);
      setModelId("");
    }
    if (create)
      setTimeout(
        () =>
          document
            .getElementById("model-amount")
            ?.focus({ preventScroll: true }),
        0,
      );
  }
  function changeSource(value: string) {
    setSource(value);
    setModelId("");
    setSaleId("");
    setTheme("all");
    setError("");
    setFunding(false);
  }
  async function buy() {
    if (!sale) return;
    if (!owner) {
      requestWallet();
      return;
    }
    if (buyLock.current) return;
    buyLock.current = true;
    onWorking(true);
    setError("");
    try {
      const b = await readWalletBalances(owner);
      if (
        BigInt(b.demoUSD) < BigInt(sale.price) ||
        BigInt(b.spendableEstimate) < 15n * 10n ** 22n
      ) {
        setError(
          "Solde insuffisant pour le prix et les frais techniques de l’achat.",
        );
        setFunding(true);
        return;
      }
      ask({
        action: "buy",
        position: sale.position,
        id: sale.id,
        amount: displayAmount(sale.price).replace(/\s/g, "").replace(",", "."),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      buyLock.current = false;
      onWorking(false);
    }
  }
  return (
    <section
      className="catalogue-explorer ek-market-page"
      aria-label="Explorer"
    >
      <div className="catalogue-toolbar" hidden={viewing}>
        <div className="ek-market-intro">
          <h1>
            Choisissez un thème.
            <br />
            Créez votre position.
          </h1>
          <p>
            Découvrez les entreprises d’un panier, souscrivez en demoUSD et
            suivez votre position NFT individuelle.
          </p>
          <span className="ek-small ek-muted">
            Simulation sur testnet — aucune action réelle détenue.
          </span>
        </div>
        <form
          className="catalogue-search"
          role="search"
          onSubmit={(e) => e.preventDefault()}
        >
          <label htmlFor="catalogue-search">Rechercher dans le catalogue</label>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>
          <input
            type="search"
            id="catalogue-search"
            value={query}
            maxLength={160}
            placeholder="Un modèle, un actif, un thème…"
            onChange={(e) => {
              setQuery(e.target.value);
              setModelId("");
              setSaleId("");
            }}
          />
        </form>
      </div>
      <div
        className="market-tabs catalogue-tabs"
        role="tablist"
        aria-label="Votre intention"
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            const next =
              e.key === "Home"
                ? "official"
                : e.key === "End"
                  ? "community"
                  : source === "official"
                    ? "community"
                    : "official";
            changeSource(next);
            e.currentTarget
              .querySelector<HTMLButtonElement>('[data-source="' + next + '"]')
              ?.focus();
          }
        }}
      >
        {(["official", "community"] as const).map((v) => (
          <button
            key={v}
            data-source={v}
            id={"catalogue-tab-" + v}
            role="tab"
            aria-selected={source === v}
            aria-controls="catalogue-panel"
            tabIndex={source === v ? 0 : -1}
            onClick={() => changeSource(v)}
          >
            {v === "official" ? "Créer une position" : "Acheter une position"}
          </button>
        ))}
      </div>
      <p className="catalogue-help">
        {source === "official"
          ? "Vous déposez pour ouvrir votre propre position."
          : "Vous reprenez une position existante avec ses actifs et ses contraintes."}
      </p>
      {!viewing && (
        <div className="ek-catalogue-controls">
          <Button
            icon={SlidersHorizontal}
            aria-expanded={filtersOpen}
            aria-controls="catalogue-filters"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            Filtres
          </Button>
          <Select
            label="Trier les résultats"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="catalogue">Ordre du catalogue</option>
            <option value="price">Montant croissant</option>
          </Select>
          <div role="group" aria-label="Affichage">
            <IconButton
              icon={LayoutGrid}
              label="Vue grille"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            />
            <IconButton
              icon={List}
              label="Vue liste"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            />
          </div>
          <Select
            label="Densité"
            value={density}
            onChange={(e) => setDensity(e.target.value as typeof density)}
          >
            <option value="comfortable">Confortable</option>
            <option value="compact">Compacte</option>
          </Select>
          <Button
            icon={RefreshCw}
            disabled={working || loading}
            onClick={onChanged}
          >
            Actualiser
          </Button>
        </div>
      )}
      {!viewing && filtersOpen && (
        <div className="catalogue-filters" id="catalogue-filters">
          <div role="group" aria-label="Catégorie">
            {(["all", "equities", "crypto", "liquidity"] as const).map((c) => (
              <button
                key={c}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                {c === "all" ? "Toutes" : categoryLabels[c]}
              </button>
            ))}
          </div>
          <Checkbox
            label="Disponibles uniquement"
            checked={availableOnly}
            onChange={(e) => setAvailableOnly(e.target.checked)}
          />
          <div className="catalogue-theme-filter">
            <label htmlFor="catalogue-theme">Thème</label>
            <select
              id="catalogue-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="all">Tous les thèmes</option>
              {themes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div
        id="catalogue-panel"
        role="tabpanel"
        aria-labelledby={"catalogue-tab-" + source}
      >
        {viewing ? (
          <div className="catalogue-detail" tabIndex={-1} ref={detail}>
            <button className="catalogue-back-link" onClick={back}>
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M16 10H4m5-5-5 5 5 5" />
              </svg>
              Retour au catalogue
            </button>
            {selectedItem && (
              <div className="ek-detail-summary">
                <h1>{selectedItem.name}</h1>
                <p>
                  {selectedItem.kind === "model"
                    ? "Modèle officiel Everkeep"
                    : "Position NFT en vente"}{" "}
                  · {categoryLabels[selectedItem.category]}
                </p>
                <CollectionStats
                  stats={[
                    {
                      label: selectedItem.money.label,
                      value: selectedItem.money.value,
                    },
                    {
                      label: "Disponibilité",
                      value: selectedItem.availability,
                    },
                    {
                      label: "Réseau",
                      value: local ? "NEAR sandbox" : "NEAR testnet",
                    },
                    {
                      label: basket ? "Prix du panier" : "Données financières",
                      value: basket
                        ? "Fictifs · quotidiens UTC"
                        : selectedItem.sources.financial === "verified-chain"
                          ? "Lues sur chaîne"
                          : "Non disponibles",
                    },
                  ]}
                />
              </div>
            )}
            {viewingModel && basket && (
              <div className="model-detail catalogue-model-detail ek-basket-detail">
                <div>
                  <CardFrame
                    theme={presentCatalogueItem(selectedItem!).theme}
                    art={basket.art}
                    alt={selectedItem!.visual.alt}
                  />
                  <p>{basket.description}</p>
                  <BasketComposition
                    model={basket}
                    now={clock || BigInt(Date.now()) * 1000000n}
                  />
                  <p>
                    <strong>Risques.</strong> {basket.risks.join(" ")}
                  </p>
                </div>
                <BasketCreation
                  key={basket.id + owner}
                  model={basket}
                  owner={owner}
                  now={clock || BigInt(Date.now()) * 1000000n}
                  available={basketAvailable}
                  onChanged={onChanged}
                  onWorking={onWorking}
                />
              </div>
            )}
            {viewingModel && model && (
              <div className="model-detail catalogue-model-detail">
                <div>
                  <CardFrame
                    theme={presentCatalogueItem(selectedItem!).theme}
                    art={selectedItem!.visual.src}
                    alt={selectedItem!.visual.alt}
                  />
                  <p>{model.description}</p>
                  <p>
                    <strong>Retrait.</strong>{" "}
                    {operational && terms
                      ? "Après le " +
                        date(terms.matures_at) +
                        ", une fois les fonds engagés dénoués."
                      : model.exit}{" "}
                    La revente dépend d’un acheteur.
                  </p>
                  <p>
                    <strong>Risques.</strong> {model.risks.join(" ")}
                  </p>
                  <details>
                    <summary>Règles, contrats et provenance</summary>
                    <p>
                      Un NFT représente la propriété transférable de la
                      position. Ses actifs et règles restent attachés au même
                      compte.
                    </p>
                    <p>
                      Modèle {model.id}, version {model.version}.
                    </p>
                    <dl>
                      {Object.entries(model.rules).map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                    {operational && terms && (
                      <>
                        <p>
                          Actif : {terms.asset}. Stratégie : {terms.strategy}.
                        </p>
                        <p>
                          Collection : {model.collection}. Mandat :{" "}
                          {rules?.mandate_hash}.
                        </p>
                        <p>
                          Capacité restante :{" "}
                          {displayAmount(
                            (
                              BigInt(terms.capacity) -
                              BigInt(data!.series.committed)
                            ).toString(),
                          )}{" "}
                          demoUSD. Clôture : {date(terms.closes_at)}.
                        </p>
                      </>
                    )}
                    <p>
                      {modelCatalogueItem(model, data, clock).visual.credit}.
                      Géométrie éditoriale, sans représentation d’actifs
                      détenus.
                    </p>
                    <a
                      href={modelCatalogueItem(model, data, clock).visual.src}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Source du visuel
                    </a>
                  </details>
                </div>
                <div className="model-create" id="create-position">
                  {model.collection && !local && (
                    <details>
                      <summary>Historique du modèle</summary>
                      <p>
                        La fiche présente l’état actuel ; elle ne prétend pas
                        indexer tout l’historique.
                      </p>
                      <a
                        href={TESTNET.explorer + "/address/" + model.collection}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Consulter l’activité du contrat
                      </a>
                    </details>
                  )}
                  <h3>Créer ma position</h3>
                  {operational ? (
                    <>
                      {local && <CreationSteps step={1} />}
                      <label htmlFor="model-amount">Montant en demoUSD</label>
                      <input
                        id="model-amount"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value.replace(",", "."));
                          setError("");
                        }}
                      />
                      <p>Minimum : {displayAmount(terms!.minimum)} demoUSD.</p>
                      {closed ? (
                        <p role="status">
                          La souscription est fermée ou sa capacité est
                          atteinte. Aucun nouveau dépôt possible.
                        </p>
                      ) : local ? (
                        <button
                          className="primary"
                          disabled={working}
                          onClick={() => {
                            try {
                              const raw = units(amount);
                              if (
                                raw < BigInt(terms!.minimum) ||
                                raw >
                                  BigInt(terms!.capacity) -
                                    BigInt(data!.series.committed)
                              )
                                throw Error(
                                  "Vérifiez le minimum et la capacité disponible.",
                                );
                              ask({
                                action: "subscribe",
                                amount,
                                mandate_hash: rules!.mandate_hash,
                              });
                            } catch (e) {
                              setError(String(e));
                            }
                          }}
                        >
                          Vérifier ma position
                        </button>
                      ) : (
                        <PositionCreation
                          owner={owner}
                          amount={amount}
                          modelName={model.name}
                          maturity={terms!.matures_at}
                          onChanged={onChanged}
                          onWorking={onWorking}
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <p role="status">{model.reason} Aucun dépôt possible.</p>
                      <button disabled>Création indisponible</button>
                    </>
                  )}
                </div>
              </div>
            )}
            {viewingSale && sale && p && (
              <div className="catalogue-sale-detail">
                <div>
                  <CardFrame
                    theme={presentCatalogueItem(selectedItem!).theme}
                    art={selectedItem!.visual.src}
                    alt={selectedItem!.visual.alt}
                  />
                  <p className="wallet-address">NFT : {p.account_id}</p>
                  <PositionFacts
                    facts={positionCardFacts(p, data!, deployment?.asset)}
                  />
                  <h3>Composition réelle</h3>
                  <dl>
                    {listingCatalogueItem(
                      sale,
                      p,
                      offerModel(sale.position),
                      data!.now,
                      deployment?.asset,
                    ).composition.rows.map((r) => (
                      <div key={r.label}>
                        <dt>{r.label}</dt>
                        <dd>
                          {r.amount} · {r.proportion}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p>
                    Lecture du {date(data!.now)}. Quantités comptabilisées, sans
                    conversion monétaire.
                  </p>
                  <details>
                    <summary>Provenance et détails techniques</summary>
                    <p>
                      Vendeur : {sale.seller}. Annonce : {sale.id}.
                    </p>
                    <p>
                      Stratégie : {p.series?.terms.id}. Mandat :{" "}
                      {p.series?.mandate_hash}.
                    </p>
                    <p>
                      Valable jusqu’au {date(sale.expires_at)}. Les anciens
                      accès sont révoqués après transfert ; le règlement est
                      confirmé sur chaîne.
                    </p>
                    <p>
                      {
                        listingCatalogueItem(
                          sale,
                          p,
                          offerModel(sale.position),
                          data!.now,
                          deployment?.asset,
                        ).visual.credit
                      }
                      . Ce visuel illustre un thème ; il n’est pas un inventaire
                      d’actifs.
                    </p>
                    <a
                      href={
                        listingCatalogueItem(
                          sale,
                          p,
                          offerModel(sale.position),
                          data!.now,
                          deployment?.asset,
                        ).visual.src
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      Source du visuel
                    </a>
                  </details>
                </div>
                <div className="catalogue-purchase">
                  {!local && (
                    <details>
                      <summary>Historique de la position</summary>
                      <p>
                        Les actifs et l’annonce sont relus sur chaîne ; aucun
                        historique de performances n’est extrapolé.
                      </p>
                      <a
                        href={TESTNET.explorer + "/address/" + p.account_id}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Consulter l’activité de cette position
                      </a>
                    </details>
                  )}
                  <h3>Acheter cette position</h3>
                  <dl>
                    <div>
                      <dt>Prix demandé, payé au vendeur</dt>
                      <dd>{displayAmount(sale.price)} demoUSD</dd>
                    </div>
                    <div>
                      <dt>Actifs comptabilisés dans la position</dt>
                      <dd>
                        {displayAmount(
                          (
                            BigInt(p.available) +
                            BigInt(p.principal) +
                            BigInt(p.reserved)
                          ).toString(),
                        )}{" "}
                        demoUSD
                      </dd>
                    </div>
                    <div>
                      <dt>Valorisation monétaire indicative</dt>
                      <dd>Non disponible</dd>
                    </div>
                  </dl>
                  <p>
                    <strong>Retrait.</strong>{" "}
                    {p.series
                      ? "Après le " +
                        date(p.series.terms.matures_at) +
                        " et dénouement."
                      : "Contraintes historiques conservées."}
                  </p>
                  <p>
                    Le prix va au vendeur. Les actifs restent dans le compte :
                    vous reprenez ses contraintes et son échéance. Aucune
                    revente future garantie.
                  </p>
                  <p>
                    Consentement du destinataire : dépôt technique de 0,1 NEAR,
                    plus gas et éventuel enregistrement du jeton. Les demandes
                    distinctes restent affichées dans le wallet.
                  </p>
                  <button
                    className="primary"
                    disabled={working || sale.seller === owner}
                    onClick={() => void buy()}
                  >
                    {!owner
                      ? "Connecter pour acheter"
                      : sale.seller === owner
                        ? "Votre annonce"
                        : "Acheter"}
                  </button>
                </div>
              </div>
            )}
            {selectedItem && !basket && (
              <div className="ek-detail-tabs">
                <Tabs
                  label="Informations sur la position"
                  defaultValue="conditions"
                  items={[
                    {
                      id: "conditions",
                      label: "Composition",
                      content: (
                        <>
                          <h3>
                            {selectedItem.composition.basis === "actual"
                              ? "Actifs comptabilisés"
                              : "Composition cible"}
                          </h3>
                          <p>{selectedItem.composition.explanation}</p>
                          <dl className="ek-composition">
                            {selectedItem.composition.rows.map((row) => (
                              <div key={row.label}>
                                <dt>{row.label}</dt>
                                <dd>
                                  {row.amount ||
                                    row.proportion ||
                                    "Non disponible"}
                                </dd>
                              </div>
                            ))}
                          </dl>
                          <p>{selectedItem.exposure}</p>
                          <p>{selectedItem.exit}</p>
                        </>
                      ),
                    },
                    {
                      id: "activity",
                      label: "Activité",
                      content: (
                        <>
                          <h3>Activité sur chaîne</h3>
                          <p>
                            Le catalogue présente l’état actuel, sans indexer
                            les ventes passées.
                          </p>
                          {sale?.position || model?.collection ? (
                            <a
                              href={
                                TESTNET.explorer +
                                "/address/" +
                                (sale?.position || model?.collection)
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              Consulter le contrat sur l’explorateur NEAR
                            </a>
                          ) : (
                            <p>Aucun contrat actif pour ce modèle.</p>
                          )}
                        </>
                      ),
                    },
                    {
                      id: "analytics",
                      label: "Historique",
                      content: (
                        <PriceHistory
                          points={[]}
                          unit="demoUSD"
                          period="30 j"
                          onPeriodChange={() => {}}
                        />
                      ),
                    },
                  ]}
                />
                <p className="ek-small ek-muted">
                  Les cadres et illustrations sont des traitements visuels : ils
                  ne constituent ni une note de risque, ni une rareté
                  contractuelle.
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="catalogue-results-heading">
              <h2>
                {source === "official"
                  ? "Les modèles Everkeep"
                  : "Les positions en vente"}
              </h2>
              <p role="status" aria-live="polite">
                {filtered.length}{" "}
                {source === "official" ? "modèle" : "position"}
                {filtered.length > 1 ? "s" : ""}
              </p>
            </div>
            {source === "community" && loading && !data ? (
              <div className="ek-card-grid" role="status">
                <span>Lecture des annonces sur NEAR…</span>
                <Skeleton label="Lecture de la première annonce" />
                <Skeleton label="Lecture de la deuxième annonce" />
              </div>
            ) : source === "community" && !data ? (
              <div className="catalogue-empty" role="alert">
                <h3>Les annonces n’ont pas pu être chargées.</h3>
                <p>Aucun achat n’est proposé sans lecture des contrats.</p>
                <button onClick={onChanged}>Réessayer la lecture</button>
              </div>
            ) : filtered.length ? (
              <div
                className="ek-inventory ek-catalogue-inventory"
                data-view={view}
                data-density={density}
                data-count={Math.min(filtered.length, 4)}
                ref={grid}
              >
                <div className="ek-card-grid">
                  {filtered.map((item, index) => (
                    <div key={item.key} data-item-key={item.key}>
                      <NFTCard
                        item={presentCatalogueItem(item)}
                        index={index}
                        onOpen={() => open(item)}
                        onBuy={() => open(item, item.kind === "model")}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="catalogue-empty">
                <h3>
                  {query || category !== "all" || theme !== "all"
                    ? "Aucun résultat dans cette sélection."
                    : "Aucune position en vente pour le moment."}
                </h3>
                <p>
                  {source === "official"
                    ? "Essayez un autre terme ou une autre catégorie."
                    : "Les annonces n’apparaissent qu’après une mise en vente réelle."}
                </p>
                <button
                  onClick={() => {
                    setQuery("");
                    setCategory("all");
                    setTheme("all");
                    setAvailableOnly(false);
                  }}
                >
                  Réinitialiser les filtres
                </button>
                {source === "community" && (
                  <button onClick={() => changeSource("official")}>
                    Voir les modèles
                  </button>
                )}
              </div>
            )}
            {source === "official" && (
              <p className="catalogue-footnote">
                Modèles officiels · illustrations éditoriales. Conditions et
                disponibilité vérifiées avant création.{" "}
                <a href="#agent">Besoin d’un agent ?</a>
              </p>
            )}
          </>
        )}
        {error && <OperationError error={error} onRetry={onChanged} />}
        {funding && (
          <TestnetWelcome
            owner={owner}
            onRefresh={onChanged}
            initiallyOpen
            onReturn={() => setFunding(false)}
          />
        )}
      </div>
    </section>
  );
}
