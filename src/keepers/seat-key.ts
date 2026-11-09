/**
 * One name for a seat across the two agents contracts.
 *
 * Seat ids restart at 1 in each contract, so the app, the runner and the MCP
 * server name a seat by its key: "9" for v1 (unchanged, so existing links,
 * runner jobs and saved records keep working) and "v2-3" for v2.
 * No browser or Node dependency: shared by src/ and scripts/.
 */
export type AgentsVersion = "v1" | "v2";

export const seatKey = (version: AgentsVersion, num: string | number) =>
  version === "v2" ? `v2-${num}` : String(num);

export function parseSeatKey(key: string): { version: AgentsVersion; num: string } | null {
  const m = /^(?:(v2)-)?(\d{1,18})$/.exec(String(key).trim());
  return m ? { version: m[1] ? "v2" : "v1", num: m[2] } : null;
}

/** "#9" for v1, "v2 #3" for v2. */
export function seatLabel(key: string) {
  const p = parseSeatKey(key);
  if (!p) return key;
  return p.version === "v2" ? `v2 #${p.num}` : `#${p.num}`;
}
