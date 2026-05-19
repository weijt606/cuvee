import "server-only";
import OpenAI from "openai";
import { env, sponsors } from "@/lib/env";
import { SponsorUnavailableError } from "@/lib/utils";

let _client: OpenAI | null = null;

/**
 * Lazy OpenAI client. Throws SponsorUnavailableError if OPENAI_API_KEY is
 * not set. Used by the orchestrator (Chat Completions tool-use loop) and
 * by extraction_agent when it upgrades from the heuristic to a structured
 * call.
 */
export function openaiClient(): OpenAI {
  if (!sponsors.openai || !env.OPENAI_API_KEY) {
    throw new SponsorUnavailableError("openai");
  }
  if (!_client) {
    _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return _client;
}
