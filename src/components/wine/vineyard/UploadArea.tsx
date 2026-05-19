"use client";

import { useRef, useState } from "react";
import { useT } from "@/lib/i18n/Provider";
import { cn } from "@/lib/utils";
import type { UploadMeta } from "@/lib/wine/types";

interface Props {
  uploads: UploadMeta[];
  onChange: (next: UploadMeta[]) => void;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB cap per file (metadata-only path)

export function UploadArea({ uploads, onChange }: Props) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const additions: UploadMeta[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_SIZE) continue;
      additions.push({
        name: f.name,
        size: f.size,
        mime: f.type || "application/octet-stream",
      });
    }
    onChange([...uploads, ...additions]);
  }

  function remove(idx: number) {
    onChange(uploads.filter((_, i) => i !== idx));
  }

  return (
    <div className="rounded-card border border-line p-4">
      <h3 className="kicker">
        {t("vineyard.upload.title")}
      </h3>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "mt-3 cursor-pointer rounded-lg border-2 border-dashed p-6 text-center text-sm transition",
          dragging ? "border-foreground bg-surface-2" : "border-line hover:bg-surface-1",
        )}
      >
        <p className="text-soft">{t("vineyard.upload.hint")}</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.csv,.xlsx,.png,.jpg,.jpeg"
          onChange={(e) => {
            addFiles(e.target.files);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>
      {uploads.length === 0 ? (
        <p className="mt-3 text-xs text-soft">{t("vineyard.upload.empty")}</p>
      ) : (
        <>
          <ul className="mt-3 space-y-1">
            {uploads.map((u, i) => (
              <li
                key={`${u.name}-${i}`}
                className="flex items-center gap-2 rounded-md border border-line bg-surface-1 px-3 py-2 text-xs"
              >
                <span className="flex-1 truncate">{u.name}</span>
                <span className="tabular font-mono text-soft">
                  {(u.size / 1024).toFixed(1)} KB
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="ml-1 text-soft hover:text-red-400"
                  aria-label={t("vineyard.upload.remove")}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 rounded-md bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">
            ✓ {t("vineyard.upload.context_badge", { n: uploads.length })}
          </p>
        </>
      )}
    </div>
  );
}
