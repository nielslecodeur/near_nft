/**
 * Live activity for the agent pages: polling that follows tab visibility, new
 * on-chain log entries spotted between two reads, toasts for what an agent just
 * did (or was blocked from doing), and a count in the tab title while hidden.
 * Everything still comes from the contract's log; nothing here is pushed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Calls `fn` now, then every `visibleMs` while the tab is visible and every
 * `hiddenMs` while it is hidden; right away when the tab comes back.
 * A new `fn` (another account, another agent) restarts the loop.
 */
export function useLivePoll(fn: () => Promise<unknown> | unknown, visibleMs = 6000, hiddenMs = 30_000) {
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.visibilityState === "hidden");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (alive) timer = setTimeout(run, document.visibilityState === "hidden" ? hiddenMs : visibleMs);
    };
    async function run() {
      if (running) return;
      running = true;
      try {
        await fn();
        if (alive) setUpdatedAt(Date.now());
      } catch {
        /* the page shows its own error; keep polling */
      } finally {
        running = false;
        schedule();
      }
    }
    const onVisibility = () => {
      const h = document.visibilityState === "hidden";
      setHidden(h);
      if (!h) void run();
      else schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    void run();
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fn, visibleMs, hiddenMs]);
  return { hidden, updatedAt };
}

/**
 * Remembers which log entries were already on screen. `take(keys)` returns the
 * keys that are new since the last call (none on the first call, so opening
 * the page never floods), and marks them fresh for a few seconds.
 */
export function useFresh(resetKey: string, freshMs = 6000) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    seen.current = null;
    setFresh(new Set());
  }, [resetKey]);
  const take = useCallback(
    (keys: string[]) => {
      if (!seen.current) {
        seen.current = new Set(keys);
        return [] as string[];
      }
      const added = keys.filter((k) => !seen.current!.has(k));
      for (const k of added) seen.current.add(k);
      if (added.length) {
        setFresh((f) => new Set([...f, ...added]));
        setTimeout(() => setFresh((f) => new Set([...f].filter((k) => !added.includes(k)))), freshMs);
      }
      return added;
    },
    [freshMs],
  );
  return { fresh, take };
}

export type Toast = {
  id: string;
  tone: "up" | "down" | "neutral";
  title: string;
  body?: string;
  /** Opens the agent; the transaction link is looked up at render time (it may arrive later). */
  onOpen?: () => void;
};

export function useToasts(max = 3, lifeMs = 9000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: string) => setToasts((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Toast) => {
      setToasts((l) => [...l.filter((x) => x.id !== t.id), t].slice(-max));
      setTimeout(() => dismiss(t.id), lifeMs);
    },
    [dismiss, lifeMs, max],
  );
  return { toasts, push, dismiss };
}

export function ToastStack({
  toasts,
  dismiss,
  txFor,
}: {
  toasts: Toast[];
  dismiss: (id: string) => void;
  txFor: (id: string) => string | undefined;
}) {
  return (
    <div className="ag-toasts" role="status" aria-live="polite" aria-label="What your agents just did">
      {toasts.map((t) => {
        const tx = txFor(t.id);
        return (
          <div key={t.id} className="ag-toast" data-tone={t.tone}>
            <span className="ag-toast-dot" aria-hidden="true" />
            <div className="ag-toast-text">
              <strong>{t.title}</strong>
              {t.body && <span>{t.body}</span>}
              <span className="ag-toast-links">
                {tx && (
                  <a href={tx} target="_blank" rel="noreferrer">
                    View transaction ↗
                  </a>
                )}
                {t.onOpen && (
                  <button type="button" onClick={t.onOpen}>
                    Open agent
                  </button>
                )}
              </span>
            </div>
            <button type="button" className="ag-toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <X aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** "(3) Agent Wallet" while the tab is hidden and agents act; cleared when it is seen again. */
export function useTitleBadge(hidden: boolean) {
  const count = useRef(0);
  const strip = (t: string) => t.replace(/^\(\d+\) /, "");
  useEffect(() => {
    if (!hidden) {
      count.current = 0;
      document.title = strip(document.title);
    }
  }, [hidden]);
  useEffect(() => () => void (document.title = strip(document.title)), []);
  return useCallback(
    (n: number) => {
      if (!hidden || n <= 0) return;
      count.current += n;
      document.title = `(${count.current}) ${strip(document.title)}`;
    },
    [hidden],
  );
}

/** "Live · updated 4 s ago", or paused while the tab is hidden. */
export function LiveDot({ updatedAt, hidden }: { updatedAt: number | null; hidden: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const ago = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt) / 1000)) : null;
  return (
    <span className="ag-live" data-paused={hidden || undefined}>
      <span className="ag-live-dot" aria-hidden="true" />
      {hidden ? "Paused while this tab is hidden" : ago === null ? "Live" : `Live · updated ${ago < 2 ? "just now" : `${ago} s ago`}`}
    </span>
  );
}
