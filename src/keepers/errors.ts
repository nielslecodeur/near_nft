/** Wallet, RPC and contract errors, said plainly. No browser dependency, so it is unit-tested. */

/**
 * One clear sentence for what went wrong, instead of a wallet's or an RPC's raw
 * text. Unknown errors keep their own message, trimmed.
 */
export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e ?? "");
  const text = raw.replace(/^Error:\s*/i, "");
  if (/(user )?(rejected|cancell?ed|denied|declined)|(popup|window|modal) (was )?closed/i.test(text))
    return "Cancelled in your wallet: nothing was sent.";
  if (/NotEnoughBalance|LackBalanceForState|not enough balance|insufficient (funds|balance)/i.test(text))
    return "Not enough test NEAR in your wallet for gas and storage. Get some free from the NEAR faucet, then try again.";
  if (/does not have enough balance|The account doesn't have enough balance/i.test(text))
    return "Not enough tokens in your wallet for this amount.";
  const panic = text.match(/Smart contract panicked:\s*([^"\\}\n]+)/i) ?? text.match(/ExecutionError"?:?\s*"?([^"\\}\n]+)/i);
  if (panic) return `The contract refused: ${panic[1].trim().replace(/\.$/, "")}.`;
  if (/does not exist while viewing|AccountDoesNotExist|UNKNOWN_ACCOUNT/i.test(text))
    return "That account does not exist on testnet. Check the spelling.";
  if (/Failed to fetch|NetworkError|network error|ECONNREFUSED|timed? ?out|AbortError|TimeoutError/i.test(text))
    return "Could not reach the network. Check your connection and try again.";
  if (/\b429\b|Too Many Requests|rate.?limit/i.test(text))
    return "The network is busy (rate limit). Wait a few seconds and try again.";
  return text.length > 220 ? `${text.slice(0, 200).trim()}…` : text;
}
