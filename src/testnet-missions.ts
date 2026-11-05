import {
  stableJSON,
  type Mission,
  type MissionDocument,
  type MissionView,
  type MissionCatalogue,
  type MissionConfiguration,
} from "../packages/shared/missions";
import {
  investmentEnvelope,
  verifyReusablePosition,
} from "../packages/shared/mission-authority";
import {
  validateRequest,
  validateProposal,
  parseBudget,
  type AnalysisInput,
  type CatalogueEntry,
} from "../packages/agent/missions";
import {
  b64,
  bytes,
  ml_dsa65,
  initProof,
  authorize,
  envelope,
  type Snapshot,
} from "../packages/shared/index";
import {
  privateRecord,
  savePrivateRecord,
  requestVault,
  createPositionKey,
  positionKey,
  requestKeyBackup,
} from "./key-vault";
import {
  currentDeployment,
  connectedAccount,
  walletCall,
  walletTransactions,
  type WalletTransaction,
  readWalletBalances,
} from "./testnet-network";
import { rpc, view } from "./client";
import { signedPosition } from "./testnet-actions";
export const TESTNET_WORKER = "http://127.0.0.1:8793";
const from64 = (v: string) => Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(value)));
}
const hash = async (v: string) => b64(await digest(v));
function deployed() {
  const d = currentDeployment();
  if (!d?.missions)
    throw new Error("Contrat de missions testnet non configuré.");
  return { ...d, missions: d.missions };
}
async function worker(body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch(TESTNET_WORKER + "/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    throw new Error(
      "Opérateur local indisponible. Lancez npm run testnet:worker. Relisez la mission avant toute reprise ; les frais restent réclamables après le délai contractuel.",
    );
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Analyse refusée.");
  return result;
}
async function getMission(id: string): Promise<Mission> {
  const d = deployed(),
    b = await rpc("block", { finality: "final" });
  const m = await view(d.missions, "mission", { id }, b.header.hash);
  if (!m) throw new Error("Mission absente du contrat ; aucun succès présumé.");
  return m;
}
async function reusableAccount(sourceId: string, owner: string) {
  const d = deployed(),
    source = await getMission(sourceId),
    op = source.operations[0];
  const block = await rpc("block", { finality: "final" });
  if (
    source.client !== owner ||
    source.state !== "Delivered" ||
    source.operations.length !== 1 ||
    op?.state !== "Authorized" ||
    BigInt(op.authorization_expires_at || "0") >
      BigInt(block.header.timestamp_nanosec) ||
    op.allocation.collection !== d.collection ||
    op.allocation.mandate_hash !== d.mandate_hash ||
    !op.position.endsWith("." + d.collection) ||
    op.position.split(".").length !== d.collection.split(".").length + 1
  )
    throw new Error(
      "Seul le compte non financé d’une autorisation expirée de votre mission peut être réutilisé.",
    );
  const [s, sub] = await Promise.all([
    view(op.position, "snapshot", {}, block.header.hash),
    view(
      d.collection,
      "subscription",
      { position: op.position },
      block.header.hash,
    ),
  ]);
  verifyReusablePosition(
    source,
    s,
    sub,
    owner,
    d,
    block.header.timestamp_nanosec,
  );
  if (
    sub ||
    s.owner_id !== owner ||
    s.funded ||
    s.pending ||
    s.deposits !== "0" ||
    s.series?.mandate_hash !== d.mandate_hash ||
    s.asset !== d.asset ||
    s.strategy !== d.strategy ||
    !["Active", "SubscriptionAuthorized"].includes(s.status)
  )
    throw new Error(
      "Compte déjà financé, occupé ou incompatible : aucun nouveau dépôt préparé.",
    );
  return { op, s: s as Snapshot };
}
export async function testnetMissionCatalogue(): Promise<MissionCatalogue> {
  const d = deployed(),
    b = await rpc("block", { finality: "final" }),
    [configuration, s] = await Promise.all([
      view(d.missions, "configuration", {}, b.header.hash),
      view(d.collection, "series", {}, b.header.hash),
    ]);
  if (
    configuration.network !== "testnet" ||
    configuration.collections.length !== 1 ||
    configuration.collections[0] !== d.collection ||
    s.series.mandate_hash !== d.mandate_hash
  )
    throw new Error("Catalogue de missions incompatible.");
  const catalogue: CatalogueEntry[] = [
    {
      collection: d.collection,
      terms: s.series.terms,
      mandate_hash: s.series.mandate_hash,
      remaining: (
        BigInt(s.series.terms.capacity) - BigInt(s.committed)
      ).toString(),
      closed: s.closed,
      observed_at: b.header.timestamp_nanosec,
      redemption: "at-maturity",
      risk_document: "docs/testnet.md#modele-operationnel",
      risks: [
        "Jeton demoUSD de test sans valeur monétaire.",
        "Risque du contrat de démonstration, sans rendement de marché ni audit indépendant.",
      ],
    },
  ];
  let available = false;
  let mode: MissionCatalogue["mode"] = "demonstration";
  try {
    const r = await fetch(TESTNET_WORKER + "/health", {
      signal: AbortSignal.timeout(3000),
    });
    const v = await r.json();
    available = r.ok && v.network === "testnet" && v.contract === d.missions;
    if (available && v.mode === "server-adapter") mode = "server-adapter";
  } catch {}
  return {
    configuration,
    catalogue,
    contract: d.missions,
    mode,
    now: b.header.timestamp_nanosec,
    worker_ready: available,
  };
}
async function docKey(id: string, cap: string) {
  if (!/^[a-zA-Z0-9_-]{43}$/.test(cap))
    throw new Error("Capacité privée requise.");
  return crypto.subtle.importKey(
    "raw",
    await digest("EVERKEEP_BROWSER_MISSION_V1:" + id + ":" + cap),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
async function saveDoc(id: string, cap: string, doc: MissionDocument) {
  const key = await docKey(id, cap),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      bytes(JSON.stringify(doc)),
    );
  await savePrivateRecord("mission:" + deployed().missions + ":" + id, {
    owner: await connectedAccount(),
    iv: b64(iv),
    ciphertext: b64(new Uint8Array(encrypted)),
  });
}
async function loadDoc(id: string, cap: string) {
  const stored = await privateRecord<{ iv: string; ciphertext: string }>(
    "mission:" + deployed().missions + ":" + id,
  );
  if (!stored) throw new Error("Demande privée absente de ce navigateur.");
  try {
    return JSON.parse(
      new TextDecoder().decode(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: from64(stored.iv) },
          await docKey(id, cap),
          from64(stored.ciphertext),
        ),
      ),
    ) as MissionDocument;
  } catch {
    throw new Error("Document privé inaccessible avec cette capacité.");
  }
}
const commitment = (doc: MissionDocument) =>
  hash(stableJSON(["EVERKEEP_PRIVATE_REQUEST_V1", doc.salt, doc.request]));
async function missionView(id: string, cap: string): Promise<MissionView> {
  const m = await getMission(id);
  let doc = await loadDoc(id, cap);
  if (m.state === "Delivered" && !doc.proposal) {
    doc = {
      ...doc,
      ...(await worker({ action: "get", id, capability: cap })).document,
    };
    await saveDoc(id, cap, doc);
  }
  if (
    (await commitment(doc)) !== m.request_hash ||
    (doc.proposal && (await hash(stableJSON(doc.proposal))) !== m.result_hash)
  )
    throw new Error("Engagement privé différent du contrat.");
  const b = await rpc("block", { finality: "final" });
  return {
    mission: m,
    document: doc,
    now: b.header.timestamp_nanosec,
    subscriptions: await Promise.all(
      m.operations.map(async (op) => {
        if (!op) return null;
        const sub = await view(
          op.allocation.collection,
          "subscription",
          { position: op.position },
          b.header.hash,
        );
        return sub
          ? {
              state: sub.state,
              refund: await view(
                op.allocation.collection,
                "subscription_claim",
                { position: op.position },
                b.header.hash,
              ),
            }
          : null;
      }),
    ),
  };
}
async function revalidate(m: Mission, doc: MissionDocument) {
  if (!doc.proposal || (await hash(stableJSON(doc.proposal))) !== m.result_hash)
    throw new Error("Proposition différente du contrat.");
  const cat = await testnetMissionCatalogue();
  const input: AnalysisInput = {
    mission_id: m.id,
    profile: m.profile,
    request: doc.request,
    request_hash: m.request_hash,
    now: cat.now,
    catalogue: cat.catalogue,
    exposures: [],
  };
  let reserved = 0n;
  for (const op of m.operations) {
    if (!op) continue;
    const b = await rpc("block", { finality: "final" }),
      sub = await view(
        op.allocation.collection,
        "subscription",
        { position: op.position },
        b.header.hash,
      );
    if (sub && ["Authorized", "Funding", "Funded"].includes(sub.state)) {
      const c = input.catalogue.find(
        (c) => c.collection === op.allocation.collection,
      )!;
      c.remaining = (BigInt(c.remaining) + BigInt(sub.amount)).toString();
      reserved += BigInt(sub.amount);
    }
  }
  const proposal = validateProposal(doc.proposal, input, cat.now),
    balance = await readWalletBalances(m.client);
  if (parseBudget(doc.request.amount) > BigInt(balance.demoUSD) + reserved)
    throw new Error(
      "Budget supérieur aux demoUSD du wallet et aux dépôts déjà engagés par cette mission.",
    );
  return { proposal, configuration: cat.configuration };
}
async function investWithOneApproval(id: string, cap: string, owner: string) {
  const d = deployed();
  let current = await missionView(id, cap),
    m = current.mission,
    doc = current.document;
  if (m.client !== owner) throw new Error("Propriétaire de la mission requis.");
  if (m.operations.length !== 1)
    throw new Error(
      "Ce parcours groupé prend en charge une position à la fois.",
    );
  let op = m.operations[0];
  if (op?.state === "Confirmed") return current;
  if (op && ["Funding", "Uncertain"].includes(op.state)) {
    await worker({ action: "reconcile", id, index: 0, capability: cap });
    return missionView(id, cap);
  }
  if (current.subscriptions[0]) {
    if (
      op?.state === "Authorized" &&
      current.subscriptions[0].state === "Authorized"
    )
      await worker({ action: "execute", id, index: 0, capability: cap });
    return missionView(id, cap);
  }
  const { proposal, configuration } = await revalidate(m, doc),
    a = proposal.allocations[0];
  if (proposal.status !== "proposed" || !a)
    throw new Error("Aucun investissement compatible.");
  doc.reviewed_hash = m.result_hash!;
  await saveDoc(id, cap, doc);
  const reuse = doc.reuse_from
    ? await reusableAccount(doc.reuse_from, owner)
    : null;
  if (reuse && stableJSON(reuse.op.allocation) !== stableJSON(a))
    throw new Error(
      "Le compte à réutiliser ne correspond pas à la proposition.",
    );
  const hex = Array.from(await digest(id), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join(""),
    position =
      op?.position ||
      reuse?.op.position ||
      "m" + hex.slice(0, 14) + "-0." + a.collection,
    name = position.slice(0, -a.collection.length - 1),
    keyId = "everkeep.mission-init.v1:" + d.missions + ":" + id + ":0";
  const block = await rpc("block", { finality: "final" }),
    rules = await view(a.collection, "series", {}, block.header.hash),
    now = BigInt(block.header.timestamp_nanosec),
    expiry = [
      BigInt(proposal.expires_at),
      BigInt(rules.series.terms.closes_at),
      now + 600_000_000_000n,
    ]
      .reduce((x, y) => (x < y ? x : y))
      .toString();
  if (BigInt(expiry) < now + 90_000_000_000n)
    throw new Error(
      "Proposition trop proche de son expiration. Renouvelez le devis avant de signer.",
    );
  let s: Snapshot | null = null;
  try {
    s = await view(position, "snapshot", {}, block.header.hash);
  } catch (e) {
    if (!/UNKNOWN_ACCOUNT|does not exist/i.test(String(e))) throw e;
  }
  await requestVault(owner);
  let init = JSON.parse(localStorage.getItem(keyId) || "null");
  if (!init) {
    if (s) {
      const k = await positionKey(owner, position, s.public_key);
      k.secretKey.fill(0);
      init = {
        public_key: s.public_key,
        proof: "",
        created: true,
        registered: !!s.funding_permit,
      };
    } else {
      const k = await createPositionKey(owner, position);
      try {
        init = {
          ...initProof(k, "testnet", position, a.collection, owner),
          created: false,
          registered: false,
        };
      } finally {
        k.secretKey.fill(0);
      }
    }
    localStorage.setItem(keyId, JSON.stringify(init));
  }
  await requestKeyBackup(owner);
  if (
    s &&
    (s.owner_id !== owner ||
      s.public_key !== init.public_key ||
      s.series?.mandate_hash !== a.mandate_hash ||
      s.funded ||
      s.pending ||
      s.asset !== a.asset ||
      s.strategy !== a.strategy)
  )
    throw new Error("Compte existant incompatible ou occupé.");
  const balances = await readWalletBalances(owner),
    required =
      (s ? 0n : 6n * 10n ** 24n) +
      (init.registered ? 0n : 2n * 10n ** 22n) +
      5n * 10n ** 22n;
  if (
    BigInt(balances.spendableEstimate) < required ||
    BigInt(balances.demoUSD) < BigInt(a.amount)
  )
    throw new Error("Solde insuffisant pour le capital et les frais affichés.");
  const txs: WalletTransaction[] = [],
    call = (
      receiver: string,
      method: string,
      args: Record<string, unknown>,
      deposit = "0",
      gas = "280000000000000",
    ) => txs.push({ receiver, calls: [{ method, args, deposit, gas }] });
  if (!op)
    call(d.missions, "reserve_allocation", {
      id,
      index: "0",
      position,
      allocation: a,
    });
  if (!s) {
    call(
      a.collection,
      "create_plan",
      { name, public_key: init.public_key, proof: init.proof },
      "6000000000000000000000000",
    );
    s = {
      account_id: position,
      collection_id: a.collection,
      owner_id: owner,
      network: "testnet",
      asset: a.asset,
      strategy: a.strategy,
      ownership_epoch: "0",
      key_version: "0",
      policy_version: "0",
      nonce: "0",
      public_key: init.public_key,
      status: "Active",
      funding_permit: null,
    } as Snapshot;
  }
  const keys = await positionKey(owner, position, s.public_key);
  try {
    let predicted = { ...s };
    if (
      op?.state === "Authorized" &&
      now >= BigInt(op.authorization_expires_at || "0")
    )
      throw new Error(
        "Autorisation expirée : utilisez le renouvellement explicite du devis sur ce compte.",
      );
    if (op?.state !== "Authorized") {
      if (!init.registered)
        call(
          a.strategy,
          "register_position",
          { wallet: position },
          "20000000000000000000000",
          "30000000000000",
        );
      if (
        predicted.funding_permit &&
        BigInt(predicted.funding_permit.expires_at) <= now
      ) {
        call(
          position,
          "execute",
          authorize(keys, envelope(predicted, "CancelSubscription", expiry)),
        );
        predicted = {
          ...predicted,
          nonce: (BigInt(predicted.nonce) + 1n).toString(),
          policy_version: (BigInt(predicted.policy_version) + 1n).toString(),
          funding_permit: null,
        };
      }
      if (!predicted.funding_permit) {
        const permit = {
          agent: d.missions,
          asset: a.asset,
          strategy: a.strategy,
          amount: a.amount,
          expires_at: expiry,
          beneficiary: owner,
        };
        call(
          position,
          "execute",
          authorize(
            keys,
            envelope(predicted, { AuthorizeSubscription: permit }, expiry),
          ),
        );
        predicted = {
          ...predicted,
          nonce: (BigInt(predicted.nonce) + 1n).toString(),
          policy_version: (BigInt(predicted.policy_version) + 1n).toString(),
        };
        predicted.funding_permit = {
          agent: d.missions,
          amount: a.amount,
          expires_at: expiry,
          beneficiary: owner,
          ownership_epoch: predicted.ownership_epoch,
          policy_version: predicted.policy_version,
        };
      }
      const permit = predicted.funding_permit!;
      if (
        permit.agent !== d.missions ||
        permit.amount !== a.amount ||
        permit.beneficiary !== owner ||
        BigInt(permit.expires_at) <= now
      )
        throw new Error("Mandat de souscription incompatible.");
      const scheduled = {
        ...m,
        operations: [
          {
            position,
            allocation: a,
            state: "Reserved" as const,
            attempt: "0",
            authorization_hash: null,
            policy_version: null,
            error: null,
          },
        ],
      };
      const message = bytes(
        JSON.stringify(
          investmentEnvelope(
            configuration,
            d.missions,
            scheduled,
            0,
            predicted,
            permit.expires_at,
          ),
        ),
      );
      call(d.missions, "authorize_allocation", {
        message: b64(message),
        signature: b64(ml_dsa65.sign(message, keys.secretKey)),
      });
    }
    call(
      a.asset,
      "ft_transfer_call",
      {
        receiver_id: a.collection,
        amount: a.amount,
        msg: JSON.stringify({
          AgentSubscribe: {
            position,
            policy_version: predicted.policy_version,
          },
        }),
      },
      "1",
    );
    await walletTransactions(txs, owner);
  } finally {
    keys.secretKey.fill(0);
  }
  init.created = true;
  init.registered = true;
  localStorage.setItem(keyId, JSON.stringify(init));
  current = await missionView(id, cap);
  op = current.mission.operations[0];
  if (
    op?.state === "Authorized" &&
    current.subscriptions[0]?.state === "Authorized"
  )
    await worker({ action: "execute", id, index: 0, capability: cap });
  current = await missionView(id, cap);
  if (
    ["Funding", "Uncertain"].includes(
      current.mission.operations[0]?.state || "",
    )
  ) {
    await worker({ action: "reconcile", id, index: 0, capability: cap });
    current = await missionView(id, cap);
  }
  return current;
}
export async function testnetMissionCommand(
  body: Record<string, unknown>,
): Promise<any> {
  const d = deployed(),
    owner = await connectedAccount(),
    action = String(body.action),
    id = String(body.id || ""),
    cap = String(body.capability || "");
  if (!owner)
    throw new Error("Connectez votre wallet testnet pour ouvrir une mission.");
  if (action === "invest") return investWithOneApproval(id, cap, owner);
  if (action === "history") {
    const b = await rpc("block", { finality: "final" });
    return {
      missions: await view(
        d.missions,
        "missions_for",
        { client: owner },
        b.header.hash,
      ),
      now: b.header.timestamp_nanosec,
    };
  }
  if (action === "quote" || action === "quote_pay") {
    const cat = await testnetMissionCatalogue();
    if (!cat.worker_ready)
      throw new Error(
        "Lancez npm run testnet:worker avant d’enregistrer un devis payant.",
      );
    const request = validateRequest(body.request),
      profile = cat.configuration.profiles.find(
        (p) => p.id === body.agent && p.enabled,
      );
    if (!profile) throw new Error("Agent indisponible.");
    if (action === "quote_pay" && body.expected_price !== profile.price)
      throw new Error("Le prix a changé. Relisez le devis avant de payer.");
    let reuse: { reuse_from: string; reuse_position: string } | undefined;
    if (body.reuse_from) {
      const sourceId = String(body.reuse_from),
        { op, s } = await reusableAccount(sourceId, owner);
      await requestVault(owner);
      const keys = await positionKey(owner, op.position, s.public_key);
      keys.secretKey.fill(0);
      reuse = { reuse_from: sourceId, reuse_position: op.position };
    }
    let doc: MissionDocument;
    try {
      doc = await loadDoc(id, cap);
      if (stableJSON(doc.request) !== stableJSON(request))
        throw new Error("PRIVATE_REQUEST_CHANGED");
    } catch (e) {
      if (String(e).includes("PRIVATE_REQUEST_CHANGED")) throw e;
      const exists = await privateRecord("mission:" + d.missions + ":" + id);
      if (exists) throw e;
      doc = {
        request,
        salt: b64(crypto.getRandomValues(new Uint8Array(32))),
        ...reuse,
      };
      await saveDoc(id, cap, doc);
    }
    const existing = await view(
      d.missions,
      "mission",
      { id },
      (await rpc("block", { finality: "final" })).header.hash,
    );
    if (existing) {
      if (
        existing.client !== owner ||
        existing.request_hash !== (await commitment(doc)) ||
        existing.profile.id !== profile.id
      )
        throw new Error("Devis existant différent.");
      if (action === "quote_pay" && existing.state === "Quote")
        await walletCall(d.missions, "pay", { id }, existing.profile.price);
      return missionView(id, cap);
    }

    if (action === "quote_pay") {
      const balances = await readWalletBalances(owner),
        required =
          BigInt(cat.configuration.storage_reserve) +
          BigInt(profile.price) +
          (doc.reuse_position ? 0n : 602n * 10n ** 22n) +
          5n * 10n ** 22n;
      if (parseBudget(request.amount) > BigInt(balances.demoUSD))
        throw new Error(
          "Budget supérieur aux demoUSD disponibles. Obtenez les jetons de test avant de payer l’analyse.",
        );
      if (BigInt(balances.spendableEstimate) < required)
        throw new Error(
          "NEAR de test insuffisants pour l’analyse, la création et le gas. Financez le wallet avant de payer l’analyse.",
        );
    }
    await requestKeyBackup(owner);
    if (action === "quote_pay")
      await walletTransactions(
        [
          {
            receiver: d.missions,
            calls: [
              {
                method: "quote",
                args: {
                  id,
                  agent: profile.id,
                  agent_version: profile.version,
                  request_hash: await commitment(doc),
                  expires_at: (BigInt(cat.now) + 600_000_000_000n).toString(),
                },
                deposit: cat.configuration.storage_reserve,
                gas: "80000000000000",
              },
              {
                method: "pay",
                args: { id },
                deposit: profile.price,
                gas: "80000000000000",
              },
            ],
          },
        ],
        owner,
      );
    else
      await walletCall(
        d.missions,
        "quote",
        {
          id,
          agent: profile.id,
          agent_version: profile.version,
          request_hash: await commitment(doc),
          expires_at: (BigInt(cat.now) + 600_000_000_000n).toString(),
        },
        cat.configuration.storage_reserve,
      );
    return missionView(id, cap);
  }
  if (["request_refund", "claim_refund", "claim_provider"].includes(action)) {
    const publicMission = await getMission(id);
    if (publicMission.client !== owner && action !== "claim_provider")
      throw new Error("Commanditaire requis.");
    await walletCall(d.missions, action, { id });
    return {
      mission: await getMission(id),
      now: (await rpc("block", { finality: "final" })).header.timestamp_nanosec,
    };
  }
  let m = await getMission(id),
    doc = await loadDoc(id, cap);
  if (m.client !== owner || (await commitment(doc)) !== m.request_hash)
    throw new Error("Commanditaire ou demande incompatibles.");
  if (action === "get") return missionView(id, cap);
  if (action === "pay") {
    if (m.state !== "Quote") return missionView(id, cap);
    if (body.expected_price !== m.profile.price)
      throw new Error("Prix modifié.");
    const cat = await testnetMissionCatalogue();
    if (!cat.worker_ready)
      throw new Error("Opérateur indisponible ; aucun paiement envoyé.");
    await walletCall(d.missions, "pay", { id }, m.profile.price);
  } else if (action === "analyze" || action === "demo_failure") {
    const result = await worker({
      action,
      id,
      capability: cap,
      request: doc.request,
      salt: doc.salt,
    });
    if (result.document) {
      doc = { ...doc, ...result.document };
      await saveDoc(id, cap, doc);
    }
  } else if (action === "prepare") {
    const { proposal } = await revalidate(m, doc);
    if (proposal.status !== "proposed")
      throw new Error("Abstention : aucun investissement proposé.");
    doc.reviewed_hash = m.result_hash!;
    await saveDoc(id, cap, doc);
  } else if (
    ["request_refund", "claim_refund", "claim_provider"].includes(action)
  )
    await walletCall(d.missions, action, { id });
  else {
    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0 || index >= m.operations.length)
      throw new Error("Indice d’opération invalide.");
    if (action === "authorize") {
      if (
        doc.reviewed_hash !== m.result_hash ||
        body.proposal_hash !== m.result_hash
      )
        throw new Error(
          "Examinez puis préparez cette proposition avant de signer.",
        );
      const { proposal, configuration } = await revalidate(m, doc),
        a = proposal.allocations[index],
        old = m.operations[index];
      if (old && !["Reserved", "Rejected"].includes(old.state))
        throw new Error("Autorisation déjà engagée.");
      const reuse = doc.reuse_from
        ? await reusableAccount(doc.reuse_from, owner)
        : null;
      if (
        reuse &&
        (index !== 0 ||
          doc.reuse_position !== reuse.op.position ||
          stableJSON(reuse.op.allocation) !== stableJSON(a))
      )
        throw new Error(
          "La nouvelle proposition diffère du compte à réutiliser. Aucun compte créé ni capital envoyé.",
        );
      const balance = await readWalletBalances(owner);
      if (BigInt(balance.spendableEstimate) < (reuse ? 5n : 602n) * 10n ** 22n)
        throw new Error(
          reuse
            ? "Conservez au moins 0,05 NEAR de test pour le gas des nouvelles signatures ; aucune provision de compte supplémentaire."
            : "Il faut 6 NEAR de provision, 0,02 NEAR d’enregistrement et du gas pour cette nouvelle position. Utilisez le faucet testnet.",
        );
      const hex = Array.from(await digest(id), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join(""),
        name = reuse
          ? reuse.op.position.slice(0, -a.collection.length - 1)
          : "m" + hex.slice(0, 14) + "-" + index,
        position = name + "." + a.collection,
        keyId =
          "everkeep.mission-init.v1:" + d.missions + ":" + id + ":" + index;
      let init = JSON.parse(localStorage.getItem(keyId) || "null");
      await requestVault(owner);
      if (!init && reuse) {
        const keys = await positionKey(owner, position, reuse.s.public_key);
        keys.secretKey.fill(0);
        init = {
          public_key: reuse.s.public_key,
          proof: "",
          created: true,
          registered: true,
        };
        localStorage.setItem(keyId, JSON.stringify(init));

        await requestKeyBackup(owner);
      }
      if (!init) {
        const keys = await createPositionKey(owner, position);
        try {
          init = {
            ...initProof(keys, "testnet", position, a.collection, owner),
            created: false,
          };
          localStorage.setItem(keyId, JSON.stringify(init));
        } finally {
          keys.secretKey.fill(0);
        }

        await requestKeyBackup(owner);
      }
      await walletCall(d.missions, "reserve_allocation", {
        id,
        index: String(index),
        position,
        allocation: a,
      });
      if (!init.created) {
        let existing: Snapshot | null = null;
        try {
          existing = await view(
            position,
            "snapshot",
            {},
            (await rpc("block", { finality: "final" })).header.hash,
          );
        } catch (e) {
          if (!/UNKNOWN_ACCOUNT|does not exist/i.test(String(e))) throw e;
        }
        if (!existing)
          await walletCall(
            a.collection,
            "create_plan",
            { name, public_key: init.public_key, proof: init.proof },
            "6000000000000000000000000",
          );
        init.created = true;
        localStorage.setItem(keyId, JSON.stringify(init));
      }
      let s = (await view(
        position,
        "snapshot",
        {},
        (await rpc("block", { finality: "final" })).header.hash,
      )) as Snapshot;
      if (
        s.owner_id !== owner ||
        s.public_key !== init.public_key ||
        s.series?.mandate_hash !== a.mandate_hash
      )
        throw new Error("Compte de mission incompatible.");
      if (reuse && s.funding_permit && s.policy_version !== init.reuse_policy) {
        if (
          s.funding_permit.agent !== d.missions ||
          s.funding_permit.amount !== a.amount ||
          BigInt(s.funding_permit.expires_at) >
            BigInt(
              (await rpc("block", { finality: "final" })).header
                .timestamp_nanosec,
            )
        )
          throw new Error(
            "Un autre mandat reste actif. Aucun remplacement automatique.",
          );
        await signedPosition(s, "CancelSubscription");
        s = await view(
          position,
          "snapshot",
          {},
          (await rpc("block", { finality: "final" })).header.hash,
        );
        if (s.funding_permit || s.status !== "Active")
          throw new Error(
            "Annulation non confirmée ; aucune nouvelle autorisation.",
          );
      }
      if (!s.funding_permit) {
        if (!init.registered) {
          await walletCall(
            a.strategy,
            "register_position",
            { wallet: position },
            "20000000000000000000000",
            "30000000000000",
          );
          init.registered = true;
          localStorage.setItem(keyId, JSON.stringify(init));
        }
        const expiry = [
          BigInt(proposal.expires_at),
          BigInt(s.series!.terms.closes_at),
          BigInt(
            (await rpc("block", { finality: "final" })).header
              .timestamp_nanosec,
          ) + 600_000_000_000n,
        ]
          .reduce((a, b) => (a < b ? a : b))
          .toString();
        await signedPosition(s, {
          AuthorizeSubscription: {
            agent: d.missions,
            asset: a.asset,
            strategy: a.strategy,
            amount: a.amount,
            expires_at: expiry,
            beneficiary: owner,
          },
        });
        s = await view(
          position,
          "snapshot",
          {},
          (await rpc("block", { finality: "final" })).header.hash,
        );
        if (reuse) {
          init.reuse_policy = s.policy_version;
          localStorage.setItem(keyId, JSON.stringify(init));
        }
      }
      m = await getMission(id);
      const keys = await positionKey(owner, position, s.public_key);
      try {
        const message = bytes(
          JSON.stringify(
            investmentEnvelope(
              configuration,
              d.missions,
              m,
              index,
              s,
              s.funding_permit!.expires_at,
            ),
          ),
        );
        await walletCall(d.missions, "authorize_allocation", {
          message: b64(message),
          signature: b64(ml_dsa65.sign(message, keys.secretKey)),
        });
      } finally {
        keys.secretKey.fill(0);
      }
      if ((await getMission(id)).operations[index]?.state !== "Authorized")
        throw new Error("Consentement ML-DSA rejeté ; aucun capital déposé.");
    } else {
      const op = m.operations[index];
      if (!op) throw new Error("Autorisation distincte requise.");
      if (action === "fund") {
        await revalidate(m, doc);
        if (
          !["Authorized", "Uncertain"].includes(op.state) ||
          body.expected_amount !== op.allocation.amount
        )
          throw new Error("Autorisation ou montant modifié.");
        const sub = await view(
          op.allocation.collection,
          "subscription",
          { position: op.position },
          (await rpc("block", { finality: "final" })).header.hash,
        );
        if (sub)
          throw new Error("Dépôt déjà engagé : utilisez la réconciliation.");
        const chainNow = BigInt(
          (await rpc("block", { finality: "final" })).header.timestamp_nanosec,
        );
        if (chainNow >= BigInt(op.authorization_expires_at || "0"))
          throw new Error(
            "Autorisation de mission expirée : aucun capital envoyé. Le compte déjà créé reste conservé ; ne relancez pas un paiement d’analyse pour reprendre cette opération.",
          );
        await walletCall(
          op.allocation.asset,
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
          "1",
        );
      } else if (action === "execute" || action === "retry") {
        if (action === "execute") await revalidate(m, doc);
        await worker({ action, id, index, capability: cap });
        if (action === "execute")
          await walletCall(d.missions, "reconcile_allocation", {
            id,
            index: String(index),
          });
      } else if (action === "reconcile")
        await walletCall(d.missions, "reconcile_allocation", {
          id,
          index: String(index),
        });
      else if (action === "cancel") {
        const s = await view(
          op.position,
          "snapshot",
          {},
          (await rpc("block", { finality: "final" })).header.hash,
        );
        await signedPosition(s, "CancelSubscription");
      } else if (action === "claim_subscription")
        await walletCall(op.allocation.collection, "claim_subscription", {
          position: op.position,
        });
      else throw new Error("Action non autorisée.");
    }
  }
  return missionView(id, cap);
}
