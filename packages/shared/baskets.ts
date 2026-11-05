import configuration from "./baskets.v1.json";

export type Basket = (typeof configuration.models)[number];
export const baskets: readonly Basket[] = configuration.models;
export const BASKET_SOURCE = "everkeep-fictional-v1";
export const SIMULATION_NOTICE =
  "Simulation sur testnet — aucune action réelle détenue.";
export const PRICE_MODE = "Démonstration avec prix fictifs";
export const QUANTITY_SCALE = 100_000_000n;
export const DAY_NS = 86_400_000_000_000n;
export type PriceSnapshot = {
  mode: "fictional";
  source: string;
  day: string;
  prices: Record<string, string>;
};
export type BasketLot = {
  symbol: string;
  name: string;
  weight_bps: number;
  quantity: string;
  entry_price: string;
};
export type BasketPosition = {
  model: Basket;
  capital: string;
  entry_day: string;
  created_at: string;
  source: string;
  mode: "fictional";
  lots: BasketLot[];
  remainder: string;
  closed_day: string | null;
};
const uint = (v: string) => {
  if (!/^(0|[1-9][0-9]*)$/.test(v) || BigInt(v) >= 1n << 128n)
    throw Error("BASKET_UINT");
  return BigInt(v);
};
export function validateBasket(model: Basket) {
  if (
    !/^[a-z][a-z0-9-]{2,50}$/.test(model.id) ||
    model.version !== "1" ||
    model.components.length !== 5
  )
    throw Error("BASKET_MODEL");
  const known = new Map(
    baskets.flatMap((b) =>
      b.components.map((c) => [c.symbol, c.exchange] as const),
    ),
  );
  const seen = new Set<string>();
  let total = 0;
  for (const c of model.components) {
    if (
      !known.has(c.symbol) ||
      known.get(c.symbol) !== c.exchange ||
      seen.has(c.symbol)
    )
      throw Error("BASKET_INSTRUMENT");
    if (
      !Number.isInteger(c.weight_bps) ||
      c.weight_bps <= 0 ||
      c.weight_bps > 10000 ||
      uint(c.base_price) === 0n
    )
      throw Error("BASKET_WEIGHT_PRICE");
    seen.add(c.symbol);
    total += c.weight_bps;
  }
  if (total !== 10000) throw Error("BASKET_WEIGHTS");
  return model;
}
export function basketById(id: string, version = "1") {
  const b = baskets.find((b) => b.id === id && b.version === version);
  if (!b) throw Error("BASKET_UNKNOWN_VERSION");
  return validateBasket(b);
}
/** Fictional daily observations close at 00:00 UTC on weekdays. No exchange calendar or real market data. */
export function priceDay(nowNs: bigint) {
  let day = nowNs / DAY_NS;
  if (day < 20454n || day > 30000n) throw Error("BASKET_CALENDAR_RANGE");
  while ((day + 3n) % 7n >= 5n) day--;
  return day;
}
export function dayLabel(day: string) {
  return new Date(Number(uint(day)) * 86400000).toISOString().slice(0, 10);
}
export function fictionalPrices(model: Basket, nowNs: bigint): PriceSnapshot {
  validateBasket(model);
  const day = priceDay(nowNs);
  return {
    mode: "fictional",
    source: BASKET_SOURCE,
    day: day.toString(),
    prices: Object.fromEntries(
      model.components.map((c, i) => {
        const wave = (day + BigInt(i * 3)) % 17n;
        return [
          c.symbol,
          ((BigInt(c.base_price) * (9200n + wave * 100n)) / 10000n).toString(),
        ];
      }),
    ),
  };
}
export function validatePrices(model: Basket, p: PriceSnapshot, nowNs: bigint) {
  if (p.mode !== "fictional" || p.source !== BASKET_SOURCE)
    throw Error("BASKET_PRICE_MODE");
  if (uint(p.day) !== priceDay(nowNs))
    throw Error("BASKET_STALE_OR_MIXED_DATE");
  if (Object.keys(p.prices).length !== model.components.length)
    throw Error("BASKET_MISSING_PRICE");
  const expected = fictionalPrices(model, nowNs);
  for (const c of model.components) {
    if (!p.prices[c.symbol] || uint(p.prices[c.symbol]) === 0n)
      throw Error("BASKET_MISSING_PRICE");
    if (p.prices[c.symbol] !== expected.prices[c.symbol])
      throw Error("BASKET_INCOHERENT_PRICE");
  }
}
export function subscribeBasket(
  model: Basket,
  capital: string,
  prices: PriceSnapshot,
  nowNs: bigint,
): BasketPosition {
  validateBasket(model);
  validatePrices(model, prices, nowNs);
  const raw = uint(capital);
  if (
    raw < BigInt(configuration.minimum) ||
    raw > BigInt(configuration.maximum)
  )
    throw Error("BASKET_AMOUNT_LIMIT");
  let spent = 0n;
  const lots = model.components.map((c) => {
    const budget = (raw * BigInt(c.weight_bps)) / 10000n,
      p = uint(prices.prices[c.symbol]);
    const quantity = (budget * QUANTITY_SCALE) / p;
    spent += (quantity * p) / QUANTITY_SCALE;
    return {
      symbol: c.symbol,
      name: c.name,
      weight_bps: c.weight_bps,
      quantity: quantity.toString(),
      entry_price: p.toString(),
    };
  });
  return {
    model: structuredClone(model),
    capital,
    entry_day: prices.day,
    created_at: nowNs.toString(),
    source: BASKET_SOURCE,
    mode: "fictional",
    lots,
    remainder: (raw - spent).toString(),
    closed_day: null,
  };
}
export function valueBasket(position: BasketPosition, prices: PriceSnapshot) {
  validateBasket(position.model);
  const ns = uint(prices.day) * DAY_NS;
  validatePrices(position.model, prices, ns);
  if (uint(prices.day) < uint(position.entry_day))
    throw Error("BASKET_PRICE_BEFORE_ENTRY");
  if (position.closed_day !== null && prices.day !== position.closed_day)
    throw Error("BASKET_CLOSED_DATE");
  return position.lots
    .reduce(
      (v, lot) =>
        v +
        (uint(lot.quantity) * uint(prices.prices[lot.symbol])) / QUANTITY_SCALE,
      uint(position.remainder),
    )
    .toString();
}
export function basketHistory(position: BasketPosition, nowNs: bigint) {
  const end =
      position.closed_day === null
        ? priceDay(nowNs)
        : uint(position.closed_day),
    start = uint(position.entry_day);
  if (end < start || end - start > 3660n) throw Error("BASKET_HISTORY_RANGE");
  const result: { day: string; value: string }[] = [];
  for (let d = start; d <= end; d++) {
    if (priceDay(d * DAY_NS) !== d) continue;
    const historical = { ...position, closed_day: null };
    result.push({
      day: d.toString(),
      value: valueBasket(
        historical,
        fictionalPrices(position.model, d * DAY_NS),
      ),
    });
  }
  return result;
}
export function validateBasketPosition(p: BasketPosition) {
  const model = basketById(p.model.id, p.model.version);
  const financial = (b: Basket) =>
    b.components.map((c) => [c.symbol, c.exchange, c.weight_bps, c.base_price]);
  if (
    p.mode !== "fictional" ||
    p.source !== BASKET_SOURCE ||
    JSON.stringify(financial(p.model)) !== JSON.stringify(financial(model))
  )
    throw Error("BASKET_FROZEN_MODEL_MISMATCH");
  const expected = subscribeBasket(
    p.model,
    p.capital,
    fictionalPrices(p.model, uint(p.entry_day) * DAY_NS),
    uint(p.entry_day) * DAY_NS,
  );
  if (
    JSON.stringify(expected.lots) !== JSON.stringify(p.lots) ||
    expected.remainder !== p.remainder ||
    priceDay(uint(p.created_at)) !== uint(p.entry_day)
  )
    throw Error("BASKET_LOTS_MISMATCH");
  if (
    p.closed_day !== null &&
    (uint(p.closed_day) < uint(p.entry_day) ||
      priceDay(uint(p.closed_day) * DAY_NS) !== uint(p.closed_day))
  )
    throw Error("BASKET_CLOSED_DATE");
  return p;
}
export const quantityLabel = (v: string) => {
  const n = uint(v);
  return `${n / QUANTITY_SCALE}.${(n % QUANTITY_SCALE).toString().padStart(8, "0")}`;
};
