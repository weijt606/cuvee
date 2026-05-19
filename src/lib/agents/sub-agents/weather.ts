import "server-only";
import { isDemoMode } from "@/lib/env";
import { findRegion } from "@/lib/wine/regions";
import { demoWeatherSignals } from "@/lib/demo/fixtures";
import {
  type ClimateRow,
  type ForecastRow,
  type MonthlyRow,
  type AggregateStats,
  aggregate,
  coolNightApprox,
  getForecastRows,
  getHistoricalRows,
  getMonthlyRows,
  hasClimateCoverage,
  huglinApprox,
  loadSkill,
  maxHistoricalYear,
} from "@/lib/wine/climate";
import type { SubAgent } from "@/lib/agents/types";

export interface WeatherInput {
  regionId: string;
  /** ISO date. */
  start: string;
  /** ISO date. */
  end: string;
  /** Optional château name. If present, returns single-site profile rather than AOC aggregate. */
  chateau?: string;
}

export interface WeatherSignals {
  summary: string;
  metrics: Array<{ name: string; value: number; unit: string }>;
  /** Free-form notes for the orchestrator to include in its reasoning. */
  notes: string[];
}

/**
 * Resolves historical (1990-2024) or 2026 forecast climate from the
 * bundled DEM-downscaled ERA5 dataset (`climate_features_downscaled.csv`)
 * and ECMWF SEAS5 ensemble (`climate_features_forecast_2026.csv`).
 *
 *   end ≥ 2026-05-01  → 51-member SEAS5 ensemble (p5/p50/p95 per metric).
 *   else              → single historical vintage year, AOC mean
 *                       (or single-château read if `chateau` is passed).
 *
 * Burgundy + right-bank fall through to a graceful "no coverage" reply;
 * the 61-château dataset only covers left-bank classed growths.
 */
export const weatherAgent: SubAgent<WeatherInput, WeatherSignals> = {
  name: "weather_agent",
  description:
    "Gather climate signals for a wine region/timeframe — historical 1990-2024 DEM-downscaled ERA5 features or 2026 ECMWF SEAS5 seasonal forecast ensemble. Returns GST, harvest rain, heat-stress days, frost days, winter rain, diurnal range, and derived Huglin/cool-night indices, plus an LLM-readable prose summary. Pass an optional 'chateau' string (e.g. 'Lafite', 'Latour') for a single-site read instead of the AOC aggregate. Call early in the loop — extraction_agent depends on its output. No external API; reads bundled CSVs.",
  input_schema: {
    type: "object",
    properties: {
      regionId: { type: "string", description: "Region slug, e.g. 'bordeaux-medoc'." },
      start: { type: "string", description: "ISO date YYYY-MM-DD." },
      end: { type: "string", description: "ISO date YYYY-MM-DD." },
      chateau: {
        type: "string",
        description:
          "Optional château name. Partial matches accepted ('Lafite' → 'Château Lafite Rothschild').",
      },
    },
    required: ["regionId", "start", "end"],
  },

  async run(input, ctx) {
    const t0 = Date.now();

    if (isDemoMode) {
      return {
        agent: "weather_agent",
        ok: true,
        durationMs: Date.now() - t0,
        data: demoWeatherSignals(input.regionId, input.chateau),
        summary: "demo · climate fixture",
      };
    }

    const region = findRegion(input.regionId);
    if (!region) {
      return {
        agent: "weather_agent",
        ok: false,
        error: `Unknown regionId: ${input.regionId}`,
        durationMs: Date.now() - t0,
      };
    }

    if (!hasClimateCoverage(input.regionId)) {
      return {
        agent: "weather_agent",
        ok: true,
        durationMs: Date.now() - t0,
        data: {
          summary: `${region.name}: no per-château climate coverage in dataset (1990-2025 ERA5/NASA-POWER + 2026 SEAS5 limited to left-bank Bordeaux 1855 classed growths).`,
          metrics: [],
          notes: [
            "Burgundy and right-bank Bordeaux fall outside the bundled dataset.",
            "Extension path: extend climate_features_downscaled.csv with the requested AOCs.",
          ],
        },
        summary: "no coverage in dataset",
      };
    }

    if (ctx.signal.aborted) {
      return {
        agent: "weather_agent",
        ok: false,
        error: "aborted",
        durationMs: Date.now() - t0,
      };
    }

    try {
      const wantForecast = shouldUseForecast(input.end);
      const data = wantForecast
        ? forecastRead(region.name, input)
        : historicalRead(region.name, input);

      return {
        agent: "weather_agent",
        ok: true,
        durationMs: Date.now() - t0,
        data,
        summary: data.summary.split("\n")[0]?.slice(0, 80) ?? "climate read",
      };
    } catch (err) {
      return {
        agent: "weather_agent",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
      };
    }
  },
};

// ─── Branch dispatch ─────────────────────────────────────────────────

/** May 2026 init covers May-Sep; anything ending at/after May 2026 reads forecast. */
function shouldUseForecast(endIso: string): boolean {
  return endIso >= "2026-05-01";
}

function pickVintageYear(endIso: string, maxYear: number): number {
  const y = Number.parseInt(endIso.slice(0, 4), 10);
  if (!Number.isFinite(y)) return maxYear;
  return Math.min(y, maxYear);
}

// ─── Historical read ─────────────────────────────────────────────────

function historicalRead(regionName: string, input: WeatherInput): WeatherSignals {
  const maxYear = maxHistoricalYear();
  const targetYear = pickVintageYear(input.end, maxYear);
  const rows = getHistoricalRows({
    regionId: input.regionId,
    year: targetYear,
    chateau: input.chateau,
  });

  if (rows.length === 0) {
    if (input.chateau) {
      throw new Error(`Château not found in dataset: ${input.chateau}`);
    }
    throw new Error(`No historical rows for ${input.regionId} year ${targetYear}`);
  }

  const label = labelFor(regionName, input.chateau, rows);
  const requestedYear = Number.parseInt(input.end.slice(0, 4), 10);
  const yearClamped = Number.isFinite(requestedYear) && requestedYear > maxYear;

  const monthly = getMonthlyRows({
    regionId: input.regionId,
    year: targetYear,
    chateau: input.chateau,
  });

  const m = aggregateHistorical(rows);
  const schemaWindows = aggregateSchemaWindows(monthly, targetYear);
  const metrics = buildHistoricalMetrics(m, schemaWindows);
  const summary = formatHistoricalSummary(label, targetYear, rows.length, m, schemaWindows);
  const notes = buildHistoricalNotes(
    yearClamped,
    requestedYear,
    maxYear,
    schemaWindows !== null,
    targetYear,
  );

  return { summary, metrics, notes };
}

interface HistoricalAggregate {
  gst: number;
  gdd10: number;
  harvRain: number;
  winRain: number;
  sunHours: number;
  heatDays: number;
  frostDays: number;
  dtrAugSep: number;
  radiationMJ: number;
  huglin: number;
  coolNight: number;
}

interface SchemaWindowedMetrics {
  /** mean(Tmin) in September — schema-aligned cool_night_index. */
  coolNightSep: number;
  /** max of daily Tmax over Apr-Sep — schema extreme_max_temperature. */
  extremeMaxAprSep: number;
  /** count(Tmax ≥ 35 °C) Jun-Sep — schema window for heat_days. */
  heatDaysJunSep: number;
  /** count(Tmin ≤ −2 °C) Mar-Apr — schema spring_frost_events. */
  springFrostT2MarApr: number;
  /** May precip sum — proxy for schema flowering_rain (May 25-Jun 15). */
  floweringRainMay: number;
}

/**
 * Compute schema-aligned vintage features from the monthly aggregate
 * table. Returns null when no monthly rows are available (so callers
 * fall back to the vintage-level approximations).
 *
 * All values are averaged across the châteaux in `rows` (caller already
 * filtered to the target region/year/optional château).
 */
function aggregateSchemaWindows(
  rows: MonthlyRow[],
  targetYear: number,
): SchemaWindowedMetrics | null {
  const target = rows.filter((r) => r.year === targetYear);
  if (target.length === 0) return null;

  const byChateau = new Map<string, MonthlyRow[]>();
  for (const r of target) {
    const arr = byChateau.get(r.chateau);
    if (arr) arr.push(r);
    else byChateau.set(r.chateau, [r]);
  }

  const perChateau: SchemaWindowedMetrics[] = [];
  for (const months of byChateau.values()) {
    const inWindow = (mo: number, from: number, to: number): MonthlyRow[] =>
      months.filter((r) => r.month >= from && r.month <= to);

    const sept = months.find((r) => r.month === 9);
    const aprSep = inWindow(4, 4, 9);
    const junSep = inWindow(6, 6, 9);
    const marApr = inWindow(3, 3, 4);
    const may = months.find((r) => r.month === 5);

    perChateau.push({
      coolNightSep: sept ? sept.tminMean : NaN,
      extremeMaxAprSep:
        aprSep.length > 0 ? Math.max(...aprSep.map((r) => r.tmaxMax)) : NaN,
      heatDaysJunSep: junSep.reduce((s, r) => s + r.heatDays35, 0),
      springFrostT2MarApr: marApr.reduce((s, r) => s + r.frostDaysM2, 0),
      floweringRainMay: may ? may.precipSum : NaN,
    });
  }

  const meanOf = (pick: (s: SchemaWindowedMetrics) => number): number => {
    const xs = perChateau.map(pick).filter(Number.isFinite);
    if (xs.length === 0) return NaN;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };

  return {
    coolNightSep: meanOf((s) => s.coolNightSep),
    extremeMaxAprSep: meanOf((s) => s.extremeMaxAprSep),
    heatDaysJunSep: meanOf((s) => s.heatDaysJunSep),
    springFrostT2MarApr: meanOf((s) => s.springFrostT2MarApr),
    floweringRainMay: meanOf((s) => s.floweringRainMay),
  };
}

function aggregateHistorical(rows: ClimateRow[]): HistoricalAggregate {
  const meanOf = (pick: (r: ClimateRow) => number): number => {
    const xs = rows.map(pick).filter(Number.isFinite);
    if (xs.length === 0) return NaN;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  const gst = meanOf((r) => r.gst);
  const gdd10 = meanOf((r) => r.gdd10);
  const dtrAugSep = meanOf((r) => r.dtrAugSep);
  return {
    gst,
    gdd10,
    harvRain: meanOf((r) => r.harvRain),
    winRain: meanOf((r) => r.winRain),
    sunHours: meanOf((r) => r.sunHours),
    heatDays: meanOf((r) => r.heatDays),
    frostDays: meanOf((r) => r.frostDays),
    dtrAugSep,
    radiationMJ: meanOf((r) => r.radiationMJ),
    huglin: huglinApprox(gdd10, dtrAugSep),
    coolNight: coolNightApprox(gst, dtrAugSep),
  };
}

function buildHistoricalMetrics(
  m: HistoricalAggregate,
  s: SchemaWindowedMetrics | null,
): WeatherSignals["metrics"] {
  const out: WeatherSignals["metrics"] = [
    { name: "GST", value: round(m.gst, 2), unit: "°C" },
    { name: "GDD10", value: round(m.gdd10, 0), unit: "°C·day" },
    { name: "harvest_rain", value: round(m.harvRain, 0), unit: "mm" },
    { name: "winter_rain", value: round(m.winRain, 0), unit: "mm" },
    { name: "diurnal_temperature_range", value: round(m.dtrAugSep, 2), unit: "°C" },
    { name: "huglin_index", value: round(m.huglin, 0), unit: "°C·day (approx)" },
    { name: "sun_hours", value: round(m.sunHours, 0), unit: "h" },
    { name: "radiation", value: round(m.radiationMJ, 0), unit: "MJ/m²" },
  ];
  // Schema-aligned windows come from monthly data when available. Fall
  // back to the vintage-level approximations otherwise.
  if (s) {
    out.push(
      { name: "heat_days", value: round(s.heatDaysJunSep, 1), unit: "days ≥35°C Jun-Sep" },
      {
        name: "spring_frost_events",
        value: round(s.springFrostT2MarApr, 1),
        unit: "days ≤−2°C Mar-Apr",
      },
      { name: "cool_night_index", value: round(s.coolNightSep, 2), unit: "°C" },
      {
        name: "extreme_max_temperature",
        value: round(s.extremeMaxAprSep, 2),
        unit: "°C peak Apr-Sep",
      },
      { name: "flowering_rain", value: round(s.floweringRainMay, 0), unit: "mm May" },
    );
  } else {
    out.push(
      { name: "heat_days", value: round(m.heatDays, 1), unit: "days ≥35°C Apr-Sep" },
      {
        name: "spring_frost_events",
        value: round(m.frostDays, 1),
        unit: "days ≤0°C Apr-May (proxy)",
      },
      { name: "cool_night_index", value: round(m.coolNight, 2), unit: "°C (approx)" },
    );
  }
  return out;
}

function formatHistoricalSummary(
  label: string,
  year: number,
  n: number,
  m: HistoricalAggregate,
  s: SchemaWindowedMetrics | null,
): string {
  const lines: string[] = [];
  lines.push(`Vintage ${year} climate (${label}${n > 1 ? `, ${n} châteaux mean` : ""}):`);
  lines.push(`  Growing-season temperature ${fmt(m.gst, 1)} °C ${tempVerdict(m.gst)}.`);
  lines.push(`  Growing degree days base 10: ${fmt(m.gdd10, 0)} °C·day.`);
  lines.push(`  Harvest rain ${fmt(m.harvRain, 0)} mm Aug-Sep ${rainVerdict(m.harvRain)}.`);
  if (s) {
    lines.push(
      `  Heat-stress days (Tmax≥35 °C, Jun-Sep): ${fmt(s.heatDaysJunSep, 1)}.`,
    );
    lines.push(
      `  Extreme peak temperature Apr-Sep: ${fmt(s.extremeMaxAprSep, 1)} °C.`,
    );
    lines.push(
      `  Cool-night index ${fmt(s.coolNightSep, 1)} °C (mean Sept Tmin; ${coolNightVerdict(s.coolNightSep)}).`,
    );
    lines.push(`  Diurnal range Aug-Sep: ${fmt(m.dtrAugSep, 1)} °C ${dtrVerdict(m.dtrAugSep)}.`);
    lines.push(
      `  Spring frost (Tmin≤−2 °C, Mar-Apr, schema-aligned): ${fmt(s.springFrostT2MarApr, 1)} days.`,
    );
    lines.push(
      `  Flowering rain (May, approx for May 25-Jun 15 window): ${fmt(s.floweringRainMay, 0)} mm.`,
    );
  } else {
    lines.push(`  Heat-stress days (Tmax≥35 °C): ${fmt(m.heatDays, 1)} in growing season.`);
    lines.push(
      `  Cool-night index ~${fmt(m.coolNight, 1)} °C (Sept Tmin approx; ${coolNightVerdict(m.coolNight)}).`,
    );
    lines.push(`  Diurnal range Aug-Sep: ${fmt(m.dtrAugSep, 1)} °C ${dtrVerdict(m.dtrAugSep)}.`);
    lines.push(`  Spring frost: ${fmt(m.frostDays, 1)} days ≤0 °C Apr-May.`);
  }
  lines.push(`  Winter precipitation ${fmt(m.winRain, 0)} mm Oct(prev)-Mar.`);
  lines.push(`  Huglin index ~${fmt(m.huglin, 0)} (approx from GDD10+DTR).`);
  lines.push(`Overall: ${overallVerdict(m)}.`);
  return lines.join("\n");
}

function buildHistoricalNotes(
  yearClamped: boolean,
  requestedYear: number,
  maxYear: number,
  hasSchemaWindows: boolean,
  targetYear: number,
): string[] {
  const notes: string[] = [];
  if (yearClamped) {
    notes.push(
      `Requested vintage ${requestedYear} is beyond historical coverage (last year ${maxYear}); using ${maxYear} as nearest analogue.`,
    );
  }
  if (targetYear === 2025) {
    notes.push(
      "Vintage 2025 data sourced from NASA POWER (MERRA-2 reanalysis) instead of ERA5/Open-Meteo. Tmean bias vs ERA5 typically <0.5 °C over Bordeaux; sunshine synthesized from radiation with a calibrated factor (1.70 MJ/m² per equivalent sunshine hour).",
    );
  } else {
    notes.push(
      "Source: ERA5 reanalysis (DEM-downscaled per château). GST bias +0.11 °C, RMSE 0.48 °C, r=0.82 vs 6 Météo-France stations (188 station-years).",
    );
  }
  notes.push(
    "Aug-Sep diurnal range systematically under-estimated by ~2.3 °C (ERA5 boundary-layer mixing artefact); year-to-year ordering reliable (r=0.80) but absolute values run low.",
  );
  notes.push(
    "Harvest rain may be under-estimated ~14% vs station truth; treat thresholds with caution.",
  );
  if (hasSchemaWindows) {
    notes.push(
      "Schema-aligned windows derived from monthly aggregates: heat_days (Jun-Sep), spring_frost_events (Mar-Apr Tmin≤−2°C), cool_night_index (mean Sept Tmin), extreme_max_temperature (peak Tmax Apr-Sep), flowering_rain (May only — approximates May 25-Jun 15 window).",
    );
  } else {
    notes.push(
      "Monthly aggregates unavailable for this row; schema windows fall back to vintage-level proxies (heat_days Apr-Sep, spring_frost Apr-May ≤0°C, cool_night from GST−DTR/2).",
    );
  }
  return notes;
}

// ─── Forecast read ───────────────────────────────────────────────────

function forecastRead(regionName: string, input: WeatherInput): WeatherSignals {
  const rows = getForecastRows({ regionId: input.regionId, chateau: input.chateau });

  if (rows.length === 0) {
    if (input.chateau) {
      throw new Error(`Château not found in forecast dataset: ${input.chateau}`);
    }
    throw new Error(`No forecast rows for ${input.regionId}`);
  }

  const label = labelFor(regionName, input.chateau, rows);
  const nMembers = new Set(rows.map((r) => r.memberId)).size;
  const nChateau = new Set(rows.map((r) => r.chateau)).size;

  const stats = aggregateForecast(rows);
  const metrics = buildForecastMetrics(stats);
  const summary = formatForecastSummary(label, nChateau, nMembers, stats);
  const notes = buildForecastNotes();

  return { summary, metrics, notes };
}

interface ForecastAggregate {
  gst: AggregateStats;
  gdd10: AggregateStats;
  harvRain: AggregateStats;
  winRain: AggregateStats;
  heatDays: AggregateStats;
  frostDays: AggregateStats;
  dtrAugSep: AggregateStats;
  huglin: AggregateStats;
  coolNight: AggregateStats;
}

function aggregateForecast(rows: ForecastRow[]): ForecastAggregate {
  // For each metric, aggregate across all (château × member) rows. The
  // resulting distribution is the per-region ensemble spread.
  return {
    gst: aggregate(rows.map((r) => r.gst)),
    gdd10: aggregate(rows.map((r) => r.gdd10)),
    harvRain: aggregate(rows.map((r) => r.harvRain)),
    winRain: aggregate(rows.map((r) => r.winRain)),
    heatDays: aggregate(rows.map((r) => r.heatDays)),
    frostDays: aggregate(rows.map((r) => r.frostDays)),
    dtrAugSep: aggregate(rows.map((r) => r.dtrAugSep)),
    huglin: aggregate(rows.map((r) => huglinApprox(r.gdd10, r.dtrAugSep))),
    coolNight: aggregate(rows.map((r) => coolNightApprox(r.gst, r.dtrAugSep))),
  };
}

function buildForecastMetrics(s: ForecastAggregate): WeatherSignals["metrics"] {
  return [
    { name: "GST", value: round(s.gst.p50, 2), unit: "°C (median)" },
    { name: "GST_p5", value: round(s.gst.p5, 2), unit: "°C" },
    { name: "GST_p95", value: round(s.gst.p95, 2), unit: "°C" },
    { name: "harvest_rain", value: round(s.harvRain.p50, 0), unit: "mm (median)" },
    { name: "harvest_rain_p5", value: round(s.harvRain.p5, 0), unit: "mm" },
    { name: "harvest_rain_p95", value: round(s.harvRain.p95, 0), unit: "mm" },
    { name: "heat_days", value: round(s.heatDays.p50, 1), unit: "days ≥35°C (median)" },
    { name: "heat_days_p95", value: round(s.heatDays.p95, 1), unit: "days ≥35°C" },
    { name: "spring_frost_events", value: round(s.frostDays.p50, 1), unit: "days (median)" },
    { name: "winter_rain", value: round(s.winRain.p50, 0), unit: "mm (median)" },
    {
      name: "diurnal_temperature_range",
      value: round(s.dtrAugSep.p50, 2),
      unit: "°C (median)",
    },
    { name: "huglin_index", value: round(s.huglin.p50, 0), unit: "°C·day (approx, median)" },
    { name: "cool_night_index", value: round(s.coolNight.p50, 2), unit: "°C (approx, median)" },
  ];
}

function formatForecastSummary(
  label: string,
  nChateau: number,
  nMembers: number,
  s: ForecastAggregate,
): string {
  const lines: string[] = [];
  const ensemble =
    nChateau > 1
      ? `${nChateau} châteaux × ${nMembers} SEAS5 members`
      : `${nMembers} SEAS5 ensemble members`;
  lines.push(`Vintage 2026 forecast (${label}), ECMWF SEAS5, May initialization, ${ensemble}:`);
  lines.push(
    `  Growing-season temperature median ${fmt(s.gst.p50, 1)} °C (90% band ${fmt(s.gst.p5, 1)}–${fmt(s.gst.p95, 1)} °C); ${tempVerdict(s.gst.p50)}.`,
  );
  lines.push(
    `  Heat-stress days (Tmax≥35 °C) median ${fmt(s.heatDays.p50, 1)} (90% band ${fmt(s.heatDays.p5, 0)}–${fmt(s.heatDays.p95, 0)}).`,
  );
  lines.push(
    `  Harvest rain median ${fmt(s.harvRain.p50, 0)} mm Aug-Sep (90% band ${fmt(s.harvRain.p5, 0)}–${fmt(s.harvRain.p95, 0)} mm); ${rainVerdict(s.harvRain.p50)}.`,
  );
  lines.push(
    `  Diurnal range Aug-Sep median ${fmt(s.dtrAugSep.p50, 1)} °C (90% band ${fmt(s.dtrAugSep.p5, 1)}–${fmt(s.dtrAugSep.p95, 1)} °C).`,
  );
  lines.push(`  Spring frost: median ${fmt(s.frostDays.p50, 0)} days expected.`);
  lines.push(`  Winter precipitation median ${fmt(s.winRain.p50, 0)} mm.`);
  lines.push(
    `  Huglin index median ~${fmt(s.huglin.p50, 0)} (approx; warmth indicator).`,
  );
  lines.push(
    `Forecast skill caveat: SEAS5 hindcast r=0.52 (May T), near-zero (Jun-Aug T), r=0.44 (Sep T). Precip r ≈ 0 except Aug (r=0.52). Treat as a distribution, not a point prediction.`,
  );
  lines.push(`Overall: ${overallForecastVerdict(s)}.`);
  return lines.join("\n");
}

function buildForecastNotes(): string[] {
  const skill = loadSkill();
  const notes: string[] = [];
  notes.push("Source: ECMWF SEAS5 51-member ensemble, May 2026 initialization, leads 1-5 (May-Sep).");
  notes.push(
    "Per-château deltas (lapse + TPI + Gironde water-buffer) applied on top of stochastic 1995-2024 daily template; AOC means preserved exactly.",
  );
  if (skill) {
    const t = skill.t2m;
    notes.push(
      `SEAS5 2m-T skill (Bordeaux box, 1993-2016 hindcast, r): May=${t.lead_1?.r.toFixed(2)}, Jun=${t.lead_2?.r.toFixed(2)}, Jul=${t.lead_3?.r.toFixed(2)}, Aug=${t.lead_4?.r.toFixed(2)}, Sep=${t.lead_5?.r.toFixed(2)}.`,
    );
    notes.push(
      `SEAS5 precip skill r: Aug=${skill.precip.lead_4?.r.toFixed(2)} (best of all variables/leads); other leads r≈0.`,
    );
  }
  notes.push(
    "Honest framing: lead-1 (May) and lead-5 (Sep) carry meaningful T skill; peak summer is near-zero skill. Anyone reporting a single GST number is overselling.",
  );
  notes.push(
    "Multi-system ensemble (Météo-France/UKMO/DWD) would tighten the band ~20% — currently ECMWF only.",
  );
  return notes;
}

// ─── Labels & verdicts ────────────────────────────────────────────────

function labelFor(
  regionName: string,
  chateau: string | undefined,
  rows: ClimateRow[],
): string {
  if (chateau && rows.length > 0) {
    const first = rows[0]!;
    return `${first.chateau}, ${first.aoc}`;
  }
  return regionName;
}

function tempVerdict(gst: number): string {
  if (gst < 16) return "(cool)";
  if (gst < 17.5) return "(temperate)";
  if (gst < 19) return "(warm)";
  if (gst < 20.5) return "(hot)";
  return "(very hot — heat-stress regime)";
}

function rainVerdict(mm: number): string {
  if (mm < 60) return "(dry — favourable for ripening)";
  if (mm < 110) return "(moderate)";
  if (mm < 180) return "(wet — dilution / rot risk)";
  return "(very wet — significant rot/flood risk)";
}

function coolNightVerdict(t: number): string {
  if (t < 12) return "cold nights — strong acidity";
  if (t < 14) return "cool nights — good aromatic preservation";
  if (t < 16) return "mild nights";
  return "warm nights — softer acidity";
}

function dtrVerdict(d: number): string {
  if (d < 7) return "(narrow — softer aromatics)";
  if (d < 10) return "(typical)";
  return "(wide — good aromatic development)";
}

function overallVerdict(m: HistoricalAggregate): string {
  const warm = m.gst >= 18.5;
  const dry = m.harvRain < 80;
  const wet = m.harvRain >= 180;
  const cold = m.gst < 17;
  if (warm && dry) return "textbook warm-dry profile — strong vintage potential";
  if (warm && wet) return "warm but wet — dilution / rot risk dominates";
  if (cold && wet) return "cool and wet — challenging vintage profile";
  if (cold) return "cool growing season — slow ripening";
  return "balanced profile within the historical envelope";
}

function overallForecastVerdict(s: ForecastAggregate): string {
  const warm = s.gst.p50 >= 18.5;
  const dry = s.harvRain.p50 < 80;
  const wet = s.harvRain.p50 >= 180;
  if (warm && dry) return "model leans toward a warm, dry-harvest 2026, broadly favourable for quality";
  if (warm && wet) return "model leans warm with wet harvest — split outlook";
  if (wet) return "model leans wet at harvest — quality risk skewed downside";
  return "model leans balanced; wide ensemble spread";
}

// ─── Numeric helpers ──────────────────────────────────────────────────

function round(x: number, decimals: number): number {
  if (!Number.isFinite(x)) return 0;
  const m = 10 ** decimals;
  return Math.round(x * m) / m;
}

function fmt(x: number, decimals: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(decimals);
}
