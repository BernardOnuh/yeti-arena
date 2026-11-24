// Sunburn City's people, built for an animated-feature look: chunky cartoon tourists, drivers and lifeguards with
// faces, hair and hats. All original designs; all models face +X. The Yeti lives in ../yeti-model.ts.
import * as THREE from "three";

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
function part(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; return o;
}
function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
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
