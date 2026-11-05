import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  KeyRound,
  Lock,
  LockOpen,
  ShieldCheck,
  Sparkles,
  Wallet as WalletIcon,
} from "lucide-react";
import { Button, Notice, Skeleton } from "../terminal/primitives";
import { KeeperTile, basketCount, shortAccount } from "./KeeperCard";
import { TIER_LABELS } from "./art";
import {
  KEEPERS_CONTRACT,
  KEEPERS_V1,
  cardHref,
  cardsForOwner,
  formatNear,
  isHolder,
  proveAccount,
  type AccountProof,
  type Card,
} from "./chain";
import type { Wallet } from "./KeepersApp";

/** How long a signed proof stays valid in this tab before asking again. */
const PROOF_TTL_MS = 30 * 60 * 1000;
/** Ownership is re-read from chain on this interval, so a sale closes the Vault. */
const RECHECK_MS = 10_000;
const STORE = "keepers.vault.proof";

function loadProof(account: string): AccountProof | null {
  try {
    const p = JSON.parse(
      sessionStorage.getItem(STORE) || "null",
    ) as AccountProof | null;
    return p &&
      p.accountId === account &&
      Date.now() - p.issuedAt < PROOF_TTL_MS
      ? p
      : null;
  } catch {
    return null;
  }
}
function saveProof(p: AccountProof | null) {
  try {
    if (p) sessionStorage.setItem(STORE, JSON.stringify(p));
    else sessionStorage.removeItem(STORE);
  } catch {
    // Storage unavailable: the proof just lasts for this page view.
  }
}

type Access =
  | { state: "checking" }
  | { state: "granted"; cards: Card[]; checkedAt: number }
  | { state: "denied"; revoked: boolean; checkedAt: number };

export function VaultPage({
  wallet,
  navigate,
}: {
  wallet: Wallet;
  navigate: (to: string) => void;
}) {
  const [proof, setProof] = useState<AccountProof | null>(null);
  const [access, setAccess] = useState<Access>({ state: "checking" });
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);
  const [, tick] = useState(0);
  const wasHolder = useRef(false);

  // A proof belongs to one account: switching accounts locks the Vault again.
  useEffect(() => {
    setProof(wallet.account ? loadProof(wallet.account) : null);
    setAccess({ state: "checking" });
    wasHolder.current = false;
  }, [wallet.account]);

  const check = useCallback(async (account: string) => {
    try {
      // A holder of either collection (v2, or legacy v1) opens the Vault.
      const [h2, h1, c2, c1] = await Promise.all([
        isHolder(account, "v2"),
        isHolder(account, "v1"),
        cardsForOwner(account, "v2"),
        cardsForOwner(account, "v1"),
      ]);
      const holder = h2 || h1;
      const cards = [...c2, ...c1];
      const checkedAt = Date.now();
      if (holder) {
        wasHolder.current = true;
        setAccess({ state: "granted", cards, checkedAt });
      } else {
        setAccess({ state: "denied", revoked: wasHolder.current, checkedAt });
      }
      setError("");
    } catch (e) {
      setError(`Could not read ownership from chain: ${String(e)}`);
    }
  }, []);

  useEffect(() => {
    if (!proof) return;
    void check(proof.accountId);
    const timer = setInterval(() => void check(proof.accountId), RECHECK_MS);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    const onFocus = () => void check(proof.accountId);
    addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
      removeEventListener("focus", onFocus);
    };
  }, [proof, check]);

  async function onProve() {
    setSigning(true);
    setError("");
    try {
      if (!wallet.account) await wallet.connect();
      const p = await proveAccount();
      saveProof(p);
      setProof(p);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSigning(false);
    }
  }

  const header = (
    <div className="kp-vault-head">
      <p className="kp-eyebrow">Holder-only</p>
      <h1>The Vault</h1>
      <p className="kp-lede">
        Only accounts that currently own a Keeper can open this page. Ownership
        is read from the contract, not from a session: sell your last Keeper and
        the door closes.
      </p>
    </div>
  );

  if (!wallet.account || !proof)
    return (
      <div className="kp-vault">
        {header}
        <section className="kp-gate">
          <Lock aria-hidden="true" className="kp-gate-icon" />
          <ol className="kp-gate-steps">
            <li data-done={Boolean(wallet.account)}>
              <strong>Connect your wallet</strong>
              <span>
                {wallet.account
                  ? shortAccount(wallet.account)
                  : "Any NEAR testnet wallet."}
              </span>
            </li>
            <li>
              <strong>Prove you control the account</strong>
              <span>
                Your wallet signs a message (NEP-413). No transaction, no fee.
              </span>
            </li>
            <li>
              <strong>Ownership check on chain</strong>
              <span>
                <code>is_holder</code> on {KEEPERS_CONTRACT} (or the legacy{" "}
                {KEEPERS_V1})
              </span>
            </li>
          </ol>
          {error && (
            <Notice tone="error" title="Could not open the Vault">
              {error}
            </Notice>
          )}
          <Button
            variant="primary"
            icon={wallet.account ? KeyRound : WalletIcon}
            busy={signing}
            onClick={() => void onProve()}
          >
            {wallet.account
              ? "Sign to open the Vault"
              : "Connect and open the Vault"}
          </Button>
        </section>
      </div>
    );

  if (access.state === "checking")
    return (
      <div className="kp-vault">
        {header}
        <Skeleton label="Checking ownership on chain" />
      </div>
    );

  const checkedAgo = Math.max(
    0,
    Math.round((Date.now() - access.checkedAt) / 1000),
  );

  if (access.state === "denied")
    return (
      <div className="kp-vault">
        {header}
        <section className="kp-gate kp-gate--denied" aria-live="polite">
          <Lock aria-hidden="true" className="kp-gate-icon" />
          <h2>{access.revoked ? "Access revoked" : "Access denied"}</h2>
          <p>
            {access.revoked
              ? `${shortAccount(proof.accountId)} no longer owns a Keeper. Access moved with the card to its new owner.`
              : `${shortAccount(proof.accountId)} does not own a Keeper right now.`}
          </p>
          <p className="kp-hint">
            Checked on chain {checkedAgo}s ago · rechecked every{" "}
            {RECHECK_MS / 1000}s.
          </p>
          <Button
            variant="primary"
            icon={Sparkles}
            onClick={() => navigate("/keepers")}
          >
            Mint or buy a Keeper
          </Button>
        </section>
      </div>
    );

  const cards = access.cards;
  const top = cards.reduce((m, c) => Math.max(m, c.tier), 0);
  const held = cards.reduce((s, c) => s + BigInt(c.balance), 0n);
  const royalties = cards.reduce((s, c) => s + BigInt(c.royalties_earned), 0n);
  const trades = cards.reduce((s, c) => s + c.trades, 0);

  return (
    <div className="kp-vault">
      {header}
      {error && (
        <Notice tone="error" title="Ownership check failed">
          {error}
        </Notice>
      )}
      <section className="kp-vault-open" aria-live="polite">
        <div className={`kp-pass kp-pass--${top}`}>
          <div className="kp-pass-top">
            <LockOpen aria-hidden="true" />
            <span>Vault pass</span>
            <span className={`kp-tier kp-tier--${top}`}>
              {TIER_LABELS[top]}
            </span>
          </div>
          <strong className="kp-pass-account kp-num">{proof.accountId}</strong>
          <span className="kp-pass-meta">
            Holder of {cards.length} Keeper{cards.length > 1 ? "s" : ""} · pass
            level set by your highest tier
          </span>
          <span className="kp-pass-check">
            <BadgeCheck aria-hidden="true" /> Verified on chain {checkedAgo}s
            ago
          </span>
        </div>
        <dl className="kp-vault-totals">
          <div>
            <dt>NEAR held by your cards</dt>
            <dd className="kp-num">{formatNear(held)}</dd>
          </div>
          <div>
            <dt>Royalties your cards earned</dt>
            <dd className="kp-num">{formatNear(royalties)}</dd>
          </div>
          <div>
            <dt>Resales of your cards</dt>
            <dd className="kp-num">{trades}</dd>
          </div>
        </dl>
      </section>

      <section className="kp-vault-section" aria-labelledby="kp-ledger">
        <h2 id="kp-ledger">Vault ledger</h2>
        <p className="kp-hint">
          Lifetime history of each card you hold, read from the contract.
        </p>
        <div className="kp-table-wrap">
          <table className="kp-table">
            <thead>
              <tr>
                <th scope="col">Keeper</th>
                <th scope="col">Tier</th>
                <th scope="col">Holds</th>
                <th scope="col">Royalties earned</th>
                <th scope="col">Deposited</th>
                <th scope="col">Withdrawn</th>
                <th scope="col">Resales</th>
                <th scope="col">Basket</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={`${c.version}-${c.token_id}`}>
                  <th scope="row">
                    <a
                      href={cardHref(c)}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(cardHref(c));
                      }}
                    >
                      #{c.token_id}
                    </a>
                    {c.version === "v1" && (
                      <span className="kp-version">v1</span>
                    )}
                  </th>
                  <td>
                    <span className={`kp-tier kp-tier--${c.tier}`}>
                      {TIER_LABELS[c.tier]}
                    </span>
                  </td>
                  <td className="kp-num">{formatNear(c.balance)}</td>
                  <td className="kp-num">{formatNear(c.royalties_earned)}</td>
                  <td className="kp-num">{formatNear(c.deposited_total)}</td>
                  <td className="kp-num">{formatNear(c.withdrawn_total)}</td>
                  <td className="kp-num">{c.trades}</td>
                  <td className="kp-num">
                    {c.version === "v1" ? "—" : basketCount(c)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="kp-vault-section" aria-labelledby="kp-yours">
        <h2 id="kp-yours">Your Keepers</h2>
        <div className="kp-grid">
          {cards.map((card) => (
            <KeeperTile
              key={`${card.version}-${card.token_id}`}
              card={card}
              account={wallet.account}
              href={cardHref(card)}
              onOpen={() => navigate(cardHref(card))}
            />
          ))}
        </div>
      </section>

      <details className="kp-proof">
        <summary>How access was checked</summary>
        <div className="kp-proof-body">
          <ShieldCheck aria-hidden="true" className="kp-proof-icon" />
          <div>
            <p>
              1. Your wallet signed this NEP-413 message for{" "}
              <code>{KEEPERS_CONTRACT}</code>: <code>{proof.message}</code>
            </p>
            <p>
              2. The page verified the ed25519 signature and confirmed on chain
              that <code>{proof.publicKey}</code> is a full-access key of{" "}
              <code>{proof.accountId}</code>.
            </p>
            <p>
              3. <code>is_holder({proof.accountId})</code> returned{" "}
              <code>true</code>. It is re-read every {RECHECK_MS / 1000}s and
              when you return to the tab.
            </p>
            <p>
              Limit: this check runs in your browser, so it gates the page, not
              secret data. Content that must stay secret needs a server that
              verifies the same proof.
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}
