/**
 * Smoke test for geo_agent — runs the agent directly against the bundled
 * CSV dataset, bypassing the orchestrator and HTTP layer.
 *
 *   NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm tsx scripts/test-geo-agent.ts
 */
import { geoAgent } from "../src/lib/agents/sub-agents/geo";

const ctx = {
  region: { id: "bordeaux-medoc", name: "Médoc", parent: "bordeaux" as const },
  timeframe: { start: "2026-05-16", end: "2026-08-14" },
  persona: "trade" as const,
  signal: new AbortController().signal,
};

async function run() {
  const cases: Array<[string, Parameters<typeof geoAgent.run>[0]]> = [
    ["regionId only (Médoc aggregate)", { regionId: "bordeaux-medoc" }],
    ["regionId + appellation filter (Pauillac)", { regionId: "bordeaux-medoc", appellation: "Pauillac" }],
    ["single château (Lafite)", { regionId: "bordeaux-medoc", chateau: "Lafite" }],
    ["château not in dataset (Petrus)", { regionId: "bordeaux-medoc", chateau: "Petrus" }],
    ["region without 1855 coverage (Burgundy)", { regionId: "burgundy-cote-de-nuits" }],
    ["unknown region", { regionId: "bordeaux-bogus" }],
  ];

  for (const [label, input] of cases) {
    console.log(`\n=== ${label} ===`);
    const localCtx = input.regionId.startsWith("burgundy")
      ? { ...ctx, region: { id: input.regionId, name: "Côte de Nuits", parent: "burgundy" as const } }
      : ctx;
    const out = await geoAgent.run(input, localCtx);
    console.log(JSON.stringify(out, null, 2));
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
