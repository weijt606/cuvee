import "server-only";
import type { RetrievalProvider } from "../types";

/**
 * No-op retrieval provider. Used when no other provider is configured —
 * the harness gracefully returns zero hits and the downstream extraction +
 * backtest run without public-web context (extraction degrades to
 * weather + geo only; backtest emits `verdict: "moderate_agreement"` with
 * an empty critic list).
 *
 * Selecting this explicitly (CUVEE_RETRIEVAL_PROVIDER=null) is the right
 * call when the operator wants to run Cuvée fully offline with only the
 * bundled CSV datasets — schema-grounded scoring still works, just without
 * the public-web evidence layer.
 */
export const nullProvider: RetrievalProvider = {
  name: "null",
  supportsDomainFilter: false,
  async search() {
    return [];
  },
};
