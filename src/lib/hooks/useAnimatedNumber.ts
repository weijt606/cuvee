"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Count-up animation for a numeric value. Tiny RAF-based easing — no
 * runtime dep. Returns the currently-displayed value; updates smoothly
 * when `target` changes.
 *
 * Use for: risk scores, KPI tiles, anywhere a number transition adds polish.
 */
export function useAnimatedNumber(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === target) return;
    fromRef.current = value;
    startRef.current = null;

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / durationMs);
      const next = fromRef.current + (target - fromRef.current) * easeOut(t);
      setValue(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return value;
}
