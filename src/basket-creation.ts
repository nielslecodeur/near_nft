import {
  authorize,
  envelope,
  initProof,
  units,
} from "../packages/shared/index";
import {
  basketById,
  fictionalPrices,
  subscribeBasket,
  type BasketPosition,
} from "../packages/shared/baskets";
import { rpc } from "./client";
import {
  currentDeployment,
  connectedAccount,
  readWalletBalances,
  walletCall,
  walletTransactions,
} from "./testnet-network";
import { createPositionKey, positionKey, requestVault } from "./key-vault";
import { readBasketPosition, verifiedBasketCollection } from "./basket-network";
import { operations } from "./transaction-journal";
export type BasketJob = {
  id: string;
  owner: string;
  position: string;
  name: string;
  collection: string;
  amount: string;
  basketId: string;
  version: string;
  preview: BasketPosition;
  proof: { public_key: string; proof: string };
  phase: "draft" | "creating" | "ready" | "funding" | "confirmed";
  attempt: number;
};
const key = (owner: string) => "everkeep.basket-creations.v1:" + owner;
export function basketJobs(owner: string): BasketJob[] {
  const v = JSON.parse(localStorage.getItem(key(owner)) || "[]");
  if (!Array.isArray(v) || v.length > 100)
    throw Error("Suivi des paniers illisible. Aucun nouveau dépôt autorisé.");
  return v;
}
function save(job: BasketJob) {
  const jobs = basketJobs(job.owner),
    i = jobs.findIndex((j) => j.id === job.id);
  if (i < 0) {
    if (jobs.length >= 100) throw Error("Limite de suivi atteinte.");
    jobs.push(job);
  } else jobs[i] = job;
  localStorage.setItem(key(job.owner), JSON.stringify(jobs));
  window.dispatchEvent(new Event("everkeep-basket-jobs"));
  return job;
}
async function ownerCheck(owner: string) {
  if ((await connectedAccount()) !== owner)
    throw Error("Le compte connecté a changé.");
}
export async function draftBasket(owner: string, id: string, amount: string) {
  await ownerCheck(owner);
  if (basketJobs(owner).some((j) => j.phase !== "confirmed"))
    throw Error("Reprenez d’abord la création en cours.");
  const block = await rpc("block", { finality: "final" }),
    b = await verifiedBasketCollection(block.header.hash);
  const now = BigInt(block.header.timestamp_nanosec),
    model = basketById(id),
    raw = units(amount).toString();
  const preview = subscribeBasket(model, raw, fictionalPrices(model, now), now);
  const balance = await readWalletBalances(owner);
  if (
    BigInt(balance.demoUSD) < BigInt(raw) ||
    BigInt(balance.spendableEstimate) < 607n * 10n ** 22n
  )
    throw Error(
      "Prévoyez le capital demoUSD et 6,07 NEAR de test pour compte, stockage et gas.",
    );
  await requestVault(owner);
  const name = "p" + crypto.randomUUID().replaceAll("-", "").slice(0, 12),
    position = name + "." + b.collection;
  if (position.length > 64) throw Error("Adresse de compte trop longue.");
  const keys = await createPositionKey(owner, position);
  let proof;
  try {
    proof = initProof(keys, "testnet", position, b.collection, owner);
  } finally {
    keys.secretKey.fill(0);
  }
  return save({
    id: crypto.randomUUID(),
    owner,
    position,
    name,
    collection: b.collection,
    amount: raw,
    basketId: id,
    version: model.version,
    preview,
    proof,
    phase: "draft",
    attempt: 0,
  });
}
export async function reconcileBasket(job: BasketJob) {
  const b = await rpc("block", { finality: "final" });
  let s;
  try {
    s = await readBasketPosition(job.position, b.header.hash);
  } catch (e) {
    if (/UNKNOWN_ACCOUNT/i.test(String(e))) {
      const rejected = operations().some(
        (o) =>
          o.owner === job.owner &&
          o.receiver === job.collection &&
          o.method === "create_plan" &&
          o.args.name === job.name &&
          o.status === "rejected",
      );
      return {
        job: rejected ? save({ ...job, phase: "draft" }) : job,
        snapshot: null,
      };
    }
    throw e;
  }
  if (
    s.owner_id !== job.owner ||
    s.public_key !== job.proof.public_key ||
    s.collection_id !== job.collection
  )
    throw Error("Compte, clé ou propriétaire modifié. Dépôt bloqué.");
  if (
    s.basket &&
    (s.basket.capital !== job.amount ||
      s.basket.model.id !== job.basketId ||
      s.basket.model.version !== job.version)
  )
    throw Error("Panier confirmé différent de votre demande.");
  if (s.funded && s.deposits !== job.amount)
    throw Error("Montant financé différent.");
  const phase = s.funded
    ? "confirmed"
    : job.phase === "funding"
      ? "funding"
      : "ready";
  return { job: save({ ...job, phase }), snapshot: s };
}
export async function createBasketAccount(job: BasketJob) {
  await ownerCheck(job.owner);
  const current = await reconcileBasket(job);
  if (current.snapshot) return current.job;
  if (job.phase !== "draft")
    throw Error(
      "Création déjà envoyée. Relisez le suivi ; ne reprovisionnez pas un autre compte.",
    );
  const b = await rpc("block", { finality: "final" });
  const deployment = await verifiedBasketCollection(b.header.hash);
  if (deployment.collection !== job.collection)
    throw Error("La collection a changé.");
  save({ ...job, phase: "creating" });
  await walletTransactions(
    [
      {
        receiver: job.collection,
        calls: [
          {
            method: "create_plan",
            args: { name: job.name, ...job.proof, basket_required: true },
            deposit: "6000000000000000000000000",
            gas: "280000000000000",
          },
        ],
      },
    ],
    job.owner,
  );
  return (await reconcileBasket(job)).job;
}
export async function fundBasket(job: BasketJob) {
  await ownerCheck(job.owner);
  const current = await reconcileBasket(job),
    s = current.snapshot;
  if (!s || current.job.phase !== "ready" || s.funded || s.status !== "Active")
    throw Error("Le compte n’est pas prêt ou un dépôt attend sa confirmation.");
  const block = await rpc("block", { finality: "final" }),
    now = BigInt(block.header.timestamp_nanosec);
  const model = basketById(job.basketId, job.version),
    preview = subscribeBasket(
      model,
      job.amount,
      fictionalPrices(model, now),
      now,
    );
  if (preview.entry_day !== job.preview.entry_day)
    throw Error(
      "La date des prix a changé. Actualisez explicitement le récapitulatif avant de signer.",
    );
  const balance = await readWalletBalances(job.owner);
  if (BigInt(balance.demoUSD) < BigInt(job.amount))
    throw Error("Solde demoUSD insuffisant.");
  await requestVault(job.owner);
  const keys = await positionKey(job.owner, job.position, s.public_key);
  let authorization;
  try {
    authorization = authorize(
      keys,
      envelope(
        s,
        {
          BindBasket: {
            basket_id: model.id,
            version: model.version,
            amount: job.amount,
            snapshot_day: preview.entry_day,
          },
        },
        (now + 600_000_000_000n).toString(),
      ),
    );
  } finally {
    keys.secretKey.fill(0);
  }
  save({ ...job, phase: "funding" });
  await walletTransactions(
    [
      {
        receiver: s.asset,
        calls: [
          {
            method: "storage_deposit",
            args: { account_id: job.position, registration_only: true },
            gas: "30000000000000",
            deposit: "10000000000000000000000",
          },
        ],
      },
      {
        receiver: job.position,
        calls: [
          {
            method: "execute",
            args: authorization,
            gas: "100000000000000",
            deposit: "0",
          },
        ],
      },
      {
        receiver: s.asset,
        calls: [
          {
            method: "ft_transfer_call",
            args: {
              receiver_id: job.position,
              amount: job.amount,
              msg: job.position,
              memo: `Everkeep basket ${job.id} attempt ${job.attempt}`,
            },
            gas: "100000000000000",
            deposit: "1",
          },
        ],
      },
    ],
    job.owner,
  );
  return (await reconcileBasket(job)).job;
}
/** Explicit recovery; never re-send an unknown transaction. */
export async function refreshBasketPreview(job: BasketJob) {
  await ownerCheck(job.owner);
  if (
    operations().some(
      (o) =>
        o.owner === job.owner &&
        [job.position, job.collection, currentDeployment()?.asset].includes(
          o.receiver,
        ) &&
        ["pending", "signing"].includes(o.status),
    )
  )
    throw Error(
      "Une transaction a un résultat inconnu. Consultez son suivi avant toute reprise.",
    );
  const { snapshot } = await reconcileBasket(job);
  if (!snapshot || snapshot.funded)
    throw Error("Compte absent ou déjà financé.");
  const block = await rpc("block", { finality: "final" }),
    now = BigInt(block.header.timestamp_nanosec),
    model = basketById(job.basketId, job.version);
  return save({
    ...job,
    phase: "ready",
    attempt: job.attempt + 1,
    preview: subscribeBasket(
      model,
      job.amount,
      fictionalPrices(model, now),
      now,
    ),
  });
}
