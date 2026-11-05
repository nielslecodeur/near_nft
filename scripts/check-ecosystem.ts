import { mkdir, writeFile } from "node:fs/promises";
const endpoint = "https://1click.chaindefuser.com/v0/tokens";
const report: Record<string, unknown> = {
  checked_at: new Date().toISOString(),
  service: "NEAR Intents 1Click",
  endpoint,
  method: "GET",
  token_count: 0,
  sample: [],
  scope:
    "Public asset metadata only. No quote, deposit address, signature, swap or transaction requested.",
};
try {
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const tokens: unknown = await response.json();
  if (!Array.isArray(tokens) || !tokens.length)
    throw new Error("Unexpected asset catalogue");
  report.status = "available";
  report.token_count = tokens.length;
  report.sample = tokens
    .filter(
      (token) =>
        token &&
        typeof token === "object" &&
        ["USDC", "NEAR"].includes(token.symbol),
    )
    .slice(0, 8)
    .map((token) => ({
      symbol: String(token.symbol).slice(0, 24),
      asset_id: String(token.assetId || "").slice(0, 200),
      blockchain: String(token.blockchain || "").slice(0, 40),
      decimals: token.decimals,
    }));
} catch (error) {
  report.status = "unavailable";
  report.error = error instanceof Error ? error.message : String(error);
}
await mkdir("docs/results", { recursive: true });
await writeFile(
  "docs/results/ecosystem-capabilities.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
