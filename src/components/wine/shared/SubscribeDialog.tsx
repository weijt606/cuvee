"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/Provider";
import type { Persona } from "@/lib/wine/types";

interface Props {
  regionId?: string;
  persona?: Persona;
  /** Optional preview text from feature_agent; shown as a sample of the
   *  digest content the subscriber will receive. */
  digestPreview?: string;
}

export function SubscribeDialog({ regionId, persona, digestPreview }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, regionId, persona }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        setEmail("");
      }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscribe failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="chip print:hidden"
      >
        {t("common.subscribe")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 print:hidden"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="glass-strong w-full max-w-md rounded-card p-8 panel-shadow"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="kicker">{t("common.subscribe")}</p>
            <h3 className="mt-2 font-serif text-3xl font-medium leading-tight">
              {t("subscribe.title")}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-soft">
              {t("subscribe.description")}
            </p>

            {digestPreview && (
              <div className="mt-5 rounded-md border border-line bg-surface-2 p-4">
                <p className="kicker">{t("subscribe.preview_label")}</p>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground">
                  {digestPreview}
                </pre>
              </div>
            )}

            {success ? (
              <p className="mt-6 rounded-md bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                ✓ {t("subscribe.success")}
              </p>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-4">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("subscribe.email_placeholder")}
                  className="w-full rounded-md border border-line bg-surface-2 px-4 py-2.5 text-sm focus:border-line-strong focus:bg-surface-3 focus:outline-none"
                  disabled={submitting}
                />
                {error && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </p>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={submitting}
                    className="chip"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-pill bg-foreground px-5 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {submitting ? t("common.running") : t("common.confirm")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
