/**
 * Memory layer — the self-optimization mechanism that replaced Pioneer's
 * fine-tuning role. Every analysis run lands here, and extraction reads
 * back the most-similar past records as few-shot calibration anchors.
 * Backtest writes the predicted-vs-actual delta so the system can detect
 * systematic bias (e.g. "we over-predict Pomerol by 6 points on average").
 *
 * Storage is SQLite-backed at `data/.memory/analysis-history.sqlite`
 * (gitignored). Lazy-opened on first call. Survives process restarts.
 */

export interface AnalysisRecord {
  /** UUID v4 — also the id used to update with backtest results later. */
  id: string;
  /** Region slug, e.g. "bordeaux-medoc". */
  regionId: string;
  /** Optional château focus (when set). */
  chateau?: string;
  /** Vintage year. */
  year: number;
  /** "vineyard" | "trade". */
  persona: string;
  /** Trade sub-persona — only set when persona === "trade". */
  tradePersona?: string;

  // ── Prediction (always set) ──────────────────────────────────────────
  /** Risk score 0-100 (high = bad). */
  predictedRiskScore: number;
  /** Quality band the prediction landed on. */
  predictedQualityBand: string;
  /** Compact one-line summary of the top drivers from extraction. */
  driverSummary: string;
  /** Trimmed rationale string from extraction (≤ 300 chars). */
  rationaleSummary?: string;

  // ── Backtest verification (NULL until backtest_agent fires) ──────────
  /** Average critic score from backtest, on a 0-100 quality scale. */
  actualAvgCriticScore?: number;
  /** Number of critics that contributed to the average. */
  actualCriticCount?: number;
  /** Backtest agent's directional judgment. */
  backtestVerdict?: "high_agreement" | "moderate_agreement" | "divergent";

  // ── Meta ─────────────────────────────────────────────────────────────
  /** Hash of the canonicalized AnalyzeInput — used to dedupe / look up. */
  inputHash: string;
  createdAt: number;
  updatedAt: number;
}

export interface FindSimilarQuery {
  regionId: string;
  year?: number;
  chateau?: string;
  persona: string;
  /** Default 3. Caller may shrink if prompt budget is tight. */
  limit?: number;
}

export interface CalibrationDrift {
  /** How many backtested records contributed to the average. */
  sampleCount: number;
  /** Positive = we predicted higher QUALITY than critics
   *  (i.e. lower RISK than the verdict supports). */
  avgQualityDelta: number;
  /** Per-band breakdown (Great / Excellent / Good / Average / Poor → mean delta). */
  byBand?: Record<string, { sampleCount: number; avgQualityDelta: number }>;
}

export interface MemoryStore {
  readonly name: string;

  /** Insert a new prediction record. Returns the assigned id. */
  insert(
    record: Omit<AnalysisRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<string>;

  /** Attach backtest results to a previously-inserted record. */
  updateBacktest(
    id: string,
    patch: Pick<
      AnalysisRecord,
      "actualAvgCriticScore" | "actualCriticCount" | "backtestVerdict"
    >,
  ): Promise<void>;

  /** Find similar past predictions (for few-shot injection). */
  findSimilar(q: FindSimilarQuery): Promise<AnalysisRecord[]>;

  /** Compute bias for a (region, persona) pair using only backtested rows. */
  calibrationDrift(regionId: string, persona: string): Promise<CalibrationDrift | null>;
}
