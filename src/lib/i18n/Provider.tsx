"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DICT, DEFAULT_LOCALE, type DictKey, type Locale } from "@/lib/i18n/dict";

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  const t = useCallback(
    (key: DictKey, vars?: Record<string, string | number>) => {
      const entry = DICT[key];
      let str: string = entry[locale] ?? entry[DEFAULT_LOCALE] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return str;
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Convenience: get `t` directly. */
export function useT(): I18nContextValue["t"] {
  return useI18n().t;
}
