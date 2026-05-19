import "server-only";
import { env, integrations, isDemoMode } from "@/lib/env";

/**
 * Pioneer.ai chat-completions adapter.
 *
 * Pioneer.ai is an OpenAI-compatible LLM hosting service. We use it for the
 * domain-heavy reasoning step (today: hosted gpt-5.5; tomorrow: a Pioneer-
 * fine-tuned wine-domain local model — same API shape, just swap model_id).
 *
 * Two-stage roadmap, code-stable across the swap:
 *   stage 1 (now)        — PIONEER_MODEL_ID = hosted model uuid (e.g. gpt-5.5)
 *   stage 2 (post-train) — PIONEER_MODEL_ID = your wine-fine-tuned local model
 *
 * Returns `null` on any failure (missing key/model, network, timeout, bad
 * response) so callers can fall back without try/catch noise.
 *
 * Reference: https://docs.pioneer.ai/
 */

const DEFAULT_TIMEOUT_MS = 15_000;

export interface PioneerChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface PioneerChatOptions {
  /** Override env PIONEER_MODEL_ID (e.g., when comparing models A/B). */
  modelId?: string;
  /** Override default 15s ceiling. */
  timeoutMs?: number;
  /** OpenAI-compatible response_format for JSON-schema mode. */
  responseFormat?: object;
  /** Sampling. Default leaves Pioneer's default in place. */
  temperature?: number;
}

export interface PioneerChatResult {
  content: string;
  modelId: string;
  latencyMs: number;
}

export async function pioneerChat(
  messages: PioneerChatMessage[],
  opts: PioneerChatOptions = {},
): Promise<PioneerChatResult | null> {
  if (isDemoMode) return null;
  if (!integrations.pioneer || !env.PIONEER_API_KEY) return null;

  const modelId = opts.modelId ?? env.PIONEER_MODEL_ID;
  if (!modelId) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${env.PIONEER_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.PIONEER_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        stream: false,
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;

    const data = (await res.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null;
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) return null;

    return { content, modelId, latencyMs: Date.now() - startedAt };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
