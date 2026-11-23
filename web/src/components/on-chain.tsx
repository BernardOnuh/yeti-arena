"use client";
// After a verified run: record it on Sui (submit_attested_result, signed in the player's own wallet with the server's
// attestation) and, once the season's best score clears the threshold, claim the soulbound season badge.
import { useState } from "react";
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { Award, ExternalLink, Link2, Loader2 } from "lucide-react";
import { CLOCK, chain, chainReady, explorerTx } from "@/lib/chain";
import { hexToBytes } from "@/lib/attest";

type Step = "idle" | "signing" | "recorded" | "claiming" | "claimed";

// Move abort codes from yeti_arena::arena, in words.
const ABORTS: Record<string, string> = {
  "1": "The arena is paused.", "3": "This season isn't the arena's season.", "4": "The season is closed.", "5": "The season isn't open right now.",
  "6": "The game version doesn't match.", "7": "This run is already on chain.", "8": "The server's signature didn't check out.",
  "9": "Your best score is below the badge threshold.", "10": "You already claimed this season's badge.",
};
function explain(e: unknown) {
  const m = (e as Error)?.message ?? String(e);
  const code = m.match(/MoveAbort[^)]*\)\s*,\s*(\d+)/)?.[1] ?? m.match(/abort code:?\s*(\d+)/i)?.[1];
  if (code && ABORTS[code]) return ABORTS[code];
  if (/reject/i.test(m)) return "You rejected the request in your wallet.";
  return m.length > 160 ? m.slice(0, 160) + "…" : m;
}

export function OnChain({ runId, score }: { runId: string; score: number }) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [step, setStep] = useState<Step>("idle");
  const [digest, setDigest] = useState<{ record?: string; claim?: string }>({});
  const [threshold, setThreshold] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!chainReady) {
    return <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-sky-100/70">On-chain badges switch on once the Yeti Arena package is published to Sui {chain.network}. Your score is already verified and on the leaderboard.</p>;
  }

  async function record() {
    if (!account) return;
    setError(null); setStep("signing");
    try {
      const res = await fetch(`/api/runs/${runId}/attest`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: account.address }) });
      const a = await res.json();
      if (!res.ok) throw new Error(a.error || "The server couldn't sign this run.");
      setThreshold(a.badgeThreshold);
      const tx = new Transaction();
      tx.moveCall({
        target: `${chain.packageId}::arena::submit_attested_result`,
        arguments: [tx.object(chain.arenaId), tx.object(chain.seasonId), tx.pure.vector("u8", hexToBytes(a.runId)), tx.pure.u64(a.score), tx.pure.u64(a.gameVersion), tx.pure.vector("u8", hexToBytes(a.signature)), tx.object(CLOCK)],
      });
      const r = await signAndExecute({ transaction: tx });
      await client.waitForTransaction({ digest: r.digest });
      setDigest(d => ({ ...d, record: r.digest })); setStep("recorded");
    } catch (e) { setError(explain(e)); setStep("idle"); }
  }

  async function claim() {
    setError(null); setStep("claiming");
    try {
      const tx = new Transaction();
      tx.moveCall({ target: `${chain.packageId}::arena::claim_badge`, arguments: [tx.object(chain.seasonId)] });
      const r = await signAndExecute({ transaction: tx });
      await client.waitForTransaction({ digest: r.digest });
      setDigest(d => ({ ...d, claim: r.digest })); setStep("claimed");
    } catch (e) { setError(explain(e)); setStep("recorded"); }
  }

  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-3 text-left">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-sky-100/70"><Link2 className="h-3.5 w-3.5" />On Sui {chain.network}</div>
      {!account ? (
        <div className="flex items-center justify-between gap-3"><span className="text-[13px] text-sky-100/80">Connect a wallet to record this score.</span><ConnectButton connectText="Connect" /></div>
      ) : step === "idle" || step === "signing" ? (
        <button className="btn-primary w-full" disabled={step === "signing"} onClick={record}>
          {step === "signing" ? <><Loader2 className="h-4 w-4 animate-spin" />Confirm in your wallet…</> : <>Record {score.toLocaleString()} on Sui</>}
        </button>
      ) : (
        <div className="space-y-2">
          {digest.record && <a href={explorerTx(digest.record)} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-emerald-400/10 px-3 py-2 text-[13px] font-bold text-emerald-300">Score recorded <ExternalLink className="h-3.5 w-3.5" /></a>}
          {step === "claimed" && digest.claim ? (
            <a href={explorerTx(digest.claim)} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-amber-300/15 px-3 py-2 text-[13px] font-bold text-amber-200"><span className="flex items-center gap-1.5"><Award className="h-4 w-4" />Season badge claimed</span><ExternalLink className="h-3.5 w-3.5" /></a>
          ) : threshold !== null && score < threshold ? (
            <p className="text-[12px] text-sky-100/70">Reach {threshold.toLocaleString()} in a verified run to claim this season&apos;s badge.</p>
          ) : (
            <button className="btn-ghost w-full" disabled={step === "claiming"} onClick={claim}>{step === "claiming" ? <><Loader2 className="h-4 w-4 animate-spin" />Confirm in your wallet…</> : <><Award className="h-4 w-4" />Claim season badge</>}</button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-rose-300">{error}</p>}
    </div>
  );
}
