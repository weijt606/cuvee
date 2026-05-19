import type { Region } from "@/lib/wine/types";

/**
 * Static seed list of Burgundy + Bordeaux regions. Hand-picked, not exhaustive.
 *
 * Dev team: extend or swap for INAO data when geo-agent lands. Keep id slugs
 * stable — they're used as foreign keys in agent traces and pioneer.ai logs.
 */
export const REGIONS: Region[] = [
  {
    id: "burgundy-cote-de-nuits",
    name: "Côte de Nuits",
    country: "FR",
    parent: "burgundy",
    appellations: ["Gevrey-Chambertin", "Vosne-Romanée", "Nuits-Saint-Georges", "Chambolle-Musigny"],
    centroid: { lat: 47.18, lng: 4.96 },
  },
  {
    id: "burgundy-cote-de-beaune",
    name: "Côte de Beaune",
    country: "FR",
    parent: "burgundy",
    appellations: ["Meursault", "Puligny-Montrachet", "Pommard", "Volnay"],
    centroid: { lat: 47.02, lng: 4.84 },
  },
  {
    id: "burgundy-chablis",
    name: "Chablis",
    country: "FR",
    parent: "burgundy",
    appellations: ["Petit Chablis", "Chablis", "Chablis Premier Cru", "Chablis Grand Cru"],
    centroid: { lat: 47.81, lng: 3.8 },
  },
  {
    id: "bordeaux-medoc",
    name: "Médoc",
    country: "FR",
    parent: "bordeaux",
    appellations: ["Pauillac", "Saint-Estèphe", "Saint-Julien", "Margaux"],
    centroid: { lat: 45.18, lng: -0.74 },
  },
  {
    id: "bordeaux-saint-emilion",
    name: "Saint-Émilion",
    country: "FR",
    parent: "bordeaux",
    appellations: ["Saint-Émilion Grand Cru", "Pomerol", "Lalande-de-Pomerol"],
    centroid: { lat: 44.89, lng: -0.16 },
  },
  {
    id: "bordeaux-graves",
    name: "Graves & Pessac-Léognan",
    country: "FR",
    parent: "bordeaux",
    appellations: ["Pessac-Léognan", "Graves", "Sauternes", "Barsac"],
    centroid: { lat: 44.71, lng: -0.51 },
  },
];

export function findRegion(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id);
}
