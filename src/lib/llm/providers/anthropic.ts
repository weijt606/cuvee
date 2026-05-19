import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { env } from "@/lib/env";
import {
  type ChatRequest,
  type ChatResponse,
  type LLMProvider,
  LLMProviderUnavailableError,
} from "../types";

let cachedClient: Anthropic | null = null;

function client(): Anthropic {
  if (cachedClient) return cachedClient;
  if (!env.ANTHROPIC_API_KEY) {
    throw new LLMProviderUnavailableError("anthropic", "ANTHROPIC_API_KEY is not set");
  }
  cachedClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return cachedClient;
}

/**
 * Anthropic Claude provider.
 *
 * Strict JSON schema is enforced via the tool-use trick: we register a
 * single virtual tool `submit_result` whose input_schema is the caller's
 * response schema, force tool_choice = that tool, and read the tool call's
 * arguments back as the JSON output. This is the official Anthropic-
 * recommended pattern for structured output and gives us OpenAI-equivalent
 * reliability on Claude.
 *
 * Real tool-use (multi-tool routing) is supported directly when caller
 * passes a `tools` array without `responseSchema`.
 */
export const anthropicProvider: LLMProvider = {
  name: "anthropic",
  get defaultModel() {
    return env.ANTHROPIC_MODEL || "claude-haiku-4-5";
  },
  supportsStrictJsonSchema: true,
  supportsTools: true,

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const t0 = Date.now();

    // Anthropic takes `system` as a top-level field, not a message.
    const systemMessages = req.messages.filter((m) => m.role === "system");
    const nonSystemMessages = req.messages.filter((m) => m.role !== "system");
    const system = systemMessages.map((m) => m.content).join("\n\n") || undefined;

    const messages: MessageParam[] = nonSystemMessages.map((m): MessageParam => {
      if (m.role === "user") return { role: "user", content: m.content };
      if (m.role === "tool") {
        // Anthropic represents tool results as a user message with tool_result content blocks.
        return {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.tool_call_id ?? "",
              content: m.content,
            },
          ],
        };
      }
      // assistant — may carry tool_use blocks
      if (m.tool_calls && m.tool_calls.length > 0) {
        return {
          role: "assistant",
          content: [
            ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
            ...m.tool_calls.map((tc) => ({
              type: "tool_use" as const,
              id: tc.id,
              name: tc.name,
              input: safeParseJson(tc.argumentsJson),
            })),
          ],
        };
      }
      return { role: "assistant", content: m.content };
    });

    // Strategy 1: responseSchema set → use submit_result tool-use trick
    if (req.responseSchema) {
      const submitTool: Tool = {
        name: "submit_result",
        description: `Submit the final structured result. The input MUST match the schema strictly.`,
        input_schema: req.responseSchema.schema as Tool.InputSchema,
      };
      const res = await client().messages.create(
        {
          model: this.defaultModel,
          max_tokens: req.maxTokens ?? 4096,
          ...(system && { system }),
          ...(req.temperature !== undefined && { temperature: req.temperature }),
          messages,
          tools: [submitTool],
          tool_choice: { type: "tool", name: "submit_result" },
        },
        { signal: req.signal },
      );
      // Extract the submit_result tool call's input as our JSON output.
      const toolUseBlock = res.content.find(
        (b): b is ToolUseBlock => b.type === "tool_use" && b.name === "submit_result",
      );
      const content = toolUseBlock ? JSON.stringify(toolUseBlock.input) : "";
      return {
        content,
        modelId: res.model,
        latencyMs: Date.now() - t0,
        usage: { promptTokens: res.usage.input_tokens, completionTokens: res.usage.output_tokens },
      };
    }

    // Strategy 2: real tool-use OR plain chat
    const tools: Tool[] | undefined = req.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Tool.InputSchema,
    }));

    const res = await client().messages.create(
      {
        model: this.defaultModel,
        max_tokens: req.maxTokens ?? 4096,
        ...(system && { system }),
        ...(req.temperature !== undefined && { temperature: req.temperature }),
        messages,
        ...(tools && tools.length > 0 ? { tools } : {}),
        ...(req.toolChoice && tools && tools.length > 0
          ? {
              tool_choice:
                req.toolChoice === "auto"
                  ? { type: "auto" }
                  : req.toolChoice === "none"
                    ? { type: "none" }
                    : { type: "tool", name: req.toolChoice.name },
            }
          : {}),
      },
      { signal: req.signal },
    );

    let text = "";
    const toolCalls: ChatResponse["toolCalls"] = [];
    for (const block of res.content) {
      if (block.type === "text") text += block.text;
      else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          argumentsJson: JSON.stringify(block.input),
        });
      }
    }

    return {
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      modelId: res.model,
      latencyMs: Date.now() - t0,
      usage: { promptTokens: res.usage.input_tokens, completionTokens: res.usage.output_tokens },
    };
  },
};

function safeParseJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}
