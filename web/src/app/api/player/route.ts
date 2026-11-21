import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getPlayer, renamePlayer } from "@/lib/server/player";

export async function GET() {
  const p = (await getPlayer())!;
  const d = await db();
  const [best] = await d.query<{ best: number | null; runs: number }>(
    "SELECT max(score) AS best, count(*)::int AS runs FROM runs WHERE player_id = $1 AND status = 'verified'", [p.id]);
  return NextResponse.json({ name: p.name, best: best.best, runs: best.runs });
}

export async function POST(req: Request) {
  const p = (await getPlayer())!;
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json({ name: await renamePlayer(p.id, body.name) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
