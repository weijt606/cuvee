import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),

  TAVILY_API_KEY: z.string().min(1).optional(),

  PIONEER_API_KEY: z.string().min(1).optional(),
  PIONEER_BASE_URL: z.string().url().default("https://api.pioneer.ai"),
  PIONEER_MODEL_ID: z.string().min(1).optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("Cuvée"),
  NEXT_PUBLIC_DEMO_MODE: z
    .union([z.literal("true"), z.literal("false"), z.literal("")])
    .default("false")
    .transform((v) => v === "true"),
  /**
   * Demo-fast mode — applies tight budgets aimed at keeping a full
   * /api/analyze call under 30 s for live demos. When true:
   *   - Orchestrator bypasses the GPT tool-use loop and dispatches the
   *     known agent flow directly (saves 5-7 GPT routing roundtrips)
   *   - Pipeline restructured for max parallelism (tavily + extraction
   *     overlap, feature + backtest overlap)
   *   - Tavily cache is pre-hydrated from data/tavily-cache-export.json
   *   - feature_agent skips Pioneer (tier 1) and goes straight to OpenAI
   *   - Tavily max_results_per_query is capped at 3
   *   - OpenAI model is pinned to gpt-4o-mini for all agent LLM calls
   *
   * Default is `true` — the GPT routing layer is overhead for our fixed
   * agent flow and the speedup matters more than the (rarely-used)
   * adaptive routing. Set NEXT_PUBLIC_DEMO_FAST=false explicitly if you
   * need the legacy GPT-driven orchestration (e.g. to experiment with
   * letting the LLM skip/reorder agents per user question).
   */
  NEXT_PUBLIC_DEMO_FAST: z
    .union([z.literal("true"), z.literal("false"), z.literal("")])
    .default("true")
    .transform((v) => v !== "false"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

function parseEnv() {
  // Empty-string env vars (common when a placeholder line like `KEY=` is
  // left in .env.local) should be treated as unset, not as values that
  // fail .min(1). Filter them out before validation.
  const cleanedEnv = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== ""),
  );
  const server = serverSchema.safeParse(cleanedEnv);
  if (!server.success) {
    console.error("❌ Invalid server env:", server.error.flatten().fieldErrors);
    throw new Error("Invalid server environment variables");
  }
  const pub = publicSchema.safeParse({
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
    NEXT_PUBLIC_DEMO_FAST: process.env.NEXT_PUBLIC_DEMO_FAST,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!pub.success) {
    console.error("❌ Invalid public env:", pub.error.flatten().fieldErrors);
    throw new Error("Invalid public environment variables");
  }
  return { ...server.data, ...pub.data };
}

export const env = parseEnv();

export const sponsors = {
  openai: Boolean(env.OPENAI_API_KEY),
  tavily: Boolean(env.TAVILY_API_KEY),
  pioneer: Boolean(env.PIONEER_API_KEY),
} as const;

/** Convenience alias — same map, different reading. */
export const integrations = sponsors;

export const isDemoMode = env.NEXT_PUBLIC_DEMO_MODE;
export const isDemoFast = env.NEXT_PUBLIC_DEMO_FAST;

/**
 * Returns the OpenAI model the wine-intelligence agents should use right now.
 *
 * In demo-fast mode we override whatever the operator put in OPENAI_MODEL with
 * gpt-4o-mini. The vintage-quality schema task is structured-JSON emission
 * against a fixed schema, which a reasoning model (gpt-5*, o-series) is
 * actively bad at — it spends 20-40 s on hidden chain-of-thought that adds
 * nothing the schema doesn't already constrain, and it rejects custom
 * temperature too. For a live ≤30 s demo we cannot afford that latency.
 */
export function openaiModelForAgents(): string {
  if (isDemoFast) return "gpt-4o-mini";
  return env.OPENAI_MODEL;
}

export type SponsorKey = keyof typeof sponsors;
