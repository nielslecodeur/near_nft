import { useEffect, useId, useRef, useState } from "react";
import { NftCover } from "./PositionArtwork";
export type StrategyIdentity = {
  id: string;
  name: string;
  description: string;
  category?: string;
  assets: string;
  exit: string;
  status: "demo" | "testnet" | "read-only" | "unavailable";
  theme: "reserve" | "basket" | "routes";
};
export function StrategyCarousel({
  items,
  selected,
  onSelect,
  onView,
}: {
  items: StrategyIdentity[];
  selected: number;
  onSelect: (index: number) => void;
  onView?: (index: number) => void;
}) {
  const [grid, setGrid] = useState(false),
    [step, setStep] = useState(selected),
    [instant, setInstant] = useState(false);
  const start = useRef<number | null>(null),
    swiped = useRef(false),
    id = useId();
  useEffect(() => {
    if (
      items.length &&
      ((step % items.length) + items.length) % items.length !== selected
    ) {
      const current = ((step % items.length) + items.length) % items.length;
      const delta = (selected - current + items.length) % items.length;
      setStep(
        (v) => v + (delta > items.length / 2 ? delta - items.length : delta),
      );
    }
  }, [selected, items.length, step]);
  function move(direction: number, keyboard = false) {
    if (items.length < 2) return;
    setInstant(keyboard);
    setStep((v) => v + direction);
    onSelect((selected + direction + items.length) % items.length);
  }
  function choose(index: number, keyboard = false) {
    const delta = (index - selected + items.length) % items.length;
    move(delta > items.length / 2 ? delta - items.length : delta, keyboard);
  }
  return (
    <section
      className={
        "strategy-selector" + (items.length === 1 ? " single-strategy" : "")
      }
      aria-label="Sélecteur de stratégies"
    >
      <div className="selector-tools">
        <p>
          {items.length} modèle{items.length > 1 ? "s" : ""} au catalogue
        </p>
        <button aria-pressed={grid} onClick={() => setGrid(!grid)}>
          {grid ? "Vue manège" : "Vue grille"}
        </button>
      </div>
      <div
        className={grid ? "strategy-grid" : "strategy-merry"}
        role="region"
        aria-roledescription={grid ? undefined : "carrousel"}
        aria-label="Stratégies"
        tabIndex={grid ? undefined : 0}
        onKeyDown={(e) => {
          if (grid) return;
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            move(e.key === "ArrowRight" ? 1 : -1, true);
          }
          if (e.key === "Home") {
            e.preventDefault();
            setStep(0);
            onSelect(0);
            setInstant(true);
          }
          if (e.key === "End") {
            e.preventDefault();
            setStep(items.length - 1);
            onSelect(items.length - 1);
            setInstant(true);
          }
        }}
        onPointerDown={(e) => {
          if (!grid) {
            start.current = e.clientX;
            swiped.current = false;
          }
        }}
        onPointerUp={(e) => {
          if (
            start.current !== null &&
            Math.abs(e.clientX - start.current) > 45
          ) {
            swiped.current = true;
            move(e.clientX < start.current ? 1 : -1);
            e.preventDefault();
          }
          start.current = null;
        }}
        onPointerCancel={() => (start.current = null)}
      >
        {items.map((item, index) => {
          const angle =
            items.length < 2 ? 0 : ((index - step) * 360) / items.length;
          return (
            <button
              key={item.id}
              className={`strategy-card strategy-${item.theme} ${selected === index ? "selected" : ""}`}
              aria-pressed={selected === index}
              aria-describedby={id + "-status-" + index}
              style={
                grid
                  ? undefined
                  : {
                      transform: `rotateY(${angle}deg) translateZ(var(--carousel-radius)) rotateY(${-angle}deg)`,
                      transition: instant ? "none" : undefined,
                      zIndex: selected === index ? 3 : 1,
                      opacity: 1,
                    }
              }
              onClick={(event) => {
                if (!swiped.current || event.detail === 0) {
                  choose(index, event.detail === 0);
                  onView?.(index);
                }
              }}
            >
              <div className="strategy-art" aria-hidden="true">
                {item.theme === "reserve" ? (
                  <NftCover code={item.id} />
                ) : (
                  <svg viewBox="0 0 300 130">
                    <path
                      d={
                        item.theme === "basket"
                          ? "M30 20H130V110H30ZM170 20H270V110H170ZM30 65H270M80 20V110M220 20V110"
                          : "M20 110C90 110 60 20 150 20S220 110 280 110M20 20C90 20 60 110 150 110S220 20 280 20"
                      }
                    />
                  </svg>
                )}
              </div>
              <span className="strategy-card-name">{item.name}</span>
              <span className="strategy-card-description">
                {item.description}
              </span>
              {item.category && (
                <span className="strategy-card-category">{item.category}</span>
              )}
              <span className="strategy-card-conditions">
                {item.assets} · {item.exit}
              </span>
              <span
                className="strategy-card-status"
                id={id + "-status-" + index}
              >
                {onView
                  ? "Voir le modèle"
                  : item.status === "demo"
                    ? "Démo · vrais contrats sandbox"
                    : item.status === "testnet"
                      ? "Démonstration · NEAR Testnet"
                      : item.status === "read-only"
                        ? "Testnet · lecture seule, exécution non activée"
                        : "Indisponible · aucune intégration"}
              </span>
            </button>
          );
        })}
      </div>
      {!grid && (
        <div className="carousel-controls">
          <button
            aria-label="Stratégie précédente"
            disabled={items.length < 2}
            onClick={() => move(-1)}
          >
            Précédente
          </button>
          <p role="status" aria-live="polite">
            {selected + 1} / {items.length} · {items[selected]?.name}
          </p>
          <button
            aria-label="Stratégie suivante"
            disabled={items.length < 2}
            onClick={() => move(1)}
          >
            Suivante
          </button>
        </div>
      )}
    </section>
  );
}
