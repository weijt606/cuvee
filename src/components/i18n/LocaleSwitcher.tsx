"use client";

import { useI18n } from "@/lib/i18n/Provider";
import { LOCALES } from "@/lib/i18n/dict";
import { cn } from "@/lib/utils";

export function LocaleSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="inline-flex rounded-pill border border-line bg-surface-1 p-1 text-[10px]">
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLocale(l.code)}
          className={cn(
            "rounded-pill px-2.5 py-1 font-bold uppercase tracking-[0.18em] transition-colors",
            locale === l.code
              ? "bg-foreground text-background"
              : "text-soft hover:text-foreground",
          )}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
