/**
 * Agent runner core: runs Buyer and Payer jobs for agent seats.
 *
 * The runner holds agent secret keys only. Each key is a function-call key on
 * its owner's account, limited by the protocol to `agent_pay`, `agent_buy` and
 * `pause` on the agents contract, with no deposit. So the runner cannot
 * withdraw, change limits or move NFTs, whatever its code does. The contract
 * enforces the money (caps, payees, market, budget); the runner only chooses
 * *what* to buy and *when* to pay.
 *
 * Used by scripts/agent-runner.ts (local HTTP service) and by
 * scripts/agents-runner-proof.ts (sandbox proof).
 */
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from "near-api-js";

export type BuyerMission = {
  /** Highest price per card, in yoctoNEAR (the contract's per-action cap still applies). */
  maxPrice: string;
  /** Lowest tier accepted (0 matte … 3 animated). */
  minTier?: number;
};
export type Payment = {
  payee: string;
  /** USDC units (6 decimals). */
  amount: string;
  everySeconds: number;
  memo?: string;
};
export type PayerMission = { payments: Payment[] };

export type Job = {
  seatId: string;
  accountId: string;
  publicKey: string;
  kind: "Buyer" | "Payer";
  /** Role preset chosen in the UI (collector, subscription…). Display only. */
  role?: string;
  /** Name the owner gave the agent. Display only. */
  name?: string;
  buyer?: BuyerMission;
  payer?: PayerMission;
  /** Payer: last payment time per payee+amount (ms). */
  lastPaid?: Record<string, number>;
  lastRun?: number;
  lastResult?: string;
};

export type StoredKey = {
  accountId: string;
  publicKey: string;
  secretKey: string;
  createdAt: string;
};

/** Where keys and jobs live. File-backed in the service, in-memory in tests. */
export interface Store {
  keys(): Promise<StoredKey[]>;
  saveKey(k: StoredKey): Promise<void>;
  jobs(): Promise<Job[]>;
  saveJob(j: Job): Promise<void>;
  deleteJob(seatId: string): Promise<void>;
}

export class MemoryStore implements Store {
  private k: StoredKey[] = [];
  private j = new Map<string, Job>();
  async keys() {
    return this.k;
  }
  async saveKey(k: StoredKey) {
    this.k.push(k);
  }
  async jobs() {
    return [...this.j.values()];
  }
  async saveJob(j: Job) {
    this.j.set(j.seatId, j);
  }
  async deleteJob(seatId: string) {
    this.j.delete(seatId);
  }
}

type SeatView = {
  seat_id: string;
  owner: string;
  kind: "Buyer" | "Payer";
  paused: boolean;
  agent_key: string | null;
  balance: string;
  left_today: string;
  policy: { per_tx_max: string; market: string | null; payees: string[] } | null;
};
type Listing = {
  token_id: string;
  owner_id: string;
  tier: number;
  list_price: string | null;
  listing_id: string | null;
};

const PAY_GAS = 100_000_000_000_000n;
const BUY_GAS = 200_000_000_000_000n;

export class Runner {
  constructor(
    readonly opts: {
      rpc: string;
      agents: string;
      store: Store;
      log?: (line: string) => void;
    },
  ) {}

  private log(line: string) {
    (this.opts.log ?? console.log)(`[runner] ${line}`);
  }

  async view<T>(contract: string, method: string, args: object = {}): Promise<T> {
    const r = await (
      await fetch(this.opts.rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "runner",
          method: "query",
          params: {
            request_type: "call_function",
            account_id: contract,
            method_name: method,
            args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
            finality: "final",
          },
        }),
      })
    ).json();
    if (r.error || r.result?.error) throw new Error(JSON.stringify(r.error ?? r.result.error));
    return JSON.parse(Buffer.from(r.result.result).toString());
  }

  /** New agent key for `accountId`. Only the public key ever leaves the runner. */
  async createKey(accountId: string) {
    const kp = KeyPair.fromRandom("ed25519");
    const key: StoredKey = {
      accountId,
      publicKey: kp.getPublicKey().toString(),
      secretKey: kp.toString(),
      createdAt: new Date().toISOString(),
    };
    await this.opts.store.saveKey(key);
    this.log(`new agent key for ${accountId}: ${key.publicKey}`);
    return key.publicKey;
  }

  private async signer(accountId: string, publicKey: string) {
    const key = (await this.opts.store.keys()).find(
      (k) => k.accountId === accountId && k.publicKey === publicKey,
    );
    if (!key) throw new Error(`no secret for ${publicKey} on ${accountId}`);
    return new Account(
      accountId,
      new JsonRpcProvider({ url: this.opts.rpc }),
      KeyPairSigner.fromSecretKey(key.secretKey as `ed25519:${string}`),
    );
  }

  /** Signs one agent call with the seat's agent key. Returns the contract's answer. */
  private async act(job: Job, method: string, args: object, gas: bigint) {
    const account = await this.signer(job.accountId, job.publicKey);
    const r = await account.signAndSendTransaction({
      receiverId: this.opts.agents,
      actions: [actions.functionCall(method, args, gas, 0n)],
      waitUntil: "FINAL",
      throwOnFailure: false,
    });
    const s = r.status as { SuccessValue?: string; Failure?: unknown };
    if (s && typeof s === "object" && "Failure" in s)
      throw new Error(`${method} failed: ${JSON.stringify(s.Failure)}`);
    const text = Buffer.from(s?.SuccessValue ?? "", "base64").toString();
    return { ok: text ? JSON.parse(text) === true : false, hash: r.transaction.hash };
  }

  /** Why this job cannot act right now, or null. Read from chain, so it is never stale. */
  private blocked(job: Job, seat: SeatView | null) {
    if (!seat) return "seat not found";
    if (seat.owner !== job.accountId) return "seat has a new owner";
    if (seat.agent_key !== job.publicKey) return "agent key not set on the seat";
    if (seat.paused) return "paused";
    if (!seat.policy) return "no policy";
    return null;
  }

  async runJob(job: Job, now = Date.now()): Promise<string> {
    const seat = await this.view<SeatView | null>(this.opts.agents, "seat", {
      seat_id: job.seatId,
    });
    const why = this.blocked(job, seat);
    let result: string;
    if (why) result = `skipped: ${why}`;
    else if (job.kind === "Buyer") result = await this.runBuyer(job, seat!);
    else result = await this.runPayer(job, seat!, now);
    job.lastRun = now;
    job.lastResult = result;
    await this.opts.store.saveJob(job);
    this.log(`seat ${job.seatId} (${job.kind}): ${result}`);
    return result;
  }

  private async runBuyer(job: Job, seat: SeatView) {
    const mission = job.buyer;
    const market = seat.policy?.market;
    if (!mission || !market) return "skipped: no mission";
    const max = BigInt(mission.maxPrice);
    const cap = BigInt(seat.policy!.per_tx_max);
    const room = [BigInt(seat.balance), BigInt(seat.left_today)].reduce((a, b) => (a < b ? a : b));
    const supply = Number(await this.view<string>(market, "nft_total_supply"));
    let best: Listing | null = null;
    for (let from = 0; from < supply; from += 50) {
      const page = await this.view<Listing[]>(market, "listings", {
        from_index: String(from),
        limit: 50,
      });
      for (const l of page) {
        if (!l.list_price || !l.listing_id || l.owner_id === job.accountId) continue;
        const price = BigInt(l.list_price);
        if (price > max || price > cap || price > room) continue;
        if ((l.tier ?? 0) < (mission.minTier ?? 0)) continue;
        if (!best || price < BigInt(best.list_price!)) best = l;
      }
    }
    if (!best) return "no listing within the mission";
    const r = await this.act(
      job,
      "agent_buy",
      {
        seat_id: job.seatId,
        token_id: best.token_id,
        listing_id: best.listing_id,
        price: best.list_price,
      },
      BUY_GAS,
    );
    return r.ok
      ? `bought #${best.token_id} for ${best.list_price} yocto (tx ${r.hash})`
      : `buy #${best.token_id} refused or failed (tx ${r.hash})`;
  }

  private async runPayer(job: Job, seat: SeatView, now: number) {
    const payments = job.payer?.payments ?? [];
    job.lastPaid ??= {};
    const done: string[] = [];
    // Local copies so several payments in one tick see each other's spending.
    let left = BigInt(seat.left_today);
    let balance = BigInt(seat.balance);
    const cap = BigInt(seat.policy?.per_tx_max ?? "0");
    for (const p of payments) {
      const id = `${p.payee}:${p.amount}`;
      const last = job.lastPaid[id] ?? 0;
      if (now - last < p.everySeconds * 1000) continue;
      // Do not spend gas on a payment the contract will refuse for sure. The
      // Ask bar can still send one on purpose, to show the contract blocking it.
      const amount = BigInt(p.amount);
      const why = !seat.policy?.payees.includes(p.payee)
        ? `skipped: ${p.payee} is not on the agent's list`
        : amount > cap
          ? `skipped: ${p.amount} is above the cap per payment, update the mission`
          : amount > left
            ? "waiting: daily cap reached"
            : amount > balance
              ? "waiting: budget too low, add budget"
              : null;
      if (why) {
        done.push(why);
        continue;
      }
      const r = await this.act(
        job,
        "agent_pay",
        { seat_id: job.seatId, payee: p.payee, amount: p.amount, memo: p.memo ?? null },
        PAY_GAS,
      );
      // A refusal is logged on chain; wait for the next period before retrying.
      job.lastPaid[id] = now;
      if (r.ok) {
        left -= amount;
        balance -= amount;
      }
      done.push(`${r.ok ? "paid" : "refused"} ${p.amount} to ${p.payee} (tx ${r.hash})`);
    }
    return done.length ? done.join("; ") : "nothing due";
  }

  /** One purchase now (Ask bar): the exact listing the user previewed. */
  async buyNow(job: Job, tokenId: string, listingId: string, price: string) {
    const r = await this.act(
      job,
      "agent_buy",
      { seat_id: job.seatId, token_id: tokenId, listing_id: listingId, price },
      BUY_GAS,
    );
    const result = `${r.ok ? "bought" : "refused or failed:"} #${tokenId} for ${price} yocto, on request (tx ${r.hash})`;
    await this.note(job, result);
    return { ok: r.ok, tx: r.hash, result };
  }

  /** One payment now (Ask bar). The contract still checks payee, caps and budget. */
  async payNow(job: Job, payee: string, amount: string, memo?: string) {
    const r = await this.act(
      job,
      "agent_pay",
      { seat_id: job.seatId, payee, amount, memo: memo ?? "on request" },
      PAY_GAS,
    );
    const result = `${r.ok ? "paid" : "refused"} ${amount} to ${payee}, on request (tx ${r.hash})`;
    await this.note(job, result);
    return { ok: r.ok, tx: r.hash, result };
  }

  private async note(job: Job, result: string) {
    job.lastRun = Date.now();
    job.lastResult = result;
    await this.opts.store.saveJob(job);
    this.log(`seat ${job.seatId}: ${result}`);
  }

  /** Kill switch with no wallet: the agent key itself may pause its seat. */
  async pause(job: Job) {
    const r = await this.act(job, "pause", { seat_id: job.seatId }, 30_000_000_000_000n);
    job.lastResult = `paused by the runner (tx ${r.hash})`;
    job.lastRun = Date.now();
    await this.opts.store.saveJob(job);
    this.log(`seat ${job.seatId}: ${job.lastResult}`);
    return r.hash;
  }

  /** Runs every job once, in order. Errors are reported per job, never thrown. */
  async tick(now = Date.now()) {
    const out: Record<string, string> = {};
    for (const job of await this.opts.store.jobs()) {
      try {
        out[job.seatId] = await this.runJob(job, now);
      } catch (e) {
        out[job.seatId] = `error: ${(e as Error).message}`;
        job.lastRun = now;
        job.lastResult = out[job.seatId];
        await this.opts.store.saveJob(job);
        this.log(`seat ${job.seatId}: ${out[job.seatId]}`);
      }
    }
    return out;
  }
}
