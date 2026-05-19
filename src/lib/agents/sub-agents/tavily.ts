import "server-only";
import { env, integrations, isDemoMode } from "@/lib/env";
import type { AgentContext, SubAgent } from "@/lib/agents/types";
import { findRegion } from "@/lib/wine/regions";
import {
  buildTavilyCacheKey,
  readTavilyCache,
  writeTavilyCache,
} from "@/lib/agents/sub-agents/tavily-cache";

export interface TavilyInput {
  // New harness input
  region?: "Bordeaux" | string;
  startYear?: number;
  endYear?: number;
  maxResultsPerQuery?: number;
  forceRefresh?: boolean;
  chateau?: string;
  // Legacy fields (kept for compatibility with existing orchestrator prompts)
  regionId?: string;
  facets?: Array<"vineyard_official" | "news" | "forum" | "government" | "research">;
  query?: string;
}

type SchemaFeatureId = "market_expectation_sentiment" | "policy_trade_risk";
type SchemaSignalCategory = "non_natural_market_signal" | "non_natural_policy_signal";

export interface TavilySignalSource {
  url: string;
  domain: string;
  title: string;
}

export interface TavilySignal {
  featureId: SchemaFeatureId;
  category: SchemaSignalCategory;
  window: string;
  signal: string;
  sources: TavilySignalSource[];
  source: string;
  url?: string;
  snippet: string;
  /** 0–1, agent's own confidence. */
  confidence: number;
}

export type TavilySourceType =
  | "bordeaux_sentiment"
  | "bordeaux_policy"
  | "bordeaux_regulation"
  | "bordeaux_winemaker"
  | "bordeaux_market";

export type TavilyTargetAudience = "estate_owner" | "distributor";

export interface TavilyHarnessResult {
  year: number;
  region: "Bordeaux";
  sourceType: TavilySourceType;
  targetAudience: TavilyTargetAudience[];
  query: string;
  title: string;
  url: string;
  normalizedUrl: string;
  domain: string;
  score: number;
  content: string;
  sourceWeight: number;
  domainWeight: number;
  finalScore: number;
  hitCount: number;
  matchedQueries: string[];
  matchedYears: number[];
  matchedSourceTypes: TavilySourceType[];
}

export interface TavilyHarnessError {
  year: number;
  sourceType: TavilySourceType;
  query: string;
  error: string;
}

export interface TavilyHarnessReport {
  region: "Bordeaux";
  startYear: number;
  endYear: number;
  queryCount: number;
  rawCount: number;
  afterQualityFilter: number;
  afterUrlDedupe: number;
  removedByQualityFilter: number;
  removedByUrlDedupe: number;
  errorCount: number;
  cacheHits: number;
  cacheMisses: number;
  liveFetches: number;
  sourceTypeCounts: Record<TavilySourceType, number>;
  topDomains: Array<{ domain: string; count: number }>;
}

export interface TavilyHarnessOutput {
  results: TavilyHarnessResult[];
  report: TavilyHarnessReport;
  errors: TavilyHarnessError[];
}

export interface TavilySignals {
  summary: string;
  signals: TavilySignal[];
  /** True if the agent skipped the live search (key missing / demo mode). */
  partial: boolean;
  report?: TavilyHarnessReport;
  errors?: TavilyHarnessError[];
  results?: TavilyHarnessResult[];
}

type TavilySearchResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
};

type TavilySearchResponse = {
  results?: TavilySearchResult[];
};

const MAX_QUERY_COUNT = 200;
const MAX_YEAR_SPAN = 16;
// Per-query result cap. We keep this at 5 (not the demo-fast-reduced 3) so
// extraction sees the full breadth of evidence — the top 3 vs top 5 ranking
// boundary is exactly where mid-quality critic / négociant hits sit, and
// dropping them measurably biases the driver weighting toward weather/geo.
const DEFAULT_MAX_RESULTS_PER_QUERY = 5;
const MIN_TAVILY_SCORE = 0.2;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RETRIES = 1;
const MAX_CONCURRENT_REQUESTS = 5;

const SOURCE_WEIGHTS: Record<TavilySourceType, number> = {
  bordeaux_sentiment: 0.75,
  bordeaux_policy: 0.95,
  bordeaux_regulation: 0.95,
  bordeaux_winemaker: 0.9,
  bordeaux_market: 1.0,
};

const SOURCE_AUDIENCE: Record<TavilySourceType, TavilyTargetAudience[]> = {
  bordeaux_sentiment: ["estate_owner", "distributor"],
  bordeaux_policy: ["estate_owner"],
  bordeaux_regulation: ["estate_owner"],
  bordeaux_winemaker: ["estate_owner", "distributor"],
  bordeaux_market: ["estate_owner", "distributor"],
};

const TRUSTED_DOMAINS: Record<string, number> = {
  "inao.gouv.fr": 1.0,
  "agriculture.gouv.fr": 1.0,
  "franceagrimer.fr": 0.95,
  "interprofession-bordeaux.com": 0.95,
  "vins-bordeaux.fr": 0.95,
  "decanter.com": 0.85,
  "wine-searcher.com": 0.85,
  "thedrinksbusiness.com": 0.8,
  "jancisrobinson.com": 0.8,
};

const BLOCKED_TERMS = [
  "hotel",
  "tourism",
  "booking",
  "tripadvisor",
  "airbnb",
  "restaurant reservation",
  "restaurant booking",
];

type NormalizedHarnessInput = {
  region: "Bordeaux";
  startYear: number;
  endYear: number;
  maxResultsPerQuery: number;
};

type QuerySpec = {
  year: number;
  sourceType: TavilySourceType;
  query: string;
};

const SCHEMA_FEATURE_BY_SOURCE_TYPE: Record<
  TavilySourceType,
  { featureId: SchemaFeatureId; category: SchemaSignalCategory; window: string }
> = {
  bordeaux_sentiment: {
    featureId: "market_expectation_sentiment",
    category: "non_natural_market_signal",
    window: "pre-release and en primeur period",
  },
  bordeaux_policy: {
    featureId: "policy_trade_risk",
    category: "non_natural_policy_signal",
    window: "vintage release year",
  },
  bordeaux_regulation: {
    featureId: "policy_trade_risk",
    category: "non_natural_policy_signal",
    window: "vintage release year",
  },
  bordeaux_winemaker: {
    featureId: "market_expectation_sentiment",
    category: "non_natural_market_signal",
    window: "pre-release and en primeur period",
  },
  bordeaux_market: {
    featureId: "market_expectation_sentiment",
    category: "non_natural_market_signal",
    window: "pre-release and en primeur period",
  },
};

function currentYear(): number {
  return new Date().getUTCFullYear();
}

function clampScore(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function toInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number.parseInt(v, 10);
  return null;
}

function yearFromIsoDate(input: string | undefined): number | null {
  if (!input) return null;
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(input);
  if (!m) return null;
  const year = m[1];
  if (!year) return null;
  return Number.parseInt(year, 10);
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${host}${path}`;
  } catch {
    return "";
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function domainWeight(domain: string): number {
  if (!domain) return 0.6;
  for (const [trusted, weight] of Object.entries(TRUSTED_DOMAINS)) {
    if (domain === trusted || domain.endsWith(`.${trusted}`)) return weight;
  }
  return 0.65;
}

function includesBlockedText(...parts: string[]): boolean {
  const t = parts.join(" ").toLowerCase();
  return BLOCKED_TERMS.some((term) => t.includes(term));
}

function audienceForSourceTypes(sourceTypes: TavilySourceType[]): TavilyTargetAudience[] {
  return [...new Set(sourceTypes.flatMap((sourceType) => SOURCE_AUDIENCE[sourceType]))];
}

function maxSourceWeight(sourceTypes: TavilySourceType[]): number {
  return Math.max(...sourceTypes.map((sourceType) => SOURCE_WEIGHTS[sourceType]));
}

function normalizeInput(input: TavilyInput, ctx?: AgentContext): NormalizedHarnessInput {
  const regionFromRegion = typeof input.region === "string" ? input.region : undefined;
  const regionFromId = typeof input.regionId === "string" && input.regionId.includes("bordeaux")
    ? "Bordeaux"
    : undefined;
  const regionFromCtx = ctx?.region.parent === "bordeaux" ? "Bordeaux" : undefined;
  const region = regionFromRegion ?? regionFromId ?? regionFromCtx;

  if (region !== "Bordeaux") {
    throw new Error("region must be Bordeaux");
  }

  const nowYear = currentYear();
  const startYear = toInt(input.startYear);
  const endYear = toInt(input.endYear);
  if (startYear === null || endYear === null) {
    throw new Error("startYear and endYear must be integers");
  }
  if (startYear > endYear) throw new Error("startYear must be <= endYear");
  if (startYear < 2000) throw new Error("startYear must be >= 2000");
  if (endYear > nowYear) throw new Error(`endYear must be <= ${nowYear}`);
  if (endYear - startYear + 1 > MAX_YEAR_SPAN) {
    throw new Error(`year range is too large; max ${MAX_YEAR_SPAN} years`);
  }

  const maxResultsPerQuery =
    input.maxResultsPerQuery === undefined ? DEFAULT_MAX_RESULTS_PER_QUERY : toInt(input.maxResultsPerQuery);
  if (maxResultsPerQuery === null) throw new Error("maxResultsPerQuery must be an integer");
  if (maxResultsPerQuery < 1 || maxResultsPerQuery > 10) {
    throw new Error("maxResultsPerQuery must be between 1 and 10");
  }

  return { region: "Bordeaux", startYear, endYear, maxResultsPerQuery };
}

function buildQueries(input: NormalizedHarnessInput, refinement?: string): QuerySpec[] {
  const byType: Record<TavilySourceType, string[]> = {
    bordeaux_sentiment: [
      "Bordeaux wine sentiment opinion critic review consumer reaction avis millesime {year}",
      "Bordeaux forum community discussion vintage opinion media review reaction consommateurs {year}",
    ],
    bordeaux_policy: [
      "Bordeaux France agriculture policy climate aid support vineyard disaster subsidy politique agricole {year}",
      "Bordeaux viticulture government policy agriculture support climate compensation aide climatique {year}",
    ],
    bordeaux_regulation: [
      "Bordeaux AOC INAO regulation appellation certification yield harvest rule reglementation {year}",
      "INAO Bordeaux appellation regles AOC vendanges rendement certification controle {year}",
    ],
    bordeaux_winemaker: [
      "Bordeaux winemaker interview chateau harvest note vintage opinion vigneron vendanges {year}",
      "Bordeaux oenologue interview note de vendange avis millesime decision recolte chateau {year}",
    ],
    bordeaux_market: [
      "Bordeaux en primeur market reaction trade sentiment industry chatter market rumors negociants courtiers merchants release price weak demand buyer hesitation stock pressure inventory pressure {year}",
      "Bordeaux en primeur allocation reducing allocation allocation cuts negociants courtiers merchants market reaction release price buyer hesitation weak demand pressure du marche prix {year}",
    ],
  };

  const specs: QuerySpec[] = [];
  for (let y = input.startYear; y <= input.endYear; y++) {
    (Object.keys(byType) as TavilySourceType[]).forEach((sourceType) => {
      byType[sourceType].forEach((template) => {
        specs.push({
          year: y,
          sourceType,
          query: [template.replace("{year}", String(y)), refinement?.trim()].filter(Boolean).join(" "),
        });
      });
    });
  }
  if (specs.length > MAX_QUERY_COUNT) {
    throw new Error(
      `query count ${specs.length} exceeds MAX_QUERY_COUNT=${MAX_QUERY_COUNT}; narrow year range or reduce queries per source`,
    );
  }
  return specs;
}

async function fetchTavily(
  query: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<TavilySearchResult[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
    const merged = new AbortController();
    const onAbort = () => merged.abort();
    timeout.signal.addEventListener("abort", onAbort, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const payload = {
        query,
        search_depth: "advanced",
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
      };
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        signal: merged.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.TAVILY_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        const retryWithBodyKey = await fetch("https://api.tavily.com/search", {
          method: "POST",
          signal: merged.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, api_key: env.TAVILY_API_KEY }),
        });
        if (!retryWithBodyKey.ok) throw new Error(`Tavily HTTP ${retryWithBodyKey.status}`);
        const body = (await retryWithBodyKey.json()) as TavilySearchResponse;
        return body.results ?? [];
      }
      if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
      const body = (await res.json()) as TavilySearchResponse;
      return body.results ?? [];
    } catch (err) {
      lastErr = err;
      if (attempt <= MAX_RETRIES - 1) await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
      timeout.signal.removeEventListener("abort", onAbort);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function qualityFilter(r: TavilyHarnessResult): boolean {
  if (!r.url || !r.normalizedUrl) return false;
  if (r.score < MIN_TAVILY_SCORE) return false;
  if (includesBlockedText(r.title, r.url, r.content, r.domain)) return false;
  return true;
}

function toSourceTypeCounts(results: TavilyHarnessResult[]): Record<TavilySourceType, number> {
  const counts: Record<TavilySourceType, number> = {
    bordeaux_sentiment: 0,
    bordeaux_policy: 0,
    bordeaux_regulation: 0,
    bordeaux_winemaker: 0,
    bordeaux_market: 0,
  };
  for (const r of results) counts[r.sourceType] += 1;
  return counts;
}

function topDomains(results: TavilyHarnessResult[], limit = 8): Array<{ domain: string; count: number }> {
  const bag = new Map<string, number>();
  for (const r of results) {
    if (!r.domain) continue;
    bag.set(r.domain, (bag.get(r.domain) ?? 0) + 1);
  }
  return [...bag.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([domain, count]) => ({ domain, count }));
}

function compactText(text: string, maxLength = 320): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength - 3)}...`;
}

async function runQueryPool(
  queries: QuerySpec[],
  worker: (spec: QuerySpec) => Promise<{
    rows: TavilyHarnessResult[];
    errors: TavilyHarnessError[];
    cacheHits: number;
    cacheMisses: number;
    liveFetches: number;
  }>,
): Promise<
  Array<{
    rows: TavilyHarnessResult[];
    errors: TavilyHarnessError[];
    cacheHits: number;
    cacheMisses: number;
    liveFetches: number;
  }>
> {
  const results: Array<{
    rows: TavilyHarnessResult[];
    errors: TavilyHarnessError[];
    cacheHits: number;
    cacheMisses: number;
    liveFetches: number;
  }> = [];
  for (let i = 0; i < queries.length; i += MAX_CONCURRENT_REQUESTS) {
    const batch = queries.slice(i, i + MAX_CONCURRENT_REQUESTS);
    results.push(...(await Promise.all(batch.map(worker))));
  }
  return results;
}

export async function runTavilyHarness(
  rawInput: TavilyInput,
  opts: { signal?: AbortSignal } = {},
): Promise<TavilyHarnessOutput> {
  const input = normalizeInput(rawInput);
  const refinement = [rawInput.query, rawInput.chateau ? `chateau ${rawInput.chateau}` : ""]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ");
  const queries = buildQueries(input, refinement || undefined);
  const settled = await runQueryPool(
    queries,
    async (spec) => {
      const rowsForQuery: TavilyHarnessResult[] = [];
      const errorsForQuery: TavilyHarnessError[] = [];
      let cacheHits = 0;
      let cacheMisses = 0;
      let liveFetches = 0;
      try {
        const cacheInput = {
          region: input.region,
          regionScope: rawInput.regionId ?? "",
          chateau: rawInput.chateau ?? "",
          year: spec.year,
          sourceType: spec.sourceType,
          query: spec.query,
          maxResultsPerQuery: input.maxResultsPerQuery,
        };
        const cacheKey = buildTavilyCacheKey(cacheInput);
        let rows: TavilySearchResult[] | null = null;

        if (!rawInput.forceRefresh) {
          rows = await readTavilyCache(cacheKey);
          if (rows) cacheHits++;
          else cacheMisses++;
        }

        if (!rows) {
          rows = await fetchTavily(spec.query, input.maxResultsPerQuery, opts.signal);
          liveFetches++;
          await writeTavilyCache(cacheKey, cacheInput, rows);
        }

        for (const row of rows) {
          const url = row.url ?? "";
          const normalized = normalizeUrl(url);
          const domain = domainOf(url);
          const sourceWeight = SOURCE_WEIGHTS[spec.sourceType];
          const dWeight = domainWeight(domain);
          const score = clampScore(row.score ?? 0);
          rowsForQuery.push({
            year: spec.year,
            region: "Bordeaux",
            sourceType: spec.sourceType,
            targetAudience: SOURCE_AUDIENCE[spec.sourceType],
            query: spec.query,
            title: row.title ?? "",
            url,
            normalizedUrl: normalized,
            domain,
            score,
            content: row.content ?? "",
            sourceWeight,
            domainWeight: dWeight,
            finalScore: clampScore(score * sourceWeight * dWeight),
            hitCount: 1,
            matchedQueries: [spec.query],
            matchedYears: [spec.year],
            matchedSourceTypes: [spec.sourceType],
          });
        }
      } catch (err) {
        errorsForQuery.push({
          year: spec.year,
          sourceType: spec.sourceType,
          query: spec.query,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return { rows: rowsForQuery, errors: errorsForQuery, cacheHits, cacheMisses, liveFetches };
    },
  );

  const errors = settled.flatMap((item) => item.errors);
  const rawRows = settled.flatMap((item) => item.rows);
  const cacheHits = settled.reduce((sum, item) => sum + item.cacheHits, 0);
  const cacheMisses = settled.reduce((sum, item) => sum + item.cacheMisses, 0);
  const liveFetches = settled.reduce((sum, item) => sum + item.liveFetches, 0);

  const afterQuality = rawRows.filter(qualityFilter);

  const deduped = new Map<string, TavilyHarnessResult>();
  for (const row of afterQuality) {
    const existing = deduped.get(row.normalizedUrl);
    if (!existing) {
      deduped.set(row.normalizedUrl, row);
      continue;
    }
    const winner = row.score > existing.score ? row : existing;
    const loser = winner === row ? existing : row;
    winner.hitCount = existing.hitCount + row.hitCount;
    winner.matchedQueries = [...new Set([...existing.matchedQueries, ...loser.matchedQueries])];
    winner.matchedYears = [...new Set([...existing.matchedYears, ...loser.matchedYears])].sort((a, b) => a - b);
    winner.matchedSourceTypes = [
      ...new Set([...existing.matchedSourceTypes, ...loser.matchedSourceTypes]),
    ];
    winner.targetAudience = audienceForSourceTypes(winner.matchedSourceTypes);
    winner.sourceWeight = maxSourceWeight(winner.matchedSourceTypes);
    winner.finalScore = clampScore(winner.score * winner.sourceWeight * winner.domainWeight);
    deduped.set(row.normalizedUrl, winner);
  }

  const results = [...deduped.values()].sort((a, b) => b.finalScore - a.finalScore);
  const report: TavilyHarnessReport = {
    region: input.region,
    startYear: input.startYear,
    endYear: input.endYear,
    queryCount: queries.length,
    rawCount: rawRows.length,
    afterQualityFilter: afterQuality.length,
    afterUrlDedupe: results.length,
    removedByQualityFilter: rawRows.length - afterQuality.length,
    removedByUrlDedupe: afterQuality.length - results.length,
    errorCount: errors.length,
    cacheHits,
    cacheMisses,
    liveFetches,
    sourceTypeCounts: toSourceTypeCounts(results),
    topDomains: topDomains(results),
  };

  return { results, report, errors };
}

export function mapTavilyResultsToSchemaSignals(results: TavilyHarnessResult[]): TavilySignal[] {
  return results.slice(0, 12).map((r) => {
    const schemaFeature = SCHEMA_FEATURE_BY_SOURCE_TYPE[r.sourceType];
    return {
      featureId: schemaFeature.featureId,
      category: schemaFeature.category,
      window: schemaFeature.window,
      signal: compactText(r.content || r.title),
      sources: [{ url: r.url, domain: r.domain, title: r.title }],
      source: r.sourceType,
      url: r.url,
      snippet: compactText(r.content || r.title),
      confidence: r.finalScore,
    };
  });
}

function toAgentSignals(out: TavilyHarnessOutput): TavilySignal[] {
  return mapTavilyResultsToSchemaSignals(out.results);
}

function compactResultsForAgent(results: TavilyHarnessResult[]): TavilyHarnessResult[] {
  return results.map((r) => ({
    ...r,
    content: compactText(r.content),
  }));
}

/**
 * Tavily sub-agent for orchestrator tool-use.
 * This keeps the same export name while delegating to the harness.
 */
export const tavilyAgent: SubAgent<TavilyInput, TavilySignals> = {
  name: "tavily_agent",
  description:
    "Search controlled public Bordeaux sources across user-selected year ranges. Returns deduplicated, quality-filtered snippets with reliability-weighted confidence.",
  input_schema: {
    type: "object",
    properties: {
      region: { type: "string", description: "Currently only 'Bordeaux' is supported." },
      startYear: { type: "integer", description: "Start year (>= 2000)." },
      endYear: { type: "integer", description: "End year (<= current year)." },
      maxResultsPerQuery: { type: "integer", description: "Optional, 1..10. Default 5." },
      forceRefresh: {
        type: "boolean",
        description: "Skip the local SQLite cache and fetch fresh Tavily results.",
      },
      chateau: { type: "string", description: "Optional château focus for cache/query scoping." },
      regionId: { type: "string", description: "Legacy region id input, e.g. 'bordeaux-medoc'." },
      query: { type: "string", description: "Optional refinement appended to generated Tavily queries." },
    },
    required: [],
  },
  async run(input, ctx) {
    const t0 = Date.now();
    const regionId = input.regionId ?? ctx.region.id;
    const region = findRegion(regionId);

    const nowYear = currentYear();
    const ctxStart = yearFromIsoDate(ctx.timeframe.start);
    const ctxEnd = yearFromIsoDate(ctx.timeframe.end);
    const fallbackStart = nowYear - 5;
    const startYear = ctxStart ?? input.startYear ?? fallbackStart;
    const endYear = ctxEnd ?? input.endYear ?? nowYear;
    const harnessInput: TavilyInput = {
      region: input.region ?? (ctx.region.parent === "bordeaux" ? "Bordeaux" : undefined),
      startYear,
      endYear,
      maxResultsPerQuery: input.maxResultsPerQuery,
      forceRefresh: input.forceRefresh,
      chateau: input.chateau ?? ctx.chateau,
      regionId,
      query: input.query,
    };

    if (isDemoMode) {
      const out: TavilyHarnessOutput = {
        results: [],
        report: {
          region: "Bordeaux",
          startYear,
          endYear,
          queryCount: 0,
          rawCount: 0,
          afterQualityFilter: 0,
          afterUrlDedupe: 0,
          removedByQualityFilter: 0,
          removedByUrlDedupe: 0,
          errorCount: 0,
          cacheHits: 0,
          cacheMisses: 0,
          liveFetches: 0,
          sourceTypeCounts: {
            bordeaux_sentiment: 0,
            bordeaux_policy: 0,
            bordeaux_regulation: 0,
            bordeaux_winemaker: 0,
            bordeaux_market: 0,
          },
          topDomains: [],
        },
        errors: [],
      };
      return {
        agent: "tavily_agent",
        ok: true,
        durationMs: Date.now() - t0,
        data: {
          summary: `[demo] ${region?.name ?? regionId}: Tavily harness skipped in demo mode`,
          signals: [],
          partial: true,
          report: out.report,
          results: [],
        },
        summary: "demo fallback",
      };
    }

    if (!integrations.tavily) {
      return {
        agent: "tavily_agent",
        ok: true,
        durationMs: Date.now() - t0,
        data: {
          summary: `[stub] no TAVILY_API_KEY — tavily harness disabled`,
          signals: [],
          partial: true,
          report: {
              region: "Bordeaux",
              startYear,
              endYear,
              queryCount: 0,
              rawCount: 0,
              afterQualityFilter: 0,
              afterUrlDedupe: 0,
              removedByQualityFilter: 0,
              removedByUrlDedupe: 0,
              errorCount: 0,
              cacheHits: 0,
              cacheMisses: 0,
              liveFetches: 0,
              sourceTypeCounts: {
                bordeaux_sentiment: 0,
                bordeaux_policy: 0,
                bordeaux_regulation: 0,
                bordeaux_winemaker: 0,
                bordeaux_market: 0,
              },
              topDomains: [],
            },
          results: [],
        },
        summary: "stub (no key)",
      };
    }

    try {
      const out = await runTavilyHarness(harnessInput, { signal: ctx.signal });
      const signals = toAgentSignals(out);
      return {
        agent: "tavily_agent",
        ok: true,
        durationMs: Date.now() - t0,
        data: {
          summary: `Harness collected ${out.report.afterUrlDedupe} unique results (${out.report.errorCount} query errors).`,
          signals,
          partial: out.report.errorCount > 0 || signals.length === 0,
          report: out.report,
          errors: out.errors.slice(0, 5),
          results: compactResultsForAgent(out.results),
        },
        summary: `${out.report.afterUrlDedupe} deduped hits`,
      };
    } catch (err) {
      return {
        agent: "tavily_agent",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
      };
    }
  },
};
