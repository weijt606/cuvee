/**
 * Wine-domain types — shared across server agents and client UI.
 *
 * Keep this file free of `server-only` imports so it can be referenced
 * from client components for typing the /api/analyze response.
 */

export type Persona = "vineyard" | "trade";

/**
 * Trade sub-persona — applies only when persona = "trade". Distinguishes
 * three buyer archetypes whose risk lens differs even on identical
 * weather/geo/tavily evidence:
 *
 *   - merchant    : en-primeur, allocation, price volatility, age-worthiness
 *   - restaurant  : by-the-glass viability, vintage variation tolerance,
 *                   wine-list refresh cadence, food-pairing flexibility
 *   - wineshop    : retail volume, mainstream consumer appeal, predictable
 *                   supply, price-tier diversity
 *
 * Threaded through extraction + feature prompts so the LLM weights drivers
 * accordingly; also gates which result cards render in the dashboard.
 */
export type TradePersona = "merchant" | "restaurant" | "wineshop";

export type RiskBand = "low" | "moderate" | "elevated" | "high";

export interface Region {
  id: string;
  name: string;
  country: "FR";
  parent: "burgundy" | "bordeaux";
  /** Optional appellation list (Grand Cru / village / sub-region). */
  appellations?: string[];
  /** Centroid for map / geo-agent default queries. */
  centroid: { lat: number; lng: number };
}

export interface Timeframe {
  /** ISO date (YYYY-MM-DD). */
  start: string;
  /** ISO date (YYYY-MM-DD). */
  end: string;
}

export interface UploadMeta {
  name: string;
  /** Bytes. */
  size: number;
  mime: string;
}

export interface AnalyzeInput {
  region: Pick<Region, "id" | "name" | "parent">;
  timeframe: Timeframe;
  persona: Persona;
  /** Optional natural-language refinement, e.g. "focus on frost risk in April". */
  question?: string;
  /** Metadata of vineyard-uploaded supporting docs (file contents not transmitted in MVP). */
  uploads?: UploadMeta[];
  /**
   * Optional explicit château selection (trade dashboard map click). When set,
   * geo_agent switches to single-site mode; user intent wins over GPT routing.
   */
  chateau?: string;
  /**
   * Optional trade sub-persona — only meaningful when persona === "trade".
   * Defaults to "merchant" on the server if persona === "trade" and this is
   * absent (preserves prior behavior for older clients).
   */
  tradePersona?: TradePersona;
}

/** Client-safe shape of the geo_agent's structured signals — surfaced on
 *  both dashboards as a Terroir card. Mirrors GeoSignals from geo.ts but
 *  defined here so client components can import the type without dragging
 *  in `"server-only"` modules. */
export interface GeoSnapshot {
  summary: string;
  centroid: { lat: number; lng: number };
  appellations: string[];
  notes: string[];
}

/** A single critic-score / market-reaction observation for backtest. */
export interface BacktestCritic {
  /** Source label (e.g. "Wine Advocate", "Decanter", "Liv-ex"). */
  source: string;
  /** Numeric score on the source's scale (e.g. 96 on WA's 100-pt scale). */
  score?: number;
  /** Optional source-specific scale label, e.g. "/100" or "+18% YoY". */
  scale?: string;
  /** One-line direct quote / summary from the source. */
  quote?: string;
  /** URL of the source article when available. */
  url?: string;
}

/** Output of the backtest_agent — appears only for historical timeframes. */
export interface BacktestSnapshot {
  /** True if timeframe.end was in the past relative to runtime. */
  isBacktest: true;
  /** The year being backtested (parsed from timeframe.end). */
  year: number;
  /** Our predicted RISK score for that vintage (echo of result.riskScore). */
  predictedScore: number;
  /** Predicted quality band (echo from extraction). */
  predictedBand?: "Great" | "Excellent" | "Good" | "Average" | "Poor";
  /** Actual critic / market observations harvested from Tavily search. */
  critics: BacktestCritic[];
  /** Short prose summary of how reality compared to our prediction. */
  accuracySummary: string;
  /** One of "high_agreement" / "moderate_agreement" / "divergent" — directional verdict. */
  verdict: "high_agreement" | "moderate_agreement" | "divergent";
}

export interface RiskDriver {
  source: "weather" | "geo" | "tavily" | "extraction";
  signal: string;
  /** 0–1 contribution to total risk. */
  weight: number;
}

export interface Recommendation {
  persona: Persona;
  action: string;
  /** Optional source-of-truth pointer (sub-agent signal id, url, etc.). */
  evidence?: string;
}

export interface AgentStepTrace {
  agent: string;
  ok: boolean;
  durationMs: number;
  error?: string;
  /** Compact summary for the dashboard's debug drawer. */
  summary?: string;
}

export interface FeatureSummary {
  /** 2-sentence summary surfaced above the risk card. */
  executiveSummary: string;
  /** One-page markdown report (downloadable). */
  reportMarkdown: string;
  /** Short markdown digest used as the email-subscription preview. */
  emailDigest: string;
}

export interface AnalyzeResult {
  region: AnalyzeInput["region"];
  timeframe: Timeframe;
  persona: Persona;
  riskScore: number;
  riskBand: RiskBand;
  drivers: RiskDriver[];
  recommendations: Recommendation[];
  /** Underlying vintage quality band from extraction (Great → Poor). */
  qualityBand?: "Great" | "Excellent" | "Good" | "Average" | "Poor";
  /** IDs of hard event gates the extraction agent identified as active. */
  activeGates?: string[];
  /** Optional rationale string from extraction. */
  rationale?: string;
  /** Feature-agent output for dashboard summary / report / subscription. */
  feature?: FeatureSummary | null;
  /** Geo-agent structured snapshot (elevation / soil / frost-pockets / AOC mix) — drives the Terroir card. */
  geoSnapshot?: GeoSnapshot | null;
  /** Backtest snapshot — only populated when the timeframe is in the past. */
  backtest?: BacktestSnapshot | null;
  /** Step-by-step trace shown in the dashboard for transparency. */
  trace: AgentStepTrace[];
  generatedAt: string;
  /** True if any branch ran against fixtures (demo mode or missing keys). */
  isDemoOrPartial: boolean;
}

export function bandOf(score: number): RiskBand {
  if (score < 25) return "low";
  if (score < 50) return "moderate";
  if (score < 75) return "elevated";
  return "high";
}
