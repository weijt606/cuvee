"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useT } from "@/lib/i18n/Provider";
import { demoSentiment, type SentimentSlice } from "@/lib/demo/charts";

const COLORS: Record<SentimentSlice["label"], string> = {
  positive: "hsl(var(--chart-3))",   // sage
  neutral: "hsl(var(--muted-foreground) / 0.45)",
  negative: "hsl(var(--chart-1))",   // bordeaux
};

export function SentimentDonut({ regionId }: { regionId: string }) {
  const t = useT();
  const data = demoSentiment(regionId);
  return (
    <figure className="card-lg p-6">
      <figcaption className="kicker mb-4">
        {t("trade.charts.sentiment")}
      </figcaption>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={56}
            outerRadius={86}
            paddingAngle={2}
            stroke="hsl(var(--background))"
            strokeWidth={2}
            animationDuration={900}
            animationEasing="ease-out"
          >
            {data.map((d) => (
              <Cell key={d.label} fill={COLORS[d.label]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v, n) => [`${v}%`, String(n ?? "")]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 kicker">
        {data.map((d) => (
          <span key={d.label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: COLORS[d.label] }}
            />
            {d.label} · {d.value}%
          </span>
        ))}
      </div>
    </figure>
  );
}
