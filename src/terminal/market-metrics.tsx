import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Badge, NumberText } from "./primitives";

export type DisplayPrice = { value: string; unit: string };
export type CardQuote = {
  price: DisplayPrice;
  change: number;
  points: number[];
  source: "simulation" | "verified";
  observedAt: string;
  revision: number;
};
export function TickingNumber({ value }: { value: string }) {
  return (
    <NumberText key={value} className="ek-number-update">
      {value}
    </NumberText>
  );
}
export function ChangeChip({ change }: { change: number | null }) {
  const valid = typeof change === "number" && Number.isFinite(change);
  const tone = !valid || change === 0 ? "neutral" : change > 0 ? "up" : "down";
  const label = !valid
    ? "Variation indisponible"
    : change === 0
      ? "Stable"
      : change > 0
        ? "Hausse"
        : "Baisse";
  return (
    <Badge
      tone={tone}
      icon={
        tone === "up" ? ArrowUpRight : tone === "down" ? ArrowDownRight : Minus
      }
    >
      <span className="ek-sr-only">{label} : </span>
      <TickingNumber
        value={
          valid
            ? `${new Intl.NumberFormat("fr-FR", { signDisplay: "always", maximumFractionDigits: 2 }).format(change)} %`
            : "—"
        }
      />
    </Badge>
  );
}
export function Price({ price }: { price: DisplayPrice | null }) {
  if (!price)
    return (
      <span className="ek-muted" aria-label="Valeur indisponible">
        —
      </span>
    );
  return (
    <span className="ek-price">
      <TickingNumber value={price.value} />
      <span className="ek-price-unit">{price.unit}</span>
    </span>
  );
}
export function Sparkline({
  points,
  label,
  tone = "brand",
}: {
  points: number[];
  label: string;
  tone?: "brand" | "up" | "down";
}) {
  const values = points.filter(Number.isFinite).slice(-60);
  if (values.length < 2)
    return <span className="ek-chart-missing">Historique indisponible</span>;
  const min = Math.min(...values),
    range = Math.max(...values) - min;
  const path = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * 100},${range ? 28 - ((v - min) / range) * 24 : 16}`,
    )
    .join(" ");
  return (
    <svg
      className={`ek-sparkline ek-sparkline--${tone}`}
      viewBox="0 0 100 32"
      role="img"
      aria-label={label}
    >
      <polyline points={path} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
