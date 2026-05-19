"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/Provider";

export function EntryChoice() {
  const t = useT();
  return (
    <main className="container mx-auto max-w-5xl px-6 py-24 md:py-32">
      <header className="mb-20 text-center">
        <p className="kicker">{t("common.app_name")}</p>
        <h1 className="mx-auto mt-8 max-w-3xl text-balance font-serif text-5xl font-medium leading-[1.1] tracking-tight md:text-6xl">
          {t("landing.tagline")}
        </h1>
        <p className="kicker mt-10">— {t("landing.choose_entry")} —</p>
      </header>

      <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-2">
        <EntryCard
          href="/vineyard"
          index="01"
          title={t("landing.vineyard.title")}
          subtitle={t("landing.vineyard.subtitle")}
          cta={t("landing.vineyard.cta")}
        />
        <EntryCard
          href="/trade"
          index="02"
          title={t("landing.trade.title")}
          subtitle={t("landing.trade.subtitle")}
          cta={t("landing.trade.cta")}
        />
      </div>
    </main>
  );
}

function EntryCard({
  href,
  index,
  title,
  subtitle,
  cta,
}: {
  href: string;
  index: string;
  title: string;
  subtitle: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex min-h-[340px] flex-col justify-between bg-panel-strong p-10 transition-colors hover:bg-surface-3 md:p-14"
    >
      <span className="kicker tabular">{index}</span>
      <div className="space-y-4">
        <h2 className="font-serif text-5xl font-medium leading-none tracking-tight md:text-6xl">
          {title}
        </h2>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
      </div>
      <span className="inline-flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-foreground">
        {cta}
        <span aria-hidden className="h-px w-8 bg-foreground transition-all group-hover:w-14" />
      </span>
    </Link>
  );
}
