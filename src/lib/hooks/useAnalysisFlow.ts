"use client";

import { useState } from "react";
import {
  INITIAL_WORKFLOW,
  type NodeDetail,
  type NodeKey,
  type WorkflowState,
} from "@/components/wine/shared/WorkflowTrace";
import type { AnalyzeInput, AnalyzeResult } from "@/lib/wine/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives the analyze flow with a workflow-style visual progression.
 *
 * The API call runs in parallel with phased state transitions so the user
 * sees the agents "wake up" in topology order even when the backend (demo
 * mode) responds instantly. Real-mode latency is absorbed inside phase 3
 * which awaits both the timer and the response promise.
 *
 * Phases — keep in sync with the WorkflowTrace topology:
 *   0.  input        — set to "ok" immediately on click
 *   1.  orchestrator — runs, then ok
 *   2.  fan-out      — weather + geo + tavily run in parallel
 *   3.  api join     — wait for response, map traces to ok/fail
 *   4.  extraction   — runs (pioneer fires concurrently as a tool call)
 *   5.  pioneer ok   — short-lived: pioneer responds before extraction concludes
 *   6.  extraction ok
 *   7.  feature      — runs, then ok
 *   8.  dashboard ok — reveal the result panel
 */
export function useAnalysisFlow() {
  const [workflowState, setWorkflowState] = useState<WorkflowState>(INITIAL_WORKFLOW);
  const [details, setDetails] = useState<Partial<Record<NodeKey, NodeDetail>>>({});
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(body: AnalyzeInput): Promise<void> {
    setLoading(true);
    setError(null);
    setResult(null);
    setDetails({});
    setWorkflowState({ ...INITIAL_WORKFLOW, input: "ok" });

    const apiPromise = (async (): Promise<AnalyzeResult> => {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof j.error === "string" ? j.error : `HTTP ${res.status}`);
      }
      return (await res.json()) as AnalyzeResult;
    })();

    try {
      // Phase 1 — orchestrator wakes up
      await sleep(160);
      setWorkflowState((s) => ({ ...s, orchestrator: "running" }));

      await sleep(360);
      setWorkflowState((s) => ({
        ...s,
        orchestrator: "ok",
        weather_agent: "running",
        geo_agent: "running",
        tavily_agent: "running",
      }));

      // Phase 2 — three sub-agents parallel; wait for both animation + API
      await sleep(900);
      const data = await apiPromise;

      const traceMap = Object.fromEntries(data.trace.map((t) => [t.agent, t]));
      const setSub = (key: NodeKey): WorkflowState[NodeKey] => {
        const tr = traceMap[key];
        return tr ? (tr.ok ? "ok" : "fail") : "ok";
      };
      const detailOf = (key: NodeKey): NodeDetail | undefined => {
        const t = traceMap[key];
        return t ? { durationMs: t.durationMs, summary: t.summary, error: t.error } : undefined;
      };

      setWorkflowState((s) => ({
        ...s,
        weather_agent: setSub("weather_agent"),
        geo_agent: setSub("geo_agent"),
        tavily_agent: setSub("tavily_agent"),
      }));
      setDetails((d) => ({
        ...d,
        weather_agent: detailOf("weather_agent"),
        geo_agent: detailOf("geo_agent"),
        tavily_agent: detailOf("tavily_agent"),
      }));

      // Phase 3 — extraction runs alone (no Pioneer here; Pioneer serves feature now)
      await sleep(240);
      setWorkflowState((s) => ({ ...s, extraction_agent: "running" }));

      await sleep(560);
      setWorkflowState((s) => ({ ...s, extraction_agent: setSub("extraction_agent") }));
      setDetails((d) => ({ ...d, extraction_agent: detailOf("extraction_agent") }));

      // Phase 4 — feature + Pioneer (tool call) run concurrently
      await sleep(220);
      setWorkflowState((s) => ({
        ...s,
        feature_agent: "running",
        pioneer: "running",
      }));

      // Pioneer (Qwen / GLM / Llama-class) responds first — it's the inner LLM
      await sleep(360);
      setWorkflowState((s) => ({ ...s, pioneer: "ok" }));

      await sleep(140);
      setWorkflowState((s) => ({ ...s, feature_agent: setSub("feature_agent") }));
      setDetails((d) => ({ ...d, feature_agent: detailOf("feature_agent") }));

      // Phase 4b — backtest_agent (only when isBacktest, detected by trace)
      const hasBacktest = traceMap.backtest_agent !== undefined;
      if (hasBacktest) {
        await sleep(200);
        setWorkflowState((s) => ({ ...s, backtest_agent: "running" }));
        await sleep(420);
        setWorkflowState((s) => ({ ...s, backtest_agent: setSub("backtest_agent") }));
        setDetails((d) => ({ ...d, backtest_agent: detailOf("backtest_agent") }));
      } else {
        // Skip the backtest node visually — mark it as "skipped".
        setWorkflowState((s) => ({ ...s, backtest_agent: "skipped" }));
      }

      // Phase 5 — dashboard / reveal
      await sleep(160);
      setWorkflowState((s) => ({ ...s, dashboard: "ok" }));
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setWorkflowState((s) => {
        const next = { ...s };
        for (const k of Object.keys(s) as NodeKey[]) {
          if (next[k] === "running" || next[k] === "pending") next[k] = "fail";
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  return { workflowState, details, result, loading, error, run };
}
