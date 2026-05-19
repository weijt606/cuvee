import "server-only";
import { env } from "@/lib/env";
import { openaiProvider } from "./providers/openai";
import { anthropicProvider } from "./providers/anthropic";
import { makeOpenAICompatibleProvider } from "./providers/openai-compat";
import { type LLMProvider, LLMProviderUnavailableError } from "./types";

export type {
  ChatMessage,
  ChatTool,
  ChatRequest,
  ChatResponse,
  ChatResponseSchema,
  LLMProvider,
} from "./types";
export { LLMProviderUnavailableError } from "./types";

/** Lazy-built provider instances, keyed by provider name. */
const providerCache = new Map<string, LLMProvider>();

function buildProvider(name: string): LLMProvider {
  switch (name) {
    case "openai":
      return openaiProvider;
    case "anthropic":
      return anthropicProvider;
    case "qwen":
      // Alibaba DashScope international endpoint — OpenAI-compatible mode.
      return makeOpenAICompatibleProvider({
        name: "qwen",
        baseURL: env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        apiKey: env.QWEN_API_KEY,
        defaultModel: env.QWEN_MODEL || "qwen-max",
        // DashScope supports json_schema on qwen-max + qwen-plus; older models fall back.
        supportsStrictJsonSchema: true,
        supportsTools: true,
      });
    case "deepseek":
      return makeOpenAICompatibleProvider({
        name: "deepseek",
        baseURL: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
        apiKey: env.DEEPSEEK_API_KEY,
        defaultModel: env.DEEPSEEK_MODEL || "deepseek-chat",
        // DeepSeek supports response_format: json_object but not strict json_schema.
        // The compat factory falls back gracefully when this flag is false.
        supportsStrictJsonSchema: false,
        supportsTools: true,
      });
    case "ollama":
      // Local Ollama. Free + offline. Needs the user to have Ollama running.
      return makeOpenAICompatibleProvider({
        name: "ollama",
        baseURL: env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
        // Ollama doesn't require an API key but the openai SDK insists one is present.
        apiKey: env.OLLAMA_API_KEY || "ollama",
        defaultModel: env.OLLAMA_MODEL || "qwen2.5:7b",
        // Ollama >= 0.5 supports structured outputs.
        supportsStrictJsonSchema: true,
        supportsTools: true,
      });
    default:
      throw new LLMProviderUnavailableError(name, "unknown provider id");
  }
}

/** Returns the named provider, lazy-instantiated on first use. */
export function getLLMProvider(name: string): LLMProvider {
  const cached = providerCache.get(name);
  if (cached) return cached;
  const provider = buildProvider(name);
  providerCache.set(name, provider);
  return provider;
}

/**
 * The system default LLM provider for all agent calls.
 * Selected by `CUVEE_LLM_PROVIDER` (default: openai).
 *
 * Every agent (extraction, feature, backtest, orchestrator GPT-routing path)
 * goes through this. Swapping providers is a single env-var change.
 */
export function defaultLLM(): LLMProvider {
  const name = env.CUVEE_LLM_PROVIDER || "openai";
  return getLLMProvider(name);
}

/** True when at least one LLM provider has the credentials it needs.
 *  Used by agents to decide whether to attempt an LLM call or short-circuit
 *  to the deterministic-template fallback. */
export function hasLLM(): boolean {
  return listAvailableProviders().length > 0;
}

/** Lists every configured provider id (one that has the required api key set). */
export function listAvailableProviders(): string[] {
  const out: string[] = [];
  if (env.OPENAI_API_KEY) out.push("openai");
  if (env.ANTHROPIC_API_KEY) out.push("anthropic");
  if (env.QWEN_API_KEY) out.push("qwen");
  if (env.DEEPSEEK_API_KEY) out.push("deepseek");
  // Ollama is presumed-available if the user explicitly set the env var or the
  // local server responds. We don't probe — listing it as "available" means
  // "configured to try"; runtime errors surface if Ollama isn't running.
  if (env.OLLAMA_BASE_URL || env.OLLAMA_API_KEY) out.push("ollama");
  return out;
}
