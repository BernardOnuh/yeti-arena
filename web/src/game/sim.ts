// Ice Dash simulation. Deterministic: the same seed and the same inputs always give the same result, using
// integer arithmetic only. The browser runs it to play; the server runs it again on the recorded inputs to compute
// the score it will stand behind. The score the browser reports is never trusted.

export const GAME_ID = "ice-dash";
export const GAME_VERSION = 1;
export const TICK_HZ = 60;
export const DURATION_TICKS = 60 * TICK_HZ; // 60 seconds
export const LANES = 3;
export const LIVES = 3;
export const JUMP_TICKS = 38;
export const INVULN_TICKS = 70;
export const SPAWN_AHEAD = 6000; // world units ahead of the player where rows appear
export const MAX_INPUTS = 1200;

/** 0 = left, 1 = right, 2 = jump. */
export type Action = 0 | 1 | 2;
export type Input = [tick: number, action: Action];

export type Row = { id: number; z: number; crevasse: [boolean, boolean, boolean]; flake: number; taken: boolean };
export type State = {
  tick: number; lane: number; jumpUntil: number; invulnUntil: number; lives: number;
  distance: number; flakes: number; rows: Row[]; nextId: number; farZ: number; rand: () => number; over: boolean;
  /** Set for one tick when something happens, for sounds and effects. */
  hit: boolean; collected: boolean;
};
export type Result = { score: number; distance: number; flakes: number; lives: number; endedTick: number; survived: boolean };

/** mulberry32: small, fast, and identical in every JavaScript engine. */
function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Folds a hex seed (any length) into 32 bits with FNV-1a. */
export function seedToU32(hex: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < hex.length; i++) { h ^= hex.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** World units per tick: speeds up from 20 to 44 over the minute. */
export const speedAt = (tick: number) => 20 + Math.floor((tick * 24) / DURATION_TICKS);

export function newState(seedHex: string): State {
  const s: State = {
    tick: 0, lane: 1, jumpUntil: 0, invulnUntil: 0, lives: LIVES, distance: 0, flakes: 0,
    rows: [], nextId: 0, farZ: 1800, rand: mulberry32(seedToU32(seedHex)), over: false, hit: false, collected: false,
  };
  spawn(s);
  return s;
}

function spawn(s: State) {
  while (s.farZ < SPAWN_AHEAD) {
    const r = s.rand;
    // Rows get closer together and more often double as the minute goes on.
    const progress = Math.min(s.tick, DURATION_TICKS);
    const gap = 1500 - Math.floor((progress * 500) / DURATION_TICKS) + (r() % 700);
    const z = s.farZ + gap;
    const double = r() % 100 < 20 + Math.floor((progress * 45) / DURATION_TICKS);
    const crevasse: [boolean, boolean, boolean] = [false, false, false];
    const first = r() % LANES;
    crevasse[first] = true;
    if (double) crevasse[(first + 1 + (r() % 2)) % LANES] = true;
    let flake = -1;
    if (r() % 100 < 65) {
      const free = [0, 1, 2].filter(l => !crevasse[l]);
      flake = free[r() % free.length];
    }
    s.rows.push({ id: s.nextId++, z, crevasse, flake, taken: false });
    s.farZ = z;
  }
}

/** Advances one tick, applying this tick's actions first. */
export function step(s: State, actions: Action[]) {
  if (s.over) return;
  s.hit = false; s.collected = false;
  for (const a of actions) {
    if (a === 0) s.lane = Math.max(0, s.lane - 1);
    else if (a === 1) s.lane = Math.min(LANES - 1, s.lane + 1);
    else if (a === 2 && s.tick >= s.jumpUntil) s.jumpUntil = s.tick + JUMP_TICKS;
  }
  const sp = speedAt(s.tick);
  const airborne = s.tick < s.jumpUntil;
  for (const row of s.rows) {
    const before = row.z;
    row.z -= sp;
    if (before > 0 && row.z <= 0) {
      if (row.crevasse[s.lane] && !airborne && s.tick >= s.invulnUntil) {
        s.lives -= 1; s.hit = true; s.invulnUntil = s.tick + INVULN_TICKS;
      }
      if (row.flake === s.lane && !row.taken) { row.taken = true; s.flakes += 1; s.collected = true; }
    }
  }
  s.rows = s.rows.filter(r => r.z > -1500);
  s.farZ -= sp;
  s.distance += sp;
  s.tick += 1;
  spawn(s);
  if (s.lives <= 0 || s.tick >= DURATION_TICKS) s.over = true;
}

export function result(s: State): Result {
  const survived = s.lives > 0 && s.tick >= DURATION_TICKS;
  const score = Math.floor(s.distance / 100) + s.flakes * 25 + (survived ? 250 + s.lives * 100 : 0);
  return { score, distance: s.distance, flakes: s.flakes, lives: Math.max(0, s.lives), endedTick: s.tick, survived };
}

export type Verdict = { ok: true; result: Result } | { ok: false; reason: string };

/** Checks an input log is well formed and humanly plausible, then replays it. */
export function replay(seedHex: string, inputs: unknown): Verdict {
  if (!Array.isArray(inputs)) return { ok: false, reason: "inputs must be a list" };
  if (inputs.length > MAX_INPUTS) return { ok: false, reason: "too many inputs" };
  let last = -1;
  const seen = new Set<string>();
  for (const inp of inputs) {
    if (!Array.isArray(inp) || inp.length !== 2) return { ok: false, reason: "malformed input" };
    const [t, a] = inp;
    if (!Number.isInteger(t) || t < 0 || t >= DURATION_TICKS) return { ok: false, reason: "input outside the run" };
    if (a !== 0 && a !== 1 && a !== 2) return { ok: false, reason: "unknown action" };
    if (t < last) return { ok: false, reason: "inputs out of order" };
    const key = `${t}:${a}`;
    if (seen.has(key)) return { ok: false, reason: "duplicate input" };
    seen.add(key);
    last = t;
  }
  // More than 12 actions inside any one second is beyond sustained human play.
  const ticks = (inputs as Input[]).map(i => i[0]);
  for (let i = 0, j = 0; j < ticks.length; j++) {
    while (ticks[j] - ticks[i] >= TICK_HZ) i++;
    if (j - i + 1 > 12) return { ok: false, reason: "input rate beyond human play" };
  }

  const s = newState(seedHex);
  let k = 0;
  const log = inputs as Input[];
  while (!s.over) {
    const now: Action[] = [];
    while (k < log.length && log[k][0] === s.tick) now.push(log[k++][1]);
    step(s, now);
  }
  if (k < log.length) return { ok: false, reason: "inputs after the run ended" };
  return { ok: true, result: result(s) };
}
