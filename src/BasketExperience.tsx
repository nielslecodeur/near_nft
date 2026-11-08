import { useEffect, useRef, useState } from "react";
import {
  basketById,
  basketHistory,
  dayLabel,
  fictionalPrices,
  PRICE_MODE,
  quantityLabel,
  SIMULATION_NOTICE,
  subscribeBasket,
  valueBasket,
  type Basket,
  type BasketPosition,
} from "../packages/shared/baskets";
import { displayAmount } from "../packages/shared/ui";
import { units, type Snapshot } from "../packages/shared/index";
import {
  basketJobs,
  draftBasket,
  createBasketAccount,
  fundBasket,
  reconcileBasket,
  refreshBasketPreview,
  type BasketJob,
} from "./basket-creation";
import { requestWallet, usePublicChoice } from "./ux-intent";
import { NumberText, Button, Notice } from "./terminal/primitives";
import { CardFrame } from "./terminal/CardFrame";
import { parseCardTheme } from "./terminal/card-theme";
import themes from "../design-system/terminal/card-themes.json";
import { OperationError } from "./OperationError";
import { requestKeyBackup } from "./key-vault";

export function BasketComposition({
  model,
  now,
}: {
  model: Basket;
  now: bigint;
}) {
  const prices = fictionalPrices(model, now);
  return (
    <section
      className="ek-basket-composition"
      aria-label="Composition du panier"
    >
      <h3>Cinq entreprises, une règle commune.</h3>
      <p>{model.limits}</p>
      <dl>
        {model.components.map((c) => (
          <div key={c.symbol}>
            <dt>
              {c.name} <NumberText>{c.symbol}</NumberText>
              <small>{c.reason}</small>
            </dt>
            <dd>
              <NumberText>{c.weight_bps / 100} %</NumberText>
            </dd>
          </div>
        ))}
      </dl>
      <p>
        <strong>{PRICE_MODE}.</strong> Observation commune du{" "}
        {dayLabel(prices.day)} à 00:00 UTC. Calendrier fictif du lundi au
        vendredi, sans cours de bourse.
      </p>
      <p>
        Les pondérations sont illustratives. Aucun rééquilibrage automatique.{" "}
        {SIMULATION_NOTICE}
      </p>
    </section>
  );
}
export function BasketCreation({
  model,
  owner,
  now,
  available,
  onChanged,
  onWorking,
}: {
  model: Basket;
  owner: string;
  now: bigint;
  available: boolean;
  onChanged: () => void;
  onWorking: (v: boolean) => void;
}) {
  const [amount, setAmount] = usePublicChoice(
      "basket-amount:" + model.id,
      "100",
      (v) => /^\d+(\.\d{0,6})?$/.test(v),
    ),
    [review, setReview] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const [jobs, setJobs] = useState<BasketJob[]>([]),
    lock = useRef(false);
  useEffect(() => {
    const load = () => {
      try {
        setJobs(owner ? basketJobs(owner) : []);
      } catch (e) {
        setError(String(e));
      }
    };
    load();
    window.addEventListener("everkeep-basket-jobs", load);
    return () => window.removeEventListener("everkeep-basket-jobs", load);
  }, [owner]);
  async function task(label: string, fn: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError("");
    onWorking(true);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      lock.current = false;
      setBusy("");
      onWorking(false);
      onChanged();
    }
  }
  let preview: BasketPosition | null = null;
  try {
    preview = subscribeBasket(
      model,
      units(amount).toString(),
      fictionalPrices(model, now),
      now,
    );
  } catch {}
  return (
    <section
      className="ek-basket-create"
      aria-label="Souscrire au panier"
      aria-busy={!!busy}
    >
      <h3>Votre position, votre NFT.</h3>
      <p>
        Un dépôt crée une position individuelle. Pas de frais de mission :
        l’agent est facultatif.
      </p>
      <label htmlFor="basket-amount">Montant en demoUSD</label>
      <input
        id="basket-amount"
        inputMode="decimal"
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value.replace(",", "."));
          setReview(false);
        }}
      />
      <p>De 1 à 100 000 demoUSD de test. Aucun versement complémentaire.</p>
      {!available && (
        <Notice title="Activation testnet requise">
          <p>
            Le modèle et sa simulation sont consultables. Aucun fonds ne sera
            envoyé aux anciens contrats à échéance pour simuler cette
            souscription.
          </p>
        </Notice>
      )}
      {!review ? (
        <Button disabled={!!busy || !preview} onClick={() => setReview(true)}>
          Examiner ma souscription
        </Button>
      ) : (
        preview && (
          <>
            <h4>Avant de signer</h4>
            <dl className="review-facts">
              <div>
                <dt>Panier et version</dt>
                <dd>
                  {model.name} · v{model.version}
                </dd>
              </div>
              <div>
                <dt>Capital déposé</dt>
                <dd>
                  <NumberText>{amount} demoUSD</NumberText>
                </dd>
              </div>
              <div>
                <dt>Provision du compte</dt>
                <dd>
                  <NumberText>6 NEAR</NumberText>
                </dd>
              </div>
              <div>
                <dt>Stockage et gas</dt>
                <dd>0,01 NEAR + gas variable</dd>
              </div>
              <div>
                <dt>Date des prix fictifs</dt>
                <dd>{dayLabel(preview.entry_day)} UTC</dd>
              </div>
            </dl>
            <p>
              Le capital reste en demoUSD dans votre compte. La valeur simulée
              peut monter ou baisser ; cette variation n’est pas payée. Clôturez
              l’exposition avant de retirer le solde réellement disponible, hors
              opération en cours.
            </p>
            <p>
              Deux validations dans Intear. La seconde regroupe l’enregistrement
              du token, l’autorisation ML-DSA du panier et le dépôt. Chaque
              résultat est relu ; cet ensemble n’est pas globalement atomique.
            </p>
            <details>
              <summary>Quantités initiales simulées et reliquat</summary>
              <dl>
                {preview.lots.map((l) => (
                  <div key={l.symbol}>
                    <dt>{l.symbol}</dt>
                    <dd>
                      <NumberText>{quantityLabel(l.quantity)}</NumberText>
                    </dd>
                  </div>
                ))}
              </dl>
              <p>
                Reliquat :{" "}
                <NumberText>
                  {displayAmount(preview.remainder)} unités de simulation
                </NumberText>
                .
              </p>
            </details>
            <Button
              variant="primary"
              disabled={
                !!busy ||
                !available ||
                jobs.some((j) => j.phase !== "confirmed")
              }
              onClick={() => {
                if (!owner) {
                  requestWallet();
                  return;
                }
                void task("Création du compte", async () => {
                  const job = await draftBasket(owner, model.id, amount);
                  await requestKeyBackup(owner);
                  await createBasketAccount(job);
                });
              }}
            >
              {owner ? "Signer la création du compte" : "Connecter pour créer"}
            </Button>
          </>
        )
      )}
      {jobs
        .filter((j) => j.phase !== "confirmed")
        .map((job) => (
          <div className="ek-basket-job" key={job.id}>
            <h4>Création en cours · {basketById(job.basketId).name}</h4>
            <p>
              {job.phase === "ready"
                ? "Compte prêt. Votre capital est encore dans le wallet."
                : job.phase === "funding"
                  ? "Dépôt envoyé ou résultat à vérifier. Aucun second dépôt automatique."
                  : "Création à confirmer sur chaîne."}
            </p>
            {job.phase === "ready" && (
              <Button
                variant="primary"
                disabled={!!busy}
                onClick={() =>
                  void task("Autorisation et dépôt", async () => {
                    const j = await fundBasket(job);
                    if (j.phase === "confirmed") location.hash = "#positions";
                  })
                }
              >
                Signer le panier et déposer {displayAmount(job.amount)} demoUSD
              </Button>
            )}
            {job.phase === "draft" && (
              <Button
                disabled={!!busy}
                onClick={() =>
                  void task("Création", () => createBasketAccount(job))
                }
              >
                Reprendre la création de ce compte
              </Button>
            )}
            <Button
              disabled={!!busy}
              onClick={() => void task("Relecture", () => reconcileBasket(job))}
            >
              Vérifier la création
            </Button>
            <Button
              disabled={!!busy}
              onClick={() =>
                void task("Actualisation du récapitulatif", () =>
                  refreshBasketPreview(job),
                )
              }
            >
              Actualiser les prix et préparer une reprise
            </Button>
            <details>
              <summary>Compte de position</summary>
              <p className="wallet-address">{job.position}</p>
            </details>
          </div>
        ))}
      {jobs
        .filter((j) => j.phase === "confirmed" && j.basketId === model.id)
        .slice(-1)
        .map((j) => (
          <Notice key={j.id} title="Position NFT confirmée">
            <a href="#positions">Voir ma position et ses fonds</a>
          </Notice>
        ))}
      {busy && <p role="status">{busy}… Attendez le résultat du wallet.</p>}
      {error && <OperationError error={error} onRetry={onChanged} />}
    </section>
  );
}
export function BasketOwned({
  snapshot: s,
  now,
  working,
  ask,
}: {
  snapshot: Snapshot;
  now: bigint;
  working: boolean;
  ask: (c: { action: string; position: string }) => void;
}) {
  const p = s.basket!;
  const day = p.closed_day ?? fictionalPrices(p.model, now).day,
    prices = fictionalPrices(p.model, BigInt(day) * 86_400_000_000_000n),
    value = valueBasket(p, prices),
    difference = BigInt(value) - BigInt(p.capital),
    total = BigInt(s.available) + BigInt(s.principal) + BigInt(s.reserved);
  const history = basketHistory(p, now),
    frozen = s.status !== "Active" || !!s.pending;
  const transferred = s.ownership_epoch !== "0";
  return (
    <article
      className="owned-position ek-basket-owned"
      id={"owned-" + s.account_id}
      tabIndex={-1}
    >
      <div className="owned-position-title">
        <h2>{p.model.name}</h2>
        <span>
          {p.closed_day === null
            ? "Exposition simulée ouverte"
            : "Exposition clôturée"}
        </span>
      </div>
      <div className="ek-owned-position-visual">
        <CardFrame
          art={p.model.art}
          alt={`Personnage fictif Everkeep · ${p.model.name}`}
          theme={parseCardTheme(themes.special)}
        />
        <section className="ek-position-facts">
          <h3>Valeur simulée</h3>
          <p className="ek-basket-value">
            <NumberText>{displayAmount(value)} unités de simulation</NumberText>
          </p>
          <p>
            {PRICE_MODE} · {dayLabel(day)} UTC
          </p>
          <dl>
            <div>
              <dt>Capital initial versé</dt>
              <dd>
                <NumberText>{displayAmount(p.capital)} demoUSD</NumberText>
              </dd>
            </div>
            <div>
              <dt>Variation depuis la souscription initiale</dt>
              <dd>
                <NumberText>
                  {difference < 0n ? "−" : "+"}
                  {displayAmount(
                    (difference < 0n ? -difference : difference).toString(),
                  )}{" "}
                  unités
                </NumberText>
              </dd>
            </div>
            <div>
              <dt>Fonds demoUSD détenus</dt>
              <dd>
                <NumberText>
                  {displayAmount(total.toString())} demoUSD
                </NumberText>
              </dd>
            </div>
            <div>
              <dt>Retirable maintenant</dt>
              <dd>
                <NumberText>
                  {displayAmount(
                    !frozen && p.closed_day !== null ? s.available : "0",
                  )}{" "}
                  demoUSD
                </NumberText>
              </dd>
            </div>
          </dl>
          <p>
            {history.length < 2
              ? "Historique insuffisant pour afficher une performance."
              : "Variation fictive depuis l’entrée initiale, distincte d’un rendement payable."}
          </p>
          {transferred && (
            <p>
              Position transférée : le capital initial n’est pas votre prix
              d’achat. Prix payé par le propriétaire actuel non indexé ; aucun
              résultat personnel calculé.
            </p>
          )}
        </section>
      </div>
      <p>
        {SIMULATION_NOTICE} Les unités de simulation ne sont pas des tokens et
        ne sont pas convertibles en dollars réels. Aucun gain fictif payable.
      </p>
      <details>
        <summary>Entreprises, quantités et prix fictifs</summary>
        <dl className="ek-basket-lots">
          {p.lots.map((l) => (
            <div key={l.symbol}>
              <dt>
                {l.name} <NumberText>{l.symbol}</NumberText>
              </dt>
              <dd>
                <NumberText>{quantityLabel(l.quantity)}</NumberText>
                <small>
                  Prix fictif : {displayAmount(prices.prices[l.symbol])} unités
                </small>
              </dd>
            </div>
          ))}
        </dl>
        <p>
          Reliquat {displayAmount(p.remainder)} unités. Quantités fixes depuis{" "}
          {dayLabel(p.entry_day)} ; les pondérations peuvent dériver.
        </p>
        <p>
          Modèle {p.model.id} · v{p.model.version} · Source {p.source}.
          Propriétaire : {s.owner_id}. Compte : {s.account_id}.
        </p>
      </details>
      <details>
        <summary>Historique de valorisation simulée</summary>
        <table>
          <thead>
            <tr>
              <th>Date UTC</th>
              <th>Valeur simulée</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.day}>
                <td>{dayLabel(h.day)}</td>
                <td>
                  <NumberText>{displayAmount(h.value)}</NumberText>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <section aria-label="Clôture et retrait">
        <h3>Récupérer mes demoUSD</h3>
        <p>
          Clôturer fige la simulation. Le retrait est une opération distincte
          vers le propriétaire actuel, sans attendre un acheteur. Les hausses et
          baisses fictives ne changent pas le solde token.
        </p>
        {p.closed_day === null ? (
          <Button
            variant="primary"
            disabled={working || frozen}
            onClick={() =>
              ask({ action: "close_basket", position: s.account_id })
            }
          >
            Clôturer l’exposition simulée
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={working || frozen || BigInt(s.available) === 0n}
            onClick={() => ask({ action: "withdraw", position: s.account_id })}
          >
            Retirer {displayAmount(s.available)} demoUSD
          </Button>
        )}
        {frozen && (
          <p role="status">
            Une opération ou un transfert est en cours. Actualisez avant de
            continuer.
          </p>
        )}
      </section>
    </article>
  );
}
