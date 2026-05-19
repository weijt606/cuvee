"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useT } from "@/lib/i18n/Provider";
import { demoWeatherTimeseries } from "@/lib/demo/charts";

const MONTH_SHORT_FR = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
const MONTH_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortMonth(yyyymm: string, locale: "fr" | "en"): string {
  const m = parseInt(yyyymm.slice(-2), 10);
  if (Number.isNaN(m)) return yyyymm;
  const table = locale === "fr" ? MONTH_SHORT_FR : MONTH_SHORT_EN;
  return table[m - 1] ?? yyyymm;
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

export function WeatherLineChart({ regionId }: { regionId: string }) {
  const t = useT();
  // We don't have direct access to the active locale string here; we read it
  // out of the document if possible. Default to French for the month labels.
  const locale: "fr" | "en" =
    (typeof document !== "undefined" && document.documentElement.lang === "fr") ? "fr" : "en";
  const data = demoWeatherTimeseries(regionId);
  const avgTemp = avg(data.map((d) => d.tempAnomalyC));
  const totalPrecip = sum(data.map((d) => d.precipMm));
  const totalFrost = sum(data.map((d) => d.frostDays));

  return (
    <figure className="card-lg p-6">
      <figcaption className="kicker mb-4">
        {t("trade.charts.weather")}
      </figcaption>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="temp-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.24} />
              <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="2 4" stroke="var(--line)" vertical={false} />

          <XAxis
            dataKey="month"
            stroke="hsl(var(--soft))"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            tickFormatter={(v) => shortMonth(v, locale)}
          />
          <YAxis
            yAxisId="temp"
            orientation="left"
            stroke="hsl(var(--soft))"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={32}
            tickFormatter={(v) => `${v}°`}
          />
          <YAxis
            yAxisId="precip"
            orientation="right"
            stroke="hsl(var(--soft))"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={32}
          />

          <ReferenceLine
            yAxisId="temp"
            y={0}
            stroke="hsl(var(--soft))"
            strokeDasharray="3 3"
            strokeOpacity={0.5}
          />

          <Tooltip
            cursor={{ stroke: "var(--line)", strokeWidth: 1 }}
            contentStyle={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              fontSize: 12,
              padding: "8px 12px",
            }}
            labelFormatter={(label) => shortMonth(String(label), locale)}
            formatter={(value, name) => {
              if (name === t("trade.charts.weather.temp")) return [`${value}°C`, name];
              if (name === t("trade.charts.weather.precip")) return [`${value} mm`, name];
              if (name === t("trade.charts.weather.frost")) return [`${value} d`, name];
              return [value, name];
            }}
          />

          <Legend
            wrapperStyle={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              paddingTop: 8,
            }}
            iconType="line"
            iconSize={14}
          />

          {/* Frost days — subtle slim bars on temp axis. */}
          <Bar
            yAxisId="temp"
            dataKey="frostDays"
            fill="hsl(var(--chart-3))"
            fillOpacity={0.42}
            barSize={6}
            radius={[1, 1, 0, 0]}
            name={t("trade.charts.weather.frost")}
          />

          {/* Precipitation — line with dots on right axis. */}
          <Line
            yAxisId="precip"
            type="monotone"
            dataKey="precipMm"
            stroke="hsl(var(--chart-4))"
            strokeWidth={2}
            dot={{
              r: 2.5,
              fill: "hsl(var(--chart-4))",
              stroke: "hsl(var(--background))",
              strokeWidth: 1.2,
            }}
            activeDot={{ r: 5, strokeWidth: 2 }}
            animationDuration={900}
            animationEasing="ease-out"
            name={t("trade.charts.weather.precip")}
          />

          {/* Temperature anomaly — gradient area + line + dots on left axis. */}
          <Area
            yAxisId="temp"
            type="monotone"
            dataKey="tempAnomalyC"
            fill="url(#temp-gradient)"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2.5}
            dot={{
              r: 3,
              fill: "hsl(var(--chart-1))",
              stroke: "hsl(var(--background))",
              strokeWidth: 1.5,
            }}
            activeDot={{ r: 5.5, strokeWidth: 2 }}
            animationDuration={900}
            animationEasing="ease-out"
            name={t("trade.charts.weather.temp")}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Footer KPIs — telemetry-feel summary of the 12-month window. */}
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-line pt-4">
        <KpiCell
          label={t("trade.charts.weather.avg_temp")}
          value={`${avgTemp >= 0 ? "+" : ""}${avgTemp.toFixed(1)}°C`}
          accent="hsl(var(--chart-1))"
        />
        <KpiCell
          label={t("trade.charts.weather.total_precip")}
          value={`${Math.round(totalPrecip)} mm`}
          accent="hsl(var(--chart-4))"
        />
        <KpiCell
          label={t("trade.charts.weather.total_frost")}
          value={`${Math.round(totalFrost)} d`}
          accent="hsl(var(--chart-3))"
        />
      </div>
    </figure>
  );
}

function KpiCell({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="kicker flex items-center gap-1.5">
        <span className="inline-block h-1 w-3 rounded-full" style={{ background: accent }} />
        {label}
      </span>
      <span className="tabular font-mono text-sm">{value}</span>
    </div>
  );
}
