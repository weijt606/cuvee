import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { sqliteMemoryStore } from "./sqlite";
import type { AnalysisRecord, MemoryStore } from "./types";

export type { AnalysisRecord, CalibrationDrift, FindSimilarQuery, MemoryStore } from "./types";

/** A no-op store used when memory is disabled via env. */
const nullStore: MemoryStore = {
  name: "null",
  async insert() {
    return "";
  },
  async updateBacktest() {},
  async findSimilar() {
    return [];
  },
  async calibrationDrift() {
    return null;
  },
};

/**
 * The system's memory store. When CUVEE_MEMORY_DISABLED is truthy we return
 * a no-op, so contributors who don't want a local SQLite file (e.g. CI runs,
 * ephemeral containers) can opt out cleanly.
 */
export function memory(): MemoryStore {
  if (env.CUVEE_MEMORY_DISABLED) return nullStore;
  return sqliteMemoryStore;
}

/** Canonical input hash used as a foreign key for de-duplication / lookup. */
export function hashAnalyzeInput(input: {
  region: { id: string };
  timeframe: { start: string; end: string };
  persona: string;
  question?: string;
  chateau?: string;
  tradePersona?: string;
}): string {
  const canon = JSON.stringify({
    r: input.region.id,
    s: input.timeframe.start,
    e: input.timeframe.end,
    p: input.persona,
    tp: input.tradePersona ?? "",
    q: input.question ?? "",
    c: input.chateau ?? "",
  });
  return createHash("sha256").update(canon).digest("hex").slice(0, 16);
}

/**
 * Build a compact, prompt-injectable string of few-shot examples drawn from
 * past analyses. Pinned to ≤ ~600 chars so it doesn't dominate the 5K-token
 * extraction prompt.
 */
export function formatFewShotExamples(records: AnalysisRecord[]): string {
  if (records.length === 0) return "";
  const lines: string[] = ["PAST PREDICTIONS for similar contexts (use as calibration anchors):"];
  for (const r of records) {
    const qualityScore = 100 - r.predictedRiskScore;
    const head = `  • ${r.regionId}${r.chateau ? ` · ${r.chateau}` : ""} · vintage ${r.year}`;
    const pred = `    Predicted: ${r.predictedQualityBand} (qualityScore=${qualityScore}, risk=${r.predictedRiskScore})`;
    lines.push(head, pred);
    if (r.actualAvgCriticScore !== undefined && r.actualCriticCount) {
      const delta = Math.round(r.actualAvgCriticScore - qualityScore);
      const sign = delta > 0 ? "+" : "";
      lines.push(
        `    Actual avg critic: ${Math.round(r.actualAvgCriticScore)} (n=${r.actualCriticCount}, verdict: ${r.backtestVerdict})` +
          `   → delta ${sign}${delta}`,
      );
    }
  }
  return lines.join("\n");
}
