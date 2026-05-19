import "server-only";
import { env } from "@/lib/env";
import {
  type RetrievalProvider,
  type RetrievalSearchInput,
  type RetrievalSearchResult,
  RetrievalProviderUnavailableError,
} from "../types";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RETRIES = 1;

interface TavilyApiResult {
  url?: string;
  title?: string;
  content?: string;
  score?: number;
  published_date?: string;
}
interface TavilyApiResponse {
  results?: TavilyApiResult[];
}

export const tavilyProvider: RetrievalProvider = {
  name: "tavily",
  supportsDomainFilter: true,

  async search({ query, maxResults = 5, includeDomains, excludeDomains, signal }: RetrievalSearchInput) {
    if (!env.TAVILY_API_KEY) {
      throw new RetrievalProviderUnavailableError("tavily", "TAVILY_API_KEY is not set");
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
      const merged = new AbortController();
      const onAbort = () => merged.abort();
      timeout.signal.addEventListener("abort", onAbort, { once: true });
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const payload: Record<string, unknown> = {
          query,
          search_depth: "advanced",
          max_results: maxResults,
          include_answer: false,
          include_raw_content: false,
        };
        if (includeDomains && includeDomains.length > 0) payload.include_domains = includeDomains;
        if (excludeDomains && excludeDomains.length > 0) payload.exclude_domains = excludeDomains;

        let res = await fetch(TAVILY_ENDPOINT, {
          method: "POST",
          signal: merged.signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env.TAVILY_API_KEY}`,
          },
          body: JSON.stringify(payload),
        });
        // Older Tavily plans expect the key in the body rather than the header.
        if (res.status === 401) {
          res = await fetch(TAVILY_ENDPOINT, {
            method: "POST",
            signal: merged.signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...payload, api_key: env.TAVILY_API_KEY }),
          });
        }
        if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
        const body = (await res.json()) as TavilyApiResponse;
        return (body.results ?? []).map(normalizeResult);
      } catch (err) {
        lastErr = err;
        if (attempt <= MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        }
      } finally {
        clearTimeout(timer);
        timeout.signal.removeEventListener("abort", onAbort);
        signal?.removeEventListener("abort", onAbort);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  },
};

function normalizeResult(r: TavilyApiResult): RetrievalSearchResult {
  return {
    url: r.url ?? "",
    title: r.title ?? "",
    content: r.content ?? "",
    score: typeof r.score === "number" ? Math.max(0, Math.min(1, r.score)) : 0,
    publishedDate: r.published_date,
  };
}
