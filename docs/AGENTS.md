# 🍇 Cuvée Agents — Architecture Guide

Cuvée is a multi-agent vintage-quality and risk intelligence product for
French Burgundy + Bordeaux, with a dual-persona surface (vineyard operator /
trade buyer). This document covers the **agent architecture**, **file
layout**, and the **SubAgent contract** every external API call sits behind.

> General setup info (env, dev loop, scripts) lives in the project [`README.md`](../README.md).
> Provider adapter details (LLM + retrieval + memory) live in [`PROVIDERS.md`](PROVIDERS.md).
> This file is just the agent layer.

---

## 1. System architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  /                — EntryChoice (vineyard / trade) + light/dark + EN/FR  │
├──────────────────────────────────────────────────────────────────────────┤
│  AtlasShell — 3-column shell shared by /vineyard and /trade              │
│  ┌────────────┬───────────────────────────────┬──────────────────────┐   │
│  │ LEFT       │ CENTRE  · BordeauxMap         │ RIGHT                │   │
│  │ List or    │ 61 1855 classés on            │ Detail panel         │   │
│  │ region     │ CARTO dark/light tiles        │ (terroir / controls) │   │
│  │ sidebar    │ click → flyTo (memoised)      │ Persona tabs / Run   │   │
│  └────────────┴───────────────────────────────┴──────────────────────┘   │
│                      ▲                                                   │
│        Run click ────┴──── overlays drawer above the centre column:      │
│                                                                          │
│        WorkflowHero (during run): rotating headline · elapsed/progress   │
│        /active KV grid · agent DAG · event ticker                        │
│                                                                          │
│        On result: hero enters completion gate (timer freezes, dot turns  │
│        emerald) → "View report →" button → AnalysisDrawer takes over    │
│        the drawer slot.                                                  │
└────────────────────────┬─────────────────────────────────────────────────┘
                         │ POST /api/analyze
                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Orchestrator  (src/lib/agents/orchestrator.ts)                          │
│                                                                          │
│   Two paths, selected by NEXT_PUBLIC_DEMO_FAST:                          │
│                                                                          │
│   • DEMO_FAST=true (default)  ─ directDispatch()                         │
│     Fixed-order pipeline — saves 5-7 GPT routing roundtrips.             │
│     phase 1: weather + geo + Tavily       (all parallel; we wait for     │
│                                            ALL three before extraction)  │
│     phase 2: extraction                   (always with weather + geo +   │
│                                            Tavily — accuracy contract)   │
│     phase 3: feature + backtest           (parallel when backtest fires) │
│                                                                          │
│   • DEMO_FAST=false ─ OpenAI Chat Completions tool-use loop              │
│     Registers each SubAgent as a function tool; the LLM decides what     │
│     to call when. Slower (~80 s cold) but adaptive.                      │
│                                                                          │
│   Both paths share:                                                      │
│   • In-memory cache (30 min TTL, 64 LRU) keyed on input                  │
│   • Auto-detect backtest when timeframe.end < today                      │
│   • Harvest extraction + feature + geo + backtest → AnalyzeResult        │
└────────────────────────┬─────────────────────────────────────────────────┘
                         │ parallel calls (per the path above)
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
 weather_agent      geo_agent        tavily_agent
 (climate signals)  (terroir + AOC)  (public-web grounding +
                                      SQLite cache pre-hydrated from
                                      data/tavily-cache-export.json)
       │                 │                 │
       └─────────────────┼─────────────────┘
                         ▼
                 extraction_agent          ← vintage-quality scoring
                 (28 features, 11 gates,      via OpenAI strict
                  → quality 0-100 →            json_schema; risk = 100 - quality)
                  risk inverted)
                         │
                         ▼
                  feature_agent            ← exec summary, structured
                  2-tier:                    markdown report, email digest
                  1. defaultLLM().chat()    (LLM provider via CUVEE_LLM_PROVIDER:
                     with strict JSON        OpenAI / Claude / Qwen / DeepSeek / Ollama)
                  2. Deterministic template
                         │
                         ▼ (only if timeframe is historical)
                  backtest_agent           ← verifies prediction against
                  defaultRetrieval()       historical critic + market signals.
                  + defaultLLM()           Retrieval via Tavily / Brave / SearXNG.
                  comparison
```

**Principles:**
- Orchestrator is a router. Sub-agents do the work; the orchestrator never
  embeds business logic.
- Sub-agents have **no inter-dependencies**. Each can be developed and tested
  in isolation.
- Each sub-agent is one file with one `run()` body. Swap the body, keep the
  contract — downstream stays intact.

---

## 2. File map

| File | Purpose | Status |
|---|---|---|
| `src/lib/agents/orchestrator.ts` | Tool-use routing + cache + `directDispatch()` for demo-fast | ✅ stable — do not edit |
| `src/lib/agents/types.ts` | `SubAgent`, `AgentResult`, `AgentContext` | ✅ stable — do not edit |
| `src/lib/agents/sub-agents/weather.ts` | ERA5 1990-2024 + NASA POWER 2025 + SEAS5 2026 + DEM downscaling | ✅ wired |
| `src/lib/agents/sub-agents/geo.ts` | 61-château 1855 dataset, microtopo, AOC envelope | ✅ wired |
| `src/lib/agents/sub-agents/tavily.ts` | 5-source-type public-web harness | ✅ wired |
| `src/lib/agents/sub-agents/tavily-cache.ts` | SQLite 7-day cache + idempotent hydration from export JSON | ✅ wired |
| `src/lib/agents/sub-agents/backtest.ts` | Critic retrieval + verdict comparison | ✅ wired |
| `src/lib/agents/extraction.ts` | Vintage-quality schema scoring (28 features × 6 gates × 11 adjustments) + persona-lens injection + few-shot retrieval from memory | ✅ wired |
| `src/lib/agents/feature.ts` | LLM narrative tier via `defaultLLM()` + deterministic template fallback | ✅ wired |
| `src/lib/llm/` | Provider abstraction — OpenAI, Anthropic Claude, Qwen, DeepSeek, Ollama. `defaultLLM()` + `hasLLM()`. | ✅ wired |
| `src/lib/retrieval/` | Provider abstraction — Tavily, Brave, SearXNG, null. `defaultRetrieval()` + `hasRetrieval()`. | ✅ wired |
| `src/lib/memory/` | SQLite-backed episodic memory + few-shot retrieval + calibration-drift query helpers | ✅ wired |
| `src/lib/env.ts` | zod env + `integrations` map + `isDemoFast` / `isDemoMode` | ✅ stable |
| `src/lib/wine/types.ts` | `AnalyzeInput` / `AnalyzeResult` / `TradePersona` / `BacktestSnapshot` / `GeoSnapshot` | ✅ shared FE+BE |
| `src/lib/wine/regions.ts` | Burgundy + Bordeaux static region list | ✅ wired |
| `src/lib/wine/products.ts` | 80-entry curated wine catalog (61 1855 classés + 21 Burgundy crus) | ✅ wired |
| `src/lib/wine/chateaux-static.json` | Client-safe 61-château dataset (joined fields) | ✅ shared FE+BE |
| `data/tavily-cache-export.json` | Pre-warmed Tavily cache payload for demo | ✅ committed |
| `src/app/api/analyze/route.ts` | POST entry point with zod validation | ✅ stable |
| `src/components/wine/atlas/AtlasShell.tsx` | 3-column shell + overlay drawer + Escape-to-close | ✅ wired |
| `src/components/wine/atlas/WorkflowHero.tsx` | Cinematic during-run stage + **completion gate** with View-report button | ✅ wired |
| `src/components/wine/atlas/AnalysisDrawer.tsx` | Result-stack drawer body (ExecutiveSummary → BacktestCard → RiskCard+RiskBandLegend → TerroirCard → charts → FullReportCard) | ✅ wired |
| `src/components/wine/atlas/{ChateauListSidebar,ChateauDetailPanel,VineyardSidebar,VineyardControls}.tsx` | Shell column bodies | ✅ wired |
| `src/components/wine/{RiskCard,RiskBandLegend,FullReportCard,BacktestCard,ExecutiveSummary,TerroirCard}.tsx` | Result cards | ✅ wired |
| `src/components/wine/trade/{TradeDashboard,BordeauxMap,ProductPicker,TradePersonaTabs}.tsx` | Trade composition + map + product catalog combobox + persona segmented switch | ✅ wired |
| `src/components/wine/vineyard/{VineyardDashboard,UploadArea}.tsx` | Vineyard composition + dropzone | ✅ wired |
| `src/components/ThemeToggle.tsx` | Light/dark toggle backed by an inline boot script | ✅ wired |
| `src/lib/demo/fixtures.ts` | Demo-mode fixtures (H3 contract) | ✅ wired |

---

## 3. SubAgent contract

Every external integration sits behind this interface (`src/lib/agents/types.ts`):

```ts
export interface SubAgent<TInput, TData> {
  name: string;              // snake_case, unique — used as OpenAI tool name
  description: string;       // tells OpenAI WHEN to call this — be specific
  input_schema: JsonSchema;  // OpenAI fills params against this schema
  run(input: TInput, ctx: AgentContext): Promise<AgentResult<TData>>;
}
```

**The orchestrator's guarantees:**
- Sub-agents never call each other. The OpenAI tool-use loop decides ordering.
- One sub-agent throwing does not crash the loop (`runAgentSafely` wraps with
  try/catch).
- `ctx.signal: AbortSignal` fires on request cancel / timeout. Long-running
  fetches should honor it.
- `ctx.chateau`, `ctx.uploads`, `ctx.isBacktest`, `ctx.vintageYear` are
  populated from the request when present — sub-agents may read but should
  not assume.

**Every sub-agent must:**
- ✅ Always resolve. Never reject. Errors surface as `{ ok: false, error: "..." }`.
- ✅ Return `data` matching the declared `TData`. Extraction reads it by shape.
- ✅ Keep `input_schema` accurate. OpenAI uses description + schema to decide.
- ❌ Never call OpenAI for "the main decision" — that's the orchestrator's job.
- ❌ Never edit `orchestrator.ts` to add a special branch — fix the contract instead.

---

## 4. Sub-agent state of the art (what each one actually does today)

### `weather_agent` — `src/lib/agents/sub-agents/weather.ts`

- **Historical**: ERA5 reanalysis (Open-Meteo Archive) for 1990-2024 daily series
  at 61 château centroids, with DEM-based downscaling (lapse rate + TPI +
  Gironde-buffer).
- **2025 backfill**: NASA POWER (MERRA-2 + AG community), with explicit source
  disclosure in the agent's `notes[]`.
- **2026 forecast**: ECMWF SEAS5 seasonal ensemble (vintage granularity).
- **Outputs** (`WeatherSignals`): `metrics[]` keyed to the vintage schema
  (`gst_growing_season`, `harvest_rain`, `flowering_rain`, `heat_days_ge_35`,
  `cool_nights`, `frost_days_apr`, …), plus a prose `summary` and per-segment
  `notes[]`.

### `geo_agent` — `src/lib/agents/sub-agents/geo.ts`

- **Dataset**: 61 1855-classed Bordeaux châteaux joined on `chateaux.csv` +
  `static_geo.csv` + `microtopo.csv` (commune, lat/lon, elevation, distance to
  Gironde, slope/aspect/TPI).
- **AOC envelope**: returns the AOC parent, classification (1er Cru → 5e Cru
  Classé), and parcel-scale microtopography when `ctx.chateau` is set.
- **Output** (`GeoSnapshot`): both the static dataset row and a brief terroir
  interpretation usable by the UI's `TerroirCard`.

### `tavily_agent` — `src/lib/agents/sub-agents/tavily.ts` (+ `tavily-cache.ts`)

- **Harness**: 5 source types — `producer_official`, `regulator_or_inao`,
  `wine_media_premium`, `wine_media_general`, `forums_or_communities` — each
  with a trusted-domain allow-list and per-type weighting.
- **Cache**: 7-day TTL via `node:sqlite`, keyed on a SHA-256 of the query
  + filters. Misses go to Tavily Search; hits return instantly.
- **Output**: ranked `hits[]` with `url`, `title`, `published_date`, `score`,
  `source_type`, `summary`. Consumed by `extraction_agent` and re-used by
  `backtest_agent` for critic retrieval.

### `backtest_agent` — `src/lib/agents/sub-agents/backtest.ts`

- **When**: orchestrator auto-detects `timeframe.end < today` and runs this
  agent **after** extraction.
- **What**: calls `runTavilyHarness()` for the vintage year (e.g. "Lafite
  Rothschild 2010 vintage review"), passes top hits to OpenAI with a strict
  `json_schema` that emits `critics[]` (source, score, scale, quote, url),
  `marketSignals`, and a `verdict` of `confirms` / `partial` / `contradicts`
  against the prediction.
- **Output** (`BacktestSnapshot`): used by `BacktestCard` to render the
  side-by-side predicted-vs-actual block.

### `extraction_agent` — `src/lib/agents/extraction.ts`

- **Input**: pooled outputs from weather + geo + tavily, plus the original
  `AnalyzeInput`.
- **Engine**: OpenAI strict `json_schema` mode against the 1150-line vintage
  quality schema — 28 features, 6 hard event gates (frost wipeout, hail,
  catastrophic harvest rain, etc.), 11 dynamic adjustments. Falls back to a
  deterministic heuristic on OpenAI failure (returns `ok: true` with the
  heuristic data so the rest of the pipeline keeps flowing).
- **Inversion**: schema computes `quality ∈ [0,100]`; the agent emits
  `risk = 100 - quality` to keep the dashboard's existing "lower risk is
  better" semantics.
- **Output**: `score`, `riskBand`, `qualityBand`, `activeGates[]`, `rationale`,
  `drivers[]` (with `source`, `signal`, `weight`), `recommendations[]`.

### `feature_agent` — `src/lib/agents/feature.ts`

- **Tier 1**: the configured LLM provider (`defaultLLM()` — OpenAI by
  default; Claude, Qwen, DeepSeek, or Ollama selectable via
  `CUVEE_LLM_PROVIDER`). Strict JSON enforced per-provider — `response_format`
  on OpenAI-compatible APIs, the `submit_result` tool-use trick on Claude.
  Returns `null` on any failure.
- **Tier 2**: deterministic template assembled from extraction's output
  (always succeeds — keeps the dashboard demoable with zero LLM access).
- **Output** (`FeatureOutput`): `executiveSummary`, `reportMarkdown`,
  `emailDigest`. Consumed by the `ExecutiveSummary` UI card, the export
  button, and the subscribe dialog.

---

## 5. API contract (frontend ↔ backend)

### `POST /api/analyze`

**Request:**
```json
{
  "region":    { "id": "burgundy-cote-de-nuits", "name": "Côte de Nuits", "parent": "burgundy" },
  "timeframe": { "start": "2026-05-16", "end": "2026-08-14" },
  "persona":   "vineyard",
  "question":  "focus on frost risk in April",
  "chateau":   "Château Lafite Rothschild",
  "uploads":   [{ "name": "harvest_report.pdf", "size": 184320, "mime": "application/pdf" }]
}
```

**Response (200):**
```ts
interface AnalyzeResult {
  region: { id: string; name: string; parent: "burgundy" | "bordeaux" };
  timeframe: { start: string; end: string };
  persona: "vineyard" | "trade";
  riskScore: number;                  // 0-100
  riskBand: "low" | "moderate" | "elevated" | "high";
  qualityBand: "exceptional" | "excellent" | "very_good" | "good" | "average" | "poor";
  activeGates: string[];              // schema gates that fired
  rationale: string;
  drivers: Array<{ source: "weather"|"geo"|"tavily"|"extraction"; signal: string; weight: number }>;
  recommendations: Array<{ persona: "vineyard"|"trade"; action: string; evidence?: string }>;
  feature?: {                         // present whenever feature_agent ran
    executiveSummary: string;
    reportMarkdown: string;
    emailDigest: string;
  };
  geoSnapshot?: GeoSnapshot;          // present when chateau is set OR region has static data
  backtest?: BacktestSnapshot;        // present when timeframe.end < today
  trace: Array<{ agent: string; ok: boolean; durationMs: number; summary?: string; error?: string }>;
  generatedAt: string;                // ISO
  isDemoOrPartial: boolean;           // true if demo / missing key / sub-agent failure
}
```

**Errors:**
- `400` — zod validation failed (malformed body).
- `503` — `SponsorUnavailableError` (a critical sponsor key is missing).
- `500` — other throws.

Types live in `src/lib/wine/types.ts` and are imported by **both** server
and client (no `server-only` imports inside).

---

## 6. Demo mode

`NEXT_PUBLIC_DEMO_MODE=true` short-circuits the entire pipeline:

- The orchestrator returns `demoWineAnalysis(input)` directly — no LLM call,
  no retrieval, no memory write, no sub-agent dispatch.
- Each sub-agent **should also** check `isDemoMode` at the top of `run()` and
  return its own fixture (so unit tests can exercise the agent in isolation).
- The fixture set covers well-known vintages (2010 / 2013 / 2015 / 2020) so
  backtest mode has plausible output offline.

**Why it matters:** external APIs can rate-limit or fail at the worst possible
moment (live demo). Demo mode is the rehearsal contract.
Every new external call must add a fixture branch.

**Testing demo mode:**
```bash
NEXT_PUBLIC_DEMO_MODE=true pnpm dev
# Visit http://localhost:3000 → Run analysis → verify isDemoOrPartial: true
```

---

## 7. Caching layers

Three independent caches keep the live system snappy:

1. **Orchestrator cache** (`src/lib/agents/orchestrator.ts`)
   In-memory `Map`, 30-min TTL, 64-entry LRU, keyed on
   `(region, persona, tradePersona, timeframe, question, chateau,
   upload-meta-hash)`. Skips the entire pipeline (both demo-fast direct
   dispatch and the legacy GPT loop) on a hit. Cleared on process
   restart.

2. **Tavily SQLite cache** (`src/lib/agents/sub-agents/tavily-cache.ts`)
   `node:sqlite`, 7-day TTL, keyed on a SHA-256 of the search query +
   filters + chateau scope. Survives process restarts. Lazy-opened on
   the first read.

3. **Tavily cache hydration** (same file)
   On first DB open, idempotently inserts entries from
   `data/tavily-cache-export.json` via `INSERT OR IGNORE`. The export
   file is produced by `scripts/export-tavily-cache.ts` and committed
   so the demo machine ships with a pre-warmed cache — cold queries
   for the curated demo path skip the Tavily network round-trip
   entirely. Looking for `[tavily-cache] hydrated N entries from
   export` in stdout confirms it ran.

Neither the orchestrator nor the Tavily caches are touched on demo
mode (`NEXT_PUBLIC_DEMO_MODE=true`); that path short-circuits before
they're consulted.

---

## 8. Co-ordination + PR checklist

- **Branch strategy**: feature branches off `main`. Sub-agent work happens on
  `agent/<name>`; integration on `feat/integrate-sub-agents`.
- **Branch names are ASCII**: never Chinese / non-ASCII characters — GitHub
  flags them.
- **PR title** style: `feat(agent): wire weather_agent to ERA5 + SEAS5`.
- **Every PR includes**:
  - real implementation (no leftover stub body)
  - demo fixture branch when introducing a new external call
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - one `curl /api/analyze` proof in the PR description (trace row `ok: true`)

- **Do not touch** without an issue:
  - `orchestrator.ts`
  - `types.ts` (SubAgent contract)
  - `analyze/route.ts` (API surface)

- **Free to extend**:
  - `regions.ts` — more regions
  - `components/wine/*` — UI iteration
  - `fixtures.ts` — richer demo data

- **Commit hygiene**:
  - Honor H1 (no secrets / PII in commits) — run `git diff --cached` and scan.
  - Honor H5 (no `Co-Authored-By: Claude` trailer in this repo).

---

## 9. Quick reference

| Question | Where |
|---|---|
| Which file do I own? | §2 file map |
| What contract do I satisfy? | §3 SubAgent contract |
| What does sub-agent X already do? | §4 state of the art |
| What's the API response shape? | §5 |
| How do I test offline? | §6 demo mode |
| Why is this slow on a cold call? | §7 — first call misses all three caches |
| Why direct-dispatch instead of LLM routing? | §1 — fixed-order pipeline saves 5-7 GPT roundtrips |
| What goes in a PR? | §8 |
| How are LLM / retrieval / memory providers wired? | [`PROVIDERS.md`](PROVIDERS.md) |
| Where do UI primitives live? | `src/components/wine/atlas/*` (shell) + `src/components/wine/*` (cards) |
| How does the View-report gate work? | `WorkflowHero.tsx` — `done` + `onContinue` props |
| How does light/dark mode work? | `src/components/ThemeToggle.tsx` + inline boot script in `layout.tsx` |

Questions → open an issue or a draft PR. Don't block on chat.
