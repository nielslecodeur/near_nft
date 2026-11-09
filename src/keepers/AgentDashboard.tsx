/**
 * One agent's dashboard: what it spent against its limits, how long its budget
 * lasts, why it was blocked and where the money went.
 *
 * Sources, both on chain: the seat's own counters (lifetime spent, done,
 * blocked, today's spend; exact) and its log ring buffer (the last 50 entries;
 * used for days, reasons and payees). Days older than the oldest kept entry
 * are shown as "no data", never as zero. Days are UTC, like the contract's
 * daily cap.
 */
import { useMemo } from "react";
import { CircleAlert, CircleX } from "lucide-react";
import * as ag from "./agents";
import type { LogEntry, Seat } from "./agents";

const DAY_MS = 86_400_000;
const LOG_SIZE = 50;
const DAYS = 7;

type Day = { day: number; spent: bigint; done: number; blocked: number; known: boolean };

const dayOf = (ns: string) => Math.floor(Number(BigInt(ns) / 1_000_000n) / DAY_MS);
const dayLabel = (d: number, opts: Intl.DateTimeFormatOptions) =>
  new Date(d * DAY_MS).toLocaleDateString("en", { ...opts, timeZone: "UTC" });
const isSpend = (e: LogEntry) => e.status === "done" && (e.action === "pay" || e.action === "buy");

/**
 * Axis top: 20% headroom over the highest value (so the cap line never sits on
 * the frame), rounded up to 1, 2, 4, 5, 6 or 8 × 10^n so the half tick is clean.
 */
function niceMax(v: bigint, unit: bigint): bigint {
  const want = (v * 6n) / 5n;
  if (want <= 0n) return unit;
  let step = unit / 1000n > 0n ? unit / 1000n : 1n;
  for (;;) {
    for (const m of [1n, 2n, 4n, 5n, 6n, 8n]) if (step * m >= want) return step * m;
    step *= 10n;
  }
}

function untilMidnightUtc() {
  const ms = DAY_MS - (Date.now() % DAY_MS);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function AgentDashboard({ seat, log }: { seat: Seat; log: LogEntry[] }) {
  const asset = seat.asset;
  const unit = 10n ** BigInt(asset === "NEAR" ? 24 : 6);
  const cap = BigInt(seat.policy?.per_day_max ?? "0");
  const spentToday = BigInt(seat.spent_today);
  const balance = BigInt(seat.balance);
  const entries = useMemo(() => log.filter((e) => e.status !== "pending"), [log]);

  const data = useMemo(() => {
    const today = Math.floor(Date.now() / DAY_MS);
    // With a full ring buffer, anything before the oldest kept entry is unknown.
    const oldest = entries.length >= LOG_SIZE ? dayOf(entries[entries.length - 1].at) : -Infinity;
    const days: Day[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = today - i;
      days.push({ day: d, spent: 0n, done: 0, blocked: 0, known: d >= oldest });
    }
    const reasons = new Map<string, number>();
    const payees = new Map<string, { amount: bigint; count: number }>();
    for (const e of entries) {
      const slot = days.find((x) => x.day === dayOf(e.at));
      if (isSpend(e)) {
        if (slot) (slot.spent += BigInt(e.amount)), slot.done++;
        const who = e.counterparty ?? (e.action === "buy" ? "Keepers market" : "unknown");
        const p = payees.get(who) ?? { amount: 0n, count: 0 };
        payees.set(who, { amount: p.amount + BigInt(e.amount), count: p.count + 1 });
      }
      if (e.status === "refused") {
        if (slot) slot.blocked++;
        const r = e.detail || "blocked";
        reasons.set(r, (reasons.get(r) ?? 0) + 1);
      }
    }
    const week = days.filter((d) => d.known);
    const weekSpent = week.reduce((s, d) => s + d.spent, 0n);
    return {
      days,
      oldest,
      weekDays: week.length,
      weekSpent,
      reasons: [...reasons].sort((a, b) => b[1] - a[1]),
      payees: [...payees].sort((a, b) => (b[1].amount > a[1].amount ? 1 : b[1].amount < a[1].amount ? -1 : 0)),
      since: entries.length ? Number(BigInt(entries[entries.length - 1].at) / 1_000_000n) : null,
    };
  }, [entries]);

  const top = niceMax(data.days.reduce((m, d) => (d.spent > m ? d.spent : m), cap), unit);
  const pct = (v: bigint) => (top > 0n ? Number((v * 10_000n) / top) / 100 : 0);
  const capPct = Math.min(100, cap > 0n ? Number((spentToday * 100n) / cap) : 0);
  const capReached = cap > 0n && spentToday >= cap;
  const maxDay = data.days.reduce<Day | null>((m, d) => (d.known && d.spent > 0n && (!m || d.spent > m.spent) ? d : m), null);
  const todayDay = data.days[data.days.length - 1].day;

  // Runway: this week's pace, and the floor guaranteed by the on-chain daily cap.
  const perDay = data.weekDays > 0 ? data.weekSpent / BigInt(data.weekDays) : 0n;
  const pace = perDay > 0n ? Number(balance / perDay) : null;
  const atCap = cap > 0n ? Number(balance / cap) : null;
  const fmt = (v: bigint | string) => ag.formatAsset(v, asset);
  const reasonMax = data.reasons[0]?.[1] ?? 0;
  const payeeMax = data.payees[0]?.[1].amount ?? 0n;

  return (
    <section className="kp-vault-section ag-dash" aria-labelledby="ag-dash-title">
      <h2 id="ag-dash-title">How it spends</h2>

      <div className="ag-dash-row">
        <div className="ag-dash-tile">
          <span className="ag-dash-label">Today</span>
          <strong className="ag-dash-value">
            {fmt(spentToday)} <span className="ag-muted">of {fmt(cap)}</span>
          </strong>
          <div
            className="ag-dash-meter"
            role="meter"
            aria-label="Spent today against the daily cap"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={capPct}
            data-full={capReached || undefined}
          >
            <span style={{ width: `${capPct}%` }} />
          </div>
          <span className="ag-dash-sub">
            {capReached ? (
              <>
                <CircleX aria-hidden="true" className="ag-inline-icon ag-dash-warn" /> Cap reached: the contract blocks any
                more today.
              </>
            ) : (
              `${fmt(cap - spentToday)} left today`
            )}{" "}
            · resets in {untilMidnightUtc()} (00:00 UTC)
          </span>
        </div>

        <div className="ag-dash-tile">
          <span className="ag-dash-label">Budget runway</span>
          <strong className="ag-dash-value">
            {balance === 0n ? "Empty" : pace !== null ? `≈ ${pace} day${pace === 1 ? "" : "s"}` : "Not spending yet"}
          </strong>
          <span className="ag-dash-sub">
            {balance === 0n
              ? "Add budget to let it act again."
              : `${fmt(balance)} left${pace !== null ? ` at this week's pace (${fmt(perDay)} a day)` : ""}.`}
            {balance > 0n && atCap !== null && <> Even at its cap, at least {atCap} day{atCap === 1 ? "" : "s"}.</>}
          </span>
        </div>

        <div className="ag-dash-tile">
          <span className="ag-dash-label">Blocked by its limits</span>
          <strong className="ag-dash-value">
            {seat.refused} <span className="ag-muted">of {seat.done + seat.refused + seat.failed} tries</span>
          </strong>
          <span className="ag-dash-sub">
            {data.reasons[0] ? `Mostly: ${data.reasons[0][0]}.` : "Never blocked so far."} Nothing is spent when it is
            blocked.
          </span>
        </div>
      </div>

      <figure className="ag-dash-chart">
        <figcaption>
          <strong>Spent per day</strong> <span className="ag-muted">last {DAYS} days, {asset}, UTC</span>
        </figcaption>
        <div className="ag-dash-plot">
          <div className="ag-dash-axis" aria-hidden="true">
            {[top, top / 2n, 0n].map((t) => (
              <span key={t.toString()} style={{ bottom: `${pct(t)}%` }}>
                {fmt(t).split(" ")[0]}
              </span>
            ))}
          </div>
          <div className="ag-dash-area">
            {[top, top / 2n, 0n].map((t) => (
              <i key={t.toString()} className="ag-dash-grid" style={{ bottom: `${pct(t)}%` }} aria-hidden="true" />
            ))}
            {cap > 0n && (
              <div className="ag-dash-cap" style={{ bottom: `${pct(cap)}%` }} aria-hidden="true">
                <span>daily cap {fmt(cap)}</span>
              </div>
            )}
            <div className="ag-dash-cols">
              {data.days.map((d) => {
                const label = dayLabel(d.day, { weekday: "short", month: "short", day: "numeric" });
                const text = !d.known
                  ? `${label}: no data (older than the ${LOG_SIZE} entries kept on chain)`
                  : `${label}: ${fmt(d.spent)} spent, ${d.done} ${d.done === 1 ? "action" : "actions"}${d.blocked ? `, ${d.blocked} blocked` : ""}`;
                const labelled = d.known && d.spent > 0n && (d.day === todayDay || d === maxDay);
                return (
                  <div key={d.day} className="ag-dash-col" tabIndex={0} aria-label={text} data-unknown={!d.known || undefined}>
                    {d.known && d.spent > 0n && (
                      <span className="ag-dash-bar" style={{ height: `${Math.max(1.5, pct(d.spent))}%` }}>
                        {labelled && <b>{fmt(d.spent).split(" ")[0]}</b>}
                      </span>
                    )}
                    <span className="ag-dash-tip" role="tooltip">
                      {text}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="ag-dash-x" aria-hidden="true">
          <span />
          {data.days.map((d) => (
            <span key={d.day} data-today={d.day === todayDay || undefined}>
              <span>{d.day === todayDay ? "Today" : dayLabel(d.day, { weekday: "short" })}</span>
              {d.blocked > 0 && (
                <span className="ag-dash-blocked">
                  <CircleAlert aria-hidden="true" />×{d.blocked}
                </span>
              )}
            </span>
          ))}
        </div>
        {data.days.some((d) => d.blocked > 0) && (
          <p className="ag-dash-legend">
            <CircleAlert aria-hidden="true" className="ag-dash-warn" /> blocked attempts that day (nothing spent)
          </p>
        )}
      </figure>

      <div className="ag-dash-split">
        <div>
          <h3>Why it was blocked</h3>
          {data.reasons.length === 0 ? (
            <p className="ag-muted">No blocked attempt in its recent log.</p>
          ) : (
            <ol className="ag-dash-rank">
              {data.reasons.map(([reason, n]) => (
                <li key={reason}>
                  <span className="ag-dash-rank-row">
                    <span>{reason}</span>
                    <strong className="kp-num">×{n}</strong>
                  </span>
                  <span className="ag-dash-rank-bar" data-tone="down">
                    <span style={{ width: `${(n / reasonMax) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h3>Where the money went</h3>
          {data.payees.length === 0 ? (
            <p className="ag-muted">Nothing spent in its recent log.</p>
          ) : (
            <ol className="ag-dash-rank">
              {data.payees.slice(0, 5).map(([who, p]) => (
                <li key={who}>
                  <span className="ag-dash-rank-row">
                    <span title={who}>{who.length > 28 ? `${who.slice(0, 12)}…${who.slice(-12)}` : who}</span>
                    <strong className="kp-num">
                      {fmt(p.amount)} <span className="ag-muted">· {p.count}×</span>
                    </strong>
                  </span>
                  <span className="ag-dash-rank-bar">
                    <span style={{ width: `${payeeMax > 0n ? Number((p.amount * 10_000n) / payeeMax) / 100 : 0}%` }} />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <details className="ag-dash-table">
        <summary>Show as a table</summary>
        <div className="kp-table-wrap">
        <table className="kp-table">
          <thead>
            <tr>
              <th>Day (UTC)</th>
              <th>Spent</th>
              <th>Actions</th>
              <th>Blocked</th>
            </tr>
          </thead>
          <tbody>
            {[...data.days].reverse().map((d) => (
              <tr key={d.day}>
                <td>{dayLabel(d.day, { weekday: "short", month: "short", day: "numeric" })}</td>
                <td className="kp-num">{d.known ? fmt(d.spent) : "no data"}</td>
                <td className="kp-num">{d.known ? d.done : "—"}</td>
                <td className="kp-num">{d.known ? d.blocked : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </details>

      <p className="kp-hint">
        Lifetime totals ({fmt(seat.spent_total)} spent, {seat.done} done, {seat.refused} blocked) are the contract's own
        counters. Days, reasons and payees come from the last {Math.min(entries.length, LOG_SIZE)} entries it keeps
        {data.since ? `, since ${new Date(data.since).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}` : ""}.
      </p>
    </section>
  );
}
