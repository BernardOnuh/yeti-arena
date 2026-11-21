// Players, runs and seasons in PostgreSQL. With DATABASE_URL set this uses a real Postgres server; without it, an
// embedded Postgres (PGlite) stored in ./data, so it runs with no setup.
import "server-only";

type Row = Record<string, unknown>;
type Db = { query: <T extends Row = Row>(sql: string, params?: unknown[]) => Promise<T[]> };

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS seasons (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    badge_threshold INTEGER NOT NULL,
    chain_season_id TEXT            -- the Season object on Sui, once created there
  );
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,            -- 32 hex chars, issued by the server, single use
    player_id TEXT NOT NULL REFERENCES players(id),
    game TEXT NOT NULL,
    version INTEGER NOT NULL,
    seed TEXT NOT NULL,
    ip TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'checking', 'verified', 'rejected', 'expired')),
    finished_at TIMESTAMPTZ,
    inputs JSONB,
    client_score INTEGER,
    score INTEGER,                  -- computed by the server's replay, never taken from the client
    distance INTEGER,
    flakes INTEGER,
    lives INTEGER,
    ended_tick INTEGER,
    reason TEXT,                    -- why a run was rejected
    attested_to TEXT,               -- Sui address the result was signed for (at most one)
    chain_tx TEXT                   -- the submission transaction, once reported
  );
  CREATE INDEX IF NOT EXISTS runs_board ON runs (status, finished_at, score DESC);
  CREATE INDEX IF NOT EXISTS runs_player ON runs (player_id, issued_at DESC);
  CREATE INDEX IF NOT EXISTS runs_ip ON runs (ip, issued_at DESC);
`;

let dbPromise: Promise<Db> | null = null;

async function open(): Promise<Db> {
  let db: Db;
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "0" ? false : { rejectUnauthorized: false } });
    await pool.query(SCHEMA);
    db = { query: async (sql, params) => (await pool.query(sql, params as unknown[])).rows };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = process.env.PGLITE_DIR || "./data/pglite";
    (await import("node:fs")).mkdirSync(dir, { recursive: true });
    const pg = new PGlite(dir);
    await pg.exec(SCHEMA);
    db = { query: async <T extends Row>(sql: string, params?: unknown[]) => (await pg.query<T>(sql, params as unknown[])).rows };
  }
  // The hackathon season, created once.
  const [{ n }] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM seasons");
  if (n === 0) {
    await db.query("INSERT INTO seasons (name, starts_at, ends_at, badge_threshold, chain_season_id) VALUES ($1, $2, $3, $4, $5)",
      ["Season 1 · First Snow", "2026-11-16T00:00:00Z", "2027-01-01T00:00:00Z", 1500, process.env.SUI_SEASON_ID || null]);
  }
  return db;
}

export const db = () => (dbPromise ??= open());
