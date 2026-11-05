import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDot,
  Heart,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  IconButton,
  Input,
  Notice,
  NumberText,
  Select,
  Skeleton,
} from "./primitives";
import { CardFrame } from "./CardFrame";
import type { CardTheme } from "./card-theme";
import {
  ChangeChip,
  Price,
  Sparkline,
  TickingNumber,
  type DisplayPrice,
} from "./market-metrics";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import tokens from "../../design-system/terminal/tokens.json";

export type MarketItem = {
  id: string;
  name: string;
  collection: string;
  category: string;
  art: string;
  alt: string;
  price: DisplayPrice | null;
  lastSale: DisplayPrice | null;
  theme: CardTheme;
  available: boolean;
  presentation?: {
    badge: string;
    priceLabel: string;
    actionLabel: string;
    unavailableLabel: string;
    note: string;
  };
};
export type CollectionRow = {
  id: string;
  name: string;
  art: string;
  floor: DisplayPrice | null;
  change: number | null;
  volume: DisplayPrice | null;
  owners: string | null;
  points: number[];
};
export function TerminalHeader({
  records,
  onSelect,
  onConnect,
  walletSlot,
  page,
  networkLabel = "NEAR testnet",
}: {
  records: { id: string; name: string; collection: string }[];
  onSelect: (id: string) => void;
  onConnect: () => void;
  walletSlot?: ReactNode;
  page?: "explorer" | "positions" | "agent";
  networkLabel?: string;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0);
  const field = useRef<HTMLInputElement>(null),
    previousFocus = useRef<HTMLElement | null>(null),
    searchOpen = useRef(false),
    id = useId();
  function changeSearchOpen(next: boolean) {
    if (next && !searchOpen.current)
      previousFocus.current = document.activeElement as HTMLElement;
    searchOpen.current = next;
    setOpen(next);
  }
  const results = records.filter((r) =>
    `${r.name} ${r.collection} ${r.id}`
      .toLocaleLowerCase("fr")
      .includes(query.toLocaleLowerCase("fr")),
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        e.key.toLowerCase() === "k"
      ) {
        e.preventDefault();
        changeSearchOpen(true);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  function choose(index: number) {
    const item = results[index];
    if (!item) return;
    onSelect(item.id);
    changeSearchOpen(false);
  }
  return (
    <header className="ek-terminal-header">
      <div className="ek-terminal-nav">
        <a
          className="ek-terminal-brand"
          href={page ? "#explorer" : "/#explorer"}
          aria-label="Everkeep — application"
        >
          <span aria-hidden="true" />
        </a>
        <nav aria-label="Navigation principale">
          <a
            href={page ? "#explorer" : "#inventory"}
            aria-current={!page || page === "explorer" ? "page" : undefined}
          >
            Explorer
          </a>
          <a
            href={page ? "#positions" : "/#positions"}
            aria-current={page === "positions" ? "page" : undefined}
          >
            Positions
          </a>
          <a
            href={page ? "#agent" : "/#agent"}
            aria-current={page === "agent" ? "page" : undefined}
          >
            Agents
          </a>
        </nav>
        <div className="ek-header-search">
          <Dialog
            open={open}
            onOpenChange={changeSearchOpen}
            title={
              page ? "Rechercher dans Everkeep" : "Rechercher dans l’aperçu"
            }
            description={
              page
                ? "Modèles officiels et annonces vérifiées du catalogue. Sélectionnez un résultat pour examiner ses conditions."
                : "Spécimens d’interface uniquement. Aucun catalogue ni compte réel n’est interrogé."
            }
            trigger={
              <Button
                variant="ghost"
                icon={Search}
                aria-label={
                  page ? "Rechercher dans Everkeep" : "Rechercher dans l’aperçu"
                }
              >
                <span className="ek-search-label">Rechercher</span>
                <kbd>⌘ / Ctrl K</kbd>
              </Button>
            }
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              field.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              previousFocus.current?.focus();
            }}
          >
            <Input
              ref={field}
              label="Nom ou identifiant"
              icon={Search}
              role="combobox"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={id}
              aria-activedescendant={
                results[active] ? `${id}-${active}` : undefined
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((current) =>
                    results.length
                      ? (current +
                          (e.key === "ArrowDown" ? 1 : -1) +
                          results.length) %
                        results.length
                      : 0,
                  );
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  choose(active);
                }
              }}
            />
            <ul
              className="ek-search-results"
              id={id}
              role="listbox"
              aria-label="Résultats de recherche"
            >
              {results.map((r, i) => (
                <li
                  key={r.id}
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={active === i}
                  onPointerMove={() => setActive(i)}
                  onClick={() => choose(i)}
                >
                  <span>{r.name}</span>
                  <small>{r.collection}</small>
                  <ArrowUpRight aria-hidden="true" />
                </li>
              ))}
            </ul>
            {!results.length && (
              <p role="status" className="ek-muted">
                Aucun résultat. Essayez un autre nom.
              </p>
            )}
          </Dialog>
        </div>
        <div className="ek-network">
          <CircleDot aria-hidden="true" />
          <span>
            {networkLabel}
            <small>
              {page ? "Gas : estimation au wallet" : "Gas non connecté"}
            </small>
          </span>
        </div>
        {walletSlot || (
          <Button
            className="ek-connect"
            icon={Wallet}
            onClick={onConnect}
            aria-label="Connecter un wallet"
          >
            <span>Connecter un wallet</span>
          </Button>
        )}
      </div>
    </header>
  );
}

export function MarketTicker({
  rows,
}: {
  rows: {
    id: string;
    label: string;
    price: DisplayPrice | null;
    change: number | null;
  }[];
}) {
  return (
    <div className="ek-ticker-wrap">
      <span className="ek-ticker-origin">Flux simulé</span>
      <div
        className="ek-ticker"
        role="list"
        aria-label="Indicateurs de démonstration"
      >
        {rows.map((row) => (
          <div key={row.id} role="listitem">
            <strong>{row.label}</strong>
            <Price price={row.price} />
            <ChangeChip change={row.change} />
          </div>
        ))}
      </div>
    </div>
  );
}
export function SectionHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="ek-section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function TrendingTable({
  rows,
  sort,
  onSort,
  onSelect,
}: {
  rows: CollectionRow[];
  sort: { key: "floor" | "volume"; direction: "ascending" | "descending" };
  onSort: (key: "floor" | "volume") => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="ek-table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Collections : tableau défilant horizontalement"
    >
      <table className="ek-market-table">
        <caption>Collections · données synthétiques pour l’interface</caption>
        <thead>
          <tr>
            <th scope="col">Rang</th>
            <th scope="col">Collection</th>
            {(["floor", "volume"] as const).map((key, i) => (
              <th
                key={key}
                scope="col"
                aria-sort={sort.key === key ? sort.direction : "none"}
              >
                <button className="ek-table-sort" onClick={() => onSort(key)}>
                  {i ? "Volume 24 h" : "Prix plancher"}
                  {sort.key === key &&
                    (sort.direction === "ascending" ? (
                      <ArrowUp aria-hidden="true" />
                    ) : (
                      <ArrowDown aria-hidden="true" />
                    ))}
                </button>
              </th>
            ))}
            <th scope="col">24 h</th>
            <th scope="col">Propriétaires</th>
            <th scope="col">Tendance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id}>
              <td>
                <NumberText>{index + 1}</NumberText>
              </td>
              <th scope="row">
                <button
                  className="ek-collection-name"
                  onClick={() => onSelect(row.id)}
                >
                  <img src={row.art} width={48} height={48} alt="" />
                  <span>
                    {row.name}
                    <small>Spécimen UI</small>
                  </span>
                </button>
              </th>
              <td>
                <Price price={row.floor} />
              </td>
              <td>
                <Price price={row.volume} />
              </td>
              <td>
                <ChangeChip change={row.change} />
              </td>
              <td>
                <NumberText>{row.owners ?? "—"}</NumberText>
              </td>
              <td>
                <Sparkline
                  points={row.points}
                  label={`Historique illustratif de ${row.name}`}
                  tone={row.change !== null && row.change < 0 ? "down" : "up"}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CollectionStats({
  stats,
}: {
  stats: { label: string; value: string; unit?: string }[];
}) {
  return (
    <dl className="ek-stat-bar">
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt>{stat.label}</dt>
          <dd>
            <TickingNumber value={stat.value} />
            {stat.unit && <span>{stat.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function NFTCard({
  item,
  onOpen,
  onBuy,
  index = 0,
}: {
  item: MarketItem;
  onOpen: (item: MarketItem) => void;
  onBuy: (item: MarketItem) => void;
  index?: number;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <article
      className="ek-nft-card"
      aria-label={item.presentation ? item.name : `${item.name} — spécimen UI`}
      style={{ "--ek-card-index": Math.min(index, 3) } as React.CSSProperties}
    >
      <div className="ek-nft-art">
        <button
          className="ek-art-button"
          onClick={() => onOpen(item)}
          aria-label={`Voir ${item.name}`}
        >
          <CardFrame theme={item.theme} art={item.art} alt={item.alt} />
        </button>
        <IconButton
          className="ek-save"
          variant="secondary"
          label={
            saved
              ? `Retirer ${item.name} des favoris`
              : `Ajouter ${item.name} aux favoris`
          }
          icon={Heart}
          aria-pressed={saved}
          onClick={() => setSaved(!saved)}
        />
      </div>
      <div className="ek-nft-footer">
        <span className="ek-nft-collection">{item.collection}</span>
        <button className="ek-nft-title" onClick={() => onOpen(item)}>
          {item.name}
        </button>
        <div className="ek-nft-price">
          <span>
            {item.price ? (
              <Price price={item.price} />
            ) : (
              item.presentation?.priceLabel || "Pas d’annonce"
            )}
          </span>
          <Badge>{item.presentation?.badge || "Spécimen UI"}</Badge>
        </div>
        <span className="ek-nft-last">
          {item.presentation ? (
            item.presentation.note
          ) : (
            <>
              Dernière vente :{" "}
              {item.lastSale ? (
                <Price price={item.lastSale} />
              ) : (
                "aucune donnée"
              )}
            </>
          )}
        </span>
        <Button
          className="ek-quick-buy"
          variant={item.available ? "primary" : "secondary"}
          disabled={!item.available}
          onClick={() => onBuy(item)}
        >
          {item.available
            ? item.presentation?.actionLabel || "Examiner l’achat"
            : item.presentation?.unavailableLabel || "Indisponible"}
        </Button>
      </div>
    </article>
  );
}
export type InventoryState = {
  query: string;
  categories: string[];
  availableOnly: boolean;
  filtersOpen: boolean;
  view: "grid" | "list";
  density: "comfortable" | "compact";
  sort: "recent" | "price";
};
export function Inventory({
  items,
  state,
  onChange,
  onOpen,
  onBuy,
  status = "ready",
  onRetry,
}: {
  items: MarketItem[];
  state: InventoryState;
  onChange: (state: InventoryState) => void;
  onOpen: (item: MarketItem) => void;
  onBuy: (item: MarketItem) => void;
  status?: "ready" | "loading" | "error";
  onRetry: () => void;
}) {
  const id = useId();
  const patch = (next: Partial<InventoryState>) =>
    onChange({ ...state, ...next });
  return (
    <div
      className="ek-inventory"
      data-view={state.view}
      data-density={state.density}
    >
      <div className="ek-inventory-toolbar">
        <Button
          icon={SlidersHorizontal}
          aria-expanded={state.filtersOpen}
          aria-controls={id}
          onClick={() => patch({ filtersOpen: !state.filtersOpen })}
        >
          Filtres
          {state.categories.length > 0 && (
            <NumberText>{state.categories.length}</NumberText>
          )}
        </Button>
        <Input
          label="Filtrer l’inventaire"
          icon={Search}
          type="search"
          placeholder="Rechercher une position…"
          value={state.query}
          onChange={(e) => patch({ query: e.target.value })}
        />
        <div
          className="ek-view-controls"
          role="group"
          aria-label="Présentation de l’inventaire"
        >
          <IconButton
            label="Vue grille"
            icon={LayoutGrid}
            aria-pressed={state.view === "grid"}
            onClick={() => patch({ view: "grid" })}
          />
          <IconButton
            label="Vue liste"
            icon={List}
            aria-pressed={state.view === "list"}
            onClick={() => patch({ view: "list" })}
          />
        </div>
        <Select
          label="Densité"
          value={state.density}
          onChange={(e) =>
            patch({ density: e.target.value as InventoryState["density"] })
          }
        >
          <option value="comfortable">Confortable</option>
          <option value="compact">Compacte</option>
        </Select>
        <Select
          label="Tri de l’inventaire"
          value={state.sort}
          onChange={(e) =>
            patch({ sort: e.target.value as InventoryState["sort"] })
          }
        >
          <option value="recent">Plus récents</option>
          <option value="price">Prix croissant</option>
        </Select>
      </div>
      <div
        className={`ek-inventory-body${state.filtersOpen ? " has-filters" : ""}`}
      >
        {state.filtersOpen && (
          <aside
            id={id}
            className="ek-filter-sidebar"
            aria-label="Filtres des positions"
          >
            <div>
              <h3>Catégories</h3>
              <IconButton
                variant="ghost"
                label="Fermer les filtres"
                icon={X}
                onClick={() => patch({ filtersOpen: false })}
              />
            </div>
            {["Liquidité", "Diversification", "Crypto"].map((category) => (
              <Checkbox
                key={category}
                label={category}
                checked={state.categories.includes(category)}
                onChange={(e) =>
                  patch({
                    categories: e.target.checked
                      ? [...state.categories, category]
                      : state.categories.filter((c) => c !== category),
                  })
                }
              />
            ))}
            <Checkbox
              label="Disponibles uniquement"
              checked={state.availableOnly}
              onChange={(e) => patch({ availableOnly: e.target.checked })}
            />
            <Button
              variant="ghost"
              onClick={() =>
                patch({ query: "", categories: [], availableOnly: false })
              }
            >
              Effacer les filtres
            </Button>
          </aside>
        )}
        <div className="ek-inventory-content" aria-busy={status === "loading"}>
          {status === "loading" ? (
            <div className="ek-card-grid ek-inventory-loading">
              {[0, 1, 2].map((n) => (
                <div key={n} className="ek-nft-skeleton">
                  <div className="ek-art-skeleton" />
                  <Skeleton label="Chargement d’une position" />
                </div>
              ))}
            </div>
          ) : status === "error" ? (
            <Notice tone="error" title="Inventaire indisponible">
              <p>La lecture a échoué. Aucun achat n’a été envoyé.</p>
              <Button onClick={onRetry}>Réessayer la lecture</Button>
            </Notice>
          ) : !items.length ? (
            <Notice title="Aucune position ne correspond">
              <p>Retirez une catégorie ou effacez votre recherche.</p>
              <Button
                onClick={() =>
                  patch({ query: "", categories: [], availableOnly: false })
                }
              >
                Réinitialiser l’inventaire
              </Button>
            </Notice>
          ) : (
            <div className="ek-card-grid">
              {items.map((item, index) => (
                <NFTCard
                  key={item.id}
                  item={item}
                  index={index}
                  onOpen={onOpen}
                  onBuy={onBuy}
                />
              ))}
            </div>
          )}
          <p className="ek-inventory-count" role="status">
            {status === "loading"
              ? "Lecture en cours…"
              : status === "error"
                ? "Lecture interrompue."
                : `${items.length} spécimen${items.length > 1 ? "s" : ""} affiché${items.length > 1 ? "s" : ""}. Aucune annonce réelle dans cet aperçu.`}
          </p>
        </div>
      </div>
    </div>
  );
}

export type HistoryPoint = { label: string; value: number };
export function PriceHistory({
  points,
  unit,
  period,
  onPeriodChange,
}: {
  points: HistoryPoint[];
  unit: string;
  period: string;
  onPeriodChange: (period: string) => void;
}) {
  const id = useId();
  if (points.length < 2)
    return (
      <Notice title="Historique indisponible">
        Aucune série de prix à afficher. Aucun point n’est estimé.
      </Notice>
    );
  return (
    <section className="ek-price-history" aria-labelledby={id}>
      <div className="ek-chart-heading">
        <h3 id={id}>Historique du prix</h3>
        <div role="group" aria-label="Période du graphique">
          {["7 j", "30 j"].map((p) => (
            <Button
              key={p}
              variant="ghost"
              aria-pressed={period === p}
              onClick={() => onPeriodChange(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>
      <p className="ek-muted ek-small">
        Données synthétiques · {unit}. Flèches gauche/droite pour lire les
        valeurs.
      </p>
      <div className="ek-history-chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart
            data={points}
            accessibilityLayer
            aria-label="Prix illustratif en demoUSD"
            margin={{
              top: Number.parseFloat(tokens.tokens.space["2"]),
              right: Number.parseFloat(tokens.tokens.space["4"]),
              left: 0,
              bottom: 0,
            }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis
              dataKey="label"
              tick={{
                fill: "var(--color-muted)",
                fontFamily: "var(--font-numeric)",
                fontSize: "var(--type-xs)",
              }}
              axisLine={false}
              tickLine={false}
              minTickGap={Number.parseFloat(tokens.tokens.space["8"])}
            />
            <YAxis domain={[0, "dataMax"]} hide />
            <ChartTooltip
              isAnimationActive={false}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="ek-ui ek-chart-tooltip">
                    <span>{String(label)}</span>
                    <NumberText>
                      {String(payload[0].value)} {unit}
                    </NumberText>
                  </div>
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey="value"
              name={`Prix (${unit})`}
              stroke="var(--color-brand)"
              strokeWidth={Number.parseFloat(tokens.tokens.stroke.focus)}
              fill="var(--color-brand-glow)"
              isAnimationActive={false}
              dot={false}
              activeDot={{
                r: Number.parseFloat(tokens.tokens.space["1"]),
                fill: "var(--color-brand)",
                stroke: "var(--color-bg)",
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className="ek-chart-data">
        <summary>Lire les données du graphique</summary>
        <table>
          <caption>Valeurs synthétiques, sans historique de vente réel</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Prix ({unit})</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.label}>
                <th scope="row">{point.label}</th>
                <td>
                  <NumberText>
                    {new Intl.NumberFormat("fr-FR", {
                      maximumFractionDigits: 2,
                    }).format(point.value)}
                  </NumberText>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
export function TradePanel({
  price,
  onBuy,
  onOffer,
  disabled = false,
}: {
  price: DisplayPrice;
  onBuy: () => void;
  onOffer: () => void;
  disabled?: boolean;
}) {
  return (
    <section
      className="ek-trade-panel"
      aria-label="Actions sur une position — exemple"
    >
      <h3>Prix affiché</h3>
      <div className="ek-trade-price">
        <Price price={price} />
      </div>
      <Badge>Spécimen UI</Badge>
      <p>
        Le prix d’une revente est distinct du capital détenu par la position.
      </p>
      <Button variant="primary" disabled={disabled} onClick={onBuy}>
        Examiner l’achat
      </Button>
      <Button disabled={disabled} onClick={onOffer}>
        Faire une offre
      </Button>
      <span className="ek-small ek-muted">
        Aucun achat ni offre n’est envoyé depuis cette référence.
      </span>
    </section>
  );
}
export function TraitsGrid({
  traits,
}: {
  traits: { name: string; value: string; rarity: string }[];
}) {
  return (
    <dl className="ek-traits">
      {traits.map((trait) => (
        <div key={trait.name}>
          <dt>{trait.name}</dt>
          <dd>
            {trait.value}
            <small>
              <NumberText>{trait.rarity}</NumberText> · fréquence illustrative
            </small>
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function ActivityTable({
  rows,
}: {
  rows: { id: string; event: string; amount: DisplayPrice; date: string }[];
}) {
  return (
    <div
      className="ek-table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Activité illustrative"
    >
      <table className="ek-activity-table">
        <caption>Spécimens d’activité · aucune transaction réelle</caption>
        <thead>
          <tr>
            <th scope="col">Événement</th>
            <th scope="col">Montant</th>
            <th scope="col">Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.event}</th>
              <td>
                <Price price={row.amount} />
              </td>
              <td>
                <NumberText>{row.date}</NumberText>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
