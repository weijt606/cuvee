/**
 * Provider-neutral LLM contract used by every Cuvée agent.
 *
 * The pattern: each provider implements LLMProvider.chat() and hides its
 * native SDK quirks (OpenAI's response_format, Anthropic's tool-use trick
 * for forced JSON, Ollama's local /v1 endpoint). Callers — extraction,
 * feature, backtest, orchestrator — only see this surface.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Required when role === "tool" — matches the assistant's tool_call id. */
  tool_call_id?: string;
  /** Populated on assistant messages that requested tool calls. */
  tool_calls?: Array<{
    id: string;
    name: string;
    argumentsJson: string;
  }>;
}

/** Tool descriptor for tool-use loops (legacy orchestrator GPT-routing path). */
export interface ChatTool {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  parameters: Record<string, unknown>;
}

/** Strict JSON-output mode contract. The provider must return parseable JSON in `content`. */
export interface ChatResponseSchema {
  name: string;
  /** JSON Schema (typically strict). */
  schema: Record<string, unknown>;
  /** Defaults to true. Some providers ignore this (no native strict mode). */
  strict?: boolean;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** If set, the provider MUST return JSON parseable against this schema in `content`. */
  responseSchema?: ChatResponseSchema;
  /** If set, the provider can emit tool calls instead of (or alongside) content. */
  tools?: ChatTool[];
  /** Tool-use strategy. "auto" = up to the LLM; "none" = forbidden; { name } = forced. */
  toolChoice?: "auto" | "none" | { name: string };
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  /** Assistant text content. Empty when only tool_calls were emitted. */
  content: string;
  /** Populated when the LLM chose to call tools. */
  toolCalls?: Array<{
    id: string;
    name: string;
    argumentsJson: string;
  }>;
  /** The exact model id reported by the provider, e.g. "gpt-4o-mini-2024-07-18". */
  modelId: string;
  latencyMs: number;
  /** Token counts when the provider reports them. */
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LLMProvider {
  /** Stable identifier — "openai", "anthropic", "qwen", "deepseek", "ollama". */
  readonly name: string;
  /** Default model id for this provider (configurable via env). */
  readonly defaultModel: string;
  /** Indicates whether the provider natively supports strict JSON schema enforcement. */
  readonly supportsStrictJsonSchema: boolean;
  /** Indicates whether the provider supports tool-use. */
  readonly supportsTools: boolean;
  chat(req: ChatRequest): Promise<ChatResponse>;
}

/** Provider-not-configured signal. Callers can fall through to alternatives. */
export class LLMProviderUnavailableError extends Error {
  constructor(public readonly providerName: string, reason: string) {
    super(`LLM provider "${providerName}" unavailable: ${reason}`);
    this.name = "LLMProviderUnavailableError";
  }
}
