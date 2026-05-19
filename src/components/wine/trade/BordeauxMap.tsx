"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  getChateauList,
  matchesQuery,
  regionFromAoc,
} from "@/lib/wine/chateau-points";

interface Props {
  selectedChateau?: string | null;
  onChateauSelect?: (
    chateau: { name: string; aoc: string; regionId: string; regionName: string } | null,
  ) => void;
  query?: string;
  growthFilter?: number[];
  showLegend?: boolean;
}

// 1855 cru ramp — synced with --cru-1..5 tokens in globals.css.
// Plain HSL because Leaflet markers don't read CSS variables at paint time.
const CRU_COLORS: Record<number, string> = {
  1: "hsl(41 73% 60%)",   // gold (Premier)
  2: "hsl(14 64% 60%)",   // oak (Deuxième)
  3: "hsl(348 50% 46%)",  // claret (Troisième)
  4: "hsl(348 47% 33%)",  // wine (Quatrième)
  5: "hsl(348 40% 21%)",  // black-wine (Cinquième)
};

const CRU_LABEL: Record<number, string> = {
  1: "Premier",
  2: "Deuxième",
  3: "Troisième",
  4: "Quatrième",
  5: "Cinquième",
};

/** Pan/zoom to a single target. Compares the previous coords by value so a
 *  re-render with the same target doesn't re-fire the flyTo animation. */
function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  const lastRef = useRef<string | null>(null);
  useEffect(() => {
    if (!target) {
      lastRef.current = null;
      return;
    }
    const key = `${target[0]},${target[1]}`;
    if (lastRef.current === key) return;
    lastRef.current = key;
    map.flyTo(target, 11, { duration: 0.5 });
  }, [target, map]);
  return null;
}

/** Slim Leaflet canvas — markers only. Search / legend / list live in the shell. */
export function BordeauxMap({
  selectedChateau,
  onChateauSelect,
  query = "",
  growthFilter,
  showLegend = true,
}: Props) {
  const chateaux = getChateauList();

  const filtered = useMemo(() => {
    return chateaux.filter((c) => {
      if (growthFilter && growthFilter.length > 0 && !growthFilter.includes(c.growth_num)) {
        return false;
      }
      return matchesQuery(c, query);
    });
  }, [chateaux, query, growthFilter]);

  const chateauNorm = (selectedChateau ?? "").toLowerCase();

  // Single source of truth for the map's fly-to target. Memoised so the
  // reference is stable across re-renders for the same selection — that
  // way the FlyTo effect fires once per actual change, not on every
  // parent re-render. Selection wins over query single-match.
  const flyTarget = useMemo<[number, number] | null>(() => {
    if (chateauNorm.length > 0) {
      const match = chateaux.find((c) => c.name.toLowerCase().includes(chateauNorm));
      if (match) return [match.lat, match.lon];
    }
    if (filtered.length === 1 && query.length > 0) {
      return [filtered[0]!.lat, filtered[0]!.lon];
    }
    return null;
  }, [chateaux, chateauNorm, filtered, query]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[45.05, -0.7]}
        zoom={9}
        minZoom={7}
        maxZoom={14}
        scrollWheelZoom
        style={{ height: "100%", width: "100%", background: "var(--background)" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains={["a", "b", "c", "d"]}
        />
        <FlyTo target={flyTarget} />

        {filtered.map((c) => {
          const isActive =
            chateauNorm.length > 0 && c.name.toLowerCase().includes(chateauNorm);
          const baseR = c.growth_num === 1 ? 7 : 5;
          const r = isActive ? baseR + 2 : baseR;
          const color = CRU_COLORS[c.growth_num] ?? "#888";

          return (
            <CircleMarker
              key={c.name}
              center={[c.lat, c.lon]}
              radius={r}
              pathOptions={{
                color: isActive ? "#fff" : "rgba(255,255,255,0.4)",
                weight: isActive ? 2 : 1,
                fillColor: color,
                fillOpacity: 0.92,
              }}
              eventHandlers={{
                click: () => {
                  if (!onChateauSelect) return;
                  if (isActive) {
                    onChateauSelect(null);
                  } else {
                    const region = regionFromAoc(c.aoc);
                    onChateauSelect({
                      name: c.name,
                      aoc: c.aoc,
                      regionId: region.id,
                      regionName: region.name,
                    });
                  }
                },
              }}
            >
              <Popup>
                <div className="px-1 py-1 leading-relaxed">
                  <div className="kicker-strong text-[13px]">{c.name}</div>
                  <div className="kicker mt-0.5">
                    {CRU_LABEL[c.growth_num] ?? `${c.growth_num}e`} Cru · {c.aoc}
                  </div>
                  <div className="kicker">{c.commune}</div>
                  {(c.elevation_m !== null || c.dist_gironde_km !== null) && (
                    <div className="kicker tabular mt-1.5">
                      {c.elevation_m !== null && `${Math.round(c.elevation_m)} m`}
                      {c.elevation_m !== null && c.dist_gironde_km !== null && " · "}
                      {c.dist_gironde_km !== null &&
                        `${c.dist_gironde_km.toFixed(1)} km gironde`}
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {showLegend && (
        <div className="glass pointer-events-auto absolute bottom-5 left-5 z-[400] flex flex-col gap-2 rounded-card px-4 py-3 shadow-[var(--shadow)]">
          <div className="kicker">1855 Classification</div>
          <div className="grid grid-cols-1 gap-1.5">
            {[1, 2, 3, 4, 5].map((g) => (
              <div key={g} className="flex items-center gap-2.5 text-[11px] text-soft">
                <span
                  className={`inline-block rounded-full bg-cru-${g}`}
                  style={{ width: g === 1 ? 10 : 8, height: g === 1 ? 10 : 8 }}
                />
                <span className="text-foreground/85">{CRU_LABEL[g]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
