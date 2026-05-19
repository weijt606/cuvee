/**
 * Approximate France outline as inline GeoJSON. Hand-crafted (~30 vertices)
 * for the trade-side BordeauxMap so the map works fully offline — no tile
 * server, no CDN dependency.
 *
 * Not authoritative geography; do not use for anything other than the
 * decorative wine-regions map.
 */

export const FRANCE_GEO = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "France" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [1.85, 50.95],
            [2.55, 51.07],
            [3.2, 50.5],
            [4.2, 49.8],
            [6.1, 49.2],
            [7.6, 49.0],
            [8.2, 48.8],
            [7.55, 47.55],
            [6.85, 46.4],
            [6.85, 45.9],
            [7.0, 44.1],
            [7.5, 43.7],
            [6.6, 43.1],
            [5.4, 43.3],
            [3.0, 43.2],
            [3.0, 42.4],
            [0.7, 42.7],
            [-1.7, 43.3],
            [-1.6, 44.3],
            [-1.2, 45.6],
            [-1.2, 46.2],
            [-2.5, 47.3],
            [-4.8, 48.1],
            [-4.2, 48.7],
            [-2.5, 48.6],
            [-1.6, 49.7],
            [-0.1, 49.3],
            [0.1, 50.0],
            [1.85, 50.95],
          ],
        ],
      },
    },
  ],
} as const;
