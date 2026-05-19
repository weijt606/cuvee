"use client";

import { useT } from "@/lib/i18n/Provider";
import { cn } from "@/lib/utils";
import type { TradePersona } from "@/lib/wine/types";

interface Props {
  value: TradePersona;
  onChange: (next: TradePersona) => void;
}

const PERSONAS: TradePersona[] = ["merchant", "restaurant", "wineshop"];

/**
 * Three-way segmented switcher for the trade dashboard. The selection feeds
 * (1) the LLM prompt lens in extraction + feature, (2) which result cards
 * render below the map.
 */
export function TradePersonaTabs({ value, onChange }: Props) {
  const t = useT();
  return (
    <div
      role="tablist"
      aria-label="Trade sub-persona"
      className="inline-flex rounded-sm border bg-background p-0.5 text-[10px]"
    >
      {PERSONAS.map((p) => {
        const active = p === value;
        return (
          <button
            key={p}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(p)}
            className={cn(
              "rounded-[3px] px-3 py-1.5 uppercase tracking-luxe transition",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t(`trade.persona.${p}` as const)}
          </button>
        );
      })}
    </div>
  );
}
