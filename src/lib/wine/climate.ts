import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Climate data loader — historical vintage features (1990-2024) +
 * 2026 SEAS5 ensemble forecast + skill / validation metadata.
 *
 * Source: `data/climate_features_downscaled.csv` (61 château × 35 yr,
 * DEM-downscaled ERA5), `data/climate_features_forecast_2026.csv`
 * (61 × 51 ensemble members, ECMWF SEAS5 May init), and the two skill
 * JSONs. Prep is done upstream in wine-terroir/scripts/*.py; this
 * module only reads + filters + aggregates.
 */

export interface ClimateRow {
  chateau: string;
  aoc: string;
  growthNum: number;
  lat: number;
  lon: number;
  year: number;
  /** Growing-season Tmean (Apr-Sep), °C. */
  gst: number;
  /** Growing degree days base 10 (Apr-Oct sum), °C·day. */
  gdd10: number;
  /** Aug-Sep precipitation sum, mm. */
  harvRain: number;
  /** Oct(prev)–Mar precipitation sum, mm. */
  winRain: number;
  /** Apr-Sep sunshine duration, hours. */
  sunHours: number;
  /** Count of days with Tmax ≥ 35°C (Apr-Sep). */
  heatDays: number;
  /** Count of days with Tmin ≤ 0°C (Apr-May) — note schema wants Mar-Apr T<−2. */
  frostDays: number;
  /** Mean(Tmax−Tmin) Aug-Sep, °C. */
  dtrAugSep: number;
  /** Apr-Sep shortwave radiation sum, MJ/m². */
  radiationMJ: number;
}

export interface ForecastRow extends ClimateRow {
  centre: string;
  system: string;
  memberId: number;
  templateYear: number;
}

export interface MonthlyRow {
  chateau: string;
  aoc: string;
  year: number;
  month: number;
  /** Monthly mean of daily Tmean, °C. */
  tmean: number;
  /** Monthly mean of daily Tmin, °C. */
  tminMean: number;
  /** Monthly mean of daily Tmax, °C. */
  tmaxMean: number;
  /** Monthly extremes — peak Tmax and lowest Tmin. */
  tmaxMax: number;
  tminMin: number;
  /** Monthly precipitation sum, mm. */
  precipSum: number;
  /** Monthly sunshine duration sum, hours. */
  sunHours: number;
  /** Monthly shortwave radiation sum, MJ/m². */
  radiationMJ: number;
  /** Monthly mean diurnal range, °C. */
  dtrMean: number;
  /** Count of days with Tmax ≥ 35 °C in the month. */
  heatDays35: number;
  /** Count of days with Tmin ≤ 0 °C in the month. */
  frostDays0: number;
  /** Count of days with Tmin ≤ −2 °C in the month (schema-aligned threshold). */
  frostDaysM2: number;
}

export interface SkillEntry {
  targetMonth: number;
  n: number;
  r: number;
  bias: number;
  rmse: number;
  ensSpread: number;
}

export type SkillByLead = Record<string, SkillEntry>;
export interface ForecastSkill {
  /** Pearson r, bias, RMSE for SEAS5 ensemble mean vs ERA5 truth (Bordeaux box, 1993-2016 hindcast). */
  t2m: SkillByLead;
  tmax: SkillByLead;
  tmin: SkillByLead;
  precip: SkillByLead;
}

/** Maps the project's region ids to AOCs present in the climate CSVs. */
const REGION_TO_AOCS: Record<string, string[]> = {
  "bordeaux-medoc": ["Pauillac", "Saint-Estèphe", "Saint-Julien", "Margaux", "Haut-Médoc"],
  "bordeaux-graves": ["Pessac-Léognan"],
};

let _historical: ClimateRow[] | null = null;
let _forecast: ForecastRow[] | null = null;
let _skill: ForecastSkill | null = null;
let _monthly: MonthlyRow[] | null = null;

export function loadHistorical(): ClimateRow[] {
  if (_historical !== null) return _historical;
  try {
    const text = readFileSync(
      path.join(process.cwd(), "data/climate_features_downscaled.csv"),
      "utf-8",
    );
    _historical = parseCsv(text).map(parseClimateRow);
  } catch (err) {
    console.warn("[climate] failed to load historical:", err);
    _historical = [];
  }
  return _historical;
}

export function loadForecast(): ForecastRow[] {
  if (_forecast !== null) return _forecast;
  try {
    const text = readFileSync(
      path.join(process.cwd(), "data/climate_features_forecast_2026.csv"),
      "utf-8",
    );
    _forecast = parseCsv(text).map(parseForecastRow);
  } catch (err) {
    console.warn("[climate] failed to load forecast:", err);
    _forecast = [];
  }
  return _forecast;
}

export function loadMonthly(): MonthlyRow[] {
  if (_monthly !== null) return _monthly;
  try {
    const text = readFileSync(path.join(process.cwd(), "data/climate_monthly.csv"), "utf-8");
    _monthly = parseCsv(text).map(parseMonthlyRow);
  } catch (err) {
    console.warn("[climate] failed to load monthly:", err);
    _monthly = [];
  }
  return _monthly;
}

/**
 * Filter monthly rows for a vintage year's growing+harvest+winter window.
 * Returns rows for months Mar(year)..Dec(year) plus Oct..Dec(year-1) so the
 * caller can compute winter rain (Oct-Mar previous-year carryover).
 */
export function getMonthlyRows(opts: {
  regionId: string;
  year: number;
  chateau?: string;
}): MonthlyRow[] {
  const all = loadMonthly();
  const aocs = new Set(aocsForRegion(opts.regionId));
  let rows = all.filter(
    (r) =>
      aocs.has(r.aoc) &&
      ((r.year === opts.year) ||
        (r.year === opts.year - 1 && r.month >= 10)),
  );
  if (opts.chateau) {
    const q = normalize(opts.chateau);
    rows = rows.filter((r) => {
      const n = normalize(r.chateau);
      return n === q || n.includes(q);
    });
  }
  return rows;
}

export function loadSkill(): ForecastSkill | null {
  if (_skill !== null) return _skill;
  try {
    const text = readFileSync(path.join(process.cwd(), "data/forecast_skill.json"), "utf-8");
    const raw = JSON.parse(text);
    // Structure: centre → system → variable → lead_N → {...}
    const node = raw?.ecmwf?.["51"];
    if (!node) return null;
    _skill = {
      t2m: parseSkillByLead(node["2m_temperature"]),
      tmax: parseSkillByLead(node["maximum_2m_temperature_in_the_last_24_hours"]),
      tmin: parseSkillByLead(node["minimum_2m_temperature_in_the_last_24_hours"]),
      precip: parseSkillByLead(node["total_precipitation"]),
    };
  } catch (err) {
    console.warn("[climate] failed to load skill:", err);
    _skill = null;
  }
  return _skill;
}

/** Resolve a regionId to the list of AOCs we have climate coverage for. */
export function aocsForRegion(regionId: string): string[] {
  return REGION_TO_AOCS[regionId] ?? [];
}

/** Has any climate coverage for this region? */
export function hasClimateCoverage(regionId: string): boolean {
  return aocsForRegion(regionId).length > 0;
}

/**
 * Filter historical rows for a specific AOC set + year. If `chateau` is
 * provided, returns at most one row.
 */
export function getHistoricalRows(opts: {
  regionId: string;
  year: number;
  chateau?: string;
}): ClimateRow[] {
  const all = loadHistorical();
  const aocs = new Set(aocsForRegion(opts.regionId));
  let rows = all.filter((r) => r.year === opts.year && aocs.has(r.aoc));
  if (opts.chateau) {
    const q = normalize(opts.chateau);
    rows = rows.filter((r) => {
      const n = normalize(r.chateau);
      return n === q || n.includes(q);
    });
  }
  return rows;
}

/**
 * Filter forecast rows for an AOC set. Returns one row per
 * (château × ensemble member).
 */
export function getForecastRows(opts: { regionId: string; chateau?: string }): ForecastRow[] {
  const all = loadForecast();
  const aocs = new Set(aocsForRegion(opts.regionId));
  let rows = all.filter((r) => aocs.has(r.aoc));
  if (opts.chateau) {
    const q = normalize(opts.chateau);
    rows = rows.filter((r) => {
      const n = normalize(r.chateau);
      return n === q || n.includes(q);
    });
  }
  return rows;
}

/** Highest historical year we cover. Used to clamp gap requests (2025). */
export function maxHistoricalYear(): number {
  const all = loadHistorical();
  let max = 0;
  for (const r of all) if (r.year > max) max = r.year;
  return max;
}

// ─── Aggregation helpers ──────────────────────────────────────────────

export interface AggregateStats {
  mean: number;
  p5: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
  n: number;
}

export function aggregate(values: number[]): AggregateStats {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return { mean: 0, p5: 0, p50: 0, p95: 0, min: 0, max: 0, n: 0 };
  const sum = xs.reduce((a, b) => a + b, 0);
  return {
    mean: sum / xs.length,
    p5: percentile(xs, 0.05),
    p50: percentile(xs, 0.5),
    p95: percentile(xs, 0.95),
    min: xs[0]!,
    max: xs[xs.length - 1]!,
    n: xs.length,
  };
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const w = idx - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

// ─── Derived schema features ─────────────────────────────────────────

/**
 * Approximate Huglin Index (warmth metric used in the wine-vintage-
 * quality-schema) from GDD10 and DTR.
 *
 * Huglin = K_lat × Σ ((Tmean−10) + (Tmax−10)) / 2 over Apr-Sep.
 * Tmax = Tmean + DTR/2, so the second sum ≈ GDD10 + n × DTR/2.
 * With n=183 (Apr-Sep) and K_lat=1.02 at 45°N:
 *   Huglin ≈ 1.02 × (GDD10 + 45.75 × DTR_growing).
 * We have DTR Aug-Sep only — used as proxy for the growing-season mean.
 */
export function huglinApprox(gdd10: number, dtrAugSep: number): number {
  return 1.02 * (gdd10 + 45.75 * dtrAugSep);
}

/**
 * Approximate Cool Night Index (mean Tmin in September, °C). The
 * schema's flagship metric for aromatic preservation in cool nights.
 * Aug-Sep mean Tmin = GST − DTR/2 (rearranged from Tmean = (Tmax+Tmin)/2,
 * DTR = Tmax−Tmin). Using Aug-Sep Tmin as proxy for Sept-only.
 */
export function coolNightApprox(gst: number, dtrAugSep: number): number {
  return gst - dtrAugSep / 2;
}

/** Penman approximation PET (mm) from shortwave radiation. */
export function pETApprox(radiationMJ: number): number {
  return radiationMJ / 2.45;
}

// ─── CSV parsing ──────────────────────────────────────────────────────

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]!);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const row: Row = {};
    header.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out;
}

function parseClimateRow(r: Row): ClimateRow {
  return {
    chateau: r.chateau ?? "",
    aoc: r.aoc ?? "",
    growthNum: num(r.growth_num),
    lat: num(r.lat),
    lon: num(r.lon),
    year: num(r.year),
    gst: num(r.GST),
    gdd10: num(r.GDD10),
    harvRain: num(r.harv_rain),
    winRain: num(r.win_rain),
    sunHours: num(r.sun_hours),
    heatDays: num(r.heat_days),
    frostDays: num(r.frost_days),
    dtrAugSep: num(r.dtr_aug_sep),
    radiationMJ: num(r.radiation_MJ),
  };
}

function parseMonthlyRow(r: Row): MonthlyRow {
  return {
    chateau: r.chateau ?? "",
    aoc: r.aoc ?? "",
    year: num(r.year),
    month: num(r.month),
    tmean: num(r.tmean),
    tmaxMean: num(r.tmax_mean),
    tminMean: num(r.tmin_mean),
    tmaxMax: num(r.tmax_max),
    tminMin: num(r.tmin_min),
    precipSum: num(r.precip_sum),
    sunHours: num(r.sun_hours),
    radiationMJ: num(r.radiation_MJ),
    dtrMean: num(r.dtr_mean),
    heatDays35: num(r.heat_days_35),
    frostDays0: num(r.frost_days_0),
    frostDaysM2: num(r.frost_days_m2),
  };
}

function parseForecastRow(r: Row): ForecastRow {
  return {
    ...parseClimateRow(r),
    centre: r.centre ?? "",
    system: r.system ?? "",
    memberId: num(r.member_id),
    templateYear: num(r.template_year),
  };
}

function parseSkillByLead(node: unknown): SkillByLead {
  const out: SkillByLead = {};
  if (!node || typeof node !== "object") return out;
  for (const [lead, raw] of Object.entries(node as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    out[lead] = {
      targetMonth: typeof r.target_month === "number" ? r.target_month : 0,
      n: typeof r.n === "number" ? r.n : 0,
      r: typeof r.r === "number" ? r.r : 0,
      bias: typeof r.bias === "number" ? r.bias : 0,
      rmse: typeof r.rmse === "number" ? r.rmse : 0,
      ensSpread: typeof r.ens_spread === "number" ? r.ens_spread : 0,
    };
  }
  return out;
}

function num(v: string | undefined): number {
  if (v === undefined || v === "") return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
