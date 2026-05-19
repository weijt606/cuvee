import "server-only";
import { env } from "@/lib/env";
import {
  type RetrievalProvider,
  type RetrievalSearchInput,
  type RetrievalSearchResult,
  RetrievalProviderUnavailableError,
} from "../types";

const REQUEST_TIMEOUT_MS = 8000;

interface SearxResult {
  url?: string;
  title?: string;
  content?: string;
  score?: number;
  publishedDate?: string;
  engine?: string;
}

interface SearxResponse {
  results?: SearxResult[];
}

/**
 * SearXNG adapter — self-hosted privacy-respecting meta-search aggregator
 * that fans queries out to Google / Bing / DuckDuckGo / Brave / Qwant / etc.
 * and merges the results. **Truly free**: no API keys, no quotas, only the
 * cost of running the SearXNG container.
 *
 * Quick start (Docker):
 *   docker run -d --name searxng -p 8888:8080 \
 *     -e BASE_URL=http://localhost:8888/ searxng/searxng:latest
 *
 * Then set `SEARXNG_BASE_URL=http://localhost:8888` in your `.env.local`.
 *
 * Notes:
 *   - SearXNG quality depends on which upstream engines are enabled in the
 *     instance's settings.yml. The default config covers Google + Bing
 *     + DuckDuckGo + Brave + Qwant which is plenty for wine research.
 *   - Per-result scores are post-processed from rank order (SearXNG does
 *     surface a `score` field but it's the aggregated rank, not relevance).
 *   - No quota means it's the recommended provider for high-volume
 *     development and for users who can't or won't pay for an API.
 */
export const searxngProvider: RetrievalProvider = {
  name: "searxng",
  supportsDomainFilter: false, // SearXNG's JSON endpoint doesn't expose include/exclude

  async search({ query, maxResults = 5, signal }: RetrievalSearchInput) {
    if (!env.SEARXNG_BASE_URL) {
      throw new RetrievalProviderUnavailableError(
        "searxng",
        "SEARXNG_BASE_URL is not set (e.g. http://localhost:8888)",
      );
    }
    const baseUrl = env.SEARXNG_BASE_URL.replace(/\/+$/, "");

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
    const merged = new AbortController();
    const onAbort = () => merged.abort();
    timeout.signal.addEventListener("abort", onAbort, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const url = new URL(`${baseUrl}/search`);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("safesearch", "1");

      const res = await fetch(url, {
        method: "GET",
        signal: merged.signal,
        headers: {
          accept: "application/json",
          ...(env.SEARXNG_API_KEY ? { authorization: `Bearer ${env.SEARXNG_API_KEY}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
      const body = (await res.json()) as SearxResponse;
      const raw = body.results ?? [];
      return raw.slice(0, maxResults).map((r, i) => normalizeResult(r, i, raw.length));
    } finally {
      clearTimeout(timer);
      timeout.signal.removeEventListener("abort", onAbort);
      signal?.removeEventListener("abort", onAbort);
    }
  },
};

function normalizeResult(r: SearxResult, rank: number, total: number): RetrievalSearchResult {
  // SearXNG's `score` is a rank-based heuristic; we synthesize a 0..1 score
  // from descending rank so the harness's downstream weighting still works.
  const score = total > 0 ? Math.max(0.1, 1 - rank / total) : 0.5;
  return {
    url: r.url ?? "",
    title: r.title ?? "",
    content: r.content ?? "",
    score,
    publishedDate: r.publishedDate,
  };
}
