import "server-only";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import { env, isDemoFast } from "@/lib/env";
import {
  type ChatRequest,
  type ChatResponse,
  type LLMProvider,
  LLMProviderUnavailableError,
} from "../types";

let cachedClient: OpenAI | null = null;

function client(): OpenAI {
  if (cachedClient) return cachedClient;
  if (!env.OPENAI_API_KEY) {
    throw new LLMProviderUnavailableError("openai", "OPENAI_API_KEY is not set");
  }
  cachedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cachedClient;
}

/** Resolves the OpenAI model id to send. Demo-fast pins gpt-4o-mini regardless of env. */
function resolveModel(): string {
  if (isDemoFast) return "gpt-4o-mini";
  return env.CUVEE_LLM_MODEL || env.OPENAI_MODEL || "gpt-4o-mini";
}

/** Maps our provider-neutral message shape to the OpenAI SDK shape. */
function toOpenAIMessages(messages: ChatRequest["messages"]): ChatCompletionMessageParam[] {
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

export const openaiProvider: LLMProvider = {
  name: "openai",
  get defaultModel() {
    return env.CUVEE_LLM_MODEL || env.OPENAI_MODEL || "gpt-4o-mini";
  },
  supportsStrictJsonSchema: true,
  supportsTools: true,

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const t0 = Date.now();
    const model = resolveModel();

    const tools: ChatCompletionTool[] | undefined = req.tools?.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const params: ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: toOpenAIMessages(req.messages),
    };

    if (req.responseSchema) {
      params.response_format = {
        type: "json_schema",
        json_schema: {
          name: req.responseSchema.name,
          strict: req.responseSchema.strict ?? true,
          schema: req.responseSchema.schema as Record<string, unknown>,
        },
      };
    }
    if (tools && tools.length > 0) {
      params.tools = tools;
      params.tool_choice =
        req.toolChoice === "auto" || req.toolChoice === undefined
          ? "auto"
          : req.toolChoice === "none"
            ? "none"
            : { type: "function", function: { name: req.toolChoice.name } };
    }
    if (req.maxTokens !== undefined) params.max_tokens = req.maxTokens;
    // Note: gpt-5* / o-series reject `temperature`. We omit by default so any
    // current GA model works; demo-fast pin to gpt-4o-mini sidesteps this entirely.
    if (req.temperature !== undefined && !isDemoFast) {
      params.temperature = req.temperature;
    }

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
