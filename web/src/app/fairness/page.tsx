import { TamperDemo } from "@/components/tamper-demo";

export const metadata = { title: "Fair play · Yeti Arena" };

const STEPS = [
  ["A run is issued", "The server creates a one-time run ID and a random seed. The seed decides the course, so everyone's course is different and nobody can practise a known one."],
  ["You play; only moves are recorded", "The game keeps a list of your moves and the exact tick each happened on. Nothing else is sent."],
  ["The server replays the run", "The same simulation runs on the server with the same seed and your moves. Its score is the only score that counts. If the score your browser reported differs, the run is rejected."],
  ["Plausibility checks", "Malformed or out-of-order moves, more than 12 moves in a second, moves after the run ended, runs finished faster than they can be played, and runs older than 3 minutes are all rejected."],
  ["On-chain record (optional)", "For a verified run, the server signs the result for your wallet address. The Move contract checks that signature and the season, refuses a run it has seen before, and keeps your best score. Badges can't be transferred."],
];

export default function FairnessPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 sm:pt-12">
      <h1 className="font-display text-4xl font-bold sm:text-5xl">Fair play</h1>
      <p className="mt-3 max-w-2xl text-[17px] text-sky-100/75">How a score becomes verified, what that does and doesn&apos;t prove, and a way to try breaking it yourself.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <ol className="space-y-3">
          {STEPS.map(([t, b], i) => (
            <li key={t} className="card flex gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-300 font-display text-lg font-bold text-night">{i + 1}</span>
              <div><h3 className="font-display text-xl font-bold">{t}</h3><p className="mt-1 text-[15px] text-sky-100/75">{b}</p></div>
            </li>
          ))}
          <li className="card border-amber-300/25 bg-amber-400/5">
            <h3 className="font-display text-xl font-bold text-amber-200">What this doesn&apos;t prove</h3>
            <p className="mt-1 text-[15px] text-sky-100/75">Replay proves a score came from a valid sequence of moves on that course. It can&apos;t prove a human made those moves: a well-built bot could still play. The on-chain record proves the server attested the score, not how it was played. Rate limits, input checks and manual review of top scores reduce, but don&apos;t eliminate, that risk.</p>
          </li>
        </ol>
        <div className="lg:sticky lg:top-24 lg:self-start"><TamperDemo /></div>
      </div>
    </div>
  );
}
