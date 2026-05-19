"use client";

import { useT } from "@/lib/i18n/Provider";
import { cn } from "@/lib/utils";
import type { RiskBand } from "@/lib/wine/types";

interface Props {
  score: number;
  band: RiskBand;
}

/**
 * Four-band reference strip. Shows the full 0-100 risk scale as a colour
 * gradient (emerald → amber → orange → red), pins a triangle marker at the
 * current score, and renders a 4-column legend underneath with each band's
 * range + a one-line recommendation. The active band is visually elevated
 * (border + slight scale + opacity).
 *
 * Used inside RiskCard to give the single big number a frame of reference.
 */
export function RiskBandLegend({ score, band }: Props) {
  const t = useT();
  const safeScore = Math.max(0, Math.min(100, score));

  const BANDS: Array<{
    id: RiskBand;
    range: string;
    cellClass: string;
    activeRingClass: string;
  }> = [
    {
      id: "low",
      range: "0–24",
      cellClass:
        "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
      activeRingClass: "ring-emerald-600/50",
    },
    {
      id: "moderate",
      range: "25–49",
      cellClass:
        "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
      activeRingClass: "ring-amber-600/50",
    },
    {
      id: "elevated",
      range: "50–74",
      cellClass:
        "bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-100",
      activeRingClass: "ring-orange-600/50",
    },
    {
      id: "high",
      range: "75–100",
      cellClass: "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100",
      activeRingClass: "ring-red-700/60",
    },
  ];

  return (
    <section className="mt-8 space-y-3">
      <p className="text-[10px] uppercase tracking-luxe text-muted-foreground">
        {t("result.band_reference")}
      </p>

      {/* Gradient bar with score marker. */}
      <div className="relative pt-5">
        <div
          className="absolute -translate-x-1/2 text-xs leading-none"
          style={{ left: `${safeScore}%`, top: 0 }}
          aria-hidden="true"
        >
          <span className="block text-center font-mono text-[10px] tabular-nums text-foreground">
            {Math.round(safeScore)}
          </span>
          <span className="block text-center leading-none">▼</span>
        </div>
        <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 via-50% to-red-600" />
        <div className="mt-1 flex justify-between font-mono text-[9px] tabular-nums text-muted-foreground">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      </div>

      {/* Four band cells with recommendations. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {BANDS.map((b) => {
          const isActive = b.id === band;
          return (
            <div
              key={b.id}
              className={cn(
                "rounded-sm p-3 transition-all",
                b.cellClass,
                isActive
                  ? `ring-2 ring-offset-1 ring-offset-background ${b.activeRingClass} font-medium`
                  : "opacity-70",
              )}
            >
              <p className="text-[10px] uppercase tracking-luxe">
                {t(`result.band.${b.id}` as const)}
              </p>
              <p className="mt-1 font-mono text-[10px] tabular-nums opacity-70">
                {b.range}
              </p>
              <p className="mt-2 text-xs leading-snug">
                {t(`result.band.advice.${b.id}` as const)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
