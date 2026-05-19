import "server-only";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { env } from "@/lib/env";
import type {
  AnalysisRecord,
  CalibrationDrift,
  FindSimilarQuery,
  MemoryStore,
} from "./types";

let database: import("node:sqlite").DatabaseSync | null | undefined;

async function getDatabase(): Promise<import("node:sqlite").DatabaseSync | null> {
  if (database !== undefined) return database;
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const cacheDir = join(process.cwd(), "data", ".memory");
    mkdirSync(cacheDir, { recursive: true });
    database = new DatabaseSync(join(cacheDir, "analysis-history.sqlite"));
    database.exec(`
      CREATE TABLE IF NOT EXISTS analysis_history (
        id TEXT PRIMARY KEY,
        region_id TEXT NOT NULL,
        chateau TEXT,
        year INTEGER NOT NULL,
        persona TEXT NOT NULL,
        trade_persona TEXT,

        predicted_risk_score INTEGER NOT NULL,
        predicted_quality_band TEXT NOT NULL,
        driver_summary TEXT NOT NULL,
        rationale_summary TEXT,

        actual_avg_critic_score REAL,
        actual_critic_count INTEGER,
        backtest_verdict TEXT,

        input_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_region_year ON analysis_history(region_id, year);
      CREATE INDEX IF NOT EXISTS idx_history_input_hash ON analysis_history(input_hash);
      CREATE INDEX IF NOT EXISTS idx_history_chateau ON analysis_history(chateau);
    `);
    return database;
  } catch {
    database = null;
    return null;
  }
}

interface Row {
  id: string;
  region_id: string;
  chateau: string | null;
  year: number;
  persona: string;
  trade_persona: string | null;
  predicted_risk_score: number;
  predicted_quality_band: string;
  driver_summary: string;
  rationale_summary: string | null;
  actual_avg_critic_score: number | null;
  actual_critic_count: number | null;
  backtest_verdict: string | null;
  input_hash: string;
  created_at: number;
  updated_at: number;
}

function rowToRecord(r: Row): AnalysisRecord {
  return {
    id: r.id,
    regionId: r.region_id,
    chateau: r.chateau ?? undefined,
    year: r.year,
    persona: r.persona,
    tradePersona: r.trade_persona ?? undefined,
    predictedRiskScore: r.predicted_risk_score,
    predictedQualityBand: r.predicted_quality_band,
    driverSummary: r.driver_summary,
    rationaleSummary: r.rationale_summary ?? undefined,
    actualAvgCriticScore: r.actual_avg_critic_score ?? undefined,
    actualCriticCount: r.actual_critic_count ?? undefined,
    backtestVerdict: (r.backtest_verdict ?? undefined) as AnalysisRecord["backtestVerdict"],
    inputHash: r.input_hash,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Evict the oldest rows when we exceed CUVEE_MEMORY_MAX_ROWS. Single-row
 *  cap is a row-count LRU rather than a TTL — episodic memory is meant to
 *  accumulate over time and we just want to keep storage bounded. */
function evictIfOverCap(db: import("node:sqlite").DatabaseSync): void {
  const cap = env.CUVEE_MEMORY_MAX_ROWS ?? 1000;
  const row = db.prepare("SELECT COUNT(*) as n FROM analysis_history").get() as { n: number };
  const total = row.n;
  if (total <= cap) return;
  const overflow = total - cap;
  db.prepare(
    `DELETE FROM analysis_history WHERE id IN (
       SELECT id FROM analysis_history ORDER BY created_at ASC LIMIT ?
     )`,
  ).run(overflow);
}

export const sqliteMemoryStore: MemoryStore = {
  name: "sqlite",

  async insert(record) {
    const db = await getDatabase();
    if (!db) return ""; // memory disabled; silently no-op
    const id = randomUUID();
    const now = Date.now();
    try {
      db.prepare(
        `INSERT INTO analysis_history (
          id, region_id, chateau, year, persona, trade_persona,
          predicted_risk_score, predicted_quality_band, driver_summary, rationale_summary,
          actual_avg_critic_score, actual_critic_count, backtest_verdict,
          input_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        record.regionId,
        record.chateau ?? null,
        record.year,
        record.persona,
        record.tradePersona ?? null,
        record.predictedRiskScore,
        record.predictedQualityBand,
        record.driverSummary,
        record.rationaleSummary ?? null,
        record.actualAvgCriticScore ?? null,
        record.actualCriticCount ?? null,
        record.backtestVerdict ?? null,
        record.inputHash,
        now,
        now,
      );
      evictIfOverCap(db);
      return id;
    } catch {
      return "";
    }
  },

  async updateBacktest(id, patch) {
    const db = await getDatabase();
    if (!db || !id) return;
    try {
      db.prepare(
        `UPDATE analysis_history
         SET actual_avg_critic_score = ?,
             actual_critic_count = ?,
             backtest_verdict = ?,
             updated_at = ?
         WHERE id = ?`,
      ).run(
        patch.actualAvgCriticScore ?? null,
        patch.actualCriticCount ?? null,
        patch.backtestVerdict ?? null,
        Date.now(),
        id,
      );
    } catch {
      /* swallow — memory is best-effort */
    }
  },

  async findSimilar(q: FindSimilarQuery): Promise<AnalysisRecord[]> {
    const db = await getDatabase();
    if (!db) return [];
    const limit = q.limit ?? 3;
    try {
      // Prefer matches that share BOTH region + chateau, then region + year proximity,
      // then region alone. Backtested rows (with critic data) are ranked above
      // forward-only predictions so few-shot examples are maximally informative.
      const where: string[] = ["region_id = ?", "persona = ?"];
      const params: Array<string | number> = [q.regionId, q.persona];
      if (q.chateau) {
        where.push("(chateau = ? OR chateau IS NULL)");
        params.push(q.chateau);
      }
      const sql = `
        SELECT * FROM analysis_history
        WHERE ${where.join(" AND ")}
        ORDER BY
          (backtest_verdict IS NOT NULL) DESC,
          (chateau IS NOT NULL AND chateau = ?) DESC,
          ABS(year - ?) ASC,
          updated_at DESC
        LIMIT ?
      `;
      params.push(q.chateau ?? "");
      params.push(q.year ?? new Date().getFullYear());
      params.push(limit);
      const rows = db.prepare(sql).all(...params) as unknown as Row[];
      return rows.map(rowToRecord);
    } catch {
      return [];
    }
  },

  async calibrationDrift(regionId, persona): Promise<CalibrationDrift | null> {
    const db = await getDatabase();
    if (!db) return null;
    try {
      // Quality delta: actual_avg_critic_score - (100 - predicted_risk_score)
      // Positive delta = critics liked the vintage MORE than we predicted.
      const rows = db
        .prepare(
          `SELECT
             predicted_quality_band,
             actual_avg_critic_score,
             predicted_risk_score
           FROM analysis_history
           WHERE region_id = ? AND persona = ?
             AND actual_avg_critic_score IS NOT NULL`,
        )
        .all(regionId, persona) as Array<{
        predicted_quality_band: string;
        actual_avg_critic_score: number;
        predicted_risk_score: number;
      }>;
      if (rows.length === 0) return null;

      let totalDelta = 0;
      const perBand = new Map<string, { sum: number; n: number }>();
      for (const r of rows) {
        const predictedQuality = 100 - r.predicted_risk_score;
        const delta = r.actual_avg_critic_score - predictedQuality;
        totalDelta += delta;
        const cur = perBand.get(r.predicted_quality_band) ?? { sum: 0, n: 0 };
        cur.sum += delta;
        cur.n += 1;
        perBand.set(r.predicted_quality_band, cur);
      }

      const byBand: CalibrationDrift["byBand"] = {};
      for (const [band, { sum, n }] of perBand) {
        byBand[band] = { sampleCount: n, avgQualityDelta: sum / n };
      }

      return {
        sampleCount: rows.length,
        avgQualityDelta: totalDelta / rows.length,
        byBand,
      };
    } catch {
      return null;
    }
  },
};
