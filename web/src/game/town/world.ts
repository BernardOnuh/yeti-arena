// Yeti Town's map: a seeded grid of roads, sidewalks, building lots, a park and a frozen lake, plus the places missions
// use. World units are pixels at zoom 1; one tile is TILE pixels.

export const TILE = 40;
export const BLOCK = 12;          // tiles from one road to the next
export const BLOCKS = 6;          // blocks per side
export const SIZE = BLOCK * BLOCKS + 2; // tiles per side (a road on every edge)
export const WORLD = SIZE * TILE;

export const enum T { Snow = 0, Road = 1, Walk = 2, Wall = 3, Tree = 4, Ice = 5, Plaza = 6 }
export const SOLID = (t: number) => t === T.Wall || t === T.Tree;

export interface Building { x: number; y: number; w: number; h: number; color: string; roof: string; height: number; label?: string }
export interface Place { id: string; label: string; x: number; y: number }

function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39 >>> 0) / 4294967296); }

const PALETTE = [
  ["#e8735a", "#b9503b"], ["#5aa9e8", "#3b7cb9"], ["#e8c25a", "#b9923b"], ["#8fd0a0", "#5f9f72"],
  ["#c79be8", "#9a6cbd"], ["#f0a6c0", "#c2738f"], ["#9bb3c9", "#6c8299"],
];

export interface World { tiles: Uint8Array; buildings: Building[]; places: Record<string, Place>; doors: Place[]; spawns: { x: number; y: number }[]; trees: { x: number; y: number; r: number }[] }

export const isRoadIndex = (i: number) => i % BLOCK === 0 || i % BLOCK === 1;
export const tileAt = (w: World, tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE ? T.Wall : w.tiles[ty * SIZE + tx]);

export function makeWorld(seed = 7): World {
  const r = rng(seed);
  const tiles = new Uint8Array(SIZE * SIZE);
  const set = (x: number, y: number, t: T) => { if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) tiles[y * SIZE + x] = t; };
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const road = isRoadIndex(x) || isRoadIndex(y);
    const walk = !road && (isRoadIndex(x - 1) || isRoadIndex(x + 1) || isRoadIndex(y - 1) || isRoadIndex(y + 1));
    tiles[y * SIZE + x] = road ? T.Road : walk ? T.Walk : T.Snow;
  }
  const buildings: Building[] = [], doors: Place[] = [], trees: World["trees"] = [], spawns: World["spawns"] = [];
  const places: Record<string, Place> = {};
  // Block (bx, by) has its interior from tile bx*BLOCK+3 to bx*BLOCK+BLOCK (10 tiles inside the sidewalks).
  const inner = (bx: number, by: number) => ({ x0: bx * BLOCK + 3, y0: by * BLOCK + 3, x1: bx * BLOCK + BLOCK - 1, y1: by * BLOCK + BLOCK - 1 });
  const special: Record<string, string> = { "2,2": "lake", "4,1": "park", "1,4": "park", "0,0": "cocoa", "4,4": "ranger", "2,4": "garage", "3,2": "plaza" };

  for (let by = 0; by < BLOCKS; by++) for (let bx = 0; bx < BLOCKS; bx++) {
    const b = inner(bx, by), kind = special[`${bx},${by}`] ?? "lots";
    const cx = ((b.x0 + b.x1 + 1) / 2) * TILE, cy = ((b.y0 + b.y1 + 1) / 2) * TILE;
    if (kind === "lake") {
      for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
        const d = Math.hypot(x + 0.5 - (b.x0 + b.x1) / 2, (y + 0.5 - (b.y0 + b.y1) / 2) * 1.15);
        if (d < 4.6) set(x, y, T.Ice);
      }
      places.lake = { id: "lake", label: "Frozen Lake", x: cx, y: cy };
    } else if (kind === "park" || kind === "plaza") {
      for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
        if (kind === "plaza") { set(x, y, T.Plaza); continue; }
        if (r() < 0.16 && (x + y) % 2 === 0) { set(x, y, T.Tree); trees.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, r: 14 + r() * 6 }); }
      }
      if (kind === "plaza") places.plaza = { id: "plaza", label: "Town Square", x: cx, y: cy };
    } else {
      // Two to four lots, each a building set back from the sidewalk with a door facing the nearest road.
      const lots = kind === "lots" ? (r() < 0.5 ? 2 : 4) : 1;
      const rects = lots === 1 ? [[b.x0 + 1, b.y0 + 1, b.x1 - 1, b.y1 - 1]]
        : lots === 2 ? (r() < 0.5 ? [[b.x0, b.y0, b.x1, b.y0 + 4], [b.x0, b.y0 + 5, b.x1, b.y1]] : [[b.x0, b.y0, b.x0 + 4, b.y1], [b.x0 + 5, b.y0, b.x1, b.y1]])
        : [[b.x0, b.y0, b.x0 + 4, b.y0 + 4], [b.x0 + 5, b.y0, b.x1, b.y0 + 4], [b.x0, b.y0 + 5, b.x0 + 4, b.y1], [b.x0 + 5, b.y0 + 5, b.x1, b.y1]];
      for (const [x0, y0, x1, y1] of rects) {
        const gx0 = x0 + 0, gy0 = y0 + 0, gx1 = x1 - 0, gy1 = y1 - 0;
        for (let y = gy0; y < gy1; y++) for (let x = gx0; x < gx1; x++) set(x, y, T.Wall);
        const [color, roof] = PALETTE[Math.floor(r() * PALETTE.length)];
        const label = kind === "cocoa" ? "Cocoa Shop" : kind === "ranger" ? "Ranger Station" : kind === "garage" ? "Sled Garage" : undefined;
        buildings.push({ x: gx0 * TILE, y: gy0 * TILE, w: (gx1 - gx0) * TILE, h: (gy1 - gy0) * TILE, color: label ? "#f4f1ea" : color, roof: label ? (kind === "cocoa" ? "#8a4b2a" : kind === "ranger" ? "#3f7a4f" : "#c0392b") : roof, height: 10 + Math.floor(r() * 16), label });
        // a door on the side nearest a road
        const midX = ((gx0 + gx1) / 2) * TILE, midY = ((gy0 + gy1) / 2) * TILE;
        const toTop = gy0 - (by * BLOCK + 2), toBottom = (by * BLOCK + BLOCK) - gy1, toLeft = gx0 - (bx * BLOCK + 2), toRight = (bx * BLOCK + BLOCK) - gx1;
        const m = Math.min(toTop, toBottom, toLeft, toRight);
        const door = m === toTop ? { x: midX, y: gy0 * TILE - TILE * 0.6 } : m === toBottom ? { x: midX, y: gy1 * TILE + TILE * 0.6 } : m === toLeft ? { x: gx0 * TILE - TILE * 0.6, y: midY } : { x: gx1 * TILE + TILE * 0.6, y: midY };
        if (label) places[kind] = { id: kind, label, ...door };
        else doors.push({ id: `door-${doors.length}`, label: `House ${doors.length + 1}`, ...door });
      }
    }
  }
  // snowmobiles parked on sidewalks around town, one by each mission place
  for (const k of ["cocoa", "ranger", "garage", "plaza"]) if (places[k]) spawns.push({ x: places[k].x + TILE * 1.2, y: places[k].y });
  for (let i = 0; i < 6; i++) {
    const bx = Math.floor(r() * BLOCKS), by = Math.floor(r() * BLOCKS);
    spawns.push({ x: (bx * BLOCK + 2.5) * TILE, y: (by * BLOCK + 6) * TILE });
  }
  return { tiles, buildings, places, doors, spawns, trees };
}

/** Pushes a circle out of solid tiles. Returns the push normal if it hit something. */
export function collide(w: World, p: { x: number; y: number }, radius: number): { nx: number; ny: number } | null {
  let hit: { nx: number; ny: number } | null = null;
  const tx0 = Math.floor((p.x - radius) / TILE), tx1 = Math.floor((p.x + radius) / TILE);
  const ty0 = Math.floor((p.y - radius) / TILE), ty1 = Math.floor((p.y + radius) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!SOLID(tileAt(w, tx, ty))) continue;
    const cx = Math.max(tx * TILE, Math.min(p.x, (tx + 1) * TILE)), cy = Math.max(ty * TILE, Math.min(p.y, (ty + 1) * TILE));
    const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
    if (d < radius) {
      const nx = d > 0.0001 ? dx / d : 0, ny = d > 0.0001 ? dy / d : -1;
      p.x += nx * (radius - d); p.y += ny * (radius - d);
      hit = { nx, ny };
    }
  }
  p.x = Math.max(radius, Math.min(WORLD - radius, p.x)); p.y = Math.max(radius, Math.min(WORLD - radius, p.y));
  return hit;
}

/** The centre line of road number i (in tiles → pixels). Roads run along tiles i*BLOCK and i*BLOCK+1. */
export const roadCenter = (i: number) => (i * BLOCK + 1) * TILE;
