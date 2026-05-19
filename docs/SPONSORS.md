# 🤝 Sponsor Integration — OpenAI · Tavily · Pioneer.ai

This document explains how the three sponsor APIs are used inside the Wine
Intelligence pipeline, where the boundaries are, and how the system degrades
when any one of them is down or rate-limited.

> Agent-layer details (file map, SubAgent contract, response shape) live in
> [`AGENTS.md`](AGENTS.md).

---

## 1. At a glance

| Sponsor | Role | Layer | Hot path? | Latency (warm) | Env keys |
|---|---|---|---|---|---|
| **OpenAI** | Orchestration + scoring + verdicts | Orchestrator · `extraction_agent` · `feature_agent` (tier 2) · `backtest_agent` | yes | 3-12 s | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| **Tavily** | Public-web grounding | `tavily_agent` (signals) · `backtest_agent` (critic retrieval) | yes (cached after warm) | <100 ms cached / 2-5 s cold | `TAVILY_API_KEY` |
| **Pioneer.ai** | Small open-source LLM hosting | `feature_agent` (tier 1) | warm-only | 6-12 s | `PIONEER_API_KEY`, `PIONEER_MODEL_ID` |

All three are **optional at runtime** — the system degrades gracefully (see §5).
Only OpenAI is strictly required for the LLM-driven path; without it the
pipeline falls back to deterministic heuristics + templates.

---

## 2. OpenAI — Orchestration, scoring, verdicts

### 2.1 Where it's called

| Site | Purpose | Mode |
|---|---|---|
| `src/lib/agents/orchestrator.ts` | Tool-use loop dispatching sub-agents | Chat Completions + `tools` |
| `src/lib/agents/extraction.ts` | Vintage-quality scoring against 1150-line schema | Strict `json_schema` |
| `src/lib/agents/feature.ts` (tier 2) | Executive summary + report + email digest | Strict `json_schema` |
| `src/lib/agents/sub-agents/backtest.ts` | Critic verdict (`confirms` / `partial` / `contradicts`) | Strict `json_schema` |

### 2.2 Model recommendation

Set `OPENAI_MODEL=gpt-4o-mini` (the default `.env.example` already does this).
We **strongly recommend against** reasoning models (`gpt-5*`, `o1*`, `o3*`)
for this product:

- They reject the `temperature` parameter (we've already stripped that from
  extraction + feature; reasoning models still produce verbose chain-of-thought
  that doesn't help the scoring task).
- Per-call latency goes from ~3 s → 20-40 s, which destroys the live-demo
  flow even with the orchestrator cache warm.
- The vintage schema is well-suited to a fast structured-output pass — there's
  no payoff for additional reasoning depth.

### 2.3 Structured-output gotcha

Every `json_schema` we send uses `strict: true`. The OpenAI strict mode has a
non-obvious requirement: **`required` must list every property declared in
`properties`**, even nullable ones. Forgetting one results in
`400 Invalid schema for response_format`. The backtest schema specifically
includes `scale` and `url` in `required` even though both can be `null` in
output — necessary for strict mode acceptance.

### 2.4 Where it is *not* used

- We do not use OpenAI for routing decisions, retries, or deterministic
  transforms — those happen in plain code (Rule 5 in `CLAUDE.md`).
- We do not use the Assistants API or threads — the architecture is stateless
  Chat Completions only.
- We do not use embeddings — Tavily already returns relevance-ranked hits.

---

## 3. Tavily — Public-web grounding

### 3.1 Where it's called

| Site | Purpose |
|---|---|
| `src/lib/agents/sub-agents/tavily.ts` | The orchestrator's general-purpose grounding hop |
| `src/lib/agents/sub-agents/backtest.ts` | Vintage-specific critic + market retrieval |

Both go through `runTavilyHarness()` exported from `tavily.ts`, which
encapsulates the search call, the 5-source-type filter, the trusted-domain
allow-list, and the result-shape normalization.

### 3.2 Source taxonomy

The harness classifies each hit into one of five buckets, each with its own
trusted-domain allow-list and weight:

| Source type | Examples | Default weight |
|---|---|---|
| `producer_official` | château.com, négociant pages | 1.00 |
| `regulator_or_inao` | inao.gouv.fr, oiv.int, official appellation sites | 0.95 |
| `wine_media_premium` | Decanter, Wine Spectator, Jancis Robinson, Wine Advocate | 0.90 |
| `wine_media_general` | trade press, regional wine magazines | 0.65 |
| `forums_or_communities` | CellarTracker, Wine-Searcher reviews, Reddit | 0.30 |

This taxonomy matters most in `backtest_agent`, where critic scores from
premium media are the verification signal — we don't want a Reddit thread
weighed equally to a Decanter retrospective.

### 3.3 Cache

`src/lib/agents/sub-agents/tavily-cache.ts` wraps a `node:sqlite` table with a
7-day TTL. Cache key is `SHA-256(JSON.stringify({ query, filters }))`.
Cold hits go to Tavily Search; warm hits return in under 100 ms.

The cache persists across process restarts (it's a file on disk), so a
demo run only pays the cold-fetch cost once per unique query in the entire
event window.

### 3.4 Quota notes

Tavily's free tier (1,000 search calls / month) is plenty for development use,
but cold-start a deployment with the cache empty and a few mis-clicks can
burn through quota fast. Demo mode (`NEXT_PUBLIC_DEMO_MODE=true`) entirely
bypasses Tavily — use that for any practice runs that don't need fresh data.

---

## 4. Pioneer.ai — Small open-source LLM hosting

Pioneer.ai is an **OpenAI-compatible LLM hosting layer** that serves small
open-source models (Qwen, GLM, Llama 7-8B class) behind a familiar
`/v1/chat/completions` endpoint with Bearer auth.

### 4.1 Where it's called

Just one site: `src/lib/agents/feature.ts` as tier 1 of the narrative
generation pipeline.

```
feature_agent  ─────────────────────────────────────────────────────────
  ├─ tier 1 → Pioneer-hosted open-source LLM
  │            • response_format: json_object
  │            • temperature: 0.2
  │            • timeout: 15 s
  │            • returns null on any failure → fall through
  │
  ├─ tier 2 → OpenAI strict json_schema
  │            (fires only if tier 1 returned null)
  │
  └─ tier 3 → deterministic template
              (assembled from extraction output; never fails)
```

### 4.2 Why have Pioneer at all?

The product runs OpenAI for the hard reasoning work (extraction's
schema-grounded scoring; backtest's verdict). For the "wrapping" work —
turning structured numbers into an executive summary, a markdown report,
and an email digest — a small open-source model is a better fit:

- **Speed**: 6-12 s on Pioneer-hosted Qwen-7B vs 10-20 s on `gpt-4o-mini`
  for the same output shape.
- **Cost**: open-source models on Pioneer are roughly 5-10× cheaper per
  call than OpenAI for the same throughput class.
- **Story**: at demo time, "we route hard reasoning to OpenAI, narrative
  wrapping to a Pioneer-hosted open model, and fall through to OpenAI
  again if Pioneer is down" is a much tighter sponsor narrative than
  "everything goes to OpenAI."
- **Future**: Pioneer's local models are fine-tunable. A wine-domain
  fine-tune lives entirely on the Pioneer side — swap `PIONEER_MODEL_ID`
  in `.env.local` and `feature.ts` picks it up with **zero code change**.

### 4.3 Adapter surface

`src/lib/training/pioneer.ts` exposes exactly one function:

```ts
pioneerChat(messages: PioneerChatMessage[], opts?: {
  modelId?: string;         // overrides env PIONEER_MODEL_ID (for A/B)
  timeoutMs?: number;       // default 15000
  responseFormat?: object;  // OpenAI-compatible (json_object / json_schema)
  temperature?: number;
}): Promise<{ content: string; modelId: string; latencyMs: number } | null>
```

**Contract:**
- Any failure (missing key, missing model ID, timeout, network error,
  empty response) returns `null`. The function **never throws**.
- Internally uses `AbortController` with a 15 s ceiling, propagated to
  `fetch` via `signal`.
- Caller pattern is dead-simple: `if (res === null) fallthrough()`.

### 4.4 Typical caller

```ts
import { pioneerChat } from "@/lib/training/pioneer";

const res = await pioneerChat(
  [
    {
      role: "system",
      content: "Output STRICTLY this JSON: {executiveSummary, reportMarkdown, emailDigest}",
    },
    { role: "user", content: buildExtractionSummaryFromInput(input) },
  ],
  { responseFormat: { type: "json_object" }, temperature: 0.2 },
);
if (res) return JSON.parse(res.content);
// Otherwise: tier 2 (OpenAI structured), then tier 3 (template)
```

### 4.5 Env configuration

| Variable | Source | Notes |
|---|---|---|
| `PIONEER_API_KEY` | Pioneer dashboard | Shape: `pio_sk_xxxxx`. **Only put in `.env.local`** — H1 says never commit it. |
| `PIONEER_MODEL_ID` | Pioneer dashboard | A UUID. Picked after deploying / selecting a model in the Pioneer UI. |
| `PIONEER_BASE_URL` | env override | Defaults to `https://api.pioneer.ai`. Generally don't change. |

---

## 5. Degradation ladder

The system is designed so that **no single sponsor failure crashes the
demo.** Here is what happens when each goes down:

| Failure | Effect | UI signal |
|---|---|---|
| `OPENAI_API_KEY` missing | extraction returns heuristic; feature falls to tier 3 template; orchestrator returns `isDemoOrPartial: true` | quality / report still render, less nuanced |
| OpenAI rate-limited | same as missing key for the duration | `trace[].error` populated, `ok: false` on that row |
| `TAVILY_API_KEY` missing | tavily sub-agent returns empty; extraction loses one of its three sources; backtest returns `null` (the BacktestCard simply doesn't render) | trace row marked `ok: false`; product still works |
| Tavily quota exhausted | warm queries still served from SQLite cache; cold queries fail soft | one-line note in `trace[].error` |
| `PIONEER_API_KEY` missing | feature_agent skips tier 1, goes straight to OpenAI tier 2 | invisible — feature still ships |
| Pioneer down / timeout | feature_agent tier 1 returns null in ≤15 s, then tier 2 takes over | invisible at the product layer; visible in `trace[].notes` |
| `NEXT_PUBLIC_DEMO_MODE=true` | entire pipeline short-circuits to `demoWineAnalysis()` | the dashboard's data-source pill shows "DEMO" |
| `NEXT_PUBLIC_DEMO_FAST=true` **(default)** | orchestrator uses `directDispatch()` (fixed-order parallel pipeline, no GPT routing), Tavily cache pre-hydrated from `data/tavily-cache-export.json`, OpenAI model pinned to `gpt-4o-mini` for all agent LLM calls. **Full agent stack runs** — extraction sees weather + geo + Tavily; feature_agent uses the 3-tier ladder (Pioneer → OpenAI → template); Tavily `max_results_per_query` stays at 5. | invisible at the product layer; visible in `trace[]` durations (typical cold call: forward ~45-55 s · backtest ~45-55 s · warm/cached <50 ms) |
| `NEXT_PUBLIC_DEMO_FAST=false` | orchestrator uses the legacy OpenAI Chat Completions tool-use loop — the LLM decides what to call when | typical cold call ~80 s; useful for experimenting with adaptive routing |

**Accuracy contract:** extraction always sees weather + geo + Tavily.
All three sub-agents fire in parallel and we wait for ALL of them
before extraction starts. Wallclock is whatever Tavily takes (cache
hit ~100 ms; cold network 6-10 s; weather and geo are bundled CSVs
and resolve in <50 ms). On every call, every driver, every score,
the public-web signal is in the prompt — no degraded paths.

This is the H2/H3 contract in `CLAUDE.md` made concrete — every adapter is
gated, every failure is observable in `trace[]`, demo mode is the rehearsal
fallback.

---

## 6. Cost / latency profile (gpt-4o-mini)

Per `/api/analyze` call, ballpark — depends on which orchestrator
path is selected by `NEXT_PUBLIC_DEMO_FAST`:

### Default — directDispatch with cache-aware Tavily feed

| Phase | Wallclock | Tokens (OpenAI) | Pioneer calls |
|---|---|---|---|
| Cache hit (orchestrator) | <50 ms | 0 | 0 |
| Cold phase 1: weather + geo + Tavily (all parallel; Tavily is the long pole) | ~6-10 s | 0 | 0 |
| Cold phase 2: extraction with full 3 signals | ~7-20 s | ~3-4 k in / ~1.5 k out | 0 |
| Cold phase 3: feature (Pioneer tier 1) + backtest (parallel) | ~10-30 s | ~3-4 k in / ~1.5 k out | 1 (~2 k in / ~1 k out) |
| **Cold forward call (no backtest)** | **~35-55 s** | **~6-8 k in / ~3 k out** | **1** |
| **Cold backtest call** | **~35-55 s** | **~8-10 k in / ~4 k out** | **1** |
| **Warm call (cache hit)** | **<50 ms** | 0 | 0 |

Tavily is the phase-1 long pole (weather/geo are bundled CSVs). On the
demo path with a hydrated SQLite cache it drops to ~100 ms. Feature is
the phase-3 long pole because Pioneer (Qwen-7B class) takes 10-30 s —
that's the price of the "small open-source LLM wraps the numbers"
sponsor story. Backtest overlaps with feature in phase 3, so it's
effectively free wallclock on the backtest path.

### Legacy GPT-routing path (`DEMO_FAST=false`)

The OpenAI tool-use loop adds 5-7 GPT roundtrips on top of the agent
work (one round per tool-call decision), each taking 3-8 s on
gpt-4o-mini. Typical cold call: **~80 s**. Same per-token cost, just
much more wallclock.

At list prices the demo-fast path is roughly $0.002-0.004 per cold
analyze call — cheap enough that a heavy day of demo traffic
costs less than a coffee.

---

## 7. Adding a new sponsor

If a future iteration adds a fourth sponsor:

1. New adapter under `src/lib/{ai,training}/<sponsor>.ts` with a
   single-function surface that returns `null` on any failure.
2. Env keys gated in `src/lib/env.ts` and exposed via the `integrations`
   object.
3. A new entry in `.env.example`.
4. A demo-mode fallback path (H3 contract) — fixture or short-circuit.
5. A row added to the degradation ladder above.
6. The `trace[]` row name follows `<sponsor>_<purpose>` snake_case.

Don't bypass these steps. The "every external API call goes through an
adapter" rule is what keeps the demo robust under sponsor flakiness.
