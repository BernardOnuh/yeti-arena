// Sunburn City's layout, in metres on the XZ plane (x east, z south): a grid of streets and blocks, a beach and the
// ocean on the east side, palms, stunt ramps on the sand, and the places the capers use. Pure data, no three.js.

export const BLOCK = 40, ROAD = 12, N = 5, PITCH = BLOCK + ROAD;
export const CITY = N * PITCH + ROAD;          // 272: the last road is the boardwalk
export const SAND_END = CITY + 58;             // the shoreline
export const BOUNDS = { x0: -24, z0: -24, x1: SAND_END + 16, z1: CITY + 24 };
export const roadC = (i: number) => i * PITCH + ROAD / 2;

export interface Box { x0: number; z0: number; x1: number; z1: number }
export interface Building extends Box { h: number; color: string; roof: string; kind?: string; sign?: string }
export interface Circle { x: number; z: number; r: number }
export interface Place { id: string; label: string; x: number; z: number; spawn?: { x: number; z: number; h: number } }
export interface Ramp extends Box { h: number }   // rises along +z from z0 to z1

export interface World {
  buildings: Building[]; palms: Circle[]; solids: Circle[]; ramps: Ramp[]; places: Record<string, Place>;
  coolers: { x: number; z: number }[]; parked: { x: number; z: number; h: number; kind: "buggy" | "truck" }[]; walkways: { a: [number, number]; b: [number, number] }[];
}

function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39 >>> 0) / 4294967296); }

const PASTEL = ["#ff9f8a", "#ffd18a", "#9fe3c6", "#8fd0ff", "#d7b7ff", "#ffb3d1", "#f6f1e4", "#b8e0a8", "#ffc4a3"];
const ROOF = ["#e8e2d4", "#d7d0c0", "#c9d6dc"];

export function makeWorld(seed = 11): World {
  const r = rng(seed);
  const buildings: Building[] = [], palms: Circle[] = [], solids: Circle[] = [], places: Record<string, Place> = {}, walkways: World["walkways"] = [];
  const special: Record<string, string> = { "0,0": "cave", "4,0": "depot", "4,4": "lifeguard", "2,2": "plaza", "1,3": "park", "3,1": "park" };

  for (let bz = 0; bz < N; bz++) for (let bx = 0; bx < N; bx++) {
    const x0 = ROAD + bx * PITCH, z0 = ROAD + bz * PITCH, x1 = x0 + BLOCK, z1 = z0 + BLOCK, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const kind = special[`${bx},${bz}`] ?? "lots";
    // sidewalk loop around every block, for pedestrians
    walkways.push({ a: [x0 + 1.5, z0 + 1.5], b: [x1 - 1.5, z0 + 1.5] }, { a: [x1 - 1.5, z0 + 1.5], b: [x1 - 1.5, z1 - 1.5] }, { a: [x1 - 1.5, z1 - 1.5], b: [x0 + 1.5, z1 - 1.5] }, { a: [x0 + 1.5, z1 - 1.5], b: [x0 + 1.5, z0 + 1.5] });
    if (kind === "plaza" || kind === "park") {
      if (kind === "plaza") { solids.push({ x: cx, z: cz, r: 4.5 }); places.plaza = { id: "plaza", label: "Fountain Plaza", x: cx, z: cz + 9 }; }
      for (let i = 0; i < (kind === "park" ? 14 : 8); i++) {
        const a = (i / (kind === "park" ? 14 : 8)) * Math.PI * 2 + r() * 0.3, d = kind === "park" ? 8 + r() * 10 : 13;
        palms.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: 0.5 });
      }
      continue;
    }
    const lots: Box[] = kind !== "lots" ? [{ x0: x0 + 5, z0: z0 + 5, x1: x1 - 5, z1: z1 - 9 }]
      : r() < 0.35 ? [{ x0: x0 + 4, z0: z0 + 4, x1: x1 - 4, z1: z1 - 4 }]
      : r() < 0.6 ? [{ x0: x0 + 4, z0: z0 + 4, x1: cx - 1.5, z1: z1 - 4 }, { x0: cx + 1.5, z0: z0 + 4, x1: x1 - 4, z1: z1 - 4 }]
      : [{ x0: x0 + 4, z0: z0 + 4, x1: cx - 1.5, z1: cz - 1.5 }, { x0: cx + 1.5, z0: z0 + 4, x1: x1 - 4, z1: cz - 1.5 }, { x0: x0 + 4, z0: cz + 1.5, x1: cx - 1.5, z1: z1 - 4 }, { x0: cx + 1.5, z0: cz + 1.5, x1: x1 - 4, z1: z1 - 4 }];
    for (const l of lots) {
      const tall = kind === "lots" ? 8 + Math.floor(r() * 5) * 6 + (bx === 2 || bz === 2 ? 12 : 0) : 10;
      const b: Building = { ...l, h: tall, color: PASTEL[Math.floor(r() * PASTEL.length)], roof: ROOF[Math.floor(r() * ROOF.length)] };
      if (kind === "cave") Object.assign(b, { color: "#bfe9ff", roof: "#ffffff", kind, sign: "COOL CAVE" });
      if (kind === "depot") Object.assign(b, { color: "#ffc6dc", roof: "#fff4f8", kind, sign: "SCOOPS DEPOT" });
      if (kind === "lifeguard") Object.assign(b, { color: "#ff6b5a", roof: "#ffe28a", kind, sign: "LIFEGUARD HQ" });
      buildings.push(b);
    }
    if (kind !== "lots") {
      // the front is the south side, facing the street
      const label = kind === "cave" ? "Cool Cave (your hideout)" : kind === "depot" ? "Scoops Depot" : "Lifeguard HQ";
      places[kind] = { id: kind, label, x: cx, z: z1 - 3, spawn: { x: cx + 9, z: z1 - 5.5, h: 0 } };
    }
    // a few palms on the sidewalk corners
    if (r() < 0.7) for (const [px, pz] of [[x0 + 1.8, z0 + 1.8], [x1 - 1.8, z1 - 1.8]]) palms.push({ x: px, z: pz, r: 0.5 });
  }
  // the boardwalk and the beach
  for (let z = 4; z < CITY; z += 13) palms.push({ x: CITY + 3, z, r: 0.5 });
  places.tiki = { id: "tiki", label: "Tiki Shack", x: CITY + 20, z: 22 };
  solids.push({ x: CITY + 20, z: 16, r: 3.2 });
  const ramps: Ramp[] = [60, 150, 232].map(z => ({ x0: CITY + 30, x1: CITY + 36, z0: z, z1: z + 9, h: 2.6 }));
  // coolers for "Cooler Collector": on the sand and along the streets
  const coolers = [[CITY + 44, 40], [CITY + 22, 110], [CITY + 46, 190], [CITY + 18, 258], [roadC(3), 100], [roadC(1), 200], [150, roadC(4)], [60, roadC(1)]].map(([x, z]) => ({ x, z }));
  // beach palms, clear of the coolers, the ramps' run-ups and the tiki shack
  for (let i = 0; i < 10; i++) {
    const p = { x: CITY + 14 + r() * 26, z: 10 + r() * (CITY - 20), r: 0.5 };
    const clear = coolers.every(c => Math.hypot(c.x - p.x, c.z - p.z) > 8) && ramps.every(rp => p.x < rp.x0 - 4 || p.x > rp.x1 + 4) && Math.hypot(p.x - (CITY + 20), p.z - 16) > 8;
    if (clear) palms.push(p);
  }
  for (const p of palms) solids.push(p);

  const parked: World["parked"] = [
    { ...places.cave.spawn!, kind: "buggy" }, { x: CITY + 12, z: 40, h: Math.PI / 2, kind: "buggy" }, { x: places.plaza.x + 12, z: places.plaza.z + 10, h: 0, kind: "buggy" },
    { x: places.lifeguard.spawn!.x - 20, z: places.lifeguard.spawn!.z, h: 0, kind: "buggy" }, { ...places.depot.spawn!, kind: "truck" },
  ];
  return { buildings, palms, solids, ramps, places, coolers, parked, walkways };
}

/** Pushes a circle out of buildings, solid circles and the edges of the map. Returns the push normal if it hit. */
export function collide(w: World, p: { x: number; z: number }, radius: number): { nx: number; nz: number } | null {
  let hit: { nx: number; nz: number } | null = null;
  for (const b of w.buildings) {
    if (p.x < b.x0 - radius || p.x > b.x1 + radius || p.z < b.z0 - radius || p.z > b.z1 + radius) continue;
    const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
    let dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d === 0) { // inside: push out the nearest side
      const opts = [[p.x - b.x0, -1, 0], [b.x1 - p.x, 1, 0], [p.z - b.z0, 0, -1], [b.z1 - p.z, 0, 1]].sort((a, b2) => a[0] - b2[0])[0];
      dx = opts[1]; dz = opts[2]; d = 0; p.x += dx * (opts[0] + radius); p.z += dz * (opts[0] + radius); hit = { nx: dx, nz: dz }; continue;
    }
    if (d < radius) { p.x += (dx / d) * (radius - d); p.z += (dz / d) * (radius - d); hit = { nx: dx / d, nz: dz / d }; }
  }
  for (const c of w.solids) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = radius + c.r;
    if (d < m && d > 0) { p.x += (dx / d) * (m - d); p.z += (dz / d) * (m - d); hit = { nx: dx / d, nz: dz / d }; }
  }
  const B = BOUNDS;
  if (p.x < B.x0 + radius) { p.x = B.x0 + radius; hit = { nx: 1, nz: 0 }; }
  if (p.x > B.x1 - radius) { p.x = B.x1 - radius; hit = { nx: -1, nz: 0 }; }
  if (p.z < B.z0 + radius) { p.z = B.z0 + radius; hit = { nx: 0, nz: 1 }; }
  if (p.z > B.z1 - radius) { p.z = B.z1 - radius; hit = { nx: 0, nz: -1 }; }
  return hit;
}

/** Ground height for vehicles: 0 except on the ramps. */
export function groundAt(w: World, x: number, z: number) {
  for (const r of w.ramps) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return ((z - r.z0) / (r.z1 - r.z0)) * r.h;
  return 0;
}
export const inWater = (x: number) => x > SAND_END;
export const onSand = (x: number) => x > CITY && x <= SAND_END;
