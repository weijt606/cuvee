import "server-only";
import { env } from "@/lib/env";
import { tavilyProvider } from "./providers/tavily";
import { braveProvider } from "./providers/brave";
import { searxngProvider } from "./providers/searxng";
import { nullProvider } from "./providers/null";
import { type RetrievalProvider, RetrievalProviderUnavailableError } from "./types";

export type {
  RetrievalProvider,
  RetrievalSearchInput,
  RetrievalSearchResult,
} from "./types";
export { RetrievalProviderUnavailableError } from "./types";

const providerCache = new Map<string, RetrievalProvider>();

function buildProvider(name: string): RetrievalProvider {
  switch (name) {
    case "tavily":
      return tavilyProvider;
    case "brave":
      return braveProvider;
    case "searxng":
      return searxngProvider;
    case "null":
      return nullProvider;
    default:
      throw new RetrievalProviderUnavailableError(name, "unknown retrieval provider id");
  }
}

export function getRetrievalProvider(name: string): RetrievalProvider {
  const cached = providerCache.get(name);
  if (cached) return cached;
  const provider = buildProvider(name);
  providerCache.set(name, provider);
  return provider;
}

/**
 * The system default retrieval provider for public-web grounding.
 *
 * Selection rules:
 *   1. Honor explicit CUVEE_RETRIEVAL_PROVIDER if set.
 *   2. Otherwise prefer in this order: Tavily → SearXNG → Brave → null.
 *      (Tavily first because it's what wine sources have historically
 *      been tuned for; SearXNG before Brave because it's free and
 *      multi-engine; null last so the pipeline still functions.)
 */
export function defaultRetrieval(): RetrievalProvider {
  const explicit = env.CUVEE_RETRIEVAL_PROVIDER;
  if (explicit) return getRetrievalProvider(explicit);
  if (env.TAVILY_API_KEY) return tavilyProvider;
  if (env.SEARXNG_BASE_URL) return searxngProvider;
  if (env.BRAVE_API_KEY) return braveProvider;
  return nullProvider;
}

/** True when public-web retrieval is configured (any non-null provider). */
export function hasRetrieval(): boolean {
  return defaultRetrieval().name !== "null";
}

/** Lists every configured provider id. */
export function listAvailableRetrievalProviders(): string[] {
  const out: string[] = [];
  if (env.TAVILY_API_KEY) out.push("tavily");
  if (env.BRAVE_API_KEY) out.push("brave");
  if (env.SEARXNG_BASE_URL) out.push("searxng");
  out.push("null"); // always available
  return out;
}
