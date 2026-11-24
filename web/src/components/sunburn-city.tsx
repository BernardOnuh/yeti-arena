"use client";
// Sunburn City: a 3D open-world comedy caper. Fixed 60 Hz simulation, three.js scene, HUD with cinematic title cards,
// a lifeguard alert meter, a minimap, keyboard and touch controls, and coins saved in this browser.
import { useEffect, useRef, useState } from "react";
import { Coins, Navigation, Pause, Play, Radio, Snowflake, Sun, Volume2, VolumeX } from "lucide-react";
import { MISSIONS, newGame, objectives, speedOf, step, type Card, type Game, type Keys } from "@/game/city/game";
import { createScene } from "@/game/city/scene";
import { cityAudio } from "@/game/city/audio";
import { BLOCK, BOUNDS, CITY, N, PITCH, ROAD, SAND_END } from "@/game/city/world";

const SAVE = "sunburn-city:v1";
const STEP = 1 / 60;
const KEYMAP: Record<string, keyof Keys> = {
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  Space: "brake", KeyE: "action", Enter: "action", KeyH: "horn",
};

interface Hud {
  coins: number; heat: number; prompt: string | null; toast: string | null; card: Card | null; driving: boolean; speed: number; done: number;
  caper: { title: string; step: string; left: number } | null; arrow: { angle: number; dist: number } | null;
}

export function SunburnCity() {
  const canvas = useRef<HTMLCanvasElement>(null), mini = useRef<HTMLCanvasElement>(null);
  const keys = useRef<Keys>({ up: false, down: false, left: false, right: false, brake: false, action: false, horn: false });
  const [started, setStarted] = useState(false), [paused, setPaused] = useState(false), [muted, setMuted] = useState(false), [radio, setRadio] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snowing, setSnowing] = useState(true);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<Hud>({ coins: 0, heat: 0, prompt: null, toast: null, card: null, driving: false, speed: 0, done: 0, caper: null, arrow: null });
  const startedRef = useRef(false); startedRef.current = started;
  const pausedRef = useRef(false); pausedRef.current = paused;

  useEffect(() => {
    const g = newGame();
    try { const s = JSON.parse(localStorage.getItem(SAVE) || "null"); if (s) { g.coins = s.coins || 0; g.done = s.done || {}; if (s.weather === "sun") g.weather = "sun"; } } catch { /* no save yet */ }
    gameRef.current = g; setSnowing(g.weather === "snow");
    if (process.env.NODE_ENV !== "production") (window as unknown as { __city: Game }).__city = g; // for the browser test
    const cv = canvas.current!;
    let scene: ReturnType<typeof createScene>;
    try { scene = createScene(cv, g); } catch (e) { setError(e instanceof Error ? e.message : "WebGL isn't available"); return; }
    const resize = () => { const r = cv.getBoundingClientRect(); scene.resize(r.width, r.height); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cv);
    const mapImg = drawMapBase();
    let raf = 0, last = performance.now(), acc = 0, hudAt = 0, saveAt = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const running = startedRef.current && !pausedRef.current;
      if (running) {
        acc += dt;
        while (acc >= STEP) { step(g, keys.current, STEP); acc -= STEP; }
        for (const e of g.events.splice(0)) cityAudio.play(e);
      }
      cityAudio.frame(running && !!g.car, g.car ? speedOf(g.car) : 0);
      scene.update(running ? dt : 0, dt, !startedRef.current);
      if (mini.current) drawMinimap(mini.current, mapImg, g);
      if (now - hudAt > 100) {
        hudAt = now;
        const a = g.active, def = a && MISSIONS.find(m => m.id === a.id)!;
        const stepText = !a ? "" : a.id === "heist" ? (a.stage === 0 ? "Get in the ice cream truck" : g.car !== a.truck ? "Get back in the truck!" : "Drive it to the Cool Cave. It's melting!")
          : a.id === "coolers" ? `Coolers ${a.got.filter(Boolean).length}/6` : `Shake the lifeguards: ${g.heat} still on you`;
        const p = g.car ?? g.yeti, heading = g.car ? g.car.h : g.yeti.h;
        const targets = objectives(g), near = targets.sort((u, v) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(v.x - p.x, v.z - p.z))[0];
        setHud({
          coins: g.coins, heat: g.heat, prompt: g.prompt, toast: g.toast?.text ?? null, card: g.card, driving: !!g.car, speed: g.car ? Math.round(speedOf(g.car) * 3.6) : 0,
          done: Object.keys(g.done).length, caper: def ? { title: def.title, step: stepText, left: Math.max(0, a!.left) } : null,
          arrow: near ? { angle: Math.atan2(near.z - p.z, near.x - p.x) - heading, dist: Math.round(Math.hypot(near.x - p.x, near.z - p.z)) } : null,
        });
      }
      if (now - saveAt > 2000) { saveAt = now; try { localStorage.setItem(SAVE, JSON.stringify({ coins: g.coins, done: g.done, weather: g.weather })); } catch { /* private mode */ } }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); scene.dispose(); cityAudio.dispose(); };
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "KeyP" || e.code === "Escape") { setPaused(p => !p); return; }
      if (e.code === "KeyR") { cityAudio.radio = !cityAudio.radio; setRadio(cityAudio.radio); return; }
      if (e.code === "KeyN") { toggleWeather(); return; }
      const k = KEYMAP[e.code]; if (!k) return;
      e.preventDefault();
      if (!startedRef.current) { begin(); return; }
      if (k === "action") { if (!e.repeat) keys.current.action = true; } else keys.current[k] = true;
    };
    const up = (e: KeyboardEvent) => { const k = KEYMAP[e.code]; if (k && k !== "action") keys.current[k] = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  function begin() { cityAudio.unlock(); setStarted(true); }
  function toggleWeather() { const g = gameRef.current; if (!g) return; g.weather = g.weather === "snow" ? "sun" : "snow"; setSnowing(g.weather === "snow"); }
  const hold = (k: keyof Keys, on: boolean) => { if (k === "action") { if (on) keys.current.action = true; } else keys.current[k] = on; };
  const touch = (k: keyof Keys) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); if (!startedRef.current) begin(); hold(k, true); },
    onPointerUp: () => hold(k, false), onPointerLeave: () => hold(k, false), onPointerCancel: () => hold(k, false),
  });
  const chip = "rounded-2xl bg-black/45 backdrop-blur-md border border-white/10";

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="relative overflow-hidden rounded-[28px] border border-white/15 bg-[#ffd2a6] shadow-[0_30px_80px_-30px_rgba(0,0,0,.8)]">
        <canvas ref={canvas} className="block h-[64svh] min-h-[400px] w-full touch-none sm:h-[74vh]" />
        {error && <div className="absolute inset-0 grid place-items-center bg-night p-6 text-center text-sky-100">This game needs WebGL, which this browser has turned off. ({error})</div>}

        {/* top HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
          <div className="space-y-2">
            {hud.caper ? (
              <div className={`${chip} px-4 py-2.5 text-white`}>
                <div className="font-display text-[17px] font-bold tracking-wide">{hud.caper.title}</div>
                <div className="mt-0.5 flex items-center gap-3 text-[13px] font-bold"><span className="text-amber-200">{hud.caper.step}</span><span className={`tabular-nums ${hud.caper.left < 15 ? "text-rose-300" : "text-white/80"}`}>{hud.caper.left.toFixed(0)}s</span></div>
              </div>
            ) : started && <div className={`${chip} px-3.5 py-2 text-[13px] font-bold text-white/90`}>Follow a golden beam to start a caper · {hud.done}/3 done</div>}
            {hud.heat > 0 && (
              <div className={`${chip} flex items-center gap-2 px-3 py-1.5 text-[12px] font-black uppercase tracking-wider text-white`}>
                Lifeguard alert
                {[1, 2, 3].map(i => <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 ${i <= hud.heat ? "animate-pulse border-rose-300 bg-rose-500" : "border-white/40"}`} />)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className={`${chip} flex items-center gap-1.5 px-3 py-2 font-display text-[18px] font-bold tabular-nums text-amber-300`}><Coins className="h-4 w-4" />{hud.coins.toLocaleString()}</div>
            <button className={`${chip} pointer-events-auto grid h-10 w-10 place-items-center text-white`} aria-label={snowing ? "Make it sunny (N)" : "Make it snow (N)"} title={snowing ? "Make it sunny (N)" : "Make it snow (N)"} onClick={toggleWeather}>{snowing ? <Sun className="h-4 w-4" /> : <Snowflake className="h-4 w-4" />}</button>
            <button className={`${chip} pointer-events-auto grid h-10 w-10 place-items-center text-white ${radio ? "" : "opacity-50"}`} aria-label="Radio (R)" title="Radio (R)" onClick={() => { cityAudio.radio = !radio; setRadio(!radio); }}><Radio className="h-4 w-4" /></button>
            <button className={`${chip} pointer-events-auto grid h-10 w-10 place-items-center text-white`} aria-label={muted ? "Unmute" : "Mute"} onClick={() => { cityAudio.setMuted(!muted); setMuted(!muted); }}>{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
            <button className={`${chip} pointer-events-auto grid h-10 w-10 place-items-center text-white`} aria-label={paused ? "Resume" : "Pause"} onClick={() => setPaused(p => !p)}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
          </div>
        </div>

        {/* objective compass */}
        {hud.arrow && started && (
          <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center sm:top-4">
            <Navigation className="h-8 w-8 fill-amber-300 text-amber-500 drop-shadow" style={{ transform: `rotate(${(hud.arrow.angle * 180) / Math.PI + 45}deg)` }} />
            <span className="mt-0.5 rounded-full bg-black/45 px-2 text-[12px] font-bold tabular-nums text-white">{hud.arrow.dist} m</span>
          </div>
        )}

        {/* cinematic title card */}
        {hud.card && started && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-[11%] bg-black/85" /><div className="absolute inset-x-0 bottom-0 h-[11%] bg-black/85" />
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center">
              <div className={`font-display text-[44px] font-black uppercase leading-none tracking-tight drop-shadow-[0_4px_0_rgba(0,0,0,.45)] sm:text-[76px] ${hud.card.tone === "bad" ? "text-rose-300" : hud.card.tone === "good" ? "text-amber-300" : "text-white"}`} style={{ WebkitTextStroke: "1.5px rgba(0,0,0,.35)" }}>{hud.card.title}</div>
              <div className="mx-auto mt-3 max-w-xl text-[15px] font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,.8)] sm:text-[18px]">{hud.card.sub}</div>
            </div>
          </div>
        )}
        {hud.toast && !hud.card && <div className="pointer-events-none absolute left-1/2 top-24 max-w-[90%] -translate-x-1/2 rounded-2xl bg-black/60 px-4 py-2 text-center text-[14px] font-bold text-white backdrop-blur">{hud.toast}</div>}
        {hud.prompt && !hud.card && <div className="pointer-events-none absolute bottom-5 left-1/2 max-w-[60%] -translate-x-1/2 rounded-2xl bg-black/60 px-4 py-2 text-center text-[14px] font-bold text-white backdrop-blur">{hud.prompt}</div>}

        {/* speed + minimap */}
        {hud.driving && <div className={`${chip} pointer-events-none absolute bottom-4 left-4 px-4 py-2 font-display text-[28px] font-bold leading-none tabular-nums text-white`}>{hud.speed}<span className="ml-1 text-[12px] text-white/70">km/h</span></div>}
        <canvas ref={mini} width={180} height={180} className="pointer-events-none absolute bottom-4 right-4 h-[120px] w-[120px] rounded-full border-4 border-black/40 shadow-lg sm:h-[160px] sm:w-[160px]" />

        {!started && !error && (
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/75 via-black/25 to-transparent p-5 sm:items-center sm:bg-gradient-to-r sm:from-black/70 sm:via-black/30 sm:p-12">
            <div className="max-w-md text-left text-white">
              <div className="font-display text-[54px] font-black uppercase leading-none tracking-tight drop-shadow-[0_5px_0_rgba(0,0,0,.4)] sm:text-[80px]">Sunburn<br /><span className="text-amber-300">City</span></div>
              <p className="mt-3 max-w-md text-[16px] font-semibold text-white/90">A Yeti on vacation. Borrow cars, jump the beach ramps, pull off comedy capers and keep the lifeguards off your tail.</p>
              <div className="mt-4 grid max-w-md grid-cols-2 gap-x-5 gap-y-1 text-left text-[13px] text-white/85">
                <span><b>W A S D / arrows</b> drive or walk</span><span><b>Space</b> handbrake drift</span>
                <span><b>E</b> get in or out, start a caper</span><span><b>H</b> horn · <b>R</b> radio · <b>N</b> snow · <b>P</b> pause</span>
              </div>
              <button className="btn-primary mt-6 px-10 text-[18px]" onClick={begin}>Hit the beach</button>
            </div>
          </div>
        )}
        {paused && started && <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-sm"><button className="btn-primary" onClick={() => setPaused(false)}><Play className="h-4 w-4" />Resume</button></div>}
      </div>

      {/* touch controls */}
      <div className="mt-3 flex select-none items-center justify-between gap-3 sm:hidden">
        <div className="grid grid-cols-3 grid-rows-2 gap-1.5">
          <span /><button className="pad" {...touch("up")}>▲</button><span />
          <button className="pad" {...touch("left")}>◀</button><button className="pad" {...touch("down")}>▼</button><button className="pad" {...touch("right")}>▶</button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button className="pad !w-16 text-sm" {...touch("horn")}>Horn</button>
          <button className="pad !w-16 text-sm" {...touch("brake")}>Drift</button>
          <button className="pad col-span-2 !w-full !bg-amber-300 !text-night" {...touch("action")}>E</button>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] text-sky-100/50">Sunburn City is an original game: a sandbox whose coins are saved in this browser only. Ice Dash scores are the server-verified, on-chain ones. Car model: “Car Concept” by Eric Chadwick (CC BY 4.0), modified.</p>
    </div>
  );
}

// ---------- minimap ----------
const MAP_SPAN = BOUNDS.x1 - BOUNDS.x0;
function drawMapBase() {
  const c = document.createElement("canvas"); c.width = c.height = 512;
  const x = c.getContext("2d")!, k = 512 / MAP_SPAN, X = (v: number) => (v - BOUNDS.x0) * k, Z = (v: number) => (v - BOUNDS.z0) * k + (512 - (BOUNDS.z1 - BOUNDS.z0) * k) / 2;
  x.fillStyle = "#86b862"; x.fillRect(0, 0, 512, 512);
  x.fillStyle = "#4a4f5c"; x.fillRect(X(0), Z(0), CITY * k, CITY * k);
  x.fillStyle = "#f2d39a"; x.fillRect(X(CITY), 0, (SAND_END - CITY) * k, 512);
  x.fillStyle = "#2a8fc4"; x.fillRect(X(SAND_END), 0, 512, 512);
  for (let bz = 0; bz < N; bz++) for (let bx = 0; bx < N; bx++) { x.fillStyle = (bx === 2 && bz === 2) ? "#f4dfb8" : (bx === 1 && bz === 3) || (bx === 3 && bz === 1) ? "#79b85d" : "#c9c1b2"; x.fillRect(X(ROAD + bx * PITCH), Z(ROAD + bz * PITCH), BLOCK * k, BLOCK * k); }
  return { c, X, Z, k };
}
function drawMinimap(cv: HTMLCanvasElement, m: ReturnType<typeof drawMapBase>, g: Game) {
  const x = cv.getContext("2d")!, S = cv.width, p = g.car ?? g.yeti, zoom = 1.25;
  x.save(); x.clearRect(0, 0, S, S);
  x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, 7); x.clip();
  x.translate(S / 2, S / 2); x.scale(zoom * S / 512, zoom * S / 512); x.translate(-m.X(p.x), -m.Z(p.z));
  x.drawImage(m.c, 0, 0);
  for (const b of g.world.buildings) { x.fillStyle = b.sign ? "#ffd84a" : "#efe7da"; x.fillRect(m.X(b.x0), m.Z(b.z0), (b.x1 - b.x0) * m.k, (b.z1 - b.z0) * m.k); }
  const dot = (wx: number, wz: number, color: string, r: number) => { x.fillStyle = color; x.beginPath(); x.arc(m.X(wx), m.Z(wz), r, 0, 7); x.fill(); x.strokeStyle = "#000a"; x.lineWidth = 1; x.stroke(); };
  if (!g.active) for (const mm of MISSIONS) { const pl = g.world.places[mm.giver]; dot(pl.x, pl.z, "#ffd84a", 5); }
  for (const o of objectives(g)) dot(o.x, o.z, g.active?.id === "coolers" ? "#4fc3ff" : "#ff7ac0", 5);
  for (const v of g.vehicles) if (v.ai === "lifeguard") dot(v.x, v.z, Math.floor(g.time * 6) % 2 ? "#ff3b3b" : "#ffffff", 4);
  // the player as an arrow
  const h = g.car ? g.car.h : g.yeti.h;
  x.translate(m.X(p.x), m.Z(p.z)); x.rotate(h);
  x.fillStyle = "#ffffff"; x.strokeStyle = "#000"; x.lineWidth = 1.2;
  x.beginPath(); x.moveTo(7, 0); x.lineTo(-5, -4.5); x.lineTo(-2.5, 0); x.lineTo(-5, 4.5); x.closePath(); x.fill(); x.stroke();
  x.restore();
}
