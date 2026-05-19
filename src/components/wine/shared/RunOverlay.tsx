"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/Provider";
import {
  WorkflowTrace,
  type NodeDetail,
  type NodeKey,
  type WorkflowState,
} from "@/components/wine/shared/WorkflowTrace";

interface Props {
  open: boolean;
  /** True while the pipeline is running. When false + open=true, the overlay
   *  switches to its completion state and waits for the user to click
   *  "View report" before dismissing. */
  loading: boolean;
  state: WorkflowState;
  details?: Partial<Record<NodeKey, NodeDetail>>;
  /** Fired when the user clicks "View report" in the completion state. */
  onContinue: () => void;
}

/**
 * Full-screen analyse overlay. Two states:
 *
 *   RUNNING    — top progress bar + live elapsed-time counter +
 *                workflow trace ticking. Backdrop blur, no dismiss button.
 *   COMPLETE   — bar is full, timer is frozen at the final elapsed time,
 *                a primary "View report" button reveals the result cascade
 *                behind the overlay. Workflow trace stays visible above
 *                the button so the user sees the full path completed.
 *
 * Pipeline finish does NOT auto-dismiss the overlay — the user clicks
 * through. This makes the "we ran X agents in Y seconds" moment legible
 * before they see the cards.
 */
export function RunOverlay({ open, loading, state, details, onContinue }: Props) {
  const t = useT();
  const [elapsed, setElapsed] = useState(0);
  const finalElapsedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setElapsed(0);
      finalElapsedRef.current = null;
      return;
    }
    if (!loading) {
      // Pipeline just finished — freeze the timer at its final value.
      if (finalElapsedRef.current === null) finalElapsedRef.current = elapsed;
      return;
    }
    // Running: tick every 200 ms until loading flips.
    const startedAt = performance.now() - elapsed;
    const id = window.setInterval(() => {
      setElapsed(Math.round(performance.now() - startedAt));
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading]);

  if (!open) return null;

  const values = Object.values(state);
  const nonSkipped = values.filter((s) => s !== "skipped").length;
  const done = values.filter((s) => s === "ok" || s === "fail").length;
  const pct = loading ? (nonSkipped > 0 ? (done / nonSkipped) * 100 : 0) : 100;
  const seconds =
    !loading && finalElapsedRef.current !== null
      ? (finalElapsedRef.current / 1000).toFixed(1)
      : (elapsed / 1000).toFixed(1);

  const isComplete = !loading;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-foreground/40 p-4 backdrop-blur-md md:p-12">
      <div className="w-full max-w-md animate-scale-in space-y-4">
        <div className="rounded-md border bg-background p-5 shadow-xl">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] uppercase tracking-luxe text-muted-foreground">
              {isComplete ? t("common.analysis_complete") : t("common.running")}
            </p>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {seconds}s
            </span>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={
                "h-full transition-all duration-500 ease-out " +
                (isComplete ? "bg-emerald-600 dark:bg-emerald-500" : "bg-primary")
              }
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 font-mono text-[10px] tabular-nums text-muted-foreground">
            {done} / {nonSkipped} · {Math.round(pct)}%
          </p>
        </div>

        <WorkflowTrace state={state} details={details} />

        {isComplete && (
          <div className="flex flex-col gap-2 rounded-md border bg-background p-4 shadow-xl animate-fade-in-up">
            <p className="text-sm font-medium">{t("common.report_ready_title")}</p>
            <p className="text-xs text-muted-foreground">
              {t("common.report_ready_hint")}
            </p>
            <button
              type="button"
              onClick={onContinue}
              className="mt-1 h-10 w-full rounded-sm bg-primary px-4 text-[11px] uppercase tracking-luxe text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t("common.view_report")} →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
