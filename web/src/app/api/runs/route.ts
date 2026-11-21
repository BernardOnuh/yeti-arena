import { NextResponse } from "next/server";
import { clientIp, getPlayer } from "@/lib/server/player";
import { RunError, startRun } from "@/lib/server/runs";

export async function POST() {
  const player = (await getPlayer())!;
  try {
    return NextResponse.json(await startRun(player.id, await clientIp()));
  } catch (e) {
    const status = e instanceof RunError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
