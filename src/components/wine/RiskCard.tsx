"use client";

import { cn } from "@/lib/utils";
import { useAnimatedNumber } from "@/lib/hooks/useAnimatedNumber";
import { useT } from "@/lib/i18n/Provider";
import { RiskBandLegend } from "@/components/wine/RiskBandLegend";
import type { AnalyzeResult, RiskBand } from "@/lib/wine/types";

const BAND_STYLES: Record<RiskBand, string> = {
  low: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  moderate: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  elevated: "border-orange-500/30 bg-orange-500/15 text-orange-300",
  high: "border-red-500/40 bg-red-500/20 text-red-300",
};

const BAND_LABEL_KEY: Record<RiskBand, `result.band.${RiskBand}`> = {
  low: "result.band.low",
  moderate: "result.band.moderate",
  elevated: "result.band.elevated",
  high: "result.band.high",
};

export function RiskCard({ result }: { result: AnalyzeResult }) {
  const t = useT();
  const animated = useAnimatedNumber(result.riskScore);

  return (
    <article className="card-lg p-8">
      <header className="flex items-start justify-between gap-6">
        <div className="space-y-1">
          <p className="kicker">
            {t("result.risk_score")}
          </p>
          <p className="tabular font-serif text-7xl font-medium leading-none">
            {Math.round(animated)}
          </p>
        </div>
        <span
          className={cn(
            "chip",
            BAND_STYLES[result.riskBand],
          )}
        >
          {t(BAND_LABEL_KEY[result.riskBand])}
        </span>
      </header>

      <RiskBandLegend score={result.riskScore} band={result.riskBand} />

      {result.drivers.length > 0 && (
        <section className="mt-10">
          <p className="kicker mb-4">
            {t("result.drivers")}
          </p>
          <ul className="divide-y divide-line">
            {result.drivers.map((d, i) => (
              <li key={i} className="flex items-start gap-4 py-3 text-sm">
                <span className="kicker mt-0.5 inline-block min-w-[64px]">
                  {d.source}
                </span>
                <span className="flex-1 leading-relaxed">{d.signal}</span>
                <span className="tabular font-mono text-xs text-soft">
                  {(d.weight * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.recommendations.length > 0 && (
        <section className="mt-10">
          <p className="kicker mb-4">
            {t("result.recommendations")} · {t(`persona.${result.persona}` as const)}
          </p>
          <ul className="space-y-3">
            {result.recommendations.map((r, i) => (
              <li
                key={i}
                className="card-sm p-4 text-sm leading-relaxed"
              >
                <p>{r.action}</p>
                {r.evidence && (
                  <p className="kicker mt-2 font-mono">
                    ↳ {r.evidence}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.isDemoOrPartial && (
        <p className="mt-8 text-[11px] italic text-soft">
          {t("result.partial")}
        </p>
      )}
    </article>
  );
}
