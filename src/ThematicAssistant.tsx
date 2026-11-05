import { useState } from "react";
import {
  prepareThematic,
  type ThematicDraft,
  type ThematicExpert,
} from "../packages/agent/thematic";
import { dayLabel, SIMULATION_NOTICE } from "../packages/shared/baskets";
import { Button, Select, NumberText } from "./terminal/primitives";
export function ThematicAssistant({ now }: { now: bigint }) {
  const [text, setText] = useState(""),
    [expert, setExpert] = useState<ThematicExpert>("thematic"),
    [draft, setDraft] = useState<ThematicDraft>({}),
    [result, setResult] = useState<ReturnType<typeof prepareThematic> | null>(
      null,
    ),
    [error, setError] = useState("");
  return (
    <section
      className="ek-thematic-assistant"
      aria-label="Assistant des paniers thématiques"
    >
      <h1>Un thème. Une proposition claire.</h1>
      <p>
        Comprenez les entreprises et préparez votre position. Cette préparation
        déterministe est gratuite ; les missions payantes historiques restent
        séparées, plus bas.
      </p>
      <Select
        label="Expertise pour les paniers"
        value={expert}
        onChange={(e) => setExpert(e.target.value as ThematicExpert)}
      >
        <option value="thematic">
          Analyse thématique · entreprises et limites du thème
        </option>
        <option value="diversification">
          Diversification · concentration et expositions communes
        </option>
        <option value="liquidity">
          Liquidité · sortie et fonds réellement disponibles
        </option>
      </Select>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          try {
            const r = prepareThematic(text, now, draft, expert);
            setDraft(r.draft);
            setResult(r);
            setText("");
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        <label htmlFor="thematic-request">Votre demande</label>
        <textarea
          id="thematic-request"
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Je veux créer une position de 100 demoUSD sur le thème IA."
        />
        <Button variant="primary" type="submit" disabled={!text.trim()}>
          Préparer ma proposition
        </Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div className="ek-thematic-answer" role="status">
          <p>{result.message}</p>
          {result.proposal && (
            <>
              <dl className="ek-basket-lots">
                {result.proposal.lots.map((l) => (
                  <div key={l.symbol}>
                    <dt>{l.name}</dt>
                    <dd>
                      <NumberText>{l.weight_bps / 100} %</NumberText>
                    </dd>
                  </div>
                ))}
              </dl>
              <p>
                Prix fictifs du {dayLabel(result.proposal.entry_day)} UTC.
                Version et montant seront contrôlés avant signature. L’agent ne
                dispose d’aucun droit de retrait ni de gestion.
              </p>
              <Button
                onClick={() => {
                  sessionStorage.setItem(
                    "everkeep.ui.v1:explore-source",
                    "official",
                  );
                  sessionStorage.setItem(
                    "everkeep.ui.v1:explore-model",
                    result.proposal!.model.id,
                  );
                  sessionStorage.setItem(
                    "everkeep.ui.v1:basket-amount:" + result.proposal!.model.id,
                    result.draft.amount!,
                  );
                  location.hash = "#explorer";
                }}
              >
                Examiner le panier et autoriser moi-même le dépôt
              </Button>
            </>
          )}
        </div>
      )}
      <p className="ek-small ek-muted">
        {SIMULATION_NOTICE} Aucune recommandation financière. Le spécialiste
        Crypto conserve son périmètre historique.
      </p>
    </section>
  );
}
