import { NextResponse } from "next/server";
import { getPlayer } from "@/lib/server/player";
import { currentSeason, leaderboard, stats } from "@/lib/server/runs";

export const dynamic = "force-dynamic";

/** ?board=daily (today, UTC) or season (the current season). */
export async function GET(req: Request) {
  const board = new URL(req.url).searchParams.get("board") === "daily" ? "daily" : "season";
  const season = await currentSeason();
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = board === "daily" ? dayStart : new Date(season?.starts_at ?? 0);
  const to = board === "daily" ? new Date(dayStart.getTime() + 86_400_000) : new Date(season?.ends_at ?? 8.64e15);
  const me = await getPlayer(false);
  const all = await leaderboard(from, to, 1000);
  const rank = me ? all.findIndex(r => r.player_id === me.id) + 1 : 0;
  return NextResponse.json({
    board, from, to, season,
    rows: all.slice(0, 50).map((r, i) => ({ rank: i + 1, name: r.name, score: r.score, runs: r.runs, at: r.at, you: r.player_id === me?.id })),
    you: rank ? { rank, score: all[rank - 1].score } : null,
    stats: await stats(),
  });
}
