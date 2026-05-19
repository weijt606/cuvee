import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  // ─── default LLM selection ──────────────────────────────────────────────
  /** Selects the default LLM provider for all agent calls.
   *  Options: openai (default), anthropic, qwen, deepseek, ollama. */
  CUVEE_LLM_PROVIDER: z
    .enum(["openai", "anthropic", "qwen", "deepseek", "ollama"])
    .default("openai"),
  /** Overrides the model id for the chosen provider. When unset, each
   *  provider falls back to its own *_MODEL env var or a baked-in default. */
  CUVEE_LLM_MODEL: z.string().min(1).optional(),

  // ─── OpenAI (default LLM provider) ──────────────────────────────────────
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),

  // ─── Anthropic Claude (alt LLM provider) ────────────────────────────────
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-haiku-4-5"),

  // ─── Alibaba Qwen via DashScope (alt, OpenAI-compatible mode) ──────────
  QWEN_API_KEY: z.string().min(1).optional(),
  QWEN_MODEL: z.string().min(1).default("qwen-max"),
  QWEN_BASE_URL: z.string().url().default("https://dashscope-intl.aliyuncs.com/compatible-mode/v1"),

  // ─── DeepSeek (alt, OpenAI-compatible) ─────────────────────────────────
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-chat"),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com/v1"),

  // ─── Ollama (local, free, OpenAI-compatible) ────────────────────────────
  OLLAMA_BASE_URL: z.string().url().optional(),
  OLLAMA_API_KEY: z.string().min(1).optional(),
  OLLAMA_MODEL: z.string().min(1).default("qwen2.5:7b"),

  // ─── retrieval (Tavily is one option among many — see B2 for alts) ──────
  TAVILY_API_KEY: z.string().min(1).optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("Cuvée"),
  NEXT_PUBLIC_DEMO_MODE: z
    .union([z.literal("true"), z.literal("false"), z.literal("")])
    .default("false")
    .transform((v) => v === "true"),
  /**
   * Demo-fast mode — keeps the live demo snappy. When true:
   *   - Orchestrator bypasses the GPT tool-use loop and dispatches the
   *     known agent flow directly (saves 5-7 GPT routing roundtrips)
   *   - Pipeline restructured for max parallelism
   *   - Tavily cache pre-hydrated from data/tavily-cache-export.json
   *   - OpenAI model is pinned to gpt-4o-mini for all agent LLM calls
   *
   * Default is `true`. Set NEXT_PUBLIC_DEMO_FAST=false explicitly to
   * use the legacy GPT-driven orchestration (~80 s/call).
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

/** Provider availability — true when the key is set. Pioneer dropped in Phase B1. */
export const integrations = {
  openai: Boolean(env.OPENAI_API_KEY),
  anthropic: Boolean(env.ANTHROPIC_API_KEY),
  qwen: Boolean(env.QWEN_API_KEY),
  deepseek: Boolean(env.DEEPSEEK_API_KEY),
  ollama: Boolean(env.OLLAMA_BASE_URL || env.OLLAMA_API_KEY),
  tavily: Boolean(env.TAVILY_API_KEY),
} as const;

/** Back-compat alias — older code reads `sponsors`. New code should use `integrations`. */
export const sponsors = integrations;

export const isDemoMode = env.NEXT_PUBLIC_DEMO_MODE;
export const isDemoFast = env.NEXT_PUBLIC_DEMO_FAST;

export type ProviderKey = keyof typeof integrations;
/** @deprecated alias of ProviderKey */
export type SponsorKey = ProviderKey;
