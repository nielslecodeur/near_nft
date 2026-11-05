import { useCallback, useEffect, useState } from "react";
import { KeyRound, LogOut, Wallet } from "lucide-react";
import { connect, disconnect, walletSelector } from "../client";
import { Button, Notice } from "../terminal/primitives";
import { CollectionPage } from "./CollectionPage";
import { KeeperPage } from "./KeeperPage";
import { VaultPage } from "./VaultPage";
import { shortAccount } from "./KeeperCard";
import { EXPLORER, KEEPERS_CONTRACT } from "./chain";
import "./keepers.css";

export type Route =
  { page: "collection" } | { page: "keeper"; id: string } | { page: "vault" };

export function parseRoute(path: string): Route {
  const keeper = path.match(/^\/keepers\/(\d+)\/?$/);
  if (keeper) return { page: "keeper", id: keeper[1] };
  if (/^\/vault\/?$/.test(path)) return { page: "vault" };
  return { page: "collection" };
}

export type Wallet = {
  account: string;
  ready: boolean;
  connect: () => Promise<string>;
};

function useWallet() {
  const [account, setAccount] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true,
      cleanup = () => {};
    void walletSelector()
      .then(async (c) => {
        const set = (value: string) => alive && setAccount(value);
        const signIn = (p: { accounts: { accountId: string }[] }) =>
          set(p.accounts[0]?.accountId || "");
        const signOut = () => set("");
        c.on("wallet:signIn", signIn);
        c.on("wallet:signOut", signOut);
        cleanup = () => {
          c.off("wallet:signIn", signIn);
          c.off("wallet:signOut", signOut);
        };
        try {
          const session = await c.getConnectedWallet();
          set(session.accounts[0]?.accountId || "");
        } catch {
          set("");
        }
        if (alive) setReady(true);
      })
      .catch(
        (e) => alive && setError(`Wallet connector unavailable: ${String(e)}`),
      );
    return () => {
      alive = false;
      cleanup();
    };
  }, []);
  const doConnect = useCallback(async () => {
    setError("");
    const id = await connect();
    setAccount(id);
    return id;
  }, []);
  const doDisconnect = useCallback(async () => {
    await disconnect();
    setAccount("");
  }, []);
  return {
    account,
    ready,
    error,
    connect: doConnect,
    disconnect: doDisconnect,
  };
}

export function KeepersApp() {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(location.pathname),
  );
  const wallet = useWallet();
  const [connecting, setConnecting] = useState(false);
  useEffect(() => {
    const sync = () => setRoute(parseRoute(location.pathname));
    addEventListener("popstate", sync);
    return () => removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    document.title =
      route.page === "keeper"
        ? `Keeper #${route.id} · Everkeep Keepers`
        : route.page === "vault"
          ? "The Vault · Everkeep Keepers"
          : "Everkeep Keepers";
    document.documentElement.lang = "en";
  }, [route]);
  const navigate = useCallback((to: string) => {
    history.pushState(null, "", to);
    setRoute(parseRoute(to));
    scrollTo({ top: 0 });
  }, []);
  async function onConnect() {
    setConnecting(true);
    try {
      await wallet.connect();
    } catch {
      // The user closed the wallet picker; nothing to report.
    } finally {
      setConnecting(false);
    }
  }
  const api: Wallet = {
    account: wallet.account,
    ready: wallet.ready,
    connect: wallet.connect,
  };
  return (
    <div className="ek-ui kp-app">
      <header className="kp-header">
        <a
          className="kp-brand"
          href="/keepers"
          onClick={(e) => {
            e.preventDefault();
            navigate("/keepers");
          }}
        >
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="14" fill="var(--color-s3)" />
            <circle cx="32" cy="26" r="10" fill="var(--color-brand)" />
            <path d="M27 32h10l3 18H24z" fill="var(--color-brand)" />
          </svg>
          <span>
            Keepers <small>by Everkeep</small>
          </span>
        </a>
        <nav className="kp-nav" aria-label="Keepers">
          {(
            [
              ["/keepers", "Collection", route.page !== "vault"],
              ["/vault", "Vault", route.page === "vault"],
            ] as const
          ).map(([to, label, current]) => (
            <a
              key={to}
              href={to}
              aria-current={current ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate(to);
              }}
            >
              {label === "Vault" && <KeyRound aria-hidden="true" />}
              {label}
            </a>
          ))}
        </nav>
        <div className="kp-header-right">
          <span className="kp-network">NEAR testnet</span>
          {wallet.account ? (
            <div className="kp-account">
              <a
                className="kp-account-id"
                href={`${EXPLORER}/address/${wallet.account}`}
                target="_blank"
                rel="noreferrer"
              >
                {shortAccount(wallet.account)}
              </a>
              <Button
                variant="ghost"
                icon={LogOut}
                onClick={() => void wallet.disconnect()}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              icon={Wallet}
              busy={connecting}
              onClick={() => void onConnect()}
            >
              Connect wallet
            </Button>
          )}
        </div>
      </header>
      <main className="kp-main" id="content">
        {wallet.error && (
          <Notice tone="error" title="Wallet">
            {wallet.error}
          </Notice>
        )}
        {route.page === "keeper" ? (
          <KeeperPage id={route.id} wallet={api} navigate={navigate} />
        ) : route.page === "vault" ? (
          <VaultPage wallet={api} navigate={navigate} />
        ) : (
          <CollectionPage wallet={api} navigate={navigate} />
        )}
      </main>
      <footer className="kp-footer">
        <span>
          Contract{" "}
          <a
            href={`${EXPLORER}/address/${KEEPERS_CONTRACT}`}
            target="_blank"
            rel="noreferrer"
          >
            {KEEPERS_CONTRACT}
          </a>
        </span>
        <span>Testnet only · test NEAR has no monetary value</span>
      </footer>
    </div>
  );
}
