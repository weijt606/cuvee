#!/usr/bin/env tsx
/**
 * Pre-flight env check — verify the orchestrator brain + integrations.
 * Run before a demo to catch "key present but rate-limited / wrong tier".
 *
 * Usage:
 *   pnpm check:env
 */
import "dotenv/config";

interface Check {
  name: string;
  required: boolean;
  run: () => Promise<{ ok: boolean; detail?: string }>;
}

const checks: Check[] = [
  {
    name: "OpenAI",
    required: true,
    run: async () => {
      if (!process.env.OPENAI_API_KEY)
        return { ok: false, detail: "OPENAI_API_KEY not set (orchestrator brain)" };
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      });
      return res.ok
        ? { ok: true, detail: `${res.status} OK` }
        : { ok: false, detail: `${res.status} ${(await res.text()).slice(0, 200)}` };
    },
  },
  {
    name: "Tavily",
    required: false,
    run: async () => {
      if (!process.env.TAVILY_API_KEY) return { ok: false, detail: "TAVILY_API_KEY not set" };
      return { ok: true, detail: "key present (verify on first tavily_agent call)" };
    },
  },
  {
    name: "Pioneer.ai",
    required: false,
    run: async () => {
      if (!process.env.PIONEER_API_KEY)
        return { ok: false, detail: "PIONEER_API_KEY not set" };
      if (!process.env.PIONEER_MODEL_ID)
        return { ok: false, detail: "PIONEER_MODEL_ID not set (pick model in Pioneer dashboard)" };
      const base = process.env.PIONEER_BASE_URL ?? "https://api.pioneer.ai";
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PIONEER_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.PIONEER_MODEL_ID,
          messages: [{ role: "user", content: "ping" }],
          stream: false,
        }),
      });
      return res.ok
        ? { ok: true, detail: `${res.status} OK (${process.env.PIONEER_MODEL_ID})` }
        : { ok: false, detail: `${res.status} ${(await res.text()).slice(0, 200)}` };
    },
  },
];

(async () => {
  console.log("Pre-flight env check\n");
  let failures = 0;
  for (const c of checks) {
    try {
      const res = await c.run();
      const mark = res.ok ? "\x1b[32m✓\x1b[0m" : c.required ? "\x1b[31m✗\x1b[0m" : "\x1b[33m–\x1b[0m";
      console.log(`${mark} ${c.name.padEnd(12)} ${res.detail ?? ""}`);
      if (!res.ok && c.required) failures++;
    } catch (err) {
      console.log(
        `\x1b[31m✗\x1b[0m ${c.name.padEnd(12)} ${err instanceof Error ? err.message : err}`,
      );
      if (c.required) failures++;
    }
  }
  console.log("");
  process.exit(failures > 0 ? 1 : 0);
})();
