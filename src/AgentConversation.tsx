import { useEffect, useState } from "react";
import { requestWallet, usePublicChoice } from "./ux-intent";
import {
  understand,
  type ConversationDraft,
  type ConversationResult,
} from "../packages/agent/conversation";
import {
  identities,
  analyzeMission,
  type MissionRequest,
  type ProfileId,
} from "../packages/agent/missions";
import type { MissionCatalogue } from "../packages/shared/missions";
import { displayAmount } from "../packages/shared/ui";
import { Layers, Orbit, Waves, Check } from "lucide-react";
import { NumberText } from "./terminal/primitives";
const near = (raw: string) => displayAmount(raw, 24);
type Line = { role: "user" | "agent"; text: string };
export function AgentConversation({
  catalogue,
  expert,
  onExpert,
  onRequest,
  onQuote,
  locked,
  busy,
  owner,
  initialDraft,
}: {
  catalogue: MissionCatalogue;
  expert: ProfileId;
  onExpert: (e: ProfileId) => void;
  onRequest: (r: MissionRequest) => void;
  onQuote: () => void;
  locked: boolean;
  busy: boolean;
  owner: string;
  initialDraft?: ConversationDraft;
}) {
  const [saved, setSaved] = usePublicChoice("agent-draft", "");
  const [prepared, setPrepared] = usePublicChoice("agent-prepared", "");
  const [text, setText] = useState(""),
    [draft, setDraft] = useState<ConversationDraft>(() => {
      try {
        return Object.keys(initialDraft || {}).length
          ? initialDraft!
          : JSON.parse(saved || "{}");
      } catch {
        return initialDraft || {};
      }
    }),
    [result, setResult] = useState<ConversationResult | null>(null),
    [manual, setManual] = useState(false),
    [lines, setLines] = useState<Line[]>([]),
    [error, setError] = useState("");
  const profile = catalogue.configuration.profiles.find(
    (p) => p.id === expert,
  )!;
  useEffect(() => {
    if (prepared === "yes" && saved) checkDetails();
  }, []);
  function remember(d: ConversationDraft, ready: boolean) {
    // Structured financial choices only; no free-form notes or capabilities.
    const {
      amount,
      reserveMinimum,
      horizonDays,
      liquidity,
      avoid,
      excluded,
      category,
    } = d;
    setSaved(
      JSON.stringify({
        amount,
        reserveMinimum,
        horizonDays,
        liquidity,
        avoid,
        excluded,
        category,
      }),
    );
    setPrepared(ready ? "yes" : "");
  }
  function preflight(r: ConversationResult) {
    if (!r.request) return r;
    const p = analyzeMission({
      mission_id: "conversation-preview",
      profile: catalogue.configuration.profiles.find((p) => p.id === r.expert)!,
      request: r.request,
      request_hash: "preview",
      now: catalogue.now,
      catalogue: catalogue.catalogue,
      exposures: [],
    });
    return p.status === "abstain"
      ? {
          ...r,
          status: "incompatible" as const,
          message:
            "Le catalogue actuel ne satisfait pas ces contraintes (minimum, échéance, exclusions ou capacité). Aucun paiement préparé. Vous pouvez modifier les détails.",
        }
      : r;
  }
  function accept(value: string) {
    setError("");
    try {
      if (/diff[ée]ren|explique|comparer|sans verrouillage/i.test(value)) {
        const explanation = /sans verrouillage/i.test(value)
          ? "Le modèle actuellement opérationnel conserve le capital jusqu’à son échéance. Aucune position sans verrouillage n’est proposée dans ce catalogue. Ne payez pas une analyse pour cette contrainte."
          : "Diversification répartit les expositions ; Crypto vise les protocoles crypto. Ces deux modèles ne sont pas activés. Seule Réserve demoUSD est opérationnelle sur le réseau de test : capital bloqué jusqu’à l’échéance, retrait après dénouement, sans capital garanti. Consultez Explorer pour ses règles exactes. Cette explication est gratuite et ne prépare aucun paiement.";
        setLines((v) => [
          ...v,
          { role: "user", text: value },
          { role: "agent", text: explanation },
        ]);
        setResult(null);
        setText("");
        setPrepared("");
        return;
      }
      let r = preflight(understand(value, draft, expert, manual));
      if (
        /garder une partie|conserver une partie/i.test(value) &&
        !r.draft.reserveMinimum
      )
        r = {
          ...r,
          status: "question",
          request: undefined,
          message:
            "Combien de demoUSD souhaitez-vous garder dans votre wallet ? Dites par exemple « garder 20 disponibles ».",
        };
      const message = r.message;
      setDraft(r.draft);
      setResult({ ...r, message });
      remember(r.draft, r.status === "ready");
      onExpert(r.expert);
      if (r.request) onRequest(r.request);
      setLines((v) => [
        ...v,
        { role: "user", text: value },
        { role: "agent", text: message },
      ]);
      setText("");
    } catch (e) {
      setError(String(e));
    }
  }
  function edit<K extends keyof ConversationDraft>(
    key: K,
    value: ConversationDraft[K],
  ) {
    setDraft((v) => ({ ...v, [key]: value }));
    setResult(null);
  }
  function checkDetails() {
    try {
      setError("");
      const r = preflight(
        understand("Vérifier ces paramètres", draft, expert, true),
      );
      setResult(r);
      remember(r.draft, r.status === "ready");
      if (r.request) onRequest(r.request);
      setLines((v) => [...v, { role: "agent", text: r.message }]);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <div className="agent-conversation">
      <aside className="ek-expert-sidebar" aria-label="Choisir une expertise">
        <h2>Choisir un agent</h2>
        <div className="ek-expert-options">
          {catalogue.configuration.profiles.map((profile) => {
            const Icon =
              profile.id === "tradfi"
                ? Layers
                : profile.id === "crypto"
                  ? Orbit
                  : Waves;
            const description =
              profile.id === "tradfi"
                ? "Répartition et concentration"
                : profile.id === "crypto"
                  ? "Contrats et risques"
                  : "Réserve et échéances";
            return (
              <button
                key={profile.id}
                className="ek-expert-option"
                aria-pressed={expert === profile.id}
                disabled={busy || locked || !profile.enabled}
                onClick={() => {
                  setManual(true);
                  onExpert(profile.id);
                  setResult(null);
                }}
              >
                <Icon aria-hidden="true" />
                <strong>{identities[profile.id].name}</strong>
                <span>{description}</span>
                <NumberText>{near(profile.price)} NEAR</NumberText>
                {expert === profile.id && (
                  <Check className="ek-expert-selected" aria-hidden="true" />
                )}
                {!profile.enabled && <small>Indisponible</small>}
              </button>
            );
          })}
        </div>
        <div className="ek-expert-disclosure">
          <h3>Une analyse à la demande</h3>
          <p>
            Le tarif rémunère l’analyse. Investir demande ensuite votre
            autorisation.
          </p>
          <p>
            Stockage du devis :{" "}
            <NumberText>
              {near(catalogue.configuration.storage_reserve)} NEAR
            </NumberText>
            , plus gas.
          </p>
        </div>
      </aside>
      <div className="ek-agent-workspace">
        <div className="ek-agent-workspace-heading">
          <h2>{locked ? "Votre mission" : "Votre demande"}</h2>
          <p>{identities[expert].deliverable}</p>
          <span className="ek-small ek-muted">
            {catalogue.mode === "demonstration"
              ? "Démonstration déterministe · sans IA"
              : "Analyse serveur · paramètres contrôlés"}
          </span>
        </div>
        {!locked && result?.status !== "ready" && (
          <>
            {" "}
            <form
              className="conversation-composer"
              onSubmit={(e) => {
                e.preventDefault();
                accept(text);
              }}
            >
              <label htmlFor="conversation-message">
                Que souhaitez-vous faire ?
              </label>
              <textarea
                id="conversation-message"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
                rows={3}
                required
                placeholder="Par exemple : 50 demoUSD, garder 15 disponibles, pendant 30 jours…"
              />
              <button className="primary" disabled={busy || !text.trim()}>
                Préparer ma demande
              </button>
            </form>{" "}
            {!lines.length && (
              <div
                className="conversation-examples"
                aria-label="Exemples de demandes"
              >
                {[
                  "Je veux investir 100 demoUSD et garder une partie disponible.",
                  "Je cherche une position sans verrouillage.",
                  "Explique-moi les différences entre ces modèles.",
                ].map((example) => (
                  <button
                    key={example}
                    disabled={busy}
                    onClick={() => setText(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <details className="conversation-method-details">
          <summary>Méthode de cet agent</summary>
          <p className="conversation-method">
            {identities[expert].method}{" "}
            {catalogue.mode === "demonstration" &&
              "Le parseur reconnaît budget, durée, disponibilité et réserve ; vérifiez les paramètres compris avant de payer."}
          </p>
        </details>
        <div
          className="conversation-thread"
          role="log"
          aria-label="Conversation avec l’agent"
          aria-live="polite"
        >
          {!lines.length && (
            <p className="agent-line">
              Quel budget en demoUSD souhaitez-vous investir, et combien de
              temps pouvez-vous attendre ?
            </p>
          )}
          {lines.map((line, i) => (
            <div key={i} className={"conversation-line " + line.role + "-line"}>
              <strong>
                {line.role === "user" ? "Vous" : identities[expert].name}
              </strong>
              <p>{line.text}</p>
            </div>
          ))}
        </div>
        {!locked && result?.status !== "ready" && (
          <>
            <details className="conversation-details">
              <summary>Modifier les détails</summary>
              <div className="conversation-detail-fields">
                <label>
                  Budget en demoUSD
                  <input
                    inputMode="decimal"
                    value={draft.amount || ""}
                    onChange={(e) =>
                      edit("amount", e.target.value.replace(",", "."))
                    }
                  />
                </label>
                <label>
                  Réserve minimale dans le wallet
                  <input
                    inputMode="decimal"
                    value={draft.reserveMinimum || "0"}
                    onChange={(e) =>
                      edit("reserveMinimum", e.target.value.replace(",", "."))
                    }
                  />
                </label>
                <label>
                  Horizon en jours
                  <input
                    type="number"
                    min={0}
                    max={36500}
                    value={draft.horizonDays ?? ""}
                    onChange={(e) =>
                      edit(
                        "horizonDays",
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                      )
                    }
                  />
                </label>
                <label>
                  Disponibilité
                  <select
                    value={draft.liquidity || ""}
                    onChange={(e) =>
                      edit(
                        "liquidity",
                        e.target.value as MissionRequest["liquidity"],
                      )
                    }
                  >
                    <option value="">À préciser</option>
                    <option value="at-maturity">À l’échéance</option>
                    <option value="immediate">Immédiate</option>
                  </select>
                </label>
                <label>
                  Risque à éviter
                  <select
                    value={draft.avoid || "none"}
                    onChange={(e) =>
                      edit("avoid", e.target.value as MissionRequest["avoid"])
                    }
                  >
                    <option value="none">
                      Aucune exclusion supplémentaire
                    </option>
                    <option value="loss">Toute perte de capital</option>
                    <option value="concentration">
                      Concentration sur un actif
                    </option>
                    <option value="protocol">Risque de protocole</option>
                  </select>
                </label>
                <label>
                  Exclusions
                  <input
                    value={draft.excluded || ""}
                    maxLength={500}
                    onChange={(e) => edit("excluded", e.target.value)}
                  />
                </label>
              </div>
              <button disabled={busy} onClick={checkDetails}>
                Vérifier les détails
              </button>
            </details>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {!locked && result?.status === "ready" && result.request && (
          <section className="conversation-quote" aria-label="Demande comprise">
            <h2>Votre demande est prête</h2>
            <dl>
              <div>
                <dt>Budget envisagé</dt>
                <dd>{result.request.amount} demoUSD</dd>
              </div>
              <div>
                <dt>Réserve demandée</dt>
                <dd>{result.request.reserveMinimum || "0"} demoUSD minimum</dd>
              </div>
              <div>
                <dt>Analyse · {identities[expert].name}</dt>
                <dd>{near(profile.price)} NEAR</dd>
              </div>
              <div>
                <dt>Stockage du devis</dt>
                <dd>{near(catalogue.configuration.storage_reserve)} NEAR</dd>
              </div>
            </dl>
            <p>
              <strong>
                Total maintenant :{" "}
                {near(
                  (
                    BigInt(profile.price) +
                    BigInt(catalogue.configuration.storage_reserve)
                  ).toString(),
                )}{" "}
                NEAR
              </strong>
              , plus gas. Une validation pour l’analyse ; une autre seulement si
              vous choisissez de créer la position.
            </p>
            <p>
              {identities[expert].deliverable} La proposition exacte arrive
              après paiement. Devis et analyse sont validés ensemble dans le
              wallet. Une nouvelle position demande ensuite 6 NEAR de provision,
              0,02 NEAR d’enregistrement et le gas.
            </p>
            <p>
              Un modèle par position, capital soumis à son échéance. Aucun
              capital garanti.
            </p>
            <button
              className="primary"
              disabled={busy || catalogue.worker_ready === false}
              onClick={() => (owner ? onQuote() : requestWallet())}
            >
              {owner
                ? "Examiner et payer l’analyse"
                : "Connecter pour continuer"}
            </button>
            <button disabled={busy} onClick={() => setResult(null)}>
              Modifier
            </button>
            {!owner && (
              <p>Connectez votre wallet testnet pour enregistrer ce devis.</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
