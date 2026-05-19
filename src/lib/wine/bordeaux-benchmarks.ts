import type { RiskBand } from "@/lib/wine/types";
import { bandOf } from "@/lib/wine/types";

/**
 * Static demo benchmark data for the six Bordeaux sub-regions shown on the
 * trade-side map. Hand-set scores for visually meaningful contrast.
 *
 * Dev team: once data pipeline is wired, replace with values computed from
 * cached AnalyzeResult per region (e.g. nightly batch).
 */
export interface BordeauxBenchmark {
  id: string;
  name: string;
  score: number;
  band: RiskBand;
  lat: number;
  lng: number;
}

const RAW: Array<Omit<BordeauxBenchmark, "band">> = [
  { id: "bordeaux-medoc", name: "Médoc", score: 48, lat: 45.18, lng: -0.74 },
  { id: "bordeaux-saint-emilion", name: "Saint-Émilion", score: 58, lat: 44.89, lng: -0.16 },
  { id: "bordeaux-graves", name: "Graves", score: 41, lat: 44.71, lng: -0.51 },
  { id: "bordeaux-pomerol", name: "Pomerol", score: 64, lat: 44.93, lng: -0.21 },
  { id: "bordeaux-sauternes", name: "Sauternes", score: 36, lat: 44.54, lng: -0.34 },
  { id: "bordeaux-cotes-de-bourg", name: "Côtes de Bourg", score: 52, lat: 45.04, lng: -0.56 },
];

export const BORDEAUX_BENCHMARKS: BordeauxBenchmark[] = RAW.map((b) => ({
  ...b,
  band: bandOf(b.score),
}));
