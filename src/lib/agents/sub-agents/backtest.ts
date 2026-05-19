import "server-only";
import { integrations, isDemoMode, openaiModelForAgents, sponsors } from "@/lib/env";
import { openaiClient } from "@/lib/ai/openai";
import { runTavilyHarness } from "@/lib/agents/sub-agents/tavily";
import type { SubAgent } from "@/lib/agents/types";
import type { BacktestSnapshot, Persona } from "@/lib/wine/types";

export interface BacktestInput {
  regionId: string;
  regionName: string;
  /** Year being backtested (vintage year). */
  year: number;
  persona: Persona;
  /** Our predicted RISK score (0–100). */
  predictedScore: number;
  /** Predicted vintage quality band from extraction. */
  predictedBand?: "Great" | "Excellent" | "Good" | "Average" | "Poor";
  /** One-sentence summary of dominant drivers (helps the LLM align). */
  driversSummary?: string;
  /** Optional château focus — narrows the critic search to a specific estate. */
  chateau?: string;
}

export type BacktestOutput = BacktestSnapshot;

/**
 * Backtest agent — only fires for vintages whose timeframe.end is already
 * in the past. Uses the Tavily harness to retrieve real critic scores
 * (Wine Advocate / Decanter / Vinous / Liv-ex / Jancis Robinson) and a
 * compact market reaction summary, then asks OpenAI to compare our
 * prediction against those observations and emit a directional verdict.
 *
 * Returns null if the year is too recent (no Tavily results yet) or if
 * OpenAI / Tavily is unavailable.
 */

const BACKTEST_RESPONSE_SCHEMA = {
  name: "backtest_snapshot",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["critics", "accuracySummary", "verdict"],
    properties: {
      critics: {
        type: "array",
        minItems: 0,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          // OpenAI strict json_schema requires every property in `required`.
          // Nullable types handle the "absent" case.
          required: ["source", "score", "scale", "quote", "url"],
          properties: {
            source: { type: "string" },
            score: { type: ["number", "null"] },
            scale: { type: ["string", "null"] },
            quote: { type: "string" },
            url: { type: ["string", "null"] },
          },
        },
      },
      accuracySummary: { type: "string" },
      verdict: {
        type: "string",
        enum: ["high_agreement", "moderate_agreement", "divergent"],
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are the backtest agent. You receive:
1. Our system's PREDICTED risk score + quality band for a past vintage.
2. Real-world search results harvested from Tavily about that vintage
   (critic reviews, market data, en primeur coverage).

Your job is to compare the prediction to reality and produce a structured
verdict. Be specific and quote from the search snippets.

EXTRACTION — be inclusive, not conservative. Aim for 4-6 critics entries
(the schema's maximum). Multiple short citations beat one long citation.
Treat the following as valid "critics" entries:

  PRIMARY critics (always extract when mentioned):
    Wine Advocate / Robert Parker, Decanter, Vinous / Antonio Galloni,
    Jancis Robinson, James Suckling, Wine Spectator, Wine Enthusiast,
    Falstaff, La Revue du Vin de France

  SECONDARY sources (extract when they quote a score or specific
  tasting note):
    Wine-Searcher, Tastingbook, CellarTracker community average,
    Liv-ex (market signal), négociant pages, Decanter Premium articles

  MARKET signals (extract as a separate critic-like entry):
    Liv-ex 100/500, en-primeur release prices, allocation reports

For each entry:
- "source" — name of the publication / platform / market index.
- "score" — extract a number whenever ANY rating is mentioned. For
  ranges like "92-94", emit the midpoint (93). For descriptive ratings
  ("classic 100-pointer", "five stars"), emit the implied number.
  Use null ONLY when there is genuinely no number anywhere in the snippet.
- "scale" — the unit ("/100", "/20", "+18% YoY", "★/5").
- "quote" — short direct line from the snippet, ≤120 chars.
- "url" — source URL when present.

Verdict:
  high_agreement     → critics broadly match our quality band
  moderate_agreement → partial overlap, some critics dissent
  divergent          → critics clearly contradict our prediction

accuracySummary: 1–2 sentences explaining the verdict, referencing at
least one specific critic by name and score.

Output language: English.`;

function predictedBandFromScore(score: number): "Great" | "Excellent" | "Good" | "Average" | "Poor" {
  // Risk score inversion: high risk → low quality.
  if (score >= 80) return "Poor";
  if (score >= 60) return "Average";
  if (score >= 45) return "Good";
  if (score >= 25) return "Excellent";
  return "Great";
}

function buildTavilyQueries(regionName: string, year: number): string[] {
  return [
    `${regionName} ${year} vintage Wine Advocate critic score`,
    `${regionName} ${year} en primeur Liv-ex market reaction`,
    `Bordeaux ${year} vintage report Decanter Vinous`,
  ];
}

async function fetchCriticContext(
  regionName: string,
  year: number,
  signal: AbortSignal,
  chateau?: string,
): Promise<string> {
  if (!integrations.tavily) return "";
  try {
    // Mirror the orchestrator's tavily_agent call shape — no aggressive
    // refinement, just chateau scoping when available. An earlier attempt
    // here appended a long "Wine Advocate Decanter Vinous … retrospective
    // tasting note" string to every base query, which made the per-source-
    // type query so specific that Tavily returned zero hits across all
    // five channels. The plain base queries (with chateau) reliably pull
    // 30+ hits including critic-attributed snippets the downstream LLM
    // can extract scores from.
    const out = await runTavilyHarness(
      {
        region: "Bordeaux",
        startYear: year,
        endYear: year,
        maxResultsPerQuery: 5,
        ...(chateau ? { chateau } : {}),
      },
      { signal },
    );
    void buildTavilyQueries; // queries are baked into runTavilyHarness

    const top = out.results.slice(0, 12);
    if (top.length === 0) return "";
    return top
      .map(
        (r) =>
          `• [${r.sourceType}] ${r.title}\n  ${r.url}\n  ${(r.content ?? "").slice(0, 280)}`,
      )
      .join("\n\n");
  } catch {
    return "";
  }
}

export const backtestAgent: SubAgent<BacktestInput, BacktestOutput> = {
  name: "backtest_agent",
  description:
    "ONLY for past vintages. Use Tavily to retrieve real critic scores + market reactions for the queried year, then compare against our predicted score and emit a structured verdict (high_agreement / moderate_agreement / divergent). CALL ONLY AFTER feature_agent has returned and only when the host indicates a historical timeframe.",
  input_schema: {
    type: "object",
    properties: {
      regionId: { type: "string" },
      regionName: { type: "string" },
      year: { type: "integer" },
      persona: { type: "string", enum: ["vineyard", "trade"] },
      predictedScore: { type: "number" },
      predictedBand: {
        type: "string",
        enum: ["Great", "Excellent", "Good", "Average", "Poor"],
      },
      driversSummary: { type: "string" },
      chateau: {
        type: "string",
        description: "Optional château focus — narrows critic retrieval to a specific estate.",
      },
    },
    required: ["regionId", "regionName", "year", "persona", "predictedScore"],
  },

  async run(input, ctx) {
    const t0 = Date.now();

    if (isDemoMode) {
      return {
        agent: "backtest_agent",
        ok: true,
        durationMs: Date.now() - t0,
        data: demoBacktest(input),
        summary: `demo · ${input.year} backtest fixture`,
      };
    }

    if (!sponsors.openai) {
      return {
        agent: "backtest_agent",
        ok: true,
        durationMs: Date.now() - t0,
        data: demoBacktest(input),
        summary: "no openai · backtest fixture",
      };
    }

    const chateau = input.chateau ?? ctx.chateau;
    const criticContext = await fetchCriticContext(
      input.regionName,
      input.year,
      ctx.signal,
      chateau,
    );

    try {
      const client = openaiClient();
      const predictedBand = input.predictedBand ?? predictedBandFromScore(input.predictedScore);
      const userMessage = [
        `Vintage year: ${input.year}`,
        `Region: ${input.regionName} (${input.regionId})`,
        `Persona: ${input.persona}`,
        `Our predicted RISK score: ${input.predictedScore}/100 (${predictedBand} quality band)`,
        input.driversSummary ? `Predicted drivers: ${input.driversSummary}` : "",
        "",
        "Real-world search results (Tavily, top hits):",
        criticContext || "[no critic context available — leave critics array empty and verdict='moderate_agreement']",
      ]
        .filter(Boolean)
        .join("\n");

      const res = await client.chat.completions.create(
        {
          model: openaiModelForAgents(),
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          response_format: { type: "json_schema", json_schema: BACKTEST_RESPONSE_SCHEMA },
        },
        { signal: ctx.signal },
      );

      const content = res.choices[0]?.message?.content;
      if (!content) {
        return {
          agent: "backtest_agent",
          ok: true,
          durationMs: Date.now() - t0,
          data: demoBacktest(input),
          summary: "empty openai · backtest fixture",
        };
      }

      const parsed = JSON.parse(content) as {
        critics: Array<{
          source: string;
          score: number | null;
          scale: string | null;
          quote: string;
          url: string | null;
        }>;
        accuracySummary: string;
        verdict: BacktestSnapshot["verdict"];
      };

      const data: BacktestSnapshot = {
        isBacktest: true,
        year: input.year,
        predictedScore: input.predictedScore,
        predictedBand,
        critics: parsed.critics.map((c) => ({
          source: c.source,
          score: c.score ?? undefined,
          scale: c.scale ?? undefined,
          quote: c.quote,
          url: c.url ?? undefined,
        })),
        accuracySummary: parsed.accuracySummary,
        verdict: parsed.verdict,
      };

      return {
        agent: "backtest_agent",
        ok: true,
        durationMs: Date.now() - t0,
        data,
        summary: `${input.year} · ${parsed.verdict.replace("_", " ")} · ${parsed.critics.length} critics`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[backtest] OpenAI call failed:", message);
      return {
        agent: "backtest_agent",
        ok: true,
        durationMs: Date.now() - t0,
        data: demoBacktest(input),
        error: message,
        summary: "openai error · backtest fixture",
      };
    }
  },
};

// ─── Demo fixture ──────────────────────────────────────────────────────

function demoBacktest(input: BacktestInput): BacktestSnapshot {
  const predictedBand = input.predictedBand ?? predictedBandFromScore(input.predictedScore);
  // Tuned around well-known recent Bordeaux vintages — picks a sensible
  // fixture so dashboard renders sensibly in demo mode.
  const wellKnown: Record<number, Partial<BacktestSnapshot>> = {
    2010: {
      verdict: "high_agreement",
      critics: [
        { source: "Wine Advocate", score: 98, scale: "/100", quote: "A modern reference vintage; long-aging structure with ripe tannins." },
        { source: "Liv-ex", scale: "+18% YoY", quote: "First-growth release prices rose sharply post-en primeur." },
        { source: "Decanter", score: 5, scale: "/5", quote: "Exceptional; among the great Bordeaux vintages of the century." },
      ],
      accuracySummary: "2010 was a landmark warm-dry vintage; if our predicted band was Great/Excellent, we matched the critical consensus.",
    },
    2013: {
      verdict: "divergent",
      critics: [
        { source: "Wine Advocate", score: 84, scale: "/100", quote: "Difficult vintage with cool wet summer; quality below average." },
        { source: "Decanter", score: 2, scale: "/5", quote: "Disappointing across most appellations." },
        { source: "Liv-ex", scale: "-9% YoY", quote: "Negotiants struggled to clear en primeur stock." },
      ],
      accuracySummary: "2013 was a poor vintage. If our model predicted Good or better, we missed the cool-wet signal.",
    },
    2015: {
      verdict: "high_agreement",
      critics: [
        { source: "Wine Advocate", score: 96, scale: "/100", quote: "Generous, ripe, charismatic — the best left-bank since 2010." },
        { source: "Vinous", score: 95, scale: "/100", quote: "Outstanding across the Médoc; balanced with energy." },
        { source: "Liv-ex", scale: "+12% YoY", quote: "Market embraced the vintage; allocations tight." },
      ],
      accuracySummary: "2015 was a strong warm vintage. High band predictions aligned with the critical consensus.",
    },
    2020: {
      verdict: "moderate_agreement",
      critics: [
        { source: "Wine Advocate", score: 95, scale: "/100", quote: "Hot vintage but balanced; concentrated, hedonistic." },
        { source: "Decanter", score: 4, scale: "/5", quote: "Strong vintage despite drought stress on some sites." },
        { source: "Liv-ex", scale: "+6% YoY", quote: "Solid release but slower trade pace than 2018." },
      ],
      accuracySummary: "2020 split critics on stylistic merits; expect partial agreement with most predictions.",
    },
  };
  const ref = wellKnown[input.year];
  return {
    isBacktest: true,
    year: input.year,
    predictedScore: input.predictedScore,
    predictedBand,
    critics: ref?.critics ?? [
      {
        source: "fixture",
        quote: `Demo fixture for ${input.regionName} ${input.year} — connect Tavily + OpenAI for real critic retrieval.`,
      },
    ],
    accuracySummary:
      ref?.accuracySummary ??
      `Demo backtest for ${input.regionName} ${input.year}. Predicted ${predictedBand} (risk=${input.predictedScore}). Tavily + OpenAI required for real comparison.`,
    verdict: ref?.verdict ?? "moderate_agreement",
  };
}
