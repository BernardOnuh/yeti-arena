// Yeti Town's simulation: the Yeti on foot or on a snowmobile, traffic sleds that drive the road grid, penguins on the
// sidewalks, and three missions. Plain mutable state updated by step(dt); the renderer only reads it.
import { BLOCKS, T, TILE, WORLD, collide, makeWorld, roadCenter, tileAt, type Place, type World } from "./world";

export interface Keys { up: boolean; down: boolean; left: boolean; right: boolean; brake: boolean; action: boolean }
export interface Mobile { x: number; y: number; h: number; vx: number; vy: number; color: string; parked: boolean }
export interface Sled { x: number; y: number; dir: 0 | 1 | 2 | 3; speed: number; color: string; thief?: boolean; hits?: number; cool: number; push: { x: number; y: number } }
export interface Penguin { x: number; y: number; ax: number; ay: number; bx: number; by: number; t: number; speed: number }

export type MissionId = "cocoa" | "race" | "thief";
export interface MissionDef { id: MissionId; title: string; giver: string; blurb: string; time: number; reward: number; needsRide?: boolean }
export const MISSIONS: MissionDef[] = [
  { id: "cocoa", title: "Hot Cocoa Run", giver: "cocoa", blurb: "Deliver hot cocoa to three houses before it goes cold.", time: 100, reward: 300 },
  { id: "race", title: "Ring Race", giver: "ranger", blurb: "Ride through all 8 rings before the clock runs out.", time: 60, reward: 400, needsRide: true },
  { id: "thief", title: "Sled Thief", giver: "garage", blurb: "A thief took a sled! Catch them and bump their sled 3 times.", time: 70, reward: 500, needsRide: true },
];

export interface Active { id: MissionId; left: number; targets: { x: number; y: number }[]; index: number }
export interface Toast { text: string; tone: "good" | "bad" | "info"; until: number }

export interface Game {
  world: World; time: number;
  yeti: { x: number; y: number; face: number; walk: number };
  riding: Mobile | null; mobiles: Mobile[]; sleds: Sled[]; penguins: Penguin[];
  coins: number; done: Partial<Record<MissionId, number>>; active: Active | null; toast: Toast | null;
  prompt: string | null; shake: number; events: string[];
}

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const; // E S W N
const SLED_COLORS = ["#2f80ed", "#f2994a", "#9b51e0", "#27ae60", "#eb5757", "#56ccf2"];

function seeded(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export function newGame(): Game {
  const world = makeWorld(7), rnd = seeded(42);
  const start = world.places.plaza ?? { x: WORLD / 2, y: WORLD / 2 };
  const sleds: Sled[] = Array.from({ length: 14 }, (_, i) => {
    const horizontal = i % 2 === 0, road = 1 + Math.floor(rnd() * (BLOCKS - 1)), along = (1 + Math.floor(rnd() * (BLOCKS * 12 - 2))) * TILE;
    return { x: horizontal ? along : roadCenter(road), y: horizontal ? roadCenter(road) : along, dir: (horizontal ? (rnd() < 0.5 ? 0 : 2) : (rnd() < 0.5 ? 1 : 3)) as Sled["dir"], speed: 90 + rnd() * 50, color: SLED_COLORS[i % SLED_COLORS.length], cool: 0, push: { x: 0, y: 0 } };
  });
  const penguins: Penguin[] = [];
  for (let i = 0; i < 22; i++) {
    const vertical = rnd() < 0.5, line = (Math.floor(rnd() * BLOCKS) * 12 + (rnd() < 0.5 ? 2 : 11)) * TILE + TILE / 2;
    const a = (Math.floor(rnd() * BLOCKS) * 12 + 3) * TILE, b = a + 8 * TILE;
    penguins.push(vertical ? { x: line, y: a, ax: line, ay: a, bx: line, by: b, t: rnd(), speed: 0.05 + rnd() * 0.05 } : { x: a, y: line, ax: a, ay: line, bx: b, by: line, t: rnd(), speed: 0.05 + rnd() * 0.05 });
  }
  return {
    world, time: 0, yeti: { x: start.x, y: start.y + TILE * 2, face: -Math.PI / 2, walk: 0 },
    riding: null, mobiles: world.spawns.map((s, i) => ({ x: s.x, y: s.y, h: -Math.PI / 2, vx: 0, vy: 0, color: ["#e63946", "#2a9d8f", "#f4a261", "#457b9d"][i % 4], parked: true })),
    sleds, penguins, coins: 0, done: {}, active: null, toast: { text: "Welcome to Yeti Town! Find a mission marker ★", tone: "info", until: 4 }, prompt: null, shake: 0, events: [],
  };
}

const toast = (g: Game, text: string, tone: Toast["tone"] = "info", secs = 2.6) => { g.toast = { text, tone, until: g.time + secs }; };

function missionTargets(g: Game, id: MissionId): { x: number; y: number }[] {
  const w = g.world, rnd = seeded(Math.floor(g.time * 1000) + 3);
  if (id === "cocoa") {
    const picks: Place[] = []; const pool = [...w.doors];
    while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return picks;
  }
  if (id === "race") {
    // 8 rings around the outer loop of roads, a lap from the ranger station
    const a = roadCenter(1), b = roadCenter(BLOCKS - 1), m = (a + b) / 2;
    return [{ x: m, y: b }, { x: b, y: b }, { x: b, y: m }, { x: b, y: a }, { x: m, y: a }, { x: a, y: a }, { x: a, y: m }, { x: a, y: b }];
  }
  return [];
}

function startMission(g: Game, def: MissionDef) {
  if (def.needsRide && !g.riding) { toast(g, "Grab a snowmobile first (press E next to one)", "bad"); return; }
  g.active = { id: def.id, left: def.time, targets: missionTargets(g, def.id), index: 0 };
  if (def.id === "thief") {
    const p = g.riding ?? g.yeti;
    // the thief starts on the nearest road a few blocks away
    const road = Math.max(1, Math.min(BLOCKS - 1, Math.round((p.y / TILE - 1) / 12) + 2));
    g.sleds.push({ x: p.x, y: roadCenter(road > BLOCKS - 1 ? BLOCKS - 2 : road), dir: 0, speed: 175, color: "#111827", thief: true, hits: 0, cool: 0, push: { x: 0, y: 0 } });
  }
  toast(g, `${def.title}: ${def.blurb}`, "info", 3.5);
  g.events.push("start");
}

function endMission(g: Game, ok: boolean) {
  const a = g.active!; const def = MISSIONS.find(m => m.id === a.id)!;
  if (ok) {
    const bonus = Math.round(a.left * 4);
    g.coins += def.reward + bonus;
    g.done[a.id] = Math.max(g.done[a.id] ?? 0, def.reward + bonus);
    toast(g, `${def.title} complete! +${def.reward + bonus} coins`, "good", 3.2); g.events.push("win");
  } else { toast(g, `${def.title} failed: out of time`, "bad", 3); g.events.push("fail"); }
  g.sleds = g.sleds.filter(s => !s.thief);
  g.active = null;
}

export function step(g: Game, k: Keys, dt: number) {
  g.time += dt; g.prompt = null; g.shake = Math.max(0, g.shake - dt * 3);
  const w = g.world;
  let actionPressed = k.action; k.action = false;

  // next to a mission marker, E starts that mission (on foot or riding)
  const here = g.riding ?? g.yeti;
  const giver = g.active ? undefined : MISSIONS.find(def => { const p = w.places[def.giver]; return p && Math.hypot(p.x - here.x, p.y - here.y) < 46; });
  if (giver && actionPressed) { startMission(g, giver); actionPressed = false; }

  // ---------- the Yeti, or the snowmobile it rides ----------
  if (g.riding) {
    const m = g.riding, fx = Math.cos(m.h), fy = Math.sin(m.h);
    const fwd = m.vx * fx + m.vy * fy, lat = -m.vx * fy + m.vy * fx;
    const tile = tileAt(w, Math.floor(m.x / TILE), Math.floor(m.y / TILE));
    const ice = tile === T.Ice, rough = tile === T.Snow;
    const throttle = (k.up ? 1 : 0) - (k.down ? 1 : 0);
    let nf = fwd + throttle * (throttle > 0 ? 520 : fwd > 30 ? 700 : 300) * dt;
    nf *= 1 - (rough ? 1.3 : 0.55) * dt;
    nf = Math.max(-160, Math.min(rough ? 300 : 470, nf));
    const steer = ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 2.7 * Math.min(1, Math.abs(nf) / 140) * Math.sign(nf || 1);
    m.h += steer * dt;
    const grip = ice ? 1.1 : k.brake ? 1.8 : 9;
    const nl = lat * Math.max(0, 1 - grip * dt);
    if (k.brake) nf *= 1 - 1.6 * dt;
    const c = Math.cos(m.h), s = Math.sin(m.h);
    m.vx = nf * c - nl * s; m.vy = nf * s + nl * c;
    m.x += m.vx * dt; m.y += m.vy * dt;
    const hit = collide(w, m, 15);
    if (hit) {
      const vn = m.vx * hit.nx + m.vy * hit.ny;
      if (vn < 0) { m.vx -= 1.4 * vn * hit.nx; m.vy -= 1.4 * vn * hit.ny; if (vn < -160) { g.shake = 0.6; g.events.push("bump"); } }
    }
    g.yeti.x = m.x; g.yeti.y = m.y; g.yeti.face = m.h;
    if (actionPressed && Math.hypot(m.vx, m.vy) < 120) {
      m.parked = true; m.vx = m.vy = 0; g.riding = null;
      g.yeti.x = m.x + Math.cos(m.h + Math.PI / 2) * 30; g.yeti.y = m.y + Math.sin(m.h + Math.PI / 2) * 30; collide(w, g.yeti, 13);
      g.events.push("door");
    } else if (actionPressed) toast(g, "Slow down to hop off", "info", 1.4);
  } else {
    const ix = (k.right ? 1 : 0) - (k.left ? 1 : 0), iy = (k.down ? 1 : 0) - (k.up ? 1 : 0), len = Math.hypot(ix, iy);
    if (len) { g.yeti.x += (ix / len) * 175 * dt; g.yeti.y += (iy / len) * 175 * dt; g.yeti.face = Math.atan2(iy, ix); g.yeti.walk += dt * 10; }
    collide(w, g.yeti, 13);
    const near = g.mobiles.find(m => m.parked && Math.hypot(m.x - g.yeti.x, m.y - g.yeti.y) < 48);
    if (near) { g.prompt = "Press E to ride the snowmobile"; if (actionPressed) { near.parked = false; g.riding = near; g.events.push("engine"); return; } }
  }

  // ---------- missions: givers, then progress ----------
  const me = g.riding ?? g.yeti;
  if (!g.active) {
    if (giver) g.prompt = `Press E to start "${giver.title}" · ${giver.reward}+ coins`;
  } else {
    const a = g.active; a.left -= dt;
    const target = a.targets[a.index];
    if (target && Math.hypot(target.x - me.x, target.y - me.y) < (a.id === "race" ? 60 : 40)) {
      a.index++; g.events.push("ring");
      if (a.id === "cocoa") toast(g, a.index < a.targets.length ? `Delivered! ${a.targets.length - a.index} to go` : "All delivered!", "good", 1.6);
      if (a.index >= a.targets.length) return endMission(g, true);
    }
    if (a.id === "thief") {
      const thief = g.sleds.find(s => s.thief);
      if (thief && (thief.hits ?? 0) >= 3) { toast(g, "Thief caught!", "good"); return endMission(g, true); }
    }
    if (a.left <= 0) return endMission(g, false);
  }

  // ---------- traffic ----------
  for (const s of g.sleds) {
    const [dx, dy] = DIRS[s.dir];
    const lane = 14; // drive on the right
    let speed = s.speed;
    if (s.thief && g.active?.id === "thief") {
      const d = Math.hypot(s.x - me.x, s.y - me.y); speed = d < 260 ? 230 : 170;
    }
    // slow down behind the player
    const ahead = { x: s.x + dx * 50, y: s.y + dy * 50 };
    if (!s.thief && Math.hypot(ahead.x - me.x, ahead.y - me.y) < 40) speed *= 0.1;
    const before = { x: s.x, y: s.y };
    s.x += dx * speed * dt + s.push.x * dt; s.y += dy * speed * dt + s.push.y * dt;
    s.push.x *= 1 - 4 * dt; s.push.y *= 1 - 4 * dt;
    // at a junction centre, maybe turn
    const ix = Math.round((s.x / TILE - 1) / 12), iy = Math.round((s.y / TILE - 1) / 12);
    const jx = roadCenter(ix), jy = roadCenter(iy);
    const crossed = (dx && Math.sign(before.x - jx) !== Math.sign(s.x - jx)) || (dy && Math.sign(before.y - jy) !== Math.sign(s.y - jy));
    if (crossed && Math.abs((dx ? s.y : s.x) - (dx ? jy : jx)) < 30) {
      const options = ([0, 1, 2, 3] as const).filter(d => d !== (s.dir + 2) % 4 && (d === 0 ? ix < BLOCKS : d === 2 ? ix > 0 : d === 1 ? iy < BLOCKS : iy > 0));
      let pick = options[Math.floor(seeded(Math.floor(g.time * 100) + ix * 31 + iy * 17)() * options.length)];
      if (s.thief) { // flee: prefer the direction that increases distance from the player
        pick = options.reduce((best, d) => { const [ox, oy] = DIRS[d], [bx2, by2] = DIRS[best]; return Math.hypot(jx + ox * 200 - me.x, jy + oy * 200 - me.y) > Math.hypot(jx + bx2 * 200 - me.x, jy + by2 * 200 - me.y) ? d : best; }, options[0]);
      }
      s.dir = pick; s.x = jx; s.y = jy;
    }
    // stay in lane
    const [ndx, ndy] = DIRS[s.dir];
    const targetX = ndy !== 0 ? roadCenter(Math.round((s.x / TILE - 1) / 12)) - ndy * lane : s.x;
    const targetY = ndx !== 0 ? roadCenter(Math.round((s.y / TILE - 1) / 12)) + ndx * lane : s.y;
    s.x += (targetX - s.x) * Math.min(1, dt * 4); s.y += (targetY - s.y) * Math.min(1, dt * 4);
    s.x = Math.max(TILE, Math.min(WORLD - TILE, s.x)); s.y = Math.max(TILE, Math.min(WORLD - TILE, s.y));
    // bumps with the player's snowmobile (or the Yeti)
    s.cool = Math.max(0, s.cool - dt);
    const d = Math.hypot(s.x - me.x, s.y - me.y);
    if (d < 30 && s.cool === 0) {
      const nx = (s.x - me.x) / (d || 1), ny = (s.y - me.y) / (d || 1);
      s.push.x += nx * 220; s.push.y += ny * 220; s.cool = 0.8; g.shake = 0.5; g.events.push("bump");
      if (g.riding) { g.riding.vx -= nx * 160; g.riding.vy -= ny * 160; }
      if (s.thief) { s.hits = (s.hits ?? 0) + 1; toast(g, `Bump ${s.hits}/3!`, "good", 1.2); }
    }
  }

  // ---------- penguins ----------
  for (const p of g.penguins) {
    p.t += p.speed * dt; const k2 = (Math.sin(p.t * Math.PI * 2) + 1) / 2;
    p.x = p.ax + (p.bx - p.ax) * k2; p.y = p.ay + (p.by - p.ay) * k2;
    const d = Math.hypot(p.x - me.x, p.y - me.y);
    if (d < 26) { p.t += 0.15; if (g.riding) { g.events.push("honk"); } }
  }

  if (g.toast && g.time > g.toast.until) g.toast = null;
}

/** Where the player should head next, if anywhere. */
export function objective(g: Game): { x: number; y: number; label: string } | null {
  if (g.active) {
    if (g.active.id === "thief") { const t = g.sleds.find(s => s.thief); return t ? { x: t.x, y: t.y, label: "Thief" } : null; }
    const t = g.active.targets[g.active.index];
    return t ? { ...t, label: g.active.id === "race" ? `Ring ${g.active.index + 1}/8` : `Delivery ${g.active.index + 1}/3` } : null;
  }
  return null;
}
