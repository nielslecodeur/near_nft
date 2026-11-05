import { NftMarketplace } from "./NftMarketplace";
import { OperationError } from "./OperationError";
import { InvestmentAgent } from "./InvestmentAgent";
import { AgentMissions } from "./AgentMissions";
import { SecurityPanel } from "./SecurityPanel";
import { VaultSettings } from "./VaultSettings";
import type { InvestmentRequest } from "../packages/agent/investment";
import { useEffect, useRef, useState } from "react";
import { WalletConnection } from "./WalletConnection";
import { FinancialAmount } from "./FinancialAmount";
import { displayAmount } from "../packages/shared/ui";
import {
  parseSeriesState as parseState,
  type SeriesState as State,
} from "../packages/shared/series-state";
import type { Snapshot } from "../packages/shared/index";
import { config, rpc, view } from "./client";
import { readTestnetState } from "./testnet-state";
import { executeTestnetCommand } from "./testnet-actions";
import { KeyVaultDialog } from "./KeyVaultDialog";
import {
  TESTNET_WORKER,
  testnetMissionCommand,
  testnetMissionCatalogue,
} from "./testnet-missions";
import { TestnetPositions } from "./TestnetPositions";
import { TestnetSaleRecovery } from "./TestnetSaleRecovery";
import { TransactionTracker } from "./TransactionTracker";
import { propose } from "../packages/agent/index";
import { TerminalHeader } from "./terminal/market-components";
import { NumberText } from "./terminal/primitives";
import { officialModels } from "../packages/shared/network";
import { activeCatalogueListings } from "../packages/shared/catalogue";
import { currentDeployment } from "./testnet-network";
import { requestWallet } from "./ux-intent";
import { Settings } from "lucide-react";
import "@near-wallet-selector/modal-ui/styles.css";
import "./series.css";
import "./explorer.css";
import "./marketplace.css";
import "./marketplace-mvp.css";
import "./orbite.css";
import "./testnet-ui.css";
import "./conversation.css";
import "./guided-ux.css";
import "./terminal/pages.css";
import { ThematicAssistant } from "./ThematicAssistant";
import { baskets } from "../packages/shared/baskets";
import "./terminal/workspace.css";

type Command = {
  action: string;
  request?: InvestmentRequest;
  mandate_hash?: string;
  position?: string;
  amount?: string;
  id?: string;
  command_id?: string;
  expected_amount?: string;
  expected_beneficiary?: string;
};
type Route = "explorer" | "positions" | "agent";
const route = (): Route =>
  ["positions", "app", "portfolio", "nft", "security", "history"].includes(
    location.hash.slice(1),
  )
    ? "positions"
    : location.hash === "#agent"
      ? "agent"
      : "explorer";
const date = (ns: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(Number(BigInt(ns) / 1_000_000n)));
const labels: Record<string, string> = {
  prepare_agent: "Signer le mandat de souscription",
  escrow_agent: "Déposer le montant exact en séquestre",
  execute_agent: "Exécuter la souscription autorisée",
  cancel_agent: "Révoquer le mandat de souscription",
  claim_subscription: "Récupérer le remboursement",
  rotate: "Renouveler la clé propriétaire",
  subscribe: "Créer une position",
  claim_sale: "Réclamer le paiement de vente",
  delegate: "Autoriser l’agent",
  allocate: "Exécuter l’allocation",
  probe: "Tester le plafond",
  redeem: "Dénouer la stratégie",
  revoke: "Révoquer l’agent",
  list: "Mettre en vente",
  cancel: "Annuler l’annonce",
  buy: "Acheter la position",
  withdraw: "Retirer les fonds",
  close_basket: "Clôturer l’exposition simulée",
  maturity: "Atteindre l’échéance",
  expire: "Libérer l’annonce expirée",
  resume: "Reprendre le règlement",
};
function message(error: unknown) {
  const text = String(error);
  const known: Record<string, string> = {
    AGENT_BUDGET:
      "Le contrat a refusé l’exécution : plafond de l’agent dépassé. Aucun montant investi.",
    SALE_LOCKED:
      "La position est gelée pour sa vente. Attendez le règlement ou annulez l’annonce.",
    CAPITAL_LOCKED_UNTIL_MATURITY:
      "Le capital reste verrouillé jusqu’à l’échéance commune de la stratégie.",
    UNWIND_REQUIRED:
      "Dénouez d’abord la stratégie, puis attendez la confirmation avant de retirer.",
    SERIES_MANDATE_LIMIT:
      "La délégation demandée dépasse le mandat immuable de la stratégie.",
    Failed_to_fetch: "La démo locale est indisponible.",
  };
  return (
    Object.entries(known).find(([k]) => text.includes(k))?.[1] ||
    (/fetch|NetworkError/.test(text)
      ? "Lecture ou envoi NEAR indisponible. Vérifiez le réseau et relisez les contrats avant de reprendre."
      : text)
  );
}

export function SeriesApp() {
  const [page, setPage] = useState<Route>(route),
    [data, setData] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [actor, setActor] = useState("Alice"),
    [wallet, setWallet] = useState(""),
    [network, setNetwork] = useState<
      "sandbox" | "orbite" | "prior" | "previous" | "legacy" | "testnet"
    >(
      new URLSearchParams(location.search).get("session") === "orbite"
        ? "orbite"
        : new URLSearchParams(location.search).get("mode") === "local" ||
            new URLSearchParams(location.search).get("session") === "missions"
          ? "sandbox"
          : "testnet",
    ),
    [prices, setPrices] = useState<Record<string, string>>({}),
    [pending, setPending] = useState<Command | null>(null),
    [working, setWorking] = useState(false);
  const [exploreTab, setExploreTab] = useState<"strategies" | "resale">(
    location.hash === "#market" ? "resale" : "strategies",
  );
  const [catalogueSelection, setCatalogueSelection] = useState<{
    id: string;
    revision: number;
  }>();
  const api =
    network === "legacy"
      ? "http://127.0.0.1:8788"
      : network === "previous"
        ? "http://127.0.0.1:8789"
        : network === "prior"
          ? "http://127.0.0.1:8790"
          : network === "orbite"
            ? "http://127.0.0.1:8791"
            : "http://127.0.0.1:8792";
  const [clock, setClock] = useState({ source: "", now: 0n });
  useEffect(() => {
    if (!data) return;
    const started = performance.now(),
      base = BigInt(data.now);
    const update = () =>
      setClock({
        source: data.now,
        now:
          base + BigInt(Math.floor(performance.now() - started)) * 1_000_000n,
      });
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [data?.now]);
  const lock = useRef(false),
    dialog = useRef<HTMLDialogElement>(null),
    generation = useRef(0),
    heading = useRef<HTMLHeadingElement>(null),
    opened = useRef<Snapshot | null>(null);
  async function reload() {
    const ticket = ++generation.current;
    setLoading(true);
    setError("");
    try {
      let next: State;
      if (network !== "testnet") {
        const r = await fetch(api + "/state");
        if (!r.ok) throw new Error("Démo indisponible");
        next = parseState(await r.json());
      } else {
        next = await readTestnetState(wallet);
      }
      if (ticket === generation.current) setData(parseState(next));
    } catch (e) {
      if (ticket === generation.current) {
        setError(
          network === "legacy" || network === "previous" || network === "prior"
            ? "La sandbox précédente est inactive : impossible de relire sa session. Démarrer la nouvelle démo ne restaure pas ses clés éphémères. Les positions testnet ne sont pas modifiées."
            : network === "testnet"
              ? "Lecture NEAR Testnet impossible : " + String(e)
              : message(e),
        );
        setData(null);
      }
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    const change = () => {
      setPage(route());
      if (location.hash === "#market") setExploreTab("resale");
    };
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!target.closest(".user-menu") && !target.closest("dialog"))
        document.querySelector("details.user-menu")?.removeAttribute("open");
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]"))
        document.querySelector("details.user-menu")?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    setData(null);
    setNotice("");
    void reload();
    return () => {
      generation.current++;
    };
  }, [network, wallet]);
  useEffect(() => {
    if (pending && !dialog.current?.open) dialog.current?.showModal();
  }, [pending]);
  function ask(command: Command) {
    if (!lock.current) {
      setError("");
      setNotice("");
      const s = data?.positions.find((p) => p.account_id === command.position);
      const expected = s
        ? command.action === "withdraw"
          ? s.available
          : command.action === "redeem"
            ? s.principal
            : command.action === "allocate"
              ? propose(s, s.policy, BigInt(data!.now)).amount
              : undefined
        : undefined;
      setPending({
        ...command,
        command_id: crypto.randomUUID(),
        expected_amount: command.expected_amount ?? expected,
        expected_beneficiary:
          command.action === "withdraw" ? s?.owner_id : undefined,
      });
    }
  }
  async function execute() {
    if (!pending || lock.current) return;
    lock.current = true;
    setWorking(true);
    setError("");
    try {
      if (network === "testnet") {
        // Native dialogs make the connector iframe inert; hand protected focus to the wallet.
        dialog.current?.close();
        await executeTestnetCommand(pending);
        await reload();
        setNotice(
          labels[pending.action] + " : résultat relu sur NEAR Testnet.",
        );
        dialog.current?.close();
        setPending(null);
        return;
      }
      const r = await fetch(api + "/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pending, actor }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Opération refusée");
      setData(parseState(result));
      setNotice(
        labels[pending.action] + " : état final confirmé sur NEAR sandbox.",
      );
      dialog.current?.close();
      setPending(null);
      if (pending.action === "subscribe") location.hash = "#positions";
    } catch (e) {
      setError(message(e));
      if (network === "testnet") dialog.current?.showModal();
    } finally {
      lock.current = false;
      setWorking(false);
    }
  }
  const rules = data?.series.series,
    terms = rules?.terms,
    who = network !== "testnet" ? data?.actors[actor] : wallet,
    now = clock.source === data?.now ? clock.now : BigInt(data?.now || "0"),
    mature = !!terms && now >= BigInt(terms.matures_at),
    mine = data?.positions.filter(
      (s) => s.owner_id === who && s.funded !== false,
    ),
    local = network !== "testnet",
    selected = pending?.position
      ? data?.positions.find((p) => p.account_id === pending.position)
      : null;
  const cash = (raw: string) => (
    <>
      <FinancialAmount raw={raw} /> <span className="currency">demoUSD</span>
    </>
  );
  return (
    <div className="series-app marketplace-shell orbite-app ek-ui ek-app">
      <KeyVaultDialog />
      <a
        className="skip"
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("content")?.focus();
        }}
      >
        Aller au contenu
      </a>
      <TerminalHeader
        page={page}
        networkLabel={local ? "NEAR sandbox" : "NEAR testnet"}
        records={[
          ...baskets.map((b) => ({
            id: "model:" + b.id,
            name: b.name,
            collection: "Actions thématiques · simulation",
          })),
          ...officialModels(local ? null : currentDeployment()).map(
            (model) => ({
              id: "model:" + model.id,
              name: model.name,
              collection: "Modèle officiel",
            }),
          ),
          ...activeCatalogueListings(data, now).map((sale) => ({
            id: "listing:" + sale.position + ":" + sale.id,
            name: sale.position,
            collection: "Position en vente",
          })),
        ]}
        onConnect={requestWallet}
        onSelect={(id) => {
          setCatalogueSelection({ id, revision: Date.now() });
          location.hash = "#explorer";
        }}
        walletSlot={
          <WalletConnection
            local={local}
            disabled={working}
            onAccount={(id) => {
              if (id !== wallet) {
                setWallet(id);
                opened.current = null;
              }
            }}
            onUseTestnet={() => setNetwork("testnet")}
            onOpenPlan={(s) => {
              opened.current = s;
              setNetwork("testnet");
              setData((previous) =>
                previous
                  ? {
                      ...previous,
                      positions: [
                        ...previous.positions.filter(
                          (p) => p.account_id !== s.account_id,
                        ),
                        s,
                      ],
                    }
                  : null,
              );
              location.hash = "#positions";
            }}
          >
            <details className="user-menu">
              <summary
                aria-label="Paramètres du compte"
                title="Paramètres du compte"
              >
                <Settings aria-hidden="true" />
                <span>Paramètres du compte</span>
              </summary>
              <div className="user-menu-panel">
                {!local && <VaultSettings owner={wallet} working={working} />}{" "}
                <SecurityPanel
                  positions={
                    data?.positions.filter((s) => s.owner_id === who) || []
                  }
                  local={local}
                  working={working}
                  onRotate={(position) => ask({ action: "rotate", position })}
                />{" "}
                <div className="environment">
                  <span>
                    {local
                      ? "NEAR sandbox · actifs de test"
                      : "NEAR Testnet · actifs sans valeur"}
                  </span>
                  <div>
                    <label htmlFor="environment">Réseau</label>
                    <select
                      id="environment"
                      value={network}
                      disabled={working}
                      onChange={(e) =>
                        setNetwork(e.target.value as typeof network)
                      }
                    >
                      <option value="sandbox">Démo actuelle</option>
                      <option value="orbite">
                        Session Orbite · positions conservées
                      </option>
                      <option value="prior">
                        Catalogue précédent · positions conservées
                      </option>
                      <option value="previous">
                        Session précédente · positions conservées
                      </option>
                      <option value="legacy">
                        Positions de la sandbox précédente
                      </option>
                      <option value="testnet">Wallet testnet</option>
                    </select>
                    {local && (
                      <>
                        <label htmlFor="actor">Compte de démo</label>
                        <select
                          id="actor"
                          value={actor}
                          disabled={working}
                          onChange={(e) => {
                            setActor(e.target.value);
                            setNotice("");
                            setError("");
                          }}
                        >
                          <option>Alice</option>
                          <option>Bob</option>
                        </select>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </details>
          </WalletConnection>
        }
      />
      <main id="content" tabIndex={-1} aria-busy={loading || working}>
        {page === "explorer" && (
          <div
            className="ek-product-feed"
            role="list"
            aria-label="État du catalogue"
          >
            <div role="listitem">
              <span>Paniers d’actions</span>
              <NumberText>3</NumberText>
            </div>
            <div role="listitem">
              <span>Annonces vérifiées</span>
              <NumberText>
                {loading
                  ? "Lecture…"
                  : data
                    ? activeCatalogueListings(data, now).length
                    : "Indisponible"}
              </NumberText>
            </div>
            <div role="listitem">
              <span>Prix des paniers</span>
              <span>Fictifs · quotidiens UTC</span>
            </div>
          </div>
        )}
        {!local && (
          <p className="testnet-disclaimer">
            Réseau de test — les actifs utilisés ici n’ont pas de valeur réelle.
          </p>
        )}
        {!local && (
          <TransactionTracker owner={wallet} onRefresh={() => void reload()} />
        )}
        {!loading && data && page === "agent" && (
          <ThematicAssistant now={now} />
        )}
        {!loading && data && page === "agent" && (
          <details className="ek-legacy-missions">
            <summary>Analyses payantes des modèles historiques</summary>
            {!local ? (
              <AgentMissions
                key={network + who}
                api={TESTNET_WORKER}
                actor={who || ""}
                owner={who || ""}
                now={now}
                onWorking={setWorking}
                onPositionsChanged={() => void reload()}
                transport={testnetMissionCommand}
                loadCatalogue={testnetMissionCatalogue}
                testnet
              />
            ) : data.capabilities?.includes("paid-missions-v1") ? (
              <AgentMissions
                key={network + who}
                api={api}
                actor={actor}
                owner={who || ""}
                now={now}
                onWorking={setWorking}
                onPositionsChanged={() => void reload()}
              />
            ) : (
              <InvestmentAgent
                now={now}
                key={network + who}
                data={data}
                owner={who || ""}
                local={
                  local &&
                  !!data.capabilities?.includes("agent-subscription-v1")
                }
                working={working}
                ask={ask}
              />
            )}
          </details>
        )}
        {notice && (
          <p className="feedback success" role="status">
            {notice}
          </p>
        )}
        {error && !pending && (
          <OperationError error={error} onRetry={() => void reload()} />
        )}
        {loading && page !== "explorer" && (
          <div className="loading-state" role="status">
            <p>Lecture des contrats NEAR…</p>
            <div />
            <div />
          </div>
        )}
        {!loading && !data && !local && page !== "explorer" && (
          <section className="page-title">
            <h1>{page === "positions" ? "Mes positions" : "Agents"}</h1>
            <p>
              La lecture testnet est indisponible. Relisez les contrats avant de
              poursuivre ; aucun solde ni succès n’est présumé.
            </p>
          </section>
        )}
        {!loading && !data && local && page !== "explorer" && (
          <section className="unavailable">
            <h1 ref={heading} tabIndex={-1}>
              Vos positions commencent par des règles claires.
            </h1>
            <p>
              La connexion au wallet est disponible. Pour explorer Alice, Bob et
              les vrais contrats locaux, démarrez la sandbox de stratégies.
            </p>
            <code>npm run demo:agents</code>
            <button onClick={() => void reload()}>Recharger la démo</button>
          </section>
        )}
        {page === "explorer" && (
          <NftMarketplace
            selection={catalogueSelection}
            onChanged={() => void reload()}
            onWorking={setWorking}
            data={data}
            loading={loading}
            now={now}
            owner={who || ""}
            local={local}
            working={working}
            tab={exploreTab}
            onTab={setExploreTab}
            ask={ask}
          />
        )}
        {!loading && data && page === "positions" && !local && (
          <TestnetPositions
            data={data}
            owner={who || ""}
            working={working}
            ask={ask}
            onRefresh={() => void reload()}
          />
        )}
        {!local && page === "positions" && (
          <TestnetSaleRecovery owner={wallet} working={working} ask={ask} />
        )}
        {!loading && data && page === "positions" && local && (
          <>
            <div className="page-title">
              <h1>Mes positions</h1>
              <p>{who || "Connectez votre compte NEAR"}</p>
              <button disabled={working} onClick={() => void reload()}>
                Actualiser
              </button>
            </div>
            {!local && (
              <p className="feedback">
                Ouvrez un NFT-compte depuis votre wallet pour vérifier son
                propriétaire. Les commandes testnet ne sont pas activées dans
                cette version.
              </p>
            )}
            {!mine?.length && (
              <section className="empty-state">
                <h2>Votre première position commence dans Explorer.</h2>
                <p>
                  Chaque souscription à une stratégie crée un NFT distinct, lié
                  à son compte NEAR. Les fonds de la position ne se mélangent
                  pas au prix d’une éventuelle vente.
                </p>
                <a href="#explorer" className="button primary">
                  Explorer les stratégies
                </a>
              </section>
            )}
            {data.listings
              .filter(
                (sale) =>
                  sale.claim?.beneficiary === who &&
                  sale.claim?.state !== "Paid",
              )
              .map((sale) => (
                <section
                  className="position-claim"
                  key={sale.position + sale.id}
                  aria-label="Paiement de vente"
                >
                  <h2>Un paiement vous est dû</h2>
                  <p>
                    {cash(sale.claim!.amount)} · {sale.position} · annonce{" "}
                    {sale.id}
                  </p>
                  <p>
                    Cette créance conserve son bénéficiaire et son montant. Elle
                    est distincte des actifs de la position. Un paiement en
                    attente ne doit pas être relancé tant que son résultat est
                    inconnu.
                  </p>
                  <button
                    disabled={
                      !local || working || sale.claim!.state !== "Claimable"
                    }
                    onClick={() =>
                      ask({
                        action: "claim_sale",
                        position: sale.position,
                        id: sale.id,
                        expected_amount: sale.claim!.amount,
                        expected_beneficiary: sale.claim!.beneficiary,
                      })
                    }
                  >
                    {sale.claim!.state === "Paying"
                      ? "Paiement en attente"
                      : "Réclamer le paiement"}
                  </button>
                </section>
              ))}
            {mine?.map((s) => {
              const frozen = s.status !== "Active" || !!s.pending;
              const listing = data.listings.find(
                (l) => l.position === s.account_id && l.id === s.sale?.id,
              );
              const ended =
                !!s.series && now >= BigInt(s.series.terms.matures_at);
              const withdrawTimeAllowed = !s.series || ended;
              return (
                <article className="position" key={s.account_id}>
                  <div className="position-top">
                    <div>
                      <h2>
                        {s.series?.terms.name || "Position historique"} ·{" "}
                        {s.account_id.split(".")[0]}
                      </h2>
                      <p className="position-account">{s.account_id}</p>
                    </div>
                    <span className="state-label">
                      {s.status === "SaleLocked"
                        ? "Gelée pour la vente"
                        : !s.series
                          ? "Sans échéance contractuelle"
                          : ended
                            ? "Échéance atteinte"
                            : s.status === "Active"
                              ? "Capital verrouillé"
                              : s.status}
                    </span>
                  </div>
                  <dl className="position-reference">
                    <div>
                      <dt>Propriétaire courant</dt>
                      <dd>{s.owner_id}</dd>
                    </div>
                    <div>
                      <dt>Stratégie et version</dt>
                      <dd>
                        {s.series
                          ? `${s.series.terms.id} · v${s.series.terms.version}`
                          : "Mandat historique"}
                      </dd>
                    </div>
                    <div>
                      <dt>Compte créé le</dt>
                      <dd>{date(s.started_at)}</dd>
                    </div>
                    <div>
                      <dt>Identifiant NFT</dt>
                      <dd>{s.account_id}</dd>
                    </div>
                  </dl>
                  <dl className="position-balances">
                    <div>
                      <dt>Disponible dans le compte</dt>
                      <dd>{cash(s.available)}</dd>
                    </div>
                    <div>
                      <dt>Dans la stratégie</dt>
                      <dd>{cash(s.principal)}</dd>
                    </div>
                    <div>
                      <dt>Réservé en cours</dt>
                      <dd>{cash(s.reserved)}</dd>
                    </div>
                  </dl>
                  {!!s.pending && (
                    <p role="status">
                      Une opération est en cours sur NEAR. Les montants réservés
                      ne sont pas disponibles ; les actions attendent sa
                      résolution.
                    </p>
                  )}
                  <p>
                    Échéance :{" "}
                    {s.series
                      ? date(s.series.terms.matures_at)
                      : "Sans échéance contractuelle"}
                    . Gains déjà reçus : {cash(s.realized_gains)} ; ils sont
                    inclus dans les fonds comptabilisés.
                  </p>
                  {listing &&
                    [
                      "Active",
                      "Settling",
                      "Resolving",
                      "AwaitingIndex",
                    ].includes(listing.state) && (
                      <div className="feedback">
                        <p>
                          Annonce {listing.id} · {cash(listing.price)} ·{" "}
                          {listing.state === "Active"
                            ? "position gelée pour la vente"
                            : "règlement engagé"}
                          . Retraits, allocations, rotation et changements de
                          permissions sont bloqués.
                        </p>
                        {listing.state === "Active" ? (
                          <button
                            disabled={!local || working}
                            onClick={() =>
                              ask({
                                action:
                                  now >= BigInt(listing.expires_at)
                                    ? "expire"
                                    : "cancel",
                                position: s.account_id,
                                id: listing.id,
                              })
                            }
                          >
                            {now >= BigInt(listing.expires_at)
                              ? "Libérer l’annonce expirée"
                              : "Annuler mon annonce"}
                          </button>
                        ) : (
                          <a href="#market">Suivre le règlement</a>
                        )}
                      </div>
                    )}
                  <details open>
                    <summary>Mandat et travail de l’agent</summary>
                    <p>
                      {s.policy && !s.agent_paused
                        ? `Agent autorisé : ${s.policy.agent}. Plafond ${displayAmount(s.policy.max_operation)} demoUSD par exécution.`
                        : "Aucune délégation active. Le mandat de stratégie reste inchangé."}
                    </p>
                    <div className="action-row">
                      <button
                        disabled={
                          !local || working || frozen || ended || !!s.policy
                        }
                        onClick={() =>
                          ask({ action: "delegate", position: s.account_id })
                        }
                      >
                        Autoriser l’agent
                      </button>
                      <button
                        disabled={
                          !local ||
                          working ||
                          frozen ||
                          ended ||
                          !s.policy ||
                          s.agent_paused
                        }
                        onClick={() =>
                          ask({ action: "allocate", position: s.account_id })
                        }
                      >
                        Exécuter l’allocation
                      </button>
                      <button
                        disabled={
                          !local ||
                          working ||
                          frozen ||
                          ended ||
                          !s.policy ||
                          s.agent_paused
                        }
                        onClick={() =>
                          ask({ action: "probe", position: s.account_id })
                        }
                      >
                        Tester le plafond
                      </button>
                      <button
                        disabled={!local || working || frozen || !s.policy}
                        onClick={() =>
                          ask({ action: "revoke", position: s.account_id })
                        }
                      >
                        Révoquer l’agent
                      </button>
                    </div>
                  </details>
                  <div className="position-exit">
                    <div>
                      <h3>
                        {withdrawTimeAllowed
                          ? "Récupérer les actifs disponibles"
                          : "Céder la position avant l’échéance"}
                      </h3>
                      <p>
                        {!s.series
                          ? "Aucune échéance ajoutée : les contraintes historiques du contrat sont conservées. Les fonds disponibles et les fonds engagés restent distincts."
                          : ended
                            ? "Dénouez la stratégie avant de retirer. La disponibilité dépend du résultat effectif du dénouement."
                            : "Le prix de vente est distinct du capital. La mise en vente gèle les opérations jusqu’à annulation confirmée ou règlement."}
                      </p>
                    </div>
                    <div className="exit-actions">
                      <button
                        disabled={
                          !local ||
                          working ||
                          frozen ||
                          BigInt(s.principal) === 0n
                        }
                        onClick={() =>
                          ask({ action: "redeem", position: s.account_id })
                        }
                      >
                        Dénouer la stratégie
                      </button>
                      {!withdrawTimeAllowed ? (
                        <>
                          <label htmlFor={s.account_id + "-price"}>
                            Prix en demoUSD
                          </label>
                          <input
                            id={s.account_id + "-price"}
                            inputMode="decimal"
                            value={prices[s.account_id] ?? "97"}
                            disabled={working || frozen}
                            onChange={(e) =>
                              setPrices({
                                ...prices,
                                [s.account_id]: e.target.value,
                              })
                            }
                          />
                          <button
                            className="primary"
                            disabled={!local || working || frozen}
                            onClick={() =>
                              ask({
                                action: "list",
                                position: s.account_id,
                                amount: prices[s.account_id] ?? "97",
                              })
                            }
                          >
                            Mettre en vente
                          </button>
                          {s.sale && <a href="#market">Suivre l’annonce</a>}
                        </>
                      ) : (
                        <button
                          className="primary"
                          disabled={
                            !local ||
                            working ||
                            frozen ||
                            (!!s.series && BigInt(s.principal) > 0n) ||
                            BigInt(s.available) === 0n
                          }
                          onClick={() =>
                            ask({ action: "withdraw", position: s.account_id })
                          }
                        >
                          Retirer les fonds
                        </button>
                      )}
                    </div>
                  </div>
                  <details>
                    <summary>Identité et contrôle du NFT-compte</summary>
                    <dl className="audit-fields">
                      <dt>Propriétaire</dt>
                      <dd>{s.owner_id}</dd>
                      <dt>Compte immuable</dt>
                      <dd>{s.account_id}</dd>
                      <dt>Génération de propriété</dt>
                      <dd>{s.ownership_epoch}</dd>
                      <dt>Empreinte du mandat</dt>
                      <dd>{s.series?.mandate_hash || "Mandat historique"}</dd>
                      <dt>Capital initial versé</dt>
                      <dd>{cash(s.deposits)}</dd>
                      <dt>Retraits confirmés</dt>
                      <dd>{cash(s.withdrawals)}</dd>
                    </dl>
                    <button
                      disabled={!local || working || frozen}
                      onClick={() =>
                        ask({ action: "rotate", position: s.account_id })
                      }
                    >
                      Renouveler la clé
                    </button>
                  </details>
                  <details>
                    <summary>Activité de cette position</summary>
                    {data.journal.some((e) => e.position === s.account_id) ? (
                      <ol className="position-history">
                        {data.journal
                          .filter((e) => e.position === s.account_id)
                          .map((e, i) => (
                            <li key={i}>
                              {e.ok ? "Confirmé" : "Refusé"} ·{" "}
                              {labels[e.label] || e.label} ·{" "}
                              {new Date(e.at).toLocaleString("fr-FR")}
                            </li>
                          ))}
                      </ol>
                    ) : (
                      <p>
                        Aucun événement de cette session indexé pour cette
                        position. L’historique complet de la chaîne n’est pas
                        indexé.
                      </p>
                    )}
                  </details>
                </article>
              );
            })}
            {local && terms && (
              <details className="sandbox-time">
                <summary>Temps de démonstration</summary>
                <p>
                  Avance les blocs de cette sandbox jusqu’à l’échéance. Ce
                  contrôle n’existe pas dans les contrats et n’est pas
                  disponible sur testnet.
                </p>
                <button
                  disabled={working || mature}
                  onClick={() => ask({ action: "maturity" })}
                >
                  Atteindre l’échéance en sandbox
                </button>
              </details>
            )}
            {!!data.journal.length && (
              <section className="journal">
                <h2>Travail exécuté</h2>
                <p>
                  Actions manuelles et décisions du contrat dans cette session.
                  Aucun agent ne tourne en arrière-plan.
                </p>
                <ol>
                  {data.journal.map((entry, i) => (
                    <li key={entry.at + i}>
                      <span>{entry.ok ? "Confirmé" : "Refusé"}</span>
                      <details>
                        <summary>{labels[entry.label] || entry.label}</summary>
                        <p>{entry.detail}</p>
                      </details>
                      <time dateTime={entry.at}>
                        {new Date(entry.at).toLocaleTimeString("fr-FR")}
                      </time>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </main>
      <footer>
        <span>Everkeep · Positions NFT sur NEAR</span>
        <span>
          {local
            ? "Sandbox réelle · demoUSD sans valeur monétaire"
            : "Testnet · aucune opération mainnet"}
        </span>
      </footer>
      <dialog
        ref={dialog}
        className="transaction-dialog"
        onCancel={(e) => {
          if (working) e.preventDefault();
          else setPending(null);
        }}
        onClose={() => {
          if (!lock.current) setPending(null);
        }}
        aria-labelledby="confirm-title"
      >
        <h2 id="confirm-title">
          {pending ? labels[pending.action] : "Confirmer"}
        </h2>
        <p>
          {local ? "Compte de démonstration : " : "Wallet signataire : "}
          <strong>{local ? actor : who}</strong> ·{" "}
          {network === "sandbox"
            ? "Session actuelle"
            : network === "previous"
              ? "Session précédente"
              : network === "testnet"
                ? "NEAR Testnet"
                : "Session historique"}
        </p>
        {selected && <p className="hash">Position : {selected.account_id}</p>}
        {pending?.amount && (
          <p className="confirmation-amount">{pending.amount} demoUSD</p>
        )}
        {pending?.expected_amount && (
          <p className="confirmation-amount">
            {displayAmount(pending.expected_amount)} demoUSD
          </p>
        )}
        {pending?.expected_beneficiary && (
          <p className="hash">Destinataire : {pending.expected_beneficiary}</p>
        )}
        {pending?.action === "delegate" && terms && (
          <p>
            Plafond : {displayAmount(terms.max_operation)} demoUSD par
            exécution, {displayAmount(terms.max_period)} par jour UTC,
            allocation maximale {terms.allocation_bps / 100} %. Expiration :{" "}
            {date(terms.matures_at)}.
          </p>
        )}
        {pending?.action === "subscribe" && terms && (
          <>
            <p>
              Stratégie {terms.id} · version {terms.version}. Actif :{" "}
              {terms.asset}. Contrat autorisé : {terms.strategy}. Chaque
              souscription crée une position individuelle.
            </p>
            <p>
              Limites du mandat : {terms.allocation_bps / 100} %,{" "}
              {cash(terms.max_operation)} par opération,{" "}
              {cash(terms.max_period)} par jour UTC. L’agent n’est pas autorisé
              par cette création.
            </p>
            <p className="hash">
              Mandat examiné :{" "}
              {pending.mandate_hash || data?.series.series?.mandate_hash}
            </p>
          </>
        )}
        {pending?.action === "prepare_agent" && terms && (
          <p>
            Mandat unique pour {data?.actors.Agent}, bénéficiaire du NFT : {who}
            . Route imposée : {terms.asset} vers {terms.strategy}. Expiration au
            plus tard dans dix minutes et avant la clôture. Préparation
            technique : 6 NEAR séparés. Aucun droit sur le marché secondaire.
          </p>
        )}
        {pending?.action === "escrow_agent" && (
          <p>
            Le montant exact sera mis en séquestre dans la collection vérifiée.
            Il ne sera crédité à la nouvelle position qu’après l’exécution de
            l’agent autorisé. Une annulation signée reste possible avant
            engagement du financement.
          </p>
        )}
        {pending?.action === "execute_agent" && (
          <p>
            Seul le mandat signé peut être consommé. La collection, le token et
            le wallet vérifient l’agent, le montant, l’expiration, la génération
            et la version. Le NFT revient au propriétaire signataire.
          </p>
        )}
        <p>
          {pending?.action === "subscribe"
            ? `Dépôt unique, capital verrouillé jusqu’au ${terms ? date(terms.matures_at) : "terme de la stratégie"}. Une nouvelle position nécessite séparément 6 NEAR de réserve technique.`
            : pending?.action === "buy"
              ? "Le prix est placé en séquestre. La transmission change la clé, révoque l’agent du vendeur et conserve les actifs, le mandat et l’échéance."
              : pending?.action === "list"
                ? "Cette annonce gèle le compte : aucun retrait, dénouement ni changement de permissions pendant la vente. Son expiration sera limitée et antérieure à l’échéance."
                : pending?.action === "probe"
                  ? "Tentative volontaire au-dessus du plafond. Le résultat attendu est un refus du contrat, visible dans le journal."
                  : pending?.action === "maturity"
                    ? "Le temps avance pour toute cette sandbox. Les contrats ne disposent d’aucun déblocage administrateur."
                    : pending?.action === "claim_sale"
                      ? "Le contrat paie uniquement le bénéficiaire fixe de la créance. Cette action ne transfère pas la position et ne débloque pas son capital."
                      : local
                        ? "L’action sera signée avec la clé locale de démonstration, puis son état sera relu."
                        : "La clé ML-DSA locale signera l’autorisation exacte. Votre wallet validera séparément la transaction NEAR ; le résultat sera vérifié sur testnet."}
        </p>
        {working && (
          <p role="status" className="transaction-pending">
            Exécution NEAR en cours. Confirmation des reçus et lecture de l’état
            final…
          </p>
        )}
        {error && (
          <p role="alert" className="feedback error">
            {error}
          </p>
        )}
        <div className="action-row">
          <button
            disabled={working}
            onClick={() => {
              dialog.current?.close();
              setPending(null);
              if (error) void reload();
              setError("");
            }}
          >
            Fermer
          </button>
          <button
            className="primary"
            disabled={working}
            onClick={() => void execute()}
          >
            {working
              ? "Vérification en cours…"
              : local
                ? "Confirmer en sandbox"
                : "Examiner et signer sur testnet"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
