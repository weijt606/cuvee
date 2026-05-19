import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type CacheExportRow = {
  cache_key: string;
  region: string;
  region_scope?: string;
  chateau?: string;
  year: number;
  source_type: string;
  query: string;
  max_results_per_query: number;
  results_json: string;
  created_at: number;
  expires_at: number;
};

type CacheExportEntry = {
  cacheKey: string;
  region: string;
  regionScope: string;
  chateau: string;
  year: number;
  sourceType: string;
  query: string;
  maxResultsPerQuery: number;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
  resultCount: number;
  results: unknown[];
};

type MinimalResult = {
  url: string;
  title: string;
  content: string;
  score: number;
};

function compactText(input: string, max = 360): string {
  const cleaned = input.replace(/\s+/g, " ").trim();
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 3)}...`;
}

function toMinimalResult(item: unknown): MinimalResult | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  const url = typeof obj.url === "string" ? obj.url.trim() : "";
  const title = typeof obj.title === "string" ? compactText(obj.title, 180) : "";
  const content = typeof obj.content === "string" ? compactText(obj.content, 360) : "";
  const score = typeof obj.score === "number" && Number.isFinite(obj.score) ? obj.score : 0;
  if (!url) return null;
  return { url, title, content, score };
}

function isLikelyTestEntry(row: {
  query: string;
  chateau?: string;
  results: MinimalResult[];
}): boolean {
  const q = row.query.toLowerCase();
  const c = (row.chateau ?? "").toLowerCase();
  if (q.includes("synthetic") || q.includes("mini test")) return true;
  if (c.includes("test")) return true;
  return row.results.some((r) => r.url.includes("example.com"));
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    includeExpired: args.has("--all"),
  };
}

async function main() {
  const { DatabaseSync } = await import("node:sqlite");
  const { includeExpired } = parseArgs();

  const cwd = process.cwd();
  const preferredDbPath = join(cwd, "data", ".cache", "tavily-search.sqlite");
  const legacyDbPath = join(cwd, ".cache", "tavily-search.sqlite");
  const dbPath = existsSync(preferredDbPath) ? preferredDbPath : legacyDbPath;
  const outPath = join(cwd, "data", "tavily-cache-export.json");

  if (!existsSync(dbPath)) {
    console.error(`No SQLite cache found at: ${dbPath}`);
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  const rows = db.prepare("SELECT * FROM tavily_search_cache ORDER BY created_at DESC").all() as CacheExportRow[];
  const now = Date.now();

  const entries: CacheExportEntry[] = [];
  for (const row of rows) {
    let parsed: unknown[] = [];
    try {
      parsed = JSON.parse(row.results_json) as unknown[];
    } catch {
      parsed = [];
    }
    const minimalResults = parsed.map(toMinimalResult).filter((r): r is MinimalResult => Boolean(r));

    const isExpired = row.expires_at <= now;
    if (!includeExpired && isExpired) continue;
    if (isLikelyTestEntry({ query: row.query, chateau: row.chateau, results: minimalResults })) continue;

    entries.push({
      cacheKey: row.cache_key,
      region: row.region,
      regionScope: row.region_scope ?? "",
      chateau: row.chateau ?? "",
      year: row.year,
      sourceType: row.source_type,
      query: row.query,
      maxResultsPerQuery: row.max_results_per_query,
      createdAt: new Date(row.created_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
      isExpired,
      resultCount: minimalResults.length,
      results: minimalResults,
    });
  }

  mkdirSync(join(cwd, "data"), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        // Store the project-relative path so the committed export doesn't
        // leak the contributor's home directory / OS username.
        sourceDatabase: dbPath.startsWith(cwd) ? dbPath.slice(cwd.length + 1) : dbPath,
        includeExpired,
        totalEntries: entries.length,
        entries,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Exported ${entries.length} cache entries to ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
