"use client";

import { useT } from "@/lib/i18n/Provider";
import { cn } from "@/lib/utils";

export type AgentState = "pending" | "running" | "ok" | "fail" | "skipped";

export type NodeKey =
  | "input"
  | "orchestrator"
  | "weather_agent"
  | "geo_agent"
  | "tavily_agent"
  | "extraction_agent"
  | "pioneer"
  | "feature_agent"
  | "backtest_agent"
  | "dashboard";

export interface WorkflowState {
  input: AgentState;
  orchestrator: AgentState;
  weather_agent: AgentState;
  geo_agent: AgentState;
  tavily_agent: AgentState;
  extraction_agent: AgentState;
  pioneer: AgentState;
  feature_agent: AgentState;
  backtest_agent: AgentState;
  dashboard: AgentState;
}

export const INITIAL_WORKFLOW: WorkflowState = {
  input: "ok", // user-provided input is always ready when run is invoked
  orchestrator: "pending",
  weather_agent: "pending",
  geo_agent: "pending",
  tavily_agent: "pending",
  extraction_agent: "pending",
  pioneer: "pending",
  feature_agent: "pending",
  backtest_agent: "pending",
  dashboard: "pending",
};

type NodeKind = "input" | "router" | "agent" | "tool" | "output";

interface NodeDef {
  cx: number;
  cy: number;
  w: number;
  h: number;
  label: string;
  sub: string;
  icon: string;
  kind: NodeKind;
}

// n8n-inspired vertical flow. ViewBox is 180 wide; layout is centered on x=90.
// Pioneer is a sidecar to extraction reached via a dashed "tool call" edge.
const NODES: Record<NodeKey, NodeDef> = {
  input:             { cx: 90, cy: 14,  w: 70, h: 18, label: "input",        sub: "user request",     icon: "I", kind: "input" },
  orchestrator:      { cx: 90, cy: 42,  w: 70, h: 20, label: "orchestrator", sub: "openai tool-use",  icon: "O", kind: "router" },
  weather_agent:     { cx: 28, cy: 76,  w: 44, h: 16, label: "weather",      sub: "climate",          icon: "W", kind: "agent" },
  geo_agent:         { cx: 90, cy: 76,  w: 44, h: 16, label: "geo",          sub: "terroir",          icon: "G", kind: "agent" },
  tavily_agent:      { cx: 152, cy: 76, w: 44, h: 16, label: "tavily",       sub: "public web",       icon: "T", kind: "agent" },
  extraction_agent:  { cx: 78, cy: 108, w: 70, h: 20, label: "extraction",   sub: "risk evaluator",   icon: "E", kind: "router" },
  feature_agent:     { cx: 78, cy: 138, w: 70, h: 20, label: "feature",      sub: "summary · report", icon: "F", kind: "agent" },
  pioneer:           { cx: 156, cy: 138,w: 36, h: 14, label: "pioneer",      sub: "wine LLM",         icon: "P", kind: "tool" },
  backtest_agent:    { cx: 78, cy: 168, w: 70, h: 18, label: "backtest",     sub: "tavily · critics",  icon: "B", kind: "agent" },
  dashboard:         { cx: 78, cy: 196, w: 70, h: 18, label: "dashboard",    sub: "result",           icon: "D", kind: "output" },
};

interface Edge {
  from: NodeKey;
  to: NodeKey;
  /** Tool call (Pioneer): dashed horizontal connector. */
  style?: "tool";
}

const EDGES: Edge[] = [
  { from: "input", to: "orchestrator" },
  { from: "orchestrator", to: "weather_agent" },
  { from: "orchestrator", to: "geo_agent" },
  { from: "orchestrator", to: "tavily_agent" },
  { from: "weather_agent", to: "extraction_agent" },
  { from: "geo_agent", to: "extraction_agent" },
  { from: "tavily_agent", to: "extraction_agent" },
  { from: "extraction_agent", to: "feature_agent" },
  { from: "feature_agent", to: "pioneer", style: "tool" },
  { from: "feature_agent", to: "backtest_agent" },
  { from: "backtest_agent", to: "dashboard" },
];

const KIND_ACCENT: Record<NodeKind, string> = {
  input: "hsl(var(--muted-foreground))",
  router: "hsl(var(--chart-1))",     // bordeaux — orchestrator / extraction
  agent: "hsl(var(--chart-4))",      // navy — data-collection sub-agents
  tool: "hsl(var(--chart-5))",       // gold — external tool calls (Pioneer)
  output: "hsl(var(--foreground))",
};

function bezier(fromX: number, fromY: number, toX: number, toY: number, kind: "vertical" | "horizontal" = "vertical"): string {
  if (kind === "horizontal") {
    const midX = (fromX + toX) / 2;
    return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
  }
  const midY = (fromY + toY) / 2;
  return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
}

export interface NodeDetail {
  durationMs?: number;
  summary?: string;
  error?: string;
}

interface Props {
  state: WorkflowState;
  details?: Partial<Record<NodeKey, NodeDetail>>;
  /**
   * Whether the user attached uploads on the vineyard side. When true, a
   * dashed gold "uploads" edge is drawn from INPUT directly to EXTRACTION
   * to represent the direct entry path (bypassing GPT routing).
   */
  hasUploads?: boolean;
  /**
   * When true, hide the bottom per-agent detail list. The DAG alone fits
   * vertically — useful when the surrounding hero already surfaces status.
   */
  compact?: boolean;
}

export function WorkflowTrace({ state, details, hasUploads = false, compact = false }: Props) {
  const t = useT();

  const doneCount = (Object.values(state) as AgentState[]).filter(
    (s) => s === "ok" || s === "fail",
  ).length;
  const total = Object.keys(NODES).length;
  const totalMs = Object.values(details ?? {}).reduce(
    (acc, d) => acc + (d?.durationMs ?? 0),
    0,
  );

  return (
    <section className="card-sm p-5">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <span className="kicker">{t("workflow.title")}</span>
        <span className="font-mono tabular kicker">
          {doneCount}/{total}
          {totalMs > 0 && ` · ${totalMs}ms`}
        </span>
      </header>

      <svg
        viewBox="0 0 200 215"
        className="block w-full"
        role="img"
        aria-label={t("workflow.title")}
      >
        <defs>
          {/* dotted background — subtle "canvas" hint */}
          <pattern id="wf-grid" patternUnits="userSpaceOnUse" width="6" height="6">
            <circle cx="3" cy="3" r="0.35" fill="hsl(var(--muted-foreground))" opacity="0.18" />
          </pattern>
          <marker
            id="wf-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="3.5"
            markerHeight="3.5"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
          </marker>
          <marker
            id="wf-arrow-active"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="3.5"
            markerHeight="3.5"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--foreground))" />
          </marker>
        </defs>

        <rect x="0" y="0" width="200" height="215" fill="url(#wf-grid)" />

        {/* Direct-entry "uploads" edge — bypasses GPT routing, INPUT → EXTRACTION.
            Rendered only when the user attached files on the vineyard side. */}
        {hasUploads && (
          <g>
            <path
              d="M 55 14 C 8 30, 8 95, 43 110"
              fill="none"
              stroke="hsl(var(--chart-5))"
              strokeWidth="0.7"
              strokeDasharray="1.6 1.6"
              strokeOpacity={state.extraction_agent === "running" ? 1 : 0.75}
              markerEnd="url(#wf-arrow-active)"
            >
              {state.extraction_agent === "running" && (
                <animate
                  attributeName="stroke-dashoffset"
                  from="0"
                  to="-12"
                  dur="1s"
                  repeatCount="indefinite"
                />
              )}
            </path>
            <text
              x="6"
              y="62"
              fontSize="3"
              fill="hsl(var(--chart-5))"
              textAnchor="middle"
              transform="rotate(-90 6 62)"
              style={{ letterSpacing: "0.16em", textTransform: "uppercase" }}
            >
              uploads
            </text>
          </g>
        )}

        {/* Edges */}
        {EDGES.map((e, i) => {
          const from = NODES[e.from];
          const to = NODES[e.to];
          const fromState = state[e.from];
          const toState = state[e.to];
          const isTool = e.style === "tool";
          const isComplete = fromState === "ok";
          const isFlowing = fromState === "running" || (isComplete && toState === "running");

          let fromX: number;
          let fromY: number;
          let toX: number;
          let toY: number;
          let pathKind: "vertical" | "horizontal";

          if (isTool) {
            // Horizontal connector to sidecar
            fromX = from.cx + from.w / 2;
            fromY = from.cy;
            toX = to.cx - to.w / 2;
            toY = to.cy;
            pathKind = "horizontal";
          } else {
            // Vertical bezier between node centers (top/bottom edges)
            fromX = from.cx;
            fromY = from.cy + from.h / 2;
            toX = to.cx;
            toY = to.cy - to.h / 2;
            pathKind = "vertical";
          }

          const d = bezier(fromX, fromY, toX, toY, pathKind);

          return (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke={isComplete ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
                strokeOpacity={isComplete ? 0.7 : 0.35}
                strokeWidth={isComplete ? 0.7 : 0.5}
                strokeDasharray={isTool ? "1.4 1.4" : isFlowing ? "2 2" : undefined}
                markerEnd={isComplete ? "url(#wf-arrow-active)" : "url(#wf-arrow)"}
                style={{ transition: "stroke 350ms, stroke-opacity 350ms" }}
              >
                {isFlowing && !isTool && (
                  <animate
                    attributeName="stroke-dashoffset"
                    from="0"
                    to="-8"
                    dur="0.9s"
                    repeatCount="indefinite"
                  />
                )}
              </path>
            </g>
          );
        })}

        {/* Nodes */}
        {(Object.keys(NODES) as NodeKey[]).map((key) => (
          <NodeBox key={key} node={NODES[key]} state={state[key]} />
        ))}
      </svg>

      {/* Step details — two-line per item so long summaries and 5-digit
          durations don't fight for horizontal space. */}
      {!compact && (
      <ul className="mt-5 space-y-3 text-[11px]">
        {(
          [
            "weather_agent",
            "geo_agent",
            "tavily_agent",
            "extraction_agent",
            "feature_agent",
            "backtest_agent",
          ] as NodeKey[]
        ).map((key) => {
          const s = state[key];
          const d = details?.[key];
          const node = NODES[key];
          const detailText =
            s === "pending"
              ? "—"
              : s === "running"
                ? `${t("workflow.state.running")}…`
                : (d?.error ?? d?.summary ?? "—");
          return (
            <li key={key} className="space-y-1">
              <div className="flex items-baseline gap-2">
                <Dot state={s} />
                <span className="kicker">{node.label}</span>
                <span className="ml-auto font-mono tabular kicker">
                  {d?.durationMs !== undefined ? `${d.durationMs}ms` : ""}
                </span>
              </div>
              <p
                className={cn(
                  "pl-4 break-words text-[11px] leading-relaxed",
                  s === "fail" ? "text-destructive" : "text-soft",
                  s === "running" && "italic",
                )}
              >
                {detailText}
              </p>
            </li>
          );
        })}
      </ul>
      )}
    </section>
  );
}

function NodeBox({ node, state }: { node: NodeDef; state: AgentState }) {
  const { cx, cy, w, h, label, sub, icon, kind } = node;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const accent = KIND_ACCENT[kind];

  const isRunning = state === "running";
  const isDone = state === "ok";
  const isFail = state === "fail";
  const isPending = state === "pending" || state === "skipped";

  const stroke = isFail
    ? "hsl(var(--destructive))"
    : isRunning
      ? accent
      : isDone
        ? "hsl(var(--foreground))"
        : "hsl(var(--border))";

  const iconBoxSize = h - 4;

  return (
    <g style={{ transition: "all 350ms" }}>
      {/* Double-layered halo when running — "breathing" effect */}
      {isRunning && (
        <>
          <rect
            x={x - 2.8}
            y={y - 2.8}
            width={w + 5.6}
            height={h + 5.6}
            rx={3.5}
            ry={3.5}
            fill="none"
            stroke={accent}
            strokeWidth="0.5"
            opacity="0"
          >
            <animate
              attributeName="opacity"
              values="0; 0.55; 0"
              dur="1.6s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="stroke-width"
              values="0.3; 1.2; 0.3"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </rect>
          <rect
            x={x - 1.4}
            y={y - 1.4}
            width={w + 2.8}
            height={h + 2.8}
            rx={2.8}
            ry={2.8}
            fill="none"
            stroke={accent}
            strokeWidth="0.5"
            opacity="0.6"
          >
            <animate
              attributeName="opacity"
              values="0.7; 0.2; 0.7"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </rect>
        </>
      )}

      {/* body */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={2}
        ry={2}
        fill="hsl(var(--background))"
        stroke={stroke}
        strokeWidth={isRunning ? 1 : isDone ? 0.8 : 0.6}
        style={{ transition: "stroke 350ms, stroke-width 350ms" }}
      />

      {/* Marching ants on running node border — "loading" cue */}
      {isRunning && (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={2}
          ry={2}
          fill="none"
          stroke={accent}
          strokeWidth="0.9"
          strokeDasharray="3 3"
          opacity="0.9"
          pointerEvents="none"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-12"
            dur="1.2s"
            repeatCount="indefinite"
          />
        </rect>
      )}

      {/* One-shot "settle" flash on transition to done */}
      {isDone && (
        <rect
          key="done-flash"
          x={x - 1.5}
          y={y - 1.5}
          width={w + 3}
          height={h + 3}
          rx={2.6}
          ry={2.6}
          fill="none"
          stroke="hsl(var(--chart-3))"
          strokeWidth="0"
          opacity="0"
          pointerEvents="none"
        >
          <animate attributeName="opacity" values="0; 0.75; 0" dur="0.85s" begin="0s" repeatCount="1" fill="freeze" />
          <animate attributeName="stroke-width" values="0; 1.4; 0" dur="0.85s" begin="0s" repeatCount="1" fill="freeze" />
        </rect>
      )}

      {/* icon box on left */}
      <rect
        x={x + 2}
        y={y + 2}
        width={iconBoxSize}
        height={iconBoxSize}
        rx={1.2}
        ry={1.2}
        fill={accent}
        opacity={isPending ? 0.28 : 0.92}
        style={{ transition: "opacity 350ms" }}
      />

      {/* Icon-box scan-line — appears only on running */}
      {isRunning && (
        <rect
          x={x + 2}
          y={y + 2}
          width={iconBoxSize}
          height="0.8"
          fill="hsl(var(--background))"
          opacity="0.55"
        >
          <animate
            attributeName="y"
            from={y + 2}
            to={y + 2 + iconBoxSize - 0.8}
            dur="1.2s"
            repeatCount="indefinite"
          />
        </rect>
      )}

      <text
        x={x + 2 + iconBoxSize / 2}
        y={y + 2 + iconBoxSize / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={iconBoxSize > 13 ? 7 : 6}
        fontWeight={700}
        fill="hsl(var(--background))"
        style={{ pointerEvents: "none" }}
      >
        {icon}
      </text>

      {/* label */}
      <text
        x={x + iconBoxSize + 5}
        y={y + h / 2 - 1.8}
        textAnchor="start"
        fontSize={h > 18 ? 4.4 : 3.8}
        fontWeight={600}
        fill={isPending ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))"}
        style={{ letterSpacing: "0.1em", textTransform: "uppercase", pointerEvents: "none" }}
      >
        {label}
      </text>
      {/* subtitle */}
      <text
        x={x + iconBoxSize + 5}
        y={y + h / 2 + 4}
        textAnchor="start"
        fontSize={2.8}
        fill="hsl(var(--muted-foreground))"
        style={{ pointerEvents: "none" }}
      >
        {sub}
      </text>

      {/* status pip — top-right corner */}
      <circle
        cx={x + w - 2.4}
        cy={y + 2.4}
        r={isDone ? 1.2 : 1}
        fill={
          isDone
            ? "hsl(var(--chart-3))"
            : isRunning
              ? accent
              : isFail
                ? "hsl(var(--destructive))"
                : "transparent"
        }
        stroke={isPending ? "hsl(var(--muted-foreground))" : "none"}
        strokeOpacity={0.4}
        strokeWidth={0.3}
        style={{ transition: "fill 350ms, r 350ms" }}
      >
        {isRunning && (
          <animate
            attributeName="opacity"
            values="1; 0.4; 1"
            dur="1.2s"
            repeatCount="indefinite"
          />
        )}
        {isDone && (
          <animate
            key="pip-pop"
            attributeName="r"
            from="0.3"
            to="1.2"
            dur="0.4s"
            begin="0s"
            repeatCount="1"
            fill="freeze"
            keySplines="0.2 0 0 1"
            calcMode="spline"
          />
        )}
      </circle>
    </g>
  );
}

function Dot({ state }: { state: AgentState }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        (state === "pending" || state === "skipped") &&
          "border border-muted-foreground/40 bg-transparent",
        state === "running" && "animate-pulse bg-[hsl(var(--chart-1))]",
        state === "ok" && "bg-foreground",
        state === "fail" && "bg-destructive",
      )}
    />
  );
}
