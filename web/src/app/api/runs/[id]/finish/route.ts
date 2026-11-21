import { NextResponse } from "next/server";
import { getPlayer } from "@/lib/server/player";
import { RunError, finishRun } from "@/lib/server/runs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await getPlayer(false);
  if (!player) return NextResponse.json({ error: "No player session." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  if (JSON.stringify(body).length > 64_000) return NextResponse.json({ error: "Too large." }, { status: 413 });
  try {
    return NextResponse.json(await finishRun(player.id, id, body.inputs, body.clientScore));
  } catch (e) {
    const status = e instanceof RunError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
