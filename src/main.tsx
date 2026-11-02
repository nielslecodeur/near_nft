import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "@near-wallet-selector/modal-ui/styles.css";
import "./style.css";
import {
  connect,
  config,
  local,
  transaction,
  verified,
  depositPlan,
} from "./client";
import {
  envelope,
  units,
  type Snapshot,
  type Action,
  type Policy,
} from "../packages/shared/index.js";
import { interpret, propose } from "../packages/agent/index.js";

const format = (raw = "0") => {
  const n = BigInt(raw),
    fraction = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return (
    new Intl.NumberFormat("fr-FR").format(n / 1_000_000n) +
    (fraction ? "," + fraction : "")
  );
};
const friendlyError = (e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  const reasons: Record<string, string> = {
    AGENT_BUDGET:
      "Le plafond par opération ou par période de votre agent est dépassé.",
    ALLOCATION_LIMIT: "Cette allocation dépasse la limite de risque signée.",
    AGENT_REVOKED: "Le mandat de cet agent a été révoqué.",
    RECIPIENT_CONSENT_REQUIRED:
      "Le destinataire doit d’abord enregistrer sa propre clé de réception.",
    SYNC_REQUIRED:
      "Le compte attend la fin de sa synchronisation. Réessayez après confirmation.",
    ML_DSA_INVALID:
      "La signature ne correspond pas au message et à la clé courante.",
    INSUFFICIENT_AVAILABLE:
      "Le solde disponible ne suffit pas pour ce retrait.",
  };
  return (
    Object.entries(reasons).find(([code]) => message.includes(code))?.[1] ||
    message
  );
};
type Log = { label: string; ok: boolean; detail: string; hash?: string };
const operationLabel = (label: string) => {
  const command = label.replace(/^Confirmation : /, "");
  return (
    (
      {
        create: "Création du plan",
        deposit: "Dépôt",
        policy: "Mandat de l’agent",
        allocate: "Allocation",
        probe: "Vérification du plafond",
        revoke: "Révocation du mandat",
        rotate: "Renouvellement de la clé",
        transfer: "Transmission du plan",
        withdraw: "Retrait",
        redeem: "Rachat de la position",
        yield: "Distribution de test",
        receive: "Consentement de réception",
      } as Record<string, string>
    )[command] || label
  );
};
type Mode = "local" | "testnet";
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    leaf: (
      <>
        <path d="M20 4C10 2 2 8 5 16c8 4 15-3 15-12Z" />
        <path d="M4 21 15 10" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    key: (
      <>
        <circle cx="8" cy="8" r="5" />
        <path d="m12 12 8 8m-4-4 3-3" />
      </>
    ),
    logout: (
      <>
        <path d="M9 4H4v16h5m6-14 6 6-6 6M9 12h12" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.arrow}
    </svg>
  );
}
function App() {
  const [mode, setMode] = useState<Mode>(() =>
      localStorage.getItem("everkeep-mode") === "testnet" ? "testnet" : "local",
    ),
    [account, setAccount] = useState(""),
    [plan, setPlan] = useState(
      () => localStorage.getItem("everkeep-plan") || "",
    ),
    [s, setS] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [logs, setLogs] = useState<Log[]>([]),
    [modal, setModal] = useState(""),
    [amount, setAmount] = useState("100"),
    [beneficiary, setBeneficiary] = useState(""),
    [agent, setAgent] = useState(""),
    [publicKey, setPublicKey] = useState(""),
    [signed, setSigned] = useState(""),
    [request, setRequest] = useState<object | null>(null),
    [natural, setNatural] = useState(
      "Je vise 4 % par an sur 10 ans, avec au maximum 20 % par stratégie.",
    ),
    [years, setYears] = useState(10),
    [tab, setTab] = useState("overview");
  useEffect(() => {
    localStorage.setItem("everkeep-mode", mode);
    localStorage.setItem("everkeep-plan", plan);
  }, [mode, plan]);
  useEffect(() => {
    const listener = (event: Event) => {
      const hash = (event as CustomEvent<string>).detail;
      setLogs((x) => [
        {
          label: "Transaction testnet exécutée",
          ok: true,
          detail: "Reçus vérifiés par le client.",
          hash,
        },
        ...x,
      ]);
    };
    window.addEventListener("everkeep-transaction", listener);
    return () => window.removeEventListener("everkeep-transaction", listener);
  }, []);
  const total = s
    ? BigInt(s.available) + BigInt(s.principal) + BigInt(s.reserved)
    : 0n;
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      if (
        result &&
        typeof result === "object" &&
        "historyHandled" in result &&
        result.historyHandled
      )
        return;
      setLogs((x) => [
        {
          label,
          ok: true,
          detail:
            typeof result === "string"
              ? result
              : "Opération traitée. Consultez l’état vérifié et les éventuels reçus.",
        },
        ...x,
      ]);
    } catch (e) {
      const detail = friendlyError(e);
      setError(detail);
      setLogs((x) => [{ label, ok: false, detail }, ...x]);
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    if (mode === "local") {
      const data = await local();
      setS(data.snapshot);
      setPlan(data.snapshot.account_id);
      setAccount(data.snapshot.owner_id);
      setAgent(data.agent);
      setLogs(data.history || []);
    } else {
      if (!plan) throw new Error("Saisissez le compte du plan");
      setS(await verified(plan));
    }
  };
  const open = (name: string) => {
    if (name !== "create" && s && s.status !== "Active") {
      setError("Le compte attend la résolution de ses opérations.");
      return;
    }
    setModal(name);
    setSigned("");
    setRequest(null);
    setError("");
  };
  const perform = async (command: string, args: object = {}) => {
    if (mode === "local") {
      const result = await local(command, args);
      setS(result.snapshot);
      setPlan(result.snapshot.account_id);
      setAccount(result.snapshot.owner_id);
      if (result.history) setLogs(result.history);
      return {
        message: result.message,
        historyHandled: Boolean(result.history),
      };
    }
    throw new Error("Préparez puis importez la signature locale ci-dessous.");
  };
  const prepare = () => {
    if (modal === "create") {
      setRequest({
        network: "testnet",
        account: `${plan}.${config.collection}`,
        collection: config.collection,
        owner: account,
      });
      return;
    }
    if (modal === "receive") {
      if (!s || !account)
        throw new Error("Connectez le compte destinataire et chargez le plan");
      setRequest({
        snapshot: s,
        receiver: account,
        expires_at: (
          BigInt(Date.now()) * 1_000_000n +
          3_600_000_000_000n
        ).toString(),
      });
      return;
    }
    if (!s) throw new Error("Chargez un plan");
    let action: Action;
    if (modal === "redeem")
      action = { Redeem: { asset: s.asset, amount: units(amount).toString() } };
    else if (modal === "withdraw")
      action = {
        Withdraw: {
          asset: s.asset,
          amount: units(amount).toString(),
          beneficiary: beneficiary || s.owner_id,
        },
      };
    else if (modal === "rotate") action = { Rotate: { public_key: publicKey } };
    else if (modal === "transfer")
      action = { Transfer: { owner_id: beneficiary, public_key: publicKey } };
    else if (modal === "policy") {
      const parsed = interpret(natural);
      const policy: Policy = {
        agent,
        asset: s.asset,
        strategy: s.strategy,
        max_operation: units(amount).toString(),
        max_period: units("200").toString(),
        allocation_bps: parsed.allocation_bps,
        expires_at: (
          BigInt(Date.now()) * 1_000_000n +
          80_000_000_000_000n
        ).toString(),
        ownership_epoch: s.ownership_epoch,
        policy_version: (BigInt(s.policy_version) + 1n).toString(),
      };
      action = {
        SetPolicy: {
          policy,
          horizon_years: parsed.horizon_years,
          target_bps: parsed.target_bps,
        },
      };
    } else action = "Revoke";
    setRequest(envelope(s, action));
  };
  const submit = async () => {
    if (!s && modal !== "create") throw new Error("Chargez un plan");
    if (mode === "local") {
      const result = await perform(modal, {
        amount: units(amount).toString(),
        beneficiary,
        natural,
      });
      setModal("");
      return result;
    }
    if (modal === "receive") {
      const consent = JSON.parse(signed);
      await transaction(
        s!.account_id,
        "register_recipient",
        consent,
        "100000000000000000000000",
      );
    } else if (modal === "deposit") {
      await depositPlan(s!, units(amount).toString());
    } else if (modal === "create") {
      const proof = JSON.parse(signed);
      await transaction(
        config.collection,
        "create_plan",
        { name: plan, public_key: proof.public_key, proof: proof.proof },
        "6000000000000000000000000",
      );
      await transaction(`${plan}.${config.collection}`, "sync", {});
      setPlan(`${plan}.${config.collection}`);
    } else {
      if (!request) throw new Error("Préparez le message à signer");
      const auth = JSON.parse(signed);
      const decoded = JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(atob(auth.message), (c) => c.charCodeAt(0)),
        ),
      );
      if (JSON.stringify(decoded) !== JSON.stringify(request))
        throw new Error(
          "Le message signé ne correspond pas à la demande affichée",
        );
      await transaction(s!.account_id, "execute", auth);
    }
    setModal("");
    await refresh();
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(request, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "everkeep-request.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const projected = (year: number) =>
    (Number(total) / 1e6) * Math.pow(1 + (s?.target_bps ?? 400) / 10000, year);
  const curve = () => {
    const base = projected(0),
      growth = projected(years) - base;
    return Array.from(
      { length: 31 },
      (_, i) =>
        `${i === 0 ? "M" : "L"}${(i * 530) / 30} ${growth > 0 ? 135 - ((projected((years * i) / 30) - base) / growth) * 115 : 135}`,
    ).join(" ");
  };
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Everkeep accueil">
          <span className="brand-symbol">e</span>everkeep
          <span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">VOTRE ESPACE</div>
        <nav>
          <button
            className={tab === "overview" ? "nav active" : "nav"}
            onClick={() => setTab("overview")}
          >
            <Icon name="grid" /> Mes plans <span>{s ? "01" : "00"}</span>
          </button>
          <button
            className={tab === "security" ? "nav active" : "nav"}
            onClick={() => setTab("security")}
          >
            <Icon name="shield" /> Autorisations
          </button>
          <button
            className={tab === "history" ? "nav active" : "nav"}
            onClick={() => setTab("history")}
          >
            <Icon name="clock" /> Activité
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="network-dot" /> NEAR <span>Prototype</span>
          <p>
            Votre compte persiste.
            <br />
            Vos clés évoluent.
          </p>
          <small>Test uniquement · Non audité</small>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Mon espace <span>/</span>{" "}
            {tab === "overview"
              ? "Vue d’ensemble"
              : tab === "security"
                ? "Autorisations"
                : "Activité"}
          </div>
          <div className="header-actions">
            <select
              aria-label="Environnement"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as Mode);
                setS(null);
                setAccount("");
                setLogs([]);
              }}
            >
              <option value="local">Sandbox locale</option>
              <option value="testnet">Testnet</option>
            </select>
            <button
              className="wallet"
              onClick={() =>
                run("Connexion", async () => {
                  if (mode === "local") {
                    await refresh();
                    return "Signataire local éphémère de sandbox.";
                  }
                  setAccount(await connect());
                  return "Connexion testnet demandée.";
                })
              }
            >
              <span className="status-dot" />
              {account || "Connecter un compte"}
            </button>
          </div>
        </header>
        <div className="page">
          <div className="intro">
            <div>
              <div className="eyebrow">LE TEMPS TRAVAILLE AVEC VOUS</div>
              <h1>
                {tab === "overview"
                  ? "Une longueur d’avance."
                  : tab === "security"
                    ? "Vous gardez les clés."
                    : "Chaque mouvement, visible."}
              </h1>
              <p>Une épargne programmable, un compte qui vous suit.</p>
            </div>
            <button
              className="primary"
              onClick={() => open("create")}
              disabled={busy}
            >
              <Icon name="plus" /> Nouveau plan
            </button>
          </div>
          <div className="environment">
            <span className="pill">
              {mode === "local" ? "SANDBOX LOCALE" : "TESTNET"}
            </span>
            <span>
              demoUSD sans valeur en dollars{" "}
              <span className="separator">·</span> Rendement simulé, réserve de
              test préfinancée
            </span>
            <Icon name="leaf" />
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {mode === "testnet" && (
            <div className="load-plan">
              <input
                aria-label="Adresse du plan"
                placeholder="avenir.collection.testnet"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
              />
              <button
                className="secondary"
                disabled={busy}
                onClick={() => run("Vérification au même bloc final", refresh)}
              >
                Charger le plan
              </button>
            </div>
          )}
          {!s && (
            <div className="empty">
              <Icon name="leaf" size={40} />
              <h2>Tout commence par un plan.</h2>
              <p>
                {mode === "local"
                  ? "Lancez la sandbox locale, puis chargez le compte de démonstration."
                  : "Connectez votre wallet testnet et créez votre premier NFT-compte."}
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => run("Charger la démonstration", refresh)}
              >
                {busy ? "Chargement…" : "Charger le compte"}{" "}
                <Icon name="arrow" />
              </button>
              <code>bash scripts/local-demo.sh</code>
            </div>
          )}
          {s && (
            <>
              {tab === "overview" && (
                <>
                  <section className="stats">
                    <div>
                      <span>Valeur du plan</span>
                      <strong>
                        {format(total.toString())}
                        <small>demoUSD</small>
                      </strong>
                      <p>
                        <span className="positive">
                          + {format(s.realized_gains)}
                        </span>{" "}
                        gains réellement reçus
                      </p>
                    </div>
                    <div>
                      <span>Capital versé</span>
                      <strong>
                        {format(s.deposits)}
                        <small>demoUSD</small>
                      </strong>
                      <p>{format(s.withdrawals)} retirés depuis la création</p>
                    </div>
                    <div>
                      <span>Objectif annuel</span>
                      <strong>
                        {s.target_bps / 100}
                        <small>% / an</small>
                      </strong>
                      <p>Objectif indicatif · non garanti</p>
                      <p>
                        Observé :{" "}
                        {BigInt(s.deposits) > 0n
                          ? (
                              Number(
                                (BigInt(s.realized_gains) * 10_000n) /
                                  BigInt(s.deposits),
                              ) / 100
                            ).toLocaleString("fr-FR")
                          : "0"}{" "}
                        % depuis la création, non annualisé
                      </p>
                    </div>
                  </section>
                  <div className="dashboard-grid">
                    <section className="plan-card">
                      <div className="section-top">
                        <div>
                          <span className="eyebrow">MON PLAN · 01</span>
                          <h2>Prendre le temps.</h2>
                        </div>
                        <span
                          className={
                            "verified " + (s.status === "Active" ? "" : "muted")
                          }
                        >
                          {s.status === "Active"
                            ? "✓ Propriété vérifiée"
                            : "Synchronisation"}
                        </span>
                      </div>
                      <div className="plan-address">
                        <Icon name="leaf" />
                        <span>{s.account_id}</span>
                        <button
                          aria-label="Copier l’adresse"
                          onClick={() =>
                            run("Adresse copiée", () =>
                              navigator.clipboard.writeText(s.account_id),
                            )
                          }
                        >
                          ↗
                        </button>
                      </div>
                      <div className="allocation">
                        <div>
                          <span>Disponible</span>
                          <strong>
                            {format(s.available)} <small>demoUSD</small>
                          </strong>
                        </div>
                        <div>
                          <span>En stratégie</span>
                          <strong>
                            {format(s.principal)} <small>demoUSD</small>
                          </strong>
                        </div>
                      </div>
                      <div className="allocation-bar">
                        <div
                          style={{
                            width:
                              total > 0n
                                ? `${Number((BigInt(s.principal) * 100n) / total)}%`
                                : "0%",
                          }}
                        />
                      </div>
                      <div className="plan-footer">
                        <span>
                          <i /> Réserve de démonstration
                        </span>
                        <span>{s.horizon_years} ans d’horizon</span>
                      </div>
                      <div className="button-row">
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => open("deposit")}
                        >
                          <Icon name="plus" /> Déposer
                        </button>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => open("withdraw")}
                        >
                          Retirer <Icon name="arrow" />
                        </button>
                      </div>
                      <button
                        className="text-button"
                        disabled={busy || s.principal === "0"}
                        onClick={() => open("redeem")}
                      >
                        Récupérer une partie de la position ↗
                      </button>
                    </section>
                    <section className="projection-card">
                      <div className="section-top">
                        <div>
                          <span className="eyebrow">
                            UNE VISION À LONG TERME
                          </span>
                          <h2>Et demain ?</h2>
                        </div>
                        <div className="segmented">
                          {[1, 5, 10].map((y) => (
                            <button
                              key={y}
                              className={years === y ? "selected" : ""}
                              onClick={() => setYears(y)}
                            >
                              {y} an{y > 1 ? "s" : ""}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="projection-value">
                        {new Intl.NumberFormat("fr-FR", {
                          maximumFractionDigits: 0,
                        }).format(projected(years))}{" "}
                        <small>demoUSD</small>
                        <span>
                          Projection à {years} an{years > 1 ? "s" : ""}
                        </span>
                      </div>
                      <svg
                        viewBox="0 0 540 150"
                        className="chart"
                        role="img"
                        aria-label={`Projection indicative à ${s.target_bps / 100} pour cent par an sur ${years} ans`}
                      >
                        <defs>
                          <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
                            <stop stopColor="#b2c6a6" stopOpacity=".45" />
                            <stop
                              offset="1"
                              stopColor="#b2c6a6"
                              stopOpacity="0"
                            />
                          </linearGradient>
                        </defs>
                        {[35, 80, 125].map((y) => (
                          <path
                            key={y}
                            d={`M0 ${y}H540`}
                            stroke="#dfe5dc"
                            strokeDasharray="3 5"
                          />
                        ))}
                        <path d={`${curve()} L530 150H0Z`} fill="url(#fill)" />
                        <path
                          d={curve()}
                          fill="none"
                          stroke="#45634a"
                          strokeWidth="2.5"
                        />
                        <text x="0" y="149">
                          Aujourd’hui
                        </text>
                        <text x="480" y="149">
                          + {years} ans
                        </text>
                      </svg>
                      <p className="assumption">
                        Hypothèse : {s.target_bps / 100} % par an,
                        capitalisation annuelle, sans frais ni nouveaux dépôts.
                        Cette projection n’est pas acquise.
                      </p>
                    </section>
                  </div>
                </>
              )}
              {tab !== "history" && (
                <div className="lower-grid">
                  <section className="agent-card">
                    <div className="section-top">
                      <h3>
                        <span className="icon-box">
                          <Icon name="leaf" />
                        </span>{" "}
                        Un agent, vos règles.
                      </h3>
                      <span
                        className={"badge " + (!s.agent_paused ? "green" : "")}
                      >
                        {!s.agent_paused ? "Mandat actif" : "En pause"}
                      </span>
                    </div>
                    <p>
                      Il propose et alloue dans les limites que vous signez.
                    </p>
                    <div className="agent-limits">
                      <span>
                        Allocation maximale
                        <strong>
                          {s.policy ? s.policy.allocation_bps / 100 : 0} %
                        </strong>
                      </span>
                      <span>
                        Par opération
                        <strong>
                          {format(s.policy?.max_operation)}{" "}
                          <small>demoUSD</small>
                        </strong>
                      </span>
                      <span>
                        Stratégies autorisées
                        <strong>
                          01 <small>simulation</small>
                        </strong>
                      </span>
                    </div>
                    <div className="button-row">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => open("policy")}
                      >
                        Définir le mandat
                      </button>
                      <button
                        className="primary"
                        disabled={busy || s.agent_paused}
                        onClick={() =>
                          run("Exécution de l’agent", async () => {
                            if (mode === "local") return perform("allocate");
                            const p = propose(
                              s,
                              s.policy,
                              BigInt(Date.now()) * 1_000_000n,
                            );
                            if (p.amount === "0") throw new Error(p.reason);
                            await transaction(s.account_id, "agent_allocate", {
                              amount: p.amount,
                              ownership_epoch: s.ownership_epoch,
                              policy_version: s.policy_version,
                            });
                            await refresh();
                          })
                        }
                      >
                        Lancer <Icon name="arrow" />
                      </button>
                      {mode === "local" && (
                        <button
                          className="text-button"
                          disabled={busy || s.agent_paused}
                          onClick={() =>
                            run("Test du plafond de l’agent", () =>
                              perform("probe"),
                            )
                          }
                        >
                          Tester le plafond
                        </button>
                      )}
                      <button
                        className="text-button"
                        disabled={busy || s.agent_paused}
                        onClick={() =>
                          run("Révocation", async () => {
                            if (mode === "local") return perform("revoke");
                            await transaction(s.account_id, "pause_agent", {});
                            await refresh();
                          })
                        }
                      >
                        Révoquer
                      </button>
                    </div>
                  </section>
                  <section className="security-card">
                    <div className="section-top">
                      <h3>
                        <Icon name="shield" /> Un contrôle qui dure.
                      </h3>
                      <span className="badge">ML-DSA-65</span>
                    </div>
                    <dl>
                      <div>
                        <dt>Propriétaire vérifié</dt>
                        <dd>{s.owner_id}</dd>
                      </div>
                      <div>
                        <dt>Clé / propriété / politique</dt>
                        <dd>
                          v{s.key_version} / {s.ownership_epoch} /{" "}
                          {s.policy_version}
                        </dd>
                      </div>
                      <div>
                        <dt>Opération en attente</dt>
                        <dd>
                          {s.pending || s.status !== "Active"
                            ? "Oui — compte bloqué"
                            : "Aucune"}
                        </dd>
                      </div>
                    </dl>
                    <div className="security-actions">
                      <button
                        className="text-button"
                        onClick={() => open("rotate")}
                      >
                        <Icon name="key" size={16} /> Renouveler ma clé
                      </button>
                      <button
                        className="text-button"
                        onClick={() => open("transfer")}
                      >
                        Transférer le plan ↗
                      </button>
                      {mode === "testnet" && (
                        <button
                          className="text-button"
                          onClick={() => open("receive")}
                        >
                          Préparer ma réception
                        </button>
                      )}
                    </div>
                  </section>
                </div>
              )}
              <section className="activity">
                <div className="section-top">
                  <h3>Les derniers mouvements</h3>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => run("Actualisation", refresh)}
                  >
                    Actualiser ↻
                  </button>
                </div>
                {logs.length === 0 ? (
                  <p className="muted">
                    Vos opérations de cette session apparaîtront ici.
                    L’historique complet se consulte dans les événements du
                    compte.
                  </p>
                ) : (
                  logs.slice(0, tab === "history" ? 100 : 5).map((l, i) => (
                    <div className="activity-row" key={i}>
                      <span
                        className={
                          l.ok ? "activity-icon" : "activity-icon rejected"
                        }
                      >
                        {l.ok ? "↗" : "×"}
                      </span>
                      <div>
                        <strong>{operationLabel(l.label)}</strong>
                        <p>{l.ok ? l.detail : friendlyError(l.detail)}</p>
                      </div>
                      <span className={l.ok ? "positive" : "negative"}>
                        {l.ok ? "Traité" : "Refusé"}
                      </span>
                      {l.hash && mode === "testnet" && (
                        <a
                          href={`https://testnet.nearblocks.io/txns/${l.hash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          ↗
                        </a>
                      )}
                    </div>
                  ))
                )}
              </section>
            </>
          )}
          <footer>
            <span>
              everkeep. <span>L’épargne qui vous suit.</span>
            </span>
            <small>
              Prototype de hackathon · Non audité · Aucune garantie de rendement
            </small>
          </footer>
        </div>
      </main>
      {modal && (
        <div className="modal-backdrop" onClick={() => !busy && setModal("")}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Fermer"
              disabled={busy}
              onClick={() => setModal("")}
            >
              ×
            </button>
            <span className="eyebrow">
              {mode === "local"
                ? "SIGNATAIRE LOCAL DE SANDBOX"
                : "AUTORISATION TESTNET"}
            </span>
            <h2 id="modal-title">
              {
                (
                  {
                    create: "Un nouveau départ.",
                    deposit: "Alimenter votre plan.",
                    withdraw: "Retirer des fonds.",
                    redeem: "Récupérer ma position.",
                    policy: "Votre agent, vos limites.",
                    rotate: "Une nouvelle clé.",
                    transfer: "Transmettre votre plan.",
                    receive: "Préparer ma réception.",
                  } as Record<string, string>
                )[modal]
              }
            </h2>
            {mode === "local" && (
              <p>
                Les clés de test restent dans le processus local. Les signatures
                sont vérifiées par le contrat en sandbox.
              </p>
            )}
            {["deposit", "withdraw", "redeem", "policy"].includes(modal) && (
              <label>
                {modal === "policy" ? "Plafond par opération" : "Montant"}{" "}
                (demoUSD)
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                />
              </label>
            )}
            {modal === "transfer" && mode === "testnet" && (
              <p>
                Le destinataire doit d’abord enregistrer sa nouvelle clé depuis
                son compte avec « Préparer ma réception ». Il doit générer cette
                clé lui-même.
              </p>
            )}
            {["withdraw", "transfer"].includes(modal) && (
              <label>
                Bénéficiaire{" "}
                {mode === "local" ? "(vide : compte de test suivant)" : ""}
                <input
                  value={beneficiary}
                  onChange={(e) => setBeneficiary(e.target.value)}
                  placeholder="bob.testnet"
                />
              </label>
            )}
            {modal === "policy" && (
              <>
                <label>
                  Votre intention
                  <textarea
                    value={natural}
                    onChange={(e) => setNatural(e.target.value)}
                  />
                </label>
                <button
                  className="text-button"
                  onClick={() =>
                    run("Proposition à confirmer", async () =>
                      JSON.stringify(interpret(natural)),
                    )
                  }
                >
                  Analyser la proposition
                </button>
                {mode === "testnet" && (
                  <label>
                    Compte de l’agent
                    <input
                      value={agent}
                      onChange={(e) => setAgent(e.target.value)}
                    />
                  </label>
                )}
                <p>
                  Une seule stratégie autorisée. Budget de période : 200
                  demoUSD. Expiration : environ 22 heures.
                </p>
              </>
            )}
            {mode === "testnet" && ["rotate", "transfer"].includes(modal) && (
              <label>
                Nouvelle clé publique ML-DSA (base64)
                <textarea
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                />
              </label>
            )}
            {modal === "withdraw" && mode === "testnet" && s && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  run("Stockage du bénéficiaire", () =>
                    transaction(
                      s.asset,
                      "storage_deposit",
                      {
                        account_id: beneficiary || s.owner_id,
                        registration_only: true,
                      },
                      "10000000000000000000000",
                    ),
                  )
                }
              >
                Préparer le stockage du bénéficiaire (0,01 NEAR de test)
              </button>
            )}
            {modal === "deposit" && mode === "testnet" && (
              <p>
                Le dépôt prépare aussi le stockage du plan et de sa position :
                jusqu’à 0,03 NEAR de test, distincts de votre épargne.
              </p>
            )}
            {modal === "create" && mode === "testnet" && (
              <>
                <label>
                  Nom du plan
                  <input
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    placeholder="avenir"
                  />
                </label>
                <p>
                  6 NEAR de test financent le code, le stockage et la réserve
                  technique. Préparez localement la preuve d’initialisation pour
                  ce nom et votre compte connecté.
                </p>
              </>
            )}
            {mode === "testnet" && modal !== "deposit" && (
              <>
                <div className="button-row">
                  {
                    <button
                      className="secondary"
                      onClick={() =>
                        run("Préparation du message", async () => prepare())
                      }
                    >
                      Préparer le message
                    </button>
                  }
                  {request && (
                    <button className="secondary" onClick={download}>
                      Exporter pour signature
                    </button>
                  )}
                </div>
                {request && <pre>{JSON.stringify(request, null, 2)}</pre>}
                <label>
                  {modal === "create"
                    ? "Clé publique et preuve d’initialisation"
                    : modal === "receive"
                      ? "Consentement signé localement"
                      : "Autorisation signée et preuve de nouvelle clé si nécessaire"}
                  <textarea
                    value={signed}
                    onChange={(e) => setSigned(e.target.value)}
                    placeholder='{"message":"…","signature":"…","new_key_proof":null}'
                  />
                </label>
                <p>
                  Utilisez l’outil local <code>npm run sign</code>. Ne collez
                  jamais une clé privée ici.
                </p>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary full"
              disabled={busy}
              onClick={() => run("Confirmation : " + modal, submit)}
            >
              {busy
                ? "Vérification en cours…"
                : modal === "policy"
                  ? "Confirmer et signer le mandat"
                  : "Confirmer"}{" "}
              <Icon name="arrow" />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
