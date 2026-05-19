import "server-only";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export const TAVILY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type TavilyCacheResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
};

type CacheKeyInput = {
  region: string;
  regionScope?: string;
  chateau?: string;
  year: number;
  sourceType: string;
  query: string;
  maxResultsPerQuery: number;
};

type CacheRow = {
  results_json: string;
  expires_at: number;
};

let database: import("node:sqlite").DatabaseSync | null | undefined;
let hydratedFromExport = false;

export function buildTavilyCacheKey(input: CacheKeyInput): string {
  const stable = JSON.stringify({
    region: input.region.trim().toLowerCase(),
    regionScope: (input.regionScope ?? "").trim().toLowerCase(),
    chateau: (input.chateau ?? "").trim().toLowerCase(),
    year: input.year,
    sourceType: input.sourceType,
    query: input.query.trim().toLowerCase(),
    maxResultsPerQuery: input.maxResultsPerQuery,
  });
  return `tavily:v1:${createHash("sha256").update(stable).digest("hex")}`;
}

async function getDatabase(): Promise<import("node:sqlite").DatabaseSync | null> {
  if (database !== undefined) return database;
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const cacheDir = join(process.cwd(), "data", ".cache");
    mkdirSync(cacheDir, { recursive: true });
    database = new DatabaseSync(join(cacheDir, "tavily-search.sqlite"));
    database.exec(`
      CREATE TABLE IF NOT EXISTS tavily_search_cache (
        cache_key TEXT PRIMARY KEY,
        region TEXT NOT NULL,
        region_scope TEXT NOT NULL DEFAULT '',
        chateau TEXT NOT NULL DEFAULT '',
        year INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        query TEXT NOT NULL,
        max_results_per_query INTEGER NOT NULL,
        results_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS tavily_search_cache_expires_idx
        ON tavily_search_cache(expires_at);
    `);
    // Backward-compatible migration for caches created before region_scope/chateau.
    try {
      database.exec("ALTER TABLE tavily_search_cache ADD COLUMN region_scope TEXT NOT NULL DEFAULT '';");
    } catch {}
    try {
      database.exec("ALTER TABLE tavily_search_cache ADD COLUMN chateau TEXT NOT NULL DEFAULT '';");
    } catch {}
    hydrateFromExport(database);
    return database;
  } catch {
    database = null;
    return null;
  }
}

/**
 * Idempotent hydration from data/tavily-cache-export.json. Lets the demo
 * machine ship with a pre-warmed cache so cold /api/analyze calls do not
 * pay the Tavily network round-trip. Safe to call on every getDatabase()
 * invocation — guarded by the `hydratedFromExport` flag and an INSERT OR
 * IGNORE on the row's cache_key primary key.
 */
function hydrateFromExport(db: import("node:sqlite").DatabaseSync): void {
  if (hydratedFromExport) return;
  hydratedFromExport = true;

  const exportPath = join(process.cwd(), "data", "tavily-cache-export.json");
  if (!existsSync(exportPath)) return;

  try {
    const raw = readFileSync(exportPath, "utf8");
    const parsed = JSON.parse(raw) as {
      entries?: Array<{
        cacheKey: string;
        region: string;
        regionScope?: string;
        chateau?: string;
        year: number;
        sourceType: string;
        query: string;
        maxResultsPerQuery: number;
        createdAt: string;
        expiresAt: string;
        results: TavilyCacheResult[];
      }>;
    };

    const entries = parsed.entries ?? [];
    if (entries.length === 0) return;

    const now = Date.now();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO tavily_search_cache (
        cache_key, region, region_scope, chateau, year, source_type,
        query, max_results_per_query, results_json, created_at, expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let inserted = 0;
    for (const e of entries) {
      const expiresAt = Date.parse(e.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= now) continue;
      try {
        const r = stmt.run(
          e.cacheKey,
          e.region,
          e.regionScope ?? "",
          e.chateau ?? "",
          e.year,
          e.sourceType,
          e.query,
          e.maxResultsPerQuery,
          JSON.stringify(e.results ?? []),
          Date.parse(e.createdAt) || now,
          expiresAt,
        );
        if (Number(r.changes) > 0) inserted++;
      } catch {
        // Per-row failures are non-fatal; demo cache hydration is best-effort.
      }
    }
    if (inserted > 0) {
      console.log(`[tavily-cache] hydrated ${inserted} entries from export`);
    }
  } catch {
    // Hydration is a nice-to-have; if it fails we just go to network on cold queries.
  }
}

export async function readTavilyCache(cacheKey: string): Promise<TavilyCacheResult[] | null> {
  const db = await getDatabase();
  if (!db) return null;

  try {
    const row = db
      .prepare("SELECT results_json, expires_at FROM tavily_search_cache WHERE cache_key = ?")
      .get(cacheKey) as CacheRow | undefined;
    if (!row) return null;
    if (row.expires_at <= Date.now()) {
      db.prepare("DELETE FROM tavily_search_cache WHERE cache_key = ?").run(cacheKey);
      return null;
    }

    try {
      return JSON.parse(row.results_json) as TavilyCacheResult[];
    } catch {
      db.prepare("DELETE FROM tavily_search_cache WHERE cache_key = ?").run(cacheKey);
      return null;
    }
  } catch {
    return null;
  }
}

export async function writeTavilyCache(
  cacheKey: string,
  input: CacheKeyInput,
  results: TavilyCacheResult[],
  ttlMs = TAVILY_CACHE_TTL_MS,
): Promise<void> {
  const db = await getDatabase();
  if (!db) return;

  const now = Date.now();
  try {
    db.prepare(`
      INSERT OR REPLACE INTO tavily_search_cache (
        cache_key,
        region,
        region_scope,
        chateau,
        year,
        source_type,
        query,
        max_results_per_query,
        results_json,
        created_at,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cacheKey,
      input.region,
      input.regionScope ?? "",
      input.chateau ?? "",
      input.year,
      input.sourceType,
      input.query,
      input.maxResultsPerQuery,
      JSON.stringify(results),
      now,
      now + ttlMs,
    );
  } catch {
    // Cache writes are opportunistic; live Tavily results should still flow.
  }
}
