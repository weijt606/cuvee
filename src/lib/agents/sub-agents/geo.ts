import "server-only";
import { findRegion } from "@/lib/wine/regions";
import { isDemoMode } from "@/lib/env";
import { demoGeoSignals } from "@/lib/demo/fixtures";
import {
  type Chateau,
  getChateauxInRegion,
  findChateauByName,
} from "@/lib/wine/chateaux";
import type { SubAgent } from "@/lib/agents/types";
import type { GeoSnapshot } from "@/lib/wine/types";

export interface GeoInput {
  regionId: string;
  /** Optional appellation filter (matched against CSV `aoc` column). */
  appellation?: string;
  /** Optional château name — if present, returns single-site profile. */
  chateau?: string;
}

/** GeoSignals === client-safe GeoSnapshot, re-exported here for agent-internal use. */
export type GeoSignals = GeoSnapshot;

/**
 * Resolves terroir context for left-bank Bordeaux from the 61-château
 * 1855-classed dataset:
 *   - elevation (Copernicus DEM)
 *   - distance to Gironde / Atlantic (hand-digitized centerline)
 *   - soil texture (SoilGrids, clay/sand/silt %)
 *   - Topographic Position Index (Bois 2020 — cold-air pooling predictor)
 *
 * Burgundy + right-bank fall through to the static region centroid only;
 * the 1855 dataset doesn't cover them.
 */
export const geoAgent: SubAgent<GeoInput, GeoSignals> = {
  name: "geo_agent",
  description:
    "Resolve geographical/terroir context for a wine region: elevation, soil texture (clay/sand/silt), distance to the Gironde estuary, and cold-air-pooling risk (TPI). Use to give weather signals a 'why' (frost pockets, gravel drainage, water-buffer effect on diurnal range). Pass an optional 'chateau' string when the user names a specific producer (e.g. 'Lafite', 'Latour') to get a single-site terroir profile instead of an AOC aggregate. No external API — reads bundled CSVs.",
  input_schema: {
    type: "object",
    properties: {
      regionId: {
        type: "string",
        description: "Region slug, e.g. 'bordeaux-medoc'.",
      },
      appellation: {
        type: "string",
        description: "Optional appellation filter (Pauillac, Margaux, etc.).",
      },
      chateau: {
        type: "string",
        description:
          "Optional château name. Partial matches accepted ('Lafite' → 'Château Lafite Rothschild').",
      },
    },
    required: ["regionId"],
  },
  async run(input, ctx) {
    const t0 = Date.now();
    // User intent (trade dashboard map click) wins over GPT routing — if
    // ctx.chateau was set by the orchestrator, force single-site mode.
    const chateau = ctx.chateau ?? input.chateau;
    if (isDemoMode) {
      return {
        agent: "geo_agent",
        ok: true,
        durationMs: 0,
        data: demoGeoSignals(input.regionId, chateau),
        summary: chateau ? `demo · ${chateau}` : "demo · terroir fixture",
      };
    }

    const region = findRegion(input.regionId);
    if (!region) {
      return {
        agent: "geo_agent",
        ok: false,
        error: `Unknown regionId: ${input.regionId}`,
        durationMs: Date.now() - t0,
      };
    }

    // Single-château path: short-circuit if either user (ctx.chateau) or
    // GPT (input.chateau) names one.
    if (chateau) {
      const ch = findChateauByName(chateau);
      if (!ch) {
        return {
          agent: "geo_agent",
          ok: false,
          error: `Château not found in 1855 dataset: ${chateau}`,
          durationMs: Date.now() - t0,
        };
      }
      return {
        agent: "geo_agent",
        ok: true,
        durationMs: Date.now() - t0,
        data: profileSingleChateau(ch, region.centroid),
        summary: `${ch.name} · ${ch.aoc} · ${describeFrostExposure(ch.tpiM)}`,
      };
    }

    let chateaux = getChateauxInRegion(input.regionId);
    if (input.appellation) {
      const filter = input.appellation.toLowerCase();
      chateaux = chateaux.filter((c) => c.aoc.toLowerCase() === filter);
    }

    // Burgundy / right-bank fall here — no 1855 coverage. Degrade gracefully.
    if (chateaux.length === 0) {
      return {
        agent: "geo_agent",
        ok: true,
        durationMs: Date.now() - t0,
        data: {
          summary: `${region.name}: no 1855-classed coverage in dataset`,
          centroid: region.centroid,
          appellations: region.appellations ?? [],
          notes: [
            `Static centroid only (lat ${region.centroid.lat.toFixed(2)}, lng ${region.centroid.lng.toFixed(2)}).`,
            `Per-château terroir profiles are limited to left-bank 1855 classed growths.`,
          ],
        },
        summary: "centroid only · no 1855 coverage",
      };
    }

    const data = aggregateRegion(region.name, chateaux);
    return {
      agent: "geo_agent",
      ok: true,
      durationMs: Date.now() - t0,
      data,
      summary: data.summary,
    };
  },
};

// ─── Profiles ─────────────────────────────────────────────────────────

function profileSingleChateau(
  ch: Chateau,
  fallbackCentroid: { lat: number; lng: number },
): GeoSignals {
  const lat = Number.isFinite(ch.lat) ? ch.lat : fallbackCentroid.lat;
  const lng = Number.isFinite(ch.lon) ? ch.lon : fallbackCentroid.lng;

  const notes: string[] = [];
  if (ch.elevationM !== null) {
    notes.push(`Elevation ${ch.elevationM.toFixed(0)} m above sea level.`);
  }
  if (ch.distGirondeKm !== null) {
    notes.push(
      `${ch.distGirondeKm.toFixed(1)} km from the Gironde estuary — ${describeWaterBuffer(ch.distGirondeKm)}.`,
    );
  }
  if (ch.distAtlanticKm !== null) {
    notes.push(`${ch.distAtlanticKm.toFixed(0)} km from the Atlantic.`);
  }
  if (ch.tpiM !== null) {
    notes.push(
      `TPI ${ch.tpiM >= 0 ? "+" : ""}${ch.tpiM.toFixed(1)} m — ${describeFrostExposure(ch.tpiM)}.`,
    );
  }
  if (ch.slopePct !== null) {
    notes.push(
      `Slope ${ch.slopePct.toFixed(1)}%${ch.aspect ? `, ${ch.aspect}-facing` : ""} — ${describeSlope(ch.slopePct, ch.aspect)}.`,
    );
  }
  if (ch.localReliefM !== null) {
    notes.push(`Local relief ${ch.localReliefM.toFixed(0)} m (300 m neighborhood).`);
  }
  const soil = describeSoil(ch.soilClayPct, ch.soilSandPct, ch.soilSiltPct);
  if (soil) notes.push(soil);

  return {
    summary: `${ch.name} (${ch.growth}, ${ch.aoc}) — ${describeFrostExposure(ch.tpiM)}, ${describeWaterBuffer(ch.distGirondeKm)}.`,
    centroid: { lat, lng },
    appellations: [ch.aoc],
    notes,
  };
}

function aggregateRegion(regionName: string, chateaux: Chateau[]): GeoSignals {
  const elevs = pickFinite(chateaux.map((c) => c.elevationM));
  const dists = pickFinite(chateaux.map((c) => c.distGirondeKm));
  const tpis = pickFinite(chateaux.map((c) => c.tpiM));
  const clay = pickFinite(chateaux.map((c) => c.soilClayPct));
  const sand = pickFinite(chateaux.map((c) => c.soilSandPct));

  const frostPockets = chateaux.filter((c) => c.tpiM !== null && c.tpiM < -2);
  const ridges = chateaux.filter((c) => c.tpiM !== null && c.tpiM > 2);
  const slopes = pickFinite(chateaux.map((c) => c.slopePct));
  const aspectCounts = countAspects(chateaux);

  const aocCounts = new Map<string, number>();
  for (const c of chateaux) aocCounts.set(c.aoc, (aocCounts.get(c.aoc) ?? 0) + 1);
  const aocBreakdown = Array.from(aocCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([a, n]) => `${a} (${n})`);

  const meanLat = mean(chateaux.map((c) => c.lat));
  const meanLng = mean(chateaux.map((c) => c.lon));

  const notes: string[] = [];
  if (elevs.length) {
    notes.push(
      `Elevation: ${elevs.mean.toFixed(0)} m mean (range ${elevs.min.toFixed(0)}–${elevs.max.toFixed(0)} m). Classed growths cluster on gravel croupes 7–24 m above the estuary.`,
    );
  }
  if (dists.length) {
    notes.push(
      `Distance to Gironde: ${dists.mean.toFixed(1)} km mean (range ${dists.min.toFixed(1)}–${dists.max.toFixed(1)} km). Closer sites get a stronger water-buffer on diurnal range.`,
    );
  }
  if (tpis.length) {
    notes.push(
      `Topographic Position Index: mean ${tpis.mean.toFixed(1)} m. ${frostPockets.length} château(x) sit in cold-air pockets (TPI < −2 m) — elevated spring-frost risk. ${ridges.length} sit on pronounced ridges (TPI > +2 m).`,
    );
  }
  if (slopes.length) {
    const dominant = dominantAspect(aspectCounts);
    notes.push(
      `Slope: mean ${slopes.mean.toFixed(1)}% (max ${slopes.max.toFixed(1)}%). ${describeAspectMix(aspectCounts, dominant)}`,
    );
  }
  if (clay.length && sand.length) {
    notes.push(
      `Soil texture: mean clay ${clay.mean.toFixed(0)}% / sand ${sand.mean.toFixed(0)}%. ${describeSoilRegime(clay.mean, sand.mean)}.`,
    );
  }
  notes.push(`AOC mix: ${aocBreakdown.join(", ")}.`);
  if (frostPockets.length > 0 && frostPockets.length <= 4) {
    notes.push(
      `Frost-pocket châteaux: ${frostPockets.map((c) => c.name.replace(/^Château /, "")).join(", ")}.`,
    );
  }

  return {
    summary: `${regionName}: ${chateaux.length} classed growths across ${aocCounts.size} AOC${aocCounts.size > 1 ? "s" : ""}; ${frostPockets.length} frost-pocket sites; mean elevation ${elevs.mean ? elevs.mean.toFixed(0) : "?"} m.`,
    centroid: { lat: meanLat, lng: meanLng },
    appellations: Array.from(aocCounts.keys()),
    notes,
  };
}

// ─── Phrase helpers ────────────────────────────────────────────────────

function describeSlope(slopePct: number, aspect: Chateau["aspect"]): string {
  if (slopePct < 0.5) return "essentially flat — aspect not meaningful";
  const sunny = aspect === "S" || aspect === "SE" || aspect === "SW";
  const cool = aspect === "N" || aspect === "NE" || aspect === "NW";
  const intensity = slopePct < 1 ? "mild" : slopePct < 2 ? "moderate" : "pronounced";
  if (sunny) return `${intensity} slope, sun-exposed face — strong ripening, heat-stress sensitivity in hot years`;
  if (cool) return `${intensity} slope, cool-facing — slower ripening, preserves acidity in warm vintages`;
  if (aspect === "E") return `${intensity} slope, morning-sun face — lower afternoon heat stress`;
  if (aspect === "W") return `${intensity} slope, afternoon-sun face — elevated heat-stress exposure`;
  return `${intensity} slope`;
}

function countAspects(chateaux: Chateau[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of chateaux) {
    if (c.aspect) m.set(c.aspect, (m.get(c.aspect) ?? 0) + 1);
  }
  return m;
}

function dominantAspect(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const [k, v] of counts) {
    if (v > bestN) {
      best = k;
      bestN = v;
    }
  }
  return best;
}

function describeAspectMix(counts: Map<string, number>, dominant: string | null): string {
  if (counts.size === 0) return "Most sites essentially flat (no meaningful aspect).";
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  const sunny = ["S", "SE", "SW"].reduce((acc, k) => acc + (counts.get(k) ?? 0), 0);
  const cool = ["N", "NE", "NW"].reduce((acc, k) => acc + (counts.get(k) ?? 0), 0);
  const parts: string[] = [];
  parts.push(`${total} site${total > 1 ? "s" : ""} with measurable slope`);
  if (dominant) parts.push(`dominant aspect ${dominant}`);
  if (sunny > 0) parts.push(`${sunny} sun-exposed (S/SE/SW)`);
  if (cool > 0) parts.push(`${cool} cool-facing (N/NE/NW)`);
  return parts.join(", ") + ".";
}

function describeFrostExposure(tpi: number | null): string {
  if (tpi === null) return "frost exposure unknown";
  if (tpi < -2) return "cold-air pocket (elevated frost risk)";
  if (tpi < -0.5) return "mild cold-air drainage";
  if (tpi > 2) return "ridge site (good cold-air drainage)";
  return "neutral topographic position";
}

function describeWaterBuffer(distKm: number | null): string {
  if (distKm === null) return "water-buffer unknown";
  if (distKm < 3) return "strong Gironde water-buffer (compressed diurnal range)";
  if (distKm < 7) return "moderate water-buffer";
  return "weak water-buffer (continental diurnal swings)";
}

function describeSoil(
  clay: number | null,
  sand: number | null,
  silt: number | null,
): string | null {
  if (clay === null || sand === null || silt === null) return null;
  return `Soil: ${clay.toFixed(0)}% clay / ${sand.toFixed(0)}% sand / ${silt.toFixed(0)}% silt — ${describeSoilRegime(clay, sand)}.`;
}

function describeSoilRegime(clayMean: number, sandMean: number): string {
  if (sandMean > 35 && clayMean < 30) return "gravel/sandy regime, strong drainage";
  if (clayMean > 35) return "clay-dominated, good water retention but slow drainage";
  return "balanced loam";
}

// ─── Numeric helpers ──────────────────────────────────────────────────

function pickFinite(xs: Array<number | null>): {
  values: number[];
  mean: number;
  min: number;
  max: number;
  length: number;
} {
  const values = xs.filter((x): x is number => x !== null && Number.isFinite(x));
  if (values.length === 0) {
    return { values: [], mean: 0, min: 0, max: 0, length: 0 };
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    values,
    mean: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    length: values.length,
  };
}

function mean(xs: number[]): number {
  const finite = xs.filter((x) => Number.isFinite(x));
  if (finite.length === 0) return 0;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}
