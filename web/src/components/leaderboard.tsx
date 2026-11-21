"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Medal, Play, ShieldCheck } from "lucide-react";

type Row = { rank: number; name: string; score: number; runs: number; at: string; you: boolean };
type Board = { board: string; rows: Row[]; you: { rank: number; score: number } | null; season: { name: string; ends_at: string; badge_threshold: number } | null; stats: { players: number; verified: number; rejected: number; today: number } };

export function Leaderboard({ compact = false }: { compact?: boolean }) {
  const [board, setBoard] = useState<"season" | "daily">("season");
  const [data, setData] = useState<Board | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => fetch(`/api/leaderboard?board=${board}`).then(r => r.json()).then(d => live && setData(d)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { live = false; clearInterval(t); };
  }, [board]);
  const rows = compact ? data?.rows.slice(0, 5) : data?.rows;

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">{board === "season" ? data?.season?.name ?? "Season" : "Today (UTC)"}</div>
          <h2 className="font-display text-2xl font-bold">Top {compact ? "5" : "50"}</h2>
        </div>
        <div className="flex rounded-2xl border border-white/10 p-1 text-[13px] font-bold">
          {(["season", "daily"] as const).map(b => <button key={b} onClick={() => setBoard(b)} className={`rounded-xl px-3.5 py-1.5 ${board === b ? "bg-white/10 text-white" : "text-sky-100/60"}`}>{b === "season" ? "Season" : "Daily"}</button>)}
        </div>
      </div>
      {!data ? <div className="h-40 animate-pulse rounded-2xl bg-white/5" /> : rows!.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sky-100/70">
          No verified runs yet. <Link href="/play" className="font-bold text-ice">Be the first.</Link>
        </div>
      ) : (
        <ol className="space-y-1.5">
          {rows!.map(r => (
            <li key={r.rank} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${r.you ? "bg-sky-400/15 ring-1 ring-sky-300/40" : "bg-white/[0.03]"}`}>
              <span className="grid w-8 place-items-center font-display text-lg font-bold text-sky-100/70">
                {r.rank === 1 ? <Crown className="h-5 w-5 text-amber-300" /> : r.rank <= 3 ? <Medal className={`h-5 w-5 ${r.rank === 2 ? "text-slate-200" : "text-orange-300"}`} /> : r.rank}
              </span>
              <span className="min-w-0 flex-1 truncate font-bold">{r.name}{r.you && <span className="ml-2 rounded-full bg-sky-300 px-2 py-0.5 text-[10px] font-extrabold text-night">YOU</span>}</span>
              <span className="hidden text-[12px] text-sky-100/50 sm:block">{r.runs} {r.runs === 1 ? "run" : "runs"}</span>
              <span className="font-display text-xl font-bold tabular-nums">{r.score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-sky-100/60">
        <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-300" />Only server-replayed runs count{data && ` · ${data.stats.rejected} rejected so far`}</span>
        {data?.you ? <span>Your rank: <b className="text-white">#{data.you.rank}</b></span> : <Link href="/play" className="inline-flex items-center gap-1 font-bold text-ice"><Play className="h-4 w-4" />Play to get ranked</Link>}
      </div>
    </div>
  );
}
