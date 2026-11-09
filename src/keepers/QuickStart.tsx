/**
 * /agents/start: a first agent in five steps, for someone who has never used
 * the Agent Wallet. Every step is read from chain (balances, NFTs, the seat and
 * its log), so a reload or a wallet round-trip resumes where the user was.
 *
 * The agent is an Allowance that pays the user back 0.1 USDC a minute, at most
 * 0.5 USDC a day, from a budget of up to 1 USDC: nothing leaves their wallet,
 * and on the sixth payment of the day they see the contract block it.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CircleCheck, Copy, ExternalLink, KeyRound, PiggyBank, Sparkles, Wallet as WalletIcon } from "lucide-react";
import { Button, Notice, Skeleton } from "../terminal/primitives";
import * as ag from "./agents";
import type { LogEntry, OwnedNft, Seat } from "./agents";
import { NftArt, useImages } from "./AgentsPage";
import { characterFromMedia } from "./nft-art";
import { NFTCard } from "./NFTCard";
import type { Wallet } from "./KeepersApp";
import { TESTNET } from "../../packages/shared/network";

type Nav = (to: string) => void;

const NEAR_FAUCET = TESTNET.faucet;
const USDC_FAUCET = "https://faucet.circle.com/";
const NEED_NEAR = ag.parseAsset("0.5", "NEAR")!;
const PAY = 100_000n; // 0.1 USDC
const PER_DAY = 500_000n; // 0.5 USDC
const MAX_BUDGET = 1_000_000n; // 1 USDC
const SAVED = "agentwallet.quickstart";

type Saved = { account: string; seatId: string };
function savedSeat(account: string): string | null {
  try {
    const s = JSON.parse(localStorage.getItem(SAVED) || "null") as Saved | null;
    return s && s.account === account ? s.seatId : null;
  } catch {
    return null;
  }
}
function saveSeat(account: string, seatId: string) {
  try {
    localStorage.setItem(SAVED, JSON.stringify({ account, seatId }));
  } catch {
    /* the seat is still found on chain below */
  }
}

type StepState = "done" | "now" | "todo";
type Sub = "" | "unlock" | "create" | "fund" | "save";

export function QuickStartPage({ wallet, navigate }: { wallet: Wallet; navigate: Nav }) {
  const account = wallet.account;
  const [near, setNear] = useState<bigint | null>(null);
  const [nfts, setNfts] = useState<OwnedNft[] | null>(null);
  const [taken, setTaken] = useState<Record<string, boolean>>({});
  const [pick, setPick] = useState<OwnedNft | null>(null);
  /** The preselected card still needs a click; a card minted here is confirmed at once. */
  const [cardOk, setCardOk] = useState(false);
  const [usdc, setUsdc] = useState<bigint | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [hasJob, setHasJob] = useState(false);
  const [first, setFirst] = useState<LogEntry | null>(null);
  const [firstTx, setFirstTx] = useState("");
  const [runnerUp, setRunnerUp] = useState<boolean | null>(null);
  const [sub, setSub] = useState<Sub>("");
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const [, tick] = useState(0);

  /** The seat this quick start created: remembered here, or found on chain among the user's seats. */
  const loadSeat = useCallback(async () => {
    if (!account) return null;
    const id = savedSeat(account);
    const s = id ? await ag.getSeat(id).catch(() => null) : null;
    const mine = s && s.owner === account ? s : null;
    setSeat(mine);
    return mine;
  }, [account]);

  const loadNfts = useCallback(
    async (prefer?: { contract: string; token: string }) => {
      if (!account) return;
      const all = (await Promise.all(ag.COLLECTIONS.map((c) => ag.nftsIn(c.id, c.label, account)))).flat();
      const t: Record<string, boolean> = {};
      await Promise.all(all.map(async (n) => (t[`${n.contract}:${n.token_id}`] = !!(await ag.seatForNft(n.contract, n.token_id).catch(() => null)))));
      // Free cards first, Characters before the rest.
      const free = all.filter((n) => !t[`${n.contract}:${n.token_id}`]);
      free.sort((a, b) => Number(!!characterFromMedia(b.media)) - Number(!!characterFromMedia(a.media)));
      setTaken(t);
      setNfts(free);
      const preferred = prefer && free.find((n) => n.contract === prefer.contract && n.token_id === prefer.token);
      setPick((p) => preferred ?? (p && free.some((n) => n.contract === p.contract && n.token_id === p.token_id) ? p : free[0] ?? null));
    },
    [account],
  );

  const refreshBalances = useCallback(async () => {
    if (!account) return;
    const [n, u] = await Promise.all([ag.nearBalance(account), ag.usdcBalance(account).catch(() => 0n)]);
    setNear(n);
    setUsdc(u);
  }, [account]);

  const refreshRunner = useCallback(async () => {
    try {
      await ag.runnerHealth();
      setRunnerUp(true);
      if (account && ag.runnerSignedIn(account)) {
        const jobs = await ag.runnerJobs(account).catch(() => []);
        const id = savedSeat(account);
        setHasJob(!!id && jobs.some((j) => j.seatId === id));
      }
    } catch {
      setRunnerUp(false);
    }
  }, [account]);

  useEffect(() => {
    if (!account) return;
    void refreshBalances();
    void loadNfts();
    void loadSeat();
    void refreshRunner();
  }, [account, refreshBalances, loadNfts, loadSeat, refreshRunner]);

  // Steps 1 and 3 wait on faucets: check the balances every 5 s until they are there.
  const needFunds = !!account && ((near !== null && near < NEED_NEAR) || (!seat && usdc !== null && usdc < PAY));
  useEffect(() => {
    if (!needFunds) return;
    const t = setInterval(() => void refreshBalances(), 5000);
    return () => clearInterval(t);
  }, [needFunds, refreshBalances]);

  // Step 5: watch the seat's log for its first payment (or a block), then find its transaction.
  const started = !!seat?.agent_key && !!seat.policy && hasJob;
  useEffect(() => {
    if (!started || !seat || first) return;
    setWaitingSince((w) => w ?? Date.now());
    let alive = true;
    const look = async () => {
      const log = await ag.seatLog(seat.seat_id).catch(() => [] as LogEntry[]);
      const move = log.find((e) => e.action === "pay" && (e.status === "done" || e.status === "refused"));
      if (move && alive) {
        setFirst(move);
        const txs = await ag.ownerTxs(account, BigInt(move.at) - 120_000_000_000n).catch(() => []);
        const h = ag.txForEntry(move, txs);
        if (h && alive) setFirstTx(h);
      }
    };
    void look();
    const t = setInterval(() => void look(), 4000);
    const c = setInterval(() => tick((x) => x + 1), 1000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(c);
    };
  }, [started, seat, first, account]);

  const images = useImages((nfts ?? []).map((n) => ({ key: `${n.contract}:${n.token_id}`, contract: n.contract, token: n.token_id })));

  async function mint() {
    setMinting(true);
    setError("");
    try {
      const token = await ag.mintExampleNft(account);
      await Promise.all([loadNfts({ contract: ag.EXAMPLE_NFT, token }), refreshBalances()]);
      setCardOk(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMinting(false);
    }
  }

  const budget = usdc === null ? 0n : usdc < MAX_BUDGET ? usdc : MAX_BUDGET;

  async function start() {
    setError("");
    try {
      if (!ag.runnerSignedIn(account)) {
        setSub("unlock");
        await ag.runnerSignIn(account);
      }
      let s = seat;
      if (!s) {
        setSub("create");
        const id = await ag.createSeat(pick!.contract, pick!.token_id, "Payer", {
          per_tx_max: PAY.toString(),
          per_day_max: PER_DAY.toString(),
          payees: [account],
          market: null,
        });
        if (!id) throw new Error("The contract could not confirm you own this NFT. Your 0.1 NEAR was returned.");
        saveSeat(account, id);
        s = await ag.getSeat(id);
        setSeat(s);
      }
      let publicKey = s!.agent_key;
      if (!publicKey) {
        setSub("fund");
        publicKey = await ag.runnerNewKey(account);
        await ag.fundAndGrant(s!, budget, publicKey);
      }
      setSub("save");
      await ag.runnerSaveJob({
        seatId: s!.seat_id,
        accountId: account,
        publicKey,
        kind: "Payer",
        role: "allowance",
        name: "My first agent",
        payer: { payments: [{ payee: account, amount: PAY.toString(), everySeconds: 60, memo: "allowance" }] },
      });
      setHasJob(true);
      await Promise.all([loadSeat(), refreshBalances()]);
    } catch (e) {
      setError((e as Error).message);
      await loadSeat();
    } finally {
      setSub("");
    }
  }

  // Which step is done, from what is on chain.
  const hasCard = !!seat || (!!pick && cardOk);
  const steps: { done: boolean }[] = [
    { done: !!account && near !== null && (near >= NEED_NEAR || !!seat) },
    { done: hasCard },
    { done: !!seat?.agent_key || (usdc !== null && usdc >= PAY) },
    { done: started },
    { done: !!first },
  ];
  const nowIndex = steps.findIndex((s) => !s.done);
  const state = (i: number): StepState => (steps[i].done ? "done" : i === nowIndex ? "now" : "todo");
  const doneCount = steps.filter((s) => s.done).length;
  const waited = waitingSince ? Math.floor((Date.now() - waitingSince) / 1000) : 0;
  const cardName = seat ? `your NFT ${shortToken(seat.token_id)}` : pick ? pick.title || `${pick.label} #${shortToken(pick.token_id)}` : "your NFT";

  return (
    <div className="ag-page">
      <button type="button" className="kp-back" onClick={() => navigate("/agents")}>
        ← Agent Wallet
      </button>
      <section className="ag-stage ag-qs" aria-labelledby="ag-qs-title">
        <div className="ag-room" aria-hidden="true" />
        <header className="ag-qs-head">
          <h1 id="ag-qs-title">Your first agent, step by step</h1>
          <p className="ag-muted">
            About two minutes, on testnet: every token here is free test money. The agent pays you back, so nothing leaves
            your wallet.
          </p>
          <div
            className="ag-qs-progress"
            role="progressbar"
            aria-label="Quick start progress"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={doneCount}
          >
            <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <span className="ag-muted kp-num">
            {doneCount === steps.length ? "All done" : `Step ${nowIndex + 1} of ${steps.length}`}
          </span>
        </header>

        {error && (
          <Notice tone="error" title="Not done">
            {error}
          </Notice>
        )}

        <div className="ag-qs-layout">
        <ol className="ag-qs-steps">
          <Step n={1} state={state(0)} title="Connect a testnet wallet" done={account ? `${account} · ${near === null ? "…" : ag.formatAsset(near, "NEAR")}` : ""}>
            {!account ? (
              <>
                <p>Intear, Meteor or any NEAR wallet, on testnet. No real money is used anywhere.</p>
                <Button variant="primary" icon={WalletIcon} onClick={() => void wallet.connect()}>
                  Connect my wallet
                </Button>
              </>
            ) : (
              <>
                <p>
                  You have {near === null ? "…" : ag.formatAsset(near, "NEAR")}. You need about 0.5 test NEAR for the card,
                  the agent's storage (refunded when you close it) and gas.
                </p>
                <a className="ag-qs-link" href={NEAR_FAUCET} target="_blank" rel="noreferrer">
                  Get free test NEAR <ExternalLink aria-hidden="true" />
                </a>
                <p className="ag-muted ag-qs-wait">Checking your balance every 5 seconds…</p>
              </>
            )}
          </Step>

          <Step
            n={2}
            state={state(1)}
            title="Pick the card that carries it"
            done={seat ? `The agent lives on ${cardName}` : pick ? `${cardName} will carry it` : ""}
            onChange={!seat && cardOk ? () => setCardOk(false) : undefined}
          >
            <p>The agent lives on an NFT. Whoever owns the card controls the agent; sell it and the agent stops.</p>
            {nfts === null ? (
              <Skeleton label="Looking for your NFTs" />
            ) : nfts.length > 0 ? (
              <div className="ag-qs-cards" role="radiogroup" aria-label="Card">
                {nfts.slice(0, 4).map((n) => {
                  const key = `${n.contract}:${n.token_id}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={pick?.contract === n.contract && pick.token_id === n.token_id}
                      className="ag-nft-pick"
                      disabled={!!seat}
                      onClick={() => setPick(n)}
                    >
                      <NftArt src={images[key]} label={n.title} />
                      <strong>{n.title || `${n.label} #${shortToken(n.token_id)}`}</strong>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {nfts && nfts.length > 0 && pick && (
              <Button variant="primary" icon={CircleCheck} onClick={() => setCardOk(true)}>
                Use {pick.title || "this card"}
              </Button>
            )}
            {nfts && nfts.length === 0 && (
              <p className="ag-muted">
                {Object.keys(taken).length ? "All your cards already carry an agent." : "You have no NFT yet."} Mint one for
                free:
              </p>
            )}
            {!seat && (
              <Button variant={nfts?.length ? "ghost" : "primary"} icon={Sparkles} busy={minting} disabled={minting || !account} onClick={() => void mint()}>
                Mint a free Character
              </Button>
            )}
          </Step>

          <Step
            n={3}
            state={state(2)}
            title="Get free test USDC"
            done={seat?.agent_key ? "Budget funded" : usdc !== null ? `You hold ${ag.formatAsset(usdc, "USDC")}` : ""}
          >
            <p>Your agent pays in USDC. Circle hands out test USDC for free:</p>
            <ol className="ag-qs-howto">
              <li>
                Open the{" "}
                <a className="ag-qs-link" href={USDC_FAUCET} target="_blank" rel="noreferrer">
                  Circle faucet <ExternalLink aria-hidden="true" />
                </a>
              </li>
              <li>
                Choose <strong>NEAR Testnet</strong>
              </li>
              <li>
                Paste your account{" "}
                <button
                  type="button"
                  className="ag-qs-copy"
                  onClick={() => void navigator.clipboard.writeText(account).then(() => setCopied(true))}
                  disabled={!account}
                >
                  <code>{account || "…"}</code> <Copy aria-hidden="true" /> {copied ? "copied" : "copy"}
                </button>
              </li>
            </ol>
            <p className="ag-muted ag-qs-wait">Checking every 5 seconds: this step ticks itself when they arrive.</p>
          </Step>

          <Step n={4} state={state(3)} title="Start your agent" done={started ? `Running: 0.1 USDC to you every minute, at most 0.5 a day` : ""}>
            <p className="ag-summary">
              It pays you <strong>0.1 USDC every minute</strong> from a <strong>{ag.formatAsset(budget, "USDC")}</strong>{" "}
              budget, never more than <strong>0.5 USDC a day</strong>, and only to you. On the sixth payment of the day the
              contract blocks it, and you will see why.
            </p>
            {runnerUp === false && (
              <Notice tone="info" title="The agent runner is offline">
                It is the program that acts for your agents. Start it with <code>npm run agent:runner</code>, then come back.
              </Notice>
            )}
            <ol className="ag-sign-steps">
              <li data-state={ag.runnerSignedIn(account) ? "done" : sub === "unlock" ? "now" : "todo"}>
                Sign in to your runner: a message, not a transaction, free.
              </li>
              <li data-state={seat ? "done" : sub === "create" ? "now" : "todo"}>
                Create the agent on {cardName}, with its limits on chain (0.1 NEAR storage, refunded on close).
              </li>
              <li data-state={seat?.agent_key ? "done" : sub === "fund" ? "now" : "todo"}>
                Fund it and give it a key that can only pay inside those limits.
              </li>
            </ol>
            <Button variant="primary" icon={KeyRound} busy={sub !== ""} disabled={sub !== "" || runnerUp === false || (!seat && !pick)} onClick={() => void start()}>
              {seat ? "Finish starting it" : "Start my agent"}
            </Button>
          </Step>

          <Step n={5} state={state(4)} title="Watch it act on its own" done="">
            {first ? (
              <div className="ag-qs-win" role="status">
                <CircleCheck aria-hidden="true" />
                <div>
                  <strong>
                    {first.status === "done"
                      ? `Your agent paid you ${ag.formatAsset(first.amount, "USDC")}, by itself.`
                      : `Your agent tried to pay and the contract blocked it: ${first.detail}.`}
                  </strong>
                  <p className="ag-muted">No signature, no popup: it used its own limited key, checked on chain.</p>
                  {firstTx && (
                    <a className="ag-qs-link" href={ag.txLink(firstTx)} target="_blank" rel="noreferrer">
                      See the transaction <ExternalLink aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <p className="ag-muted ag-qs-wait" aria-live="polite">
                {started ? `Waiting for its first move… ${waited}s (usually under 30 s)` : "Once it runs, its first payment shows up here."}
              </p>
            )}
            {first && seat && (
              <div className="ag-buttons">
                <Button variant="primary" onClick={() => navigate(`/agents/${seat.seat_id}`)}>
                  Open my agent
                </Button>
                <Button variant="secondary" onClick={() => navigate("/agents/new")}>
                  Hire one with your own rules
                </Button>
                <Button variant="ghost" onClick={() => navigate("/agents/new?role=byo-payer")}>
                  Connect your own AI
                </Button>
              </div>
            )}
          </Step>
        </ol>
        <aside className="ag-qs-preview" aria-label="Your agent, as it takes shape">
          <div className="ag-slide" data-focus="true">
            <NFTCard
              as="div"
              model={{
                id: "quickstart",
                name: "My first agent",
                description: "Pays you back 0.1 USDC a minute, at most 0.5 a day.",
                image: pick ? images[`${pick.contract}:${pick.token_id}`] : null,
                imageAlt: pick ? pick.title || `${pick.label} #${pick.token_id}` : "Your card",
                collection: pick && characterFromMedia(pick.media) ? "Characters" : (pick?.label ?? "Your card"),
                subtitle: "Allowance",
                avatar: <PiggyBank />,
                timer: { label: first ? "acted" : started ? "running" : "new" },
                status: first
                  ? { label: "Active", tone: "up" }
                  : started
                    ? { label: "Starting", tone: "brand" }
                    : { label: `Step ${Math.max(1, nowIndex + 1)} of ${steps.length}`, tone: "neutral" },
                fact: { label: "Cap/day", value: "0.5 USDC" },
                value: { label: "Budget", amount: seat ? ag.formatAsset(seat.balance, "USDC") : ag.formatAsset(budget, "USDC") },
              }}
            />
          </div>
        </aside>
        </div>
      </section>
    </div>
  );
}

function Step({
  n,
  state,
  title,
  done,
  onChange,
  children,
}: {
  n: number;
  state: StepState;
  title: string;
  done: string;
  onChange?: () => void;
  children: ReactNode;
}) {
  return (
    <li className="ag-qs-step" data-state={state} aria-current={state === "now" ? "step" : undefined}>
      <span className="ag-qs-num" aria-hidden="true">
        {state === "done" ? <CircleCheck /> : n}
      </span>
      <div className="ag-qs-body">
        <h2>
          {title}
          {state === "done" && <span className="ag-qs-sr"> (done)</span>}
        </h2>
        {state === "done" && done ? (
          <p className="ag-qs-done">
            {done}
            {onChange && (
              <button type="button" className="ag-qs-change" onClick={onChange}>
                change
              </button>
            )}
          </p>
        ) : state === "now" ? (
          children
        ) : null}
      </div>
    </li>
  );
}

const shortToken = (t: string) => (t.length > 14 ? `${t.slice(0, 6)}…${t.slice(-4)}` : t);
