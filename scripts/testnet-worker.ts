/** Local operator: analysis delivery and consumption of owner-authorized mission escrow only. */
import { TestnetFaucet } from "./testnet-faucet.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { SandboxAccount } from "./harness.js";
import { KeyPair } from "near-api-js";
import { testnetCredential } from "./testnet-credentials.js";
import { runMissionWorker, allocationHash } from "./missions-service.js";
import { hash, requestCommitment } from "./mission-documents.js";
import { PersistentMissionDocuments } from "./persistent-mission-documents.js";
import {
  validateRequest,
  validateProposal,
  type AnalysisInput,
  type CatalogueEntry,
} from "../packages/agent/missions.js";
import {
  stableJSON,
  type Mission,
  type MissionDocument,
  type MissionConfiguration,
} from "../packages/shared/missions.js";
import { TESTNET } from "../packages/shared/network.js";
const { deployment: d } = JSON.parse(
  await readFile("public/testnet.json", "utf8"),
);
if (!d?.missions) throw new Error("Testnet missions not deployed.");
const endpoint = process.env.NEAR_TESTNET_RPC || TESTNET.rpc,
  { credential } = await testnetCredential();
if (credential.account_id !== d.parent)
  throw new Error("Wrong operator credential.");
const operator = new SandboxAccount(
    d.parent,
    endpoint,
    KeyPair.fromString(credential.private_key as `ed25519:${string}`),
  ),
  contract = operator.getAccount(d.missions),
  collection = operator.getAccount(d.collection),
  documents = new PersistentMissionDocuments(),
  GAS = 280_000_000_000_000n;
const status = await (
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "network",
      method: "status",
      params: [],
    }),
  })
).json();
const chain = status.result;
if (chain.chain_id !== "testnet" || chain.protocol_version < 88)
  throw new Error("TESTNET_ONLY");
const configuration =
  await contract.view<MissionConfiguration>("configuration");
if (
  configuration.network !== "testnet" ||
  configuration.operator !== operator.accountId ||
  configuration.collections.length !== 1 ||
  configuration.collections[0] !== d.collection
)
  throw new Error("Mission operator or catalogue mismatch.");
const now = async () =>
  BigInt(
    (await operator.rpc("block", { finality: "final" })).header
      .timestamp_nanosec,
  );
const mission = (id: string) => contract.view<Mission>("mission", { id });
async function catalogue(): Promise<CatalogueEntry[]> {
  const b = await operator.rpc("block", { finality: "final" }),
    account = await collection.accountView(),
    s = await collection.view<any>("series", {}, b.header.hash);
  if (
    account.code_hash !== d.code_hashes[d.collection] ||
    s.series.mandate_hash !== d.mandate_hash ||
    s.series.terms.asset !== d.asset ||
    s.series.terms.strategy !== d.strategy
  )
    throw new Error("CATALOGUE_MISMATCH");
  return [
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
}
let queue = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => {},
    () => {},
  );
  return next;
}
async function handle(body: Record<string, unknown>) {
  const id = String(body.id || ""),
    cap = String(body.capability || "");
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(id)) throw new Error("MISSION_ID");
  let m = await mission(id);
  if (!m) throw new Error("MISSION_NOT_FOUND");
  if (body.action === "get")
    return { document: await documents.read(id, m.client, cap) };
  if (body.action === "analyze" || body.action === "demo_failure") {
    const request = validateRequest(body.request),
      salt = String(body.salt || "");
    if (Buffer.from(salt, "base64").length !== 32)
      throw new Error("REQUEST_SALT");
    let doc: MissionDocument = { request, salt };
    if (requestCommitment(doc) !== m.request_hash)
      throw new Error("REQUEST_COMMITMENT");
    if (await documents.exists(id)) {
      const saved = await documents.read(id, m.client, cap);
      if (requestCommitment(saved) !== m.request_hash)
        throw new Error("PRIVATE_DOCUMENT_MISMATCH");
      doc = saved;
    }
    if (m.state === "Delivered") {
      if (!doc.proposal || hash(stableJSON(doc.proposal)) !== m.result_hash)
        throw new Error("DELIVERED_DOCUMENT_UNAVAILABLE");
      return { document: doc };
    }
    if (m.state !== "Paid" && !(m.state === "Processing" && doc.proposal))
      throw new Error("PAID_ONCE_REQUIRED");
    await documents.write(id, m.client, cap, doc);
    if (m.state === "Paid")
      await operator.call(contract, "begin", { id }, { gas: GAS });
    if (body.action === "demo_failure") {
      await operator.call(
        contract,
        "fail",
        { id, code: "PROCESSING_ERROR" },
        { gas: GAS },
      );
      return { document: doc, failed: true };
    }
    try {
      if (!doc.proposal) {
        const list = await collection.view<any[]>("nft_tokens_for_owner", {
          account_id: m.client,
          limit: 100,
        });
        const snapshots = await Promise.all(
          list.map((t) =>
            operator.getAccount(t.token_id).view<any>("snapshot"),
          ),
        );
        const input: AnalysisInput = {
          mission_id: id,
          profile: m.profile,
          request: doc.request,
          request_hash: m.request_hash,
          now: (await now()).toString(),
          catalogue: await catalogue(),
          exposures: snapshots
            .filter((s) => s.owner_id === m.client && s.funded)
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
        doc.proposal = await runMissionWorker(input);
        validateProposal(
          doc.proposal,
          { ...input, catalogue: await catalogue() },
          (await now()).toString(),
        );
        await documents.write(id, m.client, cap, doc);
      }
      const p = doc.proposal,
        h = hash(stableJSON(p));
      await operator.call(
        contract,
        "deliver",
        {
          id,
          request_hash: m.request_hash,
          result_hash: h,
          outcome: p.status,
          proposal_expires_at: p.expires_at,
          allocation_hashes: p.allocations.map((a, x) =>
            allocationHash("testnet", d.missions, m, h, x, a),
          ),
        },
        { gas: GAS },
      );
      return { document: doc };
    } catch {
      m = await mission(id);
      if (["Paid", "Processing"].includes(m.state))
        await operator.call(
          contract,
          "fail",
          { id, code: "PROCESSING_ERROR" },
          { gas: GAS },
        );
      throw new Error(
        "Analyse non livrée. Relisez la mission et réclamez les frais si l’échec est confirmé.",
      );
    }
  }
  const doc = await documents.read(id, m.client, cap);
  if (requestCommitment(doc) !== m.request_hash)
    throw new Error("PRIVATE_DOCUMENT_MISMATCH");
  if (body.action === "demo_failure") {
    if (m.state !== "Paid") throw new Error("PAID_REQUIRED");
    await operator.call(contract, "begin", { id }, { gas: GAS });
    await operator.call(
      contract,
      "fail",
      { id, code: "PROCESSING_ERROR" },
      { gas: GAS },
    );
    return { failed: true };
  }
  if (
    !Number.isInteger(body.index) ||
    Number(body.index) < 0 ||
    Number(body.index) >= m.operations.length
  )
    throw new Error("OPERATION_INDEX");
  const index = String(body.index),
    op = m.operations[Number(body.index)];
  if (!op) throw new Error("OWNER_AUTHORIZATION_REQUIRED");
  if (body.action === "execute") {
    if (op.state !== "Authorized") throw new Error("OPERATION_ALREADY_ENGAGED");
    await operator.call(
      contract,
      "execute_allocation",
      { id, index },
      { gas: GAS },
    );
  } else if (body.action === "retry")
    await operator.call(
      contract,
      "retry_allocation",
      { id, index },
      { gas: GAS },
    );
  else if (body.action === "reconcile")
    await operator.call(
      contract,
      "reconcile_allocation",
      { id, index },
      { gas: GAS },
    );
  else throw new Error("WORKER_METHOD_DENIED");
  return { state: (await mission(id)).operations };
}
const faucet = new TestnetFaucet(operator, d);
const origins = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);
const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !origins.has(origin)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  try {
    if (req.method === "GET" && req.url === "/health") {
      res.end(
        JSON.stringify({
          network: "testnet",
          contract: d.missions,
          operator: d.parent,
          mode: process.env.EVERKEEP_ANALYSIS_ENDPOINT
            ? "server-adapter"
            : "demonstration",
        }),
      );
      return;
    }
    if (req.method === "GET" && req.url === "/missions/catalogue") {
      res.end(
        JSON.stringify({
          configuration: await contract.view("configuration"),
          catalogue: await catalogue(),
          contract: d.missions,
          mode: process.env.EVERKEEP_ANALYSIS_ENDPOINT
            ? "server-adapter"
            : "demonstration",
          now: (await now()).toString(),
        }),
      );
      return;
    }
    if (
      req.method !== "POST" ||
      !["/missions", "/faucet"].includes(req.url || "") ||
      !origin
    )
      throw new Error("LOCAL_ORIGIN_REQUIRED");
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw new Error("JSON_REQUIRED");
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 16384) throw new Error("BODY_LIMIT");
    }
    res.end(
      JSON.stringify(
        await serialize<unknown>(() =>
          req.url === "/faucet"
            ? faucet.grant(String(JSON.parse(raw).account || ""))
            : handle(JSON.parse(raw)),
        ),
      ),
    );
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: String(e) }));
  }
});
server.listen(
  Number(process.env.EVERKEEP_TESTNET_WORKER_PORT || 8793),
  "127.0.0.1",
  () =>
    console.log(
      "Everkeep testnet operator listening on localhost:8793; no owner keys in the worker.",
    ),
);
