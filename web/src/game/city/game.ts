// Sunburn City's simulation. A Yeti on vacation walks, borrows cars, jumps ramps and pulls comedy capers while the
// lifeguards chase it. Plain mutable state stepped at 60 Hz; the scene and the HUD only read it.
import { CITY, N, PITCH, collide, groundAt, inWater, makeWorld, onSand, roadC, type World } from "./world";

export interface Keys { up: boolean; down: boolean; left: boolean; right: boolean; brake: boolean; action: boolean; horn: boolean }
export type VKind = "buggy" | "truck" | "car" | "lifeguard";
export type Ai = "parked" | "traffic" | "lifeguard" | "player";
export interface Vehicle {
  id: number; kind: VKind; ai: Ai; color: string;
  x: number; z: number; y: number; vx: number; vz: number; vy: number; h: number; air: number;
  dir: 0 | 1 | 2 | 3; speed: number; stun: number; stuck: number; reverse: number; wheel: number;
}
export interface Ped { x: number; z: number; y: number; seg: number; t: number; way: 1 | -1; speed: number; shirt: string; down: number; fx: number; fz: number; fy: number; spin: number; h: number }

export type MissionId = "heist" | "coolers" | "getaway";
export interface MissionDef { id: MissionId; title: string; giver: string; blurb: string; time: number; reward: number }
export const MISSIONS: MissionDef[] = [
  { id: "heist", title: "Brain Freeze Heist", giver: "depot", blurb: "Swipe the ice cream truck and get it to the Cool Cave before it melts.", time: 90, reward: 900 },
  { id: "coolers", title: "Cooler Collector", giver: "tiki", blurb: "Tourists left 6 coolers around town. Grab them all before they warm up.", time: 100, reward: 700 },
  { id: "getaway", title: "Lifeguard Getaway", giver: "lifeguard", blurb: "You honked at the lifeguard tower. Now shake all three lifeguard jeeps.", time: 120, reward: 1100 },
];
export interface Active { id: MissionId; stage: number; left: number; targets: { x: number; z: number }[]; got: boolean[]; truck?: Vehicle }
export interface Card { title: string; sub: string; tone: "mission" | "good" | "bad"; until: number }

export interface Game {
  world: World; time: number;
  yeti: { x: number; z: number; h: number; walk: number };
  car: Vehicle | null; vehicles: Vehicle[]; peds: Ped[];
  coins: number; done: Partial<Record<MissionId, number>>;
  heat: number; heatCool: number; bust: number;
  active: Active | null; toast: { text: string; until: number } | null; card: Card | null; prompt: string | null;
  shake: number; events: string[]; nextId: number;
}

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const; // E S W N
const STATS: Record<VKind, { accel: number; max: number; grip: number; r: number }> = {
  buggy: { accel: 24, max: 31, grip: 7, r: 1.5 }, truck: { accel: 13, max: 21, grip: 6, r: 2.2 },
  car: { accel: 16, max: 25, grip: 7, r: 1.7 }, lifeguard: { accel: 21, max: 28.5, grip: 7, r: 1.7 },
};
const CAR_COLORS = ["#2f80ed", "#f2c94c", "#9b51e0", "#27ae60", "#f2994a", "#56ccf2", "#ffffff", "#eb5757"];
const SHIRTS = ["#ff6b6b", "#ffd93d", "#6bcBef", "#a66cff", "#4ade80", "#ff9f1c", "#f472b6"];
const junction = (v: number) => Math.max(0, Math.min(N, Math.round((v - roadC(0)) / PITCH)));

export function newGame(): Game {
  const world = makeWorld();
  // the Yeti starts on the boardwalk, with the ocean behind it
  const g: Game = {
    world, time: 0, yeti: { x: CITY + 9, z: 52, h: Math.PI, walk: 0 }, car: null, vehicles: [], peds: [],
    coins: 0, done: {}, heat: 0, heatCool: 0, bust: 0, active: null, toast: null, prompt: null, shake: 0, events: [], nextId: 1,
    card: { title: "Sunburn City", sub: "A Yeti on vacation. What could go wrong?", tone: "mission", until: 3.2 },
  };
  for (const p of world.parked) g.vehicles.push(vehicle(g, p.kind, "parked", p.x, p.z, p.h, p.kind === "truck" ? "#fff0f6" : "#ff7a59"));
  for (let i = 0; i < 18; i++) {
    const horizontal = i % 2 === 0, road = Math.floor(Math.random() * (N + 1)), along = roadC(Math.floor(Math.random() * N)) + PITCH / 2;
    const dir = (horizontal ? (Math.random() < 0.5 ? 0 : 2) : (Math.random() < 0.5 ? 1 : 3)) as Vehicle["dir"];
    const [dx, dz] = DIRS[dir];
    const v = vehicle(g, "car", "traffic", horizontal ? along : roadC(road) - dz * 3, horizontal ? roadC(road) + dx * 3 : along, Math.atan2(dz, dx), CAR_COLORS[i % CAR_COLORS.length]);
    v.dir = dir; v.speed = 9 + Math.random() * 4; g.vehicles.push(v);
  }
  const ways = world.walkways;
  for (let i = 0; i < 46; i++) g.peds.push({ x: 0, z: 0, y: 0, seg: Math.floor(Math.random() * ways.length), t: Math.random(), way: Math.random() < 0.5 ? 1 : -1, speed: 1.2 + Math.random() * 0.6, shirt: SHIRTS[i % SHIRTS.length], down: 0, fx: 0, fz: 0, fy: 0, spin: 0, h: 0 });
  return g;
}

function vehicle(g: Game, kind: VKind, ai: Ai, x: number, z: number, h: number, color: string): Vehicle {
  return { id: g.nextId++, kind, ai, color, x, z, y: 0, vx: 0, vz: 0, vy: 0, h, air: 0, dir: 0, speed: 0, stun: 0, stuck: 0, reverse: 0, wheel: 0 };
}
const toast = (g: Game, text: string, secs = 2.4) => { g.toast = { text, until: g.time + secs }; };
const card = (g: Game, title: string, sub: string, tone: Card["tone"], secs = 3) => { g.card = { title, sub, tone, until: g.time + secs }; };
export const speedOf = (v: Vehicle) => Math.hypot(v.vx, v.vz);
const me = (g: Game) => (g.car ? { x: g.car.x, z: g.car.z } : g.yeti);

/** Arcade driving: throttle and steering in [-1, 1]. Handles sand, water, ramps, air time and wall bounces. */
function drive(g: Game, v: Vehicle, throttle: number, steer: number, brake: boolean, dt: number) {
  const s = STATS[v.kind], c = Math.cos(v.h), sn = Math.sin(v.h);
  const fwd = v.vx * c + v.vz * sn, lat = -v.vx * sn + v.vz * c;
  const sand = onSand(v.x), water = inWater(v.x), airborne = v.air > 0;
  let nf = fwd;
  if (!airborne) {
    nf += throttle * (throttle > 0 ? s.accel : fwd > 1 ? 34 : s.accel * 0.6) * dt;
    nf *= 1 - (water ? 2.4 : sand ? 0.9 : 0.3) * dt;
    if (brake) nf *= 1 - 1.4 * dt;
    nf = Math.max(-11, Math.min(s.max * (water ? 0.35 : sand ? 0.8 : 1), nf));
    v.h += steer * 2.1 * Math.min(1, Math.abs(nf) / 7) * Math.sign(nf || 1) * dt;
  }
  const nl = airborne ? lat : lat * Math.max(0, 1 - (brake ? 1.3 : s.grip) * dt);
  const c2 = Math.cos(v.h), s2 = Math.sin(v.h);
  v.vx = nf * c2 - nl * s2; v.vz = nf * s2 + nl * c2;
  const px = v.x, pz = v.z;
  v.x += v.vx * dt; v.z += v.vz * dt; v.wheel += nf * dt * 1.6;
  // ramps: the ground rises under you; drive off the top and you fly
  const gy = groundAt(g.world, v.x, v.z);
  if (!airborne) {
    if (gy - v.y > 0.7) { v.x = px; v.z = pz; v.vx *= -0.3; v.vz *= -0.3; }   // the back or side of a ramp is a wall
    else if (gy >= v.y - 0.3) { v.vy = (gy - v.y) / dt; v.y = gy; }          // still on the ground (or the ramp)
    else { v.air = dt; v.y += v.vy * dt; }                                   // the ground dropped away: take off
  } else {
    v.air += dt; v.vy -= 24 * dt; v.y += v.vy * dt;
    if (v.y <= gy) {
      if (v.air > 0.55 && v.ai === "player") { const bonus = Math.round(v.air * 70); g.coins += bonus; toast(g, `Big air! ${v.air.toFixed(1)}s · +${bonus} coins`); g.events.push("stunt"); }
      if (v.ai === "player") g.shake = Math.max(g.shake, 0.4);
      v.y = gy; v.vy = 0; v.air = 0;
    }
  }
  const hit = collide(g.world, v, s.r);
  if (hit) {
    const vn = v.vx * hit.nx + v.vz * hit.nz;
    if (vn < 0) { v.vx -= 1.5 * vn * hit.nx; v.vz -= 1.5 * vn * hit.nz; if (vn < -9 && v.ai === "player") { g.shake = 0.7; g.events.push("crash"); } }
  }
  if (water && v.ai === "player" && Math.random() < dt * 3) g.events.push("splash");
}

function startMission(g: Game, def: MissionDef) {
  const a: Active = { id: def.id, stage: 0, left: def.time, targets: [], got: [] };
  if (def.id === "heist") {
    a.truck = g.vehicles.find(v => v.kind === "truck");
    if (g.car === a.truck) beginGetaway(g, a);
  } else if (def.id === "coolers") {
    a.targets = [...g.world.coolers].sort(() => Math.random() - 0.5).slice(0, 6); a.got = a.targets.map(() => false);
  } else { setHeat(g, 3); }
  g.active = a;
  card(g, def.title, def.blurb, "mission", 3.4); g.events.push("start");
}
function beginGetaway(g: Game, a: Active) { a.stage = 1; a.left = 90; setHeat(g, 2); toast(g, "The lifeguards saw that! Get to the Cool Cave!", 3); }

function endMission(g: Game, ok: boolean, why = "") {
  const a = g.active!, def = MISSIONS.find(m => m.id === a.id)!;
  if (ok) {
    const pay = def.reward + Math.round(a.left * 5);
    g.coins += pay; g.done[a.id] = Math.max(g.done[a.id] ?? 0, pay);
    card(g, "Caper complete!", `${def.title} · +${pay} coins`, "good", 3.4); g.events.push("win");
    setHeat(g, 0);
  } else { card(g, "Caper failed", why || `${def.title}: out of time`, "bad", 3.2); g.events.push("fail"); }
  g.active = null;
}

function setHeat(g: Game, level: number) {
  const before = g.heat; g.heat = Math.max(0, Math.min(3, level)); g.heatCool = 0;
  if (g.heat > before) g.events.push("whistle");
  // one lifeguard jeep per heat level; extras give up and drive off the map
  const guards = g.vehicles.filter(v => v.ai === "lifeguard");
  const p = me(g);
  for (let i = guards.length; i < g.heat; i++) {
    // spawn at a junction 70–120 m away
    let best: { x: number; z: number } | null = null;
    for (let t = 0; t < 30 && !best; t++) {
      const x = roadC(Math.floor(Math.random() * (N + 1))), z = roadC(Math.floor(Math.random() * (N + 1))), d = Math.hypot(x - p.x, z - p.z);
      if (d > 70 && d < 130) best = { x, z };
    }
    best ??= { x: roadC(0), z: roadC(0) };
    g.vehicles.push(vehicle(g, "lifeguard", "lifeguard", best.x, best.z, Math.atan2(p.z - best.z, p.x - best.x), "#ff4d3d"));
  }
  if (guards.length > g.heat) {
    const gone = guards.sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z)).slice(0, guards.length - g.heat);
    g.vehicles = g.vehicles.filter(v => !gone.includes(v));
  }
}

function busted(g: Game) {
  const fine = Math.min(g.coins, 150);
  g.coins -= fine; g.events.push("bust");
  if (g.active) { g.active = null; }
  if (g.car) { g.car.ai = "parked"; g.car.vx = g.car.vz = 0; g.car = null; }
  setHeat(g, 0); g.bust = 0;
  const cave = g.world.places.cave; g.yeti.x = cave.x; g.yeti.z = cave.z + 4;
  card(g, "Busted!", `The lifeguards gave you a 40-minute sunscreen lecture.${fine ? ` −${fine} coins` : ""}`, "bad", 3.6);
}

export function step(g: Game, k: Keys, dt: number) {
  g.time += dt; g.prompt = null; g.shake = Math.max(0, g.shake - dt * 2.5);
  const w = g.world;
  let act = k.action; k.action = false;
  const here = me(g);

  // ---------- E: start a caper, get in, get out ----------
  const giver = g.active ? undefined : MISSIONS.find(m => { const p = w.places[m.giver]; return Math.hypot(p.x - here.x, p.z - here.z) < 7; });
  if (giver) { g.prompt = `E · start "${giver.title}" (${giver.reward}+ coins)`; if (act) { startMission(g, giver); act = false; } }
  if (!g.car) {
    const near = g.vehicles.filter(v => v.ai !== "lifeguard").map(v => ({ v, d: Math.hypot(v.x - g.yeti.x, v.z - g.yeti.z) - STATS[v.kind].r })).filter(o => o.d < 2.6).sort((a, b) => a.d - b.d)[0]?.v;
    if (near && !g.prompt) g.prompt = near.ai === "traffic" ? "E · borrow this car (the owner will NOT be happy)" : `E · hop in the ${near.kind === "truck" ? "ice cream truck" : near.kind}`;
    if (near && act) {
      act = false;
      if (near.ai === "traffic") {
        const ped = g.peds[Math.floor(Math.random() * g.peds.length)];
        Object.assign(ped, { x: near.x, z: near.z + 2, down: 2.4, fx: (Math.random() - 0.5) * 6, fz: 5, fy: 5, spin: 8 });
        toast(g, "You borrowed a car. Its owner is NOT amused."); if (g.heat < 1) setHeat(g, 1);
      }
      near.ai = "player"; near.stun = 0; g.car = near; g.events.push("door");
      if (g.active?.id === "heist" && g.active.stage === 0 && near === g.active.truck) beginGetaway(g, g.active);
    }
  } else if (act) {
    if (speedOf(g.car) < 5 && g.car.air === 0) {
      const c = g.car; c.ai = "parked"; c.vx = c.vz = 0; g.car = null;
      g.yeti.x = c.x - Math.sin(c.h) * 3; g.yeti.z = c.z + Math.cos(c.h) * 3; g.yeti.h = c.h; collide(w, g.yeti, 0.6); g.events.push("door");
    } else toast(g, "Slow down to hop out", 1.2);
  }

  // ---------- the player ----------
  if (g.car) {
    drive(g, g.car, (k.up ? 1 : 0) - (k.down ? 1 : 0), (k.right ? 1 : 0) - (k.left ? 1 : 0), k.brake, dt);
    g.yeti.x = g.car.x; g.yeti.z = g.car.z; g.yeti.h = g.car.h;
  } else {
    const turn = (k.right ? 1 : 0) - (k.left ? 1 : 0), move = (k.up ? 1 : 0) - (k.down ? 0.6 : 0);
    g.yeti.h += turn * 3 * dt;
    const sp = (onSand(g.yeti.x) ? 5 : 6.5) * (inWater(g.yeti.x) ? 0.5 : 1);
    g.yeti.x += Math.cos(g.yeti.h) * move * sp * dt; g.yeti.z += Math.sin(g.yeti.h) * move * sp * dt;
    if (move) g.yeti.walk += dt * 9;
    collide(w, g.yeti, 0.7);
  }
  if (k.horn && g.car && Math.random() < dt * 4) g.events.push("horn");

  // ---------- the caper ----------
  const p = me(g);
  if (g.active) {
    const a = g.active; a.left -= dt;
    if (a.id === "heist") {
      if (a.stage === 0 && a.truck) a.targets = [{ x: a.truck.x, z: a.truck.z }];
      if (a.stage === 1) {
        a.targets = [w.places.cave];
        if (g.car !== a.truck && a.truck) { a.targets = [{ x: a.truck.x, z: a.truck.z }]; if (!g.prompt) g.prompt = "Get back in the ice cream truck!"; }
        else if (Math.hypot(w.places.cave.x - p.x, w.places.cave.z - p.z) < 9) return endMission(g, true);
      }
      if (a.left <= 0) return endMission(g, false, a.stage === 1 ? "The ice cream melted. Everywhere." : "The truck drove off without you.");
    } else if (a.id === "coolers") {
      a.targets.forEach((t, i) => {
        if (!a.got[i] && Math.hypot(t.x - p.x, t.z - p.z) < 3 + (g.car ? STATS[g.car.kind].r : 0.7)) { a.got[i] = true; g.events.push("coin"); toast(g, `Cooler grabbed! ${a.got.filter(x => !x).length} to go`, 1.4); }
      });
      if (a.got.every(Boolean)) return endMission(g, true);
      if (a.left <= 0) return endMission(g, false, "The coolers got warm. Nobody wants warm soda.");
    } else {
      if (g.heat === 0) return endMission(g, true);
      if (a.left <= 0) return endMission(g, false, "The lifeguards never gave up.");
    }
  }

  // ---------- lifeguards and heat ----------
  let seen = false;
  for (const v of g.vehicles) if (v.ai === "lifeguard") {
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    if (d < 55) seen = true;
    // steer toward where the player will be in half a second
    const tx = p.x + (g.car?.vx ?? 0) * 0.5, tz = p.z + (g.car?.vz ?? 0) * 0.5;
    let diff = Math.atan2(tz - v.z, tx - v.x) - v.h; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (v.reverse > 0) { v.reverse -= dt; drive(g, v, -1, -Math.sign(diff), false, dt); continue; }
    drive(g, v, d < 6 ? 0.3 : 1, Math.max(-1, Math.min(1, diff * 2)), Math.abs(diff) > 1.2 && d > 10, dt);
    v.stuck = speedOf(v) < 1.5 && d > 8 ? v.stuck + dt : 0;
    if (v.stuck > 1.2) { v.reverse = 1; v.stuck = 0; }
    if (Math.random() < dt * 0.25) g.events.push("whistle");
  }
  if (g.heat > 0) {
    g.heatCool = seen ? 0 : g.heatCool + dt;
    if (g.heatCool > 6) { setHeat(g, g.heat - 1); toast(g, g.heat ? "A lifeguard lost your trail" : "You shook the lifeguards!", 1.8); }
    const close = g.vehicles.some(v => v.ai === "lifeguard" && Math.hypot(v.x - p.x, v.z - p.z) < (g.car ? 5 : 3.2));
    const slow = g.car ? speedOf(g.car) < 2.5 : true;
    g.bust = close && slow ? g.bust + dt : Math.max(0, g.bust - dt);
    if (g.bust > (g.car ? 1.6 : 0.7)) return busted(g);
  }

  // ---------- traffic ----------
  for (const v of g.vehicles) if (v.ai === "traffic") {
    const [dx, dz] = DIRS[v.dir];
    let target = v.speed;
    if (v.stun > 0) { v.stun -= dt; target = 0; }
    // brake for the player and for whoever is ahead
    for (const o of [p, ...g.vehicles.filter(o => o !== v && o.ai !== "parked")]) {
      const ox = o.x - v.x, oz = o.z - v.z, ahead = ox * dx + oz * dz, side = Math.abs(-ox * dz + oz * dx);
      if (ahead > 0 && ahead < 10 && side < 2.6) { target = 0; break; }
    }
    const cur = Math.hypot(v.vx, v.vz);
    const ns = cur + Math.max(-30 * dt, Math.min(8 * dt, target - cur));
    const bx = v.x, bz = v.z;
    v.x += dx * ns * dt + (v.vx - dx * cur) * dt; v.z += dz * ns * dt + (v.vz - dz * cur) * dt;
    const knockX = (v.vx - dx * cur) * (1 - 4 * dt), knockZ = (v.vz - dz * cur) * (1 - 4 * dt);
    v.vx = dx * ns + knockX; v.vz = dz * ns + knockZ; v.wheel += ns * dt * 1.6;
    // turn at junctions
    const along = dx ? v.x : v.z, before = dx ? bx : bz, j = roadC(junction(along));
    if ((before - j) * (along - j) <= 0 && before !== along) {
      const ix = junction(v.x), iz = junction(v.z);
      const opts = ([0, 1, 2, 3] as const).filter(d => d !== (v.dir + 2) % 4 && (d === 0 ? ix < N : d === 2 ? ix > 0 : d === 1 ? iz < N : iz > 0));
      const nd = opts.length ? opts[Math.floor(Math.random() * opts.length)] : ((v.dir + 2) % 4) as Vehicle["dir"];
      if (nd !== v.dir) { v.dir = nd; const [ndx, ndz] = DIRS[nd]; v.x = roadC(ix) - ndz * 3; v.z = roadC(iz) + ndx * 3; v.vx = ndx * ns; v.vz = ndz * ns; }
    }
    // keep to the right-hand lane
    const [ldx, ldz] = DIRS[v.dir];
    if (ldx) v.z += (roadC(junction(v.z)) + ldx * 3 - v.z) * Math.min(1, dt * 3);
    else v.x += (roadC(junction(v.x)) - ldz * 3 - v.x) * Math.min(1, dt * 3);
    v.h += Math.atan2(Math.sin(Math.atan2(ldz, ldx) - v.h), Math.cos(Math.atan2(ldz, ldx) - v.h)) * Math.min(1, dt * 8);
  }

  // ---------- bumps between the player's car and others ----------
  if (g.car) {
    const c = g.car, rc = STATS[c.kind].r;
    for (const v of g.vehicles) {
      if (v === c) continue;
      const dx = v.x - c.x, dz = v.z - c.z, d = Math.hypot(dx, dz), m = rc + STATS[v.kind].r;
      if (d < m && d > 0) {
        const nx = dx / d, nz = dz / d, rel = (c.vx - v.vx) * nx + (c.vz - v.vz) * nz;
        c.x -= nx * (m - d) / 2; c.z -= nz * (m - d) / 2; v.x += nx * (m - d) / 2; v.z += nz * (m - d) / 2;
        if (rel > 0) {
          c.vx -= nx * rel * 0.7; c.vz -= nz * rel * 0.7; v.vx += nx * rel * 0.8; v.vz += nz * rel * 0.8;
          if (v.ai === "traffic") v.stun = 1.5;
          if (rel > 6) { g.shake = 0.5; g.events.push("crash"); if (v.ai === "lifeguard" && g.heat < 3) setHeat(g, g.heat + 1); }
        }
      }
    }
  }

  // ---------- tourists ----------
  for (const t of g.peds) {
    if (t.down > 0) {
      t.down -= dt; t.x += t.fx * dt; t.z += t.fz * dt; t.fy -= 18 * dt; t.y = Math.max(0, t.y + t.fy * dt);
      t.fx *= 1 - 2 * dt; t.fz *= 1 - 2 * dt; t.spin *= 1 - 2.5 * dt;
      if (t.down <= 0) { t.y = 0; t.fy = 0; }
      continue;
    }
    const seg = w.walkways[t.seg], len = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
    t.t += (t.way * t.speed * dt) / len;
    if (t.t > 1 || t.t < 0) { t.t = Math.max(0, Math.min(1, t.t)); if (Math.random() < 0.5) t.way = -t.way as 1 | -1; else { const end = t.t === 1 ? seg.b : seg.a; const next = w.walkways.findIndex((s, i) => i !== t.seg && Math.hypot(s.a[0] - end[0], s.a[1] - end[1]) < 0.5); if (next >= 0) { t.seg = next; t.t = 0; t.way = 1; } else t.way = -t.way as 1 | -1; } }
    t.x = seg.a[0] + (seg.b[0] - seg.a[0]) * t.t; t.z = seg.a[1] + (seg.b[1] - seg.a[1]) * t.t;
    t.h = Math.atan2((seg.b[1] - seg.a[1]) * t.way, (seg.b[0] - seg.a[0]) * t.way);
    for (const v of g.vehicles) {
      const s = Math.hypot(v.vx, v.vz);
      if (s > 5 && Math.hypot(v.x - t.x, v.z - t.z) < STATS[v.kind].r + 0.6) {
        Object.assign(t, { down: 2.6, fx: v.vx * 0.5, fz: v.vz * 0.5, fy: 4 + s * 0.2, spin: 10 });
        if (v.ai === "player") { g.events.push("boing"); if (s > 12 && g.heat < 1) setHeat(g, 1); }
        break;
      }
    }
  }
  if (g.toast && g.time > g.toast.until) g.toast = null;
  if (g.card && g.time > g.card.until) g.card = null;
}

/** Where to head next, for the arrow, the beam and the minimap. */
export function objectives(g: Game): { x: number; z: number; label: string }[] {
  const a = g.active;
  if (!a) return [];
  if (a.id === "coolers") return a.targets.filter((_, i) => !a.got[i]).map(t => ({ ...t, label: "Cooler" }));
  if (a.id === "heist") return a.targets.map(t => ({ ...t, label: a.stage === 0 || g.car !== a.truck ? "Ice cream truck" : "Cool Cave" }));
  return [];
}
export const STATS_R = (k: VKind) => STATS[k].r;
export { CITY };
