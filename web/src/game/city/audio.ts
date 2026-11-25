// Sunburn City's sound, all synthesized with Web Audio (no audio files to license): an engine that follows your speed,
// lifeguard whistles, a horn, comedy boings and crashes, and two original radio stations: "Sunburn Pop FM" (an upbeat
// American-style pop track: four-on-the-floor kick, claps, a pumping bass, off-beat synth stabs and a lead hook) and
// the laid-back beach groove. A third station, "My Music", plays the player's own files (handled by the component).
// The music dips while the voice guide talks.
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

export type Station = "pop" | "beach" | "mine" | "off";
export const STATIONS: { id: Station; name: string }[] = [
  { id: "pop", name: "Sunburn Pop FM" }, { id: "beach", name: "Beach Groove" }, { id: "mine", name: "My Music" }, { id: "off", name: "Radio off" },
];

// Beach Groove: I–vi–IV–V in C, a relaxed shuffle at 96 bpm, in eighth notes
const CHORDS = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]];
const BASS = [65.4, 55.0, 43.7, 49.0];
function beachStep(at: number, n: number) {
  const bar = Math.floor(n / 8) % 4, pos = n % 8;
  if (pos === 0 || pos === 3 || pos === 4 || pos === 6) tone(BASS[bar] * (pos === 6 ? 1.5 : 1), 0.28, "triangle", 0.16, at, 0, musicBus);
  if (pos === 2 || pos === 6) CHORDS[bar].forEach((f, i) => tone(f, 0.22, "square", 0.022, at + i * 0.012, 0, musicBus));
  if (pos === 5 && bar % 2 === 1) tone(CHORDS[bar][2] * 2, 0.3, "sine", 0.05, at, 0, musicBus);
  noise(0.05, pos % 2 ? 0.05 : 0.025, at, 9000, musicBus);
  if (pos === 4) noise(0.12, 0.08, at, 2500, musicBus);
}

// Sunburn Pop FM: G–D–Em–C at 118 bpm, in sixteenth notes. An 8-bar loop: a verse with plucked arpeggios, then a
// chorus where the lead hook comes in. The melody is original.
const POP_BASS = [98.0, 73.42, 82.41, 65.41];
const POP_CHORDS = [[196.0, 246.94, 293.66], [185.0, 220.0, 293.66], [164.81, 196.0, 246.94], [164.81, 196.0, 261.63]];
const HOOK: [number, number][][] = [   // [sixteenth, frequency] per bar
  [[0, 587.33], [3, 493.88], [6, 587.33], [8, 659.26], [10, 587.33], [12, 493.88], [14, 440.0]],
  [[0, 440.0], [2, 493.88], [4, 587.33], [8, 440.0], [12, 369.99], [14, 440.0]],
  [[0, 493.88], [3, 392.0], [6, 493.88], [8, 587.33], [10, 659.26], [12, 587.33], [14, 493.88]],
  [[0, 523.25], [2, 493.88], [4, 440.0], [6, 392.0], [8, 329.63], [12, 392.0]],
];
function kick(at: number) {
  if (!ctx || !musicBus) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
  g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.3);
}
function popStep(at: number, n: number) {
  const bar = Math.floor(n / 16) % 4, chorus = Math.floor(n / 64) % 2 === 1, pos = n % 16, chord = POP_CHORDS[bar];
  if (pos % 4 === 0) kick(at);                                                              // four on the floor
  if (pos === 4 || pos === 12) { noise(0.16, 0.22, at, 3200, musicBus); noise(0.05, 0.12, at + 0.012, 5000, musicBus); }   // clap
  if (pos % 4 === 2) noise(0.04, 0.07, at, 11000, musicBus);                                // off-beat hats
  if (pos === 14) noise(0.12, 0.05, at, 9000, musicBus);                                    // open hat
  if (pos % 2 === 0) tone(POP_BASS[bar] * (pos === 6 || pos === 14 ? 2 : 1), 0.16, "sawtooth", 0.07, at, 0, musicBus);   // pumping bass
  if (pos % 4 === 2) chord.forEach((f, i) => tone(f * 2, 0.18, "square", 0.018, at + i * 0.006, 0, musicBus));          // off-beat stabs
  if (!chorus) tone(chord[pos % 3] * 2, 0.12, "triangle", 0.035, at, 0, musicBus);          // verse: plucked arpeggio
  else {
    for (const [s16, f] of HOOK[bar]) if (s16 === pos) { tone(f, 0.17, "square", 0.04, at, 0, musicBus); tone(f * 2, 0.15, "sine", 0.018, at, 0, musicBus); }
    if (pos === 0) chord.forEach(f => tone(f, 1.9, "sawtooth", 0.012, at, 0, musicBus));   // chorus: a wide pad under the hook
  }
  if (n % 128 === 124) noise(0.5, 0.06, at, 7000, musicBus);                                // a riser into the next loop
}

function scheduleMusic() {
  if (!ctx || !musicBus) return;
  const station = cityAudio.station;
  if (station !== "pop" && station !== "beach") { nextBeat = ctx.currentTime + 0.05; return; }
  const step = station === "pop" ? 60 / 118 / 4 : 60 / 96 / 2;
  while (nextBeat < ctx.currentTime + 0.2) {
    const at = nextBeat - ctx.currentTime;
    if (station === "pop") popStep(at, beat); else beachStep(at, beat);
    nextBeat += step; beat++;
  }
}

export const cityAudio = {
  muted: false,
  station: "pop" as Station,
  ducked: false,
  /** Picks a station and restarts its song from the top. */
  setStation(s: Station) { this.station = s; beat = 0; },
  /** The radio's volume right now (also used for the player's own music). */
  musicLevel(inGame: boolean) { return (inGame ? 0.75 : 0.3) * (this.ducked ? 0.3 : 1); },
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
  /** Called every frame: engine pitch from speed, and the radio's level (lower while the voice guide speaks). */
  frame(driving: boolean, speed: number, inGame = true) {
    if (!ctx || !engine || !musicBus) return;
    const t = ctx.currentTime;
    engine.gain.gain.setTargetAtTime(driving ? 0.045 : 0, t, 0.1);
    engine.osc.frequency.setTargetAtTime(48 + speed * 3.2, t, 0.08); engine.osc2.frequency.setTargetAtTime(24 + speed * 1.6, t, 0.08);
    engine.filter.frequency.setTargetAtTime(380 + speed * 30, t, 0.1);
    const synth = this.station === "pop" || this.station === "beach";
    musicBus.gain.setTargetAtTime(synth ? this.musicLevel(inGame) : 0, t, this.ducked ? 0.12 : 0.4);
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
