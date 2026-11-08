import { useEffect, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import "./nft-card.css";

/**
 * Tall NFT card after the visual reference: the artwork fills the card, an
 * information panel sits on its lower part.
 *
 *   panel head   round collection avatar · collection / subtitle · timer (mono)
 *   name         bold
 *   description  one muted line
 *   footer       status chip + one fact (left) · value label + amount in accent (right)
 *
 * Data-driven: everything comes from an `NftCardModel`, so a new card only
 * needs a new model (see the mappers in AgentsPage.tsx).
 */
export type Tone = "up" | "down" | "neutral" | "brand";

export type NftCardModel = {
  id: string;
  name: string;
  description: string;
  /** `undefined` while loading, `null` when the NFT has no usable image. */
  image: string | null | undefined;
  imageAlt: string;
  /**
   * "contain" for art that is not portrait (e.g. Keepers' 4:3 on-chain art):
   * the whole picture sits at the top on `backdrop`, nothing is cropped.
   */
  fit?: "cover" | "contain";
  backdrop?: string;
  collection: string;
  subtitle: string;
  avatar: ReactNode;
  /** Either a countdown to `until` (ms) or a static label such as "2 h ago". */
  timer?: { until?: number; label?: string };
  status: { label: string; tone: Tone };
  fact?: { label: string; value: string };
  value: { label: string; amount: string };
  /** Set when the card could not be read; shown instead of the footer. */
  error?: string;
};

function countdown(until: number, now: number) {
  const s = Math.max(0, Math.round((until - now) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

/** Ticks once a second, only while a countdown is on screen. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Art({ src, alt, fit }: { src: string | null | undefined; alt: string; fit?: "cover" | "contain" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed)
    return (
      <img
        className={fit === "contain" ? "nx-card-art nx-card-art--contain" : "nx-card-art"}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  return (
    <div className="nx-card-art nx-card-art--none" role="img" aria-label={src === undefined ? `Loading ${alt}` : `${alt}, no image`}>
      {src !== undefined && <span>{alt}</span>}
    </div>
  );
}

export function NFTCard({
  model,
  href,
  onOpen,
  as = "article",
}: {
  model: NftCardModel;
  href?: string;
  onOpen?: () => void;
  as?: "article" | "div";
}) {
  const live = model.timer?.until !== undefined && model.timer.until > Date.now();
  const now = useNow(live);
  const timer =
    model.timer?.until !== undefined
      ? model.timer.until > now
        ? countdown(model.timer.until, now)
        : "due"
      : model.timer?.label;
  const body = (
    <>
      <Art src={model.image} alt={model.imageAlt} fit={model.fit} />
      <div className="nx-card-panel">
        <div className="nx-card-head">
          <span className="nx-card-avatar" aria-hidden="true">
            {model.avatar}
          </span>
          <span className="nx-card-who">
            <small>{model.collection}</small>
            <span>{model.subtitle}</span>
          </span>
          {timer && (
            <time className="nx-card-timer nx-mono" aria-label={live ? `Next action in ${timer}` : undefined}>
              {timer}
            </time>
          )}
        </div>
        <h3 className="nx-card-name">{model.name}</h3>
        <p className="nx-card-desc">{model.description}</p>
        {model.error ? (
          <p className="nx-card-error" role="status">
            {model.error}
          </p>
        ) : (
          <div className="nx-card-foot">
            <div className="nx-card-facts">
              <span>
                <small>Status</small>
                <span className="nx-chip" data-tone={model.status.tone}>
                  {model.status.label}
                </span>
              </span>
              {model.fact && (
                <span>
                  <small>{model.fact.label}</small> <span className="kp-num">{model.fact.value}</span>
                </span>
              )}
            </div>
            <div className="nx-card-value">
              <small>{model.value.label}</small>
              <strong className="kp-num">{model.value.amount}</strong>
            </div>
          </div>
        )}
      </div>
    </>
  );
  if (href)
    return (
      <a
        className="nx-card"
        style={model.backdrop ? { background: model.backdrop } : undefined}
        data-tone={model.status.tone}
        href={href}
        onClick={(e) => {
          e.preventDefault();
          onOpen?.();
        }}
      >
        {body}
      </a>
    );
  const Tag = as;
  return (
    <Tag className="nx-card" style={model.backdrop ? { background: model.backdrop } : undefined} data-tone={model.status.tone}>
      {body}
    </Tag>
  );
}

/** Same box as a card, so nothing moves when the data arrives. */
export function NFTCardSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="nx-card nx-card--skeleton" role="status" aria-label={label}>
      <div className="nx-card-panel">
        <span className="nx-skel nx-skel--row" />
        <span className="nx-skel nx-skel--title" />
        <span className="nx-skel nx-skel--line" />
        <span className="nx-skel nx-skel--foot" />
      </div>
    </div>
  );
}

/** Empty slot: an invitation to act, same size as a card. */
export function NFTCardEmpty({ title, hint, onClick }: { title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" className="nx-card nx-card--empty" onClick={onClick}>
      <Plus aria-hidden="true" />
      <strong>{title}</strong>
      <span>{hint}</span>
    </button>
  );
}
