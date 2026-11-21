"use client";
// Lets anyone see the server refuse a cheat: it starts a real run, then submits a forged result.
import { useState } from "react";
import { ShieldX, Swords } from "lucide-react";

const ATTEMPTS = {
  score: { label: "Claim a score of 99,999 with no moves", body: () => ({ inputs: [], clientScore: 99999 }) },
  spam: { label: "Send 30 moves in half a second (a bot)", body: () => ({ inputs: Array.from({ length: 30 }, (_, i) => [i, i % 2]), clientScore: 0 }) },
  fast: { label: "Finish a full minute instantly", body: () => ({ inputs: Array.from({ length: 50 }, (_, i) => [i * 70 + 5, 2]), clientScore: 0 }) },
} as const;

export function TamperDemo() {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ attempt: string; status: string; reason?: string } | null>(null);
  async function attempt(k: keyof typeof ATTEMPTS) {
    setBusy(true); setOut(null);
    try {
      const start = await (await fetch("/api/runs", { method: "POST" })).json();
      if (start.error) throw new Error(start.error);
      const r = await fetch(`/api/runs/${start.runId}/finish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ATTEMPTS[k].body()) });
      const v = await r.json();
      setOut({ attempt: ATTEMPTS[k].label, status: v.status ?? "error", reason: v.reason ?? v.error });
    } catch (e) {
      setOut({ attempt: ATTEMPTS[k].label, status: "error", reason: (e as Error).message });
    } finally { setBusy(false); }
  }
  return (
    <div className="card">
      <div className="flex items-center gap-2"><Swords className="h-5 w-5 text-rose-300" /><h2 className="font-display text-2xl font-bold">Try to cheat</h2></div>
      <p className="mt-1.5 text-[15px] text-sky-100/70">Each button starts a real run and then sends the server a forged result. Rejected runs are counted on the leaderboard.</p>
      <div className="mt-4 grid gap-2">
        {(Object.keys(ATTEMPTS) as (keyof typeof ATTEMPTS)[]).map(k => <button key={k} disabled={busy} className="btn-ghost !justify-start text-left !text-[15px]" onClick={() => attempt(k)}>{ATTEMPTS[k].label}</button>)}
      </div>
      {out && (
        <div className={`mt-4 rounded-2xl border p-4 text-[15px] ${out.status === "rejected" ? "border-rose-300/30 bg-rose-400/10" : "border-amber-300/30 bg-amber-400/10"}`}>
          <div className="flex items-center gap-2 font-bold"><ShieldX className="h-5 w-5 text-rose-300" />{out.status === "rejected" ? "Rejected" : out.status}</div>
          <p className="mt-1 text-sky-100/80">{out.reason}</p>
        </div>
      )}
    </div>
  );
}
