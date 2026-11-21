import Link from "next/link";
import { Fingerprint, Play, Repeat, ShieldCheck, Timer, Trophy } from "lucide-react";
import { Countdown } from "@/components/countdown";
import { Leaderboard } from "@/components/leaderboard";
import { YetiMark } from "@/components/yeti-mark";
import { currentSeason } from "@/lib/server/runs";

export const dynamic = "force-dynamic";

export default async function Home() {
  const season = await currentSeason();
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid items-center gap-10 pb-10 pt-10 sm:pt-16 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="eyebrow">CLAY Hackathon III · built on Sui</div>
          <h1 className="mt-3 font-display text-5xl font-bold leading-[1.02] sm:text-7xl">The yeti arcade where every high score has <span className="bg-gradient-to-r from-sky-300 via-teal-200 to-violet-300 bg-clip-text text-transparent">proof.</span></h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-sky-100/80">Sixty-second skill runs. The server replays every move before a score counts, the season&apos;s results go on Sui, and top players claim a badge that can&apos;t be bought or sold.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/play" className="btn-primary !px-7 !py-4 text-lg"><Play className="h-5 w-5" />Play Ice Dash</Link>
            <Link href="/leaderboard" className="btn-ghost !px-6 !py-4"><Trophy className="h-5 w-5" />Leaderboard</Link>
          </div>
          <p className="mt-3 text-[13px] text-sky-100/50">No wallet needed to play. Connect one only to put your result on-chain.</p>
          {season && (
            <div className="mt-8 inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="font-bold">{season.name}</span>
              <span className="text-sky-100/70">ends in <b className="text-white"><Countdown to={season.ends_at} /></b></span>
              <span className="text-sky-100/70">badge at <b className="text-white">{season.badge_threshold.toLocaleString()}</b></span>
            </div>
          )}
        </div>
        <div className="relative mx-auto w-full max-w-md">
          <div className="absolute inset-0 rounded-full bg-sky-400/20 blur-3xl" />
          <div className="relative animate-bob"><YetiMark className="mx-auto h-72 w-72 drop-shadow-[0_30px_40px_rgba(56,189,248,0.35)] sm:h-96 sm:w-96" /></div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          [Timer, "60 seconds", "Dodge crevasses, jump the gaps, grab snowflakes. It speeds up as you go."],
          [Repeat, "Replayed, not trusted", "Your browser sends only your moves. The server replays them on the same seeded course to get the score."],
          [Fingerprint, "On Sui", "Verified results are signed by the server, checked by a Move contract, and can't be submitted twice or by anyone else."],
        ].map(([Icon, title, body]) => {
          const I = Icon as typeof Timer;
          return (
            <div key={title as string} className="card">
              <I className="h-6 w-6 text-ice" />
              <h3 className="mt-3 font-display text-xl font-bold">{title as string}</h3>
              <p className="mt-1.5 text-[15px] text-sky-100/70">{body as string}</p>
            </div>
          );
        })}
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <Leaderboard compact />
        <div className="card">
          <ShieldCheck className="h-6 w-6 text-emerald-300" />
          <h3 className="mt-3 font-display text-2xl font-bold">Fair play, stated plainly</h3>
          <ul className="mt-3 space-y-2 text-[15px] text-sky-100/75">
            <li>• Every run gets a one-time ID and a seed from the server, and expires in 3 minutes.</li>
            <li>• Tampered scores, impossible input rates and too-fast finishes are rejected, with the reason shown.</li>
            <li>• Replay stops edited scores, not every bot. Top scores can be reviewed.</li>
          </ul>
          <Link href="/fairness" className="mt-4 inline-block font-bold text-ice">How it works, and try to cheat →</Link>
        </div>
      </section>
    </div>
  );
}
