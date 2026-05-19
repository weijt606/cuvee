import "server-only";
import type { AnalyzeInput, AnalyzeResult } from "@/lib/wine/types";
import { bandOf } from "@/lib/wine/types";
import type { GeoSignals } from "@/lib/agents/sub-agents/geo";
import type { WeatherSignals } from "@/lib/agents/sub-agents/weather";

/**
 * Demo fixtures — deterministic responses for NEXT_PUBLIC_DEMO_MODE=true.
 * Used for offline rehearsal and to save credits during dev. Every new
 * sponsor / sub-agent call should add a fixture branch here (H3).
 */

export function demoWeatherSignals(regionId: string, chateau?: string): WeatherSignals {
  // Numbers borrowed from climate_features_downscaled.csv — Lafite 2010
  // (a reference warm-dry Bordeaux vintage) so the fixture is physically
  // self-consistent rather than synthetic.
  if (chateau) {
    return {
      summary: [
        `Vintage 2010 climate (${chateau}, Pauillac):`,
        "  Growing-season temperature 18.6 °C (warm).",
        "  Growing degree days base 10: 1742 °C·day.",
        "  Harvest rain 67 mm Aug-Sep (dry — favourable for ripening).",
        "  Heat-stress days (Tmax≥35 °C): 4 in growing season.",
        "  Cool-night index ~13.2 °C (Sept Tmin approx; preserves acidity).",
        "  Diurnal range Aug-Sep: 10.5 °C (wide — good aromatic development).",
        "  Spring frost: 0 days ≤0 °C Apr-May.",
        "  Winter precipitation 543 mm Oct(prev)-Mar.",
        "  Huglin index ~2210 (approx).",
        "Overall: textbook warm-dry profile — strong vintage potential.",
      ].join("\n"),
      metrics: [
        { name: "GST", value: 18.6, unit: "°C" },
        { name: "GDD10", value: 1742, unit: "°C·day" },
        { name: "harvest_rain", value: 67, unit: "mm" },
        { name: "winter_rain", value: 543, unit: "mm" },
        { name: "heat_days", value: 4, unit: "days ≥35°C" },
        { name: "spring_frost_events", value: 0, unit: "days ≤0°C" },
        { name: "diurnal_temperature_range", value: 10.5, unit: "°C" },
        { name: "huglin_index", value: 2210, unit: "°C·day (approx)" },
        { name: "cool_night_index", value: 13.2, unit: "°C (approx)" },
      ],
      notes: [
        "Demo fixture — Lafite Rothschild vintage 2010 historical reference.",
        "ERA5 DEM-downscaled per château; bias +0.11 °C, RMSE 0.48 °C vs Météo-France stations.",
      ],
    };
  }
  if (regionId === "bordeaux-medoc") {
    return {
      summary: [
        "Vintage 2010 climate (Médoc, 60 châteaux mean):",
        "  Growing-season temperature 18.4 °C (warm).",
        "  Growing degree days base 10: 1718 °C·day.",
        "  Harvest rain 72 mm Aug-Sep (dry — favourable).",
        "  Heat-stress days (Tmax≥35 °C): 3.6 mean.",
        "  Cool-night index ~13.0 °C (preserves acidity).",
        "  Diurnal range Aug-Sep: 10.4 °C (wide — good aromatic development).",
        "  Spring frost: 0.1 days.",
        "  Winter precipitation 528 mm.",
        "  Huglin index ~2190 (approx).",
        "Overall: textbook warm-dry profile — strong vintage potential.",
      ].join("\n"),
      metrics: [
        { name: "GST", value: 18.4, unit: "°C" },
        { name: "harvest_rain", value: 72, unit: "mm" },
        { name: "winter_rain", value: 528, unit: "mm" },
        { name: "heat_days", value: 3.6, unit: "days ≥35°C" },
        { name: "spring_frost_events", value: 0.1, unit: "days ≤0°C" },
        { name: "diurnal_temperature_range", value: 10.4, unit: "°C" },
        { name: "huglin_index", value: 2190, unit: "°C·day (approx)" },
        { name: "cool_night_index", value: 13.0, unit: "°C (approx)" },
      ],
      notes: [
        "Demo fixture — Médoc 2010 vintage, 60-château AOC-mean aggregate.",
        "Source: ERA5 DEM-downscaled; year-to-year ordering reliable (r=0.82 vs station truth).",
      ],
    };
  }
  if (regionId === "bordeaux-graves") {
    return {
      summary: [
        "Vintage 2010 climate (Pessac-Léognan, Haut-Brion):",
        "  Growing-season temperature 18.8 °C (warm).",
        "  Harvest rain 81 mm Aug-Sep (moderate).",
        "  Heat-stress days (Tmax≥35 °C): 5.",
        "  Diurnal range Aug-Sep: 9.8 °C.",
        "  Spring frost: 0 days.",
        "Overall: textbook warm-dry profile.",
      ].join("\n"),
      metrics: [
        { name: "GST", value: 18.8, unit: "°C" },
        { name: "harvest_rain", value: 81, unit: "mm" },
        { name: "heat_days", value: 5, unit: "days ≥35°C" },
        { name: "diurnal_temperature_range", value: 9.8, unit: "°C" },
      ],
      notes: ["Demo fixture — Haut-Brion 2010 single-site reference."],
    };
  }
  return {
    summary: `${regionId} (fixture): no per-château climate coverage in dataset.`,
    metrics: [],
    notes: [
      "Demo fixture — region outside the 61-château left-bank Bordeaux dataset.",
    ],
  };
}

export function demoGeoSignals(regionId: string, chateau?: string): GeoSignals {
  if (chateau) {
    return {
      summary: `${chateau} (fixture) — ridge site (good cold-air drainage), moderate Gironde water-buffer.`,
      centroid: { lat: 45.22, lng: -0.77 },
      appellations: ["Pauillac"],
      notes: [
        "Elevation 14 m above sea level.",
        "5.0 km from the Gironde estuary — moderate water-buffer.",
        "TPI +5.8 m — ridge site (good cold-air drainage).",
        "Slope 2.8%, N-facing — pronounced slope, cool-facing — slower ripening, preserves acidity in warm vintages.",
        "Local relief 22 m (300 m neighborhood).",
        "Soil: 34% clay / 33% sand / 32% silt — balanced loam.",
      ],
    };
  }
  if (regionId === "bordeaux-medoc") {
    return {
      summary:
        "Médoc (fixture): 60 classed growths across 5 AOCs; 4 frost-pocket sites; mean elevation 15 m.",
      centroid: { lat: 45.12, lng: -0.72 },
      appellations: ["Pauillac", "Saint-Estèphe", "Saint-Julien", "Margaux", "Haut-Médoc"],
      notes: [
        "Elevation: 15 m mean (range 3–30 m). Classed growths cluster on gravel croupes 7–24 m above the estuary.",
        "Distance to Gironde: 6.1 km mean (range 3.3–10.0 km). Closer sites get a stronger water-buffer on diurnal range.",
        "Topographic Position Index: mean 2.2 m. 4 châteaux sit in cold-air pockets (TPI < −2 m) — elevated spring-frost risk.",
        "Slope: mean 1.1% (max 2.8%). 49 sites with measurable slope, dominant aspect E, 16 sun-exposed (S/SE/SW), 16 cool-facing (N/NE/NW).",
        "Soil texture: mean clay 27% / sand 45%. Gravel/sandy regime, strong drainage.",
        "AOC mix: Margaux (21), Pauillac (18), Saint-Julien (11), Saint-Estèphe (5), Haut-Médoc (5).",
        "Frost-pocket châteaux: Léoville-Las Cases, Léoville-Barton, Ducru-Beaucaillou, Calon-Ségur.",
      ],
    };
  }
  if (regionId === "bordeaux-graves") {
    return {
      summary: "Graves (fixture): 1 classed growth (Haut-Brion); inland Pessac-Léognan terroir.",
      centroid: { lat: 44.81, lng: -0.61 },
      appellations: ["Pessac-Léognan"],
      notes: [
        "Only Premier Cru outside the Médoc strip: Haut-Brion at 26 m elevation, 14 km inland.",
        "TPI ~0 m — neutral topographic position with no frost-pocket signal.",
        "Distance to Gironde: 13 km — weak water-buffer; relies on Atlantic moderation.",
      ],
    };
  }
  return {
    summary: `${regionId} (fixture): no 1855-classed coverage in dataset`,
    centroid: { lat: 47.0, lng: 4.9 },
    appellations: [],
    notes: ["Static centroid only. Per-château terroir profiles are limited to left-bank 1855 classed growths."],
  };
}

export function demoWineAnalysis(input: AnalyzeInput): AnalyzeResult {
  const score = input.region.parent === "burgundy" ? 62 : 48;
  return {
    region: input.region,
    timeframe: input.timeframe,
    persona: input.persona,
    riskScore: score,
    riskBand: bandOf(score),
    drivers: [
      {
        source: "weather",
        signal: "Spring frost probability above 30-year baseline (+1.4σ)",
        weight: 0.42,
      },
      { source: "geo", signal: "Slope/aspect mix amplifies frost pocket exposure", weight: 0.18 },
      {
        source: "tavily",
        signal: "Industry chatter: négociants reducing en primeur allocations",
        weight: 0.27,
      },
      { source: "extraction", signal: "Compound risk: weather × demand softness", weight: 0.13 },
    ],
    recommendations:
      input.persona === "vineyard"
        ? [
            {
              persona: "vineyard",
              action: "Deploy frost protection (candles/wind machines) week of bud-break",
              evidence: "weather.frost_probability",
            },
            {
              persona: "vineyard",
              action: "Hold back 10–15% allocation; pricing power likely improves Q3",
              evidence: "tavily.market_sentiment",
            },
          ]
        : [
            {
              persona: "trade",
              action: "Lock in 2024 vintage allocations early — supply tightening probable",
              evidence: "weather + tavily",
            },
            {
              persona: "trade",
              action: "Diversify into Saint-Émilion satellites as Bordeaux hedge",
              evidence: "geo.appellation_substitution",
            },
          ],
    trace: [
      { agent: "weather_agent", ok: true, durationMs: 0, summary: "(demo fixture)" },
      { agent: "geo_agent", ok: true, durationMs: 0, summary: "(demo fixture)" },
      { agent: "tavily_agent", ok: true, durationMs: 0, summary: "(demo fixture)" },
      { agent: "extraction_agent", ok: true, durationMs: 0, summary: "(demo fixture)" },
      { agent: "feature_agent", ok: true, durationMs: 0, summary: "(demo fixture)" },
    ],
    qualityBand:
      score < 25 ? "Great" : score < 50 ? "Excellent" : score < 65 ? "Good" : score < 80 ? "Average" : "Poor",
    activeGates: [],
    rationale:
      "Demo-mode placeholder: weighted base from sub-agent stubs, gated by spring-frost signal and softening market sentiment.",
    feature: demoFeature(input, score),
    geoSnapshot: demoGeoSignals(input.region.id),
    backtest: demoBacktestIfHistorical(input, score),
    generatedAt: new Date().toISOString(),
    isDemoOrPartial: true,
  };
}

function demoBacktestIfHistorical(input: AnalyzeInput, score: number) {
  const today = new Date().toISOString().slice(0, 10);
  if (input.timeframe.end >= today) return null;
  const year = Number.parseInt(input.timeframe.end.slice(0, 4), 10);
  if (!Number.isFinite(year)) return null;
  const predictedBand: "Great" | "Excellent" | "Good" | "Average" | "Poor" =
    score >= 80 ? "Poor" : score >= 60 ? "Average" : score >= 45 ? "Good" : score >= 25 ? "Excellent" : "Great";
  // Reuse the same well-known vintage fixtures as backtest.ts.
  const ref: Record<
    number,
    {
      verdict: "high_agreement" | "moderate_agreement" | "divergent";
      summary: string;
      critics: Array<{ source: string; score?: number; scale?: string; quote: string; url?: string }>;
    }
  > = {
    2010: {
      verdict: "high_agreement",
      summary:
        "2010 was a landmark warm-dry vintage; critic consensus aligned with a Great/Excellent prediction.",
      critics: [
        { source: "Wine Advocate", score: 98, scale: "/100", quote: "A modern reference vintage; long-aging structure with ripe tannins." },
        { source: "Liv-ex", scale: "+18% YoY", quote: "First-growth release prices rose sharply post-en primeur." },
        { source: "Decanter", score: 5, scale: "/5", quote: "Exceptional; among the great Bordeaux vintages of the century." },
      ],
    },
    2013: {
      verdict: "divergent",
      summary:
        "2013 was a poor vintage; if our model predicted Good or better, we missed the cool-wet signal.",
      critics: [
        { source: "Wine Advocate", score: 84, scale: "/100", quote: "Difficult vintage with cool wet summer; quality below average." },
        { source: "Decanter", score: 2, scale: "/5", quote: "Disappointing across most appellations." },
        { source: "Liv-ex", scale: "-9% YoY", quote: "Negotiants struggled to clear en primeur stock." },
      ],
    },
    2015: {
      verdict: "high_agreement",
      summary: "2015 was a strong warm vintage. High band predictions aligned with the critical consensus.",
      critics: [
        { source: "Wine Advocate", score: 96, scale: "/100", quote: "Generous, ripe, charismatic — the best left-bank since 2010." },
        { source: "Vinous", score: 95, scale: "/100", quote: "Outstanding across the Médoc; balanced with energy." },
        { source: "Liv-ex", scale: "+12% YoY", quote: "Market embraced the vintage; allocations tight." },
      ],
    },
    2020: {
      verdict: "moderate_agreement",
      summary: "2020 split critics on stylistic merits; partial agreement expected.",
      critics: [
        { source: "Wine Advocate", score: 95, scale: "/100", quote: "Hot vintage but balanced; concentrated, hedonistic." },
        { source: "Decanter", score: 4, scale: "/5", quote: "Strong vintage despite drought stress on some sites." },
        { source: "Liv-ex", scale: "+6% YoY", quote: "Solid release but slower trade pace than 2018." },
      ],
    },
  };
  const found = ref[year] ?? {
    verdict: "moderate_agreement" as const,
    summary: `Demo backtest for ${input.region.name} ${year} — connect Tavily + OpenAI for real critic retrieval.`,
    critics: [
      { source: "fixture", quote: `Demo fixture for ${input.region.name} ${year}.` },
    ],
  };
  return {
    isBacktest: true as const,
    year,
    predictedScore: score,
    predictedBand,
    critics: found.critics,
    accuracySummary: found.summary,
    verdict: found.verdict,
  };
}

function demoFeature(input: AnalyzeInput, score: number) {
  const region = input.region.name;
  const persona = input.persona;
  const isVineyard = persona === "vineyard";
  return {
    executiveSummary: `${region} faces an elevated risk window in the current vintage outlook, driven primarily by spring frost probability above the 30-year baseline. Persona context: ${persona}.`,
    reportMarkdown: [
      `# Vintage outlook — ${region}`,
      ``,
      `## Risk profile`,
      `- **Risk score:** ${score}/100`,
      `- **Persona:** ${persona}`,
      `- **Window:** ${input.timeframe.start} → ${input.timeframe.end}`,
      ``,
      `## Key drivers`,
      `- Spring frost probability is +1.4σ above the 30-year baseline.`,
      `- Slope/aspect mix in the appellation amplifies frost-pocket exposure.`,
      `- Public-web chatter indicates négociants reducing en primeur allocations.`,
      ``,
      `## Recommendations (${persona})`,
      isVineyard
        ? `- Deploy frost protection (candles or wind machines) the week of bud-break.\n- Hold back 10–15% allocation; pricing power likely improves later in Q3.`
        : `- Lock in 2024 vintage allocations early — supply tightening is probable.\n- Diversify into Saint-Émilion satellites as a Bordeaux hedge.`,
      ``,
      `## Caveats`,
      `Generated in demo mode against fixture data. Re-run with OPENAI_API_KEY set for an OpenAI-driven assessment grounded in the wine-vintage-quality-schema.`,
    ].join("\n"),
    emailDigest: [
      `**Weekly outlook — ${region}**`,
      ``,
      `Risk score **${score}/100**. Spring frost is the dominant driver this window.`,
      ``,
      isVineyard
        ? `- Deploy frost protection at bud-break\n- Reserve 10–15% of allocation for Q3 pricing power`
        : `- Lock in 2024 allocations early\n- Diversify into Saint-Émilion satellites`,
    ].join("\n"),
  };
}
