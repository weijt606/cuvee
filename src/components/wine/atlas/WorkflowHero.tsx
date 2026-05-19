"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  WorkflowTrace,
  type AgentState,
  type NodeDetail,
  type NodeKey,
  type WorkflowState,
} from "@/components/wine/shared/WorkflowTrace";

interface Props {
  state: WorkflowState;
  details: Partial<Record<NodeKey, NodeDetail>>;
  hasUploads?: boolean;
  subject?: string;
  /** True once the analysis has produced a result. Switches the hero
   *  into a completion state with a primary "View report" button. */
  done?: boolean;
  /** Called when the user clicks the "View report" button. Wired from the
   *  parent dashboard to swap the drawer content from WorkflowHero to
   *  AnalysisDrawer. */
  onContinue?: () => void;
}

const NODE_DISPLAY: Record<NodeKey, string> = {
  input: "Input",
  orchestrator: "Orchestrator",
  weather_agent: "Weather",
  geo_agent: "Geo",
  tavily_agent: "Tavily",
  extraction_agent: "Extraction",
  pioneer: "Pioneer",
  feature_agent: "Feature",
  backtest_agent: "Backtest",
  dashboard: "Dashboard",
};

const RUNNING_SUBTITLE: Partial<Record<NodeKey, string>> = {
  orchestrator: "Routing the call · planning tool sequence",
  weather_agent: "Fetching ERA5 reanalysis + SEAS5 forecast",
  geo_agent: "Loading terroir geometry · 61 1855 polygons",
  tavily_agent: "Scanning public web · négoce + critics",
  extraction_agent: "Extracting features · gating sub-agent output",
  pioneer: "Classifying with Pioneer GLiNER2",
  feature_agent: "Composing risk score · weighted drivers",
  backtest_agent: "Hindcasting vintage · critic-prediction agreement",
  dashboard: "Rendering analysis dashboard",
};

const NODE_ORDER: NodeKey[] = [
  "input",
  "orchestrator",
  "weather_agent",
  "geo_agent",
  "tavily_agent",
  "extraction_agent",
  "pioneer",
  "feature_agent",
  "backtest_agent",
  "dashboard",
];

interface LogEntry {
  id: number;
  tMs: number;
  key: NodeKey;
  state: AgentState;
}

function stateGlyph(s: AgentState): { mark: string; tone: string } {
  switch (s) {
    case "running":
      return { mark: "▸", tone: "text-cru-1" };
    case "ok":
      return { mark: "✓", tone: "text-emerald-300" };
    case "fail":
      return { mark: "✗", tone: "text-red-300" };
    case "skipped":
      return { mark: "·", tone: "text-soft" };
    default:
      return { mark: "○", tone: "text-soft" };
  }
}

export function WorkflowHero({ state, details, hasUploads, subject, done, onContinue }: Props) {
  const startRef = useRef<number>(Date.now());
  const finalElapsedRef = useRef<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    if (done) {
      // Freeze the elapsed counter at the moment the pipeline finished.
      if (finalElapsedRef.current === null) {
        finalElapsedRef.current = Date.now() - startRef.current;
      }
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 80);
    return () => window.clearInterval(id);
  }, [done]);
  const elapsedMs = done && finalElapsedRef.current !== null
    ? finalElapsedRef.current
    : now - startRef.current;

  // Event log — append on every state transition.
  const prevRef = useRef<WorkflowState>(state);
  const idRef = useRef(0);
  const [events, setEvents] = useState<LogEntry[]>([]);
  useEffect(() => {
    const prev = prevRef.current;
    const additions: LogEntry[] = [];
    for (const k of NODE_ORDER) {
      if (state[k] !== prev[k] && state[k] !== "pending") {
        additions.push({
          id: idRef.current++,
          tMs: Date.now() - startRef.current,
          key: k,
          state: state[k],
        });
      }
    }
    if (additions.length > 0) {
      setEvents((prev) => [...prev, ...additions].slice(-40));
    }
    prevRef.current = state;
  }, [state]);

  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  const running = useMemo<NodeKey | null>(() => {
    const found = NODE_ORDER.find((k) => state[k] === "running");
    return found ?? null;
  }, [state]);

  const total = NODE_ORDER.length;
  const doneCount = useMemo(
    () =>
      NODE_ORDER.reduce((acc, k) => {
        const s = state[k];
        return acc + (s === "ok" || s === "fail" || s === "skipped" ? 1 : 0);
      }, 0),
    [state],
  );
  const pct = done ? 100 : Math.round((doneCount / total) * 100);
  const activeIdx = running ? NODE_ORDER.indexOf(running) + 1 : doneCount;

  const headline = done
    ? "Analysis ready"
    : running
      ? NODE_DISPLAY[running]
      : doneCount >= total
        ? "Compiling"
        : "Booting";
  const subtitle = done
    ? "All agents completed — review the report when you're ready."
    : running
      ? RUNNING_SUBTITLE[running] ?? "Working"
      : doneCount >= total
        ? "Final synthesis — compiling the report"
        : "Bootstrapping agents…";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Hero header — agent name as serif headline */}
      <header>
        <div className="flex items-baseline justify-between gap-4">
          <p className="kicker">
            Agent {String(activeIdx).padStart(2, "0")} of{" "}
            {String(total).padStart(2, "0")}
          </p>
          {subject && <p className="kicker tabular">{subject}</p>}
        </div>
        <h2
          key={headline}
          className="anim-fade-rise mt-2 font-serif text-[28px] font-medium leading-[1.05] tracking-tight"
        >
          {headline}
          {running && !done && (
            <span
              aria-hidden
              className="anim-pulse-dot ml-2 inline-block h-2 w-2 -translate-y-1 rounded-full bg-cru-1"
            />
          )}
          {done && (
            <span
              aria-hidden
              className="ml-2 inline-block h-2 w-2 -translate-y-1 rounded-full bg-emerald-400"
            />
          )}
        </h2>
        <p
          key={`sub-${headline}`}
          className="anim-fade-rise mt-1.5 max-w-prose text-[11px] leading-relaxed text-soft"
        >
          {subtitle}
        </p>
      </header>

      {/* KV stats — elapsed, progress, active index */}
      <div className="kv-grid grid-cols-3">
        <div className="kv-cell !py-2">
          <p className="kv-label">Elapsed</p>
          <p className="kv-value !text-[12px]">
            {(elapsedMs / 1000).toFixed(1)}
            <span className="kv-unit">s</span>
          </p>
        </div>
        <div className="kv-cell !py-2">
          <p className="kv-label">Progress</p>
          <p className="kv-value !text-[12px]">
            {pct}
            <span className="kv-unit">%</span>
          </p>
        </div>
        <div className="kv-cell !py-2">
          <p className="kv-label">Active</p>
          <p
            key={`active-${activeIdx}-${running ?? "idle"}`}
            className={cn("kv-value !text-[12px]", running && "anim-flash")}
          >
            {String(activeIdx).padStart(2, "0")}
            <span className="kv-unit">/ {total}</span>
          </p>
        </div>
      </div>

      {/* Agent DAG — larger now that hero text shrank */}
      <div className="mx-auto min-h-0 w-full max-w-[520px] flex-1">
        <WorkflowTrace
          state={state}
          details={details}
          hasUploads={hasUploads}
          compact
        />
      </div>

      <div className="flex items-baseline gap-3 border-t border-line px-1 pt-3 font-mono text-[11px] tabular">
        {lastEvent ? (
          <p
            key={lastEvent.id}
            className="anim-tick-in flex min-w-0 flex-1 items-baseline gap-3"
          >
            <span className="w-12 shrink-0 text-soft">
              {(lastEvent.tMs / 1000).toFixed(1)}s
            </span>
            <span
              className={cn("w-3 shrink-0 text-center", stateGlyph(lastEvent.state).tone)}
            >
              {stateGlyph(lastEvent.state).mark}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground/85">
              {NODE_DISPLAY[lastEvent.key]}
            </span>
            <span className="kicker shrink-0">{lastEvent.state}</span>
          </p>
        ) : (
          <p className="text-soft italic">Awaiting first signal…</p>
        )}
      </div>

      {/* Completion gate — primary "View report" button. Shown only when
          the analysis has produced a result; the parent dashboard swaps
          to AnalysisDrawer when this fires. */}
      {done && onContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="anim-fade-rise mt-2 h-11 w-full rounded-md bg-foreground text-[11px] uppercase tracking-luxe text-background transition-opacity hover:opacity-90"
        >
          View report →
        </button>
      )}
    </div>
  );
}
