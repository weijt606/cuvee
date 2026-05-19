"use client";

import { useT } from "@/lib/i18n/Provider";
import type { GeoSnapshot } from "@/lib/wine/types";

interface Props {
  snapshot: GeoSnapshot;
}

/**
 * Renders the geo_agent's structured terroir snapshot — soil composition,
 * elevation, Gironde distance, frost-pocket signals, AOC mix. Bridges the
 * 61-château 1855 dataset to the dashboard so the rich agent output is
 * visible instead of being silently compressed into the LLM rationale.
 */
export function TerroirCard({ snapshot }: Props) {
  const t = useT();
  if (!snapshot || snapshot.notes.length === 0) return null;

  return (
    <article className="card-lg p-6">
      <header className="flex items-baseline justify-between gap-3">
        <p className="kicker">
          {t("terroir.title")}
        </p>
        {snapshot.appellations.length > 0 && (
          <p className="tabular font-mono text-[10px] text-soft">
            {snapshot.appellations.length} aoc · {snapshot.notes.length} signals
          </p>
        )}
      </header>

      <p className="mt-3 font-serif text-xl leading-snug">{snapshot.summary}</p>

      <ul className="mt-5 space-y-2.5">
        {snapshot.notes.map((note, i) => (
          <li
            key={i}
            className="flex items-start gap-3 text-sm leading-relaxed text-soft"
          >
            <span
              aria-hidden
              className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-foreground/40"
            />
            <span className="min-w-0 flex-1">{note}</span>
          </li>
        ))}
      </ul>

      {snapshot.appellations.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-1.5 border-t border-line pt-4">
          {snapshot.appellations.map((aoc) => (
            <span
              key={aoc}
              className="chip"
            >
              {aoc}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
