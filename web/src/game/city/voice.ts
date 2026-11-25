// The voice guide: spoken help using the browser's own speech synthesis (no audio files, no services). It welcomes
// the player, gives turn-by-turn directions to the next goal, and calls out capers, chases and prompts. Navigation
// lines never interrupt; important lines (a caper starting, getting busted) cut in. The radio dips while it talks.
import { cityAudio } from "./audio";

type Priority = 0 | 1 | 2;   // 0 directions, 1 hints, 2 big moments

let voice: SpeechSynthesisVoice | null = null, current: Priority = 0, speaking = false;

function pickVoice() {
  if (typeof speechSynthesis === "undefined") return;
  const all = speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
  const prefer = ["Samantha", "Google US English", "Ava", "Allison", "Susan", "Zira", "Aria", "Jenny", "Alex"];
  voice = prefer.map(n => all.find(v => v.name.includes(n))).find(Boolean) ?? all.find(v => v.lang === "en-US") ?? all[0] ?? null;
}

export const guide = {
  enabled: true,
  available: typeof window !== "undefined" && "speechSynthesis" in window,
  init() {
    if (!this.available) return;
    pickVoice(); speechSynthesis.onvoiceschanged = pickVoice;
  },
  say(text: string, priority: Priority = 1) {
    if (!this.enabled || !this.available || cityAudio.muted) return;
    // directions never interrupt; a more important line cuts in; an equally important one waits its turn (the
    // browser's speech queue plays it next)
    if (speaking) { if (priority === 0) return; if (priority > current) speechSynthesis.cancel(); }
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = 1.04; u.pitch = 1.05; u.volume = 1;
    u.onstart = () => { speaking = true; current = priority; cityAudio.ducked = true; };
    u.onend = u.onerror = () => { speaking = false; current = 0; cityAudio.ducked = false; };
    speechSynthesis.speak(u);
  },
  get speaking() { return speaking; },
  get debug() { return { speaking, current, enabled: this.enabled }; },
  stop() { if (this.available) speechSynthesis.cancel(); speaking = false; cityAudio.ducked = false; },
};

/** Turn-by-turn directions: call with the player's position and heading and the goal, a few times a second. */
export function makeNavigator() {
  let lastKind = "", lastAt = 0, stableSince = 0, pending = "", arrived = "", goalKey = "";
  return function navigate(now: number, me: { x: number; z: number; h: number }, goal: { x: number; z: number; name: string } | null) {
    if (!goal) { goalKey = ""; return; }
    const key = `${goal.name}@${Math.round(goal.x)},${Math.round(goal.z)}`;
    if (key !== goalKey) { goalKey = key; lastKind = ""; arrived = ""; lastAt = 0; }
    const dist = Math.hypot(goal.x - me.x, goal.z - me.z);
    let rel = Math.atan2(goal.z - me.z, goal.x - me.x) - me.h; rel = Math.atan2(Math.sin(rel), Math.cos(rel));   // > 0: to the right
    // goal.name reads naturally on its own: "the passenger", "Ocean Avenue and Palm Street", "ramp 2"
    const Name = goal.name.charAt(0).toUpperCase() + goal.name.slice(1);
    if (dist < 28) { if (arrived !== key) { arrived = key; guide.say(`You're almost there: ${goal.name}.`, 0); } return; }
    const kind = Math.abs(rel) < 0.4 ? "ahead" : Math.abs(rel) > 2.4 ? "behind" : rel > 0 ? "right" : "left";
    if (kind !== pending) { pending = kind; stableSince = now; }
    const steady = now - stableSince > 1300, changed = kind !== lastKind, stale = now - lastAt > 14000;
    if (!steady || (!changed && !stale) || guide.speaking) return;
    const metres = dist > 150 ? `${Math.round(dist / 50) * 50} metres` : `${Math.round(dist / 10) * 10} metres`;
    const line = kind === "ahead" ? `Keep going straight. ${Name} is ${metres} ahead.`
      : kind === "behind" ? `Turn around. ${Name} is behind you.`
      : `Turn ${kind}. ${Name} is ${metres} away.`;
    guide.say(line, 0); lastKind = kind; lastAt = now;
  };
}
