/** Local-only sandbox control. All signing keys are ephemeral and stay in this process. */
import { createServer } from "node:http";
import {
  ml_dsa65,
  b64,
  authorize,
  envelope,
  initProof,
  recipientProof,
  units,
  type Action,
  type Keys,
  type Snapshot,
} from "../packages/shared/index.js";
import type { SeriesTerms, Listing } from "../packages/shared/series.js";
import { propose } from "../packages/agent/index.js";
import {
  prepareInvestment,
  type InvestmentRequest,
} from "../packages/agent/investment.js";
import type { SandboxAccount, Receipt } from "./harness.js";
import { settleSandboxFinality } from "./harness.js";
import { missionService } from "./missions-service.js";
type Context = {
  root: SandboxAccount;
  alice: SandboxAccount;
  bob: SandboxAccount;
  agent: SandboxAccount;
  collection: SandboxAccount;
  token: SandboxAccount;
  strategy: SandboxAccount;
  series: SeriesTerms;
  wallet: SandboxAccount;
  id: string;
  ownerKeys: Keys;
  buyerKeys: Keys;
  clock: () => Promise<bigint>;
  missions?: SandboxAccount;
};
const N = 10n ** 24n,
  GAS = 280_000_000_000_000n;
export async function serveSeries(c: Context): Promise<never> {
  const records = new Map<string, Map<string, Keys>>([
    [
      c.id,
      new Map([
        [c.alice.accountId, c.ownerKeys],
        [c.bob.accountId, c.buyerKeys],
      ]),
    ],
  ]);
  const journal: {
    label: string;
    ok: boolean;
    detail: string;
    at: string;
    position?: string;
    actor?: string;
  }[] = [];
  let busy = false;
  let trackedPosition: string | undefined;
  const commands = new Map<
    string,
    {
      fingerprint: string;
      state: "pending" | "done" | "failed";
      error?: string;
    }
  >();
  await c.alice.call(
    c.token,
    "ft_transfer",
    { receiver_id: c.bob.accountId, amount: units("300").toString() },
    { attachedDeposit: 1n },
  );
  const snapshot = (position: string) =>
    c.root.getAccount(position).view<Snapshot>("snapshot");
  const verify = (r: Receipt) => {
    if (r.failed || r.receiptFailures.length)
      throw new Error(
        r.receiptFailureMessages.join(" ") || "Transaction failed",
      );
  };
  const actor = (name: unknown) => {
    if (name === "Alice") return c.alice;
    if (name === "Bob") return c.bob;
    throw new Error("Choisir Alice ou Bob.");
  };
  const signed = async (
    position: string,
    who: SandboxAccount,
    action: Action,
  ) => {
    const s = await snapshot(position);
    const keys = records.get(position)?.get(who.accountId);
    if (!keys) throw new Error("Clé locale absente.");
    const r = await who.callRaw(
      c.root.getAccount(position),
      "execute",
      authorize(
        keys,
        envelope(s, action, ((await c.clock()) + 600_000_000_000n).toString()),
      ),
      { gas: GAS },
    );
    verify(r);
    return r;
  };
  const missions = c.missions
    ? missionService({
        root: c.root,
        contract: c.missions,
        operator: c.agent,
        token: c.token,
        collections: [c.collection],
        clock: c.clock,
        snapshots: () => Promise.all([...records.keys()].map(snapshot)),
        keys: (p, o) => records.get(p)?.get(o),
        remember: (p, o, k) => {
          if (!records.has(p)) records.set(p, new Map());
          records.get(p)!.set(o, k);
        },
        signWallet: signed,
      })
    : null;
  async function state() {
    const positions = await Promise.all([...records.keys()].map(snapshot));
    const series = await c.collection.view("series");
    return {
      mode: "sandbox",
      capabilities: [
        ...(missions ? ["paid-missions-v1"] : []),
        "agent-subscription-v1",
        "sale-valuation-v1",
        "sale-claims-v1",
      ],
      series,
      positions,
      listings: await Promise.all(
        (await c.collection.view<Listing[]>("listings", { limit: 100 })).map(
          async (sale) => ({
            ...sale,
            // Old immutable deployments do not have this view; never infer a date from polling.
            valuation_at: await c.root
              .getAccount(sale.position)
              .view<string | null>("sale_valuation_at", { id: sale.id })
              .catch(() => null),
            claim: await c.collection.view("sale_claim", {
              position: sale.position,
              id: sale.id,
            }),
          }),
        ),
      ),
      journal,
      now: (await c.clock()).toString(),
      actors: {
        Alice: c.alice.accountId,
        Bob: c.bob.accountId,
        Agent: c.agent.accountId,
      },
      balances: Object.fromEntries(
        await Promise.all(
          [c.alice, c.bob].map(async (a) => [
            a.accountId,
            await c.token.view<string>("ft_balance_of", {
              account_id: a.accountId,
            }),
          ]),
        ),
      ),
      subscriptions: await Promise.all(
        [...records.keys()].map(async (position) => ({
          position,
          subscription: await c.collection.view("subscription", { position }),
          refund: await c.collection.view("subscription_claim", { position }),
        })),
      ),
      busy,
    };
  }
  async function command(body: Record<string, unknown>) {
    const who = actor(body.actor);
    const position = String(body.position || c.id);
    trackedPosition = body.action === "maturity" ? undefined : position;
    if (body.action === "prepare_agent") {
      const config = await c.collection.view<{
        series: { terms: SeriesTerms; mandate_hash: string };
        closed: boolean;
        committed: string;
      }>("series");
      const balance = await c.token.view<string>("ft_balance_of", {
        account_id: who.accountId,
      });
      const proposal = prepareInvestment(
        body.request as InvestmentRequest,
        config.series,
        balance,
        await c.clock(),
        who.accountId,
        (
          BigInt(config.series.terms.capacity) - BigInt(config.committed)
        ).toString(),
      );
      if (
        config.closed ||
        proposal.status !== "proposed" ||
        proposal.mandateHash !== body.mandate_hash ||
        proposal.allocations[0].amount !== body.expected_amount
      )
        throw new Error(
          "Proposition périmée ou incompatible. Préparez une nouvelle proposition.",
        );
      const name = "position" + (records.size + 1),
        target = name + "." + c.collection.accountId,
        keys = ml_dsa65.keygen();
      trackedPosition = target;
      await who.call(
        c.collection,
        "create_plan",
        {
          name,
          ...initProof(
            keys,
            "sandbox",
            target,
            c.collection.accountId,
            who.accountId,
          ),
        },
        { attachedDeposit: 6n * N, gas: GAS },
      );
      records.set(target, new Map([[who.accountId, keys]]));
      await who.call(
        c.strategy,
        "register_position",
        { wallet: target },
        { attachedDeposit: N / 50n },
      );
      const expires_at = (
        (await c.clock()) + 600_000_000_000n < BigInt(c.series.closes_at)
          ? (await c.clock()) + 600_000_000_000n
          : BigInt(c.series.closes_at)
      ).toString();
      await signed(target, who, {
        AuthorizeSubscription: {
          agent: c.agent.accountId,
          asset: c.token.accountId,
          strategy: c.strategy.accountId,
          amount: proposal.allocations[0].amount,
          expires_at,
          beneficiary: who.accountId,
        },
      });
      return;
    }
    if (body.action === "subscribe") {
      const current = await c.collection.view<{
        series: { mandate_hash: string };
      }>("series");
      if (
        body.mandate_hash &&
        body.mandate_hash !== current.series.mandate_hash
      )
        throw new Error(
          "Le mandat de stratégie ne correspond plus à la fiche examinée.",
        );
      const amount = units(String(body.amount)).toString();
      if (BigInt(amount) < BigInt(c.series.minimum))
        throw new Error(
          "Le minimum de souscription est de " +
            c.series.minimum +
            " unités de demoUSD.",
        );
      let target = [...records.keys()].find((p) => p === position);
      let s = target ? await snapshot(target) : null;
      if (!s || s.funded || s.owner_id !== who.accountId) {
        const name = "position" + (records.size + 1);
        target = name + "." + c.collection.accountId;
        const keys = ml_dsa65.keygen();
        await who.call(
          c.collection,
          "create_plan",
          {
            name,
            ...initProof(
              keys,
              "sandbox",
              target,
              c.collection.accountId,
              who.accountId,
            ),
          },
          { attachedDeposit: 6n * N, gas: GAS },
        );
        records.set(target, new Map([[who.accountId, keys]]));
        await who.call(
          c.strategy,
          "register_position",
          { wallet: target },
          { attachedDeposit: N / 50n },
        );
      }
      trackedPosition = target!;
      const r = await who.callRaw(
        c.token,
        "ft_transfer_call",
        {
          receiver_id: c.collection.accountId,
          amount,
          msg: JSON.stringify({ Subscribe: target }),
        },
        { attachedDeposit: 1n, gas: GAS },
      );
      verify(r);
      const sub = await c.collection.view<{ state: string }>("subscription", {
        position: target,
      });
      if (sub.state !== "Funded")
        throw new Error(
          "Souscription " +
            sub.state +
            " : vérifier le contrat avant toute nouvelle tentative.",
        );
      return;
    }
    if (!records.has(position)) throw new Error("Position locale inconnue.");
    const s = await snapshot(position);
    switch (body.action) {
      case "escrow_agent": {
        const permit = s.funding_permit;
        if (
          !permit ||
          permit.beneficiary !== who.accountId ||
          body.expected_amount !== permit.amount
        )
          throw new Error("Mandat de souscription absent ou montant modifié.");
        verify(
          await who.callRaw(
            c.token,
            "ft_transfer_call",
            {
              receiver_id: c.collection.accountId,
              amount: permit.amount,
              msg: JSON.stringify({
                AgentSubscribe: {
                  position,
                  policy_version: permit.policy_version,
                },
              }),
            },
            { attachedDeposit: 1n, gas: GAS },
          ),
        );
        break;
      }
      case "execute_agent": {
        const permit = s.funding_permit;
        if (
          !permit ||
          permit.beneficiary !== who.accountId ||
          body.expected_amount !== permit.amount
        )
          throw new Error("Mandat courant requis.");
        verify(
          await c.agent.callRaw(
            c.collection,
            "agent_subscribe",
            { position, policy_version: permit.policy_version },
            { gas: GAS },
          ),
        );
        if (!(await snapshot(position)).funded)
          throw new Error(
            "Financement en attente : relire les contrats avant toute reprise.",
          );
        break;
      }
      case "cancel_agent":
        await signed(position, who, "CancelSubscription");
        break;
      case "claim_subscription":
        await who.call(
          c.collection,
          "claim_subscription",
          { position },
          { gas: GAS },
        );
        break;
      case "rotate": {
        const old = records.get(position)?.get(who.accountId);
        if (!old || s.owner_id !== who.accountId)
          throw new Error("Propriétaire courant requis.");
        const next = ml_dsa65.keygen();
        const e = envelope(
          s,
          { Rotate: { public_key: b64(next.publicKey) } },
          ((await c.clock()) + 600_000_000_000n).toString(),
        );
        verify(
          await who.callRaw(
            c.root.getAccount(position),
            "execute",
            authorize(old, e, next),
            { gas: GAS },
          ),
        );
        records.get(position)!.set(who.accountId, next);
        break;
      }

      case "delegate":
        await signed(position, who, {
          SetPolicy: {
            policy: {
              agent: c.agent.accountId,
              asset: s.asset,
              strategy: s.strategy,
              max_operation: c.series.max_operation,
              max_period: c.series.max_period,
              allocation_bps: c.series.allocation_bps,
              expires_at: c.series.matures_at,
              ownership_epoch: s.ownership_epoch,
              policy_version: (BigInt(s.policy_version) + 1n).toString(),
            },
            horizon_years: 0,
            target_bps: 0,
          },
        });
        break;
      case "allocate": {
        const proposed = propose(s, s.policy, await c.clock());
        if (proposed.amount === "0") throw new Error(proposed.reason);
        if (body.expected_amount !== proposed.amount)
          throw new Error(
            "Le montant proposé a changé. Relisez la position avant de confirmer.",
          );
        verify(
          await c.agent.callRaw(
            c.root.getAccount(position),
            "agent_allocate",
            {
              amount: proposed.amount,
              ownership_epoch: s.ownership_epoch,
              policy_version: s.policy_version,
            },
            { gas: GAS },
          ),
        );
        break;
      }
      case "probe":
        verify(
          await c.agent.callRaw(
            c.root.getAccount(position),
            "agent_allocate",
            {
              amount: (BigInt(c.series.max_operation) + 1n).toString(),
              ownership_epoch: s.ownership_epoch,
              policy_version: s.policy_version,
            },
            { gas: GAS },
          ),
        );
        break;
      case "redeem":
        if (body.expected_amount !== s.principal)
          throw new Error("Le principal a changé. Relisez la position.");
        await signed(position, who, {
          Redeem: { asset: s.asset, amount: s.principal },
        });
        break;
      case "revoke":
        await signed(position, who, "Revoke");
        break;
      case "withdraw":
        if (
          body.expected_amount !== s.available ||
          body.expected_beneficiary !== who.accountId
        )
          throw new Error(
            "Le montant ou le destinataire du retrait a changé. Relisez la position.",
          );
        await signed(position, who, {
          Withdraw: {
            asset: s.asset,
            amount: s.available,
            beneficiary: who.accountId,
          },
        });
        break;
      case "list": {
        const expires_at = (
          (await c.clock()) + 600_000_000_000n < BigInt(c.series.matures_at)
            ? (await c.clock()) + 600_000_000_000n
            : BigInt(c.series.matures_at) - 1n
        ).toString();
        const price = units(String(body.amount)).toString();
        const quote = await c.root
          .getAccount(position)
          .view<{ id: string; valuation_hash: string }>("sale_quote", {
            price,
            expires_at,
          });
        await signed(position, who, {
          List: {
            id: quote.id,
            price,
            payment_token: s.asset,
            expires_at,
            valuation_hash: quote.valuation_hash,
          },
        });
        break;
      }
      case "cancel":
        if (!s.sale) throw new Error("Aucune annonce.");
        await signed(position, who, { CancelListing: { id: s.sale.id } });
        break;
      case "buy": {
        const sale = await c.collection.view<Listing>("listing", {
          position,
          id: String(body.id),
        });
        if (!sale || sale.state !== "Active")
          throw new Error("Annonce indisponible.");
        if (sale.seller === who.accountId)
          throw new Error("Le vendeur ne peut pas acheter sa propre position.");
        const keys = ml_dsa65.keygen();
        records.get(position)!.set(who.accountId, keys);
        await who.call(
          c.root.getAccount(position),
          "register_recipient",
          recipientProof(
            keys,
            s,
            who.accountId,
            ((await c.clock()) + 900_000_000_000n).toString(),
          ),
          { attachedDeposit: N / 10n, gas: GAS },
        );
        verify(
          await who.callRaw(
            c.token,
            "ft_transfer_call",
            {
              receiver_id: c.collection.accountId,
              amount: sale.price,
              msg: JSON.stringify({
                position,
                id: sale.id,
                valuation_hash: sale.valuation_hash,
              }),
            },
            { attachedDeposit: 1n, gas: GAS },
          ),
        );
        let settled = await c.collection.view<Listing>("listing", {
          position,
          id: sale.id,
        });
        if (
          ["Settling", "Resolving", "AwaitingIndex"].includes(settled.state)
        ) {
          await who.call(
            c.collection,
            "resume_sale",
            { position, id: sale.id },
            { gas: GAS },
          );
          settled = await c.collection.view("listing", {
            position,
            id: sale.id,
          });
        }
        if (settled.state !== "Settled")
          throw new Error(
            "Règlement " +
              settled.state +
              " : conserver le suivi, ne pas racheter.",
          );
        await who.call(
          c.collection,
          "release_settled",
          { position, id: sale.id },
          { gas: GAS },
        );
        break;
      }
      case "maturity": {
        for (
          let i = 0;
          i < 200 && (await c.clock()) < BigInt(c.series.matures_at);
          i++
        )
          await c.root.rpc("sandbox_fast_forward", { delta_height: 10000 });
        await settleSandboxFinality(c.root);
        break;
      }
      case "expire":
        await who.call(
          c.collection,
          "expire_listing",
          { position, id: String(body.id) },
          { gas: GAS },
        );
        break;
      case "resume":
        await who.call(
          c.collection,
          "resume_sale",
          { position, id: String(body.id) },
          { gas: GAS },
        );
        break;
      case "claim_sale": {
        const claim = await c.collection.view<{
          beneficiary: string;
          amount: string;
          state: string;
        } | null>("sale_claim", { position, id: String(body.id) });
        if (
          !claim ||
          claim.state !== "Claimable" ||
          claim.beneficiary !== who.accountId ||
          claim.beneficiary !== body.expected_beneficiary ||
          claim.amount !== body.expected_amount
        )
          throw new Error(
            "Créance modifiée, déjà engagée ou destinée à un autre bénéficiaire.",
          );
        await who.call(
          c.collection,
          "claim_sale",
          { position, id: String(body.id) },
          { gas: GAS },
        );
        break;
      }
      default:
        throw new Error("Action inconnue.");
    }
  }
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
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    try {
      if (req.method === "GET" && req.url === "/state") {
        res.end(JSON.stringify(await state()));
        return;
      }
      if (
        req.method === "GET" &&
        req.url === "/missions/catalogue" &&
        missions
      ) {
        res.end(JSON.stringify(await missions.catalogue()));
        return;
      }
      if (
        req.method === "POST" &&
        req.url === "/missions" &&
        origin &&
        missions
      ) {
        if (busy)
          throw new Error(
            "Une transaction est en cours. Attendez sa confirmation puis actualisez.",
          );
        if (!req.headers["content-type"]?.startsWith("application/json"))
          throw new Error("JSON requis.");
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 16384)
            throw new Error("Requête trop longue.");
        }
        const body = JSON.parse(raw);
        busy = true;
        try {
          res.end(
            JSON.stringify(await missions.handle(body, actor(body.actor))),
          );
        } finally {
          busy = false;
        }
        return;
      }
      if (req.method !== "POST" || req.url !== "/command" || !origin) {
        res.writeHead(404);
        res.end("{}");
        return;
      }
      if (busy) {
        res.writeHead(409);
        res.end(JSON.stringify({ error: "Une opération est déjà en cours." }));
        return;
      }
      if (!req.headers["content-type"]?.startsWith("application/json"))
        throw new Error("JSON requis.");
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 4096) throw new Error("Requête trop longue.");
      }
      const body = JSON.parse(raw);
      if (
        typeof body.command_id !== "string" ||
        !/^[-a-zA-Z0-9]{16,64}$/.test(body.command_id)
      )
        throw new Error("Identifiant de commande requis.");
      const fingerprint = JSON.stringify([
        body.actor,
        body.action,
        body.position ?? null,
        body.amount ?? null,
        body.id ?? null,
        body.expected_amount ?? null,
        body.expected_beneficiary ?? null,
        body.request ?? null,
        body.mandate_hash ?? null,
      ]);
      const previous = commands.get(body.command_id);
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new Error("Cet identifiant appartient à une autre commande.");
        if (previous.state === "done") {
          res.end(JSON.stringify(await state()));
          return;
        }
        throw new Error(
          previous.error ||
            "Commande déjà engagée : relire son état, ne pas créer une nouvelle commande.",
        );
      }
      if (busy) throw new Error("Une opération est déjà en cours.");
      if (commands.size >= 1024)
        throw new Error("Limite de commandes de cette sandbox atteinte.");
      const record = {
        fingerprint,
        state: "pending" as "pending" | "done" | "failed",
        error: undefined as string | undefined,
      };
      commands.set(body.command_id, record);
      busy = true;
      try {
        await command(body);
        record.state = "done";
        journal.unshift({
          label: String(body.action),
          position: trackedPosition,
          actor: actor(body.actor).accountId,
          ok: true,
          detail: "État final relu sur NEAR sandbox.",
          at: new Date().toISOString(),
        });
        res.end(JSON.stringify(await state()));
      } catch (error) {
        const detail = String(error);
        record.state = "failed";
        record.error = detail;
        journal.unshift({
          label: String(body.action),
          position: trackedPosition,
          actor: actor(body.actor).accountId,
          ok: false,
          detail,
          at: new Date().toISOString(),
        });
        throw error;
      } finally {
        busy = false;
        journal.splice(100);
      }
    } catch (error) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: String(error) }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(
      Number(process.env.EVERKEEP_SERIES_PORT || (missions ? "8792" : "8791")),
      "127.0.0.1",
      resolve,
    );
  });
  console.log(
    `Everkeep Explorer : API locale http://127.0.0.1:${process.env.EVERKEEP_SERIES_PORT || (missions ? "8792" : "8791")} — vrais contrats sandbox, sessions précédentes conservées séparément.`,
  );
  return new Promise<never>((_, reject) => {
    const stop = () =>
      server.close(() => reject(new Error("Sandbox series server stopped.")));
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    server.once("error", reject);
  });
}
