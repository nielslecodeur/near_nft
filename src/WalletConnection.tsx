import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Snapshot } from "../packages/shared/index";
import type { WalletBalances } from "../packages/shared/network";
import { TESTNET } from "../packages/shared/network";
import {
  connect,
  disconnect,
  ownedPlans,
  verified,
  walletSelector,
} from "./client";
import {
  readWalletBalances,
  testnetDeployment,
  assertTestnet,
} from "./testnet-network";
import { lockVault } from "./key-vault";
import { displayAmount } from "../packages/shared/ui";
import "./wallet-connection.css";
import { Wallet } from "lucide-react";
export function WalletConnection({
  disabled,
  onAccount,
  onUseTestnet,
  onOpenPlan,
  local = false,
  children,
}: {
  disabled: boolean;
  onAccount: (id: string) => void;
  onUseTestnet: () => void;
  onOpenPlan: (s: Snapshot) => void;
  local?: boolean;
  children?: ReactNode;
}) {
  const [id, setId] = useState(""),
    [balance, setBalance] = useState<WalletBalances | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [notice, setNotice] = useState("");
  const callback = useRef(onAccount);
  callback.current = onAccount;
  const generation = useRef(0),
    current = useRef(""),
    lock = useRef(false);
  const connectAction = useRef(() => {});
  connectAction.current = () => {
    if (disabled) return;
    onUseTestnet();
    void task(async () => {
      await assertTestnet();
      await connect();
    });
  };
  useEffect(() => {
    const open = () => connectAction.current();
    window.addEventListener("everkeep-connect", open);
    return () => window.removeEventListener("everkeep-connect", open);
  }, []);
  async function refresh(owner = current.current) {
    const ticket = ++generation.current;
    if (!owner) {
      setBalance(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await testnetDeployment();
      const b = await readWalletBalances(owner);
      if (ticket === generation.current) setBalance(b);
    } catch (e) {
      if (ticket === generation.current) {
        setBalance(null);
        setError(String(e));
      }
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    let alive = true,
      cleanup = () => {};
    void walletSelector()
      .then(async (c) => {
        const account = (value: string) => {
          if (!alive) return;
          if (current.current !== value) {
            lockVault();
            current.current = value;
            setId(value);
            setBalance(null);
            void refresh(value);
          }
          callback.current(value);
        };
        const signIn = (p: { accounts: { accountId: string }[] }) =>
          account(p.accounts[0]?.accountId || "");
        const signOut = () => account("");
        c.on("wallet:signIn", signIn);
        c.on("wallet:signOut", signOut);
        cleanup = () => {
          c.off("wallet:signIn", signIn);
          c.off("wallet:signOut", signOut);
        };
        try {
          const session = await c.getConnectedWallet();
          account(session.accounts[0]?.accountId || "");
        } catch {
          account("");
        }
      })
      .catch((e) => {
        if (alive)
          setError(
            "Le connecteur wallet est indisponible. Réessayez la connexion. " +
              String(e),
          );
      });
    const update = () => void refresh();
    window.addEventListener("everkeep-balances", update);
    window.addEventListener("focus", update);
    return () => {
      alive = false;
      generation.current++;
      cleanup();
      window.removeEventListener("everkeep-balances", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  async function task(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        /reject|denied|cancel|closed/i.test(String(e))
          ? "Connexion ou signature refusée. Aucun succès présumé ; vous pouvez réessayer."
          : String(e),
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const short = id.length > 25 ? id.slice(0, 12) + "…" + id.slice(-8) : id;
  const errorBlock = error && (
    <div className="wallet-status-error" role="alert">
      <p>
        {id
          ? "Les soldes du wallet sont indisponibles. Actualisez-les avant de poursuivre ; aucun solde nul n’est présumé."
          : /reject|denied|cancel|closed|refus/i.test(error)
            ? "La connexion a été interrompue ou refusée. Votre choix est conservé ; vous pouvez réessayer."
            : "Le wallet n’a pas pu être connecté. Réessayez sans recommencer votre demande."}
      </p>
      <button
        disabled={busy || loading}
        onClick={() => (id ? void refresh() : connectAction.current())}
      >
        Réessayer
      </button>
      <details>
        <summary>Détails techniques</summary>
        <p>{error}</p>
      </details>
    </div>
  );
  return (
    <div className="wallet-header-zone">
      <span className="wallet-network">
        {local ? "Démo locale · NEAR sandbox" : "NEAR Testnet"}
      </span>
      {!id ? (
        <button
          className="wallet-connect"
          aria-label={busy ? "Connexion en cours" : "Connecter un wallet"}
          disabled={disabled || busy}
          onClick={() => connectAction.current()}
        >
          <Wallet className="wallet-connect-icon" aria-hidden="true" />
          <span>{busy ? "Connexion…" : "Connecter un wallet"}</span>
        </button>
      ) : (
        <details className="wallet-account-menu">
          <summary>
            <span title={id}>{short}</span>
            <span className="wallet-mobile-label">
              {error
                ? "Soldes indisponibles"
                : loading
                  ? "Lecture des soldes…"
                  : "Soldes"}
            </span>
            {!local && (
              <span className="wallet-header-balances">
                {loading ? (
                  "Lecture des soldes…"
                ) : balance ? (
                  <>
                    <span>{compactNear(balance.nearBalance)} NEAR</span>
                    <span>
                      {balance.asset
                        ? displayAmount(balance.demoUSD) + " demoUSD"
                        : "demoUSD non configuré"}
                    </span>
                  </>
                ) : (
                  "Soldes indisponibles"
                )}
              </span>
            )}
          </summary>
          <div className="wallet-account-panel">
            <strong>Votre wallet testnet</strong>
            <p className="wallet-address">{id}</p>
            {errorBlock}
            {local && (
              <p>
                La démo Alice/Bob est séparée de ce wallet.{" "}
                <button disabled={disabled} onClick={onUseTestnet}>
                  Passer sur NEAR Testnet
                </button>
              </p>
            )}
            <p>
              Solde wallet : NEAR et demoUSD affichés séparément. Les fonds des
              positions ne sont pas additionnés ici.
            </p>
            {balance && (
              <dl>
                <dt>Solde wallet NEAR</dt>
                <dd>{displayAmount(balance.nearBalance, 24)} NEAR</dd>
                <dt>Réservé au stockage</dt>
                <dd>{displayAmount(balance.storageReserved, 24)} NEAR</dd>
                <dt>Réserve indicative de gas</dt>
                <dd>{displayAmount(balance.gasReserve, 24)} NEAR</dd>
                <dt>Budget technique estimé après réserves</dt>
                <dd>{displayAmount(balance.spendableEstimate, 24)} NEAR</dd>
                <dt>demoUSD dans le wallet</dt>
                <dd>
                  {balance.asset
                    ? displayAmount(balance.demoUSD)
                    : "Jeton non configuré"}
                </dd>
              </dl>
            )}
            <div className="wallet-account-actions">
              <button disabled={busy || loading} onClick={() => void refresh()}>
                Actualiser les soldes
              </button>
              <button
                onClick={() =>
                  void task(async () => {
                    await navigator.clipboard.writeText(id);
                    setNotice("Adresse copiée.");
                  })
                }
              >
                Copier l’adresse
              </button>
              <a
                href={TESTNET.explorer + "/address/" + encodeURIComponent(id)}
                target="_blank"
                rel="noreferrer"
              >
                Voir le compte sur l’explorateur
              </a>
              <a href={TESTNET.faucet} target="_blank" rel="noreferrer">
                Obtenir des NEAR de test
              </a>
              <button
                disabled={busy || disabled}
                onClick={() =>
                  void task(async () => {
                    onUseTestnet();
                    const positions = await ownedPlans(id);
                    if (!positions.length) {
                      setNotice("Aucune position NFT dans cette collection.");
                      return;
                    }
                    onOpenPlan(await verified(positions[0], true));
                  })
                }
              >
                Retrouver mes positions
              </button>
              <button
                disabled={disabled || busy}
                onClick={() =>
                  void task(async () => {
                    await disconnect();
                    setId("");
                    setBalance(null);
                    callback.current("");
                  })
                }
              >
                Se déconnecter
              </button>
            </div>
            {children}
          </div>
        </details>
      )}
      {!id && children}
      {!id && errorBlock}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
function compactNear(raw: string) {
  const n = BigInt(raw),
    scale = 10n ** 20n;
  return (
    displayAmount((n / scale).toString(), 4) + (n % scale !== 0n ? " ≈" : "")
  );
}
