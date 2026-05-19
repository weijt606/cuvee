import "server-only";
import { isDemoMode, sponsors } from "@/lib/env";
import { defaultLLM } from "@/lib/llm";
import type { SubAgent } from "@/lib/agents/types";
import type { FeatureSummary, Persona, TradePersona } from "@/lib/wine/types";

/**
 * Feature agent — receives the extraction agent's evaluation and produces
 * the three user-facing artifacts:
 *   1. executiveSummary  — 2 sentences shown above the risk card
 *   2. reportMarkdown    — one-page markdown report (download/print)
 *   3. emailDigest       — short markdown preview for the subscribe flow
 *
 * Tiered strategy (Phase B1 — Pioneer dropped):
 *   tier 1 — the configured default LLM provider (OpenAI / Claude / Qwen /
 *            DeepSeek / Ollama) via `defaultLLM().chat({ responseSchema })`.
 *            Each provider handles strict JSON enforcement in its own way
 *            (OpenAI: response_format; Anthropic: tool-use trick; OpenAI-
 *            compatible: response_format with prompt fallback).
 *   tier 2 — deterministic template assembled from extraction output, so
 *            the dashboard stays demoable even with zero LLM access.
 *
 * Pioneer is gone — sponsor fine-tuning is replaced by self-optimization
 * via the memory layer (Phase B3): episodic memory, calibration drift, and
 * few-shot example retrieval from past successful runs.
 */

export interface FeatureInput {
  regionId: string;
  persona: Persona;
  /** Trade sub-persona — only set when persona === "trade". */
  tradePersona?: TradePersona;
  /** Risk score from extraction (0–100, higher = worse outlook). */
  score: number;
  /** Vintage quality band from extraction (Great → Poor). */
  qualityBand?: "Great" | "Excellent" | "Good" | "Average" | "Poor";
  /** 1-sentence summary of the dominant risk drivers from extraction. */
  driversSummary?: string;
  /** 1-sentence summary of persona-specific recommendations from extraction. */
  recommendationsSummary?: string;
  /** Optional rationale string from extraction. */
  rationale?: string;
}

export type FeatureOutput = FeatureSummary;

// ─── Prompts ───────────────────────────────────────────────────────────

// Shared system prompt body (same for both tiers; structure note diverges).
const PROMPT_BODY = `You are the feature agent in a wine-intelligence pipeline.

You receive an evaluation from the upstream extraction agent (risk score, quality band, driver summary, recommendations summary, rationale) plus the target region and persona. You produce THREE user-facing artifacts.

GLOBAL RULES — apply to all three artifacts:
- English only.
- No emojis. No marketing adjectives ("exceptional", "remarkable", "fantastic").
- Numbers are facts: cite the score (X/100), the band, and at least one specific upstream metric from the drivers.
- If a driver mentions a metric (e.g. "GST 18.8°C", "harvest rain 130mm", "TPI -1.2", "yield 48 hl/ha"), reuse the exact figure.
- For trade persona, frame around buying/selling decisions. For vineyard, frame around operational decisions.
- Trade sub-personas (when provided): merchant → en-primeur / allocation / price-volatility; restaurant → by-the-glass viability + list-refresh cadence; wineshop → retail volume + mainstream appeal + supply predictability.

1. executiveSummary — exactly 2 sentences, max 50 words total.
   Sentence 1: state the verdict (risk band + score) and the single dominant driver.
   Sentence 2: state the single most actionable implication for the persona.

2. reportMarkdown — a structured one-page markdown report, 280–420 words. EXACT structure:

# Vintage outlook — {regionId}

**Risk:** {score}/100 ({band}) · **Quality:** {qualityBand}

## TL;DR
One short paragraph (2-3 sentences) summarising the verdict.

## Key metrics
A markdown table with 3–5 rows. Columns: \`Metric | Value | Implication\`. Pull metrics from the upstream drivers; one-line implication each.

## Risk drivers
Ranked numbered list, top 3 drivers from extraction. For each: bold the driver name, then a one-sentence explanation with the metric, then a one-sentence "what this means" line.

## Recommendations ({persona})
Numbered list of 2–3 concrete actions. Each item: bold imperative verb (e.g. **Allocate**, **Hedge**, **Hold**, **List by the glass**, **Refresh SKU**), then a single sentence specifying timing, magnitude, or counterpart.

## Caveats
2–3 bullet points: data freshness, signals that would change the verdict, what's NOT yet observable.

3. emailDigest — short markdown digest for a weekly email. EXACT structure:

**Subject:** one line, ≤ 12 words, includes region + band.

One paragraph (2 sentences) of summary that references the score and the dominant driver.

**Action items:**
- bullet 1 (imperative verb, specific timing / magnitude)
- bullet 2 (imperative verb, specific timing / magnitude)

Total ≤ 8 lines.`;

const FEATURE_SYSTEM_PROMPT = PROMPT_BODY;

const FEATURE_RESPONSE_SCHEMA = {
  name: "feature_output",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["executiveSummary", "reportMarkdown", "emailDigest"],
    properties: {
      executiveSummary: { type: "string" },
      reportMarkdown: { type: "string" },
      emailDigest: { type: "string" },
    },
  },
} as const;

function tradePersonaTone(tp: TradePersona): string {
  if (tp === "merchant")
    return "Trade sub-persona: MERCHANT (en-primeur/négociant). Frame the report and digest around allocation decisions, price-volatility, and age-worthiness. Recommendations target en-primeur participation, allocation sizing, and cross-vintage hedging.";
  if (tp === "restaurant")
    return "Trade sub-persona: RESTAURANT (sommelier). Frame the report and digest around list-refresh cadence, by-the-glass viability, vintage-variation tolerance, and food-pairing flexibility. Avoid cellar/age-worthiness framing.";
  return "Trade sub-persona: WINESHOP (retail / supermarket). Frame the report and digest around retail volume, mainstream consumer appeal, supply predictability, and price-tier diversity. Avoid prestige/critic-score framing.";
}

function buildUserMessage(input: FeatureInput): string {
  return [
    `Region id: ${input.regionId}`,
    `Persona: ${input.persona}`,
    input.persona === "trade" && input.tradePersona
      ? tradePersonaTone(input.tradePersona)
      : "",
    `Risk score: ${input.score}/100`,
    input.qualityBand && `Quality band: ${input.qualityBand}`,
    input.driversSummary && `Drivers: ${input.driversSummary}`,
    input.recommendationsSummary && `Recommendations: ${input.recommendationsSummary}`,
    input.rationale && `Rationale: ${input.rationale}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function isValidFeature(x: unknown): x is FeatureOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.executiveSummary === "string" &&
    typeof o.reportMarkdown === "string" &&
    typeof o.emailDigest === "string"
  );
}

function stripCodeFence(s: string): string {
  // Some open-source models still wrap JSON in ```json ... ``` despite instruction.
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

// ─── Tier 3 — deterministic template ───────────────────────────────────

function templateFallback(input: FeatureInput, reason: string): FeatureOutput {
  const band = input.qualityBand ?? "Average";
  const risk =
    input.score >= 75
      ? "critical"
      : input.score >= 50
        ? "elevated"
        : input.score >= 25
          ? "moderate"
          : "low";
  const persona = input.persona;
  const driverLines = (input.driversSummary ?? "")
    .split(/;\s*/)
    .filter(Boolean)
    .slice(0, 3);
  return {
    executiveSummary: `${input.regionId} carries a ${risk}-risk outlook at ${input.score}/100 against a ${band.toLowerCase()} vintage backdrop. ${input.recommendationsSummary ?? "Refer to detailed drivers for the actionable read."}`,
    reportMarkdown: [
      `# Vintage outlook — ${input.regionId}`,
      ``,
      `**Risk:** ${input.score}/100 (${risk}) · **Quality:** ${band}`,
      ``,
      `## TL;DR`,
      `${input.regionId} is in a ${risk}-risk window with a ${band.toLowerCase()} underlying vintage outlook. ${input.rationale ?? input.driversSummary ?? "Driver detail unavailable in fallback mode."}`,
      ``,
      `## Key metrics`,
      `| Metric | Value | Implication |`,
      `| --- | --- | --- |`,
      `| Risk score | ${input.score}/100 | ${risk} risk band |`,
      `| Quality band | ${band} | underlying vintage outlook |`,
      driverLines[0] ? `| Lead driver | ${driverLines[0]} | dominant signal |` : "",
      ``,
      `## Risk drivers`,
      driverLines.length > 0
        ? driverLines.map((d, i) => `${i + 1}. **Driver ${i + 1}** — ${d}`).join("\n")
        : "_Heuristic fallback: no driver detail available._",
      ``,
      `## Recommendations (${persona})`,
      input.recommendationsSummary
        ? `1. **Review** — ${input.recommendationsSummary}`
        : "_Recommendations unavailable in fallback mode._",
      ``,
      `## Caveats`,
      `- Generated by deterministic template (${reason}). Configure an LLM provider (OPENAI_API_KEY by default, or CUVEE_LLM_PROVIDER=anthropic|qwen|deepseek|ollama with the matching key) for the full LLM report.`,
      `- Numbers reflect the most recent extraction pass; signals can shift before the next vintage update.`,
    ]
      .filter((l) => l !== "")
      .join("\n"),
    emailDigest: [
      `**Subject:** ${input.regionId} — ${risk} risk window (${input.score}/100)`,
      ``,
      `Risk **${input.score}/100** (${risk}) against a ${band.toLowerCase()} vintage backdrop. ${input.driversSummary ?? "Drivers unavailable."}`,
      ``,
      `**Action items:**`,
      input.recommendationsSummary
        ? `- ${input.recommendationsSummary}`
        : `- Review the full driver list before committing.`,
      `- Re-run the analysis when fresh signals land for ${input.regionId}.`,
    ].join("\n"),
  };
}

// ─── Tier 1 — configured LLM provider ──────────────────────────────────

async function tryLLM(
  input: FeatureInput,
  signal: AbortSignal,
): Promise<{ data: FeatureOutput; modelId: string } | null> {
  try {
    const llm = defaultLLM();
    const res = await llm.chat({
      messages: [
        { role: "system", content: FEATURE_SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(input) },
      ],
      responseSchema: {
        name: FEATURE_RESPONSE_SCHEMA.name,
        schema: FEATURE_RESPONSE_SCHEMA.schema as Record<string, unknown>,
        strict: FEATURE_RESPONSE_SCHEMA.strict,
      },
      signal,
    });
    if (!res.content) return null;
    const parsed = JSON.parse(stripCodeFence(res.content));
    if (!isValidFeature(parsed)) return null;
    return { data: parsed, modelId: res.modelId };
  } catch (err) {
    console.warn(
      "[feature] LLM tier-1 failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ─── Agent ─────────────────────────────────────────────────────────────

export const featureAgent: SubAgent<FeatureInput, FeatureOutput> = {
  name: "feature_agent",
  description:
    "Produce the dashboard's executive summary, a downloadable markdown report, and a short email digest from the extraction agent's evaluation. CALL ONLY AFTER extraction_agent has returned, passing its score, quality band, and 1-sentence summaries of drivers + recommendations + rationale.",
  input_schema: {
    type: "object",
    properties: {
      regionId: { type: "string" },
      persona: { type: "string", enum: ["vineyard", "trade"] },
      score: { type: "number", description: "Risk score 0–100 from extraction." },
      qualityBand: {
        type: "string",
        enum: ["Great", "Excellent", "Good", "Average", "Poor"],
        description: "Vintage quality band from extraction.",
      },
      driversSummary: {
        type: "string",
        description: "1-sentence summary of extraction's dominant drivers.",
      },
      recommendationsSummary: {
        type: "string",
        description: "1-sentence summary of extraction's persona-specific recommendations.",
      },
      rationale: { type: "string", description: "Extraction's rationale (full string)." },
    },
    required: ["regionId", "persona", "score"],
  },

  async run(rawInput, ctx) {
    const t0 = Date.now();
    // ctx.tradePersona always wins over whatever the routing LLM may have
    // (or may not have) populated, so the lens is consistent with the
    // request that arrived at /api/analyze.
    const input: FeatureInput = {
      ...rawInput,
      tradePersona:
        ctx.persona === "trade" ? ctx.tradePersona ?? rawInput.tradePersona : undefined,
    };

    if (isDemoMode) {
      return {
        agent: "feature_agent",
        ok: true,
        durationMs: Date.now() - t0,
        data: templateFallback(input, "demo mode"),
        summary: "demo · template",
      };
    }

    // tier 1 — configured LLM provider (OpenAI by default; Claude / Qwen /
    // DeepSeek / Ollama selectable via CUVEE_LLM_PROVIDER). Strict JSON
    // schema enforced per-provider (response_format on OpenAI-compatible,
    // tool-use trick on Anthropic).
    const llm = await tryLLM(input, ctx.signal);
    if (llm) {
      return {
        agent: "feature_agent",
        ok: true,
        durationMs: Date.now() - t0,
        data: llm.data,
        summary: `llm · ${llm.modelId.slice(0, 24)}`,
      };
    }

    // tier 2 — deterministic template (valid data regardless of cause)
    const reason =
      !sponsors.openai &&
      !sponsors.anthropic &&
      !sponsors.qwen &&
      !sponsors.deepseek &&
      !sponsors.ollama
        ? "no llm configured"
        : "llm tier failed";
    return {
      agent: "feature_agent",
      ok: true,
      durationMs: Date.now() - t0,
      data: templateFallback(input, reason),
      summary: `template · ${reason}`,
    };
  },
};
