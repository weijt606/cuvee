"use client";

import { useT } from "@/lib/i18n/Provider";

interface Props {
  /** Optional markdown report from feature_agent. If present, a second
   *  button offers a direct .md download alongside browser-print. */
  reportMarkdown?: string;
  /** Filename suggestion (defaults to "wine-signals-report.md"). */
  filename?: string;
}

function downloadMarkdown(name: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportButton({ reportMarkdown, filename }: Props) {
  const t = useT();
  return (
    <div className="inline-flex gap-2 print:hidden">
      {reportMarkdown && (
        <button
          type="button"
          onClick={() => downloadMarkdown(filename ?? "wine-signals-report.md", reportMarkdown)}
          className="chip transition-opacity hover:opacity-80"
        >
          {t("feature.report.download")}
        </button>
      )}
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-pill bg-foreground px-4 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-background hover:opacity-90 disabled:opacity-50"
      >
        {t("common.export_report")}
      </button>
    </div>
  );
}
