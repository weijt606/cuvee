import "server-only";
import type {
  AnalyzeInput,
  Persona,
  Region,
  Timeframe,
  TradePersona,
  UploadMeta,
} from "@/lib/wine/types";

/**
 * Agent framework — shared contract for every sub-agent in the wine
 * intelligence orchestrator.
 *
 * Dev team: implement individual agents in src/lib/agents/sub-agents/*.ts.
 * Do NOT change SubAgent's shape without coordinating with the orchestrator —
 * tool descriptors are derived from it.
 */

export interface AgentContext {
  region: Pick<Region, "id" | "name" | "parent">;
  timeframe: Timeframe;
  persona: Persona;
  /**
   * Vineyard-side user uploads (metadata only — name/size/mime). Available
   * to any agent via `ctx.uploads`. The extraction agent in particular reads
   * this as a "direct entry" so user-supplied evidence augments its OpenAI
   * call without going through the GPT tool-use routing layer.
   */
  uploads?: UploadMeta[];
  /**
   * Trade-side explicit château pick from the BordeauxMap. geo_agent prefers
   * ctx.chateau over whatever GPT may pass as a tool argument — user intent
   * wins over inferred routing.
   */
  chateau?: string;
  /**
   * Trade sub-persona (merchant / restaurant / wineshop). Only meaningful
   * when persona === "trade". extraction + feature read this to bias their
   * driver weighting and prose toward the relevant lens.
   */
  tradePersona?: TradePersona;
  /**
   * True when the requested timeframe is entirely in the past. backtest_agent
   * only fires when this is set, comparing the predicted score against real
   * critic + market reaction from Tavily.
   */
  isBacktest?: boolean;
  /** Year parsed from timeframe.end — passed to backtest_agent as input. */
  vintageYear?: number;
  /** Aborts when the request is cancelled or the orchestrator times out. */
  signal: AbortSignal;
}

export interface AgentResult<T = unknown> {
  agent: string;
  ok: boolean;
  data?: T;
  error?: string;
  durationMs: number;
  /** One-line summary for trace UI. */
  summary?: string;
}

/**
 * Minimal JSON-schema shape we hand to Claude as `input_schema`. Kept loose so
 * agent authors can use deeper schemas without fighting the type system.
 */
export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export interface SubAgent<TInput = unknown, TData = unknown> {
  /** Tool name handed to Claude. snake_case, must be unique. */
  name: string;
  /** Description shown to Claude — be specific about WHEN to call this. */
  description: string;
  /** JSON-schema for tool input. Claude fills this in via tool_use blocks. */
  input_schema: JsonSchema;
  run(input: TInput, ctx: AgentContext): Promise<AgentResult<TData>>;
}

/**
 * Common safety wrapper. Times the call, catches throws, and produces a
 * uniform AgentResult. Use this from the orchestrator dispatcher so a single
 * bad agent never crashes the loop.
 */
export async function runAgentSafely<TInput, TData>(
  agent: SubAgent<TInput, TData>,
  input: TInput,
  ctx: AgentContext,
): Promise<AgentResult<TData>> {
  const t0 = Date.now();
  try {
    const out = await agent.run(input, ctx);
    return { ...out, durationMs: out.durationMs || Date.now() - t0 };
  } catch (err) {
    return {
      agent: agent.name,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - t0,
    };
  }
}

export type OrchestratorInput = AnalyzeInput;
