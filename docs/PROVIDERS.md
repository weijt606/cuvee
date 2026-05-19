# 🔌 Cuvée Provider Integration — LLM · Retrieval · Memory

This document describes how Cuvée talks to the outside world. Three layers, each pluggable behind a small interface:

| Layer | Interface | Default | Alternatives |
|---|---|---|---|
| **LLM** — extraction, feature, backtest, orchestrator routing | `defaultLLM()` in `src/lib/llm/` | OpenAI `gpt-4o-mini` | Anthropic Claude · Qwen (DashScope) · DeepSeek · Ollama (local, free) |
| **Retrieval** — public-web grounding for `tavily_agent` + backtest | `defaultRetrieval()` in `src/lib/retrieval/` | first configured | Tavily · Brave Search · SearXNG (self-hosted) · null (offline) |
| **Memory** — episodic memory + few-shot calibration | `memory()` in `src/lib/memory/` | local SQLite | null (disabled via env) |

Every layer degrades gracefully — a missing API key never crashes the pipeline; it just downgrades to a fixture or fallback path.

---

## 1. LLM providers

### Selection

```bash
# .env.local
CUVEE_LLM_PROVIDER=openai          # one of: openai, anthropic, qwen, deepseek, ollama
CUVEE_LLM_MODEL=                   # optional override for the chosen provider
```

Every agent LLM call (extraction's strict-JSON scoring, feature's narrative, backtest's verdict, the legacy GPT tool-use loop) goes through `defaultLLM().chat()`. Selecting a provider is a single env-var change.

### Provider matrix

| Provider | Wire format | Strict JSON | Tool-use | Cost (rough) |
|---|---|---|---|---|
| **OpenAI** | native | `response_format: json_schema strict` | native | $0.15 / 1M in, $0.60 / 1M out (`gpt-4o-mini`) |
| **Anthropic Claude** | native | `submit_result` tool-use trick (see below) | native | $0.25 / 1M in, $1.25 / 1M out (`claude-haiku-4-5`) |
| **Qwen** (DashScope) | OpenAI-compatible | `response_format` (partial) | native | varies — DashScope international tier |
| **DeepSeek** | OpenAI-compatible | `json_object` + prompt-enforced (no strict mode) | native | ~$0.27 / 1M in, $1.10 / 1M out (`deepseek-chat`) |
| **Ollama** (local) | OpenAI-compatible | `response_format` (Ollama ≥ 0.5) | native | **free** — limited by your hardware |

### The Anthropic tool-use trick

Anthropic doesn't expose a `response_format: json_schema` mode. To get strict JSON we register a single virtual tool whose `input_schema` is the response schema, force `tool_choice` to that tool, and read its arguments back as the JSON output. This is the official Anthropic-recommended pattern and gives parity with OpenAI's strict mode.

```ts
// src/lib/llm/providers/anthropic.ts
const submitTool: Tool = {
  name: "submit_result",
  description: "Submit the final structured result.",
  input_schema: req.responseSchema.schema,
};
const res = await client.messages.create({
  model, messages, system,
  tools: [submitTool],
  tool_choice: { type: "tool", name: "submit_result" },
});
const toolUseBlock = res.content.find(b => b.type === "tool_use");
return { content: JSON.stringify(toolUseBlock.input), ... };
```

### Demo-fast model pinning

When `NEXT_PUBLIC_DEMO_FAST=true` (default), the OpenAI provider pins `gpt-4o-mini` regardless of `OPENAI_MODEL`. This sidesteps the reasoning-model trap — `gpt-5*` / `o1` / `o3` models add 20-40 s of internal "thinking" that doesn't help structured-JSON tasks against a fixed schema. The other providers honor their `*_MODEL` env var unconditionally.

---

## 2. Retrieval providers

### Selection

```bash
# .env.local
CUVEE_RETRIEVAL_PROVIDER=          # optional explicit: tavily, brave, searxng, null
```

When the explicit override is unset, the auto-selector prefers the first configured provider in this order: **tavily → searxng → brave → null**. So if you have both `TAVILY_API_KEY` and `BRAVE_API_KEY` set, Tavily wins.

### Provider matrix

| Provider | Cost | Setup | Quality on wine queries |
|---|---|---|---|
| **Tavily** | Free tier ~1k/mo, paid plans | API key from <https://app.tavily.com/> | Best — already tuned for the wine sources we cite (négociant pages, INAO, wine media) |
| **Brave Search** | Free tier 2k/mo, no credit card | API key from <https://api.search.brave.com/> | Strong on English-language wine press; weaker on French-language négociant pages |
| **SearXNG** (self-hosted) | **Free** — no API key, no quota | `docker run -d -p 8888:8080 searxng/searxng:latest` then `SEARXNG_BASE_URL=http://localhost:8888` | Depends on which upstream engines (Google / Bing / Brave / Qwant) the instance's `settings.yml` enables — default config is plenty for wine research |
| **null** | — | `CUVEE_RETRIEVAL_PROVIDER=null` | Returns 0 hits gracefully. Extraction degrades to weather + geo only; backtest emits `moderate_agreement` with empty critics |

### The harness

The wine-specific 5-channel source taxonomy (`bordeaux_sentiment`, `bordeaux_policy`, `bordeaux_regulation`, `bordeaux_winemaker`, `bordeaux_market`), trusted-domain weighting, dedupe, and the SQLite cache all sit **above** the provider interface in `src/lib/agents/sub-agents/tavily.ts`. Only the underlying single-query search is provider-pluggable — everything else (query templates, scoring, deduplication) stays consistent regardless of which backend serves the hits.

### Cache layers (retrieval)

| Layer | Where | TTL |
|---|---|---|
| SQLite per-query cache | `data/.cache/tavily-search.sqlite` (gitignored) | 7 days, survives restarts |
| Pre-hydrated JSON export | `data/tavily-cache-export.json` (committed) | seeds the SQLite cache on first read so curated demo queries skip the network |

Both layers operate on the provider-neutral query key, so they work the same whether the underlying provider is Tavily, Brave, or SearXNG.

---

## 3. Memory layer

Cuvée's "self-optimization" mechanism. Replaces sponsor fine-tuning with a non-parametric mechanism — the system gets better as it sees more data, no model weights change.

### What's stored

Every successful `analyze()` call writes one row to `data/.memory/analysis-history.sqlite`:

```ts
interface AnalysisRecord {
  id: string;                          // uuid v4
  regionId: string;                    // e.g. "bordeaux-medoc"
  chateau?: string;                    // when set
  year: number;
  persona: "vineyard" | "trade";
  tradePersona?: string;

  // Prediction (always set)
  predictedRiskScore: number;          // 0-100, high = bad
  predictedQualityBand: string;        // Great / Excellent / Good / Average / Poor
  driverSummary: string;
  rationaleSummary?: string;

  // Backtest verification (set later, when backtest_agent fires)
  actualAvgCriticScore?: number;       // 0-100 quality
  actualCriticCount?: number;
  backtestVerdict?: "high_agreement" | "moderate_agreement" | "divergent";

  inputHash: string;
  createdAt: number;
  updatedAt: number;
}
```

### Three behaviors

#### a. Episodic memory

After each successful analyze(), `persistToMemory()` writes the prediction + (when backtest ran) the actual critic average. Capacity bounded by `CUVEE_MEMORY_MAX_ROWS` (default 1000) — oldest rows are FIFO-evicted past this. SQLite file is gitignored.

#### b. Few-shot retrieval

Before each extraction LLM call, `memory().findSimilar()` returns nearest-neighbor past predictions. Region match is required; backtest-verified rows + chateau-match rows are ranked first. Up to `CUVEE_MEMORY_FEW_SHOT_LIMIT` (default 3) are formatted as compact calibration anchors and appended to the extraction user message:

```
PAST PREDICTIONS for similar contexts (use as calibration anchors):
  • bordeaux-medoc · Château Lafite Rothschild · vintage 2010
    Predicted: Great (qualityScore=92, risk=8)
    Actual avg critic: 96 (n=3, verdict: high_agreement)   → delta +4
  • bordeaux-medoc · Château Margaux · vintage 2015
    Predicted: Great (qualityScore=88, risk=12)
    Actual avg critic: 95 (n=4, verdict: high_agreement)   → delta +7
```

The LLM sees its own prior verdicts and stays consistent across runs.

#### c. Calibration drift

`memory().calibrationDrift(regionId, persona)` computes the average predicted-vs-actual quality delta over all backtested rows in that region. Positive delta = critics liked the vintage more than we predicted. Per-band breakdown is also returned. Currently available as a query helper; UI surfacing is on the Phase C list.

### Disable the memory layer

```bash
CUVEE_MEMORY_DISABLED=true
```

Useful for CI runs, ephemeral containers, or any operator who doesn't want a local SQLite file. The memory store falls back to a no-op — `findSimilar()` returns an empty array, few-shot injection becomes a no-op, calibration drift is unavailable.

---

## 4. Degradation ladder

Every layer falls back gracefully:

| Failure | Effect | UI signal |
|---|---|---|
| No LLM provider configured | `hasLLM()` returns false; orchestrator returns the fixture pipeline flagged `isDemoOrPartial` | dashboard shows "demo / partial" |
| LLM provider returns error | `feature_agent` falls back to deterministic template; `extraction_agent` falls back to a heuristic stub | trace row marks `ok: false` |
| `CUVEE_RETRIEVAL_PROVIDER=null` (or no key configured) | `tavily_agent` returns 0 hits; extraction proceeds on weather + geo signals only; backtest emits empty critic list + `moderate_agreement` | trace shows `tavily_agent 0 deduped hits` |
| Retrieval provider rate-limited / unhealthy | Same as above; the underlying error message is in `trace[].error` | trace row error visible |
| Memory layer disk error / `CUVEE_MEMORY_DISABLED=true` | Persistence is best-effort; failures are silently swallowed. Few-shot block becomes empty. | no visible signal — extraction still works |
| `NEXT_PUBLIC_DEMO_MODE=true` | Entire pipeline short-circuits to `demoWineAnalysis()` | dashboard shows "DEMO" pill |

Note: missing API keys are normal. The only hard requirement is **at least one** LLM provider being configured. Cuvée runs end-to-end with `OPENAI_API_KEY=...` alone; everything else is opt-in.

---

## 5. Cost / latency profile

Ballpark per `/api/analyze` cold call with defaults (OpenAI gpt-4o-mini + Tavily + memory enabled):

| Phase | Wallclock | Tokens (LLM) | Retrieval calls |
|---|---|---|---|
| Cache hit (orchestrator) | <50 ms | 0 | 0 |
| Cold phase 1: weather + geo + tavily (parallel) | ~6-10 s | 0 | 5-15 |
| Cold phase 2: extraction with few-shot | ~7-20 s | ~3-4 k in / ~1.5 k out | 0 |
| Cold phase 3: feature + backtest (parallel) | ~10-15 s | ~3-4 k in / ~1.5 k out | 0-5 (only when backtest fires) |
| Memory write | <50 ms (async, off the critical path) | 0 | 0 |
| **Cold forward call (no backtest)** | **~25-40 s** | **~6-8 k in / ~3 k out** | **5-15** |
| **Cold backtest call** | **~25-40 s** | **~8-10 k in / ~4 k out** | **10-20** |
| **Warm call (orchestrator cache hit)** | **<50 ms** | 0 | 0 |

At list prices the default-OpenAI path is roughly $0.002-0.004 per cold analyze call. DeepSeek is ~3× cheaper. Ollama is free.

---

## 6. Adding a new provider

The interfaces are intentionally small.

### Adding an LLM provider

```ts
// src/lib/llm/providers/myprovider.ts
import type { LLMProvider } from "../types";

export const myProvider: LLMProvider = {
  name: "myprovider",
  defaultModel: "my-default-model",
  supportsStrictJsonSchema: true,
  supportsTools: true,
  async chat(req) {
    // call your API, return { content, toolCalls?, modelId, latencyMs, usage? }
  },
};
```

Then register in `src/lib/llm/index.ts`'s `buildProvider()` switch and add the env var to `src/lib/env.ts`.

### Adding a retrieval provider

```ts
// src/lib/retrieval/providers/mysearch.ts
import type { RetrievalProvider } from "../types";

export const mySearchProvider: RetrievalProvider = {
  name: "mysearch",
  supportsDomainFilter: true,
  async search({ query, maxResults, includeDomains, excludeDomains, signal }) {
    // hit your API, return RetrievalSearchResult[]
  },
};
```

Register in `src/lib/retrieval/index.ts`'s `buildProvider()` switch. The wine harness in `tavily.ts` will automatically pick it up.
