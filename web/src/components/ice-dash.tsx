"use client";
// Plays one Ice Dash run: asks the server for a run (and its seed), runs the shared simulation at a fixed 60 ticks
// per second, records only the player's inputs, and sends them back. The server replays them to get the score.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowBigLeft, ArrowBigRight, ArrowBigUp, Pause, Play, RotateCcw, ShieldCheck, ShieldX, Trophy, Volume2, VolumeX } from "lucide-react";
import { DURATION_TICKS, LANES, LIVES, TICK_HZ, newState, result, step, type Action, type Input, type Result, type State } from "@/game/sim";
import { draw, secondsLeft, type Particle, type View } from "@/game/render";
import { sfx } from "@/game/sound";
import { OnChain } from "./on-chain";

type Phase = "ready" | "starting" | "countdown" | "playing" | "paused" | "sending" | "done" | "error";
type Verdict = { status: "verified"; score: number; flakes: number; lives: number; survived: boolean } | { status: "rejected"; reason: string };

export function IceDash() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const sim = useRef<State | null>(null);
  const inputs = useRef<Input[]>([]);
  const queue = useRef<Action[]>([]);
  const view = useRef<View>({ w: 800, h: 600, laneX: 400, t: 0, flash: 0, particles: [] });
  const run = useRef<{ runId: string; seed: string } | null>(null);
  const phaseRef = useRef<Phase>("ready");
  const [phase, setPhaseState] = useState<Phase>("ready");
  const [count, setCount] = useState(3);
  const [hud, setHud] = useState({ score: 0, flakes: 0, lives: LIVES, secs: 60 });
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState("");
  const [best, setBest] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p); };

  useEffect(() => {
    try { setMuted(localStorage.getItem("ya.muted") === "1"); } catch {}
    fetch("/api/player").then(r => r.json()).then(p => setBest(p.best)).catch(() => {});
  }, []);
  useEffect(() => { sfx.muted = muted; try { localStorage.setItem("ya.muted", muted ? "1" : "0"); } catch {} }, [muted]);

  // Size the canvas to its box, crisp on high-DPI screens.
  useEffect(() => {
    const resize = () => {
      const c = canvas.current, box = wrap.current;
      if (!c || !box) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = box.clientWidth, h = box.clientHeight;
      c.width = w * dpr; c.height = h * dpr;
      c.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
      view.current.w = w; view.current.h = h;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const act = useCallback((a: Action) => {
    if (phaseRef.current !== "playing") return;
    queue.current.push(a);
    sfx.play(a === 2 ? "jump" : "move");
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (["ArrowLeft", "a", "A"].includes(k)) act(0);
      else if (["ArrowRight", "d", "D"].includes(k)) act(1);
      else if (["ArrowUp", "w", "W", " "].includes(k)) act(2);
      else if (k === "p" || k === "Escape") togglePause();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Swipes and taps on the play field
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current; touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? 0 : 1);
    else if (dy < -30 || (Math.abs(dx) < 12 && Math.abs(dy) < 12)) act(2);
  };

  // Main loop: fixed 60 Hz simulation, drawn every animation frame.
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0;
    const frame = (now: number) => {
      const dt = Math.min(100, now - last); last = now;
      const v = view.current;
      v.t = now;
      const s = sim.current;
      if (s && phaseRef.current === "playing") {
        acc += dt;
        while (acc >= 1000 / TICK_HZ && !s.over) {
          acc -= 1000 / TICK_HZ;
          const acts = queue.current.splice(0);
          for (const a of acts) inputs.current.push([s.tick, a]);
          step(s, acts);
          if (s.hit) { v.flash = 1; sfx.play("hit"); burst(v, "#ef4444"); }
          if (s.collected) { sfx.play("flake"); burst(v, "#38bdf8"); }
        }
        if (s.over) finish();
        const r = result(s);
        setHud(h => (h.score === r.score && h.lives === s.lives && h.secs === secondsLeft(s.tick) ? h : { score: r.score, flakes: s.flakes, lives: Math.max(0, s.lives), secs: secondsLeft(s.tick) }));
      } else acc = 0;
      if (s) {
        const laneW = Math.min(v.w * 0.27, 210);
        const target = v.w / 2 + (s.lane - (LANES - 1) / 2) * laneW;
        v.laneX += (target - v.laneX) * Math.min(1, dt / 70);
        v.flash = Math.max(0, v.flash - dt / 400);
        for (const p of v.particles) { p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.vy += 0.25; p.life -= dt / 600; }
        v.particles = v.particles.filter(p => p.life > 0);
      }
      const ctx = canvas.current?.getContext("2d");
      if (ctx) draw(ctx, s ?? idle, v);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function burst(v: View, color: string) {
    for (let i = 0; i < 16; i++) v.particles.push({ x: v.laneX, y: v.h * 0.78, vx: (Math.random() - 0.5) * 7, vy: -Math.random() * 6 - 1, life: 1, color });
  }

  async function start() {
    setError(""); setVerdict(null); setPhase("starting");
    sfx.unlock();
    try {
      const r = await fetch("/api/runs", { method: "POST" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Couldn't start a run.");
      run.current = { runId: body.runId, seed: body.seed };
      sim.current = newState(body.seed);
      inputs.current = []; queue.current = [];
      view.current.laneX = view.current.w / 2;
      setHud({ score: 0, flakes: 0, lives: LIVES, secs: 60 });
      setPhase("countdown");
      for (let n = 3; n > 0; n--) { setCount(n); sfx.play("tick"); await new Promise(res => setTimeout(res, 700)); }
      sfx.play("go");
      setPhase("playing");
    } catch (e) {
      setError((e as Error).message); setPhase("error");
    }
  }

  function togglePause() {
    if (phaseRef.current === "playing") setPhase("paused");
    else if (phaseRef.current === "paused") setPhase("playing");
  }

  async function finish() {
    if (phaseRef.current !== "playing") return;
    setPhase("sending");
    const s = sim.current!, r: Result = result(s);
    sfx.play(r.survived ? "win" : "over");
    try {
      const res = await fetch(`/api/runs/${run.current!.runId}/finish`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputs: inputs.current, clientScore: r.score }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't verify the run.");
      setVerdict(body);
      if (body.status === "verified") setBest(b => Math.max(b ?? 0, body.score));
      setPhase("done");
    } catch (e) {
      setError((e as Error).message); setPhase("error");
    }
  }

  const showHud = phase === "playing" || phase === "paused" || phase === "countdown";
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div ref={wrap} className="relative aspect-[3/4] w-full select-none overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1033] shadow-[0_30px_80px_-30px_rgba(56,189,248,0.45)] sm:aspect-[4/3]"
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: "none" }}>
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label="Ice Dash play field" />

        {showHud && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-4">
            <div className="rounded-2xl bg-black/35 px-3 py-2 backdrop-blur">
              <div className="text-[10px] font-bold uppercase tracking-widest text-sky-200/80">Score</div>
              <div className="font-display text-2xl font-bold tabular-nums text-white sm:text-3xl">{hud.score.toLocaleString()}</div>
            </div>
            <div className={`rounded-2xl bg-black/35 px-4 py-2 text-center backdrop-blur ${hud.secs <= 10 ? "text-rose-300" : "text-white"}`}>
              <div className="text-[10px] font-bold uppercase tracking-widest text-sky-200/80">Time</div>
              <div className="font-display text-2xl font-bold tabular-nums sm:text-3xl">{hud.secs}s</div>
            </div>
            <div className="rounded-2xl bg-black/35 px-3 py-2 text-right backdrop-blur">
              <div className="text-[10px] font-bold uppercase tracking-widest text-sky-200/80">❄ {hud.flakes}</div>
              <div className="mt-0.5 flex gap-1">{Array.from({ length: LIVES }, (_, i) => <span key={i} className={`h-4 w-4 rounded-full border-2 sm:h-5 sm:w-5 ${i < hud.lives ? "border-white bg-white" : "border-white/40"}`} />)}</div>
            </div>
          </div>
        )}
        {(phase === "playing" || phase === "paused") && (
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button className="grid h-10 w-10 place-items-center rounded-xl bg-black/35 text-white backdrop-blur" onClick={() => setMuted(m => !m)} aria-label={muted ? "Sound on" : "Sound off"}>{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>
            <button className="grid h-10 w-10 place-items-center rounded-xl bg-black/35 text-white backdrop-blur" onClick={togglePause} aria-label="Pause">{phase === "paused" ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}</button>
          </div>
        )}

        {phase === "countdown" && <Overlay><div key={count} className="animate-pop font-display text-8xl font-bold text-white drop-shadow-lg">{count}</div></Overlay>}
        {phase === "paused" && <Overlay><div className="text-center"><div className="font-display text-4xl font-bold text-white">Paused</div><p className="mt-2 text-sm text-sky-100/80">A run must finish within 3 minutes of starting.</p><button className="btn-primary mt-5" onClick={togglePause}><Play className="h-5 w-5" />Resume</button></div></Overlay>}
        {(phase === "ready" || phase === "starting") && (
          <Overlay>
            <div className="max-w-sm text-center">
              <div className="font-display text-5xl font-bold text-white sm:text-6xl">Ice Dash</div>
              <p className="mt-3 text-[15px] text-sky-100/90">60 seconds down the mountain. Switch lanes to dodge crevasses, jump the ones you can&apos;t avoid, grab snowflakes.</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-[12px] text-sky-100/80">
                <Key k="← / A" label="Left" /><Key k="↑ / Space" label="Jump" /><Key k="→ / D" label="Right" />
              </div>
              <p className="mt-2 text-[12px] text-sky-100/60 sm:hidden">On a phone: swipe left or right, tap or swipe up to jump.</p>
              <button className="btn-primary mt-6 w-full !py-4 text-lg" disabled={phase === "starting"} onClick={start}><Play className="h-5 w-5" />{phase === "starting" ? "Getting a run…" : "Start run"}</button>
              {best !== null && best > 0 && <p className="mt-3 text-sm text-sky-100/80">Your best: <b className="text-white">{best.toLocaleString()}</b></p>}
            </div>
          </Overlay>
        )}
        {phase === "sending" && <Overlay><div className="text-center text-white"><ShieldCheck className="mx-auto h-10 w-10 animate-pulse text-sky-300" /><div className="mt-3 font-display text-2xl font-bold">Verifying your run…</div><p className="mt-1 text-sm text-sky-100/80">The server is replaying every move.</p></div></Overlay>}
        {phase === "done" && verdict && (
          <Overlay>
            <div className="w-full max-w-sm text-center">
              {verdict.status === "verified" ? (
                <>
                  <div className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1 text-[12px] font-bold text-emerald-300"><ShieldCheck className="h-4 w-4" />Verified by replay</div>
                  <div className="mt-3 font-display text-6xl font-bold tabular-nums text-white">{verdict.score.toLocaleString()}</div>
                  <p className="mt-1 text-sky-100/80">{verdict.survived ? `Survived the full minute with ${verdict.lives} ${verdict.lives === 1 ? "life" : "lives"} left` : "Out of lives"} · {verdict.flakes} snowflakes</p>
                  {best !== null && verdict.score >= best && <p className="mt-2 font-bold text-amber-300">New personal best!</p>}
                  {run.current && <OnChain runId={run.current.runId} score={verdict.score} />}
                </>
              ) : (
                <>
                  <div className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-rose-400/15 px-3 py-1 text-[12px] font-bold text-rose-300"><ShieldX className="h-4 w-4" />Not verified</div>
                  <p className="mt-3 text-white">{verdict.reason}</p>
                </>
              )}
              <div className="mt-6 grid grid-cols-2 gap-2">
                <button className="btn-primary" onClick={start}><RotateCcw className="h-4 w-4" />Play again</button>
                <Link className="btn-ghost" href="/leaderboard"><Trophy className="h-4 w-4" />Leaderboard</Link>
              </div>
            </div>
          </Overlay>
        )}
        {phase === "error" && <Overlay><div className="max-w-sm text-center text-white"><p>{error}</p><button className="btn-primary mt-4" onClick={start}>Try again</button></div></Overlay>}
      </div>

      {/* On-screen controls for touch screens */}
      <div className="mt-3 grid grid-cols-3 gap-2 sm:hidden">
        {([[0, <ArrowBigLeft key="l" className="h-7 w-7" />, "Left"], [2, <ArrowBigUp key="u" className="h-7 w-7" />, "Jump"], [1, <ArrowBigRight key="r" className="h-7 w-7" />, "Right"]] as const).map(([a, icon, label]) => (
          <button key={label} aria-label={label} className="grid h-16 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white active:bg-white/15" onTouchStart={e => { e.preventDefault(); act(a); }} onClick={() => act(a)}>{icon}</button>
        ))}
      </div>
      <p className="mt-3 text-center text-[12px] text-sky-100/50">Runs last {DURATION_TICKS / TICK_HZ} seconds. Only your moves are sent; the server replays them to compute the score.</p>
    </div>
  );
}

const idle = newState("0".repeat(32));

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 grid place-items-center bg-[#0b1033]/55 p-6 backdrop-blur-[2px]">{children}</div>;
}
function Key({ k, label }: { k: string; label: string }) {
  return <div className="rounded-xl border border-white/15 bg-white/5 px-2 py-2"><div className="font-mono text-[11px] text-white">{k}</div><div>{label}</div></div>;
}
