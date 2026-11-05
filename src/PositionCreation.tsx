import { useEffect, useRef, useState } from "react";
import { CreationSteps } from "./CreationSteps";
import { requestWallet, usePublicChoice } from "./ux-intent";
import { TestnetWelcome } from "./TestnetWelcome";
import { OperationError } from "./OperationError";
import { readWalletBalances } from "./testnet-network";
import { units } from "../packages/shared/index";
import {
  creationJobs,
  draftCreation,
  saveCreation,
  createAccount,
  depositCreation,
  reconcileCreation,
  claimCreation,
  reopenCreation,
  type CreationJob,
} from "./testnet-creation";
import { backupVault, requestKeyBackup } from "./key-vault";
import { displayAmount } from "../packages/shared/ui";
import { TESTNET } from "../packages/shared/network";
export function PositionCreation({
  owner,
  amount,
  modelName,
  maturity,
  onChanged,
  onWorking,
}: {
  owner: string;
  amount: string;
  modelName: string;
  maturity: string;
  onChanged: () => void;
  onWorking: (v: boolean) => void;
}) {
  const [jobs, setJobs] = useState<CreationJob[]>([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [review, setReview] = usePublicChoice(
    "direct-review",
    "",
    (v) => v.length <= 30,
  );
  const [funding, setFunding] = useState(false);
  const [balance, setBalance] = useState<Awaited<
    ReturnType<typeof readWalletBalances>
  > | null>(null);
  const running = useRef(false);
  const reviewing = review === amount;
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      setBalance(null);
      if (owner)
        void readWalletBalances(owner)
          .then((b) => {
            if (alive) setBalance(b);
          })
          .catch((e) => {
            if (alive) setError(String(e));
          });
    };
    refresh();
    window.addEventListener("everkeep-balances", refresh);
    return () => {
      alive = false;
      window.removeEventListener("everkeep-balances", refresh);
    };
  }, [owner]);
  let enough = false;
  try {
    enough =
      !!balance &&
      BigInt(balance.demoUSD) >= units(amount) &&
      BigInt(balance.spendableEstimate) >= 607n * 10n ** 22n;
  } catch {}
  useEffect(() => {
    const load = () => {
      try {
        setJobs(owner ? creationJobs(owner) : []);
      } catch (e) {
        setError(String(e));
      }
    };
    load();
    window.addEventListener("everkeep-creations", load);
    return () => window.removeEventListener("everkeep-creations", load);
  }, [owner]);
  async function task(label: string, fn: () => Promise<unknown>) {
    if (running.current) return;
    running.current = true;
    setBusy(label);
    setError("");
    onWorking(true);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      running.current = false;
      setBusy("");
      onWorking(false);
      onChanged();
    }
  }
  return (
    <section
      className="position-creation"
      aria-label="Création testnet"
      aria-busy={!!busy}
    >
      <CreationSteps step={busy ? 3 : reviewing ? 2 : 1} />
      {!reviewing ? (
        <button
          className="primary"
          onClick={() => {
            try {
              if (units(amount) <= 0n) throw Error("Montant invalide");
              setReview(amount);
            } catch {
              setError("Saisissez un montant positif en demoUSD.");
            }
          }}
        >
          Vérifier ma position
        </button>
      ) : (
        <>
          <h4>Vérifier avant de signer</h4>
          <dl className="review-facts">
            <div>
              <dt>Modèle</dt>
              <dd>{modelName}</dd>
            </div>
            <div>
              <dt>Capital déposé</dt>
              <dd>{amount} demoUSD</dd>
            </div>
            <div>
              <dt>Frais de mission</dt>
              <dd>0 NEAR — création sans agent</dd>
            </div>
            <div>
              <dt>Provision du compte</dt>
              <dd>6 NEAR</dd>
            </div>
            <div>
              <dt>Enregistrement</dt>
              <dd>0,02 NEAR, plus gas variable</dd>
            </div>
          </dl>
          <p>
            Retrait après le{" "}
            {new Date(Number(BigInt(maturity) / 1_000_000n)).toLocaleString(
              "fr-FR",
            )}{" "}
            et dénouement des fonds engagés. Pas de retrait anticipé ni de
            capital garanti.
          </p>
          <p>
            <strong>Autorisation :</strong> créer votre compte de position et y
            déposer exactement {amount} demoUSD depuis votre wallet. Aucun droit
            de gestion, de retrait ou de vente n’est accordé à un agent.
          </p>
          <p>
            Le coffre chiffré conserve votre clé sur cet appareil. Le wallet
            demandera les signatures distinctes pour le compte, l’enregistrement
            puis le dépôt. Chaque résultat sera vérifié sur chaîne.
          </p>
          {owner && !balance && (
            <p role="status">
              Soldes non encore vérifiés. Actualisez-les dans le menu du wallet
              avant de signer.
              <button
                onClick={() =>
                  window.dispatchEvent(new Event("everkeep-balances"))
                }
              >
                Réessayer les soldes
              </button>
            </p>
          )}
          {owner && balance && !enough && (
            <p role="status">
              Fonds insuffisants : prévoyez {amount} demoUSD et au moins 6,07
              NEAR disponibles, dont 0,05 NEAR de marge indicative de gas.
            </p>
          )}
          <button
            className="primary"
            disabled={
              !!busy ||
              jobs.some((j) => j.phase !== "confirmed") ||
              (!!owner && !balance)
            }
            onClick={() => {
              if (!owner) {
                requestWallet();
                return;
              }
              if (!enough) {
                setFunding(true);
                return;
              }
              void task("Création de votre position", async () => {
                let job = await draftCreation(owner, amount);
                await requestKeyBackup(owner);
                job = saveCreation({ ...job, backupConfirmed: true });
                job = await createAccount(job);
                job = await depositCreation(job);
                if (job.phase === "confirmed") location.hash = "#positions";
              });
            }}
          >
            {owner
              ? enough
                ? "Signer et créer"
                : "Obtenir des fonds de test"
              : "Connecter pour créer"}
          </button>
          <button
            className="text-action"
            disabled={!!busy}
            onClick={() => setReview("")}
          >
            Modifier
          </button>
          {funding && (
            <TestnetWelcome
              owner={owner}
              onRefresh={onChanged}
              initiallyOpen
              onReturn={() => setFunding(false)}
            />
          )}
        </>
      )}
      {busy && (
        <p role="status">
          {busy}… Attendez le résultat du wallet et des contrats avant toute
          reprise.
        </p>
      )}
      {error && <OperationError error={error} onRetry={onChanged} />}
      {jobs
        .filter((j) => j.phase !== "confirmed")
        .map((job) => (
          <article className="creation-job" key={job.id}>
            <h4>Votre création · {displayAmount(job.amount)} demoUSD</h4>
            <p>
              État :{" "}
              {
                {
                  draft: "Clé générée localement",
                  creating: "Création du compte engagée",
                  ready: "Compte initialisé, prêt pour le dépôt",
                  depositing: "Dépôt engagé, finalisation à vérifier",
                  refundable: "Dépôt remboursable",
                  confirmed: "NFT confirmé",
                }[job.phase]
              }
            </p>
            <ol className="creation-progress">
              <li>Protection et sauvegarde</li>
              <li>Compte et initialisation</li>
              <li>Dépôt demoUSD</li>
              <li>NFT et finalisation</li>
            </ol>
            {job.phase === "draft" && (
              <>
                <button
                  disabled={!!busy}
                  onClick={() => void backupVault(owner)}
                >
                  Exporter une sauvegarde chiffrée (facultatif)
                </button>
                <label className="backup-ack">
                  <input
                    type="checkbox"
                    checked={job.backupConfirmed}
                    onChange={(e) =>
                      saveCreation({
                        ...job,
                        backupConfirmed: e.target.checked,
                      })
                    }
                  />
                  Mon coffre chiffré est enregistré sur cet appareil.
                </label>
                <button
                  disabled={!!busy || !job.backupConfirmed}
                  onClick={() =>
                    void task("Signature de la création", () =>
                      createAccount(job),
                    )
                  }
                >
                  Autoriser la création · provision de 6 NEAR
                </button>
              </>
            )}
            {job.phase === "ready" && (
              <>
                <p>
                  Le capital est encore dans votre wallet. Confirmez le dépôt
                  unique de {displayAmount(job.amount)} demoUSD vers le modèle
                  choisi.
                </p>
                <button
                  disabled={!!busy}
                  className="primary"
                  onClick={() =>
                    void task("Autorisation du dépôt", () =>
                      depositCreation(job),
                    )
                  }
                >
                  Autoriser le dépôt de {displayAmount(job.amount)} demoUSD
                </button>
              </>
            )}
            {job.phase === "refundable" && (
              <button
                disabled={!!busy}
                onClick={() =>
                  void task("Remboursement", () => claimCreation(job))
                }
              >
                Réclamer le dépôt remboursable
              </button>
            )}
            {["creating", "depositing"].includes(job.phase) && (
              <p>
                Une opération peut déjà être acceptée. La relecture ne renvoie
                aucun dépôt. Un échec de transfert connu ouvre la créance prévue
                par le contrat.
              </p>
            )}
            {["creating", "depositing"].includes(job.phase) && (
              <button
                disabled={!!busy}
                onClick={() =>
                  void task("Nouvelle autorisation du même compte", () =>
                    reopenCreation(job),
                  )
                }
              >
                {job.phase === "creating"
                  ? "Réouvrir la signature de création"
                  : "Réouvrir l’autorisation du dépôt"}
              </button>
            )}
            <button
              disabled={!!busy}
              onClick={() =>
                void task("Relecture des contrats", () =>
                  reconcileCreation(job),
                )
              }
            >
              Actualiser la création
            </button>
            <details>
              <summary>Compte et reçus techniques</summary>
              <p>{job.position}</p>
              {job.transactions.map((hash) => (
                <p key={hash}>
                  <a
                    href={TESTNET.explorer + "/txns/" + hash}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Voir la transaction {hash.slice(0, 10)}…
                  </a>
                </p>
              ))}
              {job.error && <p>Dernière réponse : {job.error}</p>}
            </details>
          </article>
        ))}
      {jobs
        .filter((j) => j.phase === "confirmed")
        .slice(-3)
        .reverse()
        .map((j) => (
          <div key={j.id} className="creation-confirmed">
            <strong>
              Position NFT confirmée · {displayAmount(j.amount)} demoUSD
            </strong>
            <p>Le compte financé et le NFT ont été vérifiés ensemble.</p>
            <a href="#positions">Ouvrir dans Mes positions</a>
            <details>
              <summary>Identifiant du compte NFT</summary>
              <a
                target="_blank"
                rel="noreferrer"
                href={TESTNET.explorer + "/address/" + j.position}
              >
                {j.position}
              </a>
            </details>
          </div>
        ))}
    </section>
  );
}
