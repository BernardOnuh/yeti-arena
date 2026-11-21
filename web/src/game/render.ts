// Draws an Ice Dash state onto a canvas: a snowy three-lane slope in pseudo-3D, crevasses, snowflakes and the
// yeti. Purely visual; nothing here affects the simulation or the score.
import { DURATION_TICKS, JUMP_TICKS, LANES, TICK_HZ, type State } from "./sim";

const D = 1100; // perspective depth constant

export type View = { w: number; h: number; laneX: number; t: number; flash: number; particles: Particle[] };
export type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

const mountains = Array.from({ length: 3 }, (_, layer) =>
  Array.from({ length: 9 }, (_, i) => ({ x: i / 8, y: 0.35 + ((i * 7919 + layer * 104729) % 100) / 400 + layer * 0.06 })));
const stars = Array.from({ length: 60 }, (_, i) => ({ x: ((i * 9301 + 49297) % 233280) / 233280, y: ((i * 4793 + 1237) % 1000) / 1000 * 0.3, r: (i % 3) * 0.4 + 0.5 }));

export function draw(ctx: CanvasRenderingContext2D, s: State, v: View) {
  const { w, h } = v;
  const horizon = h * 0.34;
  const baseY = h * 0.86;
  const laneW = Math.min(w * 0.27, 210);
  const proj = (z: number) => D / (z + D);
  const sy = (z: number) => horizon + (baseY - horizon) * proj(z);
  const sx = (lane: number, z: number) => w / 2 + (lane - (LANES - 1) / 2) * laneW * proj(z);

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#0b1033");
  sky.addColorStop(0.6, "#28306b");
  sky.addColorStop(1, "#6d5fb0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon + 2);
  for (const st of stars) {
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(v.t / 700 + st.x * 40);
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Aurora
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let k = 0; k < 2; k++) {
    const g = ctx.createLinearGradient(0, h * 0.05, 0, h * 0.25);
    g.addColorStop(0, "rgba(94,234,212,0)");
    g.addColorStop(0.5, k ? "rgba(167,139,250,0.22)" : "rgba(94,234,212,0.22)");
    g.addColorStop(1, "rgba(94,234,212,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.2);
    for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * (0.12 + k * 0.04) + Math.sin(x / 90 + v.t / 1600 + k * 2) * h * 0.04);
    ctx.lineTo(w, h * 0.26); ctx.lineTo(0, h * 0.26); ctx.fill();
  }
  ctx.restore();
  // Mountains (parallax by distance)
  const cols = ["#3b3f86", "#4f56a6", "#c9d6f5"];
  mountains.forEach((m, layer) => {
    const off = ((s.distance / (900 - layer * 250)) % w);
    ctx.fillStyle = cols[layer];
    for (const shift of [-off, w - off]) {
      ctx.beginPath();
      ctx.moveTo(shift, horizon + 2);
      m.forEach((p, i) => ctx.lineTo(shift + p.x * w, horizon - (1 - p.y) * h * (0.32 - layer * 0.07) * (i % 2 ? 0.6 : 1)));
      ctx.lineTo(shift + w, horizon + 2);
      ctx.fill();
    }
  });

  // Snow field
  const snow = ctx.createLinearGradient(0, horizon, 0, h);
  snow.addColorStop(0, "#dbe7ff");
  snow.addColorStop(1, "#f7fbff");
  ctx.fillStyle = snow;
  ctx.fillRect(0, horizon, w, h - horizon);
  // Track edges and lane lines
  const far = 9000;
  ctx.fillStyle = "rgba(125,160,230,0.18)";
  ctx.beginPath();
  ctx.moveTo(sx(-0.5, far), sy(far)); ctx.lineTo(sx(2.5, far), sy(far)); ctx.lineTo(sx(2.5, -300), sy(-300)); ctx.lineTo(sx(-0.5, -300), sy(-300));
  ctx.fill();
  ctx.strokeStyle = "rgba(90,120,200,0.35)";
  for (const edge of [0.5, 1.5]) {
    for (let z = -((s.distance) % 500); z < far; z += 500) {
      const z2 = z + 220;
      ctx.lineWidth = 3 * proj(z);
      ctx.beginPath(); ctx.moveTo(sx(edge, z), sy(z)); ctx.lineTo(sx(edge, z2), sy(z2)); ctx.stroke();
    }
  }
  // Side pines
  for (let z = 400 - (s.distance % 800); z < far; z += 800) {
    for (const side of [-1.35, 3.35]) {
      const p = proj(z), x = sx(side, z), y = sy(z), size = 120 * p;
      ctx.fillStyle = "#2b4a6f";
      ctx.beginPath(); ctx.moveTo(x, y - size * 1.6); ctx.lineTo(x - size * 0.5, y); ctx.lineTo(x + size * 0.5, y); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.moveTo(x, y - size * 1.6); ctx.lineTo(x - size * 0.22, y - size * 0.95); ctx.lineTo(x + size * 0.22, y - size * 0.95); ctx.fill();
    }
  }

  // Rows, far to near
  const rows = [...s.rows].filter(r => r.z > -250 && r.z < far).sort((a, b) => b.z - a.z);
  for (const row of rows) {
    const z = row.z, p = proj(z), depth = 160;
    for (let l = 0; l < LANES; l++) {
      if (!row.crevasse[l]) continue;
      const pf = proj(z + depth);
      const x0 = sx(l - 0.46, z), x1 = sx(l + 0.46, z), x2 = sx(l + 0.46, z + depth), x3 = sx(l - 0.46, z + depth);
      const y0 = sy(z), y1 = sy(z + depth);
      const g = ctx.createLinearGradient(0, y1, 0, y0);
      g.addColorStop(0, "#0e2a5c"); g.addColorStop(1, "#07122b");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x2, y1); ctx.lineTo(x3, y1); ctx.fill();
      ctx.strokeStyle = "#9fd8ff"; ctx.lineWidth = Math.max(1, 3 * pf);
      ctx.stroke();
      // icicle teeth on the near lip
      ctx.fillStyle = "#e6f6ff";
      const teeth = 5;
      for (let i = 0; i < teeth; i++) {
        const tx = x0 + ((x1 - x0) * (i + 0.5)) / teeth;
        ctx.beginPath(); ctx.moveTo(tx - 6 * p, y0); ctx.lineTo(tx + 6 * p, y0); ctx.lineTo(tx, y0 - 14 * p); ctx.fill();
      }
    }
    if (row.flake >= 0 && !row.taken) drawFlake(ctx, sx(row.flake, z), sy(z) - 46 * p, 22 * p, v.t);
  }

  // Yeti
  const airborne = s.tick < s.jumpUntil;
  const jt = airborne ? (s.jumpUntil - s.tick) / JUMP_TICKS : 0;
  const lift = airborne ? Math.sin(jt * Math.PI) * h * 0.13 : 0;
  const invuln = s.tick < s.invulnUntil;
  const blink = invuln && Math.floor(v.t / 90) % 2 === 0;
  // shadow
  ctx.fillStyle = "rgba(40,60,120,0.25)";
  ctx.beginPath(); ctx.ellipse(v.laneX, baseY + 6, 46 - lift * 0.15, 11, 0, 0, Math.PI * 2); ctx.fill();
  if (!blink) drawYeti(ctx, v.laneX, baseY - lift, Math.min(1.1, laneW / 190), s.tick, airborne, s.over && s.lives <= 0);

  // Particles
  for (const pt of v.particles) {
    ctx.globalAlpha = Math.max(0, pt.life);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Falling snow
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  for (let i = 0; i < 70; i++) {
    const x = ((i * 137.5 + v.t * (0.02 + (i % 5) * 0.006)) % (w + 40)) - 20;
    const y = ((i * 89.3 + v.t * (0.05 + (i % 7) * 0.01)) % (h + 40)) - 20;
    ctx.beginPath(); ctx.arc(x, y, (i % 3) * 0.7 + 0.8, 0, Math.PI * 2); ctx.fill();
  }
  // Hit flash
  if (v.flash > 0) { ctx.fillStyle = `rgba(239,68,68,${v.flash * 0.35})`; ctx.fillRect(0, 0, w, h); }
}

function drawFlake(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  ctx.save();
  ctx.translate(x, y + Math.sin(t / 250 + x) * r * 0.25);
  ctx.rotate(t / 900);
  ctx.shadowColor = "#7dd3fc"; ctx.shadowBlur = r;
  ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = Math.max(1.5, r / 6); ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r);
    ctx.moveTo(0, -r * 0.55); ctx.lineTo(-r * 0.25, -r * 0.8); ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.25, -r * 0.8);
    ctx.stroke();
  }
  ctx.restore();
}

/** An original chunky yeti: shaggy white body, pale-blue face, two little horns. */
export function drawYeti(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, tick: number, airborne: boolean, down = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  if (down) ctx.rotate(0.35);
  const run = airborne ? 0 : Math.sin(tick / 4);
  // legs
  ctx.fillStyle = "#e9eef8";
  ctx.beginPath(); ctx.ellipse(-16, -8 + run * 4, 13, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(16, -8 - run * 4, 13, 16, 0, 0, Math.PI * 2); ctx.fill();
  // body: shaggy blob
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#b9c8e6"; ctx.lineWidth = 2.5;
  ctx.beginPath();
  const tufts = 14;
  for (let i = 0; i <= tufts; i++) {
    const a = (i / tufts) * Math.PI * 2;
    const r = 44 + (i % 2 ? 5 : 0);
    const px = Math.cos(a) * r * 0.92, py = -58 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // arms
  const swing = airborne ? -0.9 : run * 0.5;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 38, -66);
    ctx.rotate(side * (0.5 + (side > 0 ? swing : -swing)));
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.ellipse(0, 18, 10, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // horns
  ctx.fillStyle = "#cdb48a";
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(side * 18, -96); ctx.quadraticCurveTo(side * 34, -118, side * 30, -126); ctx.quadraticCurveTo(side * 26, -108, side * 10, -100); ctx.fill();
  }
  // face
  ctx.fillStyle = "#a8d8f0";
  ctx.beginPath(); ctx.ellipse(0, -66, 24, 20, 0, 0, Math.PI * 2); ctx.fill();
  // eyes
  ctx.fillStyle = "#14213d";
  if (down) {
    ctx.strokeStyle = "#14213d"; ctx.lineWidth = 2.5;
    for (const ex of [-9, 9]) { ctx.beginPath(); ctx.moveTo(ex - 4, -74); ctx.lineTo(ex + 4, -66); ctx.moveTo(ex + 4, -74); ctx.lineTo(ex - 4, -66); ctx.stroke(); }
  } else {
    for (const ex of [-9, 9]) { ctx.beginPath(); ctx.ellipse(ex, -70, 3.6, 4.6, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "#fff";
    for (const ex of [-8, 10]) { ctx.beginPath(); ctx.arc(ex, -72, 1.3, 0, Math.PI * 2); ctx.fill(); }
  }
  // mouth
  ctx.strokeStyle = "#14213d"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
  ctx.beginPath();
  if (airborne) ctx.ellipse(0, -57, 4, 5, 0, 0, Math.PI * 2);
  else ctx.arc(0, -60, 6, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  // cheeks
  ctx.fillStyle = "rgba(244,114,182,0.45)";
  for (const cx of [-16, 16]) { ctx.beginPath(); ctx.ellipse(cx, -60, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

export const secondsLeft = (tick: number) => Math.max(0, Math.ceil((DURATION_TICKS - tick) / TICK_HZ));
