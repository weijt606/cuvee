/**
 * Provider-neutral web-retrieval contract used by the public-web grounding
 * pipeline. Same idea as `LLMProvider`: each backend (Tavily, Brave,
 * SearXNG, …) implements `RetrievalProvider.search()` and hides its own
 * API quirks. The wine-specific harness layer (5-channel source
 * taxonomy, trusted-domain weighting, dedupe) sits on top of this and
 * stays agnostic to the underlying search engine.
 */

export interface RetrievalSearchResult {
  url: string;
  title: string;
  /** Snippet shown to the LLM. Providers return their own truncation. */
  content: string;
  /** Relevance score on a 0..1 scale. Providers normalize their own. */
  score: number;
  /** ISO date when the source claims its content was published, when available. */
  publishedDate?: string;
}

export interface RetrievalSearchInput {
  query: string;
  /** Per-query result cap. Default depends on the provider. */
  maxResults?: number;
  /** Optional domain allow-list (provider may not honor — best effort). */
  includeDomains?: string[];
  /** Optional domain exclusion list. */
  excludeDomains?: string[];
  signal?: AbortSignal;
}

export interface RetrievalProvider {
  readonly name: string;
  /** True when the provider honors `includeDomains` / `excludeDomains` filters. */
  readonly supportsDomainFilter: boolean;
  search(input: RetrievalSearchInput): Promise<RetrievalSearchResult[]>;
}

export class RetrievalProviderUnavailableError extends Error {
  constructor(public readonly providerName: string, reason: string) {
    super(`Retrieval provider "${providerName}" unavailable: ${reason}`);
    this.name = "RetrievalProviderUnavailableError";
  }
}
