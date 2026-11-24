"use client";
// The mascot showcase: a live, slowly drifting render of the Yeti in the frozen mountains, with one-click exports of a
// 1:1 mascot image and a 16:9 4K hero image (no text, logos or watermarks in the render).
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { createMascotScene } from "@/game/mascot/scene";

const SHOTS = { square: { w: 2048, h: 2048, label: "Mascot 1:1 · 2048 px" }, hero: { w: 3840, h: 2160, label: "Hero 16:9 · 4K" } } as const;

export function MascotStage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<ReturnType<typeof createMascotScene> | null>(null);
  const [aspect, setAspect] = useState<"square" | "hero">("hero");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cv = canvas.current!;
    let s: ReturnType<typeof createMascotScene>;
    try { s = createMascotScene(cv); } catch (e) { setError(e instanceof Error ? e.message : "WebGL isn't available"); return; }
    stage.current = s;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __mascot: typeof s }).__mascot = s; // for the render script
    const resize = () => { const r = cv.getBoundingClientRect(); s.setSize(r.width, r.height); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cv);
    let raf = 0, last = performance.now();
    const loop = (now: number) => { s.frame(Math.min(0.05, (now - last) / 1000)); last = now; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); s.dispose(); };
  }, []);

  function save(kind: keyof typeof SHOTS) {
    const s = stage.current; if (!s) return;
    setBusy(kind);
    // let the button state paint before the (slow) high-resolution render
    setTimeout(() => {
      const { w, h } = SHOTS[kind], a = document.createElement("a");
      a.href = s.capture(w, h); a.download = `yeti-${kind === "square" ? "mascot-2048" : "hero-3840x2160"}.png`; a.click();
      setBusy(null);
    }, 50);
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className={`relative mx-auto overflow-hidden rounded-[28px] border border-white/15 bg-[#cfe2f5] shadow-[0_30px_80px_-30px_rgba(0,0,0,.8)] ${aspect === "square" ? "aspect-square max-w-[min(100%,78vh)]" : "aspect-video"}`}>
        <canvas ref={canvas} className="block h-full w-full" />
        {error && <div className="absolute inset-0 grid place-items-center bg-night p-6 text-center text-sky-100">This page needs WebGL, which this browser has turned off. ({error})</div>}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <div className="flex rounded-2xl bg-white/5 p-1 text-[14px] font-bold">
          {(["hero", "square"] as const).map(k => <button key={k} onClick={() => setAspect(k)} className={`rounded-xl px-4 py-2 ${aspect === k ? "bg-white/15 text-white" : "text-sky-100/70"}`}>{k === "hero" ? "16:9 hero" : "1:1 mascot"}</button>)}
        </div>
        {(Object.keys(SHOTS) as (keyof typeof SHOTS)[]).map(k => (
          <button key={k} className="btn-primary" disabled={!!busy} onClick={() => save(k)}><Download className="h-4 w-4" />{busy === k ? "Rendering…" : SHOTS[k].label}</button>
        ))}
      </div>
      <p className="mt-3 text-center text-[12px] text-sky-100/50">Rendered live in your browser with three.js. High-resolution exports can take a few seconds.</p>
    </div>
  );
}
