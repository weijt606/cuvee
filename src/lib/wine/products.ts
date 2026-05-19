import CHATEAUX from "@/lib/wine/chateaux-static.json";
import type { Region } from "@/lib/wine/types";

/**
 * A curated product is a buyer-facing wine identity: a label + vintage-agnostic
 * region/château pointer. Picking one in the trade UI auto-fills the region
 * and (when present) the château focus, then flies the map to that point.
 *
 * The Bordeaux entries are derived programmatically from the 61-château 1855
 * classés dataset; the Burgundy entries are a small hand-curated list of
 * famous grand and premier crus mapped to existing regions.ts ids.
 */

export interface Product {
  id: string;                                           // kebab-case, stable
  name: string;                                         // display name
  aoc: string;                                          // sub-region / appellation
  classification?: string;                              // e.g. "1er Cru Classé"
  region: Pick<Region, "id" | "name" | "parent">;
  chateau?: { name: string; aoc: string };              // present when product → single estate
}

interface ChateauRow {
  name: string;
  aoc: string;
  growth: string;
  growth_num: number;
}

function regionForAoc(aoc: string): Pick<Region, "id" | "name" | "parent"> {
  if (aoc === "Pessac-Léognan" || aoc === "Sauternes" || aoc === "Barsac")
    return { id: "bordeaux-graves", name: "Graves & Pessac-Léognan", parent: "bordeaux" };
  if (aoc === "Saint-Émilion" || aoc === "Pomerol")
    return { id: "bordeaux-saint-emilion", name: "Saint-Émilion", parent: "bordeaux" };
  // Médoc communes: Pauillac, Margaux, Saint-Estèphe, Saint-Julien, Listrac, Moulis
  return { id: "bordeaux-medoc", name: "Médoc", parent: "bordeaux" };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const BORDEAUX_PRODUCTS: Product[] = (CHATEAUX as ChateauRow[]).map((c) => ({
  id: slug(c.name),
  name: c.name,
  aoc: c.aoc,
  classification: c.growth,
  region: regionForAoc(c.aoc),
  chateau: { name: c.name, aoc: c.aoc },
}));

/**
 * Hand-picked Burgundy stars. No equivalent of the 1855 classification exists
 * in Burgundy — we use Grand Cru / Premier Cru classifications as the
 * shorthand. AOC strings here are the climat name (the actual appellation
 * label used on the bottle), not the village.
 */
const BURGUNDY_PRODUCTS: Product[] = [
  // Côte de Nuits — Grand Crus
  {
    id: "romanee-conti",
    name: "Romanée-Conti",
    aoc: "Vosne-Romanée",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-nuits", name: "Côte de Nuits", parent: "burgundy" },
  },
  {
    id: "la-tache",
    name: "La Tâche",
    aoc: "Vosne-Romanée",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-nuits", name: "Côte de Nuits", parent: "burgundy" },
  },
  {
    id: "richebourg",
    name: "Richebourg",
    aoc: "Vosne-Romanée",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-nuits", name: "Côte de Nuits", parent: "burgundy" },
  },
  {
    id: "romanee-saint-vivant",
    name: "Romanée-Saint-Vivant",
    aoc: "Vosne-Romanée",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-nuits", name: "Côte de Nuits", parent: "burgundy" },
  },
  {
    id: "echezeaux",
    name: "Échezeaux",
    aoc: "Flagey-Échezeaux",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-nuits", name: "Côte de Nuits", parent: "burgundy" },
  },
  {
    id: "grands-echezeaux",
    name: "Grands Échezeaux",
    aoc: "Flagey-Échezeaux",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-nuits", name: "Côte de Nuits", parent: "burgundy" },
  },
  {
    id: "chambertin",
    name: "Chambertin",
    aoc: "Gevrey-Chambertin",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-nuits", name: "Côte de Nuits", parent: "burgundy" },
  },
  {
    id: "chambertin-clos-de-beze",
    name: "Chambertin-Clos de Bèze",
    aoc: "Gevrey-Chambertin",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-nuits", name: "Côte de Nuits", parent: "burgundy" },
  },
  {
    id: "musigny",
    name: "Musigny",
    aoc: "Chambolle-Musigny",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-nuits", name: "Côte de Nuits", parent: "burgundy" },
  },
  {
    id: "bonnes-mares",
    name: "Bonnes-Mares",
    aoc: "Chambolle-Musigny / Morey-Saint-Denis",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-nuits", name: "Côte de Nuits", parent: "burgundy" },
  },
  {
    id: "clos-de-vougeot",
    name: "Clos de Vougeot",
    aoc: "Vougeot",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-nuits", name: "Côte de Nuits", parent: "burgundy" },
  },
  {
    id: "clos-de-tart",
    name: "Clos de Tart",
    aoc: "Morey-Saint-Denis",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-nuits", name: "Côte de Nuits", parent: "burgundy" },
  },
  // Côte de Beaune — Grand Crus
  {
    id: "montrachet",
    name: "Montrachet",
    aoc: "Puligny-Montrachet / Chassagne-Montrachet",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-beaune", name: "Côte de Beaune", parent: "burgundy" },
  },
  {
    id: "chevalier-montrachet",
    name: "Chevalier-Montrachet",
    aoc: "Puligny-Montrachet",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-beaune", name: "Côte de Beaune", parent: "burgundy" },
  },
  {
    id: "batard-montrachet",
    name: "Bâtard-Montrachet",
    aoc: "Puligny-Montrachet / Chassagne-Montrachet",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-beaune", name: "Côte de Beaune", parent: "burgundy" },
  },
  {
    id: "corton",
    name: "Corton",
    aoc: "Aloxe-Corton",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-beaune", name: "Côte de Beaune", parent: "burgundy" },
  },
  {
    id: "corton-charlemagne",
    name: "Corton-Charlemagne",
    aoc: "Aloxe-Corton",
    classification: "Grand Cru",
    region: { id: "burgundy-cote-de-beaune", name: "Côte de Beaune", parent: "burgundy" },
  },
  {
    id: "pommard-rugiens",
    name: "Pommard Les Rugiens",
    aoc: "Pommard",
    classification: "1er Cru",
    region: { id: "burgundy-cote-de-beaune", name: "Côte de Beaune", parent: "burgundy" },
  },
  {
    id: "volnay-caillerets",
    name: "Volnay Les Caillerets",
    aoc: "Volnay",
    classification: "1er Cru",
    region: { id: "burgundy-cote-de-beaune", name: "Côte de Beaune", parent: "burgundy" },
  },
  // Chablis
  {
    id: "chablis-les-clos",
    name: "Chablis Les Clos",
    aoc: "Chablis",
    classification: "Grand Cru",
    region: { id: "burgundy-chablis", name: "Chablis", parent: "burgundy" },
  },
  {
    id: "chablis-vaudesir",
    name: "Chablis Vaudésir",
    aoc: "Chablis",
    classification: "Grand Cru",
    region: { id: "burgundy-chablis", name: "Chablis", parent: "burgundy" },
  },
];

export const PRODUCTS: Product[] = [...BORDEAUX_PRODUCTS, ...BURGUNDY_PRODUCTS];

export function findProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
