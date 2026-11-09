import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Ban,
  WalletCards,
  CircleCheck,
  CirclePause,
  CirclePlay,
  CircleX,
  CornerDownLeft,
  Download,
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
import { CHARACTERS, characterFromMedia } from "./nft-art";
import { NFTCard, NFTCardEmpty, NFTCardSkeleton, type NftCardModel } from "./NFTCard";
import { ALL_ROLES, BYO_ROLES, PICKER_ROLES, UNIT_SECONDS, defaultRole, isGeneric, roleOf, type Role, type RoleId, type Unit } from "./roles";
import { generateAgentKey } from "./agentKey";
import { AgentDashboard } from "./AgentDashboard";
import { LiveDot, ToastStack, useFresh, useLivePoll, useTitleBadge, useToasts, type Toast } from "./live";
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

export const roleFor = (seat: Seat, job?: Job): Role =>
  roleOf(job?.role) ??
  roleOf(ag.byoAgents()[seat.seat_id]?.role) ??
  roleOf(seat.profile?.role) ??
  (seat.profile?.role === ag.SKILL_ROLE ? roleOf("byo-skill") : undefined) ??
  defaultRole(seat.kind);
export const nameFor = (seat: Seat, job?: Job) => {
  const role = roleFor(seat, job);
  return (
    job?.name ||
    seat.profile?.name ||
    ag.byoAgents()[seat.seat_id]?.name ||
    `${isGeneric(role) ? "Agent" : role.name} ${ag.seatLabel(seat.seat_id)}`
  );
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Status = { label: string; tone: "up" | "down" | "neutral" | "brand"; note: string; live: boolean };
function statusOf(seat: Seat, job: Job | undefined, nftOwner: string | null, runnerUp: boolean, runnerLocked = false): Status {
  if (nftOwner && nftOwner !== seat.owner)
    return { label: "NFT sold", tone: "down", note: "The NFT changed hands: the agent is stopped.", live: false };
  if (ag.isSkillSeat(seat))
    return { label: "Skill", tone: "brand", note: "Carries an AI skill on the NFT: no budget, nothing to spend.", live: false };
  if (!seat.policy) return { label: "Reset", tone: "down", note: "No limits set.", live: false };
  if (seat.paused) return { label: "Paused", tone: "neutral", note: "Resume to let it act again.", live: false };
  if (!seat.agent_key) return { label: "No access", tone: "neutral", note: "Give the agent its key.", live: false };
  const byo = ag.byoAgents()[seat.seat_id];
  if (!job && byo && seat.agent_key === byo.publicKey)
    return { label: "Your AI", tone: "brand", note: "Driven by your own AI agent over MCP, inside these limits.", live: true };
  if (!job && runnerLocked)
    return { label: "Runner locked", tone: "neutral", note: "Unlock the runner to see its mission (one signature, no fee).", live: false };
  if (!job) return { label: "No mission", tone: "neutral", note: "The runner has no key for it.", live: false };
  if (!runnerUp) return { label: "Runner offline", tone: "down", note: "Start npm run agent:runner.", live: false };
  return { label: "Active", tone: "up", note: "Acts on its own, within its limits.", live: true };
}

/** True once `on` has stayed true for `ms`: hints that only make sense after a short wait. */
export function useSlow(on: boolean, ms = 1200) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!on) return setSlow(false);
    const t = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(t);
  }, [on, ms]);
  return slow;
}

/** Shown while a request may be waiting in the wallet's window. */
export function WalletWait() {
  return (
    <p className="ag-waiting" role="status">
      <span className="ag-waiting-dot" aria-hidden="true" />
      Working on it. If your wallet opened, approve or cancel the request there.
    </p>
  );
}

/** Runs one wallet or runner action with busy/error/success state. */
function useAction(refresh: () => void) {
  const [busy, setBusy] = useState("");
  const waiting = useSlow(busy !== "");
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
        setMsg({ tone: "error", text: ag.friendlyError(e) });
      } finally {
        setBusy("");
      }
    },
    [refresh],
  );
  const notice = waiting ? (
    <WalletWait />
  ) : (
    msg && (
    <Notice tone={msg.tone} title={msg.tone === "error" ? "Not done" : "Done"}>
      {msg.text}{" "}
      {msg.href && (
        <a href={msg.href} target="_blank" rel="noreferrer">
          View transaction
        </a>
      )}
    </Notice>
  )
  );
  return { busy, run, notice };
}

/**
 * The local runner: online or not, and whether this account signed in to it
 * (it only shows and drives an account's agents after one NEP-413 signature).
 */
export function useRunner(account: string) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [up, setUp] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const load = useCallback(async () => {
    if (!account) return;
    try {
      await ag.runnerHealth();
      setUp(true);
    } catch {
      setUp(false);
      return;
    }
    try {
      setJobs(await ag.runnerJobs(account));
      setLocked(false);
    } catch (e) {
      if (e instanceof ag.RunnerLockedError) {
        setJobs([]);
        setLocked(true);
      } else setUp(false);
    }
  }, [account]);
  const unlock = useCallback(async () => {
    setUnlocking(true);
    setUnlockError("");
    try {
      await ag.runnerSignIn(account);
      await load();
    } catch (e) {
      setUnlockError(ag.friendlyError(e));
    } finally {
      setUnlocking(false);
    }
  }, [account, load]);
  useEffect(() => void load(), [load]);
  return { jobs, up: up === true, checked: up !== null, locked: up === true && locked, unlock, unlocking, unlockError, reload: load };
}

/** Shown while the runner is online but this account has not signed in to it. */
function RunnerLockedNotice({ runner }: { runner: ReturnType<typeof useRunner> }) {
  if (!runner.locked) return null;
  return (
    <Notice tone="info" title="Unlock your agent runner">
      {ag.runnerIsHosted ? "The hosted runner" : "The runner on this computer"} only obeys you after one wallet signature: no
      transaction, no fee, valid 12 hours. Other sites and accounts cannot drive your agents.{" "}
      <Button variant="primary" icon={KeyRound} busy={runner.unlocking} onClick={() => void runner.unlock()}>
        Unlock
      </Button>
      {runner.unlockError && <span className="ag-problems"> {runner.unlockError}</span>}
      {runner.unlocking && <WalletWait />}
    </Notice>
  );
}

export function useImages(items: { key: string; contract: string; token: string }[]) {
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

/** Downscales an uploaded avatar to 128 px (WebP data URL) so it fits in local storage. */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 128;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d")!;
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/webp", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * NFT artwork with a fixed box (no layout shift). `undefined` = still loading,
 * `null` = the NFT has no usable image: a neutral night tile with its name,
 * never a stand-in character.
 */
export function NftArt({ src, label }: { src: string | null | undefined; label: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed)
    return <img className="ag-art" src={src} alt={label} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  return (
    <div className="ag-art ag-art--empty" role="img" aria-label={src === undefined ? `Loading ${label}` : `${label}, no image`} data-loading={src === undefined}>
      {src !== undefined && <span>{label}</span>}
    </div>
  );
}

/**
 * Card model for an agent seat. Real data only: the timer counts down to the
 * next scheduled payment (or shows the last action), the fact is what it spent
 * today, the value is its budget.
 */
function seatModel(
  s: Seat,
  job: Job | undefined,
  role: Role,
  st: Status,
  image: string | null | undefined,
  last?: string,
): NftCardModel {
  const Icon = role.icon;
  const imported = role.byo ? ag.byoAgents()[s.seat_id] : undefined;
  const toolLabel = imported?.tool ? ag.AGENT_TOOLS.find((t) => t.id === imported.tool)?.label : undefined;
  const character = image?.startsWith("/nft-art/") ? CHARACTERS.find((c) => image === c.image) : undefined;
  const collection = character ? character.collection : collectionLabel(s.nft_contract);
  let until: number | undefined;
  if (st.live && job?.payer?.payments.length) {
    const next = job.payer.payments.map((p) => (job.lastPaid?.[`${p.payee}:${p.amount}`] ?? 0) + p.everySeconds * 1000);
    until = Math.min(...next);
  }
  return {
    id: s.seat_id,
    name: nameFor(s, job),
    description: ag.parseGatedUrl(s.profile?.manifest)
      ? "Private skill: opens for the NFT's holder only"
      : s.profile?.manifest
      ? s.profile.manifest.replace(/^https:\/\//, "")
      : imported?.source
      ? imported.source.replace(/^https?:\/\//, "")
      : imported
        ? `Your own AI, ${s.kind === "Payer" ? "pays in USDC" : "buys Keepers"} inside these limits`
        : (character?.description ?? role.tagline),
    image,
    imageAlt: `${collection} #${s.token_id}`,
    // Portrait Characters art fills the card; any other NFT art is shown whole, uncropped.
    fit: character ? "cover" : "contain",
    collection,
    subtitle: imported ? `Imported · ${toolLabel ?? "MCP agent"}` : role.name,
    avatar: imported?.avatar ? <img src={imported.avatar} alt="" /> : <Icon />,
    timer: until ? { until } : { label: last ? ago(last) : "new" },
    status: { label: st.label, tone: st.tone },
    fact: { label: "Today", value: ag.formatAsset(s.spent_today, s.asset) },
    value: { label: "Budget", amount: ag.formatAsset(s.balance, s.asset) },
  };
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
      setPlan({ title: "Could not prepare this", checks: [{ ok: false, text: ag.friendlyError(e) }] });
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
      setResult({ ok: false, text: ag.friendlyError(e) });
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
      prev.count += e.times ?? 1;
      prev.firstAt = e.at;
    } else out.push({ ...e, count: e.times ?? 1, firstAt: e.at });
  }
  return out;
}

/** Agents waiting in this wallet: on NFTs it holds, not claimed yet. Read from chain every 20 s; no link needed. */
function useInbox(account: string) {
  const [items, setItems] = useState<ag.ReceivedAgent[] | null>(null);
  const reload = useCallback(() => {
    if (!account) return setItems(null);
    void ag.receivedAgents(account).then(setItems, () => {});
  }, [account]);
  useEffect(() => {
    reload();
    const t = setInterval(() => !document.hidden && reload(), 20_000);
    return () => clearInterval(t);
  }, [reload]);
  return [items, reload] as const;
}

/** "Arrived in your wallet": what was sent to (or bought by) this account, with one-click claim. */
function Inbox({
  items,
  readOnly,
  navigate,
  onClaimed,
}: {
  items: ag.ReceivedAgent[];
  readOnly: boolean;
  navigate: Nav;
  onClaimed: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const slow = useSlow(busy !== "");
  const images = useImages(items.map((i) => ({ key: i.seat.seat_id, contract: i.nft.contract, token: i.nft.token_id })));
  async function claim(seats: Seat[], tag: string) {
    setBusy(tag);
    setError("");
    try {
      await ag.claimSeats(seats);
      onClaimed();
      if (seats.length === 1) navigate(`/agents/${seats[0].seat_id}`);
    } catch (e) {
      setError(ag.friendlyError(e));
    } finally {
      setBusy("");
    }
  }
  if (!items.length) return null;
  const many = items.length > 1;
  return (
    <section className="ag-inbox" aria-labelledby="ag-inbox-title">
      <div className="ag-inbox-head">
        <div>
          <h2 id="ag-inbox-title">
            {items.length} agent{many ? "s" : ""} arrived in {readOnly ? "this" : "your"} wallet
          </h2>
          <p className="ag-muted">
            {many ? "They sit on NFTs" : "It sits on an NFT"} {readOnly ? "this account holds" : "you now hold"}.{" "}
            {readOnly ? "Its holder claims it with one signature." : "One signature and it is yours, with everything listed."}
          </p>
        </div>
        {many && !readOnly && (
          <Button variant="primary" busy={busy === "all"} disabled={busy !== ""} onClick={() => void claim(items.map((i) => i.seat), "all")}>
            Claim all {items.length}
          </Button>
        )}
      </div>
      {error && (
        <Notice tone="error" title="Not claimed">
          {error}
        </Notice>
      )}
      <ul className="ag-inbox-list">
        {items.map(({ seat, nft }) => (
          <li key={seat.seat_id} className="ag-inbox-item">
            <span className="ag-inbox-art">
              <NftArt src={images[seat.seat_id]} label={nft.title} />
            </span>
            <div className="ag-inbox-text">
              <strong>{seat.profile?.name ?? ag.seatLabel(seat.seat_id)}</strong>
              <span className="ag-muted">
                from {shortAccount(seat.owner)} · on {characterFromMedia(nft.media) ? nft.title : `${nft.label} #${nft.token_id}`}
              </span>
              <span>Comes with {ag.receivedSummary(seat)}.</span>
            </div>
            <div className="ag-inbox-actions">
              {!readOnly && (
                <Button variant="primary" busy={busy === seat.seat_id} disabled={busy !== ""} onClick={() => void claim([seat], seat.seat_id)}>
                  Claim
                </Button>
              )}
              <Button variant="ghost" onClick={() => navigate(`/agents/${seat.seat_id}`)}>
                See it
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {slow && <WalletWait />}
    </section>
  );
}

export function AgentsPage({ wallet, navigate }: { wallet: Wallet; navigate: Nav }) {
  /** `?as=<account>` shows someone's Agent Wallet read-only, with no wallet connected. */
  const viewAs = new URLSearchParams(location.search).get("as")?.trim().toLowerCase() || "";
  const readOnly = !wallet.account && /^[a-z0-9._-]{2,64}$/.test(viewAs);
  const account = wallet.account || (readOnly ? viewAs : "");
  const [seats, setSeats] = useState<Seat[] | null>(null);
  const [owners, setOwners] = useState<Record<string, string | null>>({});
  const [feed, setFeed] = useState<(FeedItem & { count: number; firstAt: string })[]>([]);
  const [feedTx, setFeedTx] = useState<Record<string, string>>({});
  const [refund, setRefund] = useState({ near: "0", usdc: "0" });
  const [error, setError] = useState("");
  // A read-only view is someone else's wallet: this computer's runner has nothing to say about it.
  const runner = useRunner(readOnly ? "" : account);
  const fresh = useFresh(account);
  const { toasts, push, dismiss } = useToasts();
  const jobsRef = useRef<Job[]>([]);
  jobsRef.current = runner.jobs;
  const linkedRef = useRef("");
  const badgeRef = useRef<(n: number) => void>(() => {});
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
      const shown = collapse(logs.sort((a, b) => (BigInt(b.at) > BigInt(a.at) ? 1 : -1))).slice(0, 20);
      setFeed(shown);
      // Live: what the agents did since the last read (nothing on the first read).
      const added = new Set(fresh.take(logs.map(feedKey)));
      const moves = logs.filter((e) => added.has(feedKey(e)) && e.status !== "info" && e.status !== "pending").slice(0, 3);
      for (const e of [...moves].reverse()) push(toastFor(e, jobsRef.current.find((j) => j.seatId === e.seat.seat_id), navigate));
      badgeRef.current(moves.length);
      // Explorer links: match each entry to the owner's transaction (best effort, never blocks the page).
      // While the newest entry has no link yet, ask the explorer again sooner.
      const newest = shown[0] ? feedKey(shown[0]) : "";
      if (shown.length)
        void ag
          .ownerTxs(
            account,
            BigInt(shown.at(-1)!.at) - 60_000_000_000n,
            newest === linkedRef.current ? 60_000 : 20_000,
            [...new Set(list.map((s) => s.contract))],
          )
          .then((txs) => {
            const m: Record<string, string> = {};
            for (const e of shown) {
              const h = ag.txForEntry(e, txs, e.seat.contract);
              if (h) m[feedKey(e)] = h;
            }
            if (m[newest]) linkedRef.current = newest;
            setFeedTx(m);
          })
          .catch(() => {});
      setError("");
    } catch (e) {
      setError(ag.friendlyError(e));
    }
    void runner.reload();
  }, [account, runner.reload, fresh.take, push, navigate]);
  const live = useLivePoll(load, 6000);
  badgeRef.current = useTitleBadge(live.hidden);
  const { busy, run, notice } = useAction(load);
  const images = useImages((seats ?? []).map((s) => ({ key: s.seat_id, contract: s.nft_contract, token: s.token_id })));
  // Agents that arrived in this wallet; a toast for each one that lands while the page is open.
  const [inbox, reloadInbox] = useInbox(account);
  const seenInbox = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!inbox) return;
    const ids = inbox.map((i) => i.seat.seat_id);
    if (seenInbox.current)
      for (const i of inbox.filter((x) => !seenInbox.current!.has(x.seat.seat_id))) {
        push({
          id: `inbox-${i.seat.seat_id}`,
          tone: "up",
          title: `${i.seat.profile?.name ?? "An agent"} arrived in your wallet`,
          body: `From ${shortAccount(i.seat.owner)}. Claim it at the top of this page.`,
          onOpen: () => navigate(`/agents/${i.seat.seat_id}`),
        });
        badgeRef.current(1);
      }
    seenInbox.current = new Set(ids);
  }, [inbox, push, navigate]);

  const totals = useMemo(() => {
    const t = { near: 0n, usdc: 0n, todayNear: 0n, todayUsdc: 0n, done: 0, refused: 0, active: 0 };
    for (const s of seats ?? []) {
      if (s.asset === "NEAR") (t.near += BigInt(s.balance)), (t.todayNear += BigInt(s.spent_today));
      else (t.usdc += BigInt(s.balance)), (t.todayUsdc += BigInt(s.spent_today));
      t.done += s.done;
      t.refused += s.refused;
      if (statusOf(s, runner.jobs.find((j) => j.seatId === s.seat_id), owners[s.seat_id] ?? null, runner.up, runner.locked).live) t.active++;
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
        <section className="ag-stage ag-stage--intro" aria-labelledby="ag-intro-title">
          <div className="ag-room" aria-hidden="true" />
          <div className="ag-intro">
            <span className="ag-mark" aria-hidden="true">
              <WalletCards />
            </span>
            <h1 id="ag-intro-title">Give an AI a card, not your wallet.</h1>
            <p>
              Put an agent on any NFT you own: a collector, a subscription payer, an allowance. Each one spends only
              its own budget, inside limits the contract enforces. Call it any time; sell the NFT and it stops.
            </p>
            <div className="ag-intro-actions">
              <Button variant="primary" icon={Sparkles} onClick={() => navigate("/agents/start")}>
                Start my first agent
              </Button>
              <Button variant="secondary" icon={WalletIcon} onClick={() => void wallet.connect()}>
                Open my Agent Wallet
              </Button>
              <a
                className="ag-intro-demo"
                href={`/agents?as=${ag.DEMO_ACCOUNT}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/agents?as=${ag.DEMO_ACCOUNT}`);
                }}
              >
                See a live one on testnet, no wallet needed
              </a>
            </div>
          </div>
        </section>
        <RoleGallery navigate={navigate} />
      </div>
    );

  const focused = seats && seats.length ? seats[Math.min(focus, seats.length - 1)] : null;
  const focusedJob = focused ? runner.jobs.find((j) => j.seatId === focused.seat_id) : undefined;
  const focusedStatus = focused ? statusOf(focused, focusedJob, owners[focused.seat_id] ?? null, runner.up, runner.locked) : null;
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
        <RunnerOffline />
      )}
      {!readOnly && <RunnerLockedNotice runner={runner} />}
      {notice}
      <Inbox items={inbox ?? []} readOnly={readOnly} navigate={navigate} onClaimed={() => (reloadInbox(), void load())} />
      {!readOnly && (refund.near !== "0" || refund.usdc !== "0") && (
        <Notice tone="info" title="Money set aside for you">
          From agents on NFTs you sold: {ag.formatAsset(refund.near, "NEAR")} and {ag.formatAsset(refund.usdc, "USDC")}.{" "}
          <Button variant="ghost" busy={busy === "refund"} onClick={() => run("refund", "Sent to your wallet", () => ag.withdrawRefund(account))}>
            Withdraw
          </Button>
        </Notice>
      )}

      <section className="ag-stage" aria-label="Agent Wallet">
        <div className="ag-room" aria-hidden="true" />

        <header className="ag-stage-head">
          <div className="ag-stage-title">
            <span className="ag-mark" aria-hidden="true">
              <WalletCards />
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
                {runner.locked
                  ? "Runner locked"
                  : runner.up
                    ? ag.runnerIsHosted
                      ? "Hosted runner online"
                      : "Runner online"
                    : runner.checked
                      ? "Runner offline"
                      : "Checking runner"}
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
          <div className="ag-skeleton-row">
            {[0, 1, 2].map((i) => (
              <div key={i} className="ag-skeleton-slot">
                <NFTCardSkeleton label="Loading your agents" />
              </div>
            ))}
          </div>
        ) : seats.length === 0 ? (
          <div className="ag-stage-empty">
            {readOnly ? (
              <p>This wallet has no agent yet.</p>
            ) : (
              <>
                <strong className="ag-empty-title">No agent yet. Start with one that pays you back.</strong>
                <p>Five guided steps, about two minutes, free test tokens only. It ends with your agent acting on its own.</p>
                <div className="ag-buttons">
                  <Button variant="primary" icon={Sparkles} onClick={() => navigate("/agents/start")}>
                    Start my first agent
                  </Button>
                  <Button variant="ghost" icon={Plus} onClick={() => navigate("/agents/new")}>
                    Hire with my own rules
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <Carousel label="Your agents" focus={focus} onFocus={setFocus}>
            {[
              ...seats.map((s) => {
                const job = runner.jobs.find((j) => j.seatId === s.seat_id);
                const role = roleFor(s, job);
                const st = statusOf(s, job, owners[s.seat_id] ?? null, runner.up, runner.locked);
                return (
                  <NFTCard
                    key={s.seat_id}
                    href={`/agents/${s.seat_id}`}
                    onOpen={() => navigate(`/agents/${s.seat_id}`)}
                    model={seatModel(s, job, role, st, images[s.seat_id], lastAt[s.seat_id])}
                  />
                );
              }),
              ...(!readOnly
                ? [
                    <NFTCardEmpty
                      key="new"
                      title="Hire an agent"
                      hint="Collector, subscriptions, allowance, payroll"
                      onClick={() => navigate("/agents/new")}
                    />,
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
          <div className="ag-feed-head">
            <h2 id="ag-feed">Activity</h2>
            <LiveDot updatedAt={live.updatedAt} hidden={live.hidden} />
          </div>
          {feed.length === 0 ? (
            <p className="ag-muted">Nothing yet. Every action, and every attempt the contract blocked, shows up here.</p>
          ) : (
            <ol className="ag-feed">
              {feed.map((e) => {
                const job = runner.jobs.find((j) => j.seatId === e.seat.seat_id);
                return (
                  <li key={feedKey(e)} data-status={e.status} data-new={fresh.fresh.has(feedKey(e)) || undefined}>
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
                      {feedTx[`${e.seat.seat_id}-${e.seq}`] && (
                        <a className="ag-tx" href={ag.txLink(feedTx[`${e.seat.seat_id}-${e.seq}`])} target="_blank" rel="noreferrer" aria-label="View the transaction">
                          tx ↗
                        </a>
                      )}
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
      <ToastStack toasts={toasts} dismiss={dismiss} txFor={(id) => (feedTx[id] ? ag.txLink(feedTx[id]) : undefined)} />
    </div>
  );
}

/** The contract's log actions, as people say them. */
const ACTION_LABELS: Record<string, string> = {
  pay: "Payment",
  buy: "Purchase",
  deliver: "Delivery",
  fund: "Top-up",
  withdraw: "Withdrawal",
  create: "Hired",
  key: "Key",
  pause: "Paused",
  resume: "Resumed",
  policy: "New limits",
  reset: "Reset",
  claim: "New owner",
  budget: "Budget",
  profile: "Profile",
};

/**
 * Who the agent is and what it has done. On v2 the profile and the track
 * record live on chain and follow the NFT; the owner can edit the profile.
 */
function AgentIdentity({ seat, mine, onSaved }: { seat: Seat; mine: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const p = seat.profile;
  const [draft, setDraft] = useState({ name: p?.name ?? "", role: p?.role ?? "", tool: p?.tool ?? "", avatar: p?.avatar ?? "", manifest: p?.manifest ?? "" });
  const profile = ag.profileFor(draft);
  const badLink = [draft.avatar, draft.manifest].some((u) => u && !/^https:\/\/.{4,}/.test(u));

  async function save() {
    setBusy(true);
    setError("");
    try {
      await ag.setProfile(seat, profile);
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(ag.friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ag-identity">
      <dl className="ag-dl">
        <dt>Contract</dt>
        <dd>
          {seat.version === "v2" ? "v2" : "v1"} ·{" "}
          <a href={`${EXPLORER}/address/${seat.contract}`} target="_blank" rel="noreferrer">
            {shortAccount(seat.contract)}
          </a>
        </dd>
        {seat.version === "v2" && (
          <>
            <dt>Track record</dt>
            <dd>
              {seat.owners ?? 1} owner{(seat.owners ?? 1) === 1 ? "" : "s"} so far · {seat.done} done · {seat.refused} blocked ·{" "}
              {ag.formatAsset(seat.spent_total, seat.asset)} spent <span className="ag-muted">(on chain, follows the NFT)</span>
            </dd>
            <dt>Profile</dt>
            <dd>
              {p ? (
                <>
                  <strong>{p.name}</strong>
                  {p.role && <span className="ag-muted"> · {p.role}</span>}
                  {p.tool && <span className="ag-muted"> · runs in {p.tool}</span>}
                  {p.manifest && ag.parseGatedUrl(p.manifest) ? (
                    <>
                      {" "}
                      · <a href="#ag-skill-title">private skill (NFT holder only)</a>
                    </>
                  ) : p.manifest && (
                    <>
                      {" "}
                      ·{" "}
                      <a href={p.manifest} target="_blank" rel="noreferrer">
                        how it thinks ↗
                      </a>
                    </>
                  )}
                </>
              ) : (
                <span className="ag-muted">none yet</span>
              )}
              {mine && !editing && (
                <button type="button" className="ag-qs-change" onClick={() => setEditing(true)}>
                  {p ? "edit" : "add"}
                </button>
              )}
            </dd>
          </>
        )}
      </dl>
      {editing && (
        <div className="ag-profile-edit">
          {error && (
            <Notice tone="error" title="Not saved">
              {error}
            </Notice>
          )}
          <div className="ag-form">
            <Input label="Name" value={draft.name} maxLength={32} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input label="Role" value={draft.role} maxLength={24} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
            <Input label="Runs in (tool)" value={draft.tool} maxLength={24} placeholder="claude-code" onChange={(e) => setDraft({ ...draft, tool: e.target.value })} />
            <Input label="Avatar (https link)" value={draft.avatar} placeholder="https://…" onChange={(e) => setDraft({ ...draft, avatar: e.target.value.trim() })} />
            <Input
              label="How it thinks (https link)"
              value={draft.manifest}
              placeholder="https://…/agent.json"
              hint="A page or JSON describing its prompt, model or MCP server. It travels with the NFT."
              onChange={(e) => setDraft({ ...draft, manifest: e.target.value.trim() })}
            />
          </div>
          <div className="ag-buttons">
            <Button variant="primary" busy={busy} disabled={busy || !profile || badLink} onClick={() => void save()}>
              Save on chain
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          {(badLink || !profile) && <p className="ag-problems">{!profile ? "Give it a name." : "Links must start with https://."}</p>}
        </div>
      )}
    </div>
  );
}

/** No runner reachable: what still works, and how to plug one in (on a hosted site, only after an opt-in). */
export function RunnerOffline() {
  if (ag.runnerIsHosted)
    return (
      <Notice tone="info" title="The hosted runner is not answering">
        Built-in roles act through it; budgets and limits stay safe on chain meanwhile. Everything else here works without it.{" "}
        <RunnerSwitch />
      </Notice>
    );
  return (
    <Notice tone="info" title="The agent runner on this computer is offline">
      Agents it holds only act while it runs: <code>{ag.runnerCommand()}</code>. Budgets and limits stay safe on chain.{" "}
      <RunnerSwitch />
    </Notice>
  );
}

/** Hosted site only: use the hosted runner, or the one on this computer (where earlier agents keep their keys). */
export function RunnerSwitch() {
  if (!ag.canSwitchRunner) return null;
  return (
    <button
      type="button"
      className="ag-qs-change"
      title={ag.runnerIsHosted ? "Agents hired with your own runner keep their keys there" : "The runner Agent Wallet hosts, always on"}
      onClick={() => {
        ag.setLocalRunner(ag.runnerIsHosted);
        location.reload();
      }}
    >
      {ag.runnerIsHosted ? "Use the runner on this computer" : "Use the hosted runner"}
    </button>
  );
}

/** "github.com/x/y" -> "https://github.com/x/y" (the contract only takes https links). */
const httpsLink = (u: string) => (/^https?:\/\//.test(u.trim()) ? u.trim().replace(/^http:/, "https:") : u.trim() ? `https://${u.trim()}` : "");

/** Saves text as a file on the user's computer. */
function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * A private skill: the NFT is the key. Everyone sees its card (name, size, fingerprint);
 * only the NFT's current holder, signed in with NEP-413, can open it or replace it.
 */
function GatedSkill({
  seat,
  gate,
  account,
  holder,
  connect,
}: {
  seat: Seat;
  gate: { nftContract: string; tokenId: string };
  account: string;
  holder: string | null;
  connect: () => void;
}) {
  const [meta, setMeta] = useState<ag.GatedMeta | null | undefined>();
  const [skill, setSkill] = useState<{ name: string; content: string; sha256: string } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const slow = useSlow(busy);
  const loadMeta = useCallback(
    () => void ag.gatedMeta(gate.nftContract, gate.tokenId).then(setMeta, () => setMeta(null)),
    [gate.nftContract, gate.tokenId],
  );
  useEffect(loadMeta, [loadMeta]);
  // A different wallet must not keep what the previous one opened.
  useEffect(() => {
    setSkill(null);
    setDraft(null);
    setError("");
  }, [account]);
  const isHolder = !!account && account === holder;
  const explain = (e: unknown) =>
    e instanceof ag.RunnerHttpError && e.status === 403
      ? `${shortAccount(account)} does not hold this NFT${holder ? ` (${shortAccount(holder)} does)` : ""}: only its holder can open the skill.`
      : ag.friendlyError(e);

  async function open() {
    setBusy(true);
    setError("");
    try {
      setSkill(await ag.gatedRead(account, gate.nftContract, gate.tokenId));
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(text: string) {
    setBusy(true);
    setError("");
    try {
      const name = skill?.name ?? (meta?.exists ? meta.name : ag.skillFolder(text, seat.profile?.name ?? "agent-skill"));
      const r = await ag.gatedWrite(account, gate.nftContract, gate.tokenId, name, text);
      setSkill({ name: r.name, content: text, sha256: r.sha256 });
      setDraft(null);
      loadMeta();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  const install = skill ? ag.gatedInstall(skill.name, skill.content) : "";
  return (
    <section className="kp-vault-section ag-skill" aria-labelledby="ag-skill-title">
      <h2 id="ag-skill-title">
        <KeyRound aria-hidden="true" className="ag-inline-icon" /> Its private skill
      </h2>
      <p className="ag-muted">
        This NFT is the key. Only its current holder can open the skill: each time, the runner asks {shortAccount(gate.nftContract)} who
        holds token #{gate.tokenId}. Send the NFT and the access goes with it; the old holder loses it.
      </p>
      {meta === undefined ? (
        <Skeleton label="Reading the skill's card" />
      ) : meta === null ? (
        <p className="ag-muted">The skill service did not answer. Try again in a minute.</p>
      ) : meta.exists ? (
        <dl className="ag-gated-card">
          <div>
            <dt>Skill</dt>
            <dd>{meta.name}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{(meta.size / 1024).toFixed(1)} KB</dd>
          </div>
          <div>
            <dt>Fingerprint</dt>
            <dd title={`sha256 ${meta.sha256}`}>
              <code>{meta.sha256.slice(0, 16)}…</code>
            </dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{new Date(meta.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>
      ) : (
        <p className="ag-muted">No skill stored for this NFT yet.</p>
      )}
      {error && (
        <Notice tone="error" title="Not opened">
          {error}
        </Notice>
      )}
      {!account ? (
        <div className="ag-buttons">
          <Button variant="primary" icon={WalletIcon} onClick={connect}>
            Connect the wallet that holds it
          </Button>
        </div>
      ) : holder && !isHolder ? (
        <p>
          <strong>Locked.</strong>{" "}
          <span className="ag-muted">Only the holder of this NFT ({shortAccount(holder)}) can open it.</span>
        </p>
      ) : draft !== null ? (
        <div className="ag-private-skill">
          <label className="ag-field-label" htmlFor="ag-gated-edit">
            New SKILL.md
          </label>
          <textarea id="ag-gated-edit" className="ag-textarea" rows={10} spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="ag-buttons">
            <Button variant="primary" busy={busy} disabled={busy || !draft.trim() || new TextEncoder().encode(draft).length > 65_536} onClick={() => void save(draft)}>
              Save it for this NFT
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : skill ? (
        <>
          <p>
            <strong>Claude Code</strong>{" "}
            <span className="ag-muted">(writes ~/.claude/skills/{skill.name}/SKILL.md; macOS, Linux, WSL or Git Bash)</span>
          </p>
          <pre className="ag-code ag-code--long">{install}</pre>
          <div className="ag-buttons">
            <Button variant="primary" onClick={() => void navigator.clipboard.writeText(install).then(() => setCopied(true))}>
              {copied ? "Copied" : "Copy the command"}
            </Button>
            <Button variant="secondary" icon={Download} onClick={() => downloadText("SKILL.md", skill.content)}>
              Download SKILL.md
            </Button>
            <Button variant="secondary" onClick={() => setDraft(skill.content)}>
              Replace it
            </Button>
          </div>
          <p className="ag-muted">
            Any other AI or chatbot: paste the SKILL.md as its instructions. Whoever holds the NFT next opens it the same way; you will not.
          </p>
        </>
      ) : (
        <div className="ag-buttons">
          {meta?.exists ? (
            <Button variant="primary" icon={KeyRound} busy={busy} disabled={busy} onClick={() => void open()}>
              Open the skill
            </Button>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => setDraft("")}>
              Add its skill
            </Button>
          )}
          <span className="ag-muted">One message to sign the first time (no transaction): it proves you hold the NFT.</span>
        </div>
      )}
      {slow && <WalletWait />}
    </section>
  );
}

/** The agent's skill: where it comes from, and how to install it (Claude Code, or any chatbot). */
function SkillInstall({ seat, account, holder, connect }: { seat: Seat; account: string; holder: string | null; connect: () => void }) {
  const link = seat.profile?.manifest || (ag.byoAgents()[seat.seat_id]?.source ? httpsLink(ag.byoAgents()[seat.seat_id]!.source!) : "");
  const [copied, setCopied] = useState(false);
  const gate = ag.parseGatedUrl(link);
  if (gate) return <GatedSkill seat={seat} gate={gate} account={account} holder={holder} connect={connect} />;
  if (!link) return null;
  const install = ag.skillInstall(link);
  const pinned = install?.commit ?? null;
  return (
    <section className="kp-vault-section ag-skill" aria-labelledby="ag-skill-title">
      <h2 id="ag-skill-title">Its skill</h2>
      <p className="ag-muted">
        This agent is defined by{" "}
        <a href={link} target="_blank" rel="noreferrer">
          {install ? `github.com/${install.owner}/${install.repo}${install.path ? `/${install.path}` : ""}${pinned ? ` @ ${pinned.slice(0, 7)}` : ""}` : link.replace(/^https:\/\//, "")} ↗
        </a>
        . The NFT carries the agent's name, its link and its record; the skill itself is installed in your own AI.
      </p>
      {pinned && (
        <p>
          <strong>Frozen at commit {pinned.slice(0, 7)}</strong>{" "}
          <span className="ag-muted">
            : the state it was handed over in. The install below gets exactly that version, whatever changed in the repo since.
          </span>
        </p>
      )}
      {install ? (
        <>
          <p>
            <strong>Claude Code</strong> <span className="ag-muted">(installs {install.what} into ~/.claude/skills; macOS, Linux, WSL or Git Bash)</span>
          </p>
          <pre className="ag-code">{install.claudeCode}</pre>
          <div className="ag-buttons">
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(install.claudeCode).then(() => setCopied(true))}>
              {copied ? "Copied" : "Copy the command"}
            </Button>
          </div>
          <p className="ag-muted">
            Then ask Claude Code to use it. Any other AI or chatbot: open the skill's <code>SKILL.md</code> on GitHub and paste it as
            the instructions.
          </p>
        </>
      ) : (
        <p className="ag-muted">Open the link and follow its instructions to run it in your own AI.</p>
      )}
    </section>
  );
}

/** A ready-to-send message: the link to the agent, and what the friend does with it. */
function SharePanel({ seat, name }: { seat: Seat; name: string }) {
  const [copied, setCopied] = useState(false);
  const message = ag.shareMessage(seat, name);
  const local = ag.isLocalUrl(ag.PUBLIC_URL);
  return (
    <div className="ag-share">
      <strong>Tell your friend</strong>
      <pre className="ag-code">{message}</pre>
      <div className="ag-buttons">
        <Button variant="primary" onClick={() => void navigator.clipboard.writeText(message).then(() => setCopied(true))}>
          {copied ? "Copied" : "Copy the message"}
        </Button>
      </div>
      {local && (
        <p className="ag-muted">
          This link points at this computer ({ag.PUBLIC_URL}). It works for your friend once the app is hosted (set VITE_PUBLIC_URL), or on
          their own copy of the app.
        </p>
      )}
    </div>
  );
}

/** One feed entry's identity across reads: its seat and its sequence number in that seat's log. */
const feedKey = (e: { seat: Seat; seq: string }) => `${e.seat.seat_id}-${e.seq}`;

/** The toast for something an agent just did, or was blocked from doing. */
function toastFor(e: FeedItem, job: Job | undefined, navigate: Nav): Toast {
  const amount = e.amount !== "0" ? ` ${ag.formatAsset(e.amount, e.seat.asset)}` : "";
  const to =
    e.counterparty && e.action !== "deliver"
      ? ` ${e.action === "buy" ? "on" : e.action === "claim" ? "from" : "to"} ${shortAccount(e.counterparty)}`
      : "";
  const blocked = e.status === "refused";
  return {
    id: feedKey(e),
    tone: e.status === "done" ? "up" : blocked || e.status === "failed" ? "down" : "neutral",
    title: `${nameFor(e.seat, job)} ${verb(e)}${amount}${to}`,
    body: blocked
      ? `Blocked on chain: ${e.detail}. Nothing was spent.`
      : e.status === "failed"
        ? `It failed and the money came back: ${e.detail}.`
        : ["pay", "buy", "deliver"].includes(e.action)
          ? "On its own, with its limited key: no signature from you."
          : undefined,
    onOpen: () => navigate(`/agents/${e.seat.seat_id}`),
  };
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
      // After layout settles (fonts, card sizes), centre the middle card once.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const mid = el.children[Math.floor((children.length - 1) / 2)] as HTMLElement | undefined;
          if (mid) el.scrollLeft = mid.offsetLeft + mid.offsetWidth / 2 - el.clientWidth / 2;
          measure();
        }),
      );
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
        {PICKER_ROLES.map((r) => {
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
  const initial = roleOf(new URLSearchParams(location.search).get("role") ?? undefined) ?? ALL_ROLES[0];
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
  const [byoKey, setByoKey] = useState<{ seat: Seat; file: ReturnType<typeof ag.agentKeyFile>; record: ag.ByoRecord } | null>(null);
  /** "Import an agent": who the agent is (shown on its card) and which tool runs it. */
  const [ident, setIdent] = useState<{ tool: ag.AgentTool; avatar: string; source: string; priv: boolean; skill: string }>({
    tool: "claude-code",
    avatar: "",
    source: "",
    priv: false,
    skill: "",
  });

  const [minting, setMinting] = useState(false);
  const slowHire = useSlow(phase === "creating" || phase === "funding" || minting);

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
      setError(ag.friendlyError(e));
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

  const skillLink = ident.source.trim();
  const privSkill = role.skillOnly && ident.priv;
  const skillBytes = new TextEncoder().encode(ident.skill).length;
  const problems = role.skillOnly
    ? [
        !pick ? "Pick the NFT that will carry the agent." : "",
        pick && taken[`${pick.contract}:${pick.token_id}`] ? "This NFT already has an agent." : "",
        !d.name.trim() ? "Give it a name." : "",
        !privSkill && !skillLink ? "Paste the link to the agent or skill (GitHub)." : "",
        privSkill && !ident.skill.trim() ? "Paste or upload its SKILL.md." : "",
        privSkill && skillBytes > 65_536 ? "The skill must be at most 64 KB." : "",
        privSkill && pick && ag.gatedUrl(pick.contract, pick.token_id).length > 160
          ? "This NFT's id is too long for a private skill link: pick another NFT."
          : "",
      ].filter(Boolean)
    : [
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
    !role.byo && role.kind === "Payer" && (!perPayee || !(every >= 1)) ? "Set the amount and how often." : "",
    !role.byo && role.kind === "Payer" && perPayee && perTx && perPayee > perTx ? "Each payment is above the cap per action." : "",
    !role.byo && role.kind === "Buyer" && !maxPrice ? "Set the highest price per card." : "",
  ].filter(Boolean);

  const summary = privSkill
    ? `${d.name.trim() || "Your agent"} goes on the NFT with a private skill: its text is stored encrypted, and only whoever holds the NFT can open it. Send the NFT and the access goes with it; the old holder loses it.`
    : role.skillOnly
    ? `${d.name.trim() || "Your agent"} goes on the NFT with a link to its skill${ag.parseGitHub(httpsLink(skillLink)) ? " on GitHub" : ""}, written on chain. No budget, no key, nothing to spend: whoever owns the NFT owns this agent card, and anyone you send it to gets the install steps.`
    : role.byo
    ? `Your own AI agent will ${role.kind === "Buyer" ? "buy Keepers in NEAR" : `pay in USDC, only to ${payees.length ? payees.map(shortAccount).join(", ") : "?"}`}, never more than ${d.perTx} ${asset} at once or ${d.perDay} ${asset} a day, from a ${d.budget} ${asset} budget. You get its key as a file; the contract enforces the limits whatever the AI decides.`
    : role.kind === "Buyer"
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
        const source = ident.source.trim();
        if (privSkill) {
          // First the skill, sealed for this NFT (one NEP-413 signature, no transaction): the runner checks we hold it.
          await ag.gatedWrite(account, pick!.contract, pick!.token_id, ag.skillFolder(ident.skill, d.name), ident.skill);
        }
        const profile = ag.profileFor({
          name: d.name.trim() || role.name,
          role: role.skillOnly ? ag.SKILL_ROLE : role.id,
          tool: role.byo ? ident.tool : "runner",
          avatar: role.byo ? ident.avatar : null,
          manifest: privSkill ? ag.gatedUrl(pick!.contract, pick!.token_id) : role.byo && source ? httpsLink(source) : null,
        });
        // An identity-only agent has no policy: the contract lets it spend nothing.
        const id = await ag.createSeat(pick!.contract, pick!.token_id, role.kind, role.skillOnly ? null : policy, profile);
        if (!id) throw new Error("The contract could not confirm you own this NFT. Your 0.1 NEAR was returned.");
        s = await ag.getSeat(id);
        setSeat(s);
        if (role.skillOnly) {
          setPhase("done");
          navigate(`/agents/${id}`);
          return;
        }
      }
      setPhase("funding");
      if (role.byo) {
        // The key is made here, in the browser; neither our runner nor any server sees the secret.
        const key = generateAgentKey();
        await ag.fundAndGrant(s!, budget ?? 0n, key.publicKey);
        const name = d.name.trim() || undefined;
        const record: ag.ByoRecord = {
          seatId: s!.seat_id,
          role: role.id,
          name,
          publicKey: key.publicKey,
          tool: ident.tool,
          avatar: ident.avatar || undefined,
          source: ident.source.trim() || undefined,
          hiredAt: Date.now(),
        };
        ag.rememberByo(record);
        const file = ag.agentKeyFile(s!, key, name);
        ag.downloadJson(`agent-${s!.seat_id}-key.json`, file);
        setByoKey({ seat: s!, file, record });
        setPhase("done");
        return;
      }
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
      setError(ag.friendlyError(e));
      setPhase("form");
    }
  }

  if (!account) return <ConnectFirst wallet={wallet} what="hire an agent" />;
  if (byoKey)
    return (
      <div className="ag-page">
        <ConnectYourAi seat={byoKey.seat} file={byoKey.file} record={byoKey.record} navigate={navigate} />
      </div>
    );
  const busy = phase === "creating" || phase === "funding";
  const RoleIcon = role.icon;

  return (
    <div className="ag-page">
      <button type="button" className="kp-back" onClick={() => navigate("/agents")}>
        ← Agent Wallet
      </button>
      {error && (
        <Notice tone="error" title="Not done">
          {error}
        </Notice>
      )}
      <section className="ag-stage ag-stage--hire" aria-labelledby="ag-hire-title">
      <div className="ag-room" aria-hidden="true" />
      <header className="ag-hire-head">
        <h1 id="ag-hire-title">Hire an agent</h1>
        <p className="ag-muted">Pick a job, the NFT that carries it and its limits. Two signatures, then it works on its own.</p>
      </header>

      <div className="ag-roles" role="radiogroup" aria-label="Role">
        {PICKER_ROLES.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={r.byo ? !!role.byo : role.id === r.id}
              className="ag-role"
              disabled={!!seat || busy}
              onClick={() => {
                if (r.byo && role.byo) return;
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

      <div className="ag-hire-layout">
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
                    <strong>{characterFromMedia(n.media) ? n.title : `${n.label} #${n.token_id}`}</strong>
                    {characterFromMedia(n.media) && <span>Characters</span>}
                    {taken[key] && <span>has an agent</span>}
                  </button>
                );
              })}
              {nfts.length === 0 && <p className="ag-muted">No NFT found in the known collections. Name one below.</p>}
            </div>
          )}
          <div className="ag-mint">
            <Button icon={Sparkles} busy={minting} disabled={!!seat || busy || minting} onClick={() => void mintTestNft()}>
              Mint a free Character NFT
            </Button>
            <span className="ag-muted">
              A real NFT on <code>{ag.EXAMPLE_NFT}</code>, NEAR's public example collection (not ours), with Characters
              art. One signature, 0.1 NEAR attached; unused storage is refunded.
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

        {role.byo && (
          <section className="ag-panel" aria-labelledby="ag-import">
            <h2 id="ag-import">
              <RoleIcon aria-hidden="true" className="ag-inline-icon" /> Your agent
            </h2>
            <p className="ag-muted">
              It keeps running where it already runs. This NFT gives it a budget and a key that can only act inside the
              limits below.
            </p>
            <div className="ag-form">
              <Select label="Which tool runs it?" value={ident.tool} onChange={(e) => setIdent({ ...ident, tool: e.target.value as ag.AgentTool })}>
                {ag.AGENT_TOOLS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <Input label="Its name" placeholder="My trading bot" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
              {role.skillOnly && (
                <label className="ag-check">
                  <input
                    type="checkbox"
                    checked={ident.priv}
                    disabled={!!seat || busy}
                    onChange={(e) => setIdent({ ...ident, priv: e.target.checked })}
                  />
                  <span>
                    <strong>Keep its skill private</strong>
                    <span className="ag-muted"> : only the NFT's holder can open it. Send the NFT and the access goes with it.</span>
                  </span>
                </label>
              )}
              {privSkill ? (
                <div className="ag-private-skill">
                  <label className="ag-field-label" htmlFor="ag-skill-text">
                    Its SKILL.md
                  </label>
                  <textarea
                    id="ag-skill-text"
                    className="ag-textarea"
                    rows={8}
                    spellCheck={false}
                    placeholder={"---\nname: my-skill\ndescription: What it does and when to use it.\n---\n\nInstructions for the AI..."}
                    value={ident.skill}
                    disabled={!!seat || busy}
                    onChange={(e) => setIdent({ ...ident, skill: e.target.value })}
                  />
                  <div className="ag-private-skill-row">
                    <label className="ag-upload">
                      Upload a .md file
                      <input
                        type="file"
                        accept=".md,.markdown,.txt,text/markdown,text/plain"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void f.text().then((skill) => setIdent((x) => ({ ...x, skill })));
                        }}
                      />
                    </label>
                    <span className="ag-muted">
                      {skillBytes ? `${(skillBytes / 1024).toFixed(1)} KB of 64 KB` : "Up to 64 KB."} Stored encrypted by the Agent Wallet
                      runner, never on chain.
                    </span>
                  </div>
                </div>
              ) : (
              <Input
                label={role.skillOnly ? "Link to the agent or skill" : "Source (optional)"}
                placeholder={role.skillOnly ? "github.com/janestreet/agent_skills" : "github.com/you/your-agent"}
                value={ident.source}
                onChange={(e) => setIdent({ ...ident, source: e.target.value })}
                hint={
                  role.skillOnly
                    ? "Written on chain with the agent; a GitHub link also gets one-command install steps. We never run its code."
                    : "Shown on its card as a link. We never run its code."
                }
              />
              )}
              <div className="ag-avatar-field">
                <span className="ag-avatar-preview" aria-hidden="true">
                  {ident.avatar ? <img src={ident.avatar} alt="" /> : <RoleIcon />}
                </span>
                <Input
                  label="Avatar (image URL)"
                  placeholder="https://example.com/avatar.png"
                  value={ident.avatar.startsWith("data:") ? "" : ident.avatar}
                  onChange={(e) => setIdent({ ...ident, avatar: e.target.value.trim() })}
                />
                <label className="ag-upload">
                  or upload
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void shrinkImage(f).then((avatar) => setIdent((x) => ({ ...x, avatar })));
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="ag-kinds" role="radiogroup" aria-label="What may it do?">
              {BYO_ROLES.map((r) => {
                const Icon = r.icon;
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={role.id === r.id}
                    className="ag-kind-pick"
                    disabled={!!seat || busy}
                    onClick={() => {
                      setRole(r);
                      setD((x) => ({ ...draftFor(r), name: x.name }));
                    }}
                  >
                    <Icon aria-hidden="true" />
                    <strong>{r.skillOnly ? "Just its identity" : r.kind === "Payer" ? "Pay in USDC" : "Buy Keepers in NEAR"}</strong>
                    <span>
                      {r.skillOnly
                        ? "No money: its name and a link to its skill, on the NFT."
                        : r.kind === "Payer"
                          ? "Only to the accounts you list."
                          : "Only on the Keepers market."}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!role.skillOnly && (
        <section className="ag-panel" aria-labelledby="ag-limits">
          <h2 id="ag-limits">
            <RoleIcon aria-hidden="true" className="ag-inline-icon" /> {role.byo ? "Its limits" : `${role.name}: rules`}
          </h2>
          <div className="ag-form">
            {!role.byo && (
              <Input label="Name (optional)" placeholder={role.name} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
            )}
            {role.byo && role.kind === "Buyer" ? null : role.kind === "Buyer" ? (
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
                {!role.byo && (
                <>
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
        )}
      </div>

      <aside className="ag-hire-side">
      <div className="ag-hire-preview" aria-label="Preview of your agent">
        <div className="ag-slide" data-focus="true">
          <NFTCard
            as="div"
            model={{
              id: "preview",
              name: d.name.trim() || role.name,
              description: characterFromMedia(pick?.media)?.description ?? role.tagline,
              image: pick ? images[`${pick.contract}:${pick.token_id}`] : null,
              imageAlt: pick ? `${pick.label} #${pick.token_id}` : "Pick an NFT",
              collection: characterFromMedia(pick?.media) ? "Characters" : (pick?.label ?? "Your NFT"),
              subtitle: role.name,
              avatar: <RoleIcon />,
              timer: { label: "new" },
              status: { label: "Preview", tone: "brand" },
              fact: { label: "Cap/day", value: `${d.perDay || "0"} ${asset}` },
              value: { label: "Budget", amount: `${d.budget || "0"} ${asset}` },
            }}
          />
        </div>
      </div>
      <section className="ag-confirm" aria-label="Confirm">
        <p className="ag-summary">{summary}</p>
        {role.skillOnly ? (
          <ol className="ag-sign-steps">
            {privSkill && (
              <li data-state={phase === "creating" ? "now" : "todo"}>
                One message to sign (no transaction): it proves you hold the NFT, and the skill is stored encrypted for it.
              </li>
            )}
            <li data-state={phase === "creating" ? "now" : "todo"}>
              One signature: put it on {pick ? `${pick.label} #${pick.token_id}` : "your NFT"} with its name and link on chain (0.1 NEAR
              storage, refunded if you close it).
            </li>
            <li data-state="todo">Then send the NFT to anyone: they claim the agent and get the steps to install its skill.</li>
          </ol>
        ) : (
        <ol className="ag-sign-steps">
          <li data-state={seat ? "done" : phase === "creating" ? "now" : "todo"}>Signature 1: create the agent on {pick ? `${pick.label} #${pick.token_id}` : "your NFT"}, with its limits on chain (0.1 NEAR storage, refunded on close).</li>
          <li data-state={phase === "done" ? "done" : phase === "funding" ? "now" : "todo"}>
            Signature 2: fund it with {d.budget || "0"} {asset} and give it a key that can only call <code>agent_pay</code>, <code>agent_buy</code> and <code>pause</code>, with no deposit.
          </li>
          <li data-state={phase === "done" ? "done" : "todo"}>Then nothing: it works on its own. Call it any time from the Ask bar.</li>
        </ol>
        )}
        <Button variant="primary" icon={KeyRound} busy={busy} disabled={problems.length > 0 || busy} onClick={() => void hire()}>
          {role.skillOnly ? "Put it on the NFT" : seat ? "Fund and start it" : `Hire the ${role.name}`}
        </Button>
        {problems.length > 0 && !busy && (
          <p className="ag-problems" role="status">
            <CircleX aria-hidden="true" className="ag-inline-icon" /> {problems[0]}
          </p>
        )}
        {slowHire && <WalletWait />}
      </section>
      </aside>
      </div>
      </section>
    </div>
  );
}


/** Shown once after "Import an agent": the key file, the setup for the chosen tool, and a live check. */
function ConnectYourAi({
  seat,
  file,
  record,
  navigate,
}: {
  seat: Seat;
  file: ReturnType<typeof ag.agentKeyFile>;
  record: ag.ByoRecord;
  navigate: Nav;
}) {
  const keyName = `agent-${seat.seat_id}-key.json`;
  const tool = record.tool ?? "claude-code";
  const toolLabel = ag.AGENT_TOOLS.find((t) => t.id === tool)?.label ?? "your agent";
  const setup = ag.mcpSetup(tool, ag.mcpName(record.name, seat.seat_id), keyName);
  const [first, setFirst] = useState<LogEntry | null>(null);
  const [copied, setCopied] = useState(false);

  // Live check: the first pay/buy the contract logs for this agent after it was hired.
  useEffect(() => {
    let stop = false;
    const since = BigInt(record.hiredAt ?? 0) * 1_000_000n;
    const tick = async () => {
      const entries = await ag.seatLog(seat.seat_id).catch(() => [] as LogEntry[]);
      const hit = entries.find((e) => (e.action === "pay" || e.action === "buy") && e.status !== "pending" && BigInt(e.at) >= since);
      if (!stop && hit) setFirst(hit);
      if (!stop && !hit) setTimeout(() => void tick(), 5000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [seat.seat_id, record.hiredAt]);

  return (
    <section className="ag-stage ag-connect" aria-labelledby="ag-connect-title">
      <div className="ag-room" aria-hidden="true" />
      <header className="ag-connect-head">
        <span className="ag-avatar-preview ag-avatar-preview--lg" aria-hidden="true">
          {record.avatar ? <img src={record.avatar} alt="" /> : <WalletCards />}
        </span>
        <div>
          <h1 id="ag-connect-title">{record.name || `Agent ${ag.seatLabel(seat.seat_id)}`} now lives in your NFT</h1>
          <p className="ag-muted">
            Connect it from {toolLabel}. Its key was made in this browser and downloaded as <code>{keyName}</code>; it is
            stored nowhere else.
          </p>
        </div>
      </header>
      <ol className="ag-connect-steps">
        <li>
          <strong>Keep the key file in a folder of your own</strong> (not a synced or shared one). It can only call{" "}
          <code>agent_pay</code>, <code>agent_buy</code> and <code>pause</code>, with no deposit: it cannot withdraw or move
          your NFT. Never commit or share it.
          <div className="ag-buttons">
            <Button icon={Download} onClick={() => ag.downloadJson(keyName, file)}>
              Download again
            </Button>
          </div>
        </li>
        <li>
          <strong>Add it to {toolLabel}.</strong> <span className="ag-muted">{setup.where}</span>
          <pre className="ag-code">{setup.snippet}</pre>
          <div className="ag-buttons">
            <Button
              variant="ghost"
              onClick={() =>
                void navigator.clipboard.writeText(setup.snippet).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </li>
        <li>
          <strong>Ask it something</strong>, for example: “
          {seat.kind === "Payer"
            ? `pay 1 USDC to ${seat.policy?.payees[0] ?? "an account on the list"} with agent ${seat.seat_id}`
            : `buy the cheapest Keeper under 0.5 NEAR with agent ${seat.seat_id}`}
          ”. Anything over the limits is refused on chain.
        </li>
      </ol>
      <div className="ag-firstmove" data-done={!!first} role="status" aria-live="polite">
        <span className="ag-firstmove-dot" aria-hidden="true" />
        {first ? (
          <span>
            Your agent made its first move: {first.action === "pay" ? "a payment" : "a purchase"}{" "}
            {first.status === "done" ? "went through" : `was ${first.status === "refused" ? "blocked" : first.status} (${first.detail})`}.
          </span>
        ) : (
          <span>Waiting for your agent's first action…</span>
        )}
      </div>
      <div className="ag-buttons">
        <Button variant="primary" onClick={() => navigate(`/agents/${seat.seat_id}`)}>
          Open the agent
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// /agents/:id — one agent
// ---------------------------------------------------------------------------

/**
 * Take over a seat after claiming it (or re-arm one that was reset): pick a job
 * of the same kind (or import your own AI), set limits and budget, then ONE
 * wallet request sets the policy, resumes, funds and gives the agent its key.
 */
/** Base units as a plain decimal for a form field, without rounding ("0.125"). */
const exactAmount = (v: string, asset: "NEAR" | "USDC") => {
  const decimals = asset === "NEAR" ? 24 : 6;
  const n = BigInt(v);
  const unit = 10n ** BigInt(decimals);
  const frac = (n % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${n / unit}${frac ? `.${frac}` : ""}`;
};

/**
 * The limits the agent had before it changed hands, found on chain, with how it did
 * under them. The new owner can start from them instead of from scratch.
 */
function ProvenLimits({ seat, log, onUse }: { seat: Seat; log: LogEntry[]; onUse: (p: Policy) => void }) {
  const [past, setPast] = useState<ag.PastLimits | null | undefined>();
  const [used, setUsed] = useState(false);
  // Only a new claim changes the answer: do not refetch on every live refresh.
  const claims = log.filter((e) => e.action === "claim").map((e) => e.seq).join(",");
  useEffect(() => {
    if (!claims) return setPast(null);
    let alive = true;
    void ag.previousLimits(seat, log).then(
      (p) => alive && setPast(p),
      () => alive && setPast(null),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seat.seat_id, claims]);
  if (past === undefined) return claims ? <Skeleton label="Looking for its previous limits on chain" /> : null;
  if (!past) return null;
  const { policy } = past;
  const paysOwner = policy.payees.includes(past.owner);
  return (
    <div className="ag-proven" role="group" aria-labelledby="ag-proven-title">
      <strong id="ag-proven-title">Its proven limits</strong>
      <p>
        {ag.formatAsset(policy.per_tx_max, seat.asset)} per action · {ag.formatAsset(policy.per_day_max, seat.asset)} a day
        {seat.kind === "Payer" && policy.payees.length > 0 && <> · pays {policy.payees.map(shortAccount).join(", ")}</>}
        {seat.kind === "Buyer" && policy.market && <> · buys on {shortAccount(policy.market)}</>}
      </p>
      <p className="ag-muted">
        Set by {shortAccount(past.owner)} on {new Date(Number(past.setAt / 1_000_000n)).toLocaleDateString()} (
        <a href={`${EXPLORER}/txns/${past.tx}`} target="_blank" rel="noreferrer">
          transaction
        </a>
        ). Under them, the agent did {past.done} action{past.done === 1 ? "" : "s"} and the contract blocked {past.blocked}.
      </p>
      {paysOwner && (
        <p className="ag-muted">One account on the list is its previous owner: remove it unless you mean to pay them.</p>
      )}
      <div className="ag-buttons">
        <Button
          variant="secondary"
          onClick={() => {
            onUse(policy);
            setUsed(true);
          }}
        >
          {used ? "Filled in below" : "Start from these limits"}
        </Button>
        <span className="ag-muted">They fill the form; change anything before you sign.</span>
      </div>
    </div>
  );
}

function TakeOverPanel({
  seat,
  account,
  log,
  navigate,
  onDone,
}: {
  seat: Seat;
  account: string;
  log: LogEntry[];
  navigate: Nav;
  onDone: () => void;
}) {
  const choices = ALL_ROLES.filter((r) => r.kind === seat.kind && (r.byo ? r === BYO_ROLES.find((b) => b.kind === seat.kind) : true));
  const [role, setRole] = useState<Role>(choices[0]);
  const [d, setD] = useState<Draft>(draftFor(choices[0]));
  const [tool, setTool] = useState<ag.AgentTool>("claude-code");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connect, setConnect] = useState<{ snippet: string; where: string; file: string } | null>(null);
  const slow = useSlow(busy);
  const asset = seat.asset;
  const perTx = ag.parseAsset(d.perTx, asset);
  const perDay = ag.parseAsset(d.perDay, asset);
  const budget = ag.parseAsset(d.budget, asset);
  const payees = d.payees.split(/[\s,]+/).filter(Boolean);
  const maxPrice = ag.parseAsset(d.maxPrice, "NEAR");
  const amount = ag.parseAsset(d.amount, "USDC");
  const every = Number(d.every);
  const problem =
    !perTx || !perDay || perDay < perTx
      ? "Set the caps (the daily cap must be at least the cap per action)."
      : budget === null
        ? "Set the budget."
        : seat.kind === "Payer" && (payees.length === 0 || payees.length > 10)
          ? "List 1 to 10 accounts it may pay."
          : !role.byo && seat.kind === "Buyer" && !maxPrice
            ? "Set the highest price per card."
            : !role.byo && seat.kind === "Payer" && (!amount || !(every >= 1))
              ? "Set the amount and how often."
              : "";

  async function setUp() {
    setBusy(true);
    setError("");
    try {
      const policy: Policy = {
        per_tx_max: perTx!.toString(),
        per_day_max: perDay!.toString(),
        payees: seat.kind === "Payer" ? payees : [],
        market: seat.kind === "Buyer" ? ag.MARKET : null,
      };
      const name = d.name.trim() || undefined;
      if (role.byo) {
        const key = generateAgentKey();
        await ag.setupSeat(seat, policy, budget ?? 0n, key.publicKey);
        ag.rememberByo({ seatId: seat.seat_id, role: role.id, name, publicKey: key.publicKey, tool, hiredAt: Date.now() });
        const file = `agent-${seat.seat_id}-key.json`;
        ag.downloadJson(file, ag.agentKeyFile(seat, key, name));
        setConnect({ ...ag.mcpSetup(tool, ag.mcpName(name, seat.seat_id), file), file });
      } else {
        const publicKey = await ag.runnerNewKey(account);
        await ag.setupSeat(seat, policy, budget ?? 0n, publicKey);
        await ag.runnerSaveJob({
          seatId: seat.seat_id,
          accountId: account,
          publicKey,
          kind: seat.kind,
          role: role.id,
          name,
          buyer: seat.kind === "Buyer" ? { maxPrice: maxPrice!.toString(), minTier: Number(d.minTier) } : undefined,
          payer:
            seat.kind === "Payer"
              ? { payments: payees.map((p) => ({ payee: p, amount: amount!.toString(), everySeconds: every * UNIT_SECONDS[d.unit], memo: role.name.toLowerCase() })) }
              : undefined,
        });
      }
      onDone();
    } catch (e) {
      setError(ag.friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (connect)
    return (
      <section className="ag-stage ag-takeover" aria-labelledby="ag-takeover-title">
        <div className="ag-room" aria-hidden="true" />
        <h2 id="ag-takeover-title">Your agent is set up: connect your AI</h2>
        <p className="ag-muted">
          The key file <code>{connect.file}</code> was downloaded. Keep it in a folder of your own. {connect.where}:
        </p>
        <pre className="ag-code">{connect.snippet}</pre>
        <div className="ag-buttons">
          <Button variant="primary" onClick={() => navigate(`/agents/${seat.seat_id}`)}>
            Done
          </Button>
        </div>
      </section>
    );

  return (
    <section className="ag-stage ag-takeover" aria-labelledby="ag-takeover-title">
      <div className="ag-room" aria-hidden="true" />
      <h2 id="ag-takeover-title">Set up this agent</h2>
      <p className="ag-muted">
        It is yours now, with its history but no limits, no budget and no key. Choose what it does, then one wallet request
        sets everything.
      </p>
      <ProvenLimits
        seat={seat}
        log={log}
        onUse={(p) =>
          setD((x) => ({
            ...x,
            perTx: exactAmount(p.per_tx_max, seat.asset),
            perDay: exactAmount(p.per_day_max, seat.asset),
            payees: seat.kind === "Payer" ? p.payees.join(", ") : x.payees,
          }))
        }
      />
      {error && (
        <Notice tone="error" title="Not done">
          {error}
        </Notice>
      )}
      <div className="ag-roles" role="radiogroup" aria-label="Job">
        {choices.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={role.id === r.id}
              className="ag-role"
              disabled={busy}
              onClick={() => {
                setRole(r);
                setD((x) => ({ ...draftFor(r), name: x.name }));
              }}
            >
              <Icon aria-hidden="true" />
              <strong>{r.name}</strong>
              <span>{r.tagline}</span>
            </button>
          );
        })}
      </div>
      <div className="ag-form">
        <Input label="Name (optional)" placeholder={role.name} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        {role.byo && (
          <Select label="Which tool runs your AI?" value={tool} onChange={(e) => setTool(e.target.value as ag.AgentTool)}>
            {ag.AGENT_TOOLS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        )}
        {seat.kind === "Payer" && (
          <Input
            label="Accounts it may pay (comma separated)"
            placeholder="shop.testnet"
            value={d.payees}
            onChange={(e) => setD({ ...d, payees: e.target.value })}
          />
        )}
        {!role.byo && seat.kind === "Buyer" && (
          <Input label="Highest price per card (NEAR)" inputMode="decimal" value={d.maxPrice} onChange={(e) => setD({ ...d, maxPrice: e.target.value })} />
        )}
        {!role.byo && seat.kind === "Payer" && (
          <>
            <Input label="USDC each time" inputMode="decimal" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} />
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
        <Input label={`Cap per action (${asset})`} inputMode="decimal" value={d.perTx} onChange={(e) => setD({ ...d, perTx: e.target.value })} />
        <Input label={`Cap per day (${asset})`} inputMode="decimal" value={d.perDay} onChange={(e) => setD({ ...d, perDay: e.target.value })} />
        <Input label={`Budget (${asset})`} inputMode="decimal" value={d.budget} onChange={(e) => setD({ ...d, budget: e.target.value })} />
      </div>
      <div className="ag-buttons">
        <Button variant="primary" icon={KeyRound} busy={busy} disabled={!!problem || busy} onClick={() => void setUp()}>
          Set up and start ({role.byo ? "your AI" : role.name})
        </Button>
      </div>
      {problem && !busy && (
        <p className="ag-problems" role="status">
          <CircleX aria-hidden="true" className="ag-inline-icon" /> {problem}
        </p>
      )}
      {slow && <WalletWait />}
    </section>
  );
}

/**
 * What changes hands with the NFT, in one card: who the agent is, its skill, its record,
 * its budget and limits, and its price on the agent market. Everything here is read from chain.
 */
function AgentPassport({ seat, name, listing }: { seat: Seat; name: string; listing: ag.AgentListing | null }) {
  const [lastSale, setLastSale] = useState<ag.AgentSale | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (seat.version !== "v2") return;
    let alive = true;
    void ag.agentSales().then((sales) => {
      if (alive) setLastSale(sales.find((s) => s.nft_contract === seat.nft_contract && s.token_id === seat.token_id) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [seat.version, seat.nft_contract, seat.token_id]);
  const link = seat.profile?.manifest ?? null;
  const gh = ag.skillInstall(link ?? "");
  const skill = ag.parseGatedUrl(link)
    ? "Private: only the NFT's holder can open it"
    : gh
      ? `github.com/${gh.owner}/${gh.repo}${gh.commit ? ` @ ${gh.commit.slice(0, 7)} (frozen)` : ""}`
      : link
        ? link.replace(/^https:\/\//, "")
        : "None linked";
  const owners = seat.owners ?? 1;
  const days = ag.ageDays(seat);
  const since = new Date(Number(BigInt(seat.created_at) / 1_000_000n)).toLocaleDateString();
  const summary = `${name} (${ag.shareLink(seat)}): ${ag.agentRecord(seat)}${
    ag.budgetGoesWithNft(seat) ? `; its ${ag.formatAsset(seat.balance, seat.asset)} budget comes with it` : ""
  }${listing ? `; for sale at ${nearText(listing.price)}` : ""}.`;
  return (
    <section className="kp-vault-section ag-passport" aria-labelledby="ag-passport-title">
      <h2 id="ag-passport-title">What comes with this NFT</h2>
      <p className="ag-muted">
        Whoever holds the NFT gets all of this. The record, budget and price are read from the contracts: nobody can edit them.
      </p>
      <dl className="ag-passport-grid">
        <div>
          <dt>Identity</dt>
          <dd>
            <strong>{name}</strong>
            {seat.profile?.role && <span className="ag-muted"> · {seat.profile.role}</span>}
            {seat.profile?.tool && <span className="ag-muted"> · runs in {seat.profile.tool}</span>}
          </dd>
        </div>
        <div>
          <dt>Skill</dt>
          <dd>{skill}</dd>
        </div>
        <div>
          <dt>Track record</dt>
          <dd>
            <strong>{seat.done}</strong> done · <strong>{seat.refused}</strong> blocked by the contract
            {seat.failed ? ` · ${seat.failed} failed` : ""}
            <br />
            <span className="ag-muted">{ag.formatAsset(seat.spent_total, seat.asset)} spent in total</span>
          </dd>
        </div>
        <div>
          <dt>History</dt>
          <dd>
            Since {since} <span className="ag-muted">({days < 1 ? "today" : `${days} day${days > 1 ? "s" : ""}`})</span>
            <br />
            {seat.version === "v2" ? (
              <span className="ag-muted">
                {owners} owner{owners > 1 ? "s" : ""} so far
              </span>
            ) : (
              <span className="ag-muted">v1 agent: no owner count</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Budget</dt>
          <dd>
            <strong>{ag.formatAsset(seat.balance, seat.asset)}</strong>
            <br />
            <span className="ag-muted">
              {seat.balance === "0"
                ? "Nothing in it"
                : ag.budgetGoesWithNft(seat)
                  ? "Goes to the next owner (promised on chain)"
                  : "Stays with its owner on a sale"}
            </span>
          </dd>
        </div>
        <div>
          <dt>Limits</dt>
          <dd>
            {seat.policy ? (
              <>
                {ag.formatAsset(seat.policy.per_tx_max, seat.asset)} per action · {ag.formatAsset(seat.policy.per_day_max, seat.asset)} a day
                <br />
                <span className="ag-muted">The next owner sets their own</span>
              </>
            ) : (
              <span className="ag-muted">{ag.isSkillSeat(seat) ? "None: it spends nothing" : "None set: the next owner sets them"}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Market</dt>
          <dd>
            {listing ? <strong>For sale: {nearText(listing.price)}</strong> : <span className="ag-muted">Not for sale</span>}
            {lastSale && (
              <>
                <br />
                <span className="ag-muted">
                  Last sold {nearText(lastSale.price)} on {new Date(Number(BigInt(lastSale.at) / 1_000_000n)).toLocaleDateString()}
                </span>
              </>
            )}
          </dd>
        </div>
      </dl>
      <div className="ag-buttons">
        <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(summary).then(() => setCopied(true))}>
          {copied ? "Copied" : "Copy its card"}
        </Button>
        <span className="ag-muted">One line to paste in a chat or a listing, with its link.</span>
      </div>
    </section>
  );
}

/** The agent market's live listing for this agent (null when not for sale, or stale). */
function useListing(seat: Seat | null | undefined, holder: string | null) {
  const [listing, setListing] = useState<ag.AgentListing | null>(null);
  const v2 = seat?.version === "v2";
  const [contract, token] = [seat?.nft_contract ?? "", seat?.token_id ?? ""];
  const reload = useCallback(() => {
    if (!v2) return setListing(null);
    void ag.agentListing(contract, token).then(setListing);
  }, [v2, contract, token]);
  useEffect(reload, [reload]);
  // An approval left behind after the NFT moved, or for another agent, sells nothing.
  const live = seat && listing && listing.seat_id === seat.num && (!holder || listing.seller === holder) ? listing : null;
  return [live, reload] as const;
}

const nearText = (yocto: string | bigint) => ag.formatAsset(BigInt(yocto), "NEAR");

/** The agent's owner puts it on the agent market, with or without its budget. */
function SellPanel({ seat, listing, onChange }: { seat: Seat; listing: ag.AgentListing | null; onChange: () => void }) {
  const [price, setPrice] = useState("");
  const [withBudget, setWithBudget] = useState(seat.balance !== "0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const slow = useSlow(busy);
  const yocto = ag.parseAsset(price, "NEAR");
  const act = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await f();
      onChange();
    } catch (e) {
      setError(ag.friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  if (seat.version !== "v2") return null;
  if (listing)
    return (
      <div className="ag-transfer ag-sell">
        <Notice tone="info" title={`For sale at ${nearText(listing.price)}`}>
          {listing.budget !== "0"
            ? `With its budget: the buyer gets at least ${ag.formatAsset(listing.budget, seat.asset)}. The agent stays paused until it is sold.`
            : "Without its budget."}{" "}
          You are paid the moment someone buys it.{" "}
          <Button variant="secondary" busy={busy} disabled={busy} onClick={() => void act(() => ag.delistAgent(listing))}>
            Take it off the market
          </Button>
        </Notice>
        {error && (
          <Notice tone="error" title="Not done">
            {error}
          </Notice>
        )}
        {slow && <WalletWait />}
      </div>
    );
  return (
    <details className="ag-transfer ag-sell">
      <summary>Sell this agent</summary>
      <ul className="ag-transfer-facts">
        <li>
          Listed on the agent market (<code>{shortAccount(ag.AGENT_MARKET)}</code>, no fee). The buyer gets the NFT with the agent's name,
          its skill and its record ({seat.done} done, {seat.refused} blocked, {seat.owners ?? 1} owner{(seat.owners ?? 1) > 1 ? "s" : ""}).
        </li>
        <li>You are paid only once the NFT has moved and the budget you promised is still in the agent; otherwise the buyer is refunded.</li>
      </ul>
      {seat.balance !== "0" && (
        <label className="ag-check">
          <input type="checkbox" checked={withBudget} onChange={(e) => setWithBudget(e.target.checked)} />
          <span>
            Sell it with its budget of {ag.formatAsset(seat.balance, seat.asset)}{" "}
            <span className="ag-muted">(the agent is paused until it is sold, and the budget is promised to the buyer on chain)</span>
          </span>
        </label>
      )}
      {error && (
        <Notice tone="error" title="Not listed">
          {error}
        </Notice>
      )}
      <div className="kp-action-row">
        <Input label="Price (NEAR)" inputMode="decimal" placeholder="1" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Button
          variant="primary"
          busy={busy}
          disabled={!yocto || yocto <= 0n || busy}
          onClick={() => void act(() => ag.listAgent(seat, yocto!, withBudget && seat.balance !== "0"))}
        >
          Put it on sale
        </Button>
      </div>
      <p className="kp-hint">
        One wallet request: {withBudget && seat.balance !== "0" ? "pause the agent and promise its budget, then " : ""}let the market sell the
        NFT at this price.
      </p>
      {slow && <WalletWait />}
    </details>
  );
}

/** Anyone else sees the agent's price and buys it. */
function ForSalePanel({
  seat,
  listing,
  account,
  connect,
  onBought,
}: {
  seat: Seat;
  listing: ag.AgentListing;
  account: string;
  connect: () => void;
  onBought: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ bought: boolean; reason?: string; claimed?: boolean } | null>(null);
  const [step, setStep] = useState<"buy" | "claim">("buy");
  const slow = useSlow(busy);
  async function buy() {
    setBusy(true);
    setError("");
    setStep("buy");
    try {
      const r = await ag.buyAgent(listing, account);
      let claimed = false;
      if (r.bought && !r.reason) {
        // The NFT is theirs: take the agent over at once, so nothing is left to find and do.
        setStep("claim");
        try {
          await ag.claimSeat(seat);
          claimed = true;
        } catch {
          // Refused or closed the wallet: the claim button stays on the page.
        }
      }
      setResult({ ...r, claimed });
      onBought();
    } catch (e) {
      setError(ag.friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  if (result)
    return result.bought && !result.reason ? (
      <Notice tone="success" title={result.claimed ? "Bought and claimed: it is yours" : "Bought: the NFT is yours"}>
        {result.claimed
          ? `The agent is yours${listing.budget !== "0" ? `, with its budget of ${ag.formatAsset(listing.budget, seat.asset)}` : ""}. Set it up below.`
          : `Claim the agent on this page (one signature)${listing.budget !== "0" ? ` to receive its budget of ${ag.formatAsset(listing.budget, seat.asset)}` : ""}.`}
      </Notice>
    ) : (
      <Notice tone="info" title="Not sold: your NEAR came back">
        The market refunded {nearText(listing.price)}: {result.reason}.{result.bought ? " You keep the NFT as well." : ""}
      </Notice>
    );
  return (
    <section className="kp-vault-section ag-for-sale" aria-labelledby="ag-for-sale-title">
      <h2 id="ag-for-sale-title">For sale: {nearText(listing.price)}</h2>
      <ul className="ag-transfer-facts">
        <li>
          {listing.budget !== "0" ? (
            <>
              <strong>With its budget</strong>: at least {ag.formatAsset(listing.budget, seat.asset)} stays in the agent for you (it holds{" "}
              {ag.formatAsset(seat.balance, seat.asset)} now).
            </>
          ) : (
            "Without a budget: you get the NFT, the agent's name, skill and record."
          )}
        </li>
        <li>
          Its record comes along: {seat.done} done, {seat.refused} blocked, {ag.formatAsset(seat.spent_total, seat.asset)} spent,{" "}
          {seat.owners ?? 1} owner{(seat.owners ?? 1) > 1 ? "s" : ""} so far.
        </li>
        <li>
          The market (<code>{shortAccount(ag.AGENT_MARKET)}</code>, no admin key) pays {shortAccount(listing.seller)} only once the NFT is yours and
          the budget is still there. If anything is off, you get your NEAR back.
        </li>
      </ul>
      {error && (
        <Notice tone="error" title="Not bought">
          {error}
        </Notice>
      )}
      <div className="ag-buttons">
        {account ? (
          <Button variant="primary" icon={WalletCards} busy={busy} disabled={busy} onClick={() => void buy()}>
            Buy it for {nearText(listing.price)}
          </Button>
        ) : (
          <Button variant="primary" icon={WalletIcon} onClick={connect}>
            Connect a wallet to buy it
          </Button>
        )}
        <span className="ag-muted">
          {busy && step === "claim"
            ? "Bought. Second signature: claim the agent."
            : "Two signatures in a row: buy it, then claim it. Its limits are yours to set."}
        </span>
      </div>
      {slow && <WalletWait />}
    </section>
  );
}

/**
 * Hand the NFT to someone else. One wallet request: take the budget back
 * (optional), switch this agent off and delete its key, then transfer the NFT.
 */
function TransferPanel({ seat, name, navigate }: { seat: Seat; name: string; navigate: Nav }) {
  const [sent, setSent] = useState("");
  const [to, setTo] = useState("");
  const [budget, setBudget] = useState<"withdraw" | "set-aside" | "follow">(seat.budget_follows ? "follow" : "withdraw");
  // v2 agents whose skill link points to GitHub: freeze it on the commit of the handover.
  const skillLink = seat.version === "v2" ? seat.profile?.manifest ?? null : null;
  const github = ag.parseGitHub(skillLink);
  const [head, setHead] = useState<string | null>(null);
  const [freeze, setFreeze] = useState(true);
  useEffect(() => {
    if (!skillLink || !github) return;
    let alive = true;
    void ag.latestCommit(skillLink).then((sha) => alive && setHead(sha));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillLink]);
  const frozen = freeze && head && skillLink ? ag.pinnedLink(skillLink, head) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const slow = useSlow(busy);
  const receiver = to.trim().toLowerCase();
  const valid = /^[a-z0-9._-]{2,64}$/.test(receiver) && receiver !== seat.owner;

  async function transfer() {
    setBusy(true);
    setError("");
    try {
      if (!(await ag.accountExists(receiver))) throw new Error(`${receiver} does not exist on testnet. Check the spelling.`);
      await ag.transferSeatNft(seat, receiver, seat.balance === "0" ? "set-aside" : budget, frozen);
      setSent(receiver);
    } catch (e) {
      setError(ag.friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <div className="ag-transfer">
        <Notice tone="success" title={`It is in ${shortAccount(sent)}'s wallet`}>
          Nothing to send them. When they open the Agent Wallet with that account, {name} is waiting at the top of the page: one
          signature and it is theirs.{" "}
          <button type="button" className="ag-qs-change" onClick={() => navigate("/agents")}>
            Back to my agents
          </button>
        </Notice>
        <details className="ag-share-optional">
          <summary>Tell them anyway (optional)</summary>
          <SharePanel seat={seat} name={name} />
        </details>
      </div>
    );

  return (
    <details className="ag-transfer">
      <summary>Transfer this NFT</summary>
      <ul className="ag-transfer-facts">
        <li>
          The agent stays on the NFT with its {seat.version === "v2" ? "profile and " : ""}history; the new owner claims it and
          sets their own limits and AI.
        </li>
        <li>Your agent's key is switched off and deleted from your account in the same request.</li>
      </ul>
      {github && (
        <label className="ag-check">
          <input type="checkbox" checked={freeze && !!head} disabled={!head} onChange={(e) => setFreeze(e.target.checked)} /> Hand it over as
          it is now: freeze its skill on{" "}
          {head ? (
            <>
              commit <code>{head.slice(0, 7)}</code> of {github.owner}/{github.repo}
            </>
          ) : (
            "the latest commit (reading GitHub…)"
          )}
          <span className="ag-muted"> (written on chain with the transfer; your later changes do not reach the new owner)</span>
        </label>
      )}
      {seat.balance !== "0" && (
        <fieldset className="ag-budget-choice">
          <legend>Its budget of {ag.formatAsset(seat.balance, seat.asset)}</legend>
          <label>
            <input type="radio" name={`budget-${seat.seat_id}`} checked={budget === "withdraw"} onChange={() => setBudget("withdraw")} /> Comes back to
            my wallet now
          </label>
          {seat.version === "v2" && (
            <label>
              <input type="radio" name={`budget-${seat.seat_id}`} checked={budget === "follow"} onChange={() => setBudget("follow")} /> Goes to the
              new owner with the agent <span className="ag-muted">(held on chain until they claim it)</span>
            </label>
          )}
          <label>
            <input type="radio" name={`budget-${seat.seat_id}`} checked={budget === "set-aside"} onChange={() => setBudget("set-aside")} /> Stays mine,
            set aside to withdraw later
          </label>
        </fieldset>
      )}
      {error && (
        <Notice tone="error" title="Not done">
          {error}
        </Notice>
      )}
      <div className="kp-action-row">
        <Input label="New owner (NEAR account)" placeholder="friend.testnet" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button variant="danger" busy={busy} disabled={!valid || busy} onClick={() => void transfer()}>
          Transfer
        </Button>
      </div>
      {slow && <WalletWait />}
    </details>
  );
}

export function AgentPage({ id, wallet, navigate }: { id: string; wallet: Wallet; navigate: Nav }) {
  const account = wallet.account;
  const [seat, setSeat] = useState<Seat | null | undefined>();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [logTx, setLogTx] = useState<Record<string, string>>({});
  const linkedSeq = useRef("");
  const [nftOwner, setNftOwner] = useState<string | null>(null);
  const [gasLeft, setGasLeft] = useState<string | null | undefined>();
  const [fund, setFund] = useState("");
  const [mission, setMission] = useState<{ maxPrice: string; amount: string; every: string } | null>(null);
  const runner = useRunner(account || seat?.owner || "");
  const job = runner.jobs.find((j) => j.seatId === id);
  const fresh = useFresh(id);
  const { toasts, push, dismiss } = useToasts();
  const jobRef = useRef<Job | undefined>(undefined);
  jobRef.current = job;

  const load = useCallback(async () => {
    const s = await ag.getSeat(id);
    setSeat(s);
    if (!s) return;
    const entries = await ag.seatLog(id);
    setLog(entries);
    const added = new Set(fresh.take(entries.filter((e) => e.status !== "pending").map((e) => e.seq)));
    for (const e of entries.filter((x) => added.has(x.seq) && x.status !== "info").slice(0, 3).reverse())
      push({ ...toastFor({ ...e, seat: s }, jobRef.current, () => {}), id: e.seq, onOpen: undefined });
    const newest = entries[0]?.seq ?? "";
    if (entries.length && newest !== linkedSeq.current)
      void ag
        .ownerTxs(s.owner, BigInt(entries.at(-1)!.at) - 60_000_000_000n, 20_000, [s.contract])
        .then((txs) => {
          const m: Record<string, string> = {};
          for (const e of entries) {
            const h = ag.txForEntry(e, txs, s.contract);
            if (h) m[e.seq] = h;
          }
          // Retry on a later refresh if the newest entry is not linked yet (explorer lag or rate limit).
          if (m[newest]) linkedSeq.current = newest;
          setLogTx(m);
        })
        .catch(() => {});
    setNftOwner(await ag.nftOwner(s.nft_contract, s.token_id).catch(() => null));
    setGasLeft(s.agent_key ? await ag.keyAllowance(s.owner, s.agent_key) : undefined);
    void runner.reload();
  }, [id, runner.reload, fresh.take, push]);
  const live = useLivePoll(load, 6000);
  const { busy, run, notice } = useAction(load);
  const images = useImages(seat ? [{ key: "art", contract: seat.nft_contract, token: seat.token_id }] : []);
  const [listing, reloadListing] = useListing(seat, nftOwner);

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
  const st = statusOf(seat, job, nftOwner, runner.up, runner.locked);
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
    run("grant", role.byo ? "New key made and downloaded: give it to your AI" : "Access given: the agent can act again", async () => {
      if (role.byo) {
        const key = generateAgentKey();
        const r = await ag.fundAndGrant(seat, 0n, key.publicKey);
        const name = ag.byoAgents()[seat.seat_id]?.name;
        ag.rememberByo({ seatId: seat.seat_id, role: role.id, name, publicKey: key.publicKey });
        ag.downloadJson(`agent-${seat.seat_id}-key.json`, ag.agentKeyFile(seat, key, name));
        return r;
      }
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
      <section className="ag-stage ag-stage--detail" aria-label={nameFor(seat, job)}>
        <div className="ag-room" aria-hidden="true" />
        <div className="ag-detail-card">
          <div className="ag-slide" data-focus="true">
            <NFTCard as="div" model={seatModel(seat, job, role, st, images.art, log.find((e) => e.status !== "info")?.at)} />
          </div>
        </div>
        <div className="ag-detail-info">
          <p className="ag-detail-role">
            <RoleIcon aria-hidden="true" className="ag-inline-icon" />{" "}
            {ag.isSkillSeat(seat) ? "Agent skill on an NFT, no money" : `${role.name}, ${seat.kind === "Buyer" ? "spends NEAR" : "pays USDC"}`}
          </p>
          <h1>
            {nameFor(seat, job)} <Badge tone={st.tone}>{st.label}</Badge>
          </h1>
          <p className="ag-muted">
            Lives on{" "}
            <a href={nftHref(seat.nft_contract, seat.token_id)} target={seat.nft_contract.startsWith("keepers-") ? undefined : "_blank"} rel="noreferrer">
              {collectionLabel(seat.nft_contract)} #{seat.token_id}
            </a>
            , owned by {shortAccount(seat.owner)}. {st.note}
          </p>
          {ag.isSkillSeat(seat) ? (
            <p className="ag-muted">
              Whoever owns this NFT owns the agent card: its name, its skill link and its record. Send the NFT and it changes hands.
            </p>
          ) : (
          <>
          <div className="ag-detail-money">
            <span className="ag-muted">Budget left</span>
            <strong className="kp-num">{ag.formatAsset(seat.balance, seat.asset)}</strong>
          </div>
          <div className="ag-stats" aria-label="This agent">
            <Stat label="Spent today" value={ag.formatAsset(seat.spent_today, seat.asset)} sub={`daily cap ${ag.formatAsset(cap, seat.asset)}`} />
            <Stat label="Spent in total" value={ag.formatAsset(seat.spent_total, seat.asset)} />
            <Stat label="Done / blocked / failed" value={`${seat.done} / ${seat.refused} / ${seat.failed}`} />
            <Stat
              label="Gas left on its key"
              value={gasLeft ? ag.formatAsset(gasLeft, "NEAR") : seat.agent_key ? "key removed" : "no key"}
              sub={seat.agent_key ? `${seat.agent_key.slice(0, 16)}…` : undefined}
            />
          </div>
          </>
          )}
        </div>
      </section>
      {notice}
      {mine && seat.held_for_next_owner && nftOwner !== account && (
        <Notice tone="info" title="Budget left to the new owner">
          You sold this NFT with its budget: {ag.formatAsset(seat.balance, seat.asset)} waits on chain for whoever claims the agent.
        </Notice>
      )}
      {canClaim && (
        <Notice tone="info" title="You own this NFT now">
          The agent still belongs to {shortAccount(seat.owner)}. Claim it (one signature), then set it up with your own
          limits and AI.{" "}
          {seat.held_for_next_owner
            ? `Its budget of ${ag.formatAsset(seat.balance, seat.asset)} was left to you: it is yours once you claim.`
            : seat.budget_follows
              ? `Its owner chose to leave its budget (${ag.formatAsset(seat.balance, seat.asset)}) to the next owner.`
              : "Its budget stays with the previous owner."}{" "}
          <Button variant="primary" busy={busy === "claim"} onClick={() => run("claim", "Agent claimed: now set it up below", () => ag.claimSeat(seat))}>
            Claim the agent
          </Button>
        </Notice>
      )}
      {mine && nftOwner && nftOwner !== account && (
        <Notice tone="info" title="You no longer own this NFT">
          The agent is stopped. Your budget is still yours: withdraw it below.
        </Notice>
      )}
      {mine && <RunnerLockedNotice runner={runner} />}
      {!account && !listing && (
        <Notice tone="info" title="Was this NFT sent to you?">
          Connect your NEAR testnet wallet: if you own it now, you can claim this agent{seat.profile ? ` (${seat.profile.name})` : ""} with one
          signature.{" "}
          <Button variant="primary" icon={WalletIcon} onClick={() => void wallet.connect()}>
            Connect my wallet
          </Button>
        </Notice>
      )}
      <AgentPassport seat={seat} name={nameFor(seat, job)} listing={listing} />
      {listing && account !== listing.seller && (
        <ForSalePanel seat={seat} listing={listing} account={account} connect={() => void wallet.connect()} onBought={() => (void load(), reloadListing())} />
      )}
      <SkillInstall seat={seat} account={account} holder={nftOwner} connect={() => void wallet.connect()} />
      {mine && nftOwner === account && !seat.policy && !ag.isSkillSeat(seat) && (
        <TakeOverPanel seat={seat} account={account} log={log} navigate={navigate} onDone={() => void load()} />
      )}

      {seat.policy && <AgentDashboard seat={seat} log={log} />}

      <div className="ag-columns">
        <section className="kp-vault-section">
          <h2>Rules and mission</h2>
          <AgentIdentity seat={seat} mine={mine && nftOwner === account} onSaved={() => void load()} />
          {ag.isSkillSeat(seat) && <p className="ag-muted">No budget and no limits: this agent carries its identity and its skill only.</p>}
          {!ag.isSkillSeat(seat) && (
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
                <dd>{role.byo ? "Decided by your own AI, over MCP" : job?.buyer ? `Keepers under ${ag.formatAsset(job.buyer.maxPrice, "NEAR")}${job.buyer.minTier ? `, ${TIERS[job.buyer.minTier]} or better` : ""}` : "—"}</dd>
              </>
            ) : (
              <>
                <dt>Allowed to pay</dt>
                <dd>{seat.policy?.payees.join(", ") || "—"}</dd>
                <dt>Mission</dt>
                <dd>
                  {role.byo
                    ? "Decided by your own AI, over MCP"
                    : firstPay
                    ? `${ag.formatAsset(firstPay.amount, "USDC")} to each, every ${firstPay.everySeconds >= 86400 ? `${Math.round(firstPay.everySeconds / 86400)} d` : firstPay.everySeconds >= 3600 ? `${Math.round(firstPay.everySeconds / 3600)} h` : `${Math.round(firstPay.everySeconds / 60)} min`}`
                    : "—"}
                </dd>
              </>
            )}
            {role.byo && (() => {
              const rec = ag.byoAgents()[seat.seat_id];
              const tool = rec?.tool ?? "claude-code";
              const setup = ag.mcpSetup(tool, ag.mcpName(rec?.name, seat.seat_id), `agent-${seat.seat_id}-key.json`);
              return (
                <>
                  <dt>Runs in</dt>
                  <dd>{ag.AGENT_TOOLS.find((t) => t.id === tool)?.label}</dd>
                  {rec?.source && (
                    <>
                      <dt>Source</dt>
                      <dd>
                        <a href={/^https?:/.test(rec.source) ? rec.source : `https://${rec.source}`} target="_blank" rel="noreferrer">
                          {rec.source.replace(/^https?:\/\//, "")}
                        </a>
                      </dd>
                    </>
                  )}
                  <dt>Connect</dt>
                  <dd>
                    <span className="ag-muted">{setup.where}</span>
                    <pre className="ag-code">{setup.snippet}</pre>
                    <span className="ag-muted">Lost the key file? Revoke access, then Give access makes and downloads a new one.</span>
                  </dd>
                </>
              );
            })()}
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
          )}
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
            {seat.version === "v2" && nftOwner === account && !seat.held_for_next_owner && (
              <label className="ag-check">
                <input
                  type="checkbox"
                  checked={!!seat.budget_follows}
                  disabled={busy !== ""}
                  onChange={(e) =>
                    void run(
                      "follows",
                      e.target.checked ? "If you sell this NFT, its budget goes to the next owner" : "Its budget comes back to you on a sale",
                      () => ag.setBudgetFollows(seat, e.target.checked),
                    )
                  }
                />{" "}
                Leave this budget to whoever owns the NFT next{" "}
                <span className="ag-muted">(while on, a withdrawal first proves on chain that you still own it)</span>
              </label>
            )}
            <p className="kp-hint">These need your wallet. The agent's key can do none of them.</p>
            {nftOwner === account && <SellPanel seat={seat} listing={listing} onChange={() => (void load(), reloadListing())} />}
            {nftOwner === account && !listing && <TransferPanel seat={seat} name={nameFor(seat, job)} navigate={navigate} />}
          </section>
        )}
      </div>

      <section className="kp-vault-section">
        <div className="ag-feed-head">
          <h2>Activity</h2>
          <LiveDot updatedAt={live.updatedAt} hidden={live.hidden} />
        </div>
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
                <th>On chain</th>
              </tr>
            </thead>
            <tbody>
              {collapse(log.filter((e, i) => e.status !== "pending" || (i === 0 && seat.in_flight > 0))).map((e) => (
                <tr key={e.seq} data-new={fresh.fresh.has(e.seq) || undefined}>
                  <td>
                    {ago(e.at)}
                    {e.count > 1 && <span className="ag-muted"> → {ago(e.firstAt)}</span>}
                  </td>
                  <td>
                    {ACTION_LABELS[e.action] ?? e.action}
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
                  <td>
                    {logTx[e.seq] ? (
                      <a className="ag-tx" href={ag.txLink(logTx[e.seq])} target="_blank" rel="noreferrer">
                        {logTx[e.seq].slice(0, 6)}… ↗
                      </a>
                    ) : (
                      <span className="ag-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="kp-hint">
          Read live from <code>seat_log</code> on{" "}
          <a href={`${EXPLORER}/address/${seat.contract}`} target="_blank" rel="noreferrer">
            {shortAccount(seat.contract)}
          </a>
          : the last 50 entries. Blocked attempts are written by the contract itself.
        </p>
      </section>
      <ToastStack toasts={toasts} dismiss={dismiss} txFor={(seq) => (logTx[seq] ? ag.txLink(logTx[seq]) : undefined)} />
    </div>
  );
}

export type { RoleId };

/**
 * The holder's agents, for the Vault: same cards as the Agent Wallet, read
 * from chain (plus the local runner when it is up, for roles and timers).
 */
export function VaultAgents({ account, navigate }: { account: string; navigate: Nav }) {
  const [seats, setSeats] = useState<Seat[] | null>(null);
  const [lastAt, setLastAt] = useState<Record<string, string>>({});
  const [owners, setOwners] = useState<Record<string, string | null>>({});
  const runner = useRunner(account);
  useEffect(() => {
    if (!account) return;
    let alive = true;
    void (async () => {
      const list = await ag.seatsForOwner(account).catch(() => [] as Seat[]);
      const latest: Record<string, string> = {};
      const o: Record<string, string | null> = {};
      await Promise.all(
        list.map(async (s) => {
          o[s.seat_id] = await ag.nftOwner(s.nft_contract, s.token_id).catch(() => null);
          const last = (await ag.seatLog(s.seat_id).catch(() => [])).find((e) => e.status !== "info");
          if (last) latest[s.seat_id] = last.at;
        }),
      );
      if (!alive) return;
      setSeats(list);
      setLastAt(latest);
      setOwners(o);
    })();
    return () => {
      alive = false;
    };
  }, [account]);
  const images = useImages((seats ?? []).map((s) => ({ key: s.seat_id, contract: s.nft_contract, token: s.token_id })));
  const near = (seats ?? []).filter((s) => s.asset === "NEAR").reduce((a, s) => a + BigInt(s.balance), 0n);
  const usdc = (seats ?? []).filter((s) => s.asset === "USDC").reduce((a, s) => a + BigInt(s.balance), 0n);

  return (
    <section className="kp-vault-section" aria-labelledby="kp-agents">
      <h2 id="kp-agents">Your agents</h2>
      <p className="kp-hint">
        {seats && seats.length
          ? `${seats.length} agent${seats.length > 1 ? "s" : ""} on your NFTs, controlling ${ag.formatAsset(near, "NEAR")} and ${ag.formatAsset(usdc, "USDC")}. `
          : "Agents you put on your NFTs show up here. "}
        <a
          href="/agents"
          onClick={(e) => {
            e.preventDefault();
            navigate("/agents");
          }}
        >
          Open the Agent Wallet
        </a>
      </p>
      <div className="kp-grid">
        {seats === null
          ? [0, 1, 2].map((i) => <NFTCardSkeleton key={i} label="Loading your agents" />)
          : seats.map((s) => {
              const job = runner.jobs.find((j) => j.seatId === s.seat_id);
              const role = roleFor(s, job);
              const st = statusOf(s, job, owners[s.seat_id] ?? null, runner.up, runner.locked);
              return (
                <NFTCard
                  key={s.seat_id}
                  href={`/agents/${s.seat_id}`}
                  onOpen={() => navigate(`/agents/${s.seat_id}`)}
                  model={seatModel(s, job, role, st, images[s.seat_id], lastAt[s.seat_id])}
                />
              );
            })}
        {seats !== null && (
          <NFTCardEmpty title="Hire an agent" hint="Put one on any NFT you own" onClick={() => navigate("/agents/new")} />
        )}
      </div>
    </section>
  );
}
