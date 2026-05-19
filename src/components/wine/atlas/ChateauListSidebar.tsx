"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  getChateauList,
  matchesQuery,
  regionFromAoc,
} from "@/lib/wine/chateau-points";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  growthFilter: number[];
  onGrowthFilterChange: (g: number[]) => void;
  selectedName: string | null;
  onSelect: (c: { name: string; aoc: string; regionId: string; regionName: string } | null) => void;
}

const CRU_LABEL: Record<number, string> = {
  1: "1er",
  2: "2e",
  3: "3e",
  4: "4e",
  5: "5e",
};

export function ChateauListSidebar({
  query,
  onQueryChange,
  growthFilter,
  onGrowthFilterChange,
  selectedName,
  onSelect,
}: Props) {
  const all = getChateauList();

  const filtered = useMemo(() => {
    return all.filter((c) => {
      if (growthFilter.length > 0 && !growthFilter.includes(c.growth_num)) return false;
      return matchesQuery(c, query);
    });
  }, [all, query, growthFilter]);

  const cruCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const c of all) counts[c.growth_num] = (counts[c.growth_num] ?? 0) + 1;
    return counts;
  }, [all]);

  const toggleGrowth = (g: number) => {
    const set = new Set(growthFilter);
    if (set.has(g)) set.delete(g);
    else set.add(g);
    onGrowthFilterChange([...set]);
  };

  const selectedNorm = (selectedName ?? "").toLowerCase();

  return (
    <>
      <div className="shrink-0 border-b border-line px-5 py-4">
        <p className="kicker mb-2">Bordeaux Atlas</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold tabular tracking-tight">{all.length}</span>
          <span className="kicker">1855 Châteaux</span>
        </div>
      </div>

      <div className="shrink-0 border-b border-line px-5 py-4">
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-none stroke-current text-soft"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search château, AOC, commune…"
            className="h-9 w-full rounded-md border border-line bg-surface-2 pl-9 pr-3 text-[12px] transition-colors focus:border-line-strong focus:bg-surface-3 focus:outline-none"
          />
        </div>
      </div>

      <div className="shrink-0 border-b border-line px-5 py-4">
        <p className="kicker mb-2.5">1855 Cru</p>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => toggleGrowth(g)}
              data-active={growthFilter.includes(g)}
              className="chip"
            >
              <span
                className={cn("inline-block h-2 w-2 rounded-full", `bg-cru-${g}`)}
                aria-hidden
              />
              {CRU_LABEL[g]}
              <span className="ml-0.5 text-[9px] text-soft">{cruCounts[g]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-soft">No château matches.</p>
        ) : (
          <ul>
            {filtered.map((c) => {
              const isSelected = selectedNorm.length > 0 && c.name.toLowerCase() === selectedNorm;
              return (
                <li key={c.name}>
                  <button
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        onSelect(null);
                      } else {
                        const region = regionFromAoc(c.aoc);
                        onSelect({
                          name: c.name,
                          aoc: c.aoc,
                          regionId: region.id,
                          regionName: region.name,
                        });
                      }
                    }}
                    data-selected={isSelected}
                    className={cn(
                      "group relative flex w-full items-center gap-3 border-b border-line px-5 py-3 text-left transition-colors",
                      isSelected ? "bg-surface-3" : "hover:bg-surface-2",
                    )}
                  >
                    {isSelected && (
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-[2px] bg-foreground"
                      />
                    )}
                    <span
                      className={cn("h-2.5 w-2.5 shrink-0 rounded-full", `bg-cru-${c.growth_num}`)}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold tracking-tight">
                        {c.name}
                      </span>
                      <span className="block text-[10px] uppercase tracking-[0.12em] text-soft">
                        {c.aoc} · {c.commune}
                      </span>
                    </span>
                    <span className="kicker shrink-0">{CRU_LABEL[c.growth_num]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-line px-5 py-3">
        <p className="kicker tabular">
          {filtered.length} / {all.length}{" "}
          {growthFilter.length > 0 || query ? "shown" : "total"}
        </p>
      </div>
    </>
  );
}