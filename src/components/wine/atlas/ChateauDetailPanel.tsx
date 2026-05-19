"use client";

import { useT } from "@/lib/i18n/Provider";
import { TimeframePicker } from "@/components/wine/shared/TimeframePicker";
import { TradePersonaTabs } from "@/components/wine/trade/TradePersonaTabs";
import type { ChateauPoint } from "@/lib/wine/chateau-points";
import type { Timeframe, TradePersona } from "@/lib/wine/types";

interface Props {
  chateau: ChateauPoint | null;
  timeframe: Timeframe;
  onTimeframeChange: (t: Timeframe) => void;
  tradePersona: TradePersona;
  onTradePersonaChange: (p: TradePersona) => void;
  onClear: () => void;
  onRun: () => void;
  loading: boolean;
  error: string | null;
  hasResult?: boolean;
  onShowAnalysis?: () => void;
}

const CRU_LABEL: Record<number, string> = {
  1: "Premier",
  2: "Deuxième",
  3: "Troisième",
  4: "Quatrième",
  5: "Cinquième",
};

export function ChateauDetailPanel({
  chateau,
  timeframe,
  onTimeframeChange,
  tradePersona,
  onTradePersonaChange,
  onClear,
  onRun,
  loading,
  error,
  hasResult,
  onShowAnalysis,
}: Props) {
  const t = useT();

  if (!chateau) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-7 text-center text-soft">
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="h-9 w-9 fill-none stroke-current opacity-50"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1118 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <p className="kicker-strong text-muted-foreground">Pick a château</p>
        <p className="max-w-[240px] text-[12px] leading-relaxed text-soft">
          Click any marker on the map or any row in the list — the panel will load its
          terroir snapshot and the Run button.
        </p>
      </div>
    );
  }

  return (
    <>
      <header className="shrink-0 border-b border-line px-7 pb-5 pt-7">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-pill border border-line bg-surface-3 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em]`}
          >
            <span
              className={`h-2 w-2 rounded-full bg-cru-${chateau.growth_num}`}
              aria-hidden
            />
            {CRU_LABEL[chateau.growth_num] ?? `${chateau.growth_num}e`} Cru
          </span>
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selection"
            className="icon-btn ml-auto"
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>
        <h2 className="mt-4 font-serif text-[26px] font-medium leading-[1.15] tracking-tight">
          {chateau.name}
        </h2>
        <p className="kicker mt-2">
          {chateau.aoc} · {chateau.commune}
        </p>
      </header>

      <div className="flex flex-col gap-5 px-7 py-6">
        <section>
          <p className="section-kicker">Terroir snapshot</p>
          <div className="kv-grid">
            <div className="kv-cell">
              <p className="kv-label">Elevation</p>
              <p className="kv-value">
                {chateau.elevation_m !== null ? Math.round(chateau.elevation_m) : "—"}
                {chateau.elevation_m !== null && <span className="kv-unit">m</span>}
              </p>
            </div>
            <div className="kv-cell">
              <p className="kv-label">Gironde</p>
              <p className="kv-value">
                {chateau.dist_gironde_km !== null
                  ? chateau.dist_gironde_km.toFixed(1)
                  : "—"}
                {chateau.dist_gironde_km !== null && <span className="kv-unit">km</span>}
              </p>
            </div>
            <div className="kv-cell">
              <p className="kv-label">Classification</p>
              <p className="kv-value text-[13px]">{chateau.growth}</p>
            </div>
            <div className="kv-cell">
              <p className="kv-label">AOC</p>
              <p className="kv-value text-[13px]">{chateau.aoc}</p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="section-kicker">{t("trade.persona.label")}</p>
          <TradePersonaTabs value={tradePersona} onChange={onTradePersonaChange} />
        </section>

        <TimeframePicker value={timeframe} onChange={onTimeframeChange} />

        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="w-full rounded-pill bg-foreground px-4 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? t("common.running") : `${t("common.run_analysis")} · ${chateau.name.replace("Château ", "")}`}
        </button>

        {hasResult && onShowAnalysis && !loading && (
          <button
            type="button"
            onClick={onShowAnalysis}
            className="chip w-full justify-center"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-3 w-3 fill-none stroke-current" strokeWidth={2}>
              <path d="M3 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Show last analysis
          </button>
        )}

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>
    </>
  );
}
