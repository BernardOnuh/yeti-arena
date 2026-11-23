"use client";
// Yeti Town: free-roam the snowy town on foot or by snowmobile and take on missions. Fixed 60 Hz simulation,
// keyboard and touch controls, a HUD and saved progress (coins and best mission rewards, in this browser).
import { useEffect, useRef, useState } from "react";
import { Coins, MapPin, Pause, Play, Timer, Volume2, VolumeX } from "lucide-react";
import { MISSIONS, newGame, step, type Game, type Keys } from "@/game/town/game";
import { render, type View } from "@/game/town/render";
import { sfx } from "@/game/sound";

const SAVE = "yeti-town:v1";
const STEP = 1 / 60;
const KEYMAP: Record<string, keyof Keys> = {
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  Space: "brake", KeyE: "action", Enter: "action",
};
const SOUND: Record<string, Parameters<typeof sfx.play>[0]> = { start: "go", win: "win", fail: "over", ring: "flake", bump: "hit", engine: "go", door: "move" };

interface Hud { coins: number; prompt: string | null; toast: Game["toast"]; mission: { title: string; left: number; step: string } | null; riding: boolean; speed: number; done: number }

export function YetiTown() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const keys = useRef<Keys>({ up: false, down: false, left: false, right: false, brake: false, action: false });
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<Hud>({ coins: 0, prompt: null, toast: null, mission: null, riding: false, speed: 0, done: 0 });
  const pausedRef = useRef(false); pausedRef.current = paused;

  useEffect(() => {
    const g = newGame();
    try { const s = JSON.parse(localStorage.getItem(SAVE) || "null"); if (s) { g.coins = s.coins || 0; g.done = s.done || {}; } } catch { /* no saved progress */ }
    game.current = g;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __town: Game }).__town = g; // for the browser test
    const cv = canvas.current!, ctx = cv.getContext("2d")!;
    const view: View = { cx: g.yeti.x, cy: g.yeti.y, zoom: 1 };
    let raf = 0, last = performance.now(), acc = 0, hudAt = 0, saveAt = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      view.zoom = r.width < 640 ? 0.72 : 1;
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cv);
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!pausedRef.current && startedRef.current) {
        acc += dt;
        while (acc >= STEP) { step(g, keys.current, STEP); acc -= STEP; }
        for (const e of g.events.splice(0)) if (SOUND[e]) sfx.play(SOUND[e]);
      }
      // the camera leads a little in the direction of travel
      const lead = g.riding ? { x: g.riding.vx * 0.35, y: g.riding.vy * 0.35 } : { x: 0, y: 0 };
      view.cx += (g.yeti.x + lead.x - view.cx) * Math.min(1, dt * 5); view.cy += (g.yeti.y + lead.y - view.cy) * Math.min(1, dt * 5);
      const r = cv.getBoundingClientRect(); render(ctx, g, view, r.width, r.height);
      if (now - hudAt > 120) {
        hudAt = now;
        const def = g.active && MISSIONS.find(m => m.id === g.active!.id)!;
        const stepText = !g.active ? "" : g.active.id === "thief" ? `Bumps ${g.sleds.find(s => s.thief)?.hits ?? 0}/3` : g.active.id === "race" ? `Ring ${g.active.index + 1}/8` : `Delivery ${g.active.index + 1}/3`;
        setHud({ coins: g.coins, prompt: g.prompt, toast: g.toast, mission: def ? { title: def.title, left: Math.max(0, g.active!.left), step: stepText } : null, riding: !!g.riding, speed: g.riding ? Math.round(Math.hypot(g.riding.vx, g.riding.vy) / 8) : 0, done: Object.keys(g.done).length });
      }
      if (now - saveAt > 2000) { saveAt = now; try { localStorage.setItem(SAVE, JSON.stringify({ coins: g.coins, done: g.done })); } catch { /* private mode */ } }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  const startedRef = useRef(false); startedRef.current = started;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = KEYMAP[e.code]; if (!k) { if (e.code === "KeyP" || e.code === "Escape") setPaused(p => !p); return; }
      e.preventDefault();
      if (!startedRef.current) { begin(); return; }
      if (k === "action") { if (!e.repeat) keys.current.action = true; } else keys.current[k] = true;
    };
    const up = (e: KeyboardEvent) => { const k = KEYMAP[e.code]; if (k && k !== "action") keys.current[k] = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  function begin() { sfx.unlock(); setStarted(true); }
  const hold = (k: keyof Keys, on: boolean) => { if (k === "action") { if (on) keys.current.action = true; } else keys.current[k] = on; };
  const touch = (k: keyof Keys) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); if (!startedRef.current) begin(); hold(k, true); },
    onPointerUp: () => hold(k, false), onPointerLeave: () => hold(k, false), onPointerCancel: () => hold(k, false),
  });

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="relative overflow-hidden rounded-[28px] border border-white/15 shadow-[0_30px_80px_-30px_rgba(0,0,0,.8)]">
        <canvas ref={canvas} className="block h-[62svh] min-h-[380px] w-full touch-none sm:h-[70vh]" />

        {/* HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
          <div className="space-y-2">
            {hud.mission ? (
              <div className="rounded-2xl bg-slate-900/75 px-4 py-2.5 text-white backdrop-blur">
                <div className="flex items-center gap-2 font-display text-[17px] font-bold"><MapPin className="h-4 w-4 text-emerald-300" />{hud.mission.title}</div>
                <div className="mt-0.5 flex items-center gap-3 text-[13px] font-bold"><span className="text-emerald-200">{hud.mission.step}</span><span className={`flex items-center gap-1 tabular-nums ${hud.mission.left < 10 ? "text-rose-300" : "text-sky-100"}`}><Timer className="h-3.5 w-3.5" />{hud.mission.left.toFixed(1)}s</span></div>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-900/60 px-3.5 py-2 text-[13px] font-bold text-sky-100 backdrop-blur">Find a ★ marker to start a mission · {hud.done}/3 done</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hud.riding && <div className="rounded-2xl bg-slate-900/70 px-3 py-2 font-display text-[15px] font-bold tabular-nums text-white backdrop-blur">{hud.speed} <span className="text-[11px] text-sky-200">km/h</span></div>}
            <div className="flex items-center gap-1.5 rounded-2xl bg-slate-900/70 px-3 py-2 font-display text-[17px] font-bold tabular-nums text-amber-300 backdrop-blur"><Coins className="h-4 w-4" />{hud.coins.toLocaleString()}</div>
            <button className="pointer-events-auto grid h-10 w-10 place-items-center rounded-2xl bg-slate-900/70 text-white backdrop-blur" aria-label={muted ? "Unmute" : "Mute"} onClick={() => { sfx.muted = !muted; setMuted(!muted); }}>{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
            <button className="pointer-events-auto grid h-10 w-10 place-items-center rounded-2xl bg-slate-900/70 text-white backdrop-blur" aria-label={paused ? "Resume" : "Pause"} onClick={() => setPaused(p => !p)}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
          </div>
        </div>
        {hud.toast && (
          <div className={`pointer-events-none absolute left-1/2 top-20 max-w-[90%] -translate-x-1/2 rounded-2xl px-4 py-2 text-center text-[14px] font-bold text-white shadow-lg ${hud.toast.tone === "good" ? "bg-emerald-600/90" : hud.toast.tone === "bad" ? "bg-rose-600/90" : "bg-slate-900/85"}`}>{hud.toast.text}</div>
        )}
        {hud.prompt && <div className="pointer-events-none absolute bottom-6 left-4 rounded-2xl bg-slate-900/80 px-4 py-2 text-[14px] font-bold text-white backdrop-blur sm:left-1/2 sm:-translate-x-1/2">{hud.prompt}</div>}

        {!started && (
          <div className="absolute inset-0 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
            <div className="max-w-md rounded-3xl border border-white/15 bg-night/90 p-6 text-center text-white">
              <div className="font-display text-3xl font-bold">Yeti Town</div>
              <p className="mt-2 text-sky-100/80">Roam the snowy town, ride snowmobiles and take on missions for coins.</p>
              <ul className="mx-auto mt-4 max-w-xs space-y-1 text-left text-[14px] text-sky-100/90">
                <li><b>WASD / arrows</b>: walk or drive</li>
                <li><b>E</b>: hop on or off a snowmobile, start a mission</li>
                <li><b>Space</b>: handbrake, for drifting</li>
                <li><b>P</b>: pause</li>
              </ul>
              <div className="mt-4 grid grid-cols-3 gap-2 text-[12px] text-sky-100/80">{MISSIONS.map(m => <div key={m.id} className="rounded-xl bg-white/5 p-2"><div className="font-bold text-white">{m.title}</div>{m.reward}+ coins</div>)}</div>
              <button className="btn-primary mt-5 w-full" onClick={begin}>Enter Yeti Town</button>
            </div>
          </div>
        )}
        {paused && started && <div className="absolute inset-0 grid place-items-center bg-slate-950/50 backdrop-blur-sm"><button className="btn-primary" onClick={() => setPaused(false)}><Play className="h-4 w-4" />Resume</button></div>}
      </div>

      {/* touch controls */}
      <div className="mt-3 flex items-center justify-between gap-3 select-none sm:hidden">
        <div className="grid grid-cols-3 grid-rows-2 gap-1.5">
          <span /><button className="pad" {...touch("up")}>▲</button><span />
          <button className="pad" {...touch("left")}>◀</button><button className="pad" {...touch("down")}>▼</button><button className="pad" {...touch("right")}>▶</button>
        </div>
        <div className="flex gap-2">
          <button className="pad !w-20" {...touch("brake")}>Drift</button>
          <button className="pad !w-20 !bg-sky-400 !text-night" {...touch("action")}>E</button>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] text-sky-100/50">Yeti Town is a free-roam sandbox: coins are saved in this browser only. Ice Dash scores are the server-verified, on-chain ones.</p>
    </div>
  );
}
