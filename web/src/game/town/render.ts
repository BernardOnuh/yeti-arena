// Draws Yeti Town from above: snow, roads with lane marks, ice, plazas, buildings with roofs and shadows, trees,
// traffic sleds, penguins, snowmobiles, the Yeti, mission markers, the objective arrow and the minimap.
import { MISSIONS, objective, type Game, type Mobile, type Sled } from "./game";
import { SIZE, T, TILE, WORLD, isRoadIndex } from "./world";

export interface View { cx: number; cy: number; zoom: number }

let minimap: HTMLCanvasElement | null = null;
function buildMinimap(g: Game) {
  const c = document.createElement("canvas"); c.width = SIZE; c.height = SIZE;
  const x = c.getContext("2d")!;
  const colors: Record<number, string> = { [T.Snow]: "#dfe9f5", [T.Road]: "#5b6b82", [T.Walk]: "#b8c6d8", [T.Wall]: "#8a9bb3", [T.Tree]: "#3f7a5a", [T.Ice]: "#9fe3f5", [T.Plaza]: "#e9e2d0" };
  for (let ty = 0; ty < SIZE; ty++) for (let tx = 0; tx < SIZE; tx++) { x.fillStyle = colors[g.world.tiles[ty * SIZE + tx]]; x.fillRect(tx, ty, 1, 1); }
  return c;
}

export function render(ctx: CanvasRenderingContext2D, g: Game, view: View, W: number, H: number) {
  const { zoom } = view;
  const shake = g.shake > 0 ? (Math.random() - 0.5) * g.shake * 8 : 0;
  ctx.save();
  ctx.fillStyle = "#e7eef7"; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2 + shake, H / 2 + shake); ctx.scale(zoom, zoom); ctx.translate(-view.cx, -view.cy);
  const x0 = view.cx - W / 2 / zoom - TILE, x1 = view.cx + W / 2 / zoom + TILE, y0 = view.cy - H / 2 / zoom - TILE, y1 = view.cy + H / 2 / zoom + TILE;
  const tx0 = Math.max(0, Math.floor(x0 / TILE)), tx1 = Math.min(SIZE - 1, Math.floor(x1 / TILE)), ty0 = Math.max(0, Math.floor(y0 / TILE)), ty1 = Math.min(SIZE - 1, Math.floor(y1 / TILE));

  // ground
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const t = g.world.tiles[ty * SIZE + tx], X = tx * TILE, Y = ty * TILE;
    if (t === T.Road) { ctx.fillStyle = "#56657b"; ctx.fillRect(X, Y, TILE + 0.6, TILE + 0.6); }
    else if (t === T.Walk) { ctx.fillStyle = "#c9d5e4"; ctx.fillRect(X, Y, TILE + 0.6, TILE + 0.6); ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.strokeRect(X + 0.5, Y + 0.5, TILE - 1, TILE - 1); }
    else if (t === T.Ice) { ctx.fillStyle = "#a9e6f7"; ctx.fillRect(X, Y, TILE + 0.6, TILE + 0.6); ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(X + ((tx * 7 + ty * 3) % 20), Y + 6, 14, 2); }
    else if (t === T.Plaza) { ctx.fillStyle = (tx + ty) % 2 ? "#efe7d6" : "#e6dcc6"; ctx.fillRect(X, Y, TILE + 0.6, TILE + 0.6); }
    else { ctx.fillStyle = (tx * 13 + ty * 7) % 9 === 0 ? "#edf3fa" : "#e7eef7"; ctx.fillRect(X, Y, TILE + 0.6, TILE + 0.6); }
  }
  // lane marks: dashed centre lines along each road
  ctx.strokeStyle = "rgba(255,240,180,.75)"; ctx.lineWidth = 2; ctx.setLineDash([14, 14]);
  for (let i = 0; i < SIZE; i++) if (isRoadIndex(i) && i % 12 === 1) {
    const c = i * TILE;
    if (c > x0 && c < x1) { ctx.beginPath(); ctx.moveTo(c, Math.max(0, y0)); ctx.lineTo(c, Math.min(WORLD, y1)); ctx.stroke(); }
    if (c > y0 && c < y1) { ctx.beginPath(); ctx.moveTo(Math.max(0, x0), c); ctx.lineTo(Math.min(WORLD, x1), c); ctx.stroke(); }
  }
  ctx.setLineDash([]);

  // mission markers and objectives (on the ground, under everything)
  const pulse = (Math.sin(g.time * 4) + 1) / 2;
  if (!g.active) for (const def of MISSIONS) {
    const p = g.world.places[def.giver]; if (!p) continue;
    const doneBefore = g.done[def.id] !== undefined;
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = doneBefore ? "rgba(148,163,184,.25)" : `rgba(250,204,21,${0.22 + pulse * 0.18})`; ctx.beginPath(); ctx.arc(0, 0, 30 + pulse * 6, 0, 7); ctx.fill();
    ctx.strokeStyle = doneBefore ? "#94a3b8" : "#facc15"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.stroke();
    ctx.fillStyle = doneBefore ? "#64748b" : "#a16207"; ctx.font = "bold 20px Fredoka, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("★", 0, 1);
    ctx.restore();
  }
  if (g.active) {
    g.active.targets.forEach((t, i) => {
      if (i < g.active!.index) return;
      const cur = i === g.active!.index;
      ctx.save(); ctx.translate(t.x, t.y);
      if (g.active!.id === "race") {
        ctx.strokeStyle = cur ? "#22d3ee" : "rgba(34,211,238,.35)"; ctx.lineWidth = cur ? 8 : 4; ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = cur ? 18 : 0;
        ctx.beginPath(); ctx.arc(0, 0, 40 + (cur ? pulse * 6 : 0), 0, 7); ctx.stroke();
        ctx.shadowBlur = 0; ctx.fillStyle = "#0e7490"; ctx.font = "bold 16px Fredoka, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), 0, 1);
      } else if (cur) {
        ctx.fillStyle = `rgba(34,197,94,${0.25 + pulse * 0.2})`; ctx.beginPath(); ctx.arc(0, 0, 28 + pulse * 5, 0, 7); ctx.fill();
        ctx.strokeStyle = "#16a34a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.stroke();
        ctx.font = "18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("☕", 0, 1);
      }
      ctx.restore();
    });
  }

  // trees' and buildings' shadows, then the bodies
  ctx.fillStyle = "rgba(30,41,59,.16)";
  for (const b of g.world.buildings) if (b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0) ctx.fillRect(b.x + b.height, b.y + b.height, b.w, b.h);
  for (const t of g.world.trees) if (t.x > x0 && t.x < x1 && t.y > y0 && t.y < y1) { ctx.beginPath(); ctx.ellipse(t.x + 8, t.y + 9, t.r, t.r * 0.8, 0, 0, 7); ctx.fill(); }

  // penguins and parked snowmobiles
  for (const p of g.penguins) if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) drawPenguin(ctx, p.x, p.y, g.time + p.t * 10);
  for (const m of g.mobiles) if (m !== g.riding && m.x > x0 && m.x < x1 && m.y > y0 && m.y < y1) drawMobile(ctx, m, false);
  for (const s of g.sleds) if (s.x > x0 - 40 && s.x < x1 + 40 && s.y > y0 - 40 && s.y < y1 + 40) drawSled(ctx, s, g.time);

  // the Yeti (riding or walking)
  if (g.riding) drawMobile(ctx, g.riding, true);
  drawYeti(ctx, g.yeti.x, g.yeti.y, g.yeti.face, g.riding ? 0 : g.yeti.walk, !!g.riding);

  // buildings on top (roofs), with labels
  for (const b of g.world.buildings) {
    if (!(b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0)) continue;
    ctx.fillStyle = b.roof; roundRect(ctx, b.x, b.y, b.w, b.h, 6); ctx.fill();
    ctx.fillStyle = b.color; roundRect(ctx, b.x + 6, b.y + 6, b.w - 12, b.h - 12, 4); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.85)"; roundRect(ctx, b.x + 10, b.y + 8, b.w - 20, Math.min(26, b.h * 0.3), 6); ctx.fill(); // snow on the roof
    if (b.label) {
      ctx.fillStyle = "#1e293b"; ctx.font = "bold 18px Fredoka, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 8);
    }
  }
  for (const t of g.world.trees) if (t.x > x0 && t.x < x1 && t.y > y0 && t.y < y1) {
    ctx.fillStyle = "#2f6b4c"; ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 7); ctx.fill();
    ctx.fillStyle = "#3f8a63"; ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.7, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.arc(t.x - 4, t.y - 5, t.r * 0.35, 0, 7); ctx.fill();
  }
  ctx.restore();

  // objective arrow at the screen edge
  const o = objective(g);
  if (o) {
    const sx = (o.x - view.cx) * zoom + W / 2, sy = (o.y - view.cy) * zoom + H / 2;
    const inside = sx > 40 && sx < W - 40 && sy > 40 && sy < H - 40;
    if (!inside) {
      const ang = Math.atan2(sy - H / 2, sx - W / 2), r = Math.min(W, H) / 2 - 46;
      const ax = W / 2 + Math.cos(ang) * r, ay = H / 2 + Math.sin(ang) * r;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
      ctx.fillStyle = g.active?.id === "thief" ? "#ef4444" : "#16a34a"; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-4, 0); ctx.lineTo(-10, 12); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // minimap
  if (!minimap) minimap = buildMinimap(g);
  const mm = Math.min(170, W * 0.28), mx = W - mm - 14, my = H - mm - 14, k = mm / WORLD;
  ctx.save();
  ctx.fillStyle = "rgba(15,23,42,.55)"; roundRect(ctx, mx - 5, my - 5, mm + 10, mm + 10, 12); ctx.fill();
  ctx.beginPath(); roundRect(ctx, mx, my, mm, mm, 8); ctx.clip();
  ctx.imageSmoothingEnabled = false; ctx.drawImage(minimap, mx, my, mm, mm);
  const dot = (x: number, y: number, c: string, r = 3) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(mx + x * k, my + y * k, r, 0, 7); ctx.fill(); };
  if (!g.active) for (const def of MISSIONS) { const p = g.world.places[def.giver]; if (p) dot(p.x, p.y, g.done[def.id] !== undefined ? "#94a3b8" : "#facc15", 4); }
  if (o) dot(o.x, o.y, g.active?.id === "thief" ? "#ef4444" : "#16a34a", 4.5);
  dot(g.yeti.x, g.yeti.y, "#ffffff", 4); dot(g.yeti.x, g.yeti.y, "#2563eb", 2.5);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function drawYeti(ctx: CanvasRenderingContext2D, x: number, y: number, face: number, walk: number, riding: boolean) {
  ctx.save(); ctx.translate(x, y);
  if (riding) { ctx.translate(Math.cos(face) * -7, Math.sin(face) * -7); ctx.scale(0.72, 0.72); }
  if (!riding) { ctx.fillStyle = "rgba(30,41,59,.18)"; ctx.beginPath(); ctx.ellipse(4, 6, 15, 12, 0, 0, 7); ctx.fill(); }
  ctx.rotate(face + Math.PI / 2);
  const swing = Math.sin(walk) * 5;
  ctx.fillStyle = "#f8fafc"; ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(-12, swing, 5, 7, 0, 0, 7); ctx.fill(); ctx.stroke();        // arms
  ctx.beginPath(); ctx.ellipse(12, -swing, 5, 7, 0, 0, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill(); ctx.stroke();                         // body
  ctx.fillStyle = "#7dd3fc"; ctx.beginPath(); ctx.ellipse(0, -6, 7, 5, 0, 0, 7); ctx.fill();  // face
  ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.arc(-2.5, -7, 1.3, 0, 7); ctx.arc(2.5, -7, 1.3, 0, 7); ctx.fill();
  ctx.restore();
}

function drawMobile(ctx: CanvasRenderingContext2D, m: Mobile, active: boolean) {
  ctx.save(); ctx.translate(m.x, m.y);
  ctx.fillStyle = "rgba(30,41,59,.2)"; ctx.beginPath(); ctx.ellipse(5, 6, 22, 13, m.h, 0, 7); ctx.fill();
  ctx.rotate(m.h);
  ctx.fillStyle = "#334155"; ctx.fillRect(-22, -16, 42, 4); ctx.fillRect(-22, 12, 42, 4);  // skis
  ctx.fillStyle = m.color; ctx.beginPath(); ctx.roundRect(-22, -12, 44, 24, 8); ctx.fill();
  ctx.fillStyle = "rgba(186,230,253,.9)"; ctx.beginPath(); ctx.roundRect(10, -9, 9, 18, 3); ctx.fill(); // windshield
  ctx.fillStyle = "#0f172a"; ctx.fillRect(-14, -6, 12, 12);                                // seat
  if (active && Math.hypot(m.vx, m.vy) > 200) { ctx.fillStyle = "rgba(255,255,255,.7)"; for (let i = 0; i < 3; i++) ctx.fillRect(-30 - i * 7, -10 + i * 8, 5, 3); }
  ctx.restore();
}

function drawSled(ctx: CanvasRenderingContext2D, s: Sled, t: number) {
  const ang = [0, Math.PI / 2, Math.PI, -Math.PI / 2][s.dir];
  ctx.save(); ctx.translate(s.x, s.y);
  ctx.fillStyle = "rgba(30,41,59,.2)"; ctx.beginPath(); ctx.ellipse(5, 6, 24, 14, ang, 0, 7); ctx.fill();
  ctx.rotate(ang);
  ctx.fillStyle = s.color; ctx.beginPath(); ctx.roundRect(-22, -12, 44, 24, 8); ctx.fill();
  ctx.fillStyle = "rgba(186,230,253,.85)"; ctx.beginPath(); ctx.roundRect(6, -9, 10, 18, 3); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(-16, -9, 18, 4);
  if (s.thief) {
    ctx.fillStyle = Math.floor(t * 6) % 2 ? "#ef4444" : "#3b82f6"; ctx.beginPath(); ctx.arc(-4, 0, 5, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawPenguin(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const bob = Math.sin(t * 6) * 1.2;
  ctx.fillStyle = "rgba(30,41,59,.18)"; ctx.beginPath(); ctx.ellipse(x + 2, y + 4, 7, 5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#111827"; ctx.beginPath(); ctx.arc(x, y + bob, 7, 0, 7); ctx.fill();
  ctx.fillStyle = "#f8fafc"; ctx.beginPath(); ctx.arc(x, y + 1 + bob, 4.2, 0, 7); ctx.fill();
  ctx.fillStyle = "#f59e0b"; ctx.beginPath(); ctx.arc(x, y - 4 + bob, 1.8, 0, 7); ctx.fill();
}
