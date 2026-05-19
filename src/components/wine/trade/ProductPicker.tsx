"use client";

import { useId, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/Provider";
import { PRODUCTS, type Product } from "@/lib/wine/products";

interface Props {
  value?: string | null;                              // product.id
  onChange: (product: Product | null) => void;
}

/**
 * Curated wine-product combobox. Built on a native <input list=…> datalist
 * so we get OS-native typeahead + accessibility for free, with zero
 * dependency on a third-party combobox. Matching is case- and
 * accent-insensitive on name + AOC + classification.
 *
 * Selecting a product fires onChange with the full Product (the trade
 * dashboard uses its region + chateau pointers to set state and fly the
 * map). Typing then clearing the field fires onChange(null).
 */
export function ProductPicker({ value, onChange }: Props) {
  const t = useT();
  const listId = useId();

  const current = useMemo(
    () => (value ? PRODUCTS.find((p) => p.id === value) : undefined),
    [value],
  );

  // Local mirror of the input text so the user can type freely without losing
  // focus on every keystroke. Committed value is whatever the user picks.
  const [text, setText] = useState(current ? labelFor(current) : "");

  // Keep text in sync when an external selection happens (e.g. map click).
  useMemo(() => {
    if (current && labelFor(current) !== text) setText(labelFor(current));
    if (!current && value === null) setText("");
    // intentionally not depending on `text` — this is a one-way "external → local" sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commit(input: string) {
    setText(input);
    const trimmed = input.trim();
    if (!trimmed) {
      onChange(null);
      return;
    }
    const hit =
      PRODUCTS.find((p) => labelFor(p) === trimmed) ??
      PRODUCTS.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (hit) onChange(hit);
  }

  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="text-[10px] uppercase tracking-luxe text-muted-foreground">
        {t("trade.product.label")}
      </span>
      <input
        type="text"
        value={text}
        list={listId}
        onChange={(e) => commit(e.target.value)}
        placeholder={t("trade.product.placeholder")}
        className="h-10 rounded-sm border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <datalist id={listId}>
        {PRODUCTS.map((p) => (
          <option key={p.id} value={labelFor(p)} />
        ))}
      </datalist>
    </label>
  );
}

function labelFor(p: Product): string {
  // " · " separator renders cleanly in the native datalist popover on macOS / Win.
  const cls = p.classification ? ` (${p.classification})` : "";
  return `${p.name}${cls} · ${p.aoc}`;
}
