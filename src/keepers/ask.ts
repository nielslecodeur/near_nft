/**
 * The Ask bar: turns a short sentence (English or French) into an intent.
 * Deterministic rules, no model, so anyone can reproduce what it does.
 * Amounts are returned as decimal strings; the caller converts them.
 */

export type Intent =
  | { type: "buy"; maxPrice?: string; tier?: number; tokenId?: string; agent?: string }
  | { type: "pay"; amount: string; payee: string; memo?: string; agent?: string }
  | { type: "pause_all" }
  | { type: "status" }
  | { type: "help"; reason?: string };

// No trailing \b: accented letters are not word characters in JS regexes.
const TIER_WORDS: [RegExp, number][] = [
  [/\banim(ated|[ée])/, 3],
  [/\bholo/, 2],
  [/\b(brushed|bross)/, 1],
  [/\b(matte|mat\b)/, 0],
];
const ACCOUNT = /([a-z0-9][a-z0-9._-]*\.(?:testnet|near)|[0-9a-f]{64})\b/;
const NUMBER = /(\d+(?:[.,]\d+)?)/;

export const EXAMPLES = [
  "buy a holo Keeper under 1 NEAR",
  "buy Keeper #3",
  "pay 2 USDC to shop.testnet for coffee",
  "pause all",
  "status",
];

export function parseAsk(input: string): Intent {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return { type: "help" };
  const agent = text.match(/@([a-z0-9-]+)/)?.[1];

  if (/\b(pause|stop|freeze|arr[êe]te|coupe)\b/.test(text) && /\b(all|every|everything|tout|tous|toutes)\b/.test(text))
    return { type: "pause_all" };
  if (/^(stop|pause|panic)!?$/.test(text)) return { type: "pause_all" };

  if (/\b(pay|send|tip|transfer|paie|payer|envoie|envoyer|verse)\b/.test(text)) {
    const amount = text.match(new RegExp(NUMBER.source + "\\s*(?:usdc|\\$|dollars?|usd)?"))?.[1];
    const payee = text.match(ACCOUNT)?.[1];
    const memo = text.match(/\b(?:for|pour)\s+(.{1,40})$/)?.[1];
    if (!amount) return { type: "help", reason: "How much? e.g. pay 2 USDC to shop.testnet" };
    if (!payee) return { type: "help", reason: "To whom? Name a .testnet account." };
    return { type: "pay", amount: amount.replace(",", "."), payee, memo, agent };
  }

  if (/\b(buy|get|grab|snipe|ach[eè]te|acheter|prends|trouve)\b/.test(text)) {
    const tokenId = text.match(/#\s*(\d+)/)?.[1];
    const price = text.match(
      new RegExp(
        "(?:under|below|max|less than|at most|for|<|<=|sous|moins de|max\\.?|pour)\\s*" + NUMBER.source,
      ),
    )?.[1];
    const tier = TIER_WORDS.find(([re]) => re.test(text))?.[1];
    return {
      type: "buy",
      tokenId,
      maxPrice: price?.replace(",", "."),
      tier,
      agent,
    };
  }

  if (/\b(status|how much|balance|solde|combien|r[ée]sum|summary)/.test(text))
    return { type: "status" };

  return { type: "help" };
}
