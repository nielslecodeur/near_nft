import { useState } from "react";
import { KeyRound, RefreshCw, Trash2, Wallet as WalletIcon } from "lucide-react";
import { Button, Notice } from "../terminal/primitives";
import { generateAgentKey, type AgentKey } from "./agentKey";
import {
  EXPLORER,
  KEEPERS_CONTRACT,
  YOCTO,
  addAgentKey,
  deleteAgentKey,
  reconnectWithAgentKey,
  viewAccessKey,
  type KeyPermission,
} from "./chain";
import type { Wallet } from "./KeepersApp";

/**
 * Day-1 probe for the agent design: can the connected wallet add a
 * function-call key, limited to the Keepers contract, to the user's account?
 *
 * The key gets a method that does not exist yet (`agent_probe`), so even with
 * its secret it can do nothing. It lives only in this tab, and the last step
 * deletes it from the account.
 */
const METHODS = ["agent_probe"];
const ALLOWANCE = YOCTO / 20n; // 0.05 NEAR of gas, at most

type Log = { tone: "info" | "success" | "error"; text: string; href?: string };

export function ProbePage({ wallet }: { wallet: Wallet }) {
  const [key, setKey] = useState<AgentKey | null>(null);
  const [onChain, setOnChain] = useState<KeyPermission | null | undefined>();
  const [busy, setBusy] = useState("");
  const [log, setLog] = useState<Log[]>([]);
  const push = (l: Log) => setLog((all) => [...all, l]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      push({ tone: "error", text: `${label}: ${(e as Error).message}` });
    } finally {
      setBusy("");
    }
  }

  const check = (k: AgentKey, account: string) =>
    run("Read key on chain", async () => {
      const p = await viewAccessKey(account, k.publicKey);
      setOnChain(p);
      push(
        p
          ? {
              tone: "success",
              text: `Key found on ${account}: ${JSON.stringify(p)}`,
            }
          : { tone: "info", text: `Key not on ${account}.` },
      );
    });

  const methodA = () =>
    run("Method A (AddKey)", async () => {
      const k = key ?? generateAgentKey();
      setKey(k);
      const { signer, outcome } = await addAgentKey(
        k.publicKey,
        KEEPERS_CONTRACT,
        METHODS,
        ALLOWANCE,
      );
      push({
        tone: "success",
        text: `Wallet accepted AddKey for ${signer}.`,
        href: `${EXPLORER}/txns/${outcome.transaction.hash}`,
      });
      await check(k, signer);
    });

  const methodB = () =>
    run("Method B (sign-in key)", async () => {
      const k = key ?? generateAgentKey();
      setKey(k);
      const account = await reconnectWithAgentKey(
        k.publicKey,
        KEEPERS_CONTRACT,
        METHODS,
        ALLOWANCE,
      );
      push({ tone: "info", text: `Reconnected as ${account || "(none)"}.` });
      if (account) await check(k, account);
    });

  const remove = () =>
    run("Delete key", async () => {
      if (!key) return;
      const { signer, outcome } = await deleteAgentKey(key.publicKey);
      push({
        tone: "success",
        text: `Key deleted from ${signer}.`,
        href: `${EXPLORER}/txns/${outcome.transaction.hash}`,
      });
      await check(key, signer);
    });

  return (
    <section className="kp-section" aria-labelledby="probe-title">
      <h1 id="probe-title">Agent key probe</h1>
      <p>
        Checks whether your wallet can add a key, limited to{" "}
        <code>{KEEPERS_CONTRACT}</code> and the method{" "}
        <code>{METHODS.join(", ")}</code>, to your testnet account. That method
        does not exist, so the key can do nothing. Delete it at the end.
      </p>
      {!wallet.account ? (
        <Button
          variant="primary"
          icon={WalletIcon}
          onClick={() => void wallet.connect()}
        >
          Connect wallet
        </Button>
      ) : (
        <div className="kp-hero-actions">
          <Button
            variant="primary"
            icon={KeyRound}
            busy={busy === "Method A (AddKey)"}
            disabled={!!busy}
            onClick={() => void methodA()}
          >
            A · Add key by transaction
          </Button>
          <Button
            icon={RefreshCw}
            busy={busy === "Method B (sign-in key)"}
            disabled={!!busy}
            onClick={() => void methodB()}
          >
            B · Reconnect with key
          </Button>
          <Button
            icon={Trash2}
            busy={busy === "Delete key"}
            disabled={!!busy || !key}
            onClick={() => void remove()}
          >
            Delete key
          </Button>
        </div>
      )}
      {key && (
        <p>
          Public key: <code>{key.publicKey}</code>
          <br />
          On chain:{" "}
          <code>
            {onChain === undefined
              ? "not checked"
              : onChain === null
                ? "absent"
                : JSON.stringify(onChain)}
          </code>
        </p>
      )}
      {log.map((l, i) => (
        <Notice key={i} tone={l.tone} title={`Step ${i + 1}`}>
          {l.text}{" "}
          {l.href && (
            <a href={l.href} target="_blank" rel="noreferrer">
              View transaction
            </a>
          )}
        </Notice>
      ))}
    </section>
  );
}
