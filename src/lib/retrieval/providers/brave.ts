import "server-only";
import { env } from "@/lib/env";
import {
  type RetrievalProvider,
  type RetrievalSearchInput,
  type RetrievalSearchResult,
  RetrievalProviderUnavailableError,
} from "../types";

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RETRIES = 1;

interface BraveWebResult {
  url?: string;
  title?: string;
  description?: string;
  age?: string;
  page_age?: string;
}

interface BraveResponse {
  web?: { results?: BraveWebResult[] };
}

/**
 * Brave Search adapter — free tier 2k queries/month, no credit-card required
 * for the dev plan. Drop-in replacement for Tavily on the wine-intelligence
 * harness. Quality is comparable for general public-web queries; Brave is
 * weaker on long-tail French wine press but stronger on English-language
 * mainstream sources (Decanter, Wine Spectator, Wine-Searcher).
 *
 * Get a key at https://api.search.brave.com/.
 */
export const braveProvider: RetrievalProvider = {
  name: "brave",
  supportsDomainFilter: true,

  async search({ query, maxResults = 5, includeDomains, excludeDomains, signal }: RetrievalSearchInput) {
    if (!env.BRAVE_API_KEY) {
      throw new RetrievalProviderUnavailableError("brave", "BRAVE_API_KEY is not set");
    }

    // Brave doesn't have first-class include/exclude_domains params on the web
    // endpoint; we approximate by post-filtering the results. This is best-effort
    // and the underlying ranking may already exclude some hits.
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
      const merged = new AbortController();
      const onAbort = () => merged.abort();
      timeout.signal.addEventListener("abort", onAbort, { once: true });
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const url = new URL(BRAVE_ENDPOINT);
        url.searchParams.set("q", query);
        url.searchParams.set("count", String(Math.min(20, Math.max(1, maxResults * 2))));
        url.searchParams.set("safesearch", "moderate");

        const res = await fetch(url, {
          method: "GET",
          signal: merged.signal,
          headers: {
            accept: "application/json",
            "x-subscription-token": env.BRAVE_API_KEY,
          },
        });
        if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
        const body = (await res.json()) as BraveResponse;
        const raw = body.web?.results ?? [];
        const allowDomain = (u: string) => {
          if (!includeDomains?.length && !excludeDomains?.length) return true;
          const domain = safeDomain(u);
          if (excludeDomains?.some((d) => domain.endsWith(d))) return false;
          if (includeDomains?.length) return includeDomains.some((d) => domain.endsWith(d));
          return true;
        };
        const filtered = raw.filter((r) => allowDomain(r.url ?? "")).slice(0, maxResults);
        return filtered.map((r, i) => normalizeResult(r, i, raw.length));
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

function normalizeResult(r: BraveWebResult, rank: number, total: number): RetrievalSearchResult {
  // Brave doesn't expose a per-result relevance score; we synthesize a
  // descending one so the harness's quality filter and dedupe still work.
  const score = total > 0 ? Math.max(0.1, 1 - rank / total) : 0.5;
  return {
    url: r.url ?? "",
    title: r.title ?? "",
    content: r.description ?? "",
    score,
    publishedDate: r.page_age ?? r.age,
  };
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}
