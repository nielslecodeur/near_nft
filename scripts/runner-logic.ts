/**
 * Agent runner logic, with no NEAR library: what to buy, when to pay, and the
 * job store. The chain is injected (`Chain`): near-api-js in the local runner
 * (scripts/agent-runner-core.ts), WebCrypto in the Cloudflare Worker
 * (workers/runner), so both run the exact same missions.
 *
 * The runner holds agent secret keys only. Each key is a function-call key on
 * its owner's account, limited by the protocol to `agent_pay`, `agent_buy` and
 * `pause` on the agents contract, with no deposit. The contract enforces the
 * money (caps, payees, market, budget); the runner only chooses *what* to buy
 * and *when* to pay.
 */
import { parseSeatKey } from "../src/keepers/seat-key.js";

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
  /** Seat key: "9" (v1) or "v2-3" (v2). */
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

/** Where keys and jobs live: a file (local runner), D1 (Worker), memory (tests). */
export interface Store {
  keys(): Promise<StoredKey[]>;
  saveKey(k: StoredKey): Promise<void>;
  jobs(): Promise<Job[]>;
  saveJob(j: Job): Promise<void>;
  deleteJob(seatId: string): Promise<void>;
}

/** What the runner needs from NEAR. */
export interface Chain {
  /** A view call, JSON in and out. */
  view<T>(contract: string, method: string, args?: object): Promise<T>;
  /** One function call signed by `key` on its own account, no deposit. `ok` is the contract's boolean answer. */
  act(key: StoredKey, receiver: string, method: string, args: object, gas: bigint): Promise<{ ok: boolean; hash: string }>;
  /** A fresh ed25519 key pair, "ed25519:<base58>" for both. */
  newKey(): Promise<{ publicKey: string; secretKey: string }>;
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

export const PAY_GAS = 100_000_000_000_000n;
export const BUY_GAS = 200_000_000_000_000n;
export const PAUSE_GAS = 30_000_000_000_000n;

export class RunnerLogic {
  constructor(
    readonly opts: {
      /** v1 agents contract (job keys like "9"). */
      agents: string;
      /** v2 agents contract (job keys like "v2-3"). */
      agentsV2?: string;
      store: Store;
      chain: Chain;
      log?: (line: string) => void;
    },
  ) {}

  /** The contract and in-contract id behind a job's seat key ("9" -> v1 #9, "v2-3" -> v2 #3). */
  target(job: { seatId: string }) {
    const k = parseSeatKey(job.seatId);
    if (!k) throw new Error(`Not a seat key: ${job.seatId}`);
    if (k.version === "v2" && !this.opts.agentsV2) throw new Error("This runner has no v2 contract configured");
    return { contract: k.version === "v2" ? this.opts.agentsV2! : this.opts.agents, id: k.num };
  }

  protected log(line: string) {
    (this.opts.log ?? console.log)(`[runner] ${line}`);
  }

  view<T>(contract: string, method: string, args: object = {}): Promise<T> {
    return this.opts.chain.view<T>(contract, method, args);
  }

  /** New agent key for `accountId`. Only the public key ever leaves the runner. */
  async createKey(accountId: string) {
    const kp = await this.opts.chain.newKey();
    const key: StoredKey = { accountId, publicKey: kp.publicKey, secretKey: kp.secretKey, createdAt: new Date().toISOString() };
    await this.opts.store.saveKey(key);
    this.log(`new agent key for ${accountId}: ${key.publicKey}`);
    return key.publicKey;
  }

  /** Signs one agent call with the seat's agent key. Returns the contract's answer. */
  protected async act(job: Job, method: string, args: object, gas: bigint) {
    const key = (await this.opts.store.keys()).find((k) => k.accountId === job.accountId && k.publicKey === job.publicKey);
    if (!key) throw new Error(`no secret for ${job.publicKey} on ${job.accountId}`);
    return this.opts.chain.act(key, this.target(job).contract, method, args, gas);
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
    const seat = await this.view<SeatView | null>(this.target(job).contract, "seat", { seat_id: this.target(job).id });
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
      const page = await this.view<Listing[]>(market, "listings", { from_index: String(from), limit: 50 });
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
      { seat_id: this.target(job).id, token_id: best.token_id, listing_id: best.listing_id, price: best.list_price },
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
      const r = await this.act(job, "agent_pay", { seat_id: this.target(job).id, payee: p.payee, amount: p.amount, memo: p.memo ?? null }, PAY_GAS);
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
    const r = await this.act(job, "agent_buy", { seat_id: this.target(job).id, token_id: tokenId, listing_id: listingId, price }, BUY_GAS);
    const result = `${r.ok ? "bought" : "refused or failed:"} #${tokenId} for ${price} yocto, on request (tx ${r.hash})`;
    await this.note(job, result);
    return { ok: r.ok, tx: r.hash, result };
  }

  /** One payment now (Ask bar). The contract still checks payee, caps and budget. */
  async payNow(job: Job, payee: string, amount: string, memo?: string) {
    const r = await this.act(job, "agent_pay", { seat_id: this.target(job).id, payee, amount, memo: memo ?? "on request" }, PAY_GAS);
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
    const r = await this.act(job, "pause", { seat_id: this.target(job).id }, PAUSE_GAS);
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
