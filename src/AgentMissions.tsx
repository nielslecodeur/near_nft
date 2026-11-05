import {
  requestVault,
  saveVaultData,
  vaultData,
  privateRecord,
  savePrivateRecord,
} from "./key-vault";
import { AgentConversation } from "./AgentConversation";
import { AgentProposal } from "./AgentProposal";
import { CreationSteps } from "./CreationSteps";
import { OperationError } from "./OperationError";
import { TestnetWelcome } from "./TestnetWelcome";
import { usePublicChoice } from "./ux-intent";
import type { ConversationDraft } from "../packages/agent/conversation";
import { useEffect, useRef, useState } from "react";
import {
  identities,
  parseBudget,
  type MissionRequest,
  type ProfileId,
} from "../packages/agent/missions";
import type {
  MissionCatalogue,
  MissionView,
  Mission,
} from "../packages/shared/missions";
import { displayAmount } from "../packages/shared/ui";
import { OrbitGlyph } from "./OrbitGlyph";
import "./agent-missions.css";
const near = (v: string) => {
  const n = BigInt(v),
    whole = n / 10n ** 24n,
    rest = (n % 10n ** 24n).toString().padStart(24, "0").replace(/0+$/, "");
  return whole.toString() + (rest ? "." + rest : "");
};
const date = (v: string) =>
  new Date(Number(BigInt(v) / 1_000_000n)).toLocaleString("fr-FR");
const states: Record<Mission["state"], string> = {
  Quote: "Devis",
  Paid: "Paiement confirmé",
  Processing: "Analyse en cours",
  Delivered: "Analyse livrée",
  Failed: "Analyse échouée",
  RefundClaimable: "Remboursement réclamable",
  Refunded: "Remboursée",
};
const opStates: Record<string, string> = {
  Reserved: "Compte réservé",
  Verifying: "Signature en vérification",
  Rejected: "Autorisation refusée",
  Authorized: "Autorisation confirmée",
  Funding: "Souscription en attente",
  Uncertain: "Résultat à réconcilier",
  Confirmed: "Position NFT confirmée",
};
const initial: MissionRequest = {
  amount: "100",
  asset: "demoUSD",
  horizonDays: 1,
  liquidity: "at-maturity",
  avoid: "none",
  excluded: "",
  notes: "",
};
type Approval = {
  action: string;
  title: string;
  detail: string;
  extra: Record<string, unknown>;
};
export function AgentMissions({
  api,
  actor,
  owner,
  now,
  onWorking,
  onPositionsChanged,
  transport,
  loadCatalogue,
  testnet = false,
}: {
  api: string;
  actor: string;
  owner: string;
  now: bigint;
  onWorking: (busy: boolean) => void;
  onPositionsChanged: () => void;
  transport?: (body: Record<string, unknown>) => Promise<any>;
  loadCatalogue?: () => Promise<MissionCatalogue>;
  testnet?: boolean;
}) {
  const [conversationKey, setConversationKey] = useState(0),
    [conversationDraft, setConversationDraft] = useState<ConversationDraft>({}),
    [caps, setCaps] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"choose" | "mission" | "history">("choose"),
    [catalogue, setCatalogue] = useState<MissionCatalogue | null>(null),
    [agent, setAgent] = usePublicChoice<ProfileId>(
      "agent-expert",
      "liquidity",
      (v) => ["tradfi", "crypto", "liquidity"].includes(v),
    ),
    [request, setRequest] = useState({
      ...initial,
      amount: testnet ? "50" : "100",
      horizonDays: testnet ? 30 : 1,
    }),
    [view, setView] = useState<MissionView | null>(null),
    [history, setHistory] = useState<Mission[]>([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [approval, setApproval] = useState<Approval | null>(null);
  const lock = useRef(false),
    dialog = useRef<HTMLDialogElement>(null);
  const bucket = `everkeep.missions.v1:${api}:${owner}`;
  const activeKey = "everkeep.active-mission:" + api + ":" + owner;
  function capabilities(): Record<string, string> {
    try {
      return { ...JSON.parse(localStorage.getItem(bucket) || "{}"), ...caps };
    } catch {
      return {};
    }
  }
  async function post(body: Record<string, unknown>) {
    if (transport) return transport(body);
    const r = await fetch(api + "/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, actor }),
    });
    const value = await r.json();
    if (!r.ok) throw new Error(value.error || "La transaction a échoué.");
    return value;
  }
  async function refreshHistory() {
    const result = await post({ action: "history" });
    setHistory(result.missions);
  }
  async function open(id: string) {
    let capability = capabilities()[id];
    if (!capability && testnet) {
      try {
        await requestVault(owner);
        const restored =
          (await vaultData<Record<string, string>>(owner, bucket)) || {};
        setCaps(restored);
        capability = restored[id];
      } catch (e) {
        setError(String(e));
        return;
      }
    }
    if (!capability) {
      setError(
        "Le document privé n’est pas disponible dans ce navigateur. Le contrat conserve les états publics ; la capacité d’accès reste nécessaire.",
      );
      return;
    }
    try {
      if (testnet) {
        await requestVault(owner);
        const retained = {
          ...((await vaultData<Record<string, string>>(owner, bucket)) || {}),
          ...capabilities(),
          [id]: capability,
        };
        await saveVaultData(owner, bucket, retained);
        setCaps(retained);
        localStorage.removeItem(bucket);
      }
      const restored = await post({ action: "get", id, capability });
      setView(restored);
      setAgent(restored.mission.profile.id);
      setRequest(restored.document.request);
      localStorage.setItem(activeKey, id);
      setTab("mission");
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const r = loadCatalogue
          ? null
          : await fetch(api + "/missions/catalogue");
        if (r && !r.ok)
          throw new Error(
            "La marketplace d’agents n’est pas disponible sur cette session.",
          );
        const c = loadCatalogue ? await loadCatalogue() : await r!.json();
        if (active) setCatalogue(c);
        const h = owner ? await post({ action: "history" }) : { missions: [] };
        if (active) setHistory(h.missions);
      } catch (e) {
        if (active) setError(String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, actor, owner]);
  useEffect(() => {
    if (approval) dialog.current?.showModal();
    else dialog.current?.close();
  }, [approval]);
  const mission = view?.mission,
    proposal = view?.document.proposal,
    profile = catalogue?.configuration.profiles.find((p) => p.id === agent);
  async function perform(action: string, extra: Record<string, unknown> = {}) {
    if (lock.current) return;
    lock.current = true;
    setBusy(action);
    onWorking(true);
    setError("");
    setNotice("");
    try {
      let id = (extra.id as string | undefined) || mission?.id,
        capability = id ? capabilities()[id] : undefined;
      const openingQuote =
        action === "quote" ||
        action === "quote_pay" ||
        action === "renew_quote";
      if (openingQuote) {
        parseBudget(request.amount);
        const activeId = localStorage.getItem(activeKey);
        id =
          action === "renew_quote"
            ? activeId && activeId !== mission?.id
              ? activeId
              : crypto.randomUUID()
            : activeId || crypto.randomUUID();
        let retainedCaps = capabilities();
        let previousCap: string | undefined = retainedCaps[id];
        if (testnet && localStorage.getItem(activeKey) === id && !previousCap) {
          await requestVault(owner);
          const restored = await vaultData<Record<string, string>>(
            owner,
            bucket,
          );
          previousCap = restored?.[id];
          retainedCaps = { ...retainedCaps, ...restored };
          if (!previousCap)
            throw new Error(
              "Restaurez la sauvegarde de cette mission et utilisez Retrouver mon suivi. Aucun nouveau devis envoyé.",
            );
          setCaps(restored!);
        }
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        capability = btoa(String.fromCharCode(...bytes))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
        capability = previousCap || capability;
        if (testnet) {
          await requestVault(owner);
          const secretData = { ...retainedCaps, [id]: capability };
          await saveVaultData(owner, bucket, secretData);
          for (const oldId of Object.keys(secretData)) {
            const old = await privateRecord<Record<string, unknown>>(
              "mission:" + catalogue!.contract + ":" + oldId,
            );
            if (old)
              await savePrivateRecord(
                "mission:" + catalogue!.contract + ":" + oldId,
                { ...old, owner },
              );
          }
          setCaps(secretData);
        } else setCaps({ ...capabilities(), [id]: capability });
        localStorage.setItem(activeKey, id);
      }
      let result = await post({
        action: openingQuote ? (testnet ? "quote_pay" : "quote") : action,
        id,
        capability,
        command_id: crypto.randomUUID(),
        ...(openingQuote
          ? { agent, request, expected_price: profile!.price }
          : {}),
        ...extra,
      });
      if (
        (action === "pay" || openingQuote) &&
        result.mission.state === "Paid"
      ) {
        setBusy("analyze");
        result = await post({ action: "analyze", id, capability });
      }
      if (result.document) setView(result);
      if (openingQuote && result.document) localStorage.removeItem(bucket);
      setTab(result.document ? "mission" : "history");
      setNotice(
        action === "execute" &&
          result.mission.operations.some(
            (o: { state: string } | null) => o?.state !== "Confirmed",
          )
          ? "Résultat partiel : relisez chaque opération avant de reprendre."
          : testnet
            ? "État confirmé et relu sur NEAR Testnet."
            : "État confirmé et relu sur les contrats NEAR sandbox.",
      );
      await refreshHistory();
    } catch (e) {
      setError(String(e));
      if (mission) {
        try {
          setView(
            await post({
              action: "get",
              id: mission.id,
              capability: capabilities()[mission.id],
            }),
          );
        } catch {
          /* Keep last confirmed data, never invent success. */
        }
      }
    } finally {
      setBusy("");
      onWorking(false);
      lock.current = false;
    }
  }
  function confirm(
    action: string,
    title: string,
    detail: string,
    extra: Record<string, unknown> = {},
  ) {
    setApproval({ action, title, detail, extra });
  }
  function field<K extends keyof MissionRequest>(
    key: K,
    value: MissionRequest[K],
  ) {
    setRequest({ ...request, [key]: value });
  }
  const confirmed =
    mission?.operations.filter((o) => o?.state === "Confirmed").length || 0;
  const terminalFailure =
    !!mission &&
    ["Failed", "RefundClaimable", "Refunded"].includes(mission.state);
  const steps = mission
    ? [
        { label: "Devis", reached: true },
        { label: "Paiement confirmé", reached: mission.paid_at !== null },
        {
          label: terminalFailure ? "Analyse non livrée" : "Analyse",
          reached: ["Processing", "Delivered"].includes(mission.state),
        },
        {
          label:
            mission.outcome === "abstain" ? "Abstention livrée" : "Proposition",
          reached: mission.state === "Delivered",
        },
        {
          label:
            mission.outcome === "abstain"
              ? "Sans investissement"
              : confirmed === mission.operations.length && confirmed > 0
                ? `${confirmed} NFT confirmé${confirmed > 1 ? "s" : ""}`
                : confirmed > 0
                  ? `Résultat partiel · ${confirmed}/${mission.operations.length} NFT`
                  : mission.operations.some(Boolean)
                    ? "Investissement en attente"
                    : "Investissement facultatif",
          reached:
            mission.state === "Delivered" &&
            (mission.outcome === "abstain" || mission.operations.some(Boolean)),
        },
      ]
    : [];
  const stage = steps.reduce(
    (last, step, index) => (step.reached ? index : last),
    -1,
  );
  return (
    <section
      className="agent-missions"
      aria-label="Marketplace des agents"
      aria-busy={!!busy || loading}
    >
      <div className="mission-heading">
        <div>
          <h1>Agents</h1>
          <p>
            Choisissez une expertise, préparez votre demande, puis examinez la
            proposition avant d’investir.
          </p>
        </div>
        <OrbitGlyph className="mission-orbit" />
      </div>
      <div className="conversation-navigation">
        <button
          disabled={!!busy}
          onClick={() => {
            setView(null);
            setTab("choose");
            setNotice("");
            setConversationDraft({});
            sessionStorage.removeItem("everkeep.ui.v1:agent-draft");
            sessionStorage.removeItem("everkeep.ui.v1:agent-prepared");
            setConversationKey((v) => v + 1);
            localStorage.removeItem(activeKey);
          }}
        >
          Nouvelle conversation
        </button>
        <button
          disabled={!!busy}
          aria-pressed={tab === "history"}
          onClick={() =>
            setTab(
              tab === "history" ? (mission ? "mission" : "choose") : "history",
            )
          }
        >
          Historique
        </button>
      </div>
      {!mission && owner && localStorage.getItem(activeKey) && (
        <p className="conversation-resume">
          Une mission est conservée pour ce compte.{" "}
          <button
            disabled={!!busy}
            onClick={() => void open(localStorage.getItem(activeKey)!)}
          >
            Retrouver mon suivi
          </button>
        </p>
      )}
      {loading && (
        <p role="status">Lecture des agents et des tarifs sur NEAR…</p>
      )}
      {error && (
        <>
          <OperationError
            error={error}
            onRetry={() =>
              mission ? void open(mission.id) : location.reload()
            }
          />
          {testnet && owner && /insuff|solde|budget technique/i.test(error) && (
            <TestnetWelcome
              owner={owner}
              onRefresh={() =>
                window.dispatchEvent(new Event("everkeep-balances"))
              }
              initiallyOpen
            />
          )}
        </>
      )}
      {notice && mission?.state !== "Delivered" && (
        <p role="status" className="feedback success">
          {notice}
        </p>
      )}
      {!!busy && (
        <p className="mission-pending" role="status">
          {busy === "analyze"
            ? "Analyse en cours, puis validation du résultat…"
            : busy === "authorize" || busy === "invest"
              ? "Création du compte et signatures ML-DSA locales en cours…"
              : "Transaction en attente de confirmation…"}{" "}
          Aucun succès n’est présumé.
        </p>
      )}
      {testnet && catalogue?.worker_ready === false && (
        <p role="status" className="feedback">
          Le service d’analyse est indisponible. Réessayez plus tard pour ouvrir
          une mission payante. Historique et remboursements restent consultables
          sur testnet.
        </p>
      )}
      {catalogue && tab !== "history" && !mission && (
        <AgentConversation
          key={conversationKey}
          catalogue={catalogue}
          initialDraft={conversationDraft}
          expert={agent}
          onExpert={setAgent}
          onRequest={setRequest}
          locked={!!mission}
          busy={!!busy}
          owner={owner}
          onQuote={() =>
            confirm(
              "quote",
              "Examiner et payer l’analyse",
              `Stockage du devis : ${near(catalogue.configuration.storage_reserve)} NEAR ; analyse : ${near(profile!.price)} NEAR, plus gas. ${testnet ? "Une seule validation dans Intear pour ces deux frais." : "Paiements distincts en démonstration locale."} Aucun demoUSD déplacé.`,
            )
          }
        />
      )}
      {tab === "mission" && mission && (
        <>
          {!(testnet && mission.state === "Delivered") && (
            <>
              <div className="mission-title">
                <div>
                  <h2>{identities[mission.profile.id].name}</h2>
                  <p>
                    Mission {mission.id} · version {mission.profile.version}
                  </p>
                </div>
                <strong>{states[mission.state]}</strong>
              </div>
              <ol className="mission-progress" aria-label="Progression réelle">
                {steps.map(({ label, reached }, i) => (
                  <li
                    key={label}
                    className={reached ? "is-reached" : ""}
                    aria-current={stage === i ? "step" : undefined}
                  >
                    {label}
                  </li>
                ))}
              </ol>
              {terminalFailure && (
                <p className="mission-branch" role="status">
                  {mission.state === "Refunded"
                    ? "Branche terminée : frais d’analyse remboursés."
                    : mission.state === "RefundClaimable"
                      ? "Branche de remboursement : créance réservée au commanditaire."
                      : "Échec de livraison : les frais d’analyse peuvent être réclamés."}{" "}
                  Le paiement confirmé reste enregistré ; aucun investissement
                  n’a été autorisé par cette mission.
                </p>
              )}
              <div className="mission-summary">
                <div>
                  <span>Analyse uniquement</span>
                  <strong>{near(mission.profile.price)} NEAR</strong>
                </div>
                <div>
                  <span>Budget envisagé</span>
                  <strong>{view.document.request.amount} demoUSD</strong>
                </div>
                <div>
                  <span>
                    {mission.deadline
                      ? "Délai de livraison"
                      : "Expiration du devis"}
                  </span>
                  <strong>
                    {date(mission.deadline || mission.quote_expires_at)}
                  </strong>
                </div>
              </div>
              {mission.state === "Quote" && (
                <div className="mission-review">
                  <h3>Votre devis est prêt</h3>
                  <p>{identities[mission.profile.id].deliverable}</p>
                  <p>
                    Livraison sous{" "}
                    {Number(
                      BigInt(mission.profile.processing_ns) / 1_000_000_000n,
                    )}{" "}
                    secondes à partir du paiement. En cas d’échec ou de délai
                    dépassé sans livraison, les frais d’analyse deviennent
                    remboursables sur réclamation. Stockage et gas ne sont pas
                    remboursés.
                  </p>
                  <p>
                    Le paiement rémunère l’analyse. Il ne finance pas votre
                    investissement et n’autorise aucune dépense sur votre
                    portefeuille.
                  </p>
                  <button
                    className="primary"
                    disabled={!!busy || now >= BigInt(mission.quote_expires_at)}
                    onClick={() =>
                      confirm(
                        "pay",
                        "Payer l’analyse",
                        `${near(mission.profile.price)} NEAR seront placés dans le séquestre de mission, plus le gas réseau. Aucun demoUSD ni droit d’investissement n’est engagé.`,
                        { expected_price: mission.profile.price },
                      )
                    }
                  >
                    Payer {near(mission.profile.price)} NEAR
                  </button>
                  {now >= BigInt(mission.quote_expires_at) && (
                    <p role="status">
                      Devis expiré. Préparez une nouvelle mission.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {mission.state === "Paid" && (
            <div className="mission-review">
              <h3>Votre analyse peut commencer</h3>
              <p>
                Le séquestre confirme le paiement. Aucun investissement n’a été
                autorisé.
              </p>
              <button
                className="primary"
                disabled={!!busy || now >= BigInt(mission.deadline!)}
                onClick={() => void perform("analyze")}
              >
                Lancer l’analyse
              </button>
              <details>
                <summary>Scénario d’échec de démonstration</summary>
                <p>
                  Une mission distincte peut être mise en échec pour vérifier le
                  remboursement réel en sandbox.
                </p>
                <button
                  disabled={!!busy}
                  onClick={() =>
                    confirm(
                      "demo_failure",
                      "Tester un échec de mission",
                      "Cette mission payée sera marquée en échec. Vous pourrez ensuite réclamer ses frais d’analyse.",
                    )
                  }
                >
                  Déclencher l’échec de test
                </button>
              </details>
            </div>
          )}
          {mission.state === "Processing" && (
            <div className="mission-review">
              <p role="status">
                Traitement engagé. Actualisez pour lire la livraison ; un double
                traitement est bloqué.
              </p>
              <button disabled={!!busy} onClick={() => void open(mission.id)}>
                Actualiser la mission
              </button>
            </div>
          )}
          {(mission.state === "Failed" ||
            (["Paid", "Processing"].includes(mission.state) &&
              now >= BigInt(mission.deadline!))) && (
            <div className="mission-review">
              <h3>Les frais d’analyse sont remboursables</h3>
              <p>
                {mission.failure || "Le délai de livraison est dépassé."} Aucun
                versement au prestataire ne peut être engagé après la
                réclamation.
              </p>
              <button
                disabled={!!busy}
                onClick={() =>
                  confirm(
                    "request_refund",
                    "Réclamer le remboursement",
                    `${near(mission.profile.price)} NEAR seront réservés pour ${mission.client}. Le retrait des frais sera une transaction distincte.`,
                  )
                }
              >
                Ouvrir la créance de remboursement
              </button>
            </div>
          )}
          {mission.state === "RefundClaimable" && (
            <div className="mission-review">
              <h3>Remboursement réservé</h3>
              <p>
                {near(mission.refund!.amount)} NEAR pour{" "}
                {mission.refund!.beneficiary}. État du transfert :{" "}
                {mission.refund!.state}.
              </p>
              <button
                disabled={!!busy || mission.refund?.state !== "Claimable"}
                onClick={() =>
                  confirm(
                    "claim_refund",
                    "Recevoir le remboursement",
                    `${near(mission.refund!.amount)} NEAR seront transférés au commanditaire enregistré, plus le gas réseau.`,
                  )
                }
              >
                Recevoir mes frais d’analyse
              </button>
            </div>
          )}
          {mission.state === "Refunded" && (
            <p className="feedback success">
              Les frais d’analyse ont été remboursés sur chaîne. Aucun
              investissement n’a été effectué par cette mission.
            </p>
          )}
          {testnet &&
            mission.state === "Delivered" &&
            proposal &&
            catalogue && (
              <AgentProposal
                view={view}
                catalogue={catalogue}
                now={now}
                busy={!!busy}
                onInvest={() =>
                  confirm(
                    "invest",
                    "Créer cette position",
                    `${displayAmount(proposal.allocations[0]?.amount || "0")} demoUSD seront déposés dans le modèle présenté. ${view.document.reuse_position ? "Aucune nouvelle provision de compte." : "Provision de création et enregistrement : 6,02 NEAR."} Gas séparé. Une validation groupée dans Intear ; aucun droit de retrait ou de revente à l’agent.`,
                    { index: 0 },
                  )
                }
                onRenew={() =>
                  confirm(
                    "renew_quote",
                    "Actualiser la proposition",
                    `Nouveau devis : ${near(catalogue.configuration.storage_reserve)} NEAR ; nouvelle analyse : ${near(profile!.price)} NEAR. Une validation groupée, sans nouvelle provision de 6 NEAR.`,
                    { reuse_from: mission.id, expected_price: profile!.price },
                  )
                }
                onModify={() => {
                  setConversationDraft(view.document.request);
                  setView(null);
                  setTab("choose");
                  setConversationKey((v) => v + 1);
                  localStorage.removeItem(activeKey);
                  setNotice(
                    "Modifiez les paramètres. Un nouveau devis et une nouvelle analyse seront payants.",
                  );
                }}
                onRefresh={() => void open(mission.id)}
                onPositions={onPositionsChanged}
                onCancel={() =>
                  confirm(
                    "cancel",
                    "Annuler la souscription",
                    "Le capital restera réservé au remboursement contractuel.",
                    { index: 0 },
                  )
                }
                onClaim={() =>
                  confirm(
                    "claim_subscription",
                    "Recevoir le remboursement",
                    "Le bénéficiaire enregistré reçoit la créance existante.",
                    { index: 0 },
                  )
                }
              />
            )}
          {!testnet && mission.state === "Delivered" && proposal && (
            <div className="mission-proposal">
              <div className="mission-proposal-head">
                <h3>
                  {proposal.status === "abstain"
                    ? "L’agent s’abstient"
                    : "Votre proposition"}
                </h3>
                <span>
                  {proposal.mode === "demonstration"
                    ? "Démonstration déterministe"
                    : "Adaptateur serveur"}{" "}
                  · valable jusqu’au {date(proposal.expires_at)}
                </span>
              </div>
              {!mission.operations.some(Boolean) && (
                <button
                  disabled={!!busy}
                  onClick={() => {
                    setConversationDraft(view.document.request);
                    setView(null);
                    setTab("choose");
                    setConversationKey((v) => v + 1);
                    localStorage.removeItem(activeKey);
                    setNotice(
                      "Modifiez les paramètres puis vérifiez-les dans Modifier les détails. Un nouveau devis et une nouvelle analyse seront facturés séparément ; la mission livrée reste dans l’historique.",
                    );
                  }}
                >
                  Modifier la demande
                </button>
              )}
              <div
                className="mission-allocation-bar"
                role="img"
                aria-label={
                  proposal.allocations
                    .map(
                      (a) =>
                        `${displayAmount(a.amount)} demoUSD vers ${a.strategy_id}`,
                    )
                    .join(", ") +
                  `, réserve ${displayAmount(proposal.reserve)} demoUSD`
                }
              >
                {proposal.allocations.map((a) => (
                  <span
                    key={a.collection}
                    style={{
                      flexGrow: Number(
                        (BigInt(a.amount) * 10000n) /
                          parseBudget(view.document.request.amount),
                      ),
                    }}
                  />
                ))}
                <span
                  className="is-reserve"
                  style={{
                    flexGrow: Number(
                      (BigInt(proposal.reserve) * 10000n) /
                        parseBudget(view.document.request.amount),
                    ),
                  }}
                />
              </div>
              <ul className="mission-allocation-list">
                {proposal.allocations.map((a) => (
                  <li key={a.collection}>
                    <div>
                      <strong>
                        {catalogue?.catalogue.find(
                          (c) => c.collection === a.collection,
                        )?.terms.name || a.strategy_id}{" "}
                        · v{a.strategy_version}
                      </strong>
                      <span>Position distincte · demoUSD de test</span>
                    </div>
                    <strong>{displayAmount(a.amount)} demoUSD</strong>
                  </li>
                ))}
                <li>
                  <div>
                    <strong>Réserve disponible</strong>
                    <span>Conservée dans votre compte</span>
                  </div>
                  <strong>{displayAmount(proposal.reserve)} demoUSD</strong>
                </li>
              </ul>
              <div className="mission-explanations">
                <div>
                  <h4>Pourquoi cette répartition</h4>
                  {proposal.reasons.map((s, i) => (
                    <p key={i}>{s}</p>
                  ))}
                </div>
                <div>
                  <h4>Risques et sortie</h4>
                  {[...proposal.risks, ...proposal.exits].map((s, i) => (
                    <p key={i}>{s}</p>
                  ))}
                </div>
              </div>
              <details>
                <summary>Sources, empreintes et opérations</summary>
                <p>
                  Empreinte de proposition : <code>{mission.result_hash}</code>
                </p>
                <p>
                  Engagement de demande : <code>{mission.request_hash}</code>
                </p>
                {proposal.sources.map((s) => (
                  <p key={s.collection}>
                    {s.collection}, version {s.version}, observé le{" "}
                    {date(s.observed_at)}. {s.limits}
                  </p>
                ))}
                {proposal.operations.map((s, i) => (
                  <p key={i}>{s}</p>
                ))}
                <p>
                  ML-DSA protège l’autorisation, pas la qualité de l’analyse ni
                  la sécurité économique du placement.
                </p>
              </details>
              {proposal.status === "proposed" && (
                <div className="mission-investment">
                  <h3>Votre position, sous vos règles</h3>
                  <p>
                    Provision technique :{" "}
                    {near(
                      (
                        BigInt(proposal.allocations.length) *
                        (view.document.reuse_position ? 0n : 602n) *
                        10n ** 22n
                      ).toString(),
                    )}{" "}
                    NEAR pour {proposal.allocations.length} position(s), plus
                    gas. Dépôt initial exact uniquement ; aucun retrait, revente
                    ou droit de gestion continue accordé à l’agent. Chaque
                    position et ses transactions restent distinctes.
                  </p>
                  <p>
                    Une position NFT distincte par stratégie. La réserve n’est
                    pas dépensée. Aucun droit de retrait, de revente ou de
                    gestion continue n’est accordé à l’agent.
                  </p>
                  {view.document.reuse_position && (
                    <p>
                      Compte existant réutilisé :{" "}
                      <code>{view.document.reuse_position}</code>. Aucun nouveau
                      coût de création ou d’enregistrement ; seuls les frais
                      réseau des nouvelles autorisations et du dépôt restent à
                      signer.
                    </p>
                  )}
                  {testnet && !view.document.reuse_position && (
                    <p>
                      La première création demande jusqu’à sept confirmations
                      distinctes dans le wallet : réservation, compte,
                      enregistrement, deux consentements, dépôt et confirmation
                      finale. Une reprise relit les étapes déjà confirmées.
                    </p>
                  )}
                  {!view.document.reviewed_hash ? (
                    <button
                      className="primary"
                      disabled={!!busy || now >= BigInt(proposal.expires_at)}
                      onClick={() => void perform("prepare")}
                    >
                      Confirmer et continuer
                    </button>
                  ) : (
                    <p className="mission-prepared">
                      Proposition examinée. Chaque signature revérifie les
                      versions, échéances et capacités.
                    </p>
                  )}
                  {confirmed < proposal.allocations.length &&
                    now >= BigInt(proposal.expires_at) && (
                      <p role="alert">
                        Proposition expirée. Préparez une nouvelle mission avant
                        toute signature.
                      </p>
                    )}
                  {testnet &&
                    mission.operations.length === 1 &&
                    mission.operations[0]?.state === "Authorized" &&
                    !view.subscriptions[0] &&
                    now >=
                      BigInt(
                        mission.operations[0].authorization_expires_at || "0",
                      ) && (
                      <div className="mission-review">
                        <h4>Renouveler sans recréer le compte</h4>
                        <p>
                          L’autorisation a expiré avant le dépôt. Le compte
                          provisionné est conservé. Un nouveau devis coûte{" "}
                          {near(catalogue!.configuration.storage_reserve)} NEAR,
                          puis une nouvelle analyse{" "}
                          {near(mission.profile.price)} NEAR, plus gas. Aucun
                          nouveau paiement de 6 NEAR. Vous examinerez une
                          nouvelle proposition avant toute autorisation.
                        </p>
                        <button
                          disabled={!!busy}
                          onClick={() =>
                            confirm(
                              "renew_quote",
                              "Renouveler le devis sur le compte existant",
                              `${near(catalogue!.configuration.storage_reserve)} NEAR pour le nouveau devis, puis ${near(mission.profile.price)} NEAR d’analyse séparément. Le compte déjà créé sera réutilisé ; aucune seconde provision de 6 NEAR. L’ancienne autorisation devra être annulée puis remplacée par des signatures neuves.`,
                              { reuse_from: mission.id },
                            )
                          }
                        >
                          Renouveler le devis sur ce compte
                        </button>
                      </div>
                    )}
                  {testnet &&
                    proposal.allocations.map((a, index) => {
                      const state = mission.operations[index]?.state;
                      return state === "Confirmed" ? (
                        <a
                          key={a.collection}
                          href="#positions"
                          onClick={onPositionsChanged}
                        >
                          Ouvrir ma position NFT confirmée
                        </a>
                      ) : (
                        <div key={a.collection}>
                          {state && (
                            <p role="status">
                              {opStates[state] || state}.{" "}
                              {state === "Authorized" &&
                              !view.subscriptions[index]
                                ? "Aucun capital déposé : la reprise propose le dépôt exact, puis sa confirmation."
                                : "Relisez le suivi avant de reprendre."}
                            </p>
                          )}
                          <button
                            className="primary"
                            key={a.collection}
                            disabled={
                              !!busy ||
                              (now >= BigInt(proposal.expires_at) &&
                                !["Funding", "Uncertain"].includes(state || ""))
                            }
                            onClick={() =>
                              confirm(
                                "invest",
                                "Autoriser et créer la position",
                                view.document.reuse_position
                                  ? displayAmount(a.amount) +
                                      " demoUSD seront déposés dans le compte existant. Aucune nouvelle provision de 6 NEAR ni nouvel enregistrement. L’ancien mandat expiré sera annulé, puis remplacé par deux consentements neufs, suivis du dépôt exact et de sa confirmation. Gas uniquement en NEAR ; aucun retrait ou droit de revente accordé à l’agent."
                                  : displayAmount(a.amount) +
                                      " demoUSD seront investis dans une position distincte. Provision : 6 NEAR ; enregistrement : 0,02 NEAR, plus gas. Votre wallet confirmera les transactions nécessaires et le signataire local les autorisations ML-DSA. Aucun droit de retrait ou de revente accordé à l’agent.",
                                { index },
                              )
                            }
                          >
                            {state
                              ? "Reprendre la création de cette position"
                              : "Autoriser et créer ma position"}
                          </button>
                        </div>
                      );
                    })}
                  {!testnet &&
                    !!view.document.reviewed_hash &&
                    proposal.allocations.map((a, index) => {
                      const op = mission.operations[index],
                        substate = op?.state;
                      return (
                        <article
                          className="mission-operation"
                          key={a.collection}
                        >
                          <div>
                            <h4>
                              {a.strategy_id} · {displayAmount(a.amount)}{" "}
                              demoUSD
                            </h4>
                            <p>
                              {op
                                ? opStates[op.state]
                                : "Aucune autorisation signée"}
                            </p>
                            {op && <code>{op.position}</code>}
                          </div>
                          <div className="mission-operation-actions">
                            {(!op ||
                              ["Reserved", "Rejected"].includes(substate!)) && (
                              <button
                                disabled={
                                  !!busy || now >= BigInt(proposal.expires_at)
                                }
                                onClick={() =>
                                  confirm(
                                    "authorize",
                                    "Autoriser cette souscription",
                                    `Créer le compte de position coûte 6 NEAR de provision technique et 0,02 NEAR d’enregistrement dans la stratégie, plus le gas. Deux autorisations ML-DSA locales lieront cette mission, sa proposition, ${displayAmount(a.amount)} demoUSD, ${a.asset}, ${a.strategy}, version ${a.strategy_version}, au NFT de ${owner}. L’agent peut consommer ce dépôt unique, sans retrait ni revente. Aucun capital déposé à cette étape.`,
                                    {
                                      index,
                                      proposal_hash: mission.result_hash,
                                    },
                                  )
                                }
                              >
                                Signer les autorisations ML-DSA
                              </button>
                            )}
                            {(substate === "Authorized" ||
                              (substate === "Uncertain" &&
                                !view.subscriptions[index])) && (
                              <>
                                <button
                                  disabled={
                                    !!busy ||
                                    now >= BigInt(proposal.expires_at) ||
                                    !!view.subscriptions[index]
                                  }
                                  onClick={() =>
                                    confirm(
                                      "fund",
                                      "Déposer le montant exact",
                                      `${displayAmount(a.amount)} demoUSD seront transférés de votre compte au séquestre de souscription ${a.collection}. Le contrat refuse un second dépôt. Aucun investissement supplémentaire n’est autorisé.`,
                                      { index, expected_amount: a.amount },
                                    )
                                  }
                                >
                                  Déposer {displayAmount(a.amount)} demoUSD
                                </button>
                                <button
                                  disabled={
                                    !!busy ||
                                    now >= BigInt(proposal.expires_at) ||
                                    view.subscriptions[index]?.state !==
                                      "Authorized" ||
                                    substate !== "Authorized"
                                  }
                                  onClick={() =>
                                    confirm(
                                      "execute",
                                      "Exécuter la souscription autorisée",
                                      `La mission peut consommer une fois le dépôt de ${displayAmount(a.amount)} demoUSD vers la stratégie fixée. Le NFT reste à ${owner}. Si le dépôt n’est pas encore confirmé, l’exécution échouera sans le remplacer.`,
                                      { index },
                                    )
                                  }
                                >
                                  Exécuter la souscription
                                </button>
                              </>
                            )}
                            {["Funding", "Uncertain"].includes(substate!) && (
                              <>
                                <button
                                  disabled={!!busy}
                                  onClick={() =>
                                    void perform("reconcile", { index })
                                  }
                                >
                                  Relire le NFT et le financement
                                </button>
                                {substate === "Uncertain" && (
                                  <button
                                    disabled={!!busy}
                                    onClick={() =>
                                      void perform("retry", { index })
                                    }
                                  >
                                    Vérifier si une reprise est possible
                                  </button>
                                )}
                              </>
                            )}
                            {substate === "Confirmed" && (
                              <a
                                href="#positions"
                                onClick={() => onPositionsChanged()}
                              >
                                Voir ma position NFT
                              </a>
                            )}
                            {!!op &&
                              !["Funding", "Uncertain", "Confirmed"].includes(
                                substate!,
                              ) && (
                                <button
                                  disabled={!!busy}
                                  onClick={() =>
                                    confirm(
                                      "cancel",
                                      "Révoquer le mandat de souscription",
                                      "Une signature propriétaire annule le mandat s’il n’est pas déjà en cours de financement. Un dépôt réservé devient remboursable au propriétaire.",
                                      { index },
                                    )
                                  }
                                >
                                  Révoquer le mandat
                                </button>
                              )}
                            {!!op && substate !== "Confirmed" && (
                              <details>
                                <summary>
                                  Remboursement d’un dépôt annulé
                                </summary>
                                <button
                                  disabled={!!busy}
                                  onClick={() =>
                                    confirm(
                                      "claim_subscription",
                                      "Réclamer le dépôt annulé",
                                      "Le contrat paie uniquement une créance de souscription existante, au propriétaire enregistré. Une exécution en cours ne peut pas être remboursée simultanément.",
                                      { index },
                                    )
                                  }
                                >
                                  Réclamer le dépôt
                                </button>
                              </details>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  <p>
                    Ces opérations ne sont pas atomiques. Une position confirmée
                    n’est jamais souscrite de nouveau ; les résultats incertains
                    restent réservés jusqu’à réconciliation.
                  </p>
                </div>
              )}
              <details>
                <summary>Paiement du prestataire</summary>
                <p>
                  La livraison conforme au protocole ouvre une créance de{" "}
                  {near(mission.profile.price)} NEAR pour l’opérateur. Elle
                  n’atteste pas la qualité financière du conseil. État :{" "}
                  {mission.provider?.state}.
                </p>
                <button
                  disabled={!!busy || mission.provider?.state !== "Claimable"}
                  onClick={() =>
                    confirm(
                      "claim_provider",
                      "Verser les frais au prestataire",
                      "Le contrat verse les frais d’analyse à l’opérateur fixe. Aucun capital d’investissement n’est concerné.",
                    )
                  }
                >
                  Exécuter le versement de test
                </button>
              </details>
            </div>
          )}
          {!(testnet && mission.state === "Delivered") && (
            <button
              className="mission-refresh"
              disabled={!!busy}
              onClick={() => void open(mission.id)}
            >
              Actualiser les états sur NEAR
            </button>
          )}
        </>
      )}
      {tab === "history" && (
        <section className="mission-history">
          <div className="mission-history-heading">
            <h2>Vos missions</h2>
            <button
              disabled={!!busy}
              onClick={() =>
                void refreshHistory().catch((e) => setError(String(e)))
              }
            >
              Actualiser
            </button>
          </div>
          {history.length === 0 ? (
            <p>
              Aucune mission pour ce compte. Choisissez un agent pour commencer.
            </p>
          ) : (
            <ul>
              {history
                .slice()
                .reverse()
                .map((m) => (
                  <li key={m.id}>
                    <div>
                      <strong>{identities[m.profile.id].name}</strong>
                      <span>{m.id}</span>
                    </div>
                    <div>
                      <strong>{states[m.state]}</strong>
                      <span className="mission-history-result">
                        {missionOutcome(m)}
                      </span>
                      <span>{near(m.profile.price)} NEAR · analyse</span>
                      {!capabilities()[m.id] && (
                        <span>
                          Résultat privé indisponible dans ce navigateur
                        </span>
                      )}
                    </div>
                    <button disabled={!!busy} onClick={() => void open(m.id)}>
                      Ouvrir la mission
                    </button>
                    {testnet &&
                      (m.state === "Failed" ||
                        (["Paid", "Processing"].includes(m.state) &&
                          now >= BigInt(m.deadline || "0"))) && (
                        <button
                          disabled={!!busy}
                          onClick={() =>
                            confirm(
                              "request_refund",
                              "Réclamer le remboursement",
                              near(m.profile.price) +
                                " NEAR seront réservés pour le commanditaire.",
                              { id: m.id },
                            )
                          }
                        >
                          Ouvrir le remboursement
                        </button>
                      )}
                    {testnet &&
                      m.state === "RefundClaimable" &&
                      m.refund?.state === "Claimable" && (
                        <button
                          disabled={!!busy}
                          onClick={() =>
                            confirm(
                              "claim_refund",
                              "Recevoir les frais",
                              near(m.refund!.amount) +
                                " NEAR seront transférés au bénéficiaire fixe.",
                              { id: m.id },
                            )
                          }
                        >
                          Recevoir le remboursement
                        </button>
                      )}
                  </li>
                ))}
            </ul>
          )}
          <p>
            Les documents privés s’ouvrent avec la capacité conservée dans ce
            navigateur. Les données publiques seules n’autorisent ni leur
            lecture, ni un investissement.
          </p>
        </section>
      )}
      <dialog
        ref={dialog}
        className="mission-confirm"
        onCancel={() => setApproval(null)}
        onClose={() => setApproval(null)}
        aria-labelledby="mission-confirm-title"
      >
        {approval && (
          <>
            <h2 id="mission-confirm-title">{approval.title}</h2>
            {approval.action === "invest" && <CreationSteps step={2} />}
            <p>{approval.detail}</p>
            <p>
              {testnet ? "Wallet signataire : " : "Compte de démonstration : "}
              <strong>{actor}</strong> ·{" "}
              {testnet ? "NEAR Testnet" : "NEAR sandbox"}.
              {testnet
                ? "Les transactions sont signées par le wallet. Votre clé d’autorisation reste protégée dans le coffre local chiffré."
                : "Les signatures propriétaires sont réalisées dans le service local de démonstration."}
            </p>
            <div>
              <button onClick={() => setApproval(null)}>Annuler</button>
              <button
                className="primary"
                onClick={() => {
                  const p = approval;
                  setApproval(null);
                  void perform(p.action, p.extra);
                }}
              >
                Confirmer
              </button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
function missionOutcome(m: Mission): string {
  if (m.state !== "Delivered")
    return m.state === "Quote"
      ? "Analyse non payée"
      : ["Paid", "Processing"].includes(m.state)
        ? "Analyse attendue · aucun investissement"
        : "Aucune proposition investissable";
  if (m.outcome === "abstain") return "Abstention · aucun investissement";
  const confirmed = m.operations.filter((o) => o?.state === "Confirmed").length,
    total = m.operations.length;
  if (confirmed === total && confirmed > 0)
    return `${confirmed} position${confirmed > 1 ? "s" : ""} NFT confirmée${confirmed > 1 ? "s" : ""}`;
  if (confirmed > 0)
    return `Résultat partiel · ${confirmed}/${total} NFT confirmés`;
  if (m.operations.some(Boolean))
    return `Investissement en attente · 0/${total} NFT confirmé`;
  return "Proposition à examiner · aucun investissement";
}
function AgentSymbol({ id }: { id: ProfileId }) {
  return id === "tradfi" ? (
    <svg aria-hidden="true" viewBox="0 0 64 64" fill="none">
      <g stroke="currentColor" strokeWidth="1.4">
        <path d="M32 5v54M5 32h54" />
        <circle cx="32" cy="32" r="21" />
      </g>
    </svg>
  ) : id === "crypto" ? (
    <OrbitGlyph />
  ) : (
    <svg aria-hidden="true" viewBox="0 0 64 64" fill="none">
      <g stroke="currentColor" strokeWidth="1.5">
        <path d="M6 23c18-18 34 18 52 0M6 33c18-18 34 18 52 0M6 43c18-18 34 18 52 0" />
      </g>
    </svg>
  );
}
