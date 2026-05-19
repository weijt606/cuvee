"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { REGIONS } from "@/lib/wine/regions";
import type { Region } from "@/lib/wine/types";

interface Props {
  value: string;
  onChange: (r: Pick<Region, "id" | "name" | "parent">) => void;
}

export function VineyardSidebar({ value, onChange }: Props) {
  const initialParent = useMemo(() => {
    return REGIONS.find((r) => r.id === value)?.parent ?? "burgundy";
  }, [value]);
  const [parent, setParent] = useState<"burgundy" | "bordeaux">(initialParent);

  const regions = useMemo(() => REGIONS.filter((r) => r.parent === parent), [parent]);
  const counts = useMemo(() => {
    return REGIONS.reduce<Record<string, number>>(
      (acc, r) => ({ ...acc, [r.parent]: (acc[r.parent] ?? 0) + 1 }),
      {},
    );
  }, []);

  return (
    <>
      <div className="shrink-0 border-b border-line px-5 py-4">
        <p className="kicker mb-2">Wine Atlas</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold tabular tracking-tight">{REGIONS.length}</span>
          <span className="kicker">French AOC regions</span>
        </div>
      </div>

      <div className="shrink-0 border-b border-line px-5 py-4">
        <p className="kicker mb-2.5">Parent</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(["burgundy", "bordeaux"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setParent(p)}
              data-active={parent === p}
              className="chip justify-center"
            >
              {p === "burgundy" ? "Burgundy" : "Bordeaux"}
              <span className="ml-1 text-[9px] text-soft">{counts[p] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul>
          {regions.map((r) => {
            const isSelected = r.id === value;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() =>
                    onChange({ id: r.id, name: r.name, parent: r.parent })
                  }
                  data-selected={isSelected}
                  className={cn(
                    "relative block w-full border-b border-line px-5 py-4 text-left transition-colors",
                    isSelected ? "bg-surface-3" : "hover:bg-surface-2",
                  )}
                >
                  {isSelected && (
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-[2px] bg-foreground"
                    />
                  )}
                  <span className="block text-[14px] font-semibold tracking-tight">
                    {r.name}
                  </span>
                  <span className="kicker mt-1.5 block">
                    {(r.appellations ?? []).slice(0, 3).join(" · ")}
                    {(r.appellations?.length ?? 0) > 3 &&
                      ` · +${(r.appellations?.length ?? 0) - 3}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
