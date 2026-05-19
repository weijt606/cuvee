# Contributing to Cuvée

## Origin

Cuvée is the post-hackathon continuation of **Wine Signals**, built in a
single seven-hour sprint at the **Paris AI Hackathon 2026** (hosted by
{Tech: Europe} + Hexa). The original hackathon repository is preserved
in its as-shipped state at
<https://github.com/weijt606/paris-ai-hackathon-2026>.

Cuvée inherits the architecture verbatim — the multi-agent pipeline,
the 1,150-line vintage-quality schema, the 61-château 1855 dataset,
the backtest verification loop, the Atlas UI shell — and then strips
the hackathon-specific framing, replaces the sponsor-bound stack with
pluggable provider interfaces, and adds a memory layer for
self-optimization (Phase B in [`README.md`](README.md#roadmap)).

## Acknowledgements

This project would not exist without the work shipped during the
hackathon sprint. With gratitude to:

### Hackathon teammates

- **Jiachen Wang** — `weather_agent`: ERA5 1990-2024 reanalysis +
  ECMWF SEAS5 2026 seasonal forecast, DEM-based downscaling to 61
  château centroids (lapse rate + TPI + Gironde buffer), NASA POWER
  2025 backfill, schema-aligned monthly climate aggregates.
- **Chenxin Lei** — `tavily_agent`: 5-channel Bordeaux harness across
  sentiment / policy / regulation / winemaker / market sources, trusted-
  domain weighting, dedup, the SQLite 7-day cache, and the chateau-scoped
  cache-export tooling that lets the demo machine ship pre-hydrated.

### Hackathon sponsors

- **OpenAI** — the orchestrator's tool-use loop and the strict-JSON
  extraction tier were built against OpenAI Chat Completions. The
  reference implementation still runs OpenAI by default; the Phase B
  provider abstraction was designed so the OpenAI integration is
  one provider among five.
- **Tavily** — the original public-web grounding layer. Tavily
  remains one of four supported retrieval providers and is still
  the default when its key is configured.
- **Pioneer.ai** — provided the small-LLM hosting tier for narrative
  generation during the hackathon. Pioneer is no longer integrated as
  of Phase B; the role it played (specialising the system over time
  via fine-tuning) is now served by the non-parametric memory layer
  (`src/lib/memory/`). Thank you for the platform that taught us why
  this loop matters.

### Event hosts

Thanks to **{Tech: Europe}** and **Hexa** for organising the Paris AI
Hackathon 2026 and for the day-of judging that helped sharpen the
demo into something worth continuing.

If you contributed to the original hackathon project and your name
should appear here, please open a PR adjusting this section.

---

## Setup

See [`README.md`](README.md) "Quick start" for prerequisites + the four-step setup. Once you have a working dev server, you're ready to contribute.

## How the agent layer works

If you're touching anything under `src/lib/agents/`, read [`docs/AGENTS.md`](docs/AGENTS.md) first. The key contract is the `SubAgent<TInput, TData>` interface — every external data source or LLM call sits behind one. Specifically:

- `name` is snake_case, used as the OpenAI tool name when the legacy GPT-routing path is active.
- `description` tells the routing LLM when to call this agent.
- `input_schema` is a JSON Schema that GPT fills in.
- `run(input, ctx)` is your implementation. **It must always resolve** — never `throw`. Errors surface as `{ ok: false, error: "..." }` so a single broken sub-agent doesn't crash the orchestrator loop.

The orchestrator runs in one of two modes (default is direct dispatch):

```
DEMO_FAST=true (default)  → directDispatch()
  phase 1 (parallel)  weather + geo + tavily   ← all 3 awaited
  phase 2             extraction               ← always full-signal
  phase 3 (parallel)  feature + backtest

DEMO_FAST=false           → GPT tool-use loop
  GPT decides the order; you appear as a function tool.
```

Either way, the contract is the same.

## PR checklist

Before opening a PR:

- [ ] `pnpm typecheck` clean — strict mode, no `any`, `noUncheckedIndexedAccess` on
- [ ] `pnpm lint` clean
- [ ] If you touched a sub-agent, exercise it via the dashboard once and confirm the trace entry shows `ok: true`
- [ ] If you added a new external API call, add a demo fixture branch in `src/lib/demo/fixtures.ts` so `NEXT_PUBLIC_DEMO_MODE=true` still works offline
- [ ] If you changed the schema in `data/wine-vintage-quality-schema.json`, re-run the four reference vintages (Lafite 2010, 2013, 2015, 2017) and confirm the bands still match historical critic consensus
- [ ] No `.env*` files committed (only `.env.example` is allowed)
- [ ] No personal info / API keys / internal handles in the diff

## Conventions

- **Strict TypeScript** — no `any`, `noUncheckedIndexedAccess` is on. Prefer narrow types.
- **Server-only modules** import `"server-only"` at the top so they're never bundled into the client.
- **Every external integration is env-gated** — leave a key blank and the corresponding feature degrades to a stub or fallback. Demo mode lets the UI work end-to-end with zero keys.
- **Never `throw` from a sub-agent's `run()`** — return `{ ok: false, error }` instead.
- **Branch names are ASCII / English only** — GitHub flags non-ASCII branch names.
- **Commits** — descriptive subject lines, conventional-commits style (`feat:`, `fix:`, `chore:`, `docs:`) preferred but not enforced. No `Co-Authored-By:` AI attribution trailers.

## Public-safe commits

This repo is public. Before committing:

```bash
git diff --cached    # scan for tokens / keys / personal info
```

Specifically, **never commit**:
- `.env*` files (only `.env.example` is allowed)
- API keys (OpenAI `sk-` / `sk-proj-`, Anthropic `sk-ant-`, Tavily `tvly-`, Brave subscription tokens, AWS `AKIA…`)
- Personal information (real names beyond GitHub handle, addresses, phone numbers)
- Absolute paths that include your home directory username

The pre-hydrated Tavily cache (`data/tavily-cache-export.json`) is regenerated via `pnpm export:tavily-cache` and stores the source path **project-relative** so it doesn't leak your home dir.

## When in doubt

Open an issue or a draft PR — don't block on chat.
