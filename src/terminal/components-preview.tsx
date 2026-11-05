import { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Code2,
  RefreshCw,
} from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  Input,
  Notice,
  NumberText,
  Select,
  Tabs,
} from "./primitives";
import { CardFrame } from "./CardFrame";
import { parseCardTheme } from "./card-theme";
import { ChangeChip, Price, type CardQuote } from "./market-metrics";
import {
  ActivityTable,
  CollectionStats,
  Inventory,
  MarketTicker,
  PriceHistory,
  SectionHeading,
  TerminalHeader,
  TradePanel,
  TraitsGrid,
  TrendingTable,
  type MarketItem,
} from "./market-components";
import {
  cardThemes,
  fixtureCollections,
  fixtureFloorOrder,
  fixtureHistory,
  fixtureItems,
  fixturePriceOrder,
  fixtureVolumeOrder,
  initialInventory,
} from "./demo-fixtures";

function Preview() {
  const opener = useRef<HTMLElement | null>(null);
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    opener.current?.focus();
  };
  const [inventory, setInventory] = useState(initialInventory);
  const [sort, setSort] = useState<{
    key: "floor" | "volume";
    direction: "ascending" | "descending";
  }>({ key: "volume", direction: "descending" });
  const [status, setStatus] = useState<"ready" | "loading" | "error">("ready");
  const [selected, setSelected] = useState<MarketItem | null>(null),
    [review, setReview] = useState(false);
  const [feedback, setFeedback] = useState(
    "Les actions de cet aperçu ne sollicitent aucun wallet.",
  );
  const [material, setMaterial] = useState("live"),
    [theme, setTheme] = useState(cardThemes.live);
  const [json, setJson] = useState(JSON.stringify(cardThemes.live, null, 2)),
    [themeError, setThemeError] = useState("");
  const [period, setPeriod] = useState("30 j"),
    [offer, setOffer] = useState(false),
    [offerValue, setOfferValue] = useState("");
  const [quote, setQuote] = useState<CardQuote>({
    price: { value: "11,00", unit: "demoUSD" },
    change: 2.8,
    points: [8.5, 9, 8.7, 9.4, 9.8, 10.5, 10.4, 11],
    source: "simulation",
    observedAt: "2026-11-04T12:00:00Z",
    revision: 0,
  });
  const rows = useMemo(
    () =>
      [...fixtureCollections].sort((a, b) => {
        const order =
          sort.key === "floor" ? fixtureFloorOrder : fixtureVolumeOrder;
        return (
          (order[a.id] - order[b.id]) *
          (sort.direction === "ascending" ? 1 : -1)
        );
      }),
    [sort],
  );
  const items = useMemo(
    () =>
      fixtureItems
        .filter(
          (item) =>
            `${item.name} ${item.collection} ${item.id}`
              .toLocaleLowerCase("fr")
              .includes(inventory.query.toLocaleLowerCase("fr")) &&
            (!inventory.categories.length ||
              inventory.categories.includes(item.category)) &&
            (!inventory.availableOnly || item.available),
        )
        .sort((a, b) =>
          inventory.sort === "price"
            ? fixturePriceOrder[a.id] - fixturePriceOrder[b.id]
            : 0,
        ),
    [inventory],
  );
  function pick(id: string) {
    const item = fixtureItems.find((i) => i.id === id);
    if (item) {
      setSelected(item);
      setFeedback(
        `${item.name} sélectionné. Les métadonnées sont présentées dans le suivi de l’aperçu.`,
      );
    }
  }
  function buy(item: MarketItem) {
    opener.current = document.activeElement as HTMLElement;
    setSelected(item);
    setReview(true);
  }
  function simulate(up: boolean) {
    setQuote((q) => ({
      ...q,
      price: { value: up ? "11,40" : "10,60", unit: "demoUSD" },
      change: up ? 3.64 : -3.64,
      points: up
        ? [8.5, 9, 8.7, 9.4, 9.8, 10.5, 10.4, 11.4]
        : [11.4, 11, 11.2, 10.8, 11, 10.7, 10.8, 10.6],
      revision: q.revision + 1,
    }));
  }
  const offerValid =
    /^\d+([.,]\d+)?$/.test(offerValue) &&
    Number(offerValue.replace(",", ".")) > 0;
  return (
    <div className="ek-ui ek-components-page">
      <a className="ek-terminal-skip" href="#main">
        Aller aux composants
      </a>
      <TerminalHeader
        records={fixtureItems}
        onSelect={pick}
        onConnect={() =>
          setFeedback(
            "Connexion demandée dans l’aperçu. Pour utiliser votre wallet, ouvrez l’application Everkeep via le logo.",
          )
        }
      />
      <MarketTicker
        rows={fixtureCollections.map((row, index) => ({
          id: row.id,
          label: row.name,
          price: index === 0 ? quote.price : row.floor,
          change: index === 0 ? quote.change : row.change,
        }))}
      />
      <main id="main" className="ek-components-main">
        <div className="ek-components-intro">
          <h1>
            La place de marché
            <br />
            prend forme.
          </h1>
          <p>
            Étape 3 sur 4 : des composants interactifs pour explorer des
            positions NFT sur NEAR.
          </p>
          <div>
            <Badge tone="brand" icon={Check}>
              Tokens et primitives validés
            </Badge>
            <span>
              Référence UI · données synthétiques · aucune transaction
            </span>
          </div>
          <a href="/design/primitives.html">
            Revoir les primitives
            <ArrowRight aria-hidden="true" />
          </a>
        </div>
        <output className="ek-reference-feedback" aria-live="polite">
          {feedback}
          {selected && (
            <span>
              {" "}
              Sélection : {selected.name} ·{" "}
              <NumberText>{selected.id}</NumberText>.
            </span>
          )}
        </output>
        <section
          className="ek-reference-section"
          id="collections"
          aria-label="Composant collections en tendance"
        >
          <SectionHeading
            title="Collections en tendance"
            description="Prix, variations et activité regroupés pour comparer. Ces trois lignes sont des spécimens, pas un classement réel."
          >
            <Badge>Spécimens UI</Badge>
          </SectionHeading>
          <TrendingTable
            rows={rows}
            sort={sort}
            onSort={(key) =>
              setSort((s) => ({
                key,
                direction:
                  s.key === key && s.direction === "ascending"
                    ? "descending"
                    : "ascending",
              }))
            }
            onSelect={pick}
          />
        </section>
        <section
          className="ek-reference-section"
          id="inventory"
          aria-label="Composant inventaire"
        >
          <SectionHeading
            title="Explorer les positions"
            description="Recherche, filtres et densité pour passer de la découverte à la comparaison."
          >
            <Select
              label="État de l’aperçu"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="ready">Données disponibles</option>
              <option value="loading">Chargement</option>
              <option value="error">Erreur de lecture</option>
            </Select>
          </SectionHeading>
          <CollectionStats
            stats={[
              {
                label: "Plancher illustratif",
                value: "11,00",
                unit: "demoUSD",
              },
              {
                label: "Volume illustratif · 24 h",
                value: "284,00",
                unit: "demoUSD",
              },
              { label: "Propriétaires (exemple)", value: "24" },
              { label: "Items (exemple)", value: "36" },
            ]}
          />
          <Inventory
            items={items}
            state={inventory}
            onChange={setInventory}
            onOpen={(item) => {
              setSelected(item);
              setFeedback(
                `Fiche demandée : ${item.name}. Le détail complet sera intégré à l’étape des pages.`,
              );
            }}
            onBuy={buy}
            status={status}
            onRetry={() => setStatus("ready")}
          />
        </section>
        <section
          className="ek-reference-section"
          id="frames"
          aria-label="Laboratoire de cartes spéciales"
        >
          <SectionHeading
            title="Un cadre, plusieurs matières"
            description="Mat, métal brossé, film holographique ou réaction au flux. L’apparence reste indépendante des actifs et des droits du NFT."
          />
          <div className="ek-frame-lab">
            <div className="ek-frame-controls">
              <Select
                label="Matière de la carte"
                value={material}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!cardThemes[id]) return;
                  setMaterial(id);
                  setTheme(cardThemes[id]);
                  setJson(JSON.stringify(cardThemes[id], null, 2));
                  setThemeError("");
                }}
              >
                <option value="matte">Mat · Standard</option>
                <option value="metal">Métal brossé · Rare</option>
                <option value="holo">Holographique · Épique</option>
                <option value="live">Réactif au flux · Légendaire</option>
                {material === "custom" && (
                  <option value="custom" disabled>
                    Thème personnalisé
                  </option>
                )}
              </Select>
              <p>
                Sur ordinateur, déplacez le pointeur sur la carte. Les calques
                suivent des profondeurs distinctes. Sur écran tactile et en
                mouvement réduit, la carte reste stable.
              </p>
              <div className="ek-demo-quote">
                <span>Dernière valeur simulée</span>
                <Price price={quote.price} />
                <ChangeChip change={quote.change} />
              </div>
              <div className="ek-inline-actions">
                <Button icon={ArrowUpRight} onClick={() => simulate(true)}>
                  Simuler une hausse
                </Button>
                <Button icon={ArrowDownRight} onClick={() => simulate(false)}>
                  Simuler une baisse
                </Button>
              </div>
              <p className="ek-small ek-muted">
                Chaque mise à jour fait réagir le cadre une seule fois. Aucun
                flux de marché n’est connecté. Les niveaux de rareté sont des
                styles visuels illustratifs.
              </p>
              <details className="ek-theme-editor">
                <summary>
                  <Code2 aria-hidden="true" />
                  Personnaliser le thème JSON
                </summary>
                <label htmlFor="card-theme-json">Configuration du cadre</label>
                <textarea
                  className="ek-input"
                  id="card-theme-json"
                  spellCheck={false}
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  aria-invalid={!!themeError}
                  aria-describedby={
                    themeError
                      ? "card-theme-error card-theme-hint"
                      : "card-theme-hint"
                  }
                />
                <p id="card-theme-hint">
                  Palette limitée aux tokens ; calques locaux. Une erreur
                  conserve le dernier thème valide.
                </p>
                <Button
                  onClick={() => {
                    try {
                      const parsed = parseCardTheme(JSON.parse(json));
                      setTheme(parsed);
                      setThemeError("");
                      setMaterial("custom");
                    } catch (e) {
                      setThemeError(
                        e instanceof SyntaxError
                          ? "JSON invalide : vérifiez les guillemets et les virgules."
                          : e instanceof Error
                            ? e.message
                            : "JSON invalide.",
                      );
                    }
                  }}
                >
                  Appliquer le thème
                </Button>
                {themeError && (
                  <div id="card-theme-error">
                    <Notice tone="error" title="Thème non appliqué">
                      {themeError}
                    </Notice>
                  </div>
                )}
              </details>
            </div>
            <div className="ek-frame-showcase">
              <CardFrame
                theme={theme}
                art="/art/catalogue/liquidity.svg"
                alt="Carte spéciale Orbite : paysage géométrique vert et anneaux en trois calques."
                quote={quote}
              />
              <div>
                <strong>Orbite / spécimen</strong>
                <Badge>{theme.rarity}</Badge>
              </div>
              <span className="ek-small ek-muted">
                Illustrations originales Everkeep · aucun avantage financier lié
                au cadre.
              </span>
            </div>
          </div>
        </section>
        <section
          className="ek-reference-section"
          id="details"
          aria-label="Composants prix et activité"
        >
          <SectionHeading
            title="Examiner avant d’agir"
            description="Un prix lisible, son historique et les informations utiles avant d’ouvrir le parcours d’achat."
          />
          <div className="ek-detail-layout">
            <div>
              <PriceHistory
                points={
                  period === "7 j" ? fixtureHistory.slice(-4) : fixtureHistory
                }
                unit="demoUSD"
                period={period}
                onPeriodChange={setPeriod}
              />
              <Tabs
                label="Informations du spécimen"
                items={[
                  {
                    id: "traits",
                    label: "Propriétés",
                    content: (
                      <TraitsGrid
                        traits={[
                          { name: "Matière", value: "Mat", rarity: "50 %" },
                          { name: "Motif", value: "Orbite", rarity: "25 %" },
                          {
                            name: "Édition",
                            value: "Étude UI",
                            rarity: "100 %",
                          },
                        ]}
                      />
                    ),
                  },
                  {
                    id: "activity",
                    label: "Activité",
                    content: (
                      <ActivityTable
                        rows={[
                          {
                            id: "e1",
                            event: "Mise en vente (exemple)",
                            amount: { value: "11,00", unit: "demoUSD" },
                            date: "04 nov. · 12:00",
                          },
                          {
                            id: "e2",
                            event: "Vente (exemple)",
                            amount: { value: "10,40", unit: "demoUSD" },
                            date: "03 nov. · 16:20",
                          },
                        ]}
                      />
                    ),
                  },
                ]}
              />
            </div>
            <TradePanel
              price={fixtureItems[0].price!}
              onBuy={() => buy(fixtureItems[0])}
              onOffer={() => {
                opener.current = document.activeElement as HTMLElement;
                setOffer(true);
              }}
            />
          </div>
        </section>
        <footer className="ek-components-footer">
          <p>Everkeep · Composants composés · étape 3</p>
          <p>
            La prochaine étape intègre ces blocs aux pages et aux parcours
            existants après validation.
          </p>
          <a href="/#explorer">
            Ouvrir l’application existante
            <ArrowRight aria-hidden="true" />
          </a>
        </footer>
      </main>
      <Dialog
        open={review}
        onOpenChange={setReview}
        onCloseAutoFocus={restoreFocus}
        title="Examiner le spécimen"
        description="Ce récapitulatif teste l’interface. Aucun achat ni signature n’est envoyé."
        footer={
          <Button onClick={() => setReview(false)}>
            Fermer le récapitulatif
          </Button>
        }
      >
        {selected && (
          <>
            <strong>{selected.name}</strong>
            {selected.price && <Price price={selected.price} />}
            <p className="ek-muted">
              Les contrats, les frais et les autorisations seront reliés au
              parcours existant à l’étape 4.
            </p>
          </>
        )}
      </Dialog>
      <Dialog
        open={offer}
        onOpenChange={setOffer}
        onCloseAutoFocus={restoreFocus}
        title="Préparer une offre — exemple"
        description="Les offres ne sont pas actives dans la marketplace existante. Cet exemple vérifie uniquement la saisie."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOffer(false)}>
              Annuler
            </Button>
            <Button
              disabled={!offerValid}
              onClick={() => {
                setOffer(false);
                setFeedback(
                  "Montant d’offre vérifié dans l’aperçu. Aucune offre envoyée.",
                );
              }}
            >
              Vérifier le montant
            </Button>
          </>
        }
      >
        <Input
          label="Montant proposé (demoUSD)"
          inputMode="decimal"
          value={offerValue}
          onChange={(e) => setOfferValue(e.target.value)}
          hint="Aucune offre ne sera envoyée."
          error={
            offerValue && !offerValid
              ? "Saisissez un montant supérieur à zéro."
              : undefined
          }
        />
      </Dialog>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
