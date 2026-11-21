// The run lifecycle: issue a single-use run with a server seed, then verify it by replaying the inputs. The
// verified score is the server's replay result. Anything that doesn't add up is rejected with a reason.
import "server-only";
import { randomBytes } from "node:crypto";
import { GAME_ID, GAME_VERSION, TICK_HZ, replay } from "@/game/sim";
import { db } from "./db";

export const RUN_TTL_MS = 3 * 60_000; // a run must be finished within 3 minutes of being issued
const LIMIT_PLAYER = 30; // run starts per player per 10 minutes
const LIMIT_IP = 90; // per network address per 10 minutes

export type RunRow = {
  id: string; player_id: string; seed: string; issued_at: string; expires_at: string; status: string;
  score: number | null; reason: string | null; ended_tick: number | null; flakes: number | null; lives: number | null;
  distance: number | null; attested_to: string | null; finished_at: string | null;
};

export class RunError extends Error { constructor(message: string, public status = 400) { super(message); } }

export async function startRun(playerId: string, ip: string) {
  const d = await db();
  const [{ p, i }] = await d.query<{ p: number; i: number }>(
    `SELECT (SELECT count(*)::int FROM runs WHERE player_id = $1 AND issued_at > now() - interval '10 minutes') AS p,
            (SELECT count(*)::int FROM runs WHERE ip = $2 AND issued_at > now() - interval '10 minutes') AS i`, [playerId, ip]);
  if (p >= LIMIT_PLAYER || i >= LIMIT_IP) throw new RunError("Too many runs in a short time. Take a breather and try again in a few minutes.", 429);
  const id = randomBytes(16).toString("hex");
  const seed = randomBytes(16).toString("hex");
  const expires = new Date(Date.now() + RUN_TTL_MS);
  await d.query("INSERT INTO runs (id, player_id, game, version, seed, ip, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [id, playerId, GAME_ID, GAME_VERSION, seed, ip, expires.toISOString()]);
  return { runId: id, seed, version: GAME_VERSION, expiresAt: expires.toISOString() };
}

export async function finishRun(playerId: string, runId: string, inputs: unknown, clientScore: unknown) {
  const d = await db();
  // Claim the run atomically, so it can only ever be finished once.
  const [run] = await d.query<RunRow>(
    "UPDATE runs SET status = 'checking', finished_at = now() WHERE id = $1 AND player_id = $2 AND status = 'open' RETURNING *", [runId, playerId]);
  if (!run) throw new RunError("This run doesn't exist, isn't yours, or was already finished.", 409);

  const reject = async (reason: string) => {
    await d.query("UPDATE runs SET status = 'rejected', reason = $2, inputs = $3, client_score = $4 WHERE id = $1",
      [runId, reason, JSON.stringify(Array.isArray(inputs) ? inputs.slice(0, 2000) : null), Number.isInteger(clientScore) ? clientScore : null]);
    return { status: "rejected" as const, reason };
  };

  const now = Date.now();
  if (now > new Date(run.expires_at).getTime()) return reject("The run was finished after it expired.");
  const v = replay(run.seed, inputs);
  if (!v.ok) return reject(`The input log failed checks: ${v.reason}.`);
  const r = v.result;
  if (clientScore !== r.score) return reject(`The reported score (${String(clientScore)}) doesn't match the replay (${r.score}).`);
  // A run can't be finished faster than the game takes to play it (with a little slack for clocks).
  const playedMs = (r.endedTick / TICK_HZ) * 1000;
  if (now - new Date(run.issued_at).getTime() < playedMs * 0.95 - 500) return reject("The run was finished faster than the game can be played.");

  await d.query(`UPDATE runs SET status = 'verified', score = $2, distance = $3, flakes = $4, lives = $5, ended_tick = $6,
                 inputs = $7, client_score = $8 WHERE id = $1`,
    [runId, r.score, r.distance, r.flakes, r.lives, r.endedTick, JSON.stringify(inputs), clientScore]);
  return { status: "verified" as const, ...r };
}

export type BoardRow = { player_id: string; name: string; score: number; runs: number; at: string };

/** Best verified score per player since `from`, highest first. */
export async function leaderboard(from: Date, to: Date, limit = 50) {
  const d = await db();
  return d.query<BoardRow>(
    `SELECT DISTINCT ON (r.player_id) r.player_id, p.name, r.score, r.finished_at AS at,
            count(*) OVER (PARTITION BY r.player_id)::int AS runs
       FROM runs r JOIN players p ON p.id = r.player_id
      WHERE r.status = 'verified' AND r.finished_at >= $1 AND r.finished_at < $2
      ORDER BY r.player_id, r.score DESC, r.finished_at ASC`, [from.toISOString(), to.toISOString()])
    .then(rows => rows.sort((a, b) => b.score - a.score || +new Date(a.at) - +new Date(b.at)).slice(0, limit));
}

export async function currentSeason() {
  const d = await db();
  const [s] = await d.query<{ id: number; name: string; starts_at: string; ends_at: string; badge_threshold: number; chain_season_id: string | null }>(
    "SELECT * FROM seasons WHERE starts_at <= now() AND ends_at > now() ORDER BY starts_at DESC LIMIT 1");
  return s ?? null;
}

export async function stats() {
  const d = await db();
  const [s] = await d.query<{ players: number; verified: number; rejected: number; today: number }>(
    `SELECT (SELECT count(DISTINCT player_id)::int FROM runs WHERE status = 'verified') AS players,
            (SELECT count(*)::int FROM runs WHERE status = 'verified') AS verified,
            (SELECT count(*)::int FROM runs WHERE status = 'rejected') AS rejected,
            (SELECT count(*)::int FROM runs WHERE status = 'verified' AND finished_at >= date_trunc('day', now())) AS today`);
  return s;
}
