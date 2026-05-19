import CHATEAUX from "@/lib/wine/chateaux-static.json";

export interface ChateauPoint {
  name: string;
  aoc: string;
  growth: string;
  growth_num: number;
  commune: string;
  lat: number;
  lon: number;
  elevation_m: number | null;
  dist_gironde_km: number | null;
}

export function getChateauList(): ChateauPoint[] {
  return CHATEAUX as ChateauPoint[];
}

export function matchesQuery(c: ChateauPoint, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    c.name.toLowerCase().includes(needle) ||
    c.aoc.toLowerCase().includes(needle) ||
    c.commune.toLowerCase().includes(needle) ||
    c.growth.toLowerCase().includes(needle)
  );
}

export function regionFromAoc(aoc: string): { id: string; name: string } {
  if (aoc === "Pessac-Léognan") return { id: "bordeaux-graves", name: "Graves" };
  return { id: "bordeaux-medoc", name: "Médoc" };
}
