/**
 * Who may drive the agent runner.
 *
 * - A browser signs ONE NEP-413 message with the account's wallet (no
 *   transaction, no fee). The runner checks the signature and that the key is a
 *   FullAccess key of that account on chain, then hands out a session token
 *   bound to that account (12 h). With it, the page sees and drives only that
 *   account's agents.
 * - Local tools (the MCP server, scripts) use the admin token the runner writes
 *   to .local/runner-token at each start (mode 600, new token every start). The
 *   runner listens on 127.0.0.1 only, so the token is useless off this machine.
 *
 * Challenges are single use and expire after 5 minutes. Tokens are stored as
 * sha256 hashes only.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { verifySignature, type SignedMessage } from "../src/keepers/nep413.js";

export const RECIPIENT = "agent-wallet-runner";
const CHALLENGE_MS = 5 * 60_000;
export const SESSION_MS = 12 * 3600_000;

export type Principal = { admin: true } | { admin: false; accountId: string };
type Session = { hash: string; accountId: string; expiresAt: number };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function challengeMessage(accountId: string, issuedAt: number) {
  return `Agent Wallet: let the agent runner on this computer manage the agents of ${accountId}. Issued ${new Date(issuedAt).toISOString()}. This is not a transaction.`;
}

export class RunnerAuth {
  private challenges = new Map<string, { accountId: string; message: string; expiresAt: number }>();
  private sessions: Session[] = [];
  private adminHash = "";

  constructor(
    private opts: {
      rpc: string;
      sessionsFile: string;
      adminTokenFile: string;
      /** Override the on-chain FullAccess check (tests). */
      isFullAccess?: (accountId: string, publicKey: string) => Promise<boolean>;
    },
  ) {}

  async start() {
    const token = randomBytes(32).toString("hex");
    this.adminHash = sha(token);
    await mkdir(dirname(this.opts.adminTokenFile), { recursive: true });
    await writeFile(this.opts.adminTokenFile, token + "\n", { mode: 0o600 });
    await chmod(this.opts.adminTokenFile, 0o600).catch(() => {});
    try {
      const saved = JSON.parse(await readFile(this.opts.sessionsFile, "utf8")) as Session[];
      this.sessions = saved.filter((s) => s.expiresAt > Date.now());
    } catch {
      this.sessions = [];
    }
  }

  /** A fresh single-use nonce and the exact message the wallet must sign. */
  challenge(accountId: string) {
    const now = Date.now();
    for (const [k, c] of this.challenges) if (c.expiresAt < now) this.challenges.delete(k);
    if (this.challenges.size > 1000) throw new Error("too many pending sign-ins");
    const nonce = randomBytes(32).toString("base64");
    const message = challengeMessage(accountId, now);
    this.challenges.set(nonce, { accountId, message, expiresAt: now + CHALLENGE_MS });
    return { nonce, message, recipient: RECIPIENT };
  }

  /** Verifies a signed challenge and returns a session token for that account. */
  async session(nonce: string, signed: SignedMessage) {
    const c = this.challenges.get(nonce);
    this.challenges.delete(nonce); // single use, even when the check fails
    if (!c || c.expiresAt < Date.now()) throw new AuthError(401, "sign-in expired: ask for a new challenge");
    if (signed.accountId !== c.accountId) throw new AuthError(401, "signed for a different account");
    const ok = await verifySignature(signed, {
      message: c.message,
      recipient: RECIPIENT,
      nonce: Uint8Array.from(Buffer.from(nonce, "base64")),
    }).catch(() => false);
    if (!ok) throw new AuthError(401, "the signature does not match the message");
    const full = await (this.opts.isFullAccess ?? this.fullAccessOnChain.bind(this))(c.accountId, signed.publicKey);
    if (!full) throw new AuthError(401, "the signing key is not a full-access key of this account");
    const token = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + SESSION_MS;
    this.sessions = [...this.sessions.filter((s) => s.expiresAt > Date.now()), { hash: sha(token), accountId: c.accountId, expiresAt }];
    await this.saveSessions();
    return { token, accountId: c.accountId, expiresAt };
  }

  /** Who sent this request, from its `Authorization: Bearer <token>` header. */
  principal(header: string | undefined): Principal | null {
    const m = header?.match(/^Bearer ([0-9a-f]{64})$/);
    if (!m) return null;
    const h = sha(m[1]);
    if (this.adminHash && sameHash(h, this.adminHash)) return { admin: true };
    const s = this.sessions.find((x) => sameHash(x.hash, h) && x.expiresAt > Date.now());
    return s ? { admin: false, accountId: s.accountId } : null;
  }

  async logout(header: string | undefined) {
    const m = header?.match(/^Bearer ([0-9a-f]{64})$/);
    if (!m) return;
    const h = sha(m[1]);
    this.sessions = this.sessions.filter((s) => !sameHash(s.hash, h));
    await this.saveSessions();
  }

  private async saveSessions() {
    await mkdir(dirname(this.opts.sessionsFile), { recursive: true, mode: 0o700 });
    await writeFile(this.opts.sessionsFile, JSON.stringify(this.sessions) + "\n", { mode: 0o600 });
    await chmod(this.opts.sessionsFile, 0o600).catch(() => {});
  }

  private async fullAccessOnChain(accountId: string, publicKey: string) {
    const r = await fetch(this.opts.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "auth",
        method: "query",
        params: { request_type: "view_access_key", account_id: accountId, public_key: publicKey, finality: "final" },
      }),
    });
    const data = (await r.json()) as { result?: { permission?: unknown } };
    return data.result?.permission === "FullAccess";
  }
}

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
