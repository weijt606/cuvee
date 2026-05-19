"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useT } from "@/lib/i18n/Provider";
import type { RiskDriver } from "@/lib/wine/types";

// Source-coded palette aligned with the wine theme tokens.
const COLORS: Record<RiskDriver["source"], string> = {
  weather: "hsl(var(--chart-4))",    // navy
  geo: "hsl(var(--chart-2))",        // cognac
  tavily: "hsl(var(--chart-5))",     // gold
  extraction: "hsl(var(--chart-1))", // bordeaux
};

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * Consulting-firm-style callout: % printed inside each slice in white,
 * a hinged leader line from the slice edge to a horizontal stub on the
 * outside, ending in label (source) over description (signal). Radially
 * distributed around the donut — reads cleanly without a separate legend.
 */
type CalloutProps = {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  payload?: { value?: number; name?: string; signal?: string; fill?: string };
};

function renderCallout(props: CalloutProps) {
  const cx = props.cx ?? 0;
  const cy = props.cy ?? 0;
  const midAngle = props.midAngle ?? 0;
  const innerRadius = props.innerRadius ?? 0;
  const outerRadius = props.outerRadius ?? 0;
  const value = props.payload?.value ?? 0;
  const name = props.payload?.name ?? "";
  const signal = props.payload?.signal ?? "";
  const fill = props.payload?.fill ?? "hsl(var(--foreground))";

  const RAD = Math.PI / 180;

  // 1) percent inside the donut ring
  const ringR = (innerRadius + outerRadius) / 2;
  const ix = cx + ringR * Math.cos(-midAngle * RAD);
  const iy = cy + ringR * Math.sin(-midAngle * RAD);

  // 2) leader line: slice edge → small radial elbow → horizontal stub
  const p1x = cx + outerRadius * Math.cos(-midAngle * RAD);
  const p1y = cy + outerRadius * Math.sin(-midAngle * RAD);
  const r2 = outerRadius + 16;
  const p2x = cx + r2 * Math.cos(-midAngle * RAD);
  const p2y = cy + r2 * Math.sin(-midAngle * RAD);
  const isRight = p2x > cx;
  const stubLen = 14;
  const stubEndX = isRight ? p2x + stubLen : p2x - stubLen;
  const labelX = isRight ? stubEndX + 4 : stubEndX - 4;
  const anchor = isRight ? "start" : "end";

  return (
    <g>
      {/* percent printed inside the slice */}
      <text
        x={ix}
        y={iy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight={700}
        fill="hsl(var(--background))"
        style={{ fontVariantNumeric: "tabular-nums", pointerEvents: "none" }}
      >
        {value}%
      </text>

      {/* leader: radial elbow + horizontal stub */}
      <polyline
        points={`${p1x},${p1y} ${p2x},${p2y} ${stubEndX},${p2y}`}
        fill="none"
        stroke="hsl(var(--soft))"
        strokeOpacity={0.7}
        strokeWidth={0.6}
      />
      <circle cx={stubEndX} cy={p2y} r={1.4} fill={fill} />

      {/* outer label: source (small caps) over signal description */}
      <text
        x={labelX}
        y={p2y - 5}
        textAnchor={anchor}
        fontSize={9.5}
        fontWeight={600}
        fill="hsl(var(--foreground))"
        style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
      >
        {name}
      </text>
      <text
        x={labelX}
        y={p2y + 7}
        textAnchor={anchor}
        fontSize={9}
        fill="hsl(var(--soft))"
      >
        {truncate(signal, 32)}
      </text>
    </g>
  );
}

export function DriverDonutChart({ drivers }: { drivers: RiskDriver[] }) {
  const t = useT();
  const data = drivers.map((d) => ({
    name: d.source,
    value: Math.round(d.weight * 100),
    signal: d.signal,
    fill: COLORS[d.source],
  }));

  return (
    <figure className="card-lg p-6">
      <figcaption className="kicker mb-2">
        {t("trade.charts.drivers")}
      </figcaption>

      <ResponsiveContainer width="100%" height={400}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="22%"
            outerRadius="38%"
            paddingAngle={1.5}
            stroke="hsl(var(--background))"
            strokeWidth={2}
            animationDuration={900}
            animationEasing="ease-out"
            label={renderCallout}
            labelLine={false}
          >
            {data.map((d, i) => (
              // Drivers may share a `source` (e.g. two "weather" entries),
              // so name alone is not unique — composite key keeps React happy.
              <Cell key={`${d.name}-${i}`} fill={d.fill} />
            ))}
          </Pie>
          <Tooltip
            wrapperStyle={{ outline: "none" }}
            contentStyle={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              fontSize: 12,
              padding: "8px 12px",
              maxWidth: 280,
              whiteSpace: "normal",
            }}
            itemStyle={{ whiteSpace: "normal" }}
            formatter={(value, _name, item) => {
              const signal = (item?.payload as { signal?: string } | undefined)?.signal;
              return [`${value}% · ${signal ?? ""}`, ""];
            }}
            separator=""
          />
        </PieChart>
      </ResponsiveContainer>
    </figure>
  );
}
