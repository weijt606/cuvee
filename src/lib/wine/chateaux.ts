import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 1855-classed Bordeaux châteaux dataset loader.
 *
 * Source: `data/{chateaux,static_geo,microtopo}.csv` — 61 left-bank classed
 * growths joined on château name. All three files share the same row order
 * but we key on name to be safe.
 *
 * Data prep happens upstream (see wine-terroir/scripts/*.py); this module
 * only loads + joins + groups. Lazy-load on first call so module init stays
 * cheap and tests can mock the FS layer if they want to.
 */

export interface Chateau {
  name: string;
  growth: string;
  growthNum: number;
  aoc: string;
  bank: "Left" | "Right";
  commune: string;
  lat: number;
  lon: number;
  elevationM: number | null;
  distGirondeKm: number | null;
  distAtlanticKm: number | null;
  soilClayPct: number | null;
  soilSandPct: number | null;
  soilSiltPct: number | null;
  /**
   * Topographic Position Index (m): positive = ridge/croupe, negative =
   * cold-air pocket. Bois et al. 2020 — the dominant predictor of within-AOC
   * frost risk.
   */
  tpiM: number | null;
  /** Max minus min elevation over the 9-point 300 m neighborhood. */
  localReliefM: number | null;
  /**
   * Slope magnitude in %, derived via Horn (1981) finite-difference method
   * over the 9-point 300 m neighborhood. Bordeaux range: 0.1–3%.
   */
  slopePct: number | null;
  /**
   * 8-way compass bearing of the downhill direction (the direction the
   * slope FACES). `null` when slope < 0.5% — aspect is not meaningful on
   * essentially flat ground.
   */
  aspect: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | null;
}

/**
 * Maps the project's region ids (used in AnalyzeInput.region.id) to the AOC
 * strings present in `chateaux.csv`. The 1855 dataset only covers left-bank
 * Médoc + the single Premier Cru in Pessac-Léognan (Haut-Brion).
 */
const REGION_TO_AOCS: Record<string, string[]> = {
  "bordeaux-medoc": ["Pauillac", "Saint-Estèphe", "Saint-Julien", "Margaux", "Haut-Médoc"],
  "bordeaux-graves": ["Pessac-Léognan"],
};

let _all: Chateau[] | null = null;

export function loadChateaux(): Chateau[] {
  if (_all !== null) return _all;
  let loaded: Chateau[] = [];
  try {
    const root = process.cwd();
    const baseRows = parseCsv(readFileSync(path.join(root, "data/chateaux.csv"), "utf-8"));
    const geoRows = parseCsv(readFileSync(path.join(root, "data/static_geo.csv"), "utf-8"));
    const microRows = parseCsv(readFileSync(path.join(root, "data/microtopo.csv"), "utf-8"));

    const geoByName = indexBy(geoRows, "chateau");
    const microByName = indexBy(microRows, "chateau");

    loaded = baseRows.map((b) => {
      const g = geoByName.get(b.name ?? "") ?? {};
      const m = microByName.get(b.name ?? "") ?? {};
      const slopeAspect = computeSlopeAspect(m);
      return {
        name: b.name ?? "",
        growth: b.growth ?? "",
        growthNum: numOrNaN(b.growth_num),
        aoc: b.aoc ?? "",
        bank: b.bank === "Right" ? "Right" : "Left",
        commune: b.commune ?? "",
        lat: numOrNaN(b.lat),
        lon: numOrNaN(b.lon),
        elevationM: optNum(g.elevation_m),
        distGirondeKm: optNum(g.dist_gironde_km),
        distAtlanticKm: optNum(g.dist_atlantic_km),
        soilClayPct: optNum(g.soil_clay_pct),
        soilSandPct: optNum(g.soil_sand_pct),
        soilSiltPct: optNum(g.soil_silt_pct),
        tpiM: optNum(m.TPI_m),
        localReliefM: optNum(m.local_relief_m),
        slopePct: slopeAspect.slopePct,
        aspect: slopeAspect.aspect,
      } satisfies Chateau;
    });
  } catch (err) {
    console.warn("[chateaux] failed to load CSVs:", err);
  }
  _all = loaded;
  return _all;
}

export function getChateauxInRegion(regionId: string): Chateau[] {
  const aocs = REGION_TO_AOCS[regionId];
  if (!aocs) return [];
  const set = new Set(aocs);
  return loadChateaux().filter((c) => set.has(c.aoc));
}

export function findChateauByName(query: string): Chateau | undefined {
  const q = normalize(query);
  return loadChateaux().find((c) => normalize(c.name) === q || normalize(c.name).includes(q));
}

// ─── CSV / utility internals ───────────────────────────────────────────

type Row = Record<string, string>;

/**
 * Minimal CSV parser. Handles the one wrinkle in our files: quoted fields
 * that contain commas (only `geocoder_match` in `chateaux.csv`). No newlines
 * inside fields; no escaped quotes.
 */
function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headerLine = lines[0];
  if (!headerLine) return [];
  const header = splitCsvLine(headerLine);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = splitCsvLine(line);
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

function indexBy(rows: Row[], key: string): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const r of rows) {
    const k = r[key];
    if (k !== undefined && k !== "") m.set(k, r);
  }
  return m;
}

/**
 * Horn (1981) finite-difference slope + aspect from the 9-point grid.
 * Grid spacing is 300 m (per wine-terroir/scripts/fetch_microtopography.py).
 *
 * Aspect is the compass bearing of the *downhill* direction (the direction
 * the slope FACES), bucketed to 8 cardinals. Below 0.5% slope we return
 * `null` for aspect — direction is meaningless on flat ground.
 */
function computeSlopeAspect(m: Row): {
  slopePct: number | null;
  aspect: Chateau["aspect"];
} {
  const nw = optNum(m.z_NW);
  const n = optNum(m.z_N);
  const ne = optNum(m.z_NE);
  const w = optNum(m.z_W);
  const e = optNum(m.z_E);
  const sw = optNum(m.z_SW);
  const s = optNum(m.z_S);
  const se = optNum(m.z_SE);
  if (
    nw === null ||
    n === null ||
    ne === null ||
    w === null ||
    e === null ||
    sw === null ||
    s === null ||
    se === null
  ) {
    return { slopePct: null, aspect: null };
  }
  const d = 300;
  const dzdx = (ne + 2 * e + se - (nw + 2 * w + sw)) / (8 * d);
  const dzdy = (nw + 2 * n + ne - (sw + 2 * s + se)) / (8 * d);
  const slopePct = Math.hypot(dzdx, dzdy) * 100;
  if (slopePct < 0.5) return { slopePct, aspect: null };

  // Compass bearing of downhill direction. atan2 of (east-component, north-component).
  let bearing = (Math.atan2(-dzdx, -dzdy) * 180) / Math.PI;
  if (bearing < 0) bearing += 360;
  return { slopePct, aspect: bearingTo8Way(bearing) };
}

function bearingTo8Way(deg: number): Chateau["aspect"] {
  const labels: Array<Chateau["aspect"]> = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(deg / 45) % 8;
  return labels[idx] ?? null;
}

function optNum(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function numOrNaN(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}
