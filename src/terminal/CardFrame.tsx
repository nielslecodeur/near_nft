import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { ImageOff, Radio } from "lucide-react";
import type { CardTheme } from "./card-theme";
import type { CardQuote } from "./market-metrics";
import { ChangeChip, Price, Sparkline } from "./market-metrics";
import tokens from "../../design-system/terminal/tokens.json";
import "./card-frame.css";

type FrameStyle = CSSProperties & {
  "--ek-frame-accent": string;
  "--ek-frame-surface": string;
};
export function CardFrame({
  theme,
  art,
  alt,
  quote,
}: {
  theme: CardTheme;
  art: string;
  alt: string;
  quote?: CardQuote;
}) {
  const skin = useRef<HTMLDivElement>(null),
    pulse = useRef<HTMLDivElement>(null);
  const frameRequest = useRef(0),
    allowed = useRef(false),
    rect = useRef<DOMRect | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const previousQuote = useRef(quote?.revision);
  const visibleQuote = theme.liveFeed ? quote : undefined;
  const tone = visibleQuote
    ? visibleQuote.change > 0
      ? "up"
      : visibleQuote.change < 0
        ? "down"
        : theme.palette.accent
    : theme.palette.accent;
  function reset() {
    cancelAnimationFrame(frameRequest.current);
    for (const [k, v] of Object.entries({
      "--mx": "50%",
      "--my": "50%",
      "--dx": "0",
      "--dy": "0",
    }))
      skin.current?.style.setProperty(k, v);
    rect.current = null;
  }
  useEffect(() => {
    const fine = matchMedia("(hover: hover) and (pointer: fine)"),
      reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      allowed.current =
        fine.matches &&
        !reduce.matches &&
        (theme.frame === "holo" || theme.frame === "animated");
      if (!allowed.current) reset();
    };
    sync();
    fine.addEventListener("change", sync);
    reduce.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      reduce.removeEventListener("change", sync);
      reset();
    };
  }, [theme.frame]);
  useEffect(() => {
    if (
      previousQuote.current !== undefined &&
      previousQuote.current !== quote?.revision &&
      theme.liveFeed &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      pulse.current?.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], {
        duration: Number.parseFloat(tokens.tokens.duration.expressive),
        easing: tokens.tokens.ease.ui,
      });
    }
    previousQuote.current = quote?.revision;
  }, [quote?.revision, theme.liveFeed]);
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!allowed.current || event.pointerType !== "mouse") return;
    const box =
      rect.current ||
      (rect.current = event.currentTarget.getBoundingClientRect());
    const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
    cancelAnimationFrame(frameRequest.current);
    frameRequest.current = requestAnimationFrame(() => {
      const node = skin.current;
      if (!node) return;
      node.style.setProperty("--mx", `${x * 100}%`);
      node.style.setProperty("--my", `${y * 100}%`);
      node.style.setProperty("--dx", String((x - 0.5) * 2));
      node.style.setProperty("--dy", String((y - 0.5) * 2));
    });
  }
  const style: FrameStyle = {
    "--ek-frame-accent": `var(--color-${tone})`,
    "--ek-frame-surface": `var(--color-${theme.palette.surface})`,
  };
  const layers = theme.layers.map((l) => ({
    ...l,
    src: l.src === "$art" ? art : l.src,
  }));
  const base = layers.find((l) => l.src === art)?.src || layers[0].src;
  const missing = failed.includes(base);
  return (
    <div
      className={`ek-card-frame ek-card-frame--${theme.frame}`}
      data-rarity={theme.rarity}
      data-tone={tone}
      style={style}
      onPointerMove={move}
      onPointerLeave={reset}
      onPointerCancel={reset}
    >
      <div className="ek-frame-skin" ref={skin}>
        <div className="ek-frame-art">
          {layers.map(
            (l, i) =>
              !failed.includes(l.src) && (
                <img
                  key={`${l.src}-${i}`}
                  src={l.src}
                  alt={i === 0 ? alt : ""}
                  aria-hidden={i !== 0 || undefined}
                  className={`ek-art-layer ek-art-layer--${l.depth}`}
                  style={{ opacity: l.opacity }}
                  width={960}
                  height={720}
                  decoding="async"
                  onError={() => setFailed((current) => [...current, l.src])}
                />
              ),
          )}
          {missing && (
            <div className="ek-frame-fallback">
              <ImageOff aria-hidden="true" />
              <span>Visuel indisponible</span>
              <span>Les informations restent consultables.</span>
            </div>
          )}
          <div className="ek-frame-foil" aria-hidden="true" />
          <div className="ek-frame-glare" aria-hidden="true" />
        </div>
        <div className="ek-frame-material" aria-hidden="true" />
        <div className="ek-frame-pulse" ref={pulse} aria-hidden="true" />
        {theme.liveFeed && (
          <div className="ek-frame-feed">
            <span className="ek-feed-label">
              <Radio aria-hidden="true" />
              {quote
                ? quote.source === "simulation"
                  ? "Flux simulé"
                  : "Lecture reçue"
                : "Flux non connecté"}
            </span>
            {quote && (
              <>
                <div className="ek-feed-values">
                  <Price price={quote.price} />
                  <ChangeChip change={quote.change} />
                </div>
                <Sparkline
                  points={quote.points}
                  label="Historique du flux de la carte"
                  tone={tone === "down" ? "down" : "up"}
                />
                <span className="ek-sr-only">Observé à {quote.observedAt}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
