import { useId, useLayoutEffect, useRef, useState } from "react";
import type { CatalogueItem } from "../packages/shared/catalogue";
import { categoryLabels } from "../packages/shared/catalogue";

export function CatalogueCard({
  item,
  onOpen,
  onAction,
}: {
  item: CatalogueItem;
  onOpen: () => void;
  onAction: () => void;
}) {
  const [flipped, setFlipped] = useState(false),
    [instant, setInstant] = useState(false),
    [imageError, setImageError] = useState(false);
  const frontButton = useRef<HTMLButtonElement>(null),
    backButton = useRef<HTMLButtonElement>(null),
    touched = useRef(false),
    id = useId();
  useLayoutEffect(() => {
    if (touched.current)
      (flipped ? backButton : frontButton).current?.focus({
        preventScroll: true,
      });
  }, [flipped]);
  function turn(next: boolean, keyboard: boolean) {
    touched.current = true;
    setInstant(keyboard);
    setFlipped(next);
  }
  return (
    <article
      className={
        "catalogue-card" +
        (flipped ? " is-flipped" : "") +
        (instant ? " instant-flip" : "")
      }
      aria-label={item.name}
    >
      <div className="catalogue-card-turner">
        <div
          className="catalogue-face catalogue-front"
          aria-hidden={flipped}
          inert={flipped}
        >
          <a
            className="catalogue-art-link"
            href="#explorer"
            onClick={(e) => {
              e.preventDefault();
              onOpen();
            }}
            aria-label={
              (item.kind === "model"
                ? "Voir le modèle "
                : "Voir la position ") + item.name
            }
          >
            <div className="catalogue-image">
              {imageError ? (
                <div className="catalogue-image-fallback">
                  <span>Visuel indisponible</span>
                  <span>Les informations restent consultables.</span>
                </div>
              ) : (
                <img
                  src={item.visual.src}
                  alt={item.visual.alt}
                  width={960}
                  height={720}
                  decoding="async"
                  onError={() => setImageError(true)}
                />
              )}
            </div>
            <div className="catalogue-card-heading">
              <h2>{item.name}</h2>
              <span>{categoryLabels[item.category]}</span>
            </div>
          </a>
          <div className="catalogue-front-meta">
            <p className="catalogue-availability">{item.availability}</p>
            <div className="catalogue-price">
              <span>{item.money.label}</span>
              <strong>{item.money.value}</strong>
            </div>
            {item.kind === "listing" && (
              <p className="catalogue-position-id" title={item.positionId}>
                NFT · {item.positionId?.split(".")[0]}
              </p>
            )}
            <button
              ref={frontButton}
              className="catalogue-flip-button"
              aria-expanded={flipped}
              aria-controls={id}
              onClick={(e) => turn(true, e.detail === 0)}
            >
              Voir la composition
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M4 10h12m-5-5 5 5-5 5" />
              </svg>
            </button>
          </div>
        </div>
        <div
          className="catalogue-face catalogue-back"
          id={id}
          aria-hidden={!flipped}
          inert={!flipped}
        >
          <button
            ref={backButton}
            className="catalogue-return"
            onClick={(e) => turn(false, e.detail === 0)}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M16 10H4m5-5-5 5 5 5" />
            </svg>
            Revenir au visuel
          </button>
          <h2>{item.name}</h2>
          <p className="composition-basis">
            {item.composition.basis === "target"
              ? "Composition cible du modèle"
              : "Actifs réellement comptabilisés"}
          </p>
          {item.composition.rows.length > 0 && (
            <dl className="catalogue-composition">
              {item.composition.rows.map((r) => (
                <div key={r.label}>
                  <dt>{r.label}</dt>
                  <dd>
                    {r.amount || r.proportion}
                    {r.amount && r.proportion && <small>{r.proportion}</small>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p>{item.composition.explanation}</p>
          {item.composition.limits.map((s) => (
            <p className="catalogue-limit" key={s}>
              {s}
            </p>
          ))}
          <p className="catalogue-exit">
            <strong>Sortie.</strong> {item.exit} Revente sans garantie
            d’acheteur.
          </p>
          <p className="catalogue-exposure">{item.exposure}</p>
          {item.composition.observedAt && (
            <p className="catalogue-observed">
              Lecture du{" "}
              {new Date(
                Number(BigInt(item.composition.observedAt) / 1_000_000n),
              ).toLocaleString("fr-FR")}
              .
            </p>
          )}
          <div className="catalogue-back-actions">
            <button
              className="primary"
              disabled={!item.actionable}
              onClick={onAction}
            >
              {item.kind === "model" ? "Créer ma position" : "Voir la position"}
            </button>
            <a
              href="#explorer"
              onClick={(e) => {
                e.preventDefault();
                onOpen();
              }}
            >
              Fiche complète
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
