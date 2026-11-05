import {
  b64,
  initProof,
  verifyPair,
  type Snapshot,
} from "../packages/shared/index";
import { parseBudget } from "../packages/agent/missions";
import { rpc, view, config } from "./client";
import {
  currentDeployment,
  connectedAccount,
  readWalletBalances,
  walletCall,
} from "./testnet-network";
import { requestVault, createPositionKey } from "./key-vault";
export type CreationJob = {
  id: string;
  owner: string;
  position: string;
  name: string;
  collection: string;
  asset: string;
  strategy: string;
  amount: string;
  mandateHash: string;
  proof: { public_key: string; proof: string };
  phase:
    "draft" | "creating" | "ready" | "depositing" | "refundable" | "confirmed";
  backupConfirmed: boolean;
  strategyRegistered?: boolean;
  createdAt: string;
  transactions: string[];
  error?: string;
};
const storageKey = (owner: string) => "everkeep.creations.v1:" + owner;
export function creationJobs(owner: string): CreationJob[] {
  try {
    const jobs = JSON.parse(localStorage.getItem(storageKey(owner)) || "[]");
    if (!Array.isArray(jobs) || jobs.length > 100) throw new Error();
    return jobs;
  } catch {
    throw new Error(
      "Suivi local de créations invalide ; ne renvoyez pas de fonds avant inspection.",
    );
  }
}
export function saveCreation(job: CreationJob) {
  const jobs = creationJobs(job.owner),
    i = jobs.findIndex((j) => j.id === job.id);
  if (i < 0) {
    if (jobs.length >= 100)
      throw new Error("Limite locale de créations atteinte.");
    jobs.push(job);
  } else jobs[i] = job;
  localStorage.setItem(storageKey(job.owner), JSON.stringify(jobs));
  window.dispatchEvent(new Event("everkeep-creations"));
  return job;
}
export async function checkTerms(amount: string, mandate: string) {
  const d = currentDeployment();
  if (!d) throw new Error("Modèle testnet non vérifié.");
  const block = await rpc("block", { finality: "final" }),
    s = await view(d.collection, "series", {}, block.header.hash),
    now = BigInt(block.header.timestamp_nanosec),
    raw = BigInt(amount);
  if (
    s.closed ||
    s.series.mandate_hash !== mandate ||
    now < BigInt(s.series.terms.opens_at) ||
    now >= BigInt(s.series.terms.closes_at) ||
    raw < BigInt(s.series.terms.minimum) ||
    raw > BigInt(s.series.terms.capacity) - BigInt(s.committed)
  )
    throw new Error(
      "Modèle, échéance, minimum ou capacité devenus incompatibles. Relisez la fiche avant de signer.",
    );
  return { rules: s.series, now };
}
export async function draftCreation(owner: string, amount: string) {
  if ((await connectedAccount()) !== owner)
    throw new Error("Le wallet a changé.");
  const d = currentDeployment();
  if (!d) throw new Error("Modèle testnet non configuré.");
  const raw = parseBudget(amount).toString();
  await checkTerms(raw, d.mandate_hash);
  const balance = await readWalletBalances(owner);
  if (BigInt(balance.demoUSD) < BigInt(raw))
    throw new Error(
      "Solde demoUSD insuffisant. Obtenez les jetons avant de provisionner le compte.",
    );
  if (BigInt(balance.spendableEstimate) < 602n * 10n ** 22n)
    throw new Error(
      "Solde NEAR insuffisant pour le compte, son enregistrement et le gas.",
    );
  await requestVault(owner);
  const name = "p" + crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    position = name + "." + d.collection,
    keys = await createPositionKey(owner, position);
  let proof;
  try {
    proof = initProof(keys, "testnet", position, d.collection, owner);
  } finally {
    keys.secretKey.fill(0);
  }
  const job: CreationJob = {
    id: crypto.randomUUID(),
    owner,
    position,
    name,
    collection: d.collection,
    asset: d.asset,
    strategy: d.strategy,
    amount: raw,
    mandateHash: d.mandate_hash,
    proof,
    phase: "draft",
    backupConfirmed: false,
    createdAt: new Date().toISOString(),
    transactions: [],
  };
  saveCreation(job);

  return job;
}
export async function reconcileCreation(
  job: CreationJob,
): Promise<{
  job: CreationJob;
  snapshot?: Snapshot;
  subscription?: { state: string } | null;
  refund?: { state: string; amount: string; beneficiary: string } | null;
}> {
  const block = await rpc("block", { finality: "final" });
  let s: Snapshot;
  try {
    s = await view(job.position, "snapshot", {}, block.header.hash);
  } catch (e) {
    if (/UNKNOWN_ACCOUNT|does not exist/i.test(String(e))) return { job };
    throw e;
  }
  if (
    s.owner_id !== job.owner ||
    s.collection_id !== job.collection ||
    s.series?.mandate_hash !== job.mandateHash ||
    s.asset !== job.asset ||
    s.strategy !== job.strategy ||
    s.public_key !== job.proof.public_key
  )
    throw new Error(
      "Le compte de création ne correspond plus au propriétaire, à la clé ou au modèle. Aucun nouveau dépôt autorisé.",
    );
  const [token, sub, refund] = await Promise.all([
    view(
      job.collection,
      "nft_token",
      { token_id: job.position },
      block.header.hash,
    ),
    view(
      job.collection,
      "subscription",
      { position: job.position },
      block.header.hash,
    ),
    view(
      job.collection,
      "subscription_claim",
      { position: job.position },
      block.header.hash,
    ),
  ]);
  let phase = job.phase;
  if (s.funded && token) {
    verifyPair(job.collection, job.position, s, token);
    if (s.deposits !== job.amount)
      throw new Error("Dépôt confirmé d’un autre montant.");
    phase = "confirmed";
  } else if (sub?.state === "RefundClaimable") phase = "refundable";
  else if (sub) phase = "depositing";
  else if (s.status === "Active" && !s.funded && job.phase !== "depositing")
    phase = "ready";
  const next = saveCreation({ ...job, phase });
  return { job: next, snapshot: s, refund, subscription: sub };
}
export async function createAccount(job: CreationJob) {
  if (job.phase !== "draft" || !job.backupConfirmed)
    throw new Error(
      "Sauvegardez la clé et confirmez le récapitulatif avant la création.",
    );
  if ((await connectedAccount()) !== job.owner)
    throw new Error("Compte connecté différent.");
  await checkTerms(job.amount, job.mandateHash);
  const b = await readWalletBalances(job.owner);
  if (BigInt(b.spendableEstimate) < 6n * 10n ** 24n)
    throw new Error(
      "Solde NEAR insuffisant : provision technique de 6 NEAR, stockage et gas requis.",
    );
  const next = saveCreation({ ...job, phase: "creating" });
  try {
    const result = await walletCall(
      job.collection,
      "create_plan",
      { name: job.name, ...job.proof },
      "6000000000000000000000000",
    );
    const saved = saveCreation({
      ...next,
      transactions: [...next.transactions, result.transaction.hash],
    });
    return (await reconcileCreation(saved)).job;
  } catch (e) {
    saveCreation({ ...next, error: String(e) });
    throw e;
  }
}
export async function depositCreation(job: CreationJob) {
  if ((await connectedAccount()) !== job.owner)
    throw new Error("Compte connecté différent.");
  const current = await reconcileCreation(job);
  if (current.job.phase !== "ready")
    throw new Error(
      "Un dépôt est déjà engagé ou le compte n’est pas prêt. Relisez son état.",
    );
  await checkTerms(job.amount, job.mandateHash);
  const b = await readWalletBalances(job.owner);
  if (BigInt(b.demoUSD) < BigInt(job.amount))
    throw new Error(
      "Solde demoUSD insuffisant. Obtenez des jetons de test avant le dépôt.",
    );
  // Strategy registration is independently idempotent and happens before capital leaves the wallet.
  if (!job.strategyRegistered)
    await walletCall(
      job.strategy,
      "register_position",
      { wallet: job.position },
      "20000000000000000000000",
      "30000000000000",
    );
  const next = saveCreation({
    ...current.job,
    phase: "depositing",
    strategyRegistered: true,
  });
  try {
    const r = await walletCall(
      job.asset,
      "ft_transfer_call",
      {
        receiver_id: job.collection,
        amount: job.amount,
        msg: JSON.stringify({ Subscribe: job.position }),
      },
      "1",
    );
    const saved = saveCreation({
      ...next,
      transactions: [...next.transactions, r.transaction.hash],
    });
    return (await reconcileCreation(saved)).job;
  } catch (e) {
    saveCreation({ ...next, error: String(e) });
    throw e;
  }
}
export async function claimCreation(job: CreationJob) {
  const current = await reconcileCreation(job);
  if (
    current.job.phase !== "refundable" ||
    current.refund?.state !== "Claimable" ||
    current.refund.beneficiary !== job.owner
  )
    throw new Error("Aucune créance disponible pour ce propriétaire.");
  await walletCall(job.collection, "claim_subscription", {
    position: job.position,
  });
  return (await reconcileCreation(job)).job;
}
/** Explicit re-approval uses the same account, proof and amount; contract fences remain authoritative. */
export async function reopenCreation(job: CreationJob) {
  const current = await reconcileCreation(job);
  if (current.job.phase === "confirmed" || current.subscription)
    return current.job;
  if (job.phase === "creating" && !current.snapshot)
    return createAccount({ ...job, phase: "draft" });
  if (
    job.phase === "depositing" &&
    current.snapshot &&
    !current.snapshot.funded &&
    current.snapshot.status === "Active"
  )
    return depositCreation({
      ...job,
      phase: "ready",
      strategyRegistered: true,
    });
  return current.job;
}
