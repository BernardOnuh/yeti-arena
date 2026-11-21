// Tiny synthesized sound effects (Web Audio), so there are no audio files to license.
type Sfx = "move" | "jump" | "flake" | "hit" | "tick" | "go" | "win" | "over";

let ctx: AudioContext | null = null;

function tone(freq: number, dur: number, type: OscillatorType, vol = 0.12, slide = 0, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  muted: false,
  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock() {
    try { ctx ??= new AudioContext(); if (ctx.state === "suspended") void ctx.resume(); } catch { ctx = null; }
  },
  play(s: Sfx) {
    if (this.muted || !ctx) return;
    switch (s) {
      case "move": tone(520, 0.06, "triangle", 0.05); break;
      case "jump": tone(300, 0.22, "sine", 0.1, 500); break;
      case "flake": tone(1046, 0.09, "sine", 0.09); tone(1568, 0.14, "sine", 0.07, 0, 0.06); break;
      case "hit": tone(140, 0.3, "sawtooth", 0.12, -80); break;
      case "tick": tone(660, 0.08, "square", 0.05); break;
      case "go": tone(990, 0.2, "square", 0.06); break;
      case "win": [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, "triangle", 0.08, 0, i * 0.1)); break;
      case "over": [392, 330, 262].forEach((f, i) => tone(f, 0.22, "triangle", 0.08, 0, i * 0.14)); break;
    }
  },
};
