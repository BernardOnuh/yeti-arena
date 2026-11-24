// Sunburn City's sound, all synthesized with Web Audio (no audio files to license): an engine that follows your speed,
// lifeguard whistles, a horn, comedy boings and crashes, and an original laid-back beach-radio groove.
let ctx: AudioContext | null = null, master: GainNode | null = null, musicBus: GainNode | null = null;
let engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
let timer: ReturnType<typeof setInterval> | null = null, nextBeat = 0, beat = 0;

function tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slide = 0, bus: AudioNode | null = master) {
  if (!ctx || !bus) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur: number, vol: number, at = 0, cutoff = 6000, bus: AudioNode | null = master) {
  if (!ctx || !bus) return;
  const t = ctx.currentTime + at, len = Math.ceil(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf; f.type = "lowpass"; f.frequency.value = cutoff; g.gain.value = vol;
  src.connect(f).connect(g).connect(bus); src.start(t);
}

// I–vi–IV–V in C, a relaxed beach shuffle at 96 bpm
const CHORDS = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]];
const BASS = [65.4, 55.0, 43.7, 49.0];
function scheduleMusic() {
  if (!ctx || !musicBus) return;
  const spb = 60 / 96 / 2; // eighth notes
  while (nextBeat < ctx.currentTime + 0.2) {
    const at = nextBeat - ctx.currentTime, bar = Math.floor(beat / 8) % 4, pos = beat % 8;
    if (pos === 0 || pos === 3 || pos === 4 || pos === 6) tone(BASS[bar] * (pos === 6 ? 1.5 : 1), 0.28, "triangle", 0.16, at, 0, musicBus);
    if (pos === 2 || pos === 6) CHORDS[bar].forEach((f, i) => tone(f, 0.22, "square", 0.022, at + i * 0.012, 0, musicBus));
    if (pos === 5 && bar % 2 === 1) tone(CHORDS[bar][2] * 2, 0.3, "sine", 0.05, at, 0, musicBus);
    noise(0.05, pos % 2 ? 0.05 : 0.025, at, 9000, musicBus);
    if (pos === 4) noise(0.12, 0.08, at, 2500, musicBus);
    nextBeat += spb; beat++;
  }
}

export const cityAudio = {
  muted: false,
  radio: true,
  unlock() {
    try {
      if (!ctx) {
        ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
        musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
        const osc = ctx.createOscillator(), osc2 = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
        osc.type = "sawtooth"; osc2.type = "square"; filter.type = "lowpass"; filter.frequency.value = 500; gain.gain.value = 0;
        osc.connect(filter); osc2.connect(filter); filter.connect(gain).connect(master); osc.start(); osc2.start();
        engine = { osc, osc2, gain, filter };
        nextBeat = ctx.currentTime + 0.1; timer = setInterval(scheduleMusic, 50);
      }
      if (ctx.state === "suspended") void ctx.resume();
    } catch { ctx = null; }
  },
  setMuted(m: boolean) { this.muted = m; if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05); },
  /** Called every frame: engine pitch from speed, radio up while driving. */
  frame(driving: boolean, speed: number) {
    if (!ctx || !engine || !musicBus) return;
    const t = ctx.currentTime;
    engine.gain.gain.setTargetAtTime(driving ? 0.045 : 0, t, 0.1);
    engine.osc.frequency.setTargetAtTime(48 + speed * 3.2, t, 0.08); engine.osc2.frequency.setTargetAtTime(24 + speed * 1.6, t, 0.08);
    engine.filter.frequency.setTargetAtTime(380 + speed * 30, t, 0.1);
    musicBus.gain.setTargetAtTime(this.radio ? (driving ? 0.9 : 0.4) : 0, t, 0.4);
  },
  play(e: string) {
    if (!ctx || this.muted) return;
    switch (e) {
      case "whistle": tone(2600, 0.35, "sine", 0.06, 0, 300); tone(2700, 0.35, "sine", 0.04, 0.02, -200); break;
      case "horn": tone(330, 0.25, "square", 0.05); tone(415, 0.25, "square", 0.04); break;
      case "boing": tone(180, 0.35, "sine", 0.14, 0, 520); break;
      case "crash": noise(0.35, 0.35, 0, 1800); tone(90, 0.3, "sawtooth", 0.08, 0, -40); break;
      case "splash": noise(0.25, 0.12, 0, 3000); break;
      case "door": tone(220, 0.08, "square", 0.05); tone(160, 0.1, "square", 0.05, 0.07); break;
      case "coin": tone(988, 0.08, "square", 0.05); tone(1319, 0.18, "square", 0.05, 0.07); break;
      case "stunt": [523, 659, 784, 1046, 1319].forEach((f, i) => tone(f, 0.14, "triangle", 0.07, i * 0.06)); break;
      case "start": [392, 523, 659].forEach((f, i) => tone(f, 0.3, "sawtooth", 0.04, i * 0.12)); noise(0.6, 0.06, 0, 1200); break;
      case "win": [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.22, "triangle", 0.08, i * 0.11)); break;
      case "fail": [392, 349, 311, 262].forEach((f, i) => tone(f, 0.3, "sawtooth", 0.05, i * 0.17)); break;
      case "bust": tone(2600, 0.25, "sine", 0.07); tone(2600, 0.25, "sine", 0.07, 0.3); tone(110, 0.8, "sawtooth", 0.06, 0.5, -40); break;
    }
  },
  dispose() { if (timer) clearInterval(timer); timer = null; void ctx?.close(); ctx = null; engine = null; master = null; musicBus = null; },
};
