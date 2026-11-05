import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ArrowLeft, ArrowRight, Layers, Heart } from "lucide-react";
import { CardFrame } from "./CardFrame";
import type { CardTheme } from "./card-theme";
import { Button, IconButton, NumberText } from "./primitives";
import { ChangeChip, Sparkline } from "./market-metrics";
import {
  observationDate,
  valueMovement,
  type PositionCardData,
  type ValueHistory,
  type positionCardFacts,
} from "./position-card-data";

export function ValueHistoryView({
  history,
  compact = false,
}: {
  history?: ValueHistory;
  compact?: boolean;
}) {
  const move = valueMovement(history);
  if (!move)
    return compact ? null : (
      <p className="ek-card-history-missing">
        Historique indisponible. Aucune variation ni performance calculée.
      </p>
    );
  const period = `${new Date(move.from).toLocaleString("fr-FR")} → ${new Date(move.to).toLocaleString("fr-FR")}`;
  return (
    <div className="ek-position-history">
      <div>
        <ChangeChip change={move.percent} />
        <span>Variation de valeur · {move.unit}</span>
      </div>
      <small>
        {period}
        {move.source === "demonstration" ? " · Données de démonstration" : ""}
      </small>
      {!compact && (
        <>
          <Sparkline
            points={move.points}
            label={`Variation de valeur en ${move.unit}, du ${period}`}
            tone={move.percent < 0 ? "down" : move.percent > 0 ? "up" : "brand"}
          />
          <p>
            Variation de valeur, sans correction des dépôts et retraits. Ce
            n’est pas une performance du placement.
          </p>
        </>
      )}
    </div>
  );
}
export function PositionCard({
  name,
  art,
  alt,
  theme,
  data,
  onOpen,
  onAction,
  actionLabel,
  disabled = false,
  index = 0,
  selected = false,
  crop = "50% 50%",
  savable = false,
}: {
  name: string;
  art: string;
  alt: string;
  theme: CardTheme;
  data: PositionCardData;
  onOpen: () => void;
  onAction?: () => void;
  actionLabel?: string;
  disabled?: boolean;
  index?: number;
  selected?: boolean;
  crop?: string;
  savable?: boolean;
}) {
  const [flipped, setFlipped] = useState(false),
    [instant, setInstant] = useState(false),
    [saved, setSaved] = useState(false);
  const front = useRef<HTMLButtonElement>(null),
    back = useRef<HTMLButtonElement>(null),
    touched = useRef(false),
    id = useId();
  useLayoutEffect(() => {
    if (touched.current)
      (flipped ? back : front).current?.focus({ preventScroll: true });
  }, [flipped]);
  function turn(next: boolean, keyboard: boolean) {
    touched.current = true;
    setInstant(keyboard);
    setFlipped(next);
  }
  return (
    <article
      className="ek-nft-card ek-position-card"
      aria-label={name}
      data-flipped={flipped}
      data-instant={instant}
      data-material={theme.frame}
      data-special-art={art.startsWith("/art/special/") || undefined}
      data-thematic={data.category.includes("Actions thématiques") || undefined}
      data-selected={selected || undefined}
      style={
        {
          "--ek-card-index": Math.min(index, 3),
          "--ek-art-crop": crop,
        } as CSSProperties
      }
    >
      <div
        className="ek-position-face ek-position-front"
        aria-hidden={flipped}
        inert={flipped}
      >
        <button
          className="ek-art-button ek-position-art"
          onClick={onOpen}
          aria-label={`Voir ${name}`}
        >
          <CardFrame art={art} alt={alt} theme={theme} />
        </button>
        {savable && (
          <IconButton
            className="ek-save"
            label={`${saved ? "Retirer" : "Ajouter"} ${name} ${saved ? "des" : "aux"} favoris`}
            icon={Heart}
            aria-pressed={saved}
            onClick={() => setSaved(!saved)}
          />
        )}
        <div className="ek-position-info">
          <button className="ek-nft-title" onClick={onOpen}>
            {name}
          </button>
          <p className="ek-position-identity">
            <span>{data.category}</span>
            <NumberText title={data.identifier}>
              {data.identifier.split(".")[0]}
            </NumberText>
          </p>
          {data.kind === "model" && data.category === "Actions thématiques" && (
            <p className="ek-basket-card-description">{data.description}</p>
          )}
          <dl className="ek-position-price">
            <dt>{data.moneyLabel}</dt>
            <dd>
              <NumberText>{data.moneyValue}</NumberText>
            </dd>
          </dl>
          <p className="ek-position-status">{data.status}</p>
          <ValueHistoryView history={data.history} compact />
          <div className="ek-position-actions">
            <Button
              ref={front}
              aria-expanded={flipped}
              aria-controls={id}
              onClick={(event) => turn(true, event.detail === 0)}
            >
              <Layers aria-hidden="true" />
              Voir la composition
            </Button>
            <Button
              variant={disabled ? "secondary" : "primary"}
              disabled={disabled}
              onClick={onAction || onOpen}
            >
              {actionLabel ||
                (data.kind === "model"
                  ? "Créer ma position"
                  : data.kind === "owned"
                    ? "Consulter la position"
                    : "Voir la position")}
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
      <div
        className="ek-position-face ek-position-back"
        id={id}
        aria-hidden={!flipped}
        inert={!flipped}
      >
        <Button ref={back} onClick={(event) => turn(false, event.detail === 0)}>
          <ArrowLeft aria-hidden="true" />
          Revenir au visuel
        </Button>
        <div
          className="ek-position-back-content"
          tabIndex={
            data.category.includes("Actions thématiques") ? 0 : undefined
          }
          aria-label={
            data.category.includes("Actions thématiques")
              ? "Composition et règles, zone défilante"
              : undefined
          }
        >
          <h3>{name}</h3>
          <h4>
            {data.kind === "model"
              ? "Composition cible"
              : data.category.includes("Actions thématiques")
                ? "Quantités simulées"
                : "Actifs détenus"}
          </h4>
          {data.composition.rows.length ? (
            <dl className="ek-position-composition">
              {data.composition.rows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>
                    <NumberText>{row.amount || row.proportion}</NumberText>
                    {row.amount && row.proportion && (
                      <small>{row.proportion}</small>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>Actifs et proportions non définis.</p>
          )}
          <p>{data.composition.explanation}</p>
          {!!data.composition.limits.length && (
            <ul>
              {data.composition.limits.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          )}
          {observationDate(data.composition.observedAt) && (
            <p className="ek-position-observed">
              Lecture du {observationDate(data.composition.observedAt)}.
            </p>
          )}
          <div className="ek-position-exit">
            <h4>Conditions de sortie</h4>
            <p>{data.exit}</p>
          </div>
        </div>
        {data.category.includes("Actions thématiques") && (
          <p className="ek-back-scroll-hint">
            Faites défiler pour lire les règles.
          </p>
        )}
        <Button variant="primary" onClick={onAction || onOpen}>
          {data.kind === "model" && data.category === "Actions thématiques"
            ? "Créer ma position"
            : "Voir la fiche complète"}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}
export function PositionFacts({
  facts,
}: {
  facts: ReturnType<typeof positionCardFacts>;
}) {
  return (
    <section
      className="ek-position-facts"
      aria-label="Lecture des actifs de la position"
    >
      <div className="ek-position-valuation">
        <h3>Valeur indicative</h3>
        <p>Non disponible</p>
        <span>
          Aucune valorisation monétaire. Les montants ci-dessous sont des
          quantités comptabilisées.
        </span>
      </div>
      <p className="ek-position-observed">
        Lecture des actifs du {observationDate(facts.observedAt)}.
      </p>
      <dl>
        {facts.rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              <NumberText>{row.value}</NumberText>
            </dd>
          </div>
        ))}
      </dl>
      <ValueHistoryView />
    </section>
  );
}
