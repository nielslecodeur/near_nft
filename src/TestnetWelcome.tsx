import { useEffect, useState } from "react";
import { TESTNET, type WalletBalances } from "../packages/shared/network";
import { readWalletBalances } from "./testnet-network";
import { TESTNET_WORKER } from "./testnet-missions";
export function TestnetWelcome({
  owner,
  onRefresh,
  initiallyOpen = false,
  onReturn,
}: {
  owner: string;
  onRefresh: () => void;
  initiallyOpen?: boolean;
  onReturn?: () => void;
}) {
  const [balance, setBalance] = useState<WalletBalances | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    if (!owner) {
      setBalance(null);
      return;
    }
    try {
      setBalance(await readWalletBalances(owner));
      setError("");
    } catch (e) {
      setBalance(null);
      setError(String(e));
    }
  }
  useEffect(() => {
    void refresh();
    const update = () => void refresh();
    window.addEventListener("everkeep-balances", update);
    return () => window.removeEventListener("everkeep-balances", update);
  }, [owner]);
  async function grant() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(TESTNET_WORKER + "/faucet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account: owner }),
          signal: AbortSignal.timeout(60000),
        }),
        result = await r.json();
      if (!r.ok) throw new Error(result.error || "Distribution indisponible.");
      await refresh();
      window.dispatchEvent(new Event("everkeep-balances"));
      onRefresh();
    } catch (e) {
      setError("Financement demoUSD indisponible : " + String(e));
    } finally {
      setBusy(false);
    }
  }
  const funded =
    !!balance &&
    BigInt(balance.demoUSD) >= 10_000_000n &&
    BigInt(balance.spendableEstimate) >= 602n * 10n ** 22n;
  return (
    <details className="testnet-welcome" open={initiallyOpen || undefined}>
      <summary>Obtenir des fonds de test</summary>
      <ol>
        <li>
          <strong>
            {owner ? "Wallet connecté" : "Connecter votre wallet"}
          </strong>
          <p>
            {owner ||
              "Utilisez le bouton du header, puis un wallet navigateur compatible testnet."}
          </p>
        </li>
        <li>
          <strong>
            {funded
              ? "Fonds de test disponibles"
              : "Obtenir les actifs de test"}
          </strong>
          <p>
            NEAR finance le compte et le gas ; demoUSD finance la position.
            Provision d’une position : 6 NEAR, enregistrement : 0,02 NEAR, plus
            gas.
          </p>
          <div>
            <a href={TESTNET.faucet} target="_blank" rel="noreferrer">
              Ouvrir le faucet NEAR officiel
            </a>
            <button disabled={!owner || busy} onClick={() => void grant()}>
              {busy ? "Distribution en cours…" : "Recevoir des demoUSD de test"}
            </button>
            <button
              disabled={!owner || busy}
              onClick={() => {
                void refresh();
                window.dispatchEvent(new Event("everkeep-balances"));
              }}
            >
              Actualiser les fonds
            </button>
          </div>
          <p>
            Le faucet demoUSD complète le solde jusqu’à 100, une fois par compte
            et par jour, dans la limite de dix comptes par jour. Aucun jeton
            mainnet.
          </p>
        </li>
        <li>
          <strong>Créer votre position</strong>
          <p>
            <a href="#agent">Avec un agent</a> ou{" "}
            <a href="#explorer">depuis un modèle</a>. Aucune mise en vente
            automatique.
          </p>
        </li>
      </ol>
      {onReturn && (
        <button
          onClick={() => {
            void refresh();
            window.dispatchEvent(new Event("everkeep-balances"));
            onReturn();
          }}
        >
          Revenir à mon action
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
