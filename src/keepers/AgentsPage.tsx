import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Ban,
  Bot,
  CircleCheck,
  CirclePause,
  CirclePlay,
  CircleX,
  CornerDownLeft,
  KeyRound,
  OctagonPause,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Wallet as WalletIcon,
  Zap,
} from "lucide-react";
import { Badge, Button, Input, Notice, Select, Skeleton } from "../terminal/primitives";
import { EXPLORER, KEEPERS_V1, KEEPERS_V2 } from "./chain";
import { shortAccount } from "./KeeperCard";
import * as ag from "./agents";
import type { Job, LogEntry, OwnedNft, Policy, Seat } from "./agents";
import { EXAMPLES, parseAsk, type Intent } from "./ask";
import { ROLES, UNIT_SECONDS, defaultRole, roleOf, type Role, type RoleId, type Unit } from "./roles";
import type { Wallet } from "./KeepersApp";
import "./agents.css";
import "./agents-stage.css";

type Nav = (to: string) => void;
const TIERS = ["matte", "brushed", "holographic", "animated"];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const collectionLabel = (id: string) =>
  ag.COLLECTIONS.find((c) => c.id === id)?.label ?? shortAccount(id);
const nftHref = (contract: string, token: string) =>
  contract === KEEPERS_V2
    ? `/keepers/${token}`
    : contract === KEEPERS_V1
      ? `/keepers/v1/${token}`
      : `${EXPLORER}/nft-token/${contract}/${token}`;
const ago = (ns: string | number) => {
  const ms = typeof ns === "string" ? Number(BigInt(ns) / 1_000_000n) : ns;
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60
    ? `${s}s ago`
    : s < 3600
      ? `${Math.round(s / 60)} min ago`
      : s < 86400
        ? `${Math.round(s / 3600)} h ago`
        : `${Math.round(s / 86400)} d ago`;
};
const txIn = (text?: string) => text?.match(/tx ([1-9A-HJ-NP-Za-km-z]{43,44})/)?.[1];
const min = (...v: bigint[]) => v.reduce((a, b) => (a < b ? a : b));

const roleFor = (seat: Seat, job?: Job): Role => roleOf(job?.role) ?? defaultRole(seat.kind);
const nameFor = (seat: Seat, job?: Job) => job?.name || `${roleFor(seat, job).name} #${seat.seat_id}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Status = { label: string; tone: "up" | "down" | "neutral" | "brand"; note: string; live: boolean };
function statusOf(seat: Seat, job: Job | undefined, nftOwner: string | null, runnerUp: boolean): Status {
  if (nftOwner && nftOwner !== seat.owner)
    return { label: "NFT sold", tone: "down", note: "The NFT changed hands: the agent is stopped.", live: false };
  if (!seat.policy) return { label: "Reset", tone: "down", note: "No limits set.", live: false };
  if (seat.paused) return { label: "Paused", tone: "neutral", note: "Resume to let it act again.", live: false };
  if (!seat.agent_key) return { label: "No access", tone: "neutral", note: "Give the agent its key.", live: false };
  if (!job) return { label: "No mission", tone: "neutral", note: "The runner has no key for it.", live: false };
  if (!runnerUp) return { label: "Runner offline", tone: "down", note: "Start npm run agent:runner.", live: false };
  return { label: "Active", tone: "up", note: "Acts on its own, within its limits.", live: true };
}

/** Runs one wallet or runner action with busy/error/success state. */
function useAction(refresh: () => void) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string; href?: string } | null>(null);
  const run = useCallback(
    async (label: string, ok: string, fn: () => Promise<unknown>) => {
      setBusy(label);
      setMsg(null);
      try {
        const r = (await fn()) as { outcomes?: { transaction: { hash: string } }[]; tx?: string } | undefined;
        const hash = r?.outcomes?.at(-1)?.transaction.hash ?? r?.tx;
        setMsg({ tone: "success", text: ok, href: hash ? ag.txLink(hash) : undefined });
        refresh();
      } catch (e) {
        setMsg({ tone: "error", text: (e as Error).message });
      } finally {
        setBusy("");
      }
    },
    [refresh],
  );
  const notice = msg && (
    <Notice tone={msg.tone} title={msg.tone === "error" ? "Not done" : "Done"}>
      {msg.text}{" "}
      {msg.href && (
        <a href={msg.href} target="_blank" rel="noreferrer">
          View transaction
        </a>
      )}
    </Notice>
  );
  return { busy, run, notice };
}

function useRunner(account: string) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [up, setUp] = useState<boolean | null>(null);
  const load = useCallback(async () => {
    if (!account) return;
    try {
      await ag.runnerHealth();
      setJobs(await ag.runnerJobs(account));
      setUp(true);
    } catch {
      setUp(false);
    }
  }, [account]);
  useEffect(() => void load(), [load]);
  return { jobs, up: up === true, checked: up !== null, reload: load };
}

function useImages(items: { key: string; contract: string; token: string }[]) {
  const [images, setImages] = useState<Record<string, string | null>>({});
  const wanted = items.map((i) => i.key).join("|");
  useEffect(() => {
    for (const i of items)
      if (!(i.key in images))
        void ag.nftImage(i.contract, i.token).then((src) => setImages((m) => ({ ...m, [i.key]: src })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  return images;
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="ag-stat">
      <span>{label}</span>
      <strong className="kp-num">{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function NftArt({ src, label }: { src: string | null | undefined; label: string }) {
  return src ? (
    <img className="ag-art" src={src} alt={label} loading="lazy" />
  ) : (
    <div className="ag-art ag-art--empty" aria-label={label}>
      <Bot aria-hidden="true" />
    </div>
  );
}

function ConnectFirst({ wallet, what }: { wallet: Wallet; what: string }) {
  return (
    <div className="kp-empty">
      <p>Connect your wallet to {what}.</p>
      <Button variant="primary" icon={WalletIcon} onClick={() => void wallet.connect()}>
        Connect wallet
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Ask bar: sentence -> intent -> plan with on-chain limit checks -> go
// ---------------------------------------------------------------------------

type Check = { ok: boolean; text: string };
type Plan = {
  title: string;
  agent?: string;
  checks: Check[];
  go?: () => Promise<{ text: string; tx?: string; ok: boolean }>;
  /** True when the checks fail but the action can still be sent, to watch the contract block it. */
  forceable?: boolean;
  info?: ReactNode;
};

async function planFor(
  intent: Intent,
  ctx: { account: string; seats: Seat[]; jobs: Job[]; runnerUp: boolean; pauseAll: () => Promise<string> },
): Promise<Plan> {
  const runnable = ctx.seats
    .map((s) => ({ s, job: ctx.jobs.find((j) => j.seatId === s.seat_id) }))
    .filter((x): x is { s: Seat; job: Job } => !!x.job);
  const byName = (agent?: string) =>
    agent ? runnable.find(({ s, job }) => slug(nameFor(s, job)).startsWith(agent) || s.seat_id === agent) : undefined;
  const live = (s: Seat): Check[] => [
    { ok: !s.paused, text: s.paused ? "Agent is paused" : "Agent is active" },
    { ok: !!s.agent_key, text: s.agent_key ? "Agent has its key" : "Agent has no key" },
    { ok: ctx.runnerUp, text: ctx.runnerUp ? "Runner online" : "Runner offline" },
  ];

  if (intent.type === "help")
    return {
      title: intent.reason ?? "Try one of these",
      checks: [],
      info: (
        <ul className="ag-examples">
          {EXAMPLES.map((e) => (
            <li key={e}>
              <code>{e}</code>
            </li>
          ))}
        </ul>
      ),
    };

  if (intent.type === "status") {
    const near = ctx.seats.filter((s) => s.asset === "NEAR").reduce((a, s) => a + BigInt(s.balance), 0n);
    const usdc = ctx.seats.filter((s) => s.asset === "USDC").reduce((a, s) => a + BigInt(s.balance), 0n);
    const active = ctx.seats.filter((s) => !s.paused && s.agent_key).length;
    return {
      title: `${ctx.seats.length} agents, ${active} active`,
      checks: [],
      info: (
        <p className="ag-muted">
          Budgets: {ag.formatAsset(near, "NEAR")} and {ag.formatAsset(usdc, "USDC")}. Done{" "}
          {ctx.seats.reduce((a, s) => a + s.done, 0)}, blocked {ctx.seats.reduce((a, s) => a + s.refused, 0)}.
        </p>
      ),
    };
  }

  if (intent.type === "pause_all") {
    const n = ctx.seats.filter((s) => !s.paused).length;
    return {
      title: `Pause all ${n} running agent${n === 1 ? "" : "s"}`,
      checks: [{ ok: n > 0, text: n > 0 ? "Each agent key can pause its own seat: no wallet needed" : "Nothing is running" }],
      go: n > 0 ? async () => ({ ok: true, text: await ctx.pauseAll() }) : undefined,
    };
  }

  if (intent.type === "buy") {
    const buyers = runnable.filter(({ s }) => s.kind === "Buyer");
    if (!buyers.length)
      return { title: "No buyer agent yet", checks: [{ ok: false, text: "Create a Collector or a Bargain hunter first" }] };
    const want = intent.maxPrice ? ag.parseAsset(intent.maxPrice, "NEAR") : null;
    const listings = (await ag.marketListings())
      .filter((l) => l.owner_id !== ctx.account)
      .filter((l) => (intent.tokenId ? l.token_id === intent.tokenId : true))
      .filter((l) => (intent.tier !== undefined ? l.tier >= intent.tier : true))
      .filter((l) => (want ? BigInt(l.list_price) <= want : true))
      .sort((a, b) => (BigInt(a.list_price) < BigInt(b.list_price) ? -1 : 1));
    const l = listings[0];
    if (!l)
      return {
        title: "Nothing on the market matches",
        checks: [{ ok: false, text: `No Keeper listed${intent.tokenId ? ` as #${intent.tokenId}` : ""}${intent.tier !== undefined ? ` at ${TIERS[intent.tier]} or better` : ""}${want ? ` under ${ag.formatAsset(want, "NEAR")}` : ""}` }],
      };
    const price = BigInt(l.list_price);
    const room = (s: Seat) => min(BigInt(s.policy?.per_tx_max ?? "0"), BigInt(s.left_today), BigInt(s.balance));
    const pick = byName(intent.agent) ?? buyers.find(({ s }) => room(s) >= price && !s.paused) ?? buyers[0];
    const s = pick.s;
    const checks: Check[] = [
      { ok: true, text: `Keeper #${l.token_id} (${l.tier_name}) listed at ${ag.formatAsset(price, "NEAR")}` },
      { ok: price <= BigInt(s.policy?.per_tx_max ?? "0"), text: `Cap per purchase ${ag.formatAsset(s.policy?.per_tx_max ?? "0", "NEAR")}` },
      { ok: price <= BigInt(s.left_today), text: `Left today ${ag.formatAsset(s.left_today, "NEAR")}` },
      { ok: price <= BigInt(s.balance), text: `Budget ${ag.formatAsset(s.balance, "NEAR")}` },
      ...live(s),
    ];
    const allOk = checks.every((c) => c.ok);
    return {
      title: `${nameFor(s, pick.job)} buys Keeper #${l.token_id} for ${ag.formatAsset(price, "NEAR")}`,
      agent: s.seat_id,
      checks,
      forceable: !allOk && ctx.runnerUp && !!s.agent_key,
      go: async () => {
        const r = await ag.runnerAct(s.seat_id, { action: "buy", token_id: l.token_id, listing_id: l.listing_id, price: l.list_price });
        return {
          ok: r.ok,
          tx: r.tx,
          text: r.ok ? `Bought Keeper #${l.token_id}: it is in your wallet.` : "The contract refused or the purchase failed. It is in the agent's log.",
        };
      },
    };
  }

  // pay
  const payers = runnable.filter(({ s }) => s.kind === "Payer");
  if (!payers.length)
    return { title: "No payer agent yet", checks: [{ ok: false, text: "Create a Subscriptions, Allowance or Payroll agent first" }] };
  const amount = ag.parseAsset(intent.amount, "USDC");
  if (!amount) return { title: "Unreadable amount", checks: [{ ok: false, text: intent.amount }] };
  const pick =
    byName(intent.agent) ?? payers.find(({ s }) => s.policy?.payees.includes(intent.payee)) ?? payers[0];
  const s = pick.s;
  const checks: Check[] = [
    {
      ok: !!s.policy?.payees.includes(intent.payee),
      text: s.policy?.payees.includes(intent.payee)
        ? `${shortAccount(intent.payee)} is on the agent's list`
        : `${shortAccount(intent.payee)} is NOT on the agent's list`,
    },
    { ok: amount <= BigInt(s.policy?.per_tx_max ?? "0"), text: `Cap per payment ${ag.formatAsset(s.policy?.per_tx_max ?? "0", "USDC")}` },
    { ok: amount <= BigInt(s.left_today), text: `Left today ${ag.formatAsset(s.left_today, "USDC")}` },
    { ok: amount <= BigInt(s.balance), text: `Budget ${ag.formatAsset(s.balance, "USDC")}` },
    ...live(s),
  ];
  const allOk = checks.every((c) => c.ok);
  return {
    title: `${nameFor(s, pick.job)} pays ${ag.formatAsset(amount, "USDC")} to ${shortAccount(intent.payee)}${intent.memo ? ` for ${intent.memo}` : ""}`,
    agent: s.seat_id,
    checks,
    forceable: !allOk && ctx.runnerUp && !!s.agent_key,
    go: async () => {
      const r = await ag.runnerAct(s.seat_id, { action: "pay", payee: intent.payee, amount: amount.toString(), memo: intent.memo });
      return {
        ok: r.ok,
        tx: r.tx,
        text: r.ok ? "Paid. No wallet signature: the agent's key signed it." : "Blocked by the contract. Nothing moved; the attempt is in the agent's log.",
      };
    },
  };
}

function AskBar({
  account,
  seats,
  jobs,
  runnerUp,
  pauseAll,
  onDone,
  inputRef,
}: {
  account: string;
  seats: Seat[];
  jobs: Job[];
  runnerUp: boolean;
  pauseAll: () => Promise<string>;
  onDone: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);

  async function ask(sentence = text) {
    setBusy(true);
    setResult(null);
    try {
      setPlan(await planFor(parseAsk(sentence), { account, seats, jobs, runnerUp, pauseAll }));
    } catch (e) {
      setPlan({ title: "Could not prepare this", checks: [{ ok: false, text: (e as Error).message }] });
    } finally {
      setBusy(false);
    }
  }
  async function go() {
    if (!plan?.go) return;
    setBusy(true);
    try {
      setResult(await plan.go());
      setPlan(null);
      onDone();
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  const allOk = plan?.checks.every((c) => c.ok) ?? false;

  return (
    <section className="ag-ask" aria-label="Ask your agents">
      <form
        className="ag-ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <Sparkles aria-hidden="true" className="ag-ask-icon" />
        <input
          ref={inputRef}
          className="ag-ask-input"
          aria-label="Ask your agents"
          placeholder="Ask your agents… buy a holo Keeper under 1 NEAR · pay 2 USDC to shop.testnet · pause all"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="primary" icon={CornerDownLeft} busy={busy && !plan} disabled={!text.trim()}>
          Ask
        </Button>
      </form>
      <div className="ag-chips">
        {EXAMPLES.slice(0, 4).map((e) => (
          <button
            key={e}
            type="button"
            className="ag-chip"
            onClick={() => {
              setText(e);
              void ask(e);
            }}
          >
            {e}
          </button>
        ))}
      </div>
      {plan && (
        <div className="ag-plan" role="status">
          <strong>{plan.title}</strong>
          {plan.checks.length > 0 && (
            <ul className="ag-checks">
              {plan.checks.map((c) => (
                <li key={c.text} data-ok={c.ok}>
                  {c.ok ? <CircleCheck aria-hidden="true" /> : <CircleX aria-hidden="true" />}
                  {c.text}
                </li>
              ))}
            </ul>
          )}
          {plan.info}
          <div className="ag-buttons">
            {plan.go && allOk && (
              <Button variant="primary" icon={Zap} busy={busy} onClick={() => void go()}>
                Go, no signature
              </Button>
            )}
            {plan.go && !allOk && plan.forceable && (
              <Button variant="danger" busy={busy} onClick={() => void go()}>
                Send anyway: watch the contract block it
              </Button>
            )}
            <Button variant="ghost" onClick={() => setPlan(null)}>
              Cancel
            </Button>
          </div>
          <p className="ag-muted">
            These checks read the agent's limits from chain. The contract checks them again when the agent acts.
          </p>
        </div>
      )}
      {result && (
        <Notice tone={result.ok ? "success" : "error"} title={result.ok ? "Done by your agent" : "Not done"}>
          {result.text}{" "}
          {result.tx && (
            <a href={ag.txLink(result.tx)} target="_blank" rel="noreferrer">
              View transaction
            </a>
          )}
        </Notice>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// /agents — the Agent Wallet
// ---------------------------------------------------------------------------

type FeedItem = LogEntry & { seat: Seat };

/**
 * Folds runs of identical entries (same agent, action, result, amount,
 * counterparty and reason) into one, newest first, with a count and the time
 * of the oldest. A blocked retry loop reads as one line "×22", not 22.
 */
function collapse<T extends LogEntry & { seat?: Seat }>(list: T[]): (T & { count: number; firstAt: string })[] {
  const out: (T & { count: number; firstAt: string })[] = [];
  for (const e of list) {
    const prev = out.at(-1);
    if (
      prev &&
      prev.seat?.seat_id === e.seat?.seat_id &&
      prev.action === e.action &&
      prev.status === e.status &&
      prev.amount === e.amount &&
      prev.counterparty === e.counterparty &&
      prev.detail === e.detail
    ) {
      prev.count++;
      prev.firstAt = e.at;
    } else out.push({ ...e, count: 1, firstAt: e.at });
  }
  return out;
}

export function AgentsPage({ wallet, navigate }: { wallet: Wallet; navigate: Nav }) {
  /** `?as=<account>` shows someone's Agent Wallet read-only, with no wallet connected. */
  const viewAs = new URLSearchParams(location.search).get("as")?.trim().toLowerCase() || "";
  const readOnly = !wallet.account && /^[a-z0-9._-]{2,64}$/.test(viewAs);
  const account = wallet.account || (readOnly ? viewAs : "");
  const [seats, setSeats] = useState<Seat[] | null>(null);
  const [owners, setOwners] = useState<Record<string, string | null>>({});
  const [feed, setFeed] = useState<(FeedItem & { count: number; firstAt: string })[]>([]);
  const [refund, setRefund] = useState({ near: "0", usdc: "0" });
  const [error, setError] = useState("");
  const runner = useRunner(account);
  const askRef = useRef<HTMLInputElement>(null);
  const [focus, setFocus] = useState(0);
  const [tab, setTab] = useState<"activity" | "roles">("activity");
  const [lastAt, setLastAt] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!account) return;
    try {
      const list = await ag.seatsForOwner(account);
      setSeats(list);
      setRefund(await ag.refundOf(account));
      const o: Record<string, string | null> = {};
      const logs: FeedItem[] = [];
      const latest: Record<string, string> = {};
      await Promise.all(
        list.map(async (s) => {
          o[s.seat_id] = await ag.nftOwner(s.nft_contract, s.token_id).catch(() => null);
          const seatEntries = await ag.seatLog(s.seat_id);
          const last = seatEntries.find((e) => e.status !== "info");
          if (last) latest[s.seat_id] = last.at;
          for (const e of seatEntries) if (e.status !== "pending") logs.push({ ...e, seat: s });
        }),
      );
      setOwners(o);
      setLastAt(latest);
      setFeed(collapse(logs.sort((a, b) => (BigInt(b.at) > BigInt(a.at) ? 1 : -1))).slice(0, 20));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
    void runner.reload();
  }, [account, runner.reload]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);
  const { busy, run, notice } = useAction(load);
  const images = useImages((seats ?? []).map((s) => ({ key: s.seat_id, contract: s.nft_contract, token: s.token_id })));

  const totals = useMemo(() => {
    const t = { near: 0n, usdc: 0n, todayNear: 0n, todayUsdc: 0n, done: 0, refused: 0, active: 0 };
    for (const s of seats ?? []) {
      if (s.asset === "NEAR") (t.near += BigInt(s.balance)), (t.todayNear += BigInt(s.spent_today));
      else (t.usdc += BigInt(s.balance)), (t.todayUsdc += BigInt(s.spent_today));
      t.done += s.done;
      t.refused += s.refused;
      if (statusOf(s, runner.jobs.find((j) => j.seatId === s.seat_id), owners[s.seat_id] ?? null, runner.up).live) t.active++;
    }
    return t;
  }, [seats, runner.jobs, runner.up, owners]);

  /** Kill switch: agent keys pause their own seats (no wallet); seats without a runner key go in one wallet tx. */
  const pauseAll = useCallback(async () => {
    const running = (seats ?? []).filter((s) => !s.paused);
    const viaRunner = running.filter((s) => runner.up && runner.jobs.some((j) => j.seatId === s.seat_id));
    const viaWallet = running.filter((s) => !viaRunner.includes(s));
    await Promise.all(viaRunner.map((s) => ag.runnerPause(s.seat_id)));
    if (viaWallet.length) await ag.pauseMany(viaWallet);
    await load();
    return `Paused ${running.length} agent${running.length === 1 ? "" : "s"}${viaRunner.length ? `, ${viaRunner.length} with no wallet signature` : ""}.`;
  }, [seats, runner.up, runner.jobs, load]);

  if (!account)
    return (
      <div className="ag-page">
        <section className="ag-hero">
          <p className="kp-eyebrow">Agent Wallet</p>
          <h1>Give an AI a card, not your wallet.</h1>
          <p className="kp-lede">
            Put an agent on any NFT you own: a collector, a subscription payer, an allowance. Each one spends only its
            own budget, inside limits the contract enforces. Call it any time; sell the NFT and it stops.
          </p>
        </section>
        <ConnectFirst wallet={wallet} what="open your Agent Wallet" />
        <p className="ag-muted">
          No wallet?{" "}
          <a
            href={`/agents?as=${ag.DEMO_ACCOUNT}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/agents?as=${ag.DEMO_ACCOUNT}`);
            }}
          >
            See a live Agent Wallet on testnet, read-only
          </a>
          .
        </p>
        <RoleGallery navigate={navigate} />
      </div>
    );

  const focused = seats && seats.length ? seats[Math.min(focus, seats.length - 1)] : null;
  const focusedJob = focused ? runner.jobs.find((j) => j.seatId === focused.seat_id) : undefined;
  const focusedStatus = focused ? statusOf(focused, focusedJob, owners[focused.seat_id] ?? null, runner.up) : null;
  const focusedCap = BigInt(focused?.policy?.per_day_max ?? "0");
  const focusedPct = focused && focusedCap > 0n ? Number((BigInt(focused.spent_today) * 100n) / focusedCap) : 0;

  return (
    <div className="ag-page">
      {readOnly && (
        <Notice tone="info" title={`Viewing ${shortAccount(account)}'s Agent Wallet, read-only`}>
          Everything below is read live from chain. Connect your wallet to hire your own agents.
        </Notice>
      )}
      {error && (
        <Notice tone="error" title="Could not read the agents contract">
          {error}
        </Notice>
      )}
      {!readOnly && runner.checked && !runner.up && (
        <Notice tone="info" title="The agent runner is offline">
          Agents only act while it runs: <code>npm run agent:runner</code>. Budgets and limits stay safe on chain.
        </Notice>
      )}
      {notice}
      {!readOnly && (refund.near !== "0" || refund.usdc !== "0") && (
        <Notice tone="info" title="Money set aside for you">
          From agents on NFTs you sold: {ag.formatAsset(refund.near, "NEAR")} and {ag.formatAsset(refund.usdc, "USDC")}.{" "}
          <Button variant="ghost" busy={busy === "refund"} onClick={() => run("refund", "Sent to your wallet", ag.withdrawRefund)}>
            Withdraw
          </Button>
        </Notice>
      )}

      <section className="ag-stage" aria-label="Agent Wallet">
        <div className="ag-room" aria-hidden="true" />

        <header className="ag-stage-head">
          <div className="ag-stage-title">
            <span className="ag-mark" aria-hidden="true">
              <Bot />
            </span>
            <div>
              <h1>Agent Wallet</h1>
              <p className="ag-muted">{shortAccount(account)}</p>
            </div>
          </div>
          <div className="ag-stage-total">
            <span className="ag-muted">Your agents control</span>
            <strong className="kp-num">
              {ag.formatAsset(totals.near, "NEAR")} <span>+</span> {ag.formatAsset(totals.usdc, "USDC")}
            </strong>
            <span className="ag-muted">
              {totals.active} of {seats?.length ?? 0} active, {totals.done} done, {totals.refused} blocked by their limits
            </span>
          </div>
          {!readOnly && (
            <div className="ag-stage-actions">
              <Badge tone={runner.up ? "up" : runner.checked ? "down" : "neutral"} icon={Zap}>
                {runner.up ? "Runner online" : runner.checked ? "Runner offline" : "Checking runner"}
              </Badge>
              <Button
                variant="danger"
                icon={OctagonPause}
                busy={busy === "pauseall"}
                disabled={!seats?.some((s) => !s.paused) || busy !== ""}
                onClick={() => run("pauseall", "All agents paused", pauseAll)}
              >
                Pause all
              </Button>
            </div>
          )}
        </header>

        {!readOnly && (
          <div className="ag-stage-ask">
            <AskBar
              account={account}
              seats={seats ?? []}
              jobs={runner.jobs}
              runnerUp={runner.up}
              pauseAll={pauseAll}
              onDone={() => void load()}
              inputRef={askRef}
            />
          </div>
        )}

        {seats === null ? (
          <Skeleton label="Loading your agents" />
        ) : seats.length === 0 ? (
          <div className="ag-stage-empty">
            <p>{readOnly ? "This wallet has no agent yet." : "No agent yet. Hire one and put it on any NFT you own."}</p>
            {!readOnly && (
              <Button variant="primary" icon={Plus} onClick={() => navigate("/agents/new")}>
                Hire an agent
              </Button>
            )}
          </div>
        ) : (
          <Carousel label="Your agents" focus={focus} onFocus={setFocus}>
            {[
              ...seats.map((s) => {
                const job = runner.jobs.find((j) => j.seatId === s.seat_id);
                const role = roleFor(s, job);
                const st = statusOf(s, job, owners[s.seat_id] ?? null, runner.up);
                const Icon = role.icon;
                const collection = collectionLabel(s.nft_contract);
                return (
                  <a
                    key={s.seat_id}
                    href={`/agents/${s.seat_id}`}
                    className="ag-pcard"
                    data-live={st.live}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/agents/${s.seat_id}`);
                    }}
                  >
                    <NftArt src={images[s.seat_id]} label={`${collection} #${s.token_id}`} />
                    <span className="ag-pcard-status" data-tone={st.tone}>
                      {st.label}
                    </span>
                    <div className="ag-pcard-info">
                      <div className="ag-pcard-who">
                        <span className="ag-avatar">
                          <Icon aria-hidden="true" />
                        </span>
                        <span className="ag-pcard-role">
                          <small>{role.name}</small>
                          <span>
                            {collection} #{s.token_id.length > 10 ? `${s.token_id.slice(0, 8)}…` : s.token_id}
                          </span>
                        </span>
                        <time className="kp-num">{lastAt[s.seat_id] ? ago(lastAt[s.seat_id]) : "new"}</time>
                      </div>
                      <h3>{nameFor(s, job)}</h3>
                      <p className="ag-tags">
                        #{s.kind.toLowerCase()} #{s.asset.toLowerCase()} #{slug(collection)}
                      </p>
                      <div className="ag-pcard-stats">
                        <span>
                          <small>Status</small> {st.label}
                        </span>
                        <span>
                          <small>Budget</small>
                          <b className="kp-num">{ag.formatAsset(s.balance, s.asset)}</b>
                        </span>
                      </div>
                    </div>
                  </a>
                );
              }),
              ...(!readOnly
                ? [
                    <button key="new" type="button" className="ag-pcard ag-pcard--new" onClick={() => navigate("/agents/new")}>
                      <Plus aria-hidden="true" />
                      <strong>Hire an agent</strong>
                      <span>Collector, subscriptions, allowance, payroll</span>
                    </button>,
                  ]
                : []),
            ]}
          </Carousel>
        )}

        {focused && focus < (seats?.length ?? 0) && focusedStatus && (
          <div className="ag-focusbar" aria-live="polite">
            <div className="ag-focusbar-text">
              <strong>{nameFor(focused, focusedJob)}</strong>
              <span className="ag-muted">{focusedStatus.note}</span>
              <div className="ag-meter" aria-label={`Spent today: ${focusedPct}% of the daily cap`}>
                <span style={{ width: `${Math.min(100, focusedPct)}%` }} />
              </div>
              <span className="ag-muted kp-num">
                {ag.formatAsset(focused.spent_today, focused.asset)} of {ag.formatAsset(focusedCap, focused.asset)} today
              </span>
            </div>
            <div className="ag-buttons">
              <Button variant="secondary" onClick={() => navigate(`/agents/${focused.seat_id}`)}>
                Open
              </Button>
              {!readOnly && (
                <>
                  <Button
                    variant="ghost"
                    icon={Sparkles}
                    onClick={() => {
                      askRef.current?.focus();
                      askRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
                    }}
                  >
                    Ask
                  </Button>
                  {focused.paused ? (
                    <Button
                      variant="ghost"
                      icon={CirclePlay}
                      busy={busy === `r${focused.seat_id}`}
                      disabled={busy !== "" || !focused.policy}
                      onClick={() => run(`r${focused.seat_id}`, "Resumed", () => ag.resumeSeat(focused))}
                    >
                      Resume
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      icon={CirclePause}
                      busy={busy === `p${focused.seat_id}`}
                      disabled={busy !== ""}
                      onClick={() =>
                        run(
                          `p${focused.seat_id}`,
                          focusedJob && runner.up ? "Paused by the agent's own key, no wallet" : "Paused",
                          () => (focusedJob && runner.up ? ag.runnerPause(focused.seat_id) : ag.pauseSeat(focused)),
                        )
                      }
                    >
                      Pause
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <nav className="ag-pills" aria-label="Agent Wallet sections">
          <button type="button" aria-pressed={tab === "activity"} onClick={() => setTab("activity")}>
            Activity
          </button>
          <button type="button" aria-pressed={tab === "roles"} onClick={() => setTab("roles")}>
            Roles
          </button>
          {!readOnly && (
            <button type="button" onClick={() => navigate("/agents/new")}>
              Hire
            </button>
          )}
        </nav>
      </section>

      {tab === "activity" ? (
        <section className="kp-vault-section" aria-labelledby="ag-feed">
          <h2 id="ag-feed">Activity</h2>
          {feed.length === 0 ? (
            <p className="ag-muted">Nothing yet. Every action, and every attempt the contract blocked, shows up here.</p>
          ) : (
            <ol className="ag-feed">
              {feed.map((e) => {
                const job = runner.jobs.find((j) => j.seatId === e.seat.seat_id);
                return (
                  <li key={`${e.seat.seat_id}-${e.seq}`} data-status={e.status}>
                    <span className="ag-feed-dot" aria-hidden="true" />
                    <div>
                      <strong>{nameFor(e.seat, job)}</strong> {verb(e)}
                      {e.amount !== "0" && <span className="kp-num"> {ag.formatAsset(e.amount, e.seat.asset)}</span>}
                      {e.counterparty && e.action !== "deliver" && (
                        <span>
                          {" "}
                          {e.action === "buy" ? "on" : e.action === "claim" ? "from" : "to"} {shortAccount(e.counterparty)}
                        </span>
                      )}
                      {e.status === "refused" && <span className="ag-blocked"> blocked: {e.detail}</span>}
                      {e.count > 1 && <span className="ag-times">×{e.count}</span>}
                      <small className="ag-muted"> {ago(e.at)}</small>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ) : (
        <RoleGallery navigate={navigate} />
      )}
    </div>
  );
}

/**
 * Horizontal, snap-to-center carousel. The card nearest the middle is the
 * focused one (bigger, lit); its neighbours step back. Arrow keys and the
 * side buttons move one card; clicking a side card centres it first.
 */
function Carousel({
  label,
  focus,
  onFocus,
  children,
}: {
  label: string;
  focus: number;
  onFocus: (i: number) => void;
  children: ReactNode[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let dist = Infinity;
    Array.from(el.children).forEach((c, i) => {
      const h = c as HTMLElement;
      const d = Math.abs(h.offsetLeft + h.offsetWidth / 2 - mid);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    onFocus(best);
  }, [onFocus]);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!started.current && el && children.length > 2) {
      started.current = true;
      const mid = el.children[Math.floor((children.length - 1) / 2)] as HTMLElement | undefined;
      if (mid) el.scrollLeft = mid.offsetLeft + mid.offsetWidth / 2 - el.clientWidth / 2;
    }
    measure();
  }, [children.length, measure]);
  const go = (i: number) => {
    const el = ref.current;
    const c = el?.children[Math.max(0, Math.min(i, children.length - 1))] as HTMLElement | undefined;
    if (!el || !c) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - el.clientWidth / 2, behavior: reduce ? "auto" : "smooth" });
  };
  return (
    <div className="ag-carousel-wrap">
      <button type="button" className="ag-nav ag-nav--prev" aria-label="Previous agent" disabled={focus === 0} onClick={() => go(focus - 1)}>
        ‹
      </button>
      <div
        ref={ref}
        className="ag-carousel"
        role="list"
        aria-label={label}
        tabIndex={0}
        onScroll={() => {
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(measure);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            go(focus + 1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            go(focus - 1);
          }
        }}
      >
        {children.map((c, i) => (
          <div
            key={i}
            role="listitem"
            className="ag-slide"
            data-focus={i === focus}
            data-near={Math.abs(i - focus) === 1}
            onClickCapture={(e) => {
              if (i !== focus) {
                e.preventDefault();
                e.stopPropagation();
                go(i);
              }
            }}
          >
            {c}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="ag-nav ag-nav--next"
        aria-label="Next agent"
        disabled={focus >= children.length - 1}
        onClick={() => go(focus + 1)}
      >
        ›
      </button>
    </div>
  );
}

function verb(e: LogEntry) {
  if (e.status === "refused") return `tried to ${e.action}`;
  if (e.status === "failed") return `${e.action} failed`;
  switch (e.action) {
    case "pay":
      return "paid";
    case "buy":
      return e.detail.startsWith("bought") ? e.detail : "bought";
    case "deliver":
      return `delivered ${e.detail} to your wallet`;
    case "fund":
      return "was funded";
    case "withdraw":
      return "sent its budget back";
    case "create":
      return "was hired";
    case "key":
      return e.detail === "agent key set" ? "got its key" : "lost its key";
    case "pause":
      return "was paused";
    case "resume":
      return "was resumed";
    case "policy":
      return "got new limits";
    case "reset":
      return `was reset (${e.detail})`;
    case "claim":
      return "changed owner";
    default:
      return e.detail || e.action;
  }
}

function RoleGallery({ navigate }: { navigate: Nav }) {
  return (
    <section className="kp-vault-section" aria-labelledby="ag-roles">
      <h2 id="ag-roles">Roles you can hire</h2>
      <div className="ag-roles">
        {ROLES.map((r) => {
          const Icon = r.icon;
          return (
            <button key={r.id} type="button" className="ag-role" onClick={() => navigate(`/agents/new?role=${r.id}`)}>
              <Icon aria-hidden="true" />
              <strong>{r.name}</strong>
              <span>{r.tagline}</span>
              <small className="ag-muted">{r.kind === "Buyer" ? "Spends NEAR on the Keepers market" : "Pays in USDC to a list you set"}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// /agents/new — hire an agent: role, NFT, limits, two signatures
// ---------------------------------------------------------------------------

type Draft = {
  name: string;
  perTx: string;
  perDay: string;
  budget: string;
  payees: string;
  maxPrice: string;
  minTier: string;
  amount: string;
  every: string;
  unit: Unit;
};
const draftFor = (r: Role): Draft => ({
  name: "",
  perTx: r.defaults.perTx,
  perDay: r.defaults.perDay,
  budget: r.defaults.budget,
  payees: "",
  maxPrice: r.defaults.maxPrice ?? "",
  minTier: String(r.defaults.minTier ?? 0),
  amount: r.defaults.amount ?? "",
  every: String(r.defaults.every ?? 1),
  unit: r.defaults.unit ?? "days",
});

export function NewAgentPage({ wallet, navigate }: { wallet: Wallet; navigate: Nav }) {
  const account = wallet.account;
  const initial = roleOf(new URLSearchParams(location.search).get("role") ?? undefined) ?? ROLES[0];
  const [role, setRole] = useState<Role>(initial);
  const [d, setD] = useState<Draft>(draftFor(initial));
  const [nfts, setNfts] = useState<OwnedNft[] | null>(null);
  const [taken, setTaken] = useState<Record<string, boolean>>({});
  const [pick, setPick] = useState<OwnedNft | null>(null);
  const [custom, setCustom] = useState({ contract: "", token: "" });
  const [usdc, setUsdc] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<"form" | "creating" | "funding" | "done">("form");
  const [seat, setSeat] = useState<Seat | null>(null);
  const [error, setError] = useState("");

  const [minting, setMinting] = useState(false);

  /** Loads the user's NFTs; `prefer` selects a token right after it was minted. */
  const loadNfts = useCallback(
    async (prefer?: { contract: string; token: string }) => {
      if (!account) return;
      const all = await Promise.all(ag.COLLECTIONS.map((c) => ag.nftsIn(c.id, c.label, account)));
      const list = all.flat();
      setNfts(list);
      const t: Record<string, boolean> = {};
      await Promise.all(
        list.map(async (n) => (t[`${n.contract}:${n.token_id}`] = !!(await ag.seatForNft(n.contract, n.token_id).catch(() => null)))),
      );
      setTaken(t);
      const preferred = prefer && list.find((n) => n.contract === prefer.contract && n.token_id === prefer.token);
      setPick((p) => preferred ?? p ?? list.find((n) => !t[`${n.contract}:${n.token_id}`]) ?? null);
    },
    [account],
  );
  useEffect(() => {
    if (!account) return;
    void loadNfts();
    void ag.usdcBalance(account).then(setUsdc, () => setUsdc(0n));
  }, [account, loadNfts]);

  async function mintTestNft() {
    setMinting(true);
    setError("");
    try {
      const token = await ag.mintExampleNft(account);
      await loadNfts({ contract: ag.EXAMPLE_NFT, token });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMinting(false);
    }
  }
  const images = useImages((nfts ?? []).map((n) => ({ key: `${n.contract}:${n.token_id}`, contract: n.contract, token: n.token_id })));

  const asset = ag.assetOf(role.kind);
  const perTx = ag.parseAsset(d.perTx, asset);
  const perDay = ag.parseAsset(d.perDay, asset);
  const budget = ag.parseAsset(d.budget, asset);
  const payees = d.payees.split(/[\s,]+/).filter(Boolean);
  const maxPrice = ag.parseAsset(d.maxPrice, "NEAR");
  const amount = ag.parseAsset(d.amount, "USDC");
  const every = Number(d.every);
  /** Splitter: the bill is shared equally; others: the amount goes to each payee. */
  const perPayee = role.id === "splitter" && amount && payees.length ? amount / BigInt(payees.length) : amount;

  // Each payee must exist and be registered on USDC, or every payment would fail.
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const payeeKey = payees.join(",");
  useEffect(() => {
    if (role.kind !== "Payer") return;
    const t = setTimeout(() => {
      for (const p of payeeKey.split(",").filter(Boolean))
        if (!(p in ready)) void ag.usdcReady(p).then((ok) => setReady((r) => ({ ...r, [p]: ok })));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payeeKey, role.kind]);
  const notReady = payees.filter((p) => ready[p] === false);

  // Never start with a USDC budget above what the user holds.
  useEffect(() => {
    if (asset !== "USDC" || usdc === null) return;
    const b = ag.parseAsset(d.budget, "USDC");
    if (b !== null && b > usdc) setD((x) => ({ ...x, budget: ag.formatAsset(usdc, "USDC").split(" ")[0] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usdc, role.id]);

  const problems = [
    !pick ? "Pick the NFT that will carry the agent." : "",
    pick && taken[`${pick.contract}:${pick.token_id}`] ? "This NFT already has an agent." : "",
    !perTx || perTx <= 0n ? "Set the cap per action." : "",
    !perDay || (perTx && perDay < perTx) ? "The daily cap must be at least the cap per action." : "",
    budget === null ? "Set the budget." : "",
    asset === "USDC" && budget && usdc !== null && budget > usdc ? `You hold ${ag.formatAsset(usdc, "USDC")}: lower the budget.` : "",
    role.kind === "Payer" && (payees.length === 0 || payees.length > 10) ? "Add 1 to 10 accounts to pay." : "",
    role.payees === "one" && payees.length > 1 ? "This role pays one account." : "",
    notReady.length
      ? `${notReady.join(", ")} cannot receive USDC (the account does not exist or is not registered on USDC). Check the spelling.`
      : "",
    role.kind === "Payer" && (!perPayee || !(every >= 1)) ? "Set the amount and how often." : "",
    role.kind === "Payer" && perPayee && perTx && perPayee > perTx ? "Each payment is above the cap per action." : "",
    role.kind === "Buyer" && !maxPrice ? "Set the highest price per card." : "",
  ].filter(Boolean);

  const summary =
    role.kind === "Buyer"
      ? `${d.name || role.name} will buy Keepers${Number(d.minTier) > 0 ? ` (${TIERS[Number(d.minTier)]} or better)` : ""} listed under ${d.maxPrice || "?"} NEAR, at most ${d.perTx} NEAR per card and ${d.perDay} NEAR a day, from a ${d.budget} NEAR budget.`
      : `${d.name || role.name} will pay ${perPayee ? ag.formatAsset(perPayee, "USDC") : "?"} to ${payees.length ? payees.map(shortAccount).join(", ") : "?"} every ${d.every} ${d.unit}, never more than ${d.perTx} USDC at once or ${d.perDay} USDC a day, from a ${d.budget} USDC budget.`;

  async function hire() {
    setError("");
    try {
      let s = seat;
      if (!s) {
        setPhase("creating");
        const policy: Policy = {
          per_tx_max: perTx!.toString(),
          per_day_max: perDay!.toString(),
          payees: role.kind === "Payer" ? payees : [],
          market: role.kind === "Buyer" ? ag.MARKET : null,
        };
        const id = await ag.createSeat(pick!.contract, pick!.token_id, role.kind, policy);
        if (!id) throw new Error("The contract could not confirm you own this NFT. Your 0.1 NEAR was returned.");
        s = await ag.getSeat(id);
        setSeat(s);
      }
      setPhase("funding");
      const publicKey = await ag.runnerNewKey(account);
      await ag.fundAndGrant(s!, budget ?? 0n, publicKey);
      await ag.runnerSaveJob({
        seatId: s!.seat_id,
        accountId: account,
        publicKey,
        kind: role.kind,
        role: role.id,
        name: d.name.trim() || undefined,
        buyer: role.kind === "Buyer" ? { maxPrice: maxPrice!.toString(), minTier: Number(d.minTier) } : undefined,
        payer:
          role.kind === "Payer"
            ? {
                payments: payees.map((p) => ({
                  payee: p,
                  amount: perPayee!.toString(),
                  everySeconds: every * UNIT_SECONDS[d.unit],
                  memo: role.name.toLowerCase(),
                })),
              }
            : undefined,
      });
      setPhase("done");
      navigate(`/agents/${s!.seat_id}`);
    } catch (e) {
      setError((e as Error).message);
      setPhase("form");
    }
  }

  if (!account) return <ConnectFirst wallet={wallet} what="hire an agent" />;
  const busy = phase === "creating" || phase === "funding";
  const RoleIcon = role.icon;

  return (
    <div className="ag-page">
      <button type="button" className="kp-back" onClick={() => navigate("/agents")}>
        ← Agent Wallet
      </button>
      <section className="ag-hero">
        <p className="kp-eyebrow">Hire an agent</p>
        <h1>What should it do for you?</h1>
      </section>
      {error && (
        <Notice tone="error" title="Not done">
          {error}
        </Notice>
      )}

      <div className="ag-roles" role="radiogroup" aria-label="Role">
        {ROLES.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={role.id === r.id}
              className="ag-role"
              disabled={!!seat || busy}
              onClick={() => {
                setRole(r);
                setD(draftFor(r));
              }}
            >
              <Icon aria-hidden="true" />
              <strong>{r.name}</strong>
              <span>{r.tagline}</span>
            </button>
          );
        })}
      </div>

      <div className="ag-hire">
        <section className="ag-panel" aria-labelledby="ag-pick">
          <h2 id="ag-pick">Which NFT carries it?</h2>
          <p className="ag-muted">
            Any NFT you own, from any collection. It stays in your wallet; whoever owns it controls the agent.
          </p>
          {nfts === null ? (
            <Skeleton label="Looking for your NFTs" />
          ) : (
            <div className="ag-nfts">
              {nfts.map((n) => {
                const key = `${n.contract}:${n.token_id}`;
                return (
                  <button
                    type="button"
                    key={key}
                    className="ag-nft-pick"
                    aria-pressed={pick?.contract === n.contract && pick.token_id === n.token_id}
                    disabled={!!seat || busy || taken[key]}
                    onClick={() => setPick(n)}
                  >
                    <NftArt src={images[key]} label={n.title} />
                    <strong>
                      {n.label} #{n.token_id}
                    </strong>
                    {taken[key] && <span>has an agent</span>}
                  </button>
                );
              })}
              {nfts.length === 0 && <p className="ag-muted">No NFT found in the known collections. Name one below.</p>}
            </div>
          )}
          <div className="ag-mint">
            <Button icon={Sparkles} busy={minting} disabled={!!seat || busy || minting} onClick={() => void mintTestNft()}>
              Mint a free test NFT
            </Button>
            <span className="ag-muted">
              On <code>{ag.EXAMPLE_NFT}</code>, NEAR's public example collection (not ours). One signature, 0.1 NEAR
              attached; unused storage is refunded.
            </span>
          </div>
          <details className="ag-other">
            <summary>Use an NFT from another collection</summary>
            <form
              className="kp-action-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (custom.contract && custom.token)
                  setPick({ contract: custom.contract.trim(), label: shortAccount(custom.contract.trim()), token_id: custom.token.trim(), title: "", media: null });
              }}
            >
              <Input label="Collection contract" placeholder="paras-token-v2.testnet" value={custom.contract} onChange={(e) => setCustom((c) => ({ ...c, contract: e.target.value }))} />
              <Input label="Token id" placeholder="42" value={custom.token} onChange={(e) => setCustom((c) => ({ ...c, token: e.target.value }))} />
              <Button type="submit" disabled={!custom.contract || !custom.token}>
                Use it
              </Button>
            </form>
          </details>
        </section>

        <section className="ag-panel" aria-labelledby="ag-limits">
          <h2 id="ag-limits">
            <RoleIcon aria-hidden="true" className="ag-inline-icon" /> {role.name}: rules
          </h2>
          <div className="ag-form">
            <Input label="Name (optional)" placeholder={role.name} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
            {role.kind === "Buyer" ? (
              <>
                <Input label="Highest price per card (NEAR)" inputMode="decimal" value={d.maxPrice} onChange={(e) => setD({ ...d, maxPrice: e.target.value })} />
                <Select label="Lowest tier" value={d.minTier} onChange={(e) => setD({ ...d, minTier: e.target.value })}>
                  {TIERS.map((t, i) => (
                    <option key={t} value={i}>
                      {t}
                    </option>
                  ))}
                </Select>
              </>
            ) : (
              <>
                <Input
                  label={role.payeeLabel ?? "Accounts to pay"}
                  placeholder={role.payees === "one" ? "netflix.testnet" : "alice.testnet, bob.testnet"}
                  value={d.payees}
                  onChange={(e) => setD({ ...d, payees: e.target.value })}
                  hint={
                    payees.length && payees.every((p) => ready[p])
                      ? "✓ Every account can receive USDC. The contract refuses any other account."
                      : "The contract refuses any other account. Each one must exist and be registered on USDC."
                  }
                  error={notReady.length ? `${notReady.join(", ")} cannot receive USDC: check the spelling.` : undefined}
                />
                <Input
                  label={role.id === "splitter" ? "Total bill (USDC)" : role.payees === "many" ? "USDC to each" : "USDC each time"}
                  inputMode="decimal"
                  value={d.amount}
                  onChange={(e) => setD({ ...d, amount: e.target.value })}
                />
                <div className="ag-every">
                  <Input label="Every" inputMode="numeric" value={d.every} onChange={(e) => setD({ ...d, every: e.target.value })} />
                  <Select label="Unit" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value as Unit })}>
                    {(Object.keys(UNIT_SECONDS) as Unit[]).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}
            <Input label={`Cap per ${role.kind === "Buyer" ? "card" : "payment"} (${asset})`} inputMode="decimal" value={d.perTx} onChange={(e) => setD({ ...d, perTx: e.target.value })} />
            <Input label={`Cap per day (${asset})`} inputMode="decimal" value={d.perDay} onChange={(e) => setD({ ...d, perDay: e.target.value })} />
            <Input
              label={`Budget (${asset})`}
              inputMode="decimal"
              value={d.budget}
              onChange={(e) => setD({ ...d, budget: e.target.value })}
              hint={asset === "USDC" && usdc !== null ? `You hold ${ag.formatAsset(usdc, "USDC")}. Withdraw any time.` : "Yours: withdraw any time, even after selling the NFT."}
            />
          </div>
        </section>
      </div>

      <section className="ag-confirm" aria-label="Confirm">
        <p className="ag-summary">{summary}</p>
        <ol className="ag-sign-steps">
          <li data-state={seat ? "done" : phase === "creating" ? "now" : "todo"}>Signature 1: create the agent on {pick ? `${pick.label} #${pick.token_id}` : "your NFT"}, with its limits on chain (0.1 NEAR storage, refunded on close).</li>
          <li data-state={phase === "done" ? "done" : phase === "funding" ? "now" : "todo"}>
            Signature 2: fund it with {d.budget || "0"} {asset} and give it a key that can only call <code>agent_pay</code>, <code>agent_buy</code> and <code>pause</code>, with no deposit.
          </li>
          <li data-state={phase === "done" ? "done" : "todo"}>Then nothing: it works on its own. Call it any time from the Ask bar.</li>
        </ol>
        <Button variant="primary" icon={KeyRound} busy={busy} disabled={problems.length > 0 || busy} onClick={() => void hire()}>
          {seat ? "Fund and start it" : `Hire the ${role.name}`}
        </Button>
        {problems.length > 0 && !busy && (
          <p className="ag-problems" role="status">
            <CircleX aria-hidden="true" className="ag-inline-icon" /> {problems[0]}
          </p>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// /agents/:id — one agent
// ---------------------------------------------------------------------------

function SpendBars({ log, asset }: { log: LogEntry[]; asset: "NEAR" | "USDC" }) {
  const days = useMemo(() => {
    const out: { day: string; total: bigint }[] = [];
    const today = Math.floor(Date.now() / 86_400_000);
    for (let i = 6; i >= 0; i--) out.push({ day: new Date((today - i) * 86_400_000).toISOString().slice(5, 10), total: 0n });
    for (const e of log) {
      if (e.status !== "done" || (e.action !== "pay" && e.action !== "buy")) continue;
      const d = Math.floor(Number(BigInt(e.at) / 1_000_000n) / 86_400_000);
      const idx = 6 - (today - d);
      if (idx >= 0 && idx < 7) out[idx].total += BigInt(e.amount);
    }
    return out;
  }, [log]);
  const max = days.reduce((m, d) => (d.total > m ? d.total : m), 0n);
  return (
    <figure className="ag-bars" aria-label="Spent per day, last 7 days">
      {days.map((d) => (
        <div key={d.day} title={`${d.day}: ${ag.formatAsset(d.total, asset)}`}>
          <span style={{ height: `${max > 0n ? Math.max(4, Number((d.total * 100n) / max)) : 4}%` }} data-zero={d.total === 0n} />
          <small>{d.day}</small>
        </div>
      ))}
      <figcaption className="ag-muted">Spent per day, last 7 days (from the on-chain log)</figcaption>
    </figure>
  );
}

export function AgentPage({ id, wallet, navigate }: { id: string; wallet: Wallet; navigate: Nav }) {
  const account = wallet.account;
  const [seat, setSeat] = useState<Seat | null | undefined>();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [nftOwner, setNftOwner] = useState<string | null>(null);
  const [gasLeft, setGasLeft] = useState<string | null | undefined>();
  const [fund, setFund] = useState("");
  const [mission, setMission] = useState<{ maxPrice: string; amount: string; every: string } | null>(null);
  const runner = useRunner(account || seat?.owner || "");
  const job = runner.jobs.find((j) => j.seatId === id);

  const load = useCallback(async () => {
    const s = await ag.getSeat(id);
    setSeat(s);
    if (!s) return;
    setLog(await ag.seatLog(id));
    setNftOwner(await ag.nftOwner(s.nft_contract, s.token_id).catch(() => null));
    setGasLeft(s.agent_key ? await ag.keyAllowance(s.owner, s.agent_key) : undefined);
    void runner.reload();
  }, [id, runner.reload]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8_000);
    return () => clearInterval(t);
  }, [load]);
  const { busy, run, notice } = useAction(load);
  const images = useImages(seat ? [{ key: "art", contract: seat.nft_contract, token: seat.token_id }] : []);

  if (seat === undefined) return <Skeleton label="Loading the agent" />;
  if (seat === null)
    return (
      <div className="kp-empty">
        <p>No agent #{id}.</p>
        <Button onClick={() => navigate("/agents")}>Back to the Agent Wallet</Button>
      </div>
    );

  const role = roleFor(seat, job);
  const RoleIcon = role.icon;
  const mine = account === seat.owner;
  const canClaim = !!account && nftOwner === account && !mine;
  const st = statusOf(seat, job, nftOwner, runner.up);
  const cap = BigInt(seat.policy?.per_day_max ?? "0");
  const fundValue = ag.parseAsset(fund, seat.asset);
  const firstPay = job?.payer?.payments[0];
  const m = mission ?? {
    maxPrice: job?.buyer ? ag.formatAsset(job.buyer.maxPrice, "NEAR").split(" ")[0] : "",
    amount: firstPay ? ag.formatAsset(firstPay.amount, "USDC").split(" ")[0] : "",
    every: firstPay ? String(Math.round(firstPay.everySeconds / 60)) : "",
  };
  const saveMission = () =>
    run("mission", "Mission updated in the runner (no signature needed)", async () => {
      if (!job) throw new Error("This agent has no key in the runner. Give it access first.");
      const next: Job =
        seat.kind === "Buyer"
          ? { ...job, buyer: { ...job.buyer, maxPrice: ag.parseAsset(m.maxPrice, "NEAR")!.toString() } }
          : {
              ...job,
              payer: {
                payments: (seat.policy?.payees ?? []).map((p) => ({
                  payee: p,
                  amount: ag.parseAsset(m.amount, "USDC")!.toString(),
                  everySeconds: Number(m.every) * 60,
                  memo: role.name.toLowerCase(),
                })),
              },
            };
      await ag.runnerSaveJob(next);
      setMission(null);
    });
  const grant = () =>
    run("grant", "Access given: the agent can act again", async () => {
      const publicKey = await ag.runnerNewKey(seat.owner);
      const r = await ag.fundAndGrant(seat, 0n, publicKey);
      await ag.runnerSaveJob({
        seatId: seat.seat_id,
        accountId: seat.owner,
        publicKey,
        kind: seat.kind,
        role: job?.role ?? role.id,
        name: job?.name,
        buyer: job?.buyer ?? (seat.kind === "Buyer" ? { maxPrice: seat.policy?.per_tx_max ?? "0" } : undefined),
        payer: job?.payer ?? (seat.kind === "Payer" ? { payments: [] } : undefined),
      });
      return r;
    });

  return (
    <div className="ag-page">
      <button type="button" className="kp-back" onClick={() => navigate("/agents")}>
        ← Agent Wallet
      </button>
      <section className="ag-detail-head">
        <div className="ag-detail-art">
          <NftArt src={images.art} label={`${collectionLabel(seat.nft_contract)} #${seat.token_id}`} />
        </div>
        <div>
          <p className="kp-eyebrow">
            <RoleIcon aria-hidden="true" className="ag-inline-icon" /> {role.name} · {seat.kind === "Buyer" ? "spends NEAR" : "pays USDC"}
          </p>
          <h1>
            {nameFor(seat, job)} <Badge tone={st.tone}>{st.label}</Badge>
          </h1>
          <p className="ag-muted">
            Lives on{" "}
            <a href={nftHref(seat.nft_contract, seat.token_id)} target={seat.nft_contract.startsWith("keepers-") ? undefined : "_blank"} rel="noreferrer">
              {collectionLabel(seat.nft_contract)} #{seat.token_id}
            </a>{" "}
            · owner {shortAccount(seat.owner)} · {st.note}
          </p>
          <p className="ag-detail-balance kp-num">{ag.formatAsset(seat.balance, seat.asset)}</p>
          <p className="ag-muted">budget left</p>
        </div>
      </section>
      {notice}
      {canClaim && (
        <Notice tone="info" title="You own this NFT now">
          The agent still belongs to {shortAccount(seat.owner)}. Claim it to set your own rules; their budget stays theirs.{" "}
          <Button variant="primary" busy={busy === "claim"} onClick={() => run("claim", "Agent claimed", () => ag.claimSeat(seat))}>
            Claim the agent
          </Button>
        </Notice>
      )}
      {mine && nftOwner && nftOwner !== account && (
        <Notice tone="info" title="You no longer own this NFT">
          The agent is stopped. Your budget is still yours: withdraw it below.
        </Notice>
      )}

      <section className="ag-stats" aria-label="This agent">
        <Stat label="Spent today" value={ag.formatAsset(seat.spent_today, seat.asset)} sub={`daily cap ${ag.formatAsset(cap, seat.asset)}`} />
        <Stat label="Spent in total" value={ag.formatAsset(seat.spent_total, seat.asset)} />
        <Stat label="Done · blocked · failed" value={`${seat.done} · ${seat.refused} · ${seat.failed}`} />
        <Stat
          label="Gas left on its key"
          value={gasLeft ? ag.formatAsset(gasLeft, "NEAR") : seat.agent_key ? "key removed" : "no key"}
          sub={seat.agent_key ? `${seat.agent_key.slice(0, 16)}…` : undefined}
        />
      </section>

      <div className="ag-columns">
        <section className="kp-vault-section">
          <h2>Rules and mission</h2>
          <dl className="ag-dl">
            <dt>Cap per action</dt>
            <dd>{seat.policy ? ag.formatAsset(seat.policy.per_tx_max, seat.asset) : "—"}</dd>
            <dt>Cap per day</dt>
            <dd>{seat.policy ? ag.formatAsset(seat.policy.per_day_max, seat.asset) : "—"}</dd>
            {seat.kind === "Buyer" ? (
              <>
                <dt>Market</dt>
                <dd>{seat.policy?.market ? shortAccount(seat.policy.market) : "—"}</dd>
                <dt>Mission</dt>
                <dd>{job?.buyer ? `Keepers under ${ag.formatAsset(job.buyer.maxPrice, "NEAR")}${job.buyer.minTier ? `, ${TIERS[job.buyer.minTier]} or better` : ""}` : "—"}</dd>
              </>
            ) : (
              <>
                <dt>Allowed to pay</dt>
                <dd>{seat.policy?.payees.join(", ") || "—"}</dd>
                <dt>Mission</dt>
                <dd>
                  {firstPay
                    ? `${ag.formatAsset(firstPay.amount, "USDC")} to each, every ${firstPay.everySeconds >= 86400 ? `${Math.round(firstPay.everySeconds / 86400)} d` : firstPay.everySeconds >= 3600 ? `${Math.round(firstPay.everySeconds / 3600)} h` : `${Math.round(firstPay.everySeconds / 60)} min`}`
                    : "—"}
                </dd>
              </>
            )}
            <dt>Last run</dt>
            <dd>
              {job?.lastResult ? (
                <>
                  {job.lastResult.replace(/ \(tx [^)]+\)/g, "")}
                  {txIn(job.lastResult) && (
                    <>
                      {" "}
                      <a href={ag.txLink(txIn(job.lastResult)!)} target="_blank" rel="noreferrer">
                        tx
                      </a>
                    </>
                  )}
                  {job.lastRun && <span className="ag-muted"> · {ago(job.lastRun)}</span>}
                </>
              ) : job ? (
                "waiting for the next tick"
              ) : (
                "no mission"
              )}
            </dd>
          </dl>
          {mine && job && (
            <form
              className="kp-action-row"
              onSubmit={(e) => {
                e.preventDefault();
                void saveMission();
              }}
            >
              {seat.kind === "Buyer" ? (
                <Input label="Highest price per card (NEAR)" inputMode="decimal" value={m.maxPrice} onChange={(e) => setMission({ ...m, maxPrice: e.target.value })} />
              ) : (
                <>
                  <Input label="USDC each time" inputMode="decimal" value={m.amount} onChange={(e) => setMission({ ...m, amount: e.target.value })} />
                  <Input label="Every (minutes)" inputMode="numeric" value={m.every} onChange={(e) => setMission({ ...m, every: e.target.value })} />
                </>
              )}
              <Button type="submit" busy={busy === "mission"}>
                Update mission
              </Button>
            </form>
          )}
          {mine && (
            <div className="ag-buttons">
              {job && runner.up && (
                <Button icon={RefreshCw} busy={busy === "now"} disabled={busy !== ""} onClick={() => run("now", "Ran the mission once", () => ag.runnerRunNow(seat.seat_id).then(() => undefined))}>
                  Run now
                </Button>
              )}
              {!seat.paused ? (
                job && runner.up ? (
                  <Button variant="danger" icon={CirclePause} busy={busy === "stop"} disabled={busy !== ""} onClick={() => run("stop", "Stopped by the agent's own key, no wallet needed", () => ag.runnerPause(seat.seat_id))}>
                    Stop now (no wallet)
                  </Button>
                ) : (
                  <Button variant="danger" icon={CirclePause} busy={busy === "stop"} disabled={busy !== ""} onClick={() => run("stop", "Paused", () => ag.pauseSeat(seat))}>
                    Pause
                  </Button>
                )
              ) : (
                <Button variant="primary" icon={CirclePlay} busy={busy === "resume"} disabled={busy !== "" || !seat.policy} onClick={() => run("resume", "Resumed", () => ag.resumeSeat(seat))}>
                  Resume
                </Button>
              )}
              {seat.agent_key ? (
                <Button icon={Ban} busy={busy === "revoke"} disabled={busy !== ""} onClick={() => run("revoke", "Access revoked and the key deleted from your account", () => ag.revokeAccess(seat))}>
                  Revoke access
                </Button>
              ) : (
                seat.policy && (
                  <Button icon={KeyRound} busy={busy === "grant"} disabled={busy !== ""} onClick={() => void grant()}>
                    Give access
                  </Button>
                )
              )}
            </div>
          )}
        </section>

        {mine && (
          <section className="kp-vault-section">
            <h2>Budget</h2>
            <form
              className="kp-action-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (fundValue) void run("fund", "Budget added", () => ag.fundSeat(seat, fundValue));
              }}
            >
              <Input label={`Add (${seat.asset})`} inputMode="decimal" value={fund} onChange={(e) => setFund(e.target.value)} />
              <Button type="submit" busy={busy === "fund"} disabled={!fundValue || busy !== ""}>
                Add budget
              </Button>
            </form>
            <div className="ag-buttons">
              <Button icon={WalletIcon} busy={busy === "withdraw"} disabled={seat.balance === "0" || busy !== ""} onClick={() => run("withdraw", "Budget sent back to your wallet", () => ag.withdrawSeat(seat))}>
                Withdraw the budget
              </Button>
              <Button
                variant="ghost"
                icon={Trash2}
                busy={busy === "close"}
                disabled={seat.balance !== "0" || seat.in_flight > 0 || busy !== ""}
                onClick={() =>
                  run("close", "Agent closed, 0.1 NEAR storage refunded", async () => {
                    const r = await ag.closeSeat(seat);
                    await ag.runnerDelete(seat.seat_id).catch(() => {});
                    navigate("/agents");
                    return r;
                  })
                }
              >
                Close the agent
              </Button>
            </div>
            <p className="kp-hint">These need your wallet. The agent's key can do none of them.</p>
          </section>
        )}
      </div>

      <section className="kp-vault-section">
        <h2>Activity</h2>
        <SpendBars log={log} asset={seat.asset} />
        <div className="kp-table-wrap">
          <table className="kp-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Result</th>
                <th>Amount</th>
                <th>With</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {collapse(log.filter((e, i) => e.status !== "pending" || (i === 0 && seat.in_flight > 0))).map((e) => (
                <tr key={e.seq}>
                  <td>
                    {ago(e.at)}
                    {e.count > 1 && <span className="ag-muted"> → {ago(e.firstAt)}</span>}
                  </td>
                  <td>
                    {e.action}
                    {e.count > 1 && <span className="ag-times">×{e.count}</span>}
                  </td>
                  <td>
                    <Badge tone={e.status === "done" ? "up" : e.status === "refused" || e.status === "failed" ? "down" : "neutral"}>
                      {e.status === "refused" ? "blocked" : e.status}
                    </Badge>
                  </td>
                  <td className="kp-num">{e.amount !== "0" ? ag.formatAsset(e.amount, seat.asset) : ""}</td>
                  <td>{e.counterparty ? shortAccount(e.counterparty) : ""}</td>
                  <td>{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="kp-hint">
          Read live from <code>seat_log</code> on{" "}
          <a href={`${EXPLORER}/address/${ag.AGENTS}`} target="_blank" rel="noreferrer">
            {shortAccount(ag.AGENTS)}
          </a>
          : the last 50 entries. Blocked attempts are written by the contract itself.
        </p>
      </section>
    </div>
  );
}

export type { RoleId };
