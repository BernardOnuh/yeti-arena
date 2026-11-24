// Sunburn City's characters, built for an animated-feature look: a fluffy shell-rendered Yeti with expressive eyes,
// brows and a smile, and chunky cartoon people with faces, hair and hats. All original designs; all models face +X.
import * as THREE from "three";

// ---------- fur ----------
let furNoise: THREE.DataTexture | null = null;
function noiseTexture() {
  if (furNoise) return furNoise;
  const S = 128, d = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { const v = Math.pow(Math.random(), 0.7) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  furNoise = new THREE.DataTexture(d, S, S); furNoise.magFilter = THREE.LinearFilter; furNoise.wrapS = furNoise.wrapT = THREE.RepeatWrapping; furNoise.needsUpdate = true;
  return furNoise;
}
/** One shell of fur: shell 0 is the opaque skin, higher shells are pushed out along the normal and thinned by noise. */
function furShell(color: string, tip: string, h: number, len: number, density: [number, number]) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, { furH: { value: h }, furLen: { value: len }, furTex: { value: noiseTexture() }, furDensity: { value: new THREE.Vector2(...density) }, furTip: { value: new THREE.Color(tip) } });
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float furH; uniform float furLen; varying vec2 vFurUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normal * furLen * furH; transformed.y -= furLen * furH * furH * 0.5; vFurUv = uv;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float furH; uniform sampler2D furTex; uniform vec2 furDensity; uniform vec3 furTip; varying vec2 vFurUv;")
      .replace("#include <map_fragment>", "#include <map_fragment>\nfloat strand = texture2D(furTex, vFurUv * furDensity).r;\nif (furH > 0.0 && strand < furH * 0.95) discard;\ndiffuseColor.rgb = mix(diffuseColor.rgb, furTip, furH * 0.7) * (0.62 + 0.38 * furH);");
  };
  m.customProgramCacheKey = () => "fur-shell";
  return m;
}
function furry(geo: THREE.BufferGeometry, color: string, tip: string, len: number, density: [number, number], shells = 14) {
  const g = new THREE.Group();
  for (let i = 0; i <= shells; i++) {
    const m = new THREE.Mesh(geo, furShell(color, tip, i / shells, len, density));
    m.castShadow = i === 0; m.receiveShadow = i === 0; g.add(m);
  }
  return g;
}
const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
function part(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; return o;
}
function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** A cartoon eye: white, iris, pupil, two highlights, and an eyelid that can blink. */
function eye(iris: string, lid: string, size: number) {
  const g = new THREE.Group();
  const white = part(new THREE.SphereGeometry(size, 20, 16), std("#ffffff", { roughness: 0.25 }), 0, 0, 0, false); white.scale.set(0.7, 1.12, 1); g.add(white);
  g.add(part(new THREE.SphereGeometry(size * 0.62, 18, 14), std(iris, { roughness: 0.3 }), size * 0.42, 0, 0, false));
  g.add(part(new THREE.SphereGeometry(size * 0.36, 14, 12), std("#0b0d14", { roughness: 0.15 }), size * 0.62, 0, 0, false));
  const glint = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  g.add(part(new THREE.SphereGeometry(size * 0.15, 8, 6), glint, size * 0.84, size * 0.3, -size * 0.18, false));
  g.add(part(new THREE.SphereGeometry(size * 0.07, 6, 5), glint, size * 0.82, -size * 0.22, size * 0.2, false));
  return { g, blink(amount: number) { g.scale.y = 1 - 0.92 * amount; } };
}

// ---------- the Yeti ----------
export function makeYeti() {
  const root = new THREE.Group(), FUR = "#f2f5fb", TIP = "#ffffff", SKIN = "#78c4ee", DARK = "#1d3557";
  const body = new THREE.Group(); root.add(body);
  // a pear-shaped body: wide at the hips, narrower at the shoulders
  const bodyGeo = new THREE.SphereGeometry(1, 40, 30); bodyGeo.scale(0.92, 1.05, 1);
  { const p = bodyGeo.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 + (y < 0 ? -y * 0.18 : -y * 0.1); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } bodyGeo.computeVertexNormals(); }
  const torso = furry(bodyGeo, FUR, TIP, 0.13, [22, 13]); torso.position.y = 1.3; body.add(torso);
  // Hawaiian shirt, worn open over the belly
  const shirtTex = canvasTexture(256, 128, c => {
    c.fillStyle = "#ff7a59"; c.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 26; i++) {
      const x = (i * 53) % 256, y = (i * 37) % 128;
      c.fillStyle = "#2a9d6b"; c.beginPath(); c.ellipse(x + 6, y + 5, 9, 4, 0.6, 0, 7); c.fill();
      c.fillStyle = i % 3 ? "#fff4c2" : "#ffd23f"; for (let p = 0; p < 5; p++) { c.beginPath(); c.arc(x + Math.cos(p * 1.26) * 5, y + Math.sin(p * 1.26) * 5, 4, 0, 7); c.fill(); }
      c.fillStyle = "#ff3d6e"; c.beginPath(); c.arc(x, y, 2.5, 0, 7); c.fill();
    }
  });
  shirtTex.wrapS = THREE.RepeatWrapping; shirtTex.repeat.set(2, 1);
  const shirt = part(new THREE.CylinderGeometry(1.0, 1.13, 0.85, 40, 1, true, 0.55, Math.PI * 2 - 1.1), std("#ffffff", { map: shirtTex, side: THREE.DoubleSide, roughness: 0.75 }), 0, 1.5, 0);
  shirt.rotation.y = Math.PI / 2; body.add(shirt);
  const belly = part(new THREE.SphereGeometry(0.7, 24, 18), std("#e6eef8", { roughness: 0.95 }), 0.62, 1.15, 0); belly.scale.set(0.45, 0.85, 0.9); body.add(belly);

  // head
  const head = new THREE.Group(); head.position.set(0.08, 2.45, 0); body.add(head);
  const headGeo = new THREE.SphereGeometry(0.72, 36, 28); headGeo.scale(1, 0.95, 1.05);
  head.add(furry(headGeo, FUR, TIP, 0.11, [18, 10]));
  const face = part(new THREE.SphereGeometry(0.56, 32, 24), std(SKIN, { roughness: 0.55, emissive: "#4a90b8", emissiveIntensity: 0.45 }), 0.52, -0.08, 0, false); face.scale.set(0.6, 0.88, 1.05); head.add(face);
  const eyes = [-1, 1].map(s => { const e = eye("#f2a33a", SKIN, 0.155); e.g.position.set(0.79, 0.1, s * 0.2); e.g.rotation.y = -s * 0.22; head.add(e.g); return e; });
  const brows = [-1, 1].map(s => { const b = part(new THREE.CapsuleGeometry(0.035, 0.16, 4, 8), std(DARK), 0.81, 0.33, s * 0.21, false); b.rotation.x = Math.PI / 2; head.add(b); return b; });
  head.add(part(new THREE.SphereGeometry(0.085, 16, 12), std(DARK, { roughness: 0.3 }), 0.9, -0.07, 0, false)); // nose
  const smile = part(new THREE.TorusGeometry(0.15, 0.028, 8, 24, Math.PI), std("#173052"), 0.86, -0.2, 0, false);
  smile.rotation.set(0, Math.PI / 2, Math.PI); head.add(smile);
  for (const s of [-1, 1]) head.add(part(new THREE.SphereGeometry(0.06, 10, 8), std("#ff9bb5", { roughness: 0.9 }), 0.8, -0.1, s * 0.32, false)); // rosy cheeks
  for (const s of [-1, 1]) { const horn = part(new THREE.ConeGeometry(0.13, 0.46, 16), std("#f3d49b", { roughness: 0.45 }), 0, 0.72, s * 0.38); horn.rotation.x = s * -0.5; head.add(horn); }
  const ears = [-1, 1].map(s => { const e = furry(new THREE.SphereGeometry(0.17, 16, 12), FUR, TIP, 0.06, [10, 6], 8); e.position.set(-0.05, 0.25, s * 0.7); head.add(e); return e; });
  // limbs: fluffy arms with blue mitten paws, stubby legs with blue soles
  const limbGeo = new THREE.CapsuleGeometry(0.25, 0.62, 6, 16);
  const arms = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(0, 1.95, s * 0.95);
    const arm = furry(limbGeo, FUR, TIP, 0.09, [8, 9], 10); arm.position.y = -0.42; pivot.add(arm);
    const paw = part(new THREE.SphereGeometry(0.22, 18, 14), std(SKIN, { roughness: 0.55 }), 0.05, -0.92, 0); paw.scale.set(1, 0.85, 0.9); pivot.add(paw);
    body.add(pivot); return pivot;
  });
  const legs = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(0, 0.62, s * 0.42);
    const leg = furry(new THREE.CapsuleGeometry(0.3, 0.32, 6, 16), FUR, TIP, 0.09, [8, 6], 10); leg.position.y = -0.26; pivot.add(leg);
    const sole = part(new THREE.SphereGeometry(0.3, 18, 10), std(SKIN), 0.12, -0.56, 0); sole.scale.set(1.25, 0.32, 0.95); pivot.add(sole);
    root.add(pivot); return pivot;
  });

  let blinkAt = 2, mood = 0;
  return {
    root,
    /** mode: walk (with a walk phase), sit (driving), wave (title screen); t is real time in seconds. */
    pose(t: number, walk: number, mode: "walk" | "sit" | "wave", moving: boolean) {
      const sw = moving ? Math.sin(walk) : 0, breathe = Math.sin(t * 2.2) * 0.015;
      // squash and stretch on every step
      const bounce = moving ? Math.abs(Math.cos(walk)) : 0;
      body.scale.set(1 + bounce * 0.04 - breathe, 1 - bounce * 0.05 + breathe * 2, 1 + bounce * 0.04 - breathe);
      body.position.y = moving ? bounce * 0.12 : 0;
      body.rotation.x = moving ? sw * 0.06 : Math.sin(t * 1.3) * 0.02;
      head.rotation.z = moving ? -0.05 + Math.cos(walk * 2) * 0.03 : Math.sin(t * 0.9) * 0.05;
      head.rotation.x = moving ? sw * 0.05 : Math.sin(t * 0.7) * 0.06;
      if (mode === "sit") {
        arms[0].rotation.set(0, 0, 1.15); arms[1].rotation.set(0, 0, 1.15); legs[0].rotation.z = legs[1].rotation.z = 1.45;
      } else if (mode === "wave") {
        arms[0].rotation.set(0, 0, Math.sin(t * 1.5) * 0.08);
        arms[1].rotation.set(-2.5, 0, 0.2 + Math.sin(t * 9) * 0.35);
        legs[0].rotation.z = legs[1].rotation.z = 0;
      } else {
        arms[0].rotation.set(-0.12, 0, sw * 0.8); arms[1].rotation.set(0.12, 0, -sw * 0.8);
        legs[0].rotation.z = -sw * 0.7; legs[1].rotation.z = sw * 0.7;
      }
      ears.forEach((e, i) => { e.rotation.x = Math.sin(t * 3 + i * 2) * 0.12; });
      // blink every few seconds, with the odd double blink
      if (t > blinkAt + 0.16) blinkAt = t + 2.2 + Math.random() * 2.8;
      const b = t > blinkAt ? Math.sin(((t - blinkAt) / 0.16) * Math.PI) : 0;
      eyes.forEach(e => e.blink(b));
      mood += ((mode === "wave" ? 1 : moving ? 0.4 : 0) - mood) * 0.05;
      brows.forEach((br, i) => { br.position.y = 0.33 + mood * 0.06; br.rotation.y = (i ? -1 : 1) * (0.15 - mood * 0.25); });
      smile.scale.set(1, 1 + mood * 0.25, 1 + mood * 0.35);
    },
  };
}

// ---------- people ----------
const SKINS = ["#f6d2b8", "#e8b48f", "#c68863", "#8d5a3b", "#5e3a24"];
const HAIR = ["#2b1d14", "#6b3e1f", "#e3b04b", "#b03a2e", "#1a1a1a", "#d9d9d9"];
const SHIRTS = ["#ff6b6b", "#ffd93d", "#4cc9f0", "#a66cff", "#4ade80", "#ff9f1c", "#f472b6", "#ffffff"];
const SHORTS = ["#2b4c7e", "#f1e3c6", "#3a3a3a", "#e76f51", "#6c757d"];

export type Role = "tourist" | "lifeguard" | "driver";
export function makePerson(seed: number, role: Role = "tourist") {
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const root = new THREE.Group(), skin = std(SKINS[Math.floor(r() * SKINS.length)], { roughness: 0.7 });
  const shirtColor = role === "lifeguard" ? "#e63946" : SHIRTS[Math.floor(r() * SHIRTS.length)];
  const striped = role === "tourist" && r() < 0.4;
  const shirtMat = striped ? std("#ffffff", { map: canvasTexture(64, 64, c => { c.fillStyle = shirtColor; c.fillRect(0, 0, 64, 64); c.fillStyle = "#ffffff"; for (let y = 0; y < 64; y += 16) c.fillRect(0, y, 64, 7); }) }) : std(shirtColor, { roughness: 0.8 });
  const big = 0.85 + r() * 0.35;
  const torso = part(new THREE.CapsuleGeometry(0.3 * big, 0.38, 6, 14), shirtMat, 0, 1.12, 0); root.add(torso);
  root.add(part(new THREE.CylinderGeometry(0.31 * big, 0.3 * big, 0.3, 14), std(role === "lifeguard" ? "#e63946" : SHORTS[Math.floor(r() * SHORTS.length)], { roughness: 0.85 }), 0, 0.78, 0));
  // a big, friendly head
  const head = new THREE.Group(); head.position.y = 1.78; root.add(head);
  head.add(part(new THREE.SphereGeometry(0.34, 24, 18), skin));
  for (const s of [-1, 1]) {
    head.add(part(new THREE.SphereGeometry(0.055, 12, 10), std("#14161c", { roughness: 0.2 }), 0.3, 0.06, s * 0.12, false));
    head.add(part(new THREE.SphereGeometry(0.018, 6, 5), new THREE.MeshBasicMaterial({ color: "#ffffff" }), 0.35, 0.08, s * 0.12 - 0.01, false));
    head.add(part(new THREE.CapsuleGeometry(0.014, 0.06, 3, 6), std("#2b1d14"), 0.31, 0.16, s * 0.12, false)).rotation.x = Math.PI / 2;
    head.add(part(new THREE.SphereGeometry(0.06, 10, 8), std("#ff9e9e", { roughness: 0.9, transparent: true, opacity: 0.55 }), 0.28, -0.06, s * 0.2, false));
  }
  head.add(part(new THREE.SphereGeometry(0.055, 10, 8), skin, 0.35, -0.02, 0, false));                       // nose
  const mouth = part(new THREE.TorusGeometry(0.07, 0.016, 6, 14, Math.PI), std("#7a2b2b"), 0.32, -0.12, 0, false);
  mouth.rotation.set(0, Math.PI / 2, Math.PI); head.add(mouth);
  for (const s of [-1, 1]) head.add(part(new THREE.SphereGeometry(0.07, 10, 8), skin, 0, 0, s * 0.34, false)); // ears
  const hair = std(HAIR[Math.floor(r() * HAIR.length)], { roughness: 0.9 }), style = role === "lifeguard" ? 3 : Math.floor(r() * 5);
  if (style === 0 || style === 1) { const cap = part(new THREE.SphereGeometry(0.36, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), hair, -0.03, 0.04, 0); cap.rotation.z = 0.35; head.add(cap); }
  if (style === 1) head.add(part(new THREE.SphereGeometry(0.15, 14, 10), hair, -0.28, 0.25, 0));               // bun
  if (style === 2) { const tail = part(new THREE.CapsuleGeometry(0.08, 0.3, 4, 8), hair, -0.38, -0.05, 0); tail.rotation.z = 0.5; head.add(tail, part(new THREE.SphereGeometry(0.36, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2.2), hair, -0.03, 0.03, 0)); }
  if (style === 3) { // visor cap and sunglasses (lifeguards) or a sun hat
    if (role === "lifeguard") {
      head.add(part(new THREE.SphereGeometry(0.355, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), std("#ffd23f"), 0, 0.05, 0));
      const brim = part(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), std("#ffd23f"), 0.25, 0.14, 0); head.add(brim);
      head.add(part(new THREE.BoxGeometry(0.06, 0.08, 0.36), std("#111", { metalness: 0.5, roughness: 0.2 }), 0.33, 0.06, 0, false));
    } else head.add(part(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 22), std("#f3e2a6"), 0, 0.22, 0), part(new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), std("#f3e2a6"), 0, 0.2, 0));
  }
  if (style === 4) head.add(part(new THREE.SphereGeometry(0.33, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), std("#3a86ff"), 0, 0.12, 0), part(new THREE.BoxGeometry(0.3, 0.03, 0.3), std("#3a86ff"), 0.2, 0.14, 0));
  if (role === "lifeguard") root.add(part(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 8), std("#ffd23f", { metalness: 0.5 }), 0.3, 1.32, 0, false)); // whistle
  const limb = new THREE.CapsuleGeometry(0.085 * big, 0.42, 4, 8);
  const arms = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(0, 1.4, s * 0.36 * big); p.add(part(limb, s < 0 || !striped ? skin : skin, 0, -0.26, 0)); root.add(p); return p; });
  const legs = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(0, 0.68, s * 0.14 * big); p.add(part(limb, skin, 0, -0.3, 0), part(new THREE.BoxGeometry(0.22, 0.08, 0.14), std(r() < 0.5 ? "#ffffff" : "#f4a261"), 0.05, -0.6, 0)); root.add(p); return p; });
  const phase = r() * 10;
  return {
    root,
    pose(t: number, mode: "walk" | "flail" | "sit") {
      const sw = Math.sin(t * 7 + phase);
      if (mode === "flail") { arms[0].rotation.set(0, 0, Math.PI - 0.4 + sw * 0.6); arms[1].rotation.set(0, 0, Math.PI - 0.4 - sw * 0.6); legs[0].rotation.z = sw; legs[1].rotation.z = -sw; mouth.scale.set(1, 1.6, 0.6); mouth.rotation.z = 0; return; }
      mouth.rotation.z = Math.PI; mouth.scale.set(1, 1, 1);
      if (mode === "sit") { arms[0].rotation.set(0, 0, 1.2); arms[1].rotation.set(0, 0, 1.2); legs[0].rotation.z = legs[1].rotation.z = 1.5; head.rotation.y = Math.sin(t * 0.6 + phase) * 0.25; return; }
      arms[0].rotation.set(-0.15, 0, sw * 0.6); arms[1].rotation.set(0.15, 0, -sw * 0.6); legs[0].rotation.z = -sw * 0.55; legs[1].rotation.z = sw * 0.55;
      torso.position.y = 1.12 + Math.abs(Math.cos(t * 7 + phase)) * 0.04; head.rotation.y = Math.sin(t * 0.8 + phase) * 0.3;
    },
  };
}
