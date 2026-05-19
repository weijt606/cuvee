"use client";

import { Fragment, type ReactNode } from "react";
import { useT } from "@/lib/i18n/Provider";

interface Props {
  markdown: string;
}

/**
 * Minimal markdown renderer for feature_agent's reportMarkdown. We only
 * need to handle the subset the prompt actually produces:
 *
 *   # H1  /  ## H2  /  ### H3
 *   **bold** spans inside paragraphs and list items
 *   numbered lists  ("1. text")
 *   bullet lists    ("- text")
 *   tables          ("| a | b |" with a separator row of "| --- | --- |")
 *   plain paragraphs
 *
 * Pulling in react-markdown + remark-gfm just for this would be ~80 KB of
 * client JS. This file is ~100 lines and produces semantic HTML the rest
 * of the dashboard's prose styling can target.
 */
export function FullReportCard({ markdown }: Props) {
  const t = useT();
  return (
    <article className="rounded-md border bg-card p-8">
      <p className="text-[10px] uppercase tracking-luxe text-muted-foreground">
        {t("feature.report.title")}
      </p>
      <div className="mt-4 wine-report">{renderMarkdown(markdown)}</div>
    </article>
  );
}

/**
 * Splits markdown text into block-level chunks (headings, paragraphs,
 * lists, tables) and renders each. Returns an array of React nodes.
 */
function renderMarkdown(src: string): ReactNode {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      const text = h[2]!;
      const cls =
        level === 1
          ? "mt-2 mb-3 font-serif text-2xl font-medium tracking-tight"
          : level === 2
            ? "mt-6 mb-2 font-serif text-lg font-medium"
            : "mt-4 mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground";
      out.push(
        level === 1 ? (
          <h2 key={key++} className={cls}>
            {inline(text)}
          </h2>
        ) : level === 2 ? (
          <h3 key={key++} className={cls}>
            {inline(text)}
          </h3>
        ) : (
          <h4 key={key++} className={cls}>
            {inline(text)}
          </h4>
        ),
      );
      i++;
      continue;
    }

    // Table — header row followed by separator row of dashes.
    if (line.startsWith("|") && (lines[i + 1] ?? "").match(/^\|[\s\-:|]+\|$/)) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").startsWith("|")) {
        rows.push(splitRow(lines[i]!));
        i++;
      }
      out.push(
        <div key={key++} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                {header.map((h, k) => (
                  <th
                    key={k}
                    className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-luxe text-muted-foreground"
                  >
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-border/40 last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-3 py-2 align-top text-sm leading-relaxed">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push(
        <ol key={key++} className="my-2 list-decimal space-y-2 pl-6 text-sm leading-relaxed">
          {items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={key++} className="my-2 list-disc space-y-1.5 pl-6 text-sm leading-relaxed">
          {items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Plain paragraph — group consecutive non-empty non-special lines.
    const buf: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (
        !next.trim() ||
        /^(#{1,3})\s+/.test(next) ||
        /^\s*\d+\.\s+/.test(next) ||
        /^\s*[-*]\s+/.test(next) ||
        next.startsWith("|")
      ) {
        break;
      }
      buf.push(next);
      i++;
    }
    out.push(
      <p key={key++} className="my-3 text-sm leading-relaxed">
        {inline(buf.join(" "))}
      </p>,
    );
  }

  return out;
}

function splitRow(line: string): string[] {
  // Strip leading/trailing pipes, then split on pipes that aren't escaped.
  const inner = line.replace(/^\||\|$/g, "");
  return inner.split("|").map((c) => c.trim());
}

/** Inline parsing — currently only handles **bold**. Everything else renders as plain text. */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}
