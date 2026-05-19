"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface Props {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
  drawerOpen?: boolean;
  drawerLabel?: string;
  onDrawerClose?: () => void;
  drawer?: React.ReactNode;
}

/**
 * Three-column atlas shell — left list / center map / right detail.
 * Fills the viewport below the 64px top nav. Each column scrolls independently.
 * Drawer slot overlays the map (and right column) with a glass panel that can
 * be dismissed via Escape or its close button.
 */
export function AtlasShell({
  left,
  center,
  right,
  drawerOpen,
  drawerLabel,
  onDrawerClose,
  drawer,
}: Props) {
  useEffect(() => {
    if (!drawerOpen || !onDrawerClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDrawerClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, onDrawerClose]);

  return (
    <main
      className="relative grid h-[calc(100vh-4rem)] w-full overflow-hidden bg-background"
      style={{ gridTemplateColumns: "320px 1fr 380px" }}
    >
      <aside className="glass relative flex min-h-0 flex-col overflow-hidden border-r border-line">
        {left}
      </aside>

      <section className="relative min-h-0 overflow-hidden bg-background">
        {center}
      </section>

      <aside className="glass relative flex min-h-0 flex-col overflow-y-auto border-l border-line">
        {right}
      </aside>

      {drawer && (
        <div
          className={cn(
            "absolute inset-y-0 right-[380px] left-[320px] z-[1100] flex flex-col overflow-hidden",
            "transition-transform duration-300 ease-out",
            drawerOpen
              ? "translate-x-0"
              : "pointer-events-none translate-x-[calc(100%+380px)]",
          )}
          aria-hidden={!drawerOpen}
        >
          <div className="glass-strong flex h-full flex-col overflow-hidden border-l border-line">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-7 py-4">
              <p className="kicker">{drawerLabel ?? "Analysis"}</p>
              {onDrawerClose && (
                <button
                  type="button"
                  onClick={onDrawerClose}
                  aria-label="Close analysis"
                  className="icon-btn"
                >
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M6 6l12 12M18 6l-12 12" />
                  </svg>
                </button>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">{drawer}</div>
          </div>
        </div>
      )}
    </main>
  );
}
