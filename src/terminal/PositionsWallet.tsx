import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../../packages/shared/index";
import type { SeriesState } from "../../packages/shared/series-state";
import { TESTNET, type WalletBalances } from "../../packages/shared/network";
import { displayAmount } from "../../packages/shared/ui";
import { currentDeployment, readWalletBalances } from "../testnet-network";
import { catalogueEditorial } from "../../packages/shared/catalogue";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Copy,
  Search,
  Wallet,
  Layers,
  BookOpen,
} from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Notice,
  NumberText,
  Skeleton,
} from "./primitives";
import { CardFrame } from "./CardFrame";
import { parseCardTheme } from "./card-theme";
import themes from "../../design-system/terminal/card-themes.json";
import { ownedAssetTotals, positionPresentation } from "./owned-positions";

export function PositionsWallet({
  owner,
  data,
}: {
  owner: string;
  data: SeriesState;
}) {
  const [state, setState] = useState<{
    owner: string;
    balance: WalletBalances | null;
    error: string;
    loading: boolean;
  }>({ owner: "", balance: null, error: "", loading: true });
  const [refresh, setRefresh] = useState(0),
    [receiving, setReceiving] = useState(false),
    [copied, setCopied] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const update = () => setRefresh((v) => v + 1);
    window.addEventListener("everkeep-balances", update);
    return () => window.removeEventListener("everkeep-balances", update);
  }, []);
  useEffect(() => {
    const ticket = ++generation.current;
    setState({ owner, balance: null, error: "", loading: true });
    setCopied(false);
    void readWalletBalances(owner)
      .then((balance) => {
        if (ticket === generation.current)
          setState({ owner, balance, error: "", loading: false });
      })
      .catch((error) => {
        if (ticket === generation.current)
          setState({
            owner,
            balance: null,
            error: String(error),
            loading: false,
          });
      });
    return () => {
      generation.current++;
    };
  }, [owner, data.now, refresh]);
  const balance = state.owner === owner ? state.balance : null;
  const nearShort = balance
    ? displayAmount((BigInt(balance.nearBalance) / 10n ** 20n).toString(), 4)
    : "";
  const nearApproximate = balance
    ? BigInt(balance.nearBalance) % 10n ** 20n !== 0n
    : false;
  const deployment = currentDeployment(),
    totals = ownedAssetTotals(data, owner);
  return (
    <section className="ek-wallet-overview" aria-label="Soldes du wallet">
      <div className="ek-wallet-account">
        <div>
          <Wallet aria-hidden="true" />
          <h2>Dans votre wallet</h2>
        </div>
        <Badge>NEAR testnet</Badge>
        <p className="wallet-address">{owner}</p>
        <div className="ek-inline-actions">
          <Button
            icon={ArrowDownToLine}
            aria-expanded={receiving}
            aria-controls="wallet-receive"
            onClick={() => setReceiving(!receiving)}
          >
            Recevoir
          </Button>
          <Button
            icon={copied ? Check : Copy}
            onClick={() =>
              void navigator.clipboard
                .writeText(owner)
                .then(() => setCopied(true))
                .catch(() => setCopied(false))
            }
          >
            {copied ? "Adresse copiée" : "Copier l’adresse"}
          </Button>
          <a
            className="ek-wallet-explorer"
            href={TESTNET.explorer + "/address/" + owner}
            target="_blank"
            rel="noreferrer"
          >
            Voir sur NEAR <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
        <span className="ek-sr-only" role="status">
          {copied ? "Adresse publique copiée." : ""}
        </span>
      </div>
      {receiving && (
        <div id="wallet-receive" className="ek-wallet-receive">
          <h3>Recevoir sur NEAR testnet</h3>
          <p>
            Utilisez cette adresse publique uniquement sur le réseau de test. Le
            dépôt dans une position NFT se fait séparément depuis Explorer.
          </p>
          <code>{owner}</code>
        </div>
      )}
      {state.loading || state.owner !== owner ? (
        <div className="ek-wallet-skeletons">
          <Skeleton label="Lecture du solde demoUSD" />
          <Skeleton label="Lecture du solde NEAR" />
        </div>
      ) : !balance ? (
        <Notice title="Soldes du wallet indisponibles" tone="error">
          <p>Aucun montant n’est supposé. Réessayez la lecture du réseau.</p>
          <Button onClick={() => setRefresh((v) => v + 1)}>
            Relire les soldes
          </Button>
        </Notice>
      ) : (
        <div className="ek-token-balances">
          <div>
            <span>demoUSD dans le wallet</span>
            <strong>
              <NumberText>
                {balance.asset
                  ? displayAmount(balance.demoUSD)
                  : "Indisponible"}
              </NumberText>
              {balance.asset && <small>demoUSD</small>}
            </strong>
            <span>Jeton de test · aucune valeur dollar</span>
          </div>
          <div>
            <span>NEAR dans le wallet</span>
            <strong>
              <NumberText>
                {nearApproximate ? "≈ " : ""}
                {nearShort}
              </NumberText>
              <small>NEAR</small>
            </strong>
            <span>Frais et stockage du réseau de test</span>
            <details className="ek-wallet-exact">
              <summary>Montant exact en NEAR</summary>
              <NumberText>
                {displayAmount(balance.nearBalance, 24)} NEAR
              </NumberText>
            </details>
          </div>
        </div>
      )}
      <div className="ek-position-asset-table">
        <h3>Actifs dans vos positions</h3>
        <p>
          Ces fonds appartiennent aux comptes NFT. Ils sont séparés du solde de
          votre wallet.
        </p>
        {totals.length ? (
          <div
            className="ek-owned-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Actifs dans les comptes de position"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Actif</th>
                  <th scope="col">Dans les positions</th>
                  <th scope="col">Retirable maintenant</th>
                  <th scope="col">NFT</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((row) => {
                  const known = row.asset === deployment?.asset;
                  return (
                    <tr key={row.asset}>
                      <th scope="row">
                        {known ? (
                          "demoUSD"
                        ) : (
                          <span className="wallet-address">{row.asset}</span>
                        )}
                        <small>
                          {known
                            ? "Jeton de démonstration"
                            : "Actif historique · unités brutes"}
                        </small>
                      </th>
                      <td>
                        <span
                          className="ek-owned-cell-label"
                          aria-hidden="true"
                        >
                          Dans les positions
                        </span>
                        <NumberText>
                          {known
                            ? displayAmount(row.total.toString())
                            : row.total.toString()}
                        </NumberText>
                      </td>
                      <td>
                        <span
                          className="ek-owned-cell-label"
                          aria-hidden="true"
                        >
                          Retirable maintenant
                        </span>
                        <NumberText>
                          {known
                            ? displayAmount(row.withdrawable.toString())
                            : row.withdrawable.toString()}
                        </NumberText>
                      </td>
                      <td>
                        <span
                          className="ek-owned-cell-label"
                          aria-hidden="true"
                        >
                          NFT
                        </span>
                        <NumberText>{row.count}</NumberText>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Aucun actif dans une position financée pour ce wallet.</p>
        )}
      </div>
    </section>
  );
}

export function PositionsViewSwitch({
  value,
  onChange,
  count,
}: {
  value: string;
  onChange: (value: string) => void;
  count: number;
}) {
  const options = [
    { id: "assets", label: "Actifs", icon: Layers },
    { id: "collection", label: "Collection", icon: BookOpen },
  ];
  return (
    <div
      className="ek-owned-view-tabs"
      role="tablist"
      aria-label="Vue du portefeuille"
      onKeyDown={(event) => {
        if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const next =
          event.key === "Home"
            ? "assets"
            : event.key === "End"
              ? "collection"
              : value === "assets"
                ? "collection"
                : "assets";
        onChange(next);
        event.currentTarget
          .querySelector<HTMLButtonElement>(`[data-view="${next}"]`)
          ?.focus();
      }}
    >
      {options.map((option) => (
        <button
          key={option.id}
          id={"owned-tab-" + option.id}
          data-view={option.id}
          role="tab"
          aria-selected={value === option.id}
          aria-controls="owned-view-panel"
          tabIndex={value === option.id ? 0 : -1}
          onClick={() => onChange(option.id)}
        >
          <option.icon aria-hidden="true" />
          {option.label}
          {option.id === "collection" && <NumberText>{count}</NumberText>}
        </button>
      ))}
    </div>
  );
}

export function OwnedCollection({
  positions,
  data,
  selected,
  onOpen,
}: {
  positions: Snapshot[];
  data: SeriesState;
  selected: string;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const deployment = currentDeployment();
  const normalized = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  const filtered = positions.filter((position) => {
    const state = positionPresentation(position, data);
    const known =
      position.collection_id === deployment?.collection &&
      position.series?.mandate_hash === deployment.mandate_hash;
    return (
      (filter === "all" ||
        (filter === "sale" ? state.listed : BigInt(state.withdrawable) > 0n)) &&
      normalized(
        `${position.account_id} ${position.collection_id} ${known ? "Réserve demoUSD" : "Position historique"}`,
      ).includes(normalized(query).trim())
    );
  });
  return (
    <section className="ek-owned-collection" aria-label="Cartes possédées">
      <div className="ek-section-heading">
        <div>
          <h2>Votre collection</h2>
          <p>
            {positions.length} carte{positions.length > 1 ? "s" : ""} possédée
            {positions.length > 1 ? "s" : ""}. Chaque carte ouvre le compte de
            sa position.
          </p>
        </div>
        <Badge>Propriétaire vérifié</Badge>
      </div>
      <div className="ek-collection-toolbar">
        <Input
          icon={Search}
          type="search"
          label="Rechercher dans mes cartes"
          placeholder="Nom ou compte NFT…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div role="group" aria-label="Filtrer mes cartes">
          {[
            ["all", "Toutes"],
            ["available", "Retrait possible"],
            ["sale", "En vente"],
          ].map(([id, label]) => (
            <Button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {!filtered.length ? (
        <Notice
          title={
            positions.length
              ? "Aucune carte dans cette sélection"
              : "Votre collection commence ici"
          }
        >
          <p>
            {positions.length
              ? "Essayez un autre nom ou réinitialisez les filtres."
              : "Créez ou achetez une position dans Explorer pour retrouver sa carte ici."}
          </p>
          {positions.length ? (
            <Button
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Réinitialiser la collection
            </Button>
          ) : (
            <a href="#explorer">Explorer les positions</a>
          )}
        </Notice>
      ) : (
        <div className="ek-owned-card-grid">
          {filtered.map((position) => {
            const state = positionPresentation(position, data),
              known =
                position.collection_id === deployment?.collection &&
                position.series?.mandate_hash === deployment.mandate_hash;
            return (
              <article
                key={position.account_id}
                className="ek-owned-card"
                data-selected={selected === position.account_id || undefined}
              >
                <button
                  className="ek-owned-art"
                  aria-label={"Consulter la carte " + position.account_id}
                  onClick={() => onOpen(position.account_id)}
                >
                  <CardFrame
                    theme={parseCardTheme(themes.metal)}
                    art={catalogueEditorial.liquidity.visual.src}
                    alt="Illustration orbitale de la position. Le visuel ne représente pas les actifs détenus."
                  />
                </button>
                <div className="ek-owned-card-info">
                  <Badge>{state.status}</Badge>
                  <h3>{known ? "Réserve demoUSD" : "Position historique"}</h3>
                  <p className="ek-owned-identifier">
                    {position.account_id.split(".")[0]}
                  </p>
                  <dl>
                    <div>
                      <dt>Actifs du compte</dt>
                      <dd>
                        <NumberText>
                          {known ? displayAmount(state.total) : state.total}
                        </NumberText>{" "}
                        {known ? "demoUSD" : "unités brutes"}
                      </dd>
                    </div>
                    <div>
                      <dt>Échéance</dt>
                      <dd>
                        {position.series
                          ? new Date(
                              Number(
                                BigInt(position.series.terms.matures_at) /
                                  1_000_000n,
                              ),
                            ).toLocaleDateString("fr-FR")
                          : "Sans échéance contractuelle"}
                      </dd>
                    </div>
                  </dl>
                  <Button
                    onClick={() => onOpen(position.account_id)}
                    variant={
                      selected === position.account_id ? "primary" : "secondary"
                    }
                  >
                    Consulter la position
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="ek-small ek-muted">
        Cartes financées dont ce wallet est propriétaire. Les cadres sont
        éditoriaux, sans rareté contractuelle. Aucune carte non possédée n’est
        ajoutée.
      </p>
    </section>
  );
}
