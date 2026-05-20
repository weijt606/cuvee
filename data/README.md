# data/ — Bundled datasets

This directory ships the static datasets that the Cuvée pipeline reads
at runtime. Every file's provenance + license is documented here. For
the full attribution narrative — including the mandatory Copernicus
attribution string — see [`../docs/DATA.md`](../docs/DATA.md).

| File | Description | Source | License |
|---|---|---|---|
| `wine-vintage-quality-schema.json` | 1,150-line vintage-quality scoring rubric (28 features × 6 hard gates × 11 dynamic adjustments) | Original work | MIT (this repo) |
| `chateaux.csv` | 61 Bordeaux 1855-classified estates with growth, AOC, commune | 1855 classification (public domain) | MIT (this repo) for the curated CSV |
| `static_geo.csv` | Lat / lon / elevation / distance-to-Gironde per château | Estate websites + public DEMs | MIT for the curated CSV; refer to upstream DEMs (Copernicus / SRTM) when redistributing the elevation column |
| `microtopo.csv` | TPI + slope + aspect + frost-pocket flag per château | Derived from public DEMs | MIT for the curated CSV; same upstream-DEM caveat |
| `climate_features_downscaled.csv` | DEM-downscaled daily climate per château centroid, 1990-2024 (ERA5) + 2025 (NASA POWER) | ECMWF Copernicus ERA5 reanalysis · NASA POWER 2025 backfill | **Copernicus License** for 1990-2024 (attribution required) · Public domain for NASA POWER rows |
| `climate_monthly.csv` | Same as above aggregated to monthly cadence | Same as above | Same as above |
| `climate_features_forecast_2026.csv` | Seasonal forecast ensemble (p10 / p50 / p90) for 2026 | ECMWF SEAS5 via Copernicus C3S | **Copernicus License** — attribution required |
| `forecast_skill.json` | Per-month skill metrics for the 2026 forecast | Derived from SEAS5 hindcast vs. ERA5 | Same as above |
| `validation_summary.json` | Internal validation harness output | Original work (`scripts/test-weather-agent.ts`) | MIT (this repo) |
| `tavily-cache-export.json` | Pre-warmed search cache — URLs + titles + scores + scale **only**. Publisher content snippets stripped. | Tavily Search API results during hackathon development | URLs + titles redistributed as facts; publisher content **not** included. See [`../docs/DATA.md`](../docs/DATA.md) §4. |

## Generated files (gitignored, not in this listing)

- `.cache/tavily-search.sqlite` — operational cache populated at runtime by the retrieval harness. Hydrated from `tavily-cache-export.json` on first read. Contains full publisher snippets when refreshed via live API; **do not commit**.
- `.memory/analysis-history.sqlite` — episodic memory store written by the orchestrator after each successful analysis. Local-only; **do not commit**.

## Copernicus attribution — required surface

If you publish a product that uses the climate CSVs in this directory, you must include the following attribution string in a visible location:

> Generated using Copernicus Climate Change Service information 2024. Neither the European Commission nor ECMWF is responsible for any use that may be made of the Copernicus information or data it contains.

This file, `LICENSE`, and `docs/DATA.md` already carry the attribution. If you fork the dataset out into a separate repository or product, replicate the attribution there.
