"use client";

import { useT } from "@/lib/i18n/Provider";

interface Props {
  text: string;
}

/**
 * Single-card editorial summary surfaced above the risk card. The text is
 * produced by feature_agent (OpenAI-driven) and rendered in the serif
 * display face for a "lead paragraph" feel.
 */
export function ExecutiveSummary({ text }: Props) {
  const t = useT();
  return (
    <article className="card-lg p-6">
      <p className="kicker">
        {t("feature.summary.title")}
      </p>
      <p className="mt-3 font-serif text-2xl leading-snug text-foreground">
        {text}
      </p>
    </article>
  );
}
