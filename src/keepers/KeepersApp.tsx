import { useCallback, useEffect, useState } from "react";
import { WalletCards, KeyRound, LogOut, Wallet } from "lucide-react";
import { connect, disconnect, walletSelector } from "../client";
import { Button, Notice } from "../terminal/primitives";
import { CollectionPage } from "./CollectionPage";
import { KeeperPage } from "./KeeperPage";
import { VaultPage } from "./VaultPage";
import { ProbePage } from "./ProbePage";
import { AgentPage, AgentsPage, NewAgentPage } from "./AgentsPage";
import { QuickStartPage } from "./QuickStart";
import { shortAccount } from "./KeeperCard";
import { EXPLORER, KEEPERS_CONTRACT, type Version } from "./chain";
import { AGENTS } from "./agents";
import "./keepers.css";
import "./theme.css";

export type Route =
  | { page: "collection"; version: Version }
  | { page: "keeper"; id: string; version: Version }
  | { page: "vault" }
  | { page: "probe" }
  | { page: "agents" }
  | { page: "agent-new" }
  | { page: "agent-start" }
  | { page: "agent"; id: string };

/** /keepers and /keepers/:id are v2; /keepers/v1[/:id] keep v1 cards reachable. */
export function parseRoute(url: string): Route {
  const path = url.split(/[?#]/)[0];
  const keeper = path.match(/^\/keepers\/(?:(v1)\/)?(\d+)\/?$/);
  if (keeper)
    return { page: "keeper", id: keeper[2], version: keeper[1] ? "v1" : "v2" };
  if (/^\/vault\/?$/.test(path)) return { page: "vault" };
  if (/^\/keepers\/probe\/?$/.test(path)) return { page: "probe" };
  if (/^\/agents\/?$/.test(path)) return { page: "agents" };
  if (/^\/agents\/new\/?$/.test(path)) return { page: "agent-new" };
  if (/^\/agents\/start\/?$/.test(path)) return { page: "agent-start" };
  const agent = path.match(/^\/agents\/(\d+)\/?$/);
  if (agent) return { page: "agent", id: agent[1] };
  if (/^\/keepers\/v1\/?$/.test(path))
    return { page: "collection", version: "v1" };
  return { page: "collection", version: "v2" };
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
        ? `Keeper #${route.id} · Agent Wallet`
        : route.page === "vault"
          ? "The Vault · Agent Wallet"
          : route.page === "agent"
            ? `Agent #${route.id} · Agent Wallet`
            : route.page === "agent-new"
              ? "Hire an agent · Agent Wallet"
              : route.page === "agent-start"
                ? "Your first agent · Agent Wallet"
              : route.page === "collection"
                ? "Keepers collection · Agent Wallet"
                : "Agent Wallet";
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
          href="/agents"
          onClick={(e) => {
            e.preventDefault();
            navigate("/agents");
          }}
        >
          <span className="kp-brand-mark" aria-hidden="true">
            <WalletCards />
          </span>
          <span>
            Agent Wallet <small>by Everkeep</small>
          </span>
        </a>
        <nav className="kp-nav" aria-label="Agent Wallet">
          {(
            [
              ["/agents", "Agents", route.page === "agents" || route.page === "agent" || route.page === "agent-new" || route.page === "agent-start"],
              ["/keepers", "Keepers", route.page === "collection" || route.page === "keeper"],
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
              {label === "Agents" && <WalletCards aria-hidden="true" />}
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
          <KeeperPage
            key={`${route.version}-${route.id}`}
            id={route.id}
            version={route.version}
            wallet={api}
            navigate={navigate}
          />
        ) : route.page === "vault" ? (
          <VaultPage wallet={api} navigate={navigate} />
        ) : route.page === "probe" ? (
          <ProbePage wallet={api} />
        ) : route.page === "agents" ? (
          <AgentsPage wallet={api} navigate={navigate} />
        ) : route.page === "agent-new" ? (
          <NewAgentPage wallet={api} navigate={navigate} />
        ) : route.page === "agent-start" ? (
          <QuickStartPage wallet={api} navigate={navigate} />
        ) : route.page === "agent" ? (
          <AgentPage key={route.id} id={route.id} wallet={api} navigate={navigate} />
        ) : (
          <CollectionPage
            key={route.version}
            version={route.version}
            wallet={api}
            navigate={navigate}
          />
        )}
      </main>
      <footer className="kp-footer">
        <span>
          Contracts{" "}
          <a href={`${EXPLORER}/address/${AGENTS}`} target="_blank" rel="noreferrer">
            {AGENTS}
          </a>
          {" and "}
          <a
            href={`${EXPLORER}/address/${KEEPERS_CONTRACT}`}
            target="_blank"
            rel="noreferrer"
          >
            {KEEPERS_CONTRACT}
          </a>
          {" · "}
          <a
            href="/keepers/v1"
            onClick={(e) => {
              e.preventDefault();
              navigate("/keepers/v1");
            }}
          >
            v1 collection (legacy)
          </a>
        </span>
        <span>Testnet only · test NEAR has no monetary value</span>
      </footer>
    </div>
  );
}
