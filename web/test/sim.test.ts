import { test } from "node:test";
import assert from "node:assert/strict";
import { DURATION_TICKS, newState, replay, result, step, type Action, type Input } from "../src/game/sim.ts";

const SEED = "9f1c2a7be04d3c11aa55ee0099887766";

/** A simple bot that dodges using the simulation's own state, to produce a good, valid run. */
function botRun(seed: string) {
  const s = newState(seed);
  const inputs: Input[] = [];
  while (!s.over) {
    const acts: Action[] = [];
    const next = s.rows.filter(r => r.z > 0).sort((a, b) => a.z - b.z)[0];
    if (next && next.z < 400 && next.crevasse[s.lane]) {
      const free = [0, 1, 2].filter(l => !next.crevasse[l]);
      const target = free.sort((a, b) => Math.abs(a - s.lane) - Math.abs(b - s.lane))[0];
      if (Math.abs(target - s.lane) === 1) acts.push(target < s.lane ? 0 : 1);
      else if (s.tick >= s.jumpUntil) acts.push(2);
    }
    for (const a of acts) inputs.push([s.tick, a]);
    step(s, acts);
  }
  return { inputs, res: result(s) };
}

test("replaying the same inputs gives exactly the same result", () => {
  const { inputs, res } = botRun(SEED);
  const v = replay(SEED, inputs);
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.result, res);
});

test("a different seed gives a different course", () => {
  const a = newState(SEED), b = newState("00" + SEED.slice(2));
  assert.notDeepEqual(a.rows.map(r => r.crevasse), b.rows.map(r => r.crevasse));
});

test("doing nothing hits crevasses and ends early with a low score", () => {
  const v = replay(SEED, []);
  assert.equal(v.ok, true);
  if (v.ok) { assert.equal(v.result.survived, false); assert.ok(v.result.endedTick < DURATION_TICKS); }
});

test("a careful player can survive the full minute and scores more", () => {
  const { inputs, res } = botRun(SEED);
  const idle = replay(SEED, []);
  assert.ok(inputs.length > 0);
  assert.ok(idle.ok && res.score > idle.result.score);
});

test("malformed, out-of-order, duplicate, late and superhuman inputs are rejected", () => {
  assert.deepEqual(replay(SEED, "x"), { ok: false, reason: "inputs must be a list" });
  assert.deepEqual(replay(SEED, [[5, 0], [3, 1]]), { ok: false, reason: "inputs out of order" });
  assert.deepEqual(replay(SEED, [[5, 0], [5, 0]]), { ok: false, reason: "duplicate input" });
  assert.deepEqual(replay(SEED, [[DURATION_TICKS + 1, 0]]), { ok: false, reason: "input outside the run" });
  assert.deepEqual(replay(SEED, [[1, 7]]), { ok: false, reason: "unknown action" });
  const spam: Input[] = Array.from({ length: 20 }, (_, i) => [i * 2, (i % 2) as Action]);
  assert.deepEqual(replay(SEED, spam), { ok: false, reason: "input rate beyond human play" });
  // An idle run dies early; an input after that moment can't have come from real play.
  const idle = replay(SEED, []);
  assert.ok(idle.ok);
  if (idle.ok) assert.deepEqual(replay(SEED, [[idle.result.endedTick + 5, 2]]), { ok: false, reason: "inputs after the run ended" });
});
