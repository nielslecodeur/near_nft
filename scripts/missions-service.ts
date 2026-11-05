import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  MissionDocuments,
  hash,
  requestCommitment,
} from "./mission-documents.js";
import {
  validateRequest,
  validateProposal,
  type AnalysisInput,
  type CatalogueEntry,
  type Proposal,
  type Profile,
  type Allocation,
} from "../packages/agent/missions.js";
import {
  stableJSON,
  type Mission,
  type MissionDocument,
  type MissionConfiguration,
} from "../packages/shared/missions.js";
import {
  ml_dsa65,
  bytes,
  b64,
  initProof,
  type Snapshot,
  type Keys,
  type Action,
} from "../packages/shared/index.js";
import type { SeriesRules } from "../packages/shared/series.js";
import type { SandboxAccount, Receipt } from "./harness.js";
const N = 10n ** 24n,
  GAS = 280_000_000_000_000n;
export const demoProfiles: Profile[] = [
  {
    id: "tradfi",
    version: "1",
    price: process.env.EVERKEEP_TRADFI_PRICE || "15000000000000000000000",
    processing_ns: "120000000000",
    enabled: true,
  },
  {
    id: "crypto",
    version: "1",
    price: process.env.EVERKEEP_CRYPTO_PRICE || "20000000000000000000000",
    processing_ns: "120000000000",
    enabled: true,
  },
  {
    id: "liquidity",
    version: "1",
    price: process.env.EVERKEEP_LIQUIDITY_PRICE || "10000000000000000000000",
    processing_ns: "120000000000",
    enabled: true,
  },
];
export async function deployMissions(
  root: SandboxAccount,
  operator: SandboxAccount,
  collections: SandboxAccount[],
) {
  const account = await root.createSubAccount("missions", {
    initialBalance: 20n * N,
  });
  await account.deploy("artifacts/missions.wasm");
  await account.call(account, "new", {
    network: "sandbox",
    operator: operator.accountId,
    collections: collections.map((c) => c.accountId),
    profiles: demoProfiles,
  });
  await account
    .batch(account)
    .deleteKey((await account.getKey())!.getPublicKey())
    .transact();
  return root.getAccount(account.accountId);
}
export type MissionDependencies = {
  root: SandboxAccount;
  contract: SandboxAccount;
  operator: SandboxAccount;
  token: SandboxAccount;
  collections: SandboxAccount[];
  clock: () => Promise<bigint>;
  snapshots: () => Promise<Snapshot[]>;
  keys: (position: string, owner: string) => Keys | undefined;
  remember: (position: string, owner: string, keys: Keys) => void;
  signWallet: (
    position: string,
    owner: SandboxAccount,
    action: Action,
  ) => Promise<Receipt>;
};
export function allocationHash(
  network: string,
  contract: string,
  mission: Mission,
  resultHash: string,
  index: number,
  allocation: Allocation,
) {
  return hash(
    JSON.stringify([
      "EVERKEEP_ALLOCATION_V1",
      network,
      contract,
      mission.id,
      mission.client,
      resultHash,
      String(index),
      {
        collection: allocation.collection,
        strategy_id: allocation.strategy_id,
        strategy_version: allocation.strategy_version,
        asset: allocation.asset,
        strategy: allocation.strategy,
        amount: allocation.amount,
        mandate_hash: allocation.mandate_hash,
      },
    ]),
  );
}
import {investmentEnvelope} from "../packages/shared/mission-authority.js";
export {investmentEnvelope} from "../packages/shared/mission-authority.js";
const verify = (r: Receipt) => {
  if (r.failed || r.receiptFailures.length)
    throw new Error(
      r.receiptFailureMessages.join(" ") || "Transaction refusée.",
    );
};
export async function runMissionWorker(
  input: AnalysisInput,
): Promise<Proposal> {
  return new Promise((resolveResult, reject) => {
    // Environment intentionally excludes native signer configuration and all owner material.
    const child = spawn(
      process.execPath,
      ["--import", "tsx", resolve("scripts/missions-worker.ts")],
      {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          EVERKEEP_ANALYSIS_ENDPOINT: process.env.EVERKEEP_ANALYSIS_ENDPOINT,
          EVERKEEP_ANALYSIS_KEY: process.env.EVERKEEP_ANALYSIS_KEY,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "",
      size = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("PROCESSING_TIMEOUT"));
    }, 12000);
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 65536) {
        child.kill();
        reject(new Error("OUTPUT_LIMIT"));
      } else output += chunk;
    });
    child.stderr.resume(); // Provider errors can contain private material: never log them.
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error("PROCESSING_ERROR"));
        return;
      }
      try {
        resolveResult(validateProposal(JSON.parse(output), input, input.now));
      } catch {
        reject(new Error("INVALID_RESULT"));
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}
export function missionService(d: MissionDependencies) {
  const documents = new MissionDocuments();
  // Retain a key across an uncertain account-creation receipt, without exposing an
  // unconfirmed account in the public portfolio or issuing another 6 NEAR transfer.
  const pendingCreationKeys = new Map<string, Keys>();
  const commands = new Map<
    string,
    { fingerprint: string; promise: Promise<unknown> }
  >();
  const mission = (id: string) => d.contract.view<Mission>("mission", { id });
  const configuration = () =>
    d.contract.view<MissionConfiguration>("configuration");
  async function catalogue(): Promise<CatalogueEntry[]> {
    const at = (await d.clock()).toString();
    return Promise.all(
      d.collections.map(async (c) => {
        const s = await c.view<{
          series: SeriesRules;
          committed: string;
          closed: boolean;
        }>("series");
        if (!s.series) throw new Error("Catalogue non configuré.");
        return {
          collection: c.accountId,
          terms: s.series.terms,
          mandate_hash: s.series.mandate_hash,
          remaining: (
            BigInt(s.series.terms.capacity) - BigInt(s.committed)
          ).toString(),
          closed: s.closed,
          observed_at: at,
          risks: [
            "Risque du contrat de stratégie de démonstration, sans audit indépendant.",
            "demoUSD est un jeton de test sans parité économique garantie.",
          ],
          risk_document: "docs/agent-missions.md#catalogue-de-demonstration",
          redemption: "at-maturity" as const,
        };
      }),
    );
  }
  async function input(
    m: Mission,
    document: MissionDocument,
  ): Promise<AnalysisInput> {
    const [routes, positions, now] = await Promise.all([
      catalogue(),
      d.snapshots(),
      d.clock(),
    ]);
    return {
      mission_id: m.id,
      profile: m.profile,
      request: document.request,
      request_hash: m.request_hash,
      now: now.toString(),
      catalogue: routes,
      exposures: positions
        .filter((s) => s.funded && s.owner_id === m.client)
        .map((s) => ({
          asset: s.asset,
          strategy: s.strategy,
          amount: (
            BigInt(s.available) +
            BigInt(s.reserved) +
            BigInt(s.principal)
          ).toString(),
        })),
    };
  }
  async function view(id: string, owner: string, cap: string) {
    const document = await documents.read(id, owner, cap);
    const m = await mission(id);
    return {
      mission: m,
      document,
      now: (await d.clock()).toString(),
      subscriptions: await Promise.all(
        m.operations.map(async (op) => {
          if (!op) return null;
          const collection = d.root.getAccount(op.allocation.collection);
          const sub = await collection.view<{ state: string } | null>(
            "subscription",
            { position: op.position },
          );
          return sub
            ? {
                state: sub.state,
                refund: await collection.view("subscription_claim", {
                  position: op.position,
                }),
              }
            : null;
        }),
      ),
    };
  }
  async function revalidate(m: Mission, doc: MissionDocument) {
    if (
      !doc.proposal ||
      hash(stableJSON(doc.proposal)) !== m.result_hash ||
      requestCommitment(doc) !== m.request_hash
    )
      throw new Error("Engagement de proposition ou de demande incompatible.");
    const i = await input(m, doc);
    // Funds already reserved by this mission consume capacity; account for that reservation only.
    for (const op of m.operations.filter((o) => o !== null)) {
      const sub = await d.root
        .getAccount(op.allocation.collection)
        .view<{ state: string; amount: string } | null>("subscription", {
          position: op.position,
        });
      if (sub && ["Authorized", "Funding", "Funded"].includes(sub.state)) {
        const c = i.catalogue.find(
          (c) => c.collection === op.allocation.collection,
        )!;
        c.remaining = (BigInt(c.remaining) + BigInt(sub.amount)).toString();
      }
    }
    const p = validateProposal(doc.proposal, i, i.now);
    let required = 0n;
    for (let x = 0; x < p.allocations.length; x++) {
      const op = m.operations[x];
      if (op) {
        const sub = await d.root
          .getAccount(op.allocation.collection)
          .view<{ state: string } | null>("subscription", {
            position: op.position,
          });
        if (sub && ["Authorized", "Funding", "Funded"].includes(sub.state))
          continue;
      }
      required += BigInt(p.allocations[x].amount);
    }
    const balance = BigInt(
      await d.token.view<string>("ft_balance_of", { account_id: m.client }),
    );
    if (required > balance)
      throw new Error(
        "Solde demoUSD insuffisant pour les opérations restantes.",
      );
    return p;
  }
  async function act(body: Record<string, unknown>, who: SandboxAccount) {
    const action = String(body.action),
      id = String(body.id || ""),
      cap = String(body.capability || "");
    if (action === "history")
      return {
        missions: await d.contract.view("missions_for", {
          client: who.accountId,
        }),
        now: (await d.clock()).toString(),
      };
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(id))
      throw new Error("Identifiant de mission invalide.");
    if (action === "quote") {
      const request = validateRequest(body.request),
        config = await configuration(),
        profile = config.profiles.find((p) => p.id === body.agent && p.enabled);
      if (!profile) throw new Error("Agent indisponible.");
      const doc: MissionDocument = {
        request,
        salt: randomBytes(32).toString("base64"),
      };
      await documents.create(id, who.accountId, cap, doc);
      await who.call(
        d.contract,
        "quote",
        {
          id,
          agent: profile.id,
          agent_version: profile.version,
          request_hash: requestCommitment(doc),
          expires_at: ((await d.clock()) + 600_000_000_000n).toString(),
        },
        { attachedDeposit: BigInt(config.storage_reserve), gas: GAS },
      );
      return view(id, who.accountId, cap);
    }
    const doc = await documents.read(id, who.accountId, cap);
    let m = await mission(id);
    if (!m || m.client !== who.accountId)
      throw new Error("Commanditaire requis.");
    if (action === "get") return view(id, who.accountId, cap);
    if (action === "pay") {
      if (body.expected_price !== m.profile.price)
        throw new Error("Prix modifié : relisez le devis.");
      await who.call(
        d.contract,
        "pay",
        { id },
        { attachedDeposit: BigInt(m.profile.price), gas: GAS },
      );
    } else if (action === "analyze") {
      if (m.state !== "Paid")
        throw new Error(
          "Paiement confirmé requis. Un traitement engagé ne se rejoue pas.",
        );
      await d.operator.call(d.contract, "begin", { id }, { gas: GAS });
      try {
        const i = await input(m, doc),
          p = await runMissionWorker(i);
        validateProposal(
          p,
          { ...i, catalogue: await catalogue() },
          (await d.clock()).toString(),
        );
        doc.proposal = p;
        await documents.write(id, who.accountId, cap, doc);
        const h = hash(stableJSON(p));
        await d.operator.call(
          d.contract,
          "deliver",
          {
            id,
            request_hash: m.request_hash,
            result_hash: h,
            outcome: p.status,
            proposal_expires_at: p.expires_at,
            allocation_hashes: p.allocations.map((a, x) =>
              allocationHash("sandbox", d.contract.accountId, m, h, x, a),
            ),
          },
          { gas: GAS },
        );
      } catch {
        m = await mission(id);
        if (["Paid", "Processing"].includes(m.state))
          await d.operator.call(
            d.contract,
            "fail",
            { id, code: "PROCESSING_ERROR" },
            { gas: GAS },
          );
        throw new Error(
          "Analyse non livrée. Relisez la mission ; les frais deviennent remboursables en cas d’échec.",
        );
      }
    } else if (action === "demo_failure") {
      // Sandbox-only explicit, never a hidden random failure or an invented provider call.
      if (m.state !== "Paid") throw new Error("Mission payée requise.");
      await d.operator.call(d.contract, "begin", { id }, { gas: GAS });
      await d.operator.call(
        d.contract,
        "fail",
        { id, code: "PROCESSING_ERROR" },
        { gas: GAS },
      );
    } else if (action === "request_refund")
      await who.call(d.contract, "request_refund", { id }, { gas: GAS });
    else if (action === "claim_refund")
      await who.call(d.contract, "claim_refund", { id }, { gas: GAS });
    else if (action === "claim_provider")
      await d.operator.call(d.contract, "claim_provider", { id }, { gas: GAS });
    else if (action === "prepare") {
      const p = await revalidate(m, doc);
      if (p.status !== "proposed")
        throw new Error(
          "Cette analyse s’abstient : aucun investissement à préparer.",
        );
      doc.reviewed_hash = m.result_hash!;
      await documents.write(id, who.accountId, cap, doc);
    } else if (
      [
        "authorize",
        "fund",
        "execute",
        "reconcile",
        "retry",
        "cancel",
        "claim_subscription",
      ].includes(action)
    ) {
      if (
        typeof body.index !== "number" ||
        !Number.isInteger(body.index) ||
        body.index < 0 ||
        body.index >= m.allocation_hashes.length
      )
        throw new Error("Indice d’opération invalide.");
      const index = body.index;
      if (action === "authorize") {
        if (
          doc.reviewed_hash !== m.result_hash ||
          body.proposal_hash !== m.result_hash
        )
          throw new Error(
            "Examinez puis préparez cette proposition avant de signer.",
          );
        const p = await revalidate(m, doc),
          a = p.allocations[index],
          config = await configuration();
        let op = m.operations[index];
        if (op && !["Reserved", "Rejected"].includes(op.state))
          throw new Error("Autorisation déjà engagée : relisez son état.");
        const name =
            "m" +
            createHash("sha256").update(id).digest("hex").slice(0, 14) +
            "-" +
            index,
          position = name + "." + a.collection;
        await who.call(
          d.contract,
          "reserve_allocation",
          { id, index: String(index), position, allocation: a },
          { gas: GAS },
        );
        let keys = d.keys(position, who.accountId);
        if (!keys) {
          const pending = pendingCreationKeys.get(position);
          if (pending) {
            const existing = await d.root
              .getAccount(position)
              .view<Snapshot>("snapshot")
              .catch(() => {
                throw new Error(
                  "Création précédente non confirmée. Conservez cette mission ; aucune seconde provision technique n’a été envoyée.",
                );
              });
            if (
              existing.owner_id !== who.accountId ||
              existing.public_key !== b64(pending.publicKey)
            )
              throw new Error(
                "Compte créé incompatible : intervention locale nécessaire.",
              );
            keys = pending;
            d.remember(position, who.accountId, keys);
            pendingCreationKeys.delete(position);
          } else {
            keys = ml_dsa65.keygen();
            pendingCreationKeys.set(position, keys);
            await who.call(
              d.root.getAccount(a.collection),
              "create_plan",
              {
                name,
                ...initProof(
                  keys,
                  "sandbox",
                  position,
                  a.collection,
                  who.accountId,
                ),
              },
              { attachedDeposit: 6n * N, gas: GAS },
            );
            d.remember(position, who.accountId, keys);
            pendingCreationKeys.delete(position);
          }
        }
        let s = await d.root.getAccount(position).view<Snapshot>("snapshot");
        if (!s.funding_permit) {
          await who.call(
            d.root.getAccount(a.strategy),
            "register_position",
            { wallet: position },
            { attachedDeposit: N / 50n },
          );
          const current = await d.root
            .getAccount(a.collection)
            .view<{ series: SeriesRules }>("series");
          const expires_at = [
            BigInt(p.expires_at),
            BigInt(current.series.terms.closes_at),
            (await d.clock()) + 600_000_000_000n,
          ]
            .reduce((a, b) => (a < b ? a : b))
            .toString();
          await d.signWallet(position, who, {
            AuthorizeSubscription: {
              agent: d.contract.accountId,
              asset: a.asset,
              strategy: a.strategy,
              amount: a.amount,
              expires_at,
              beneficiary: who.accountId,
            },
          });
          s = await d.root.getAccount(position).view<Snapshot>("snapshot");
        }
        m = await mission(id);
        const auth = investmentEnvelope(
            config,
            d.contract.accountId,
            m,
            index,
            s,
            s.funding_permit!.expires_at,
          ),
          message = bytes(JSON.stringify(auth));
        verify(
          await who.callRaw(
            d.contract,
            "authorize_allocation",
            {
              message: b64(message),
              signature: b64(ml_dsa65.sign(message, keys.secretKey)),
            },
            { gas: GAS },
          ),
        );
        if ((await mission(id)).operations[index]?.state !== "Authorized")
          throw new Error("Signature ML-DSA refusée. Aucun dépôt effectué.");
      } else {
        const op = m.operations[index];
        if (!op) throw new Error("Autorisation distincte requise.");
        if (action === "fund") {
          if (
            !["Authorized", "Uncertain"].includes(op.state) ||
            body.expected_amount !== op.allocation.amount
          )
            throw new Error("Montant ou autorisation incompatible.");
          await revalidate(m, doc);
          const sub = await d.root
            .getAccount(op.allocation.collection)
            .view<{ state: string } | null>("subscription", {
              position: op.position,
            });
          if (sub)
            throw new Error(
              "Dépôt déjà engagé : relisez le contrat, ne le répétez pas.",
            );
          verify(
            await who.callRaw(
              d.token,
              "ft_transfer_call",
              {
                receiver_id: op.allocation.collection,
                amount: op.allocation.amount,
                msg: JSON.stringify({
                  AgentSubscribe: {
                    position: op.position,
                    policy_version: op.policy_version,
                  },
                }),
              },
              { attachedDeposit: 1n, gas: GAS },
            ),
          );
        } else if (action === "execute") {
          await revalidate(m, doc);
          if (op.state !== "Authorized")
            throw new Error(
              "Opération déjà engagée : utilisez la réconciliation.",
            );
          await d.operator.call(
            d.contract,
            "execute_allocation",
            { id, index: String(index) },
            { gas: GAS },
          );
          // Never label success before both wallet and NFT index agree on-chain.
          await who.call(
            d.contract,
            "reconcile_allocation",
            { id, index: String(index) },
            { gas: GAS },
          );
        } else if (action === "reconcile")
          await who.call(
            d.contract,
            "reconcile_allocation",
            { id, index: String(index) },
            { gas: GAS },
          );
        else if (action === "retry")
          await d.operator.call(
            d.contract,
            "retry_allocation",
            { id, index: String(index) },
            { gas: GAS },
          );
        else if (action === "cancel")
          await d.signWallet(op.position, who, "CancelSubscription");
        else
          await who.call(
            d.root.getAccount(op.allocation.collection),
            "claim_subscription",
            { position: op.position },
            { gas: GAS },
          );
      }
    } else throw new Error("Action de mission inconnue.");
    return view(id, who.accountId, cap);
  }
  return {
    async catalogue() {
      return {
        configuration: await configuration(),
        catalogue: await catalogue(),
        contract: d.contract.accountId,
        mode: process.env.EVERKEEP_ANALYSIS_ENDPOINT
          ? "server-adapter"
          : "demonstration",
        now: (await d.clock()).toString(),
      };
    },
    async handle(body: Record<string, unknown>, who: SandboxAccount) {
      if (["get", "history"].includes(String(body.action)))
        return act(body, who);
      const id = String(body.command_id || "");
      if (!/^[a-zA-Z0-9-]{16,64}$/.test(id))
        throw new Error("Identifiant de commande requis.");
      const fingerprint = hash(stableJSON([who.accountId, body])),
        old = commands.get(id);
      if (old) {
        if (old.fingerprint !== fingerprint)
          throw new Error("Identifiant déjà utilisé pour une autre commande.");
        return old.promise;
      }
      if (commands.size >= 1024)
        throw new Error("Limite de commandes atteinte.");
      const promise = act(body, who);
      commands.set(id, { fingerprint, promise });
      return promise;
    },
  };
}
