"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useT } from "@/lib/i18n/Provider";
import { BORDEAUX_BENCHMARKS } from "@/lib/wine/bordeaux-benchmarks";

// Score gradient: sage → gold → cognac → bordeaux.
function color(score: number): string {
  if (score < 40) return "hsl(var(--chart-3))";
  if (score < 55) return "hsl(var(--chart-5))";
  if (score < 70) return "hsl(var(--chart-2))";
  return "hsl(var(--chart-1))";
}

export function RegionalRiskChart({ selectedId }: { selectedId: string }) {
  const t = useT();
  const data = BORDEAUX_BENCHMARKS.map((b) => ({
    name: b.name,
    score: b.score,
    active: b.id === selectedId,
  }));
  return (
    <figure className="card-lg p-6">
      <figcaption className="kicker mb-4">
        {t("trade.charts.regional")}
      </figcaption>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 4 }}>
          <XAxis
            dataKey="name"
            interval={0}
            stroke="hsl(var(--soft))"
            fontSize={10}
            angle={-15}
            textAnchor="end"
            height={54}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            stroke="hsl(var(--soft))"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-2)", opacity: 0.4 }}
            contentStyle={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v) => [`${v}`, "score"]}
          />
          <Bar dataKey="score" radius={[3, 3, 0, 0]} animationDuration={800} animationEasing="ease-out">
            {data.map((d) => (
              <Cell
                key={d.name}
                fill={color(d.score)}
                stroke={d.active ? "hsl(var(--foreground))" : "transparent"}
                strokeWidth={d.active ? 1.5 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
