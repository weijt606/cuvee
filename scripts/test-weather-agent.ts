/**
 * Smoke test for weather_agent — runs the agent directly against the
 * bundled climate CSVs, bypassing the orchestrator and HTTP layer.
 *
 *   pnpm test:weather
 */
import { weatherAgent } from "../src/lib/agents/sub-agents/weather";

const baseCtx = {
  region: { id: "bordeaux-medoc", name: "Médoc", parent: "bordeaux" as const },
  timeframe: { start: "2010-04-01", end: "2010-10-31" },
  persona: "trade" as const,
  signal: new AbortController().signal,
};

async function run() {
  const cases: Array<[string, Parameters<typeof weatherAgent.run>[0]]> = [
    [
      "Médoc AOC aggregate, vintage 2010 (historical)",
      { regionId: "bordeaux-medoc", start: "2010-04-01", end: "2010-10-31" },
    ],
    [
      "Médoc AOC aggregate, vintage 2003 heatwave (historical)",
      { regionId: "bordeaux-medoc", start: "2003-04-01", end: "2003-10-31" },
    ],
    [
      "Single château: Lafite, vintage 2010",
      {
        regionId: "bordeaux-medoc",
        start: "2010-04-01",
        end: "2010-10-31",
        chateau: "Lafite",
      },
    ],
    [
      "Single château: Latour, vintage 2018",
      {
        regionId: "bordeaux-medoc",
        start: "2018-04-01",
        end: "2018-10-31",
        chateau: "Latour",
      },
    ],
    [
      "2026 forecast (Médoc, SEAS5 ensemble)",
      { regionId: "bordeaux-medoc", start: "2026-04-01", end: "2026-10-31" },
    ],
    [
      "2026 forecast, single château: Margaux",
      {
        regionId: "bordeaux-medoc",
        start: "2026-04-01",
        end: "2026-10-31",
        chateau: "Margaux",
      },
    ],
    [
      "Graves (Haut-Brion only, historical 2015)",
      { regionId: "bordeaux-graves", start: "2015-04-01", end: "2015-10-31" },
    ],
    [
      "Burgundy — no climate coverage (graceful degrade)",
      { regionId: "burgundy-cote-de-nuits", start: "2020-04-01", end: "2020-10-31" },
    ],
    [
      "Unknown region — should fail",
      { regionId: "bordeaux-bogus", start: "2020-04-01", end: "2020-10-31" },
    ],
    [
      "Château not in dataset — should fail",
      {
        regionId: "bordeaux-medoc",
        start: "2010-04-01",
        end: "2010-10-31",
        chateau: "Petrus",
      },
    ],
    [
      "Vintage 2025 (NASA POWER backfill — hot dry year)",
      { regionId: "bordeaux-medoc", start: "2025-04-01", end: "2025-10-31" },
    ],
  ];

  for (const [label, input] of cases) {
    console.log(`\n=== ${label} ===`);
    const ctx = input.regionId.startsWith("burgundy")
      ? { ...baseCtx, region: { id: input.regionId, name: "Côte de Nuits", parent: "burgundy" as const } }
      : input.regionId.startsWith("bordeaux-graves")
        ? { ...baseCtx, region: { id: input.regionId, name: "Graves", parent: "bordeaux" as const } }
        : baseCtx;
    const out = await weatherAgent.run(input, ctx);
    console.log(`ok: ${out.ok}  durationMs: ${out.durationMs}  summary: ${out.summary}`);
    if (out.error) console.log(`  error: ${out.error}`);
    if (out.data) {
      console.log(`  --- summary prose ---`);
      console.log(
        out.data.summary
          .split("\n")
          .map((l) => "  " + l)
          .join("\n"),
      );
      console.log(`  --- metrics ---`);
      for (const m of out.data.metrics) {
        console.log(`    ${m.name.padEnd(28)} ${String(m.value).padStart(8)}  ${m.unit}`);
      }
      console.log(`  --- notes ---`);
      for (const n of out.data.notes) {
        console.log(`    • ${n}`);
      }
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
