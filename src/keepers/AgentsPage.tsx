import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Ban,
  Bot,
  CirclePause,
  CirclePlay,
  KeyRound,
  Plus,
  RefreshCw,
  ShoppingCart,
  Send,
  Trash2,
  Wallet as WalletIcon,
  Zap,
} from "lucide-react";
import { Badge, Button, Input, Notice, Select, Skeleton } from "../terminal/primitives";
import { EXPLORER, KEEPERS_V1, KEEPERS_V2 } from "./chain";
import { shortAccount } from "./KeeperCard";
import * as ag from "./agents";
import type { Job, Kind, LogEntry, OwnedNft, Policy, Seat } from "./agents";
import type { Wallet } from "./KeepersApp";

type Nav = (to: string) => void;
const TIERS = ["matte", "brushed", "holographic", "animated"];

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
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};
const txIn = (text?: string) => text?.match(/tx ([1-9A-HJ-NP-Za-km-z]{43,44})/)?.[1];

type Status = { label: string; tone: "up" | "down" | "neutral" | "brand"; note: string };
function statusOf(seat: Seat, job: Job | undefined, nftOwner: string | null, runnerUp: boolean): Status {
  if (nftOwner && nftOwner !== seat.owner)
    return { label: "NFT sold", tone: "down", note: "The NFT changed hands: the agent stops at its next action." };
  if (!seat.policy) return { label: "Reset", tone: "down", note: "No policy: set one to restart." };
  if (seat.paused) return { label: "Paused", tone: "neutral", note: "Resume to let the agent act again." };
  if (!seat.agent_key) return { label: "No access", tone: "neutral", note: "Give the agent access (one signature)." };
  if (!job) return { label: "No mission", tone: "neutral", note: "The runner has no mission for this seat." };
  if (!runnerUp) return { label: "Runner offline", tone: "down", note: "Start it with npm run agent:runner." };
  return { label: "Active", tone: "up", note: "The agent acts on its own, within the limits below." };
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

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="ag-stat">
      <span>{label}</span>
      <strong className="kp-num">{value}</strong>
      {sub && <small>{sub}</small>}
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
// /agents — My agents
// ---------------------------------------------------------------------------

export function AgentsPage({ wallet, navigate }: { wallet: Wallet; navigate: Nav }) {
  const account = wallet.account;
  const [seats, setSeats] = useState<Seat[] | null>(null);
  const [owners, setOwners] = useState<Record<string, string | null>>({});
  const [refund, setRefund] = useState({ near: "0", usdc: "0" });
  const [error, setError] = useState("");
  const runner = useRunner(account);
  const load = useCallback(async () => {
    if (!account) return;
    try {
      const list = await ag.seatsForOwner(account);
      setSeats(list);
      setRefund(await ag.refundOf(account));
      const o: Record<string, string | null> = {};
      await Promise.all(
        list.map(async (s) => (o[s.seat_id] = await ag.nftOwner(s.nft_contract, s.token_id).catch(() => null))),
      );
      setOwners(o);
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

  const totals = useMemo(() => {
    const t = { near: 0n, usdc: 0n, todayNear: 0n, todayUsdc: 0n, done: 0, refused: 0 };
    for (const s of seats ?? []) {
      if (s.asset === "NEAR") {
        t.near += BigInt(s.balance);
        t.todayNear += BigInt(s.spent_today);
      } else {
        t.usdc += BigInt(s.balance);
        t.todayUsdc += BigInt(s.spent_today);
      }
      t.done += s.done;
      t.refused += s.refused;
    }
    return t;
  }, [seats]);

  return (
    <div className="ag-page">
      <section className="kp-hero ag-hero">
        <p className="kp-eyebrow">My agents</p>
        <h1>Give an AI a card, not your wallet.</h1>
        <p className="kp-lede">
          Each agent lives on one of your NFTs, from any collection. It spends only its own budget, within limits the
          contract enforces. Its key cannot withdraw, change its limits or move your NFT. Sell the NFT and the agent stops.
        </p>
        <div className="kp-hero-actions">
          <Button variant="primary" icon={Plus} onClick={() => navigate("/agents/new")} disabled={!account}>
            New agent
          </Button>
          {account && (
            <Badge tone={runner.up ? "up" : runner.checked ? "down" : "neutral"} icon={Zap}>
              {runner.up ? "Runner online" : runner.checked ? "Runner offline" : "Checking runner"}
            </Badge>
          )}
        </div>
      </section>

      {!account ? (
        <ConnectFirst wallet={wallet} what="see your agents" />
      ) : (
        <>
          {error && (
            <Notice tone="error" title="Could not read the agents contract">
              {error}
            </Notice>
          )}
          {runner.checked && !runner.up && (
            <Notice tone="info" title="The agent runner is offline">
              Agents only act while the runner is up. Start it with <code>npm run agent:runner</code>. Their budgets and
              limits stay safe on chain either way.
            </Notice>
          )}
          {notice}
          {(refund.near !== "0" || refund.usdc !== "0") && (
            <Notice tone="info" title="Money set aside for you">
              From seats you no longer hold: {ag.formatAsset(refund.near, "NEAR")} and{" "}
              {ag.formatAsset(refund.usdc, "USDC")}.{" "}
              <Button
                variant="ghost"
                busy={busy === "refund"}
                onClick={() => run("refund", "Sent to your wallet", ag.withdrawRefund)}
              >
                Withdraw
              </Button>
            </Notice>
          )}

          <section className="ag-stats" aria-label="All agents">
            <Stat label="Budget left" value={ag.formatAsset(totals.near, "NEAR")} sub={ag.formatAsset(totals.usdc, "USDC")} />
            <Stat
              label="Spent today"
              value={ag.formatAsset(totals.todayNear, "NEAR")}
              sub={ag.formatAsset(totals.todayUsdc, "USDC")}
            />
            <Stat label="Actions done" value={totals.done} />
            <Stat label="Blocked by the limits" value={totals.refused} sub="refused on chain, nothing moved" />
          </section>

          {seats === null ? (
            <Skeleton label="Loading your agents" />
          ) : seats.length === 0 ? (
            <div className="kp-empty">
              <p>No agent yet. Pick one of your NFTs and give it a job.</p>
              <Button variant="primary" icon={Plus} onClick={() => navigate("/agents/new")}>
                New agent
              </Button>
            </div>
          ) : (
            <div className="kp-grid ag-grid">
              {seats.map((s) => {
                const job = runner.jobs.find((j) => j.seatId === s.seat_id);
                const st = statusOf(s, job, owners[s.seat_id] ?? null, runner.up);
                const cap = BigInt(s.policy?.per_day_max ?? "0");
                const pct = cap > 0n ? Number((BigInt(s.spent_today) * 100n) / cap) : 0;
                return (
                  <a
                    key={s.seat_id}
                    href={`/agents/${s.seat_id}`}
                    className="kp-tile ag-card"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/agents/${s.seat_id}`);
                    }}
                  >
                    <div className="ag-card-head">
                      <span className="ag-kind">
                        {s.kind === "Buyer" ? <ShoppingCart aria-hidden="true" /> : <Send aria-hidden="true" />}
                        {s.kind} #{s.seat_id}
                      </span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <p className="ag-nft">
                      on {collectionLabel(s.nft_contract)} #{s.token_id}
                    </p>
                    <div className="ag-card-nums">
                      <Stat label="Budget" value={ag.formatAsset(s.balance, s.asset)} />
                      <Stat label="Done / blocked" value={`${s.done} / ${s.refused}`} />
                    </div>
                    <div className="ag-meter" aria-label={`Spent today: ${pct}% of the daily cap`}>
                      <span style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <small className="ag-muted">
                      {ag.formatAsset(s.spent_today, s.asset)} of {ag.formatAsset(cap, s.asset)} today
                      {job?.lastRun ? ` · last run ${ago(job.lastRun)}` : ""}
                    </small>
                  </a>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// /agents/new — create, fund, give access, set the mission
// ---------------------------------------------------------------------------

type Draft = {
  kind: Kind;
  perTx: string;
  perDay: string;
  budget: string;
  payees: string;
  maxPrice: string;
  minTier: string;
  payAmount: string;
  everyMinutes: string;
};
const DEFAULTS: Record<Kind, Draft> = {
  Buyer: { kind: "Buyer", perTx: "2", perDay: "4", budget: "3", payees: "", maxPrice: "2", minTier: "0", payAmount: "", everyMinutes: "" },
  Payer: { kind: "Payer", perTx: "2", perDay: "5", budget: "10", payees: "", maxPrice: "", minTier: "0", payAmount: "1", everyMinutes: "5" },
};

export function NewAgentPage({ wallet, navigate }: { wallet: Wallet; navigate: Nav }) {
  const account = wallet.account;
  const [nfts, setNfts] = useState<OwnedNft[] | null>(null);
  const [pick, setPick] = useState<OwnedNft | null>(null);
  const [custom, setCustom] = useState({ contract: "", token: "" });
  const [taken, setTaken] = useState<Seat | null>(null);
  const [d, setD] = useState<Draft>(DEFAULTS.Buyer);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [usdc, setUsdc] = useState<bigint | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!account) return;
    void Promise.all(ag.COLLECTIONS.map((c) => ag.nftsIn(c.id, c.label, account))).then((all) => setNfts(all.flat()));
    void ag.usdcBalance(account).then(setUsdc, () => setUsdc(0n));
  }, [account]);
  useEffect(() => {
    setTaken(null);
    if (pick) void ag.seatForNft(pick.contract, pick.token_id).then(setTaken, () => {});
  }, [pick]);

  const asset = ag.assetOf(d.kind);
  const perTx = ag.parseAsset(d.perTx, asset);
  const perDay = ag.parseAsset(d.perDay, asset);
  const budget = ag.parseAsset(d.budget, asset);
  const payees = d.payees.split(/[\s,]+/).filter(Boolean);
  const maxPrice = ag.parseAsset(d.maxPrice, "NEAR");
  const payAmount = ag.parseAsset(d.payAmount, "USDC");
  const every = Number(d.everyMinutes);
  const problems = [
    !perTx || perTx <= 0n ? "Set the cap per action." : "",
    !perDay || (perTx && perDay < perTx) ? "The daily cap must be at least the cap per action." : "",
    budget === null ? "Set the budget." : "",
    asset === "USDC" && budget && usdc !== null && budget > usdc ? `You hold ${ag.formatAsset(usdc, "USDC")}.` : "",
    d.kind === "Payer" && (payees.length === 0 || payees.length > 10) ? "List 1 to 10 payees." : "",
    d.kind === "Payer" && (!payAmount || !(every >= 1)) ? "Set the payment amount and interval." : "",
    d.kind === "Buyer" && !maxPrice ? "Set the highest price per card." : "",
  ].filter(Boolean);

  const policy: Policy | null =
    perTx && perDay
      ? {
          per_tx_max: perTx.toString(),
          per_day_max: perDay.toString(),
          payees: d.kind === "Payer" ? payees : [],
          market: d.kind === "Buyer" ? ag.MARKET : null,
        }
      : null;

  async function step(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const create = () =>
    step("create", async () => {
      const nft = pick!;
      const id = await ag.createSeat(nft.contract, nft.token_id, d.kind, policy!);
      if (!id) throw new Error("The contract refused: it could not confirm you own this NFT. Your 0.1 NEAR was returned.");
      setSeat(await ag.getSeat(id));
    });

  const activate = () =>
    step("activate", async () => {
      const s = seat!;
      const publicKey = await ag.runnerNewKey(account);
      await ag.fundAndGrant(s, budget ?? 0n, publicKey);
      await ag.runnerSaveJob({
        seatId: s.seat_id,
        accountId: account,
        publicKey,
        kind: s.kind,
        buyer: s.kind === "Buyer" ? { maxPrice: maxPrice!.toString(), minTier: Number(d.minTier) } : undefined,
        payer:
          s.kind === "Payer"
            ? { payments: payees.map((p) => ({ payee: p, amount: payAmount!.toString(), everySeconds: every * 60, memo: "agent payment" })) }
            : undefined,
      });
      navigate(`/agents/${s.seat_id}`);
    });

  if (!account) return <ConnectFirst wallet={wallet} what="create an agent" />;

  const selected = pick && `${collectionLabel(pick.contract)} #${pick.token_id}`;
  return (
    <div className="ag-page">
      <section className="kp-hero ag-hero">
        <p className="kp-eyebrow">New agent</p>
        <h1>Put an agent on one of your NFTs</h1>
        <p className="kp-lede">
          Two wallet signatures in total: one creates the seat, one funds it and gives the agent its key. After that,
          the agent works with no signature from you.
        </p>
      </section>
      {error && (
        <Notice tone="error" title="Not done">
          {error}
        </Notice>
      )}

      <ol className="ag-steps">
        <li className="ag-step" data-done={!!pick}>
          <h2>1 · Pick the NFT that carries the agent</h2>
          <p className="kp-hint">
            Any NEP-171 NFT works. It stays in your wallet; the contract checks with its own collection that you own it
            before every action.
          </p>
          {nfts === null ? (
            <Skeleton label="Looking for your NFTs" />
          ) : (
            <div className="ag-nfts">
              {nfts.map((n) => (
                <button
                  type="button"
                  key={`${n.contract}:${n.token_id}`}
                  className="ag-nft-pick"
                  aria-pressed={pick?.contract === n.contract && pick.token_id === n.token_id}
                  disabled={!!seat}
                  onClick={() => setPick(n)}
                >
                  <strong>{n.label}</strong>
                  <span>#{n.token_id}</span>
                </button>
              ))}
              {nfts.length === 0 && <p className="ag-muted">No NFT found in the known collections. Use another collection below.</p>}
            </div>
          )}
          <form
            className="kp-action-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.contract && custom.token)
                setPick({ contract: custom.contract.trim(), label: shortAccount(custom.contract.trim()), token_id: custom.token.trim(), title: "", media: null });
            }}
          >
            <Input label="Other collection (contract)" placeholder="paras-token-v2.testnet" value={custom.contract} disabled={!!seat} onChange={(e) => setCustom((c) => ({ ...c, contract: e.target.value }))} />
            <Input label="Token id" placeholder="42" value={custom.token} disabled={!!seat} onChange={(e) => setCustom((c) => ({ ...c, token: e.target.value }))} />
            <Button type="submit" disabled={!!seat || !custom.contract || !custom.token}>
              Use this NFT
            </Button>
          </form>
          {taken && !seat && (
            <Notice tone="info" title="This NFT already has a seat">
              Seat #{taken.seat_id} ({taken.kind}).{" "}
              <a href={`/agents/${taken.seat_id}`} onClick={(e) => (e.preventDefault(), navigate(`/agents/${taken.seat_id}`))}>
                Open it
              </a>{" "}
              to claim or manage it.
            </Notice>
          )}
        </li>

        <li className="ag-step" data-done={!!seat} aria-disabled={!pick}>
          <h2>2 · Choose the job and its limits</h2>
          <div className="ag-kinds" role="radiogroup" aria-label="Agent type">
            {(["Buyer", "Payer"] as const).map((k) => (
              <button
                type="button"
                key={k}
                role="radio"
                aria-checked={d.kind === k}
                className="ag-kind-pick"
                disabled={!!seat}
                onClick={() => setD(DEFAULTS[k])}
              >
                {k === "Buyer" ? <ShoppingCart aria-hidden="true" /> : <Send aria-hidden="true" />}
                <strong>{k}</strong>
                <span>{k === "Buyer" ? "Buys Keepers under your price, pays in NEAR." : "Pays the accounts you list, in USDC, on a schedule."}</span>
              </button>
            ))}
          </div>
          <div className="ag-form">
            <Input label={`Cap per ${d.kind === "Buyer" ? "purchase" : "payment"} (${asset})`} inputMode="decimal" value={d.perTx} disabled={!!seat} onChange={(e) => setD({ ...d, perTx: e.target.value })} />
            <Input label={`Cap per day (${asset})`} inputMode="decimal" value={d.perDay} disabled={!!seat} onChange={(e) => setD({ ...d, perDay: e.target.value })} />
            <Input
              label={`Budget to put in (${asset})`}
              inputMode="decimal"
              value={d.budget}
              onChange={(e) => setD({ ...d, budget: e.target.value })}
              hint={asset === "USDC" && usdc !== null ? `You hold ${ag.formatAsset(usdc, "USDC")}.` : "Yours: withdraw it any time, even after selling the NFT."}
            />
            {d.kind === "Buyer" ? (
              <>
                <Input label="Mission: highest price per card (NEAR)" inputMode="decimal" value={d.maxPrice} onChange={(e) => setD({ ...d, maxPrice: e.target.value })} hint="The agent takes the cheapest Keeper listed under this price." />
                <Select label="Mission: lowest tier" value={d.minTier} onChange={(e) => setD({ ...d, minTier: e.target.value })}>
                  {TIERS.map((t, i) => (
                    <option key={t} value={i}>
                      {t}
                    </option>
                  ))}
                </Select>
              </>
            ) : (
              <>
                <Input label="Payees (allowlist, comma separated)" placeholder="shop.testnet, rent.testnet" value={d.payees} disabled={!!seat} onChange={(e) => setD({ ...d, payees: e.target.value })} hint="The contract refuses any other account. Each payee must be registered on USDC." />
                <Input label="Mission: amount per payment (USDC)" inputMode="decimal" value={d.payAmount} onChange={(e) => setD({ ...d, payAmount: e.target.value })} />
                <Input label="Mission: every (minutes)" inputMode="numeric" value={d.everyMinutes} onChange={(e) => setD({ ...d, everyMinutes: e.target.value })} />
              </>
            )}
          </div>
          {problems.length > 0 && pick && <p className="ag-problems">{problems[0]}</p>}
        </li>

        <li className="ag-step" data-done={!!seat} aria-disabled={!pick || problems.length > 0}>
          <h2>3 · Create the seat</h2>
          <p className="kp-hint">
            Signature 1. Puts the limits on chain and keeps 0.1 NEAR for storage, refunded when you close the seat.
          </p>
          {seat ? (
            <Badge tone="up">Seat #{seat.seat_id} created on {selected}</Badge>
          ) : (
            <Button variant="primary" icon={Bot} busy={busy === "create"} disabled={!pick || problems.length > 0 || !!taken || busy !== ""} onClick={() => void create()}>
              Create the seat on {selected ?? "your NFT"}
            </Button>
          )}
        </li>

        <li className="ag-step" aria-disabled={!seat}>
          <h2>4 · Fund it and give the agent its key</h2>
          <p className="kp-hint">
            Signature 2, one wallet request: puts {d.budget || "0"} {asset} in the seat and adds a key to your account
            that can only call <code>agent_pay</code>, <code>agent_buy</code> and <code>pause</code> on{" "}
            <code>{shortAccount(ag.AGENTS)}</code>, with no deposit and at most 1 NEAR of gas. The runner made this key;
            its secret never leaves the runner.
          </p>
          <Button variant="primary" icon={KeyRound} busy={busy === "activate"} disabled={!seat || problems.length > 0 || busy !== ""} onClick={() => void activate()}>
            Fund and start the agent
          </Button>
        </li>
      </ol>
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
      <figcaption className="ag-muted">Spent per day (last 7 days, from the on-chain log)</figcaption>
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
  const runner = useRunner(account);
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

  if (seat === undefined) return <Skeleton label="Loading the agent" />;
  if (seat === null)
    return (
      <div className="kp-empty">
        <p>No agent #{id}.</p>
        <Button onClick={() => navigate("/agents")}>Back to my agents</Button>
      </div>
    );

  const mine = account === seat.owner;
  const canClaim = !!account && nftOwner === account && !mine;
  const st = statusOf(seat, job, nftOwner, runner.up);
  const cap = BigInt(seat.policy?.per_day_max ?? "0");
  const fundValue = ag.parseAsset(fund, seat.asset);
  const m = mission ?? {
    maxPrice: job?.buyer ? ag.formatAsset(job.buyer.maxPrice, "NEAR").split(" ")[0] : "",
    amount: job?.payer?.payments[0] ? ag.formatAsset(job.payer.payments[0].amount, "USDC").split(" ")[0] : "",
    every: job?.payer?.payments[0] ? String(job.payer.payments[0].everySeconds / 60) : "",
  };
  const saveMission = () =>
    run("mission", "Mission saved in the runner (no signature needed)", async () => {
      if (!job) throw new Error("This seat has no agent key in the runner. Give access first.");
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
                  memo: "agent payment",
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
        buyer: job?.buyer ?? (seat.kind === "Buyer" ? { maxPrice: seat.policy?.per_tx_max ?? "0" } : undefined),
        payer: job?.payer ?? (seat.kind === "Payer" ? { payments: [] } : undefined),
      });
      return r;
    });

  return (
    <div className="ag-page">
      <button type="button" className="kp-back" onClick={() => navigate("/agents")}>
        ← My agents
      </button>
      <section className="ag-head">
        <div>
          <p className="kp-eyebrow">
            {seat.kind === "Buyer" ? "Buyer agent · pays in NEAR" : "Payer agent · pays in USDC"}
          </p>
          <h1>
            {seat.kind} #{seat.seat_id}{" "}
            <Badge tone={st.tone}>{st.label}</Badge>
          </h1>
          <p className="ag-muted">
            Lives on{" "}
            <a href={nftHref(seat.nft_contract, seat.token_id)} target={seat.nft_contract.startsWith("keepers-") ? undefined : "_blank"} rel="noreferrer">
              {collectionLabel(seat.nft_contract)} #{seat.token_id}
            </a>{" "}
            · owner {shortAccount(seat.owner)} · {st.note}
          </p>
        </div>
      </section>
      {notice}
      {canClaim && (
        <Notice tone="info" title="You own this NFT now">
          The seat still belongs to {shortAccount(seat.owner)}. Claim it to set your own limits; their budget stays theirs.{" "}
          <Button variant="primary" busy={busy === "claim"} onClick={() => run("claim", "Seat claimed", () => ag.claimSeat(seat))}>
            Claim the seat
          </Button>
        </Notice>
      )}
      {mine && nftOwner && nftOwner !== account && (
        <Notice tone="info" title="You no longer own this NFT">
          The agent is stopped. Your budget is still yours: withdraw it below.
        </Notice>
      )}

      <section className="ag-stats" aria-label="This agent">
        <Stat label="Budget left" value={ag.formatAsset(seat.balance, seat.asset)} />
        <Stat label="Spent today" value={ag.formatAsset(seat.spent_today, seat.asset)} sub={`cap ${ag.formatAsset(cap, seat.asset)}`} />
        <Stat label="Spent in total" value={ag.formatAsset(seat.spent_total, seat.asset)} />
        <Stat label="Done · blocked · failed" value={`${seat.done} · ${seat.refused} · ${seat.failed}`} />
        <Stat
          label="Gas left on the agent key"
          value={gasLeft ? ag.formatAsset(gasLeft, "NEAR") : seat.agent_key ? "key removed" : "no key"}
          sub={seat.agent_key ? `${seat.agent_key.slice(0, 16)}…` : undefined}
        />
      </section>

      <div className="ag-columns">
        <section className="kp-vault-section">
          <h2>Mission and limits</h2>
          <dl className="ag-dl">
            <dt>Cap per action</dt>
            <dd>{seat.policy ? ag.formatAsset(seat.policy.per_tx_max, seat.asset) : "—"}</dd>
            <dt>Cap per day</dt>
            <dd>{seat.policy ? ag.formatAsset(seat.policy.per_day_max, seat.asset) : "—"}</dd>
            {seat.kind === "Buyer" ? (
              <>
                <dt>Market</dt>
                <dd>{seat.policy?.market ? shortAccount(seat.policy.market) : "—"}</dd>
              </>
            ) : (
              <>
                <dt>Payees</dt>
                <dd>{seat.policy?.payees.join(", ") || "—"}</dd>
              </>
            )}
            <dt>Runner</dt>
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
                  <Input label="USDC per payment" inputMode="decimal" value={m.amount} onChange={(e) => setMission({ ...m, amount: e.target.value })} />
                  <Input label="Every (minutes)" inputMode="numeric" value={m.every} onChange={(e) => setMission({ ...m, every: e.target.value })} />
                </>
              )}
              <Button type="submit" busy={busy === "mission"}>
                Save mission
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
                  <Button variant="danger" icon={CirclePause} busy={busy === "stop"} disabled={busy !== ""} onClick={() => run("stop", "Stopped by the agent key itself, no wallet needed", () => ag.runnerPause(seat.seat_id))}>
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
              <Button variant="ghost" icon={Trash2} busy={busy === "close"} disabled={seat.balance !== "0" || seat.in_flight > 0 || busy !== ""} onClick={() => run("close", "Seat closed, 0.1 NEAR storage refunded", async () => { const r = await ag.closeSeat(seat); await ag.runnerDelete(seat.seat_id).catch(() => {}); navigate("/agents"); return r; })}>
                Close the seat
              </Button>
            </div>
            <p className="kp-hint">Owner actions need your wallet. The agent's key cannot do any of them.</p>
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
              {log.map((e) => (
                <tr key={e.seq}>
                  <td>{ago(e.at)}</td>
                  <td>{e.action}</td>
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
          : the last 50 entries. Blocked attempts are logged by the contract itself.
        </p>
      </section>
    </div>
  );
}
