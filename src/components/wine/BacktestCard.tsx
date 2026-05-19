"use client";

import { useT } from "@/lib/i18n/Provider";
import { cn } from "@/lib/utils";
import type { BacktestSnapshot } from "@/lib/wine/types";

interface Props {
  backtest: BacktestSnapshot;
}

const VERDICT_STYLE: Record<BacktestSnapshot["verdict"], string> = {
  high_agreement:
    "border-emerald-500/40 text-emerald-200 bg-emerald-500/10",
  moderate_agreement:
    "border-amber-500/40 text-amber-200 bg-amber-500/10",
  divergent: "border-red-500/40 text-red-200 bg-red-500/10",
};

const VERDICT_KEY: Record<BacktestSnapshot["verdict"], `backtest.verdict.${BacktestSnapshot["verdict"]}`> = {
  high_agreement: "backtest.verdict.high_agreement",
  moderate_agreement: "backtest.verdict.moderate_agreement",
  divergent: "backtest.verdict.divergent",
};

/**
 * Side-by-side comparison of our predicted score vs the real-world critic
 * + market reaction harvested by backtest_agent (via Tavily + OpenAI).
 * Only mounted when result.backtest exists (timeframe.end < today).
 */
export function BacktestCard({ backtest }: Props) {
  const t = useT();
  return (
    <article className="card-lg p-7">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="kicker">{t("backtest.title")}</p>
          <p className="kicker-strong mt-2 tabular">vintage {backtest.year}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="kicker">{t("backtest.verdict_kicker")}</p>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em]",
              VERDICT_STYLE[backtest.verdict],
            )}
          >
            {t(VERDICT_KEY[backtest.verdict])}
          </span>
        </div>
      </header>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Predicted */}
        <div className="rounded-md border border-line bg-surface-2 p-5">
          <p className="kicker">{t("backtest.predicted")}</p>
          <p className="mt-3 font-serif text-5xl font-medium tabular">
            {backtest.predictedScore}
          </p>
          {backtest.predictedBand && (
            <div className="mt-3 flex items-baseline gap-2">
              <span className="kicker">{t("backtest.our_band")}</span>
              <span className="text-sm font-medium">{backtest.predictedBand}</span>
            </div>
          )}
        </div>

        {/* Actual — critics list */}
        <div className="rounded-md border border-line bg-surface-2 p-5">
          <p className="kicker">{t("backtest.actual")}</p>
          {backtest.critics.length === 0 ? (
            <p className="mt-3 text-sm italic text-soft">
              {t("backtest.no_critics")}
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {backtest.critics.slice(0, 4).map((c, i) => (
                <li key={i} className="flex items-baseline gap-3 text-sm">
                  <span className="min-w-[88px] shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-soft">
                    {c.source}
                  </span>
                  <span className="font-mono text-xs tabular">
                    {c.score !== undefined ? `${c.score}` : ""}
                    {c.scale ? ` ${c.scale}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Accuracy paragraph */}
      <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
        {backtest.accuracySummary}
      </p>

      {/* Quotes */}
      {backtest.critics.some((c) => c.quote) && (
        <ul className="mt-5 space-y-3 border-t border-line pt-5">
          {backtest.critics.map((c, i) =>
            c.quote ? (
              <li key={i} className="text-sm leading-relaxed">
                <p className="kicker">
                  {c.source}
                  {c.url && (
                    <>
                      {" · "}
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-2 hover:underline"
                      >
                        source
                      </a>
                    </>
                  )}
                </p>
                <p className="mt-1.5 text-foreground/90">&ldquo;{c.quote}&rdquo;</p>
              </li>
            ) : null,
          )}
        </ul>
      )}
    </article>
  );
}
