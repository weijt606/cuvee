# 📊 Data Sources & Attribution

Cuvée's MIT license covers source code only. The datasets shipped under
`data/` come from a mix of public-domain, Creative Commons, and license-
required-attribution sources. This document is the canonical attribution
record. If you fork or redistribute, **carry these notices forward**.

---

## 1. Climate datasets

### `data/climate_features_downscaled.csv` · `data/climate_monthly.csv` (1990-2024)

- **Source**: ERA5 reanalysis, produced by the European Centre for Medium-Range Weather Forecasts (ECMWF) for the Copernicus Climate Change Service (C3S).
- **License**: [Copernicus License](https://apps.ecmwf.int/datasets/licences/copernicus/) — free use, redistribution, and modification permitted with mandatory attribution.
- **Our modifications**: DEM-based spatial downscaling (lapse rate + topographic position index + distance-to-Gironde buffer) to 61 château centroids; aggregation into monthly + vintage-level climate features (GST, harvest rain, heat-stress days, frost days, diurnal range, Huglin index, cool-night index).
- **Mandatory attribution string** (per Copernicus License):

  > *Generated using Copernicus Climate Change Service information 2024. Neither the European Commission nor ECMWF is responsible for any use that may be made of the Copernicus information or data it contains.*

### `data/climate_features_downscaled.csv` (2025 backfill rows) · `data/climate_monthly.csv` (2025 backfill rows)

- **Source**: NASA POWER (MERRA-2 reanalysis + AG community), <https://power.larc.nasa.gov/>.
- **License**: Public domain — U.S. government work, [17 U.S.C. § 105](https://www.law.cornell.edu/uscode/text/17/105). No attribution legally required.
- **Our modifications**: Same DEM downscaling pipeline as the ERA5 rows; clearly flagged as NASA POWER provenance in the agent's emitted `notes[]`.
- **Recommended credit**: *Data sourced from the NASA Langley Research Center (LaRC) POWER Project funded through the NASA Earth Science Directorate Applied Science Program.*

### `data/climate_features_forecast_2026.csv` · `data/forecast_skill.json`

- **Source**: ECMWF SEAS5 seasonal forecast ensemble, via the Copernicus Climate Change Service.
- **License**: Copernicus License (same as ERA5).
- **Our modifications**: Ensemble percentile extraction (p10 / p50 / p90); downscaling to the 61 château centroids; per-month skill metrics stored alongside.
- **Mandatory attribution**: same Copernicus statement as above.

### `data/validation_summary.json`

- **Source**: Original work — internal validation harness output produced by `scripts/test-weather-agent.ts` against the bundled climate CSVs.
- **License**: MIT (this repository).

---

## 2. Terroir / château datasets

### `data/chateaux.csv` · `data/static_geo.csv` · `data/microtopo.csv`

- **Source**: 61 Bordeaux estates listed in the **1855 Bordeaux Classification** (Médoc + Pessac-Léognan growths) plus their derived geographic attributes.
  - Estate names + AOC + growth classification: public domain (the 1855 classification is 169 years old; the names themselves are publicly known historical facts).
  - Coordinates (lat/lon): publicly available from estate official websites and open mapping data.
  - Elevation, distance-to-Gironde, topographic position index (TPI): computed from public DEMs.
  - Soil clay/sand/silt percentages: derived from publicly available agronomic surveys + estate documentation.
- **License of our derived dataset**: MIT (this repository).
- **Provenance note**: The specific coordinates + derived columns were curated by the hackathon team during the Paris AI Hackathon 2026 sprint. The full curation trail (which estate page each lat/lon came from) lives in the hackathon repository's commit history at <https://github.com/weijt606/paris-ai-hackathon-2026>.

---

## 3. Schema

### `data/wine-vintage-quality-schema.json`

- **Source**: Original work — 1,150-line vintage-quality scoring rubric (28 features × 6 hard event gates × 11 dynamic adjustments) authored by the hackathon team.
- **License**: MIT (this repository).
- **Reuse**: Free to fork, adapt, or build domain-specific variants (e.g. Burgundy, Champagne) under MIT terms.

---

## 4. Public-web retrieval cache

### `data/tavily-cache-export.json`

- **Source**: Pre-warmed cache of search hits originally retrieved via the Tavily Search API during hackathon development. URLs point to third-party publishers (James Suckling, Decanter, The Drinks Business, Bordeaux Index, Wine Conversation, négociant sites, etc.).
- **What we redistribute**:
  - URL (fact — fair to redistribute)
  - Article title (fair to redistribute; commonly indexed)
  - Tavily's relevance score + scale label (our metadata)
  - Query that produced the hit + source-type taxonomy (our metadata)
- **What we do NOT redistribute** (stripped in commit `c172699+`):
  - The `content` snippet field — publisher prose excerpts removed for safety. Live retrieval (Tavily / Brave / SearXNG) re-fetches snippets at runtime.
- **License**: The metadata above (URLs, titles, scores, queries) is redistributed as facts. The publisher content itself is **not redistributed** in this repository.
- **Purpose**: Acts as a warm-start seed so cached-key lookups skip the network round-trip during demos. Without `content`, the snippet text that reaches the LLM comes from a live API call; the cache shortcuts only the URL/title lookup.
- **If you regenerate this file** (via `pnpm export:tavily-cache`), strip the `content` field again before committing, or set the cache to URLs-only mode. See `scripts/export-tavily-cache.ts`.

---

## 5. Demo fixtures

### `src/lib/demo/fixtures.ts`

- **Source**: Hand-curated fictional scoring output covering well-known vintages (2010 / 2013 / 2015 / 2020). Real estate names are used (Lafite, Margaux, etc.) — these are public-domain estate identifiers. The scores and critic quotes inside the fixtures are **synthetic** (representative of historical critic consensus but not literal transcriptions from any specific publication).
- **License**: MIT (this repository).
- **Disclaimer**: Fixtures are only emitted when `NEXT_PUBLIC_DEMO_MODE=true`. They are explicitly labeled `isDemoOrPartial: true` in the API response so consuming code can distinguish them from live model output.

---

## 6. Runtime provider data

When Cuvée runs against live LLM providers (OpenAI / Anthropic / Qwen / DeepSeek / Ollama) and live retrieval providers (Tavily / Brave / SearXNG), the data that flows in and out at request time is **governed by each provider's terms of service** — not by this repository's license. Specifically:

- **LLM outputs** (extraction's scoring JSON, feature_agent's report, backtest's critic verdict) — usage subject to your LLM provider's content policy. OpenAI specifically forbids using outputs to train competing models; Anthropic's terms are similar.
- **Retrieval hits** (snippets surfaced by Tavily/Brave/SearXNG at runtime) — each search provider has its own terms governing how their results may be displayed or stored. The harness's SQLite cache (`data/.cache/tavily-search.sqlite`, gitignored) is a local-only operational cache subject to those terms.
- **Subscribe submissions** (email + region + persona via `POST /api/subscribe`) — currently a stub that logs a masked email + region + persona to stdout. Production deployments must wire a real mail provider and update their privacy policy accordingly.

---

## 7. Compliance checklist for forks / commercial use

If you're forking Cuvée for commercial use, the must-do checklist:

- [ ] Keep this `docs/DATA.md` file (or carry the Copernicus + NASA POWER attributions forward in your own equivalent doc).
- [ ] Display the Copernicus attribution string somewhere visible (in an About / Credits page or the README).
- [ ] If you regenerate `data/tavily-cache-export.json`, strip the `content` field before committing the new export (or scope your cache to URLs + titles only).
- [ ] Review the runtime provider ToS for any provider you configure — each one has separate terms.
- [ ] If you train or fine-tune any model using outputs from Cuvée's LLM providers, check the provider's specific clauses on competitive-product training.
- [ ] If your operational deployment stores subscriber emails for real, update your privacy policy + comply with applicable data-protection regulation (GDPR for EU users; CCPA for California users; etc.).

If you spot a missing attribution or licensing gap, please open an issue or PR.
