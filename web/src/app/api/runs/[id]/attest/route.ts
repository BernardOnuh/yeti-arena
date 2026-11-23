// Signs a verified run for one Sui address, so that address can record it on chain with submit_attested_result.
// The score is the server's replay result; a run is signed for at most one address.
import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getPlayer } from "@/lib/server/player";
import { attest, attestorReady } from "@/lib/server/attestor";
import { currentSeason, type RunRow } from "@/lib/server/runs";
import { address32, hexToBytes, resultMessage, toHex } from "@/lib/attest";
import { chain, chainReady } from "@/lib/chain";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!chainReady || !attestorReady()) return NextResponse.json({ error: "On-chain recording isn't set up on this server yet." }, { status: 503 });
  const player = await getPlayer(false);
  if (!player) return NextResponse.json({ error: "No player session." }, { status: 401 });
  const body = await req.json().catch(() => null);
  let address: string;
  try { address = "0x" + toHex(address32(String(body?.address ?? ""))); }
  catch { return NextResponse.json({ error: "Expected a Sui address." }, { status: 400 }); }

  const d = await db();
  const [run] = await d.query<RunRow & { version: number }>("SELECT * FROM runs WHERE id = $1 AND player_id = $2", [id, player.id]);
  if (!run) return NextResponse.json({ error: "This run doesn't exist or isn't yours." }, { status: 404 });
  if (run.status !== "verified" || run.score === null) return NextResponse.json({ error: "Only verified runs can be recorded." }, { status: 409 });
  // Bind the run to this address the first time; refuse any other address afterwards.
  const [bound] = await d.query<{ attested_to: string }>(
    "UPDATE runs SET attested_to = $2 WHERE id = $1 AND (attested_to IS NULL OR attested_to = $2) RETURNING attested_to", [id, address]);
  if (!bound) return NextResponse.json({ error: "This run was already signed for a different wallet." }, { status: 409 });

  const message = resultMessage({ arena: chain.arenaId, season: chain.seasonId, player: address, runId: hexToBytes(run.id), score: BigInt(run.score), gameVersion: BigInt(run.version) });
  const season = await currentSeason();
  return NextResponse.json({ runId: run.id, score: run.score, gameVersion: run.version, signature: attest(message), badgeThreshold: season?.badge_threshold ?? null });
}
