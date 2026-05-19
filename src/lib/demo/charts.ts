/**
 * Chart fixtures — client-safe (no "server-only"). Deterministic generators
 * keyed by regionId so the trade-side multi-chart dashboard has meaningful
 * variation without hitting the live agent pipeline.
 *
 * Dev team: replace these with real time-series / sentiment payloads once
 * weather_agent + tavily_agent return structured arrays.
 */

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

export interface WeatherPoint {
  month: string; // YYYY-MM
  tempAnomalyC: number;
  precipMm: number;
  frostDays: number;
}

export function demoWeatherTimeseries(regionId: string): WeatherPoint[] {
  const seed = hashSeed(regionId);
  const now = new Date();
  // Trailing 12 months ending with the current month.
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months.map((month, i) => {
    const monthIdx = parseInt(month.slice(-2), 10) - 1; // 0-11
    // seasonal: cooler winter, warmer summer (sine wave on month-of-year)
    const seasonal = Math.sin(((monthIdx - 3) / 12) * Math.PI * 2);
    const anomaly = Math.sin((i + seed * 6) * 0.55) * 1.2 + seed * 0.6;
    const precipBase = 55 + Math.cos((i + seed * 4) * 0.5) * 28 + (1 - seed) * 12;
    const frostPotential = Math.max(0, -seasonal) * (2 + seed * 3);
    return {
      month,
      tempAnomalyC: Number(anomaly.toFixed(2)),
      precipMm: Math.round(precipBase),
      frostDays: Math.max(0, Math.round(frostPotential)),
    };
  });
}

export interface SentimentSlice {
  label: "positive" | "neutral" | "negative";
  value: number;
}

export function demoSentiment(regionId: string): SentimentSlice[] {
  const seed = hashSeed(regionId);
  const neg = Math.round(20 + seed * 25);
  const pos = Math.round(35 + (1 - seed) * 25);
  return [
    { label: "positive", value: pos },
    { label: "neutral", value: 100 - pos - neg },
    { label: "negative", value: neg },
  ];
}
