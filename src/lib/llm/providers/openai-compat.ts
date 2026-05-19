import "server-only";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import {
  type ChatRequest,
  type ChatResponse,
  type LLMProvider,
  LLMProviderUnavailableError,
} from "../types";

interface CompatConfig {
  name: string;
  baseURL: string;
  apiKey: string | undefined;
  defaultModel: string;
  /** True when the provider supports OpenAI's strict json_schema response_format. */
  supportsStrictJsonSchema: boolean;
  supportsTools: boolean;
}

/**
 * Factory for any "OpenAI-compatible" provider — Alibaba Qwen via DashScope,
 * DeepSeek, Mistral, Together, Groq, Fireworks, **Ollama (local)**, etc.
 * All accept the same `POST /v1/chat/completions` wire shape as OpenAI; only
 * the baseURL + api-key + model id change.
 *
 * Strict json_schema support varies across these providers:
 *   • Ollama (>= 0.5)          — yes
 *   • DashScope (qwen-max etc) — partial — falls back cleanly to json_object
 *   • DeepSeek                 — no — emits json_object + prompt-enforced
 *   • Mistral, Together, Groq  — varies by hosted model
 *
 * For providers without strict mode we still attempt the json_schema request;
 * if they reject it (400) the error propagates and the operator should
 * configure a different provider or disable schema enforcement.
 */
export function makeOpenAICompatibleProvider(cfg: CompatConfig): LLMProvider {
  let cachedClient: OpenAI | null = null;

  function client(): OpenAI {
    if (cachedClient) return cachedClient;
    if (!cfg.apiKey) {
      throw new LLMProviderUnavailableError(
        cfg.name,
        `${cfg.name.toUpperCase()}_API_KEY is not set`,
      );
    }
    cachedClient = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
    return cachedClient;
  }

  function toMessages(messages: ChatRequest["messages"]): ChatCompletionMessageParam[] {
    return messages.map((m): ChatCompletionMessageParam => {
      if (m.role === "tool") {
        return { role: "tool", content: m.content, tool_call_id: m.tool_call_id ?? "" };
      }
      if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: tc.argumentsJson },
          })),
        };
      }
      if (m.role === "system") return { role: "system", content: m.content };
      if (m.role === "user") return { role: "user", content: m.content };
      return { role: "assistant", content: m.content };
    });
  }

  return {
    name: cfg.name,
    get defaultModel() {
      return cfg.defaultModel;
    },
    supportsStrictJsonSchema: cfg.supportsStrictJsonSchema,
    supportsTools: cfg.supportsTools,

    async chat(req: ChatRequest): Promise<ChatResponse> {
      const t0 = Date.now();

      const tools: ChatCompletionTool[] | undefined = req.tools?.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));

      const params: ChatCompletionCreateParamsNonStreaming = {
        model: cfg.defaultModel,
        messages: toMessages(req.messages),
      };

      if (req.responseSchema) {
        if (cfg.supportsStrictJsonSchema) {
          params.response_format = {
            type: "json_schema",
            json_schema: {
              name: req.responseSchema.name,
              strict: req.responseSchema.strict ?? true,
              schema: req.responseSchema.schema as Record<string, unknown>,
            },
          };
        } else {
          // Fall back to json_object — caller's prompt must request a schema-shaped JSON.
          params.response_format = { type: "json_object" };
          // Inject a system reminder so providers without strict mode still emit
          // schema-shaped output. Idempotent: skip when caller already prepended one.
          const haveSchemaHint = req.messages.some(
            (m) => m.role === "system" && m.content.includes("STRICT JSON SHAPE"),
          );
          if (!haveSchemaHint) {
            params.messages = [
              {
                role: "system",
                content: `STRICT JSON SHAPE — respond with ONLY valid JSON matching this schema, no prose, no markdown fence:\n${JSON.stringify(req.responseSchema.schema)}`,
              },
              ...(params.messages as ChatCompletionMessageParam[]),
            ];
          }
        }
      }
      if (tools && tools.length > 0 && cfg.supportsTools) {
        params.tools = tools;
        params.tool_choice =
          req.toolChoice === "auto" || req.toolChoice === undefined
            ? "auto"
            : req.toolChoice === "none"
              ? "none"
              : { type: "function", function: { name: req.toolChoice.name } };
      }
      if (req.maxTokens !== undefined) params.max_tokens = req.maxTokens;
      if (req.temperature !== undefined) params.temperature = req.temperature;

      const res = await client().chat.completions.create(params, { signal: req.signal });

      const choice = res.choices[0];
      const msg = choice?.message;
      return {
        content: msg?.content ?? "",
        toolCalls: msg?.tool_calls?.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          argumentsJson: tc.function.arguments,
        })),
        modelId: res.model,
        latencyMs: Date.now() - t0,
        usage: res.usage
          ? { promptTokens: res.usage.prompt_tokens, completionTokens: res.usage.completion_tokens }
          : undefined,
      };
    },
  };
}
