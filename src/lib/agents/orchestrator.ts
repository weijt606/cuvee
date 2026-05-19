import "server-only";
import type OpenAI from "openai";
import { isDemoFast, isDemoMode, openaiModelForAgents, sponsors } from "@/lib/env";
import { openaiClient } from "@/lib/ai/openai";
import { demoWineAnalysis } from "@/lib/demo/fixtures";
import {
  type AgentContext,
  type AgentResult,
  type SubAgent,
  runAgentSafely,
} from "@/lib/agents/types";
import { weatherAgent } from "@/lib/agents/sub-agents/weather";
import { geoAgent } from "@/lib/agents/sub-agents/geo";
import { tavilyAgent } from "@/lib/agents/sub-agents/tavily";
import { extractionAgent } from "@/lib/agents/extraction";
import { featureAgent } from "@/lib/agents/feature";
import { backtestAgent } from "@/lib/agents/sub-agents/backtest";
import type {
  AnalyzeInput,
  AnalyzeResult,
  AgentStepTrace,
  BacktestSnapshot,
  FeatureSummary,
  GeoSnapshot,
  Recommendation,
  RiskDriver,
} from "@/lib/wine/types";
import { bandOf } from "@/lib/wine/types";
import type { ExtractionOutput } from "@/lib/agents/extraction";

/**
 * Orchestrator — OpenAI Chat Completions tool-use loop.
 *
 * Routing layer ONLY: registers sub-agents as OpenAI function tools,
 * dispatches by name, collects a structured trace, harvests the final
 * result from the extraction_agent's last successful call. Sub-agent
 * bodies are stubs owned by the dev team — replace them without touching
 * this file.
 *
 * Degradation order:
 *   1. demo mode   → fixture
 *   2. no OpenAI   → fixture (orchestrator brain missing; flagged as partial)
 *   3. step budget → harvest whatever extraction produced; band reflects it
 */

type AnyAgent = SubAgent<unknown, unknown>;

const REGISTRY = new Map<string, AnyAgent>();
function register<I, D>(a: SubAgent<I, D>): void {
  REGISTRY.set(a.name, a as unknown as AnyAgent);
}
register(weatherAgent);
register(geoAgent);
register(tavilyAgent);
register(extractionAgent);
register(featureAgent);
register(backtestAgent);

function toolDescriptors(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return Array.from(REGISTRY.values()).map((a) => ({
    type: "function",
    function: {
      name: a.name,
      description: a.description,
      parameters: a.input_schema as Record<string, unknown>,
    },
  }));
}

const SYSTEM_PROMPT = `You are the wine-intelligence orchestrator. You evaluate cultivation and market risk for a French wine region by calling the registered sub-agent tools.

Procedure:
1. Call weather_agent, geo_agent, and tavily_agent — they can be invoked in parallel (emit multiple tool_calls in one turn).
2. Once all three have returned, call extraction_agent with COMPACT summaries (1–2 sentences each) of the upstream findings. Do not paste raw JSON.
3. Once extraction_agent returns, call feature_agent. Pass:
   - regionId and persona (unchanged from the host input)
   - score (extraction's risk score)
   - qualityBand (extraction's qualityBand)
   - driversSummary: a single-sentence summary of extraction's top drivers
   - recommendationsSummary: a single-sentence summary of extraction's recommendations
   - rationale: extraction's rationale (verbatim if short, else compressed)
4. After feature_agent returns, if the host indicates **isBacktest=true**, call **backtest_agent** with:
   - regionId · regionName · year (the vintage year)
   - persona
   - predictedScore (extraction's risk score)
   - predictedBand (extraction's qualityBand)
   - driversSummary (one-sentence)
   Skip this step when isBacktest is not set (forward-looking analyses).
5. After backtest_agent returns (or after feature_agent if skipped), end the turn with one short sentence.

Rules:
- Never call extraction_agent before the three upstream agents have returned.
- Never call feature_agent before extraction_agent has returned.
- Never call backtest_agent before feature_agent has returned, and only when isBacktest is set.
- Always pass the regionId the host provided; never invent one.
- If a sub-agent fails, proceed and note the gap to extraction_agent.
- Be concise. No marketing copy.`;

const MAX_STEPS = 10;

// ─── Result cache ──────────────────────────────────────────────────────
// In-memory map of (cache-key → AnalyzeResult). Demo replays and repeated
// "Run analysis" clicks for the same inputs return instantly instead of
// re-burning 60s of LLM time. TTL keeps stale data from sticking around,
// size cap keeps memory bounded. Survives a single dev-server process —
// for cross-restart persistence we'd promote to SQLite (out of scope).
const ANALYZE_CACHE = new Map<string, { result: AnalyzeResult; ts: number }>();
const CACHE_TTL_MS = 30 * 60_000; // 30 min
const CACHE_MAX_ENTRIES = 64;

function cacheKey(input: AnalyzeInput): string {
  return JSON.stringify({
    r: input.region.id,
    p: input.persona,
    tp: input.tradePersona ?? "",
    s: input.timeframe.start,
    e: input.timeframe.end,
    q: input.question ?? "",
    c: input.chateau ?? "",
    u: input.uploads?.map((f) => `${f.name}|${f.size}`).join(",") ?? "",
  });
}

function cacheGet(key: string): AnalyzeResult | null {
  const hit = ANALYZE_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    ANALYZE_CACHE.delete(key);
    return null;
  }
  // Refresh insertion order — primitive LRU.
  ANALYZE_CACHE.delete(key);
  ANALYZE_CACHE.set(key, hit);
  return hit.result;
}

function cachePut(key: string, result: AnalyzeResult): void {
  if (ANALYZE_CACHE.size >= CACHE_MAX_ENTRIES) {
    const oldest = ANALYZE_CACHE.keys().next().value;
    if (oldest !== undefined) ANALYZE_CACHE.delete(oldest);
  }
  ANALYZE_CACHE.set(key, { result, ts: Date.now() });
}

export async function analyze(
  input: AnalyzeInput,
  opts: { signal?: AbortSignal } = {},
): Promise<AnalyzeResult> {
  if (isDemoMode) return demoWineAnalysis(input);
  if (!sponsors.openai) {
    const fixture = demoWineAnalysis(input);
    return { ...fixture, isDemoOrPartial: true };
  }

  const key = cacheKey(input);
  const cached = cacheGet(key);
  if (cached) return cached;

  const today = new Date().toISOString().slice(0, 10);
  const isBacktest = input.timeframe.end < today;
  const vintageYear = isBacktest
    ? Number.parseInt(input.timeframe.end.slice(0, 4), 10)
    : undefined;

  const ctx: AgentContext = {
    region: input.region,
    timeframe: input.timeframe,
    persona: input.persona,
    uploads: input.uploads,
    chateau: input.chateau,
    tradePersona: input.persona === "trade" ? (input.tradePersona ?? "merchant") : undefined,
    isBacktest,
    vintageYear: Number.isFinite(vintageYear) ? vintageYear : undefined,
    signal: opts.signal ?? new AbortController().signal,
  };

  const trace: AgentResult[] = [];

  // ─── Demo-fast: fixed-order direct dispatch ────────────────────────
  // Skip the GPT tool-use loop entirely. We know the canonical flow
  // (weather + geo + tavily in parallel → extraction → feature → optional
  // backtest), so for a tight live demo the routing LLM is pure overhead
  // (5-7 GPT roundtrips, ~30-50 s on gpt-4o-mini). Direct dispatch keeps
  // the pipeline well under the 30 s budget at the cost of losing the
  // LLM's ability to reorder or skip sub-agents based on the user
  // question. That trade-off is acceptable for the live demo only.
  if (isDemoFast) {
    const result = await directDispatch(input, ctx, trace);
    if (!result.isDemoOrPartial) cachePut(key, result);
    return result;
  }

  const client = openaiClient();

  const bootstrap = [
    `Region: ${input.region.name} (id=${input.region.id}, parent=${input.region.parent})`,
    `Timeframe: ${input.timeframe.start} → ${input.timeframe.end}`,
    `Persona: ${input.persona}`,
    input.persona === "trade" && ctx.tradePersona
      ? `Trade sub-persona: ${ctx.tradePersona} — bias risk lens accordingly (merchant→en-primeur/allocation/price-volatility; restaurant→by-the-glass viability and vintage-variation tolerance; wineshop→retail volume, mainstream appeal, supply predictability).`
      : "",
    input.question ? `Refinement: ${input.question}` : "",
    input.chateau
      ? `Focus château: ${input.chateau} — call geo_agent in single-site mode by passing chateau="${input.chateau}".`
      : "",
    isBacktest && vintageYear
      ? `isBacktest=true · vintage year=${vintageYear} — after feature_agent, call backtest_agent for critic/market comparison.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: bootstrap },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    if (opts.signal?.aborted) throw new Error("Aborted");

    const res = await client.chat.completions.create(
      {
        model: openaiModelForAgents(),
        messages,
        tools: toolDescriptors(),
        tool_choice: "auto",
      },
      { signal: opts.signal },
    );

    const msg = res.choices[0]?.message;
    if (!msg) throw new Error("Orchestrator: empty completion");

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) break;

    messages.push(msg);

    const toolMessages: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] =
      await Promise.all(
        toolCalls.map(async (tc) => {
          if (tc.type !== "function") {
            return {
              role: "tool",
              tool_call_id: tc.id,
              content: `Unsupported tool call type: ${tc.type}`,
            };
          }
          const agent = REGISTRY.get(tc.function.name);
          if (!agent) {
            return {
              role: "tool",
              tool_call_id: tc.id,
              content: `Unknown tool: ${tc.function.name}`,
            };
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(tc.function.arguments || "{}");
          } catch (e) {
            return {
              role: "tool",
              tool_call_id: tc.id,
              content: `Invalid JSON arguments: ${e instanceof Error ? e.message : String(e)}`,
            };
          }
          const result = await runAgentSafely(agent, parsed, ctx);
          trace.push(result);
          return {
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result.data ?? { error: result.error }),
          };
        }),
      );

    messages.push(...toolMessages);
  }

  const result = harvest(input, trace);
  // Only cache non-partial results — partials (failed sub-agents, missing
  // keys) shouldn't poison the cache for future requests.
  if (!result.isDemoOrPartial) cachePut(key, result);
  return result;
}

/**
 * Direct dispatch — used in demo-fast mode. Calls the agents in the
 * canonical wine-intelligence order without any GPT routing in between.
 * Each agent's `summary` field is what extraction normally gets after the
 * LLM "synthesises" the upstream calls; the raw `data` is too big and not
 * what extraction's prompt is shaped for.
 */
async function directDispatch(
  input: AnalyzeInput,
  ctx: AgentContext,
  trace: AgentResult[],
): Promise<AnalyzeResult> {
  const weatherInput = {
    regionId: input.region.id,
    start: input.timeframe.start,
    end: input.timeframe.end,
    chateau: input.chateau,
  };
  const geoInput = {
    regionId: input.region.id,
    chateau: input.chateau,
  };
  const vintageYear =
    Number.parseInt(input.timeframe.end.slice(0, 4), 10) ||
    new Date().getFullYear();
  const tavilyInput = {
    region: "Bordeaux",
    regionId: input.region.id,
    startYear: vintageYear,
    endYear: vintageYear,
    chateau: input.chateau,
    query: input.question,
  };

  const summary = (r: AgentResult): string => {
    if (r.summary) return r.summary;
    if (r.data) {
      try {
        return JSON.stringify(r.data).slice(0, 800);
      } catch {
        return r.error ?? "no data";
      }
    }
    return r.error ?? "no data";
  };

  // Phase 1 — weather + geo + Tavily in parallel. We always wait for
  // ALL three before starting extraction. Accuracy is the contract:
  // extraction must see the full three-signal evidence base (climate +
  // terroir + public-web) on every call so its driver weighting is
  // unbiased. The wallclock cost is whatever Tavily takes (cache hit
  // ~100 ms; cold network 6-10 s) — weather and geo are bundled CSVs
  // and resolve in <50 ms.
  const [weather, geo, tavily] = await Promise.all([
    runAgentSafely(weatherAgent as AnyAgent, weatherInput, ctx),
    runAgentSafely(geoAgent as AnyAgent, geoInput, ctx),
    runAgentSafely(tavilyAgent as AnyAgent, tavilyInput, ctx),
  ]);

  // Phase 2 — extraction with all three signals.
  const extraction = await runAgentSafely(
    extractionAgent as AnyAgent,
    {
      regionId: input.region.id,
      persona: input.persona,
      weatherSignal: summary(weather),
      geoSignal: summary(geo),
      tavilySignal: summary(tavily),
    },
    ctx,
  );

  trace.push(weather, geo, tavily, extraction);

  // Phase 3 — feature_agent reads from extraction's score / band / drivers.
  const ext = extraction.data as Partial<ExtractionOutput> | undefined;
  const driversSummary =
    ext?.drivers && ext.drivers.length > 0
      ? ext.drivers
          .slice(0, 3)
          .map((d) => `${d.source}: ${d.signal}`)
          .join("; ")
      : undefined;
  const recommendationsSummary =
    ext?.recommendations && ext.recommendations.length > 0
      ? ext.recommendations[0]!.action
      : undefined;

  // Phase 3 — feature + backtest in parallel. Both consume extraction's
  // output but not each other's, so on the backtest path we can overlap
  // their two ~10 s LLM calls (saves the backtest path ~8 s wallclock).
  const featurePromise = runAgentSafely(
    featureAgent as AnyAgent,
    {
      regionId: input.region.id,
      persona: input.persona,
      score: ext?.score ?? 0,
      qualityBand: ext?.qualityBand,
      driversSummary,
      recommendationsSummary,
      rationale: ext?.rationale,
    },
    ctx,
  );

  const backtestPromise =
    ctx.isBacktest && ctx.vintageYear
      ? runAgentSafely(
          backtestAgent as AnyAgent,
          {
            regionId: input.region.id,
            regionName: input.region.name,
            year: ctx.vintageYear,
            persona: input.persona,
            predictedScore: ext?.score ?? 0,
            predictedBand: ext?.qualityBand,
            driversSummary,
            chateau: input.chateau,
          },
          ctx,
        )
      : null;

  const [feature, backtest] = await Promise.all([featurePromise, backtestPromise]);
  trace.push(feature);
  if (backtest) trace.push(backtest);

  return harvest(input, trace);
}

function harvest(input: AnalyzeInput, trace: AgentResult[]): AnalyzeResult {
  // Defensive harvest: prefer ok:true, but fall back to any trace entry
  // with data attached. This way a degraded sub-agent (returning fallback
  // data alongside an error string) still contributes to the AnalyzeResult.
  const lastFor = (name: string): AgentResult | undefined => {
    const rev = [...trace].reverse();
    return rev.find((r) => r.agent === name && r.ok) ?? rev.find((r) => r.agent === name && r.data);
  };
  const extraction = lastFor("extraction_agent");
  const feature = lastFor("feature_agent");
  const geo = lastFor("geo_agent");
  const backtest = lastFor("backtest_agent");

  const extractionData = extraction?.data as Partial<ExtractionOutput> | undefined;
  const featureData = feature?.data as FeatureSummary | undefined;
  const geoData = geo?.data as GeoSnapshot | undefined;
  const backtestData = backtest?.data as BacktestSnapshot | undefined;

  const score = extractionData?.score ?? 0;
  const sawFailure = trace.some((r) => !r.ok);

  return {
    region: input.region,
    timeframe: input.timeframe,
    persona: input.persona,
    riskScore: score,
    riskBand: bandOf(score),
    drivers: (extractionData?.drivers as RiskDriver[]) ?? [],
    recommendations: (extractionData?.recommendations as Recommendation[]) ?? [],
    qualityBand: extractionData?.qualityBand,
    activeGates: extractionData?.activeGates,
    rationale: extractionData?.rationale,
    feature: featureData ?? null,
    geoSnapshot: geoData ?? null,
    backtest: backtestData ?? null,
    trace: trace.map<AgentStepTrace>((r) => ({
      agent: r.agent,
      ok: r.ok,
      durationMs: r.durationMs,
      error: r.error,
      summary: r.summary,
    })),
    generatedAt: new Date().toISOString(),
    isDemoOrPartial: sawFailure || !extractionData,
  };
}
