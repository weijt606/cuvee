import Link from "next/link";
import { integrations, isDemoMode } from "@/lib/env";

const LLM_PROVIDERS: { key: keyof typeof integrations; name: string; role: string }[] = [
  { key: "openai", name: "OpenAI", role: "Default LLM — extraction · feature · backtest · orchestrator" },
  { key: "anthropic", name: "Anthropic Claude", role: "Alt LLM — set CUVEE_LLM_PROVIDER=anthropic" },
  { key: "qwen", name: "Qwen (DashScope)", role: "Alt LLM — set CUVEE_LLM_PROVIDER=qwen" },
  { key: "deepseek", name: "DeepSeek", role: "Alt LLM — set CUVEE_LLM_PROVIDER=deepseek" },
  { key: "ollama", name: "Ollama (local)", role: "Alt LLM — set CUVEE_LLM_PROVIDER=ollama (free, local)" },
];

const RETRIEVAL_PROVIDERS: { key: keyof typeof integrations; name: string; role: string }[] = [
  { key: "tavily", name: "Tavily", role: "Managed search API — free tier ~1k/mo" },
  { key: "brave", name: "Brave Search", role: "Managed search API — free tier 2k/mo" },
  { key: "searxng", name: "SearXNG", role: "Self-hosted meta-search — truly free, no API key" },
];

export default function ScaffoldPage() {
  return (
    <main className="container mx-auto max-w-4xl px-6 py-16">
      <header className="mb-12">
        <p className="kicker">Config status</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Providers & integrations</h1>
        <p className="mt-3 text-soft">
          Env-gated. Drop a key into <code>.env.local</code> to enable.
        </p>
        {isDemoMode && (
          <p className="mt-4 inline-block rounded-md bg-amber-500/15 px-3 py-1 text-sm text-amber-700 dark:text-amber-300">
            DEMO MODE ON — orchestrator returns fixtures from{" "}
            <code>src/lib/demo/fixtures.ts</code>
          </p>
        )}
      </header>

      <section className="mb-10">
        <h2 className="section-kicker mb-4">LLM providers</h2>
        <p className="mb-3 text-xs text-soft">
          One handles every agent call. Select via <code>CUVEE_LLM_PROVIDER</code>.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {LLM_PROVIDERS.map((s) => (
            <Card key={s.key} name={s.name} role={s.role} on={integrations[s.key]} />
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="section-kicker mb-4">Retrieval providers</h2>
        <p className="mb-3 text-xs text-soft">
          Public-web grounding for <code>tavily_agent</code> + backtest critic
          retrieval. Select via <code>CUVEE_RETRIEVAL_PROVIDER</code>. Auto-prefers
          tavily → searxng → brave → null when unset.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {RETRIEVAL_PROVIDERS.map((s) => (
            <Card key={s.key} name={s.name} role={s.role} on={integrations[s.key]} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-kicker mb-4">Quick links</h2>
        <ul className="space-y-2 text-sm">
          <li>
            <Link className="underline-offset-4 hover:underline" href="/">
              → Wine dashboard
            </Link>
          </li>
          <li>
            <a className="underline-offset-4 hover:underline" href="/api/health" target="_blank">
              → API health endpoint
            </a>
          </li>
        </ul>
      </section>
    </main>
  );
}

function Card({ name, role, on }: { name: string; role: string; on: boolean }) {
  return (
    <div className="card-sm flex items-start justify-between p-4">
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-sm text-soft">{role}</p>
      </div>
      <span
        className={
          on
            ? "chip bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : "chip bg-zinc-500/15 text-zinc-700 dark:text-zinc-300"
        }
      >
        {on ? "configured" : "not set"}
      </span>
    </div>
  );
}
