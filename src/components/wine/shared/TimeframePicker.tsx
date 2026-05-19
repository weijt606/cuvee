"use client";

import { useState } from "react";
import { useI18n, useT } from "@/lib/i18n/Provider";
import { cn } from "@/lib/utils";
import type { Timeframe } from "@/lib/wine/types";
import type { Locale } from "@/lib/i18n/dict";

type Mode = "year" | "month" | "range";

interface Props {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
}

const INTL_LOCALE: Record<Locale, string> = { fr: "fr-FR", en: "en-US" };

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
function tfYear(year: number): Timeframe {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}
function tfMonth(year: number, month: number): Timeframe {
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
  };
}

export function TimeframePicker({ value, onChange }: Props) {
  const t = useT();
  const { locale } = useI18n();
  const now = new Date();
  const [mode, setMode] = useState<Mode>("year");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const yearOptions = [-2, -1, 0, 1, 2].map((d) => now.getFullYear() + d);
  const monthFormatter = new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "long" });

  function changeMode(m: Mode) {
    setMode(m);
    if (m === "year") onChange(tfYear(year));
    else if (m === "month") onChange(tfMonth(year, month));
    // range: keep current value
  }
  function changeYear(y: number) {
    setYear(y);
    if (mode === "year") onChange(tfYear(y));
    else if (mode === "month") onChange(tfMonth(y, month));
  }
  function changeMonth(m: number) {
    setMonth(m);
    if (mode === "month") onChange(tfMonth(year, m));
  }

  return (
    <div className="space-y-2">
      <span className="kicker">{t("common.timeframe")}</span>

      <div className="inline-flex w-full rounded-pill border border-line bg-surface-1 p-0.5 text-xs">
        {(["year", "month", "range"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => changeMode(m)}
            aria-pressed={mode === m}
            className={cn(
              "chip flex-1 transition",
              mode === m
                ? "bg-foreground text-background"
                : "text-soft hover:bg-surface-2",
            )}
          >
            {t(`timeframe.mode.${m}` as const)}
          </button>
        ))}
      </div>

      {mode === "year" && (
        <select
          value={year}
          onChange={(e) => changeYear(Number(e.target.value))}
          className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
          aria-label={t("timeframe.label.year")}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      )}

      {mode === "month" && (
        <div className="grid grid-cols-2 gap-2">
          <select
            value={year}
            onChange={(e) => changeYear(Number(e.target.value))}
            className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
            aria-label={t("timeframe.label.year")}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => changeMonth(Number(e.target.value))}
            className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
            aria-label={t("timeframe.label.month")}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {monthFormatter.format(new Date(2000, m - 1, 1))}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "range" && (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
            aria-label={t("common.start_date")}
          />
          <input
            type="date"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
            aria-label={t("common.end_date")}
          />
        </div>
      )}

      <p className="font-mono tabular kicker">
        {value.start} → {value.end}
      </p>
    </div>
  );
}
