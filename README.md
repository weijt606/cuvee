# 🍇 Cuvée

**Schema-grounded multi-agent vintage intelligence for French wine regions — with critic-backed backtest verification.**

Cuvée scores any vintage in Burgundy or Bordeaux on a 0-100 quality scale using:

- **Real climate data** — ERA5 1990-2024 reanalysis + NASA POWER 2025 + ECMWF SEAS5 forecast, DEM-downscaled to 61 1855-classed château centroids
- **Terroir geometry** — soil composition, elevation, distance-to-Gironde, microtopography, AOC envelope
- **Public-web evidence** — 5-channel Tavily harness across regulatory, sentiment, market, négociant, and policy sources, SQLite-cached
- **A 1,150-line vintage-quality JSON schema** with 28 features × 6 hard gates × 11 dynamic adjustments, scored by OpenAI in strict `json_schema` mode
- **Backtest verification** — for any past vintage, retrieves actual Wine Advocate / Decanter / Vinous / Jancis Robinson scores via Tavily and emits a directional verdict (`high_agreement` / `moderate_agreement` / `divergent`)

The pipeline runs end-to-end in ~40-55 s cold, < 50 ms warm. The dashboard is a 3-column Atlas shell (map + workflow hero + analysis drawer) with light/dark mode and full English / French i18n.

---

## Quick start

### Prerequisites

| | Min | Verify |
|---|---|---|
| Node.js | `>=20` | `node -v` |
| pnpm | `>=10` | `pnpm -v` (install via `npm install -g pnpm@latest` or `corepack enable`) |
| Git | any | `git --version` |

macOS / Linux / WSL2 all work. Native Windows isn't tested.

### 1. Clone and install

```bash
git clone https://github.com/weijt606/cuvee.git
cd cuvee
pnpm install
```

### 2. Configure providers

```bash
cp .env.example .env.local
```

Only **OpenAI** is required for the LLM-driven pipeline. Everything else degrades to a fixture or fallback when its key is missing:

| Variable | Required? | What it does | Where to get it |
|---|---|---|---|
| `OPENAI_API_KEY` | **Yes** for the live pipeline | Orchestrator, extraction, feature tier 2, backtest | <https://platform.openai.com/api-keys> |
| `OPENAI_MODEL` | optional, default `gpt-4o-mini` | The agent LLM. **Don't use reasoning models** (`gpt-5*`, `o1`, `o3`) — they add 20-40 s of internal thinking that doesn't help structured JSON | — |
| `TAVILY_API_KEY` | optional | Public-web grounding for the `tavily_agent` + backtest critic retrieval | <https://app.tavily.com/home> |
| `PIONEER_API_KEY` | optional | `feature_agent` tier 1 (small open-source LLM for narrative wrapping) | <https://docs.pioneer.ai/> |
| `PIONEER_MODEL_ID` | optional | Pioneer model UUID | Pioneer dashboard |
| `NEXT_PUBLIC_DEMO_MODE` | optional, default `false` | Set `true` to short-circuit the entire pipeline to fixtures (no network, no keys needed) | — |
| `NEXT_PUBLIC_DEMO_FAST` | optional, default `true` | Direct-dispatch pipeline. Set `false` to fall back to the legacy GPT tool-use routing loop (~80 s/call) | — |

> `.env.local` is git-ignored. **Never commit real keys.** This repo is public.

### 3. Verify the environment

```bash
pnpm check:env
```

Pings the configured providers and reports which sub-agents will run live vs. degraded. Exits non-zero if `OPENAI_API_KEY` is missing or invalid.

### 4. Run the dev server

```bash
pnpm dev
# → http://localhost:3000
```

Pick a château on the map (or a region in the sidebar), click **Run analysis**, watch the workflow hero animate through the agents. The result drawer reveals on click-through. Typical cold call: ~40-55 s; the orchestrator caches results in memory for 30 min, so the **second** run of the same query returns in <50 ms.

### Useful scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server with Turbopack HMR |
| `pnpm build && pnpm start` | Production build + serve |
| `pnpm typecheck` | `tsc --noEmit` strict type check |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |
| `pnpm check:env` | Provider key ping |
| `pnpm test:geo` | Smoke-test `geo_agent` directly |
| `pnpm test:weather` | Smoke-test `weather_agent` directly |
| `pnpm export:tavily-cache` | Dump the local SQLite cache to `data/tavily-cache-export.json` for repo-shipped warmup |

### Run modes

```bash
# Default — full agent pipeline, accuracy-first
pnpm dev

# Offline rehearsal — no API calls, fixtures only, instant
NEXT_PUBLIC_DEMO_MODE=true pnpm dev

# Legacy GPT-routing loop — orchestrator lets the LLM decide tool order (~80 s/call)
NEXT_PUBLIC_DEMO_FAST=false pnpm dev
```

---

## Architecture

```
POST /api/analyze
        │
        ▼
   ┌──────────────────────────────────────────────────────────┐
   │ Orchestrator — directDispatch (default)                  │
   │   phase 1 (parallel)  weather + geo + tavily             │
   │   phase 2             extraction (schema-grounded)       │
   │   phase 3 (parallel)  feature + backtest (if past year)  │
   └──────────────────────────────────────────────────────────┘
        │
        ▼
   AnalyzeResult { riskScore, qualityBand, drivers, recommendations,
                   feature, geoSnapshot, backtest?, trace }
```

The pipeline is **accuracy-first**: extraction always waits for and consumes all three signal sources (climate, terroir, public-web). Wallclock is dominated by Tavily on cold queries (6-10 s) plus the LLM extraction (~15-20 s) plus the feature narrative (~20-30 s with Pioneer's open-source model on hot path).

### Three caching layers

1. **Orchestrator** — in-memory `Map`, 30-min TTL, 64-entry LRU, keyed on full input
2. **Tavily SQLite** — `node:sqlite`, 7-day TTL, survives process restarts
3. **Repo-shipped pre-hydration** — `data/tavily-cache-export.json` seeds the SQLite cache on first read so curated demo queries skip the network

### Schema-grounded scoring

The LLM emits a `qualityScore` (0-100, high = good) against the 1,150-line schema. Risk is computed in code as `100 - qualityScore` — the model never sees the word "risk" in its output contract, eliminating the inversion-drop bug. Calibration anchors (e.g. Bordeaux 2010 = 92, 2013 = 32, 2017 = 48) ground the numbers. A band-vs-score consistency check snaps disagreements to the band midpoint.

### Backtest verification

When `timeframe.end < today`, `backtest_agent` retrieves real-world critic + market data via a chateau-scoped Tavily call, then asks OpenAI to compare the prediction against the retrieved evidence. Output: a `verdict` (`high_agreement` / `moderate_agreement` / `divergent`) plus 4-6 critic entries with quoted scores. This closes the loop — predictions are auditable, not vibes.

---

## Project layout

```
cuvee/
├── data/                      # CSV datasets + JSON schema + pre-hydrated cache
├── docs/
│   ├── AGENTS.md              # Agent-layer guide
│   └── SPONSORS.md            # OpenAI · Tavily · Pioneer.ai integration
├── scripts/                   # check:env, test:geo, test:weather, export:tavily-cache
├── src/
│   ├── app/                   # Next.js App Router (api · blog · trade · vineyard)
│   ├── components/
│   │   ├── wine/atlas/        # 3-column shell + workflow hero + drawer
│   │   ├── wine/charts/       # Recharts visualizations
│   │   ├── wine/trade/        # trade-persona UI
│   │   └── wine/vineyard/     # vineyard-persona UI
│   └── lib/
│       ├── agents/            # orchestrator + extraction + feature + sub-agents/
│       ├── ai/                # OpenAI client
│       ├── training/          # Pioneer adapter
│       ├── wine/              # domain types, regions, products
│       └── env.ts
└── ...
```

For the deep dive on the agent contract, see [`docs/AGENTS.md`](docs/AGENTS.md). For provider wiring (OpenAI / Tavily / Pioneer.ai) see [`docs/SPONSORS.md`](docs/SPONSORS.md).

---

## Roadmap

- [x] **Phase A — clean baseline** — single-repo standalone, accuracy-first pipeline, light/dark UI, backtest verification
- [ ] **Phase B — provider abstraction** — `LLMProvider` + `RetrievalProvider` interfaces; OpenAI / Anthropic / Mistral / Ollama / Tavily / Brave / Serper as default adapters
- [ ] **Phase C — Burgundy expansion** — add Côte de Nuits / Côte de Beaune / Chablis terroir datasets
- [ ] **Phase D — Champagne** — extend schema with sparkling-specific gates
- [ ] **Phase E — self-hostable Docker** — `docker-compose` with optional local Ollama service

If a non-wine vertical reaches out (agriculture, climate-real-estate, insurance) — see `docs/AGENTS.md` for the agent contract; the orchestration pattern is domain-agnostic. A formal multi-vertical framework extraction (`packages/core` + `verticals/*` monorepo) is on the table once a second vertical is validated.

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the agent contract, PR checklist, and conventions. Branch names must be ASCII / English. No `Co-Authored-By:` AI trailers in commits.

## License

MIT — see [`LICENSE`](LICENSE).
