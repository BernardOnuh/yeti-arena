// Street furniture, drawn with instanced meshes (one draw call per part for the whole city): street lamps with a warm
// glowing panel and a pool of light on the ground, traffic signals that cycle at every junction, benches, bins, fire
// hydrants, and the CC0 "Lantern" model along the boardwalk. Lamps and lanterns glow brighter in the snow.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Prop, Props } from "./world";

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const place = (p: Prop) => new THREE.Matrix4().makeRotationY(-p.h).setPosition(p.x, 0, p.z);

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, at: Prop[], local: THREE.Matrix4, shadow = true) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, at.length));
  at.forEach((p, i) => m.setMatrixAt(i, place(p).multiply(local)));
  m.count = at.length; m.castShadow = shadow; m.receiveShadow = true; return m;
}
const T = (x: number, y: number, z: number, rz = 0, rx = 0) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)).setPosition(x, y, z);

export function buildProps(props: Props, scene: THREE.Scene) {
  const group = new THREE.Group(); scene.add(group);
  const metal = std("#3a3f47", { metalness: 0.7, roughness: 0.35 }), dark = std("#22262c", { metalness: 0.5, roughness: 0.4 });

  // street lamps: a pole, a gently curved arm reaching over the road, a head with a glowing panel underneath
  const L = props.lamps;
  group.add(instanced(new THREE.CylinderGeometry(0.07, 0.11, 6.2, 10), metal, L, T(0, 3.1, 0)));
  const armCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 6.0, 0), new THREE.Vector3(0.1, 6.7, 0), new THREE.Vector3(1.7, 6.55, 0));
  group.add(instanced(new THREE.TubeGeometry(armCurve, 12, 0.05, 6), metal, L, new THREE.Matrix4()));
  group.add(instanced(new THREE.BoxGeometry(0.62, 0.14, 0.3), dark, L, T(1.85, 6.5, 0)));
  const lampGlow = new THREE.MeshStandardMaterial({ color: "#fff2d8", emissive: "#ffd59a", emissiveIntensity: 1.5, roughness: 0.3 });
  group.add(instanced(new THREE.BoxGeometry(0.52, 0.03, 0.22), lampGlow, L, T(1.85, 6.42, 0), false));
  // the pool of light on the ground under each lamp
  const poolTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d")!; const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "rgba(255,214,150,1)"); g.addColorStop(0.5, "rgba(255,200,130,.35)"); g.addColorStop(1, "rgba(255,190,120,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
  const poolGeo = new THREE.PlaneGeometry(7, 7); poolGeo.rotateX(-Math.PI / 2);
  group.add(instanced(poolGeo, poolMat, L, T(1.85, 0.05, 0), false));

  // traffic signals: one set of lights per direction of travel, cycling green, amber, red
  const S = props.signals, axes = [S.filter(s => s.axis === 0), S.filter(s => s.axis === 1)];
  group.add(instanced(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 10), dark, S, T(0, 1.8, 0)));
  group.add(instanced(new THREE.BoxGeometry(0.32, 1.0, 0.34), std("#2b2f35", { roughness: 0.5 }), S, T(0, 3.25, 0)));
  const bulbGeo = new THREE.SphereGeometry(0.11, 14, 10);
  const COLORS = ["#ff3b30", "#ffb020", "#3ddc84"];
  const bulbs = axes.map(group0 => COLORS.map((c, k) => {
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.05, roughness: 0.3 });
    group.add(instanced(bulbGeo, m, group0, T(0.17, 3.58 - k * 0.32, 0), false)); return m;
  }));

  // benches, bins and hydrants
  const wood = std("#8a5a34", { roughness: 0.75 });
  const B = props.benches;
  group.add(instanced(new THREE.BoxGeometry(0.46, 0.06, 1.7), wood, B, T(0, 0.46, 0)));
  group.add(instanced(new THREE.BoxGeometry(0.06, 0.44, 1.7), wood, B, T(-0.22, 0.74, 0, -0.18)));
  group.add(instanced(new THREE.BoxGeometry(0.42, 0.44, 0.06), metal, B, T(0, 0.22, 0.75)));
  group.add(instanced(new THREE.BoxGeometry(0.42, 0.44, 0.06), metal, B, T(0, 0.22, -0.75)));
  group.add(instanced(new THREE.CylinderGeometry(0.28, 0.25, 0.9, 14), std("#2f5d4a", { metalness: 0.4, roughness: 0.45 }), props.bins, T(0, 0.45, 0)));
  group.add(instanced(new THREE.CylinderGeometry(0.31, 0.31, 0.06, 14), dark, props.bins, T(0, 0.93, 0)));
  const red = std("#c9302c", { roughness: 0.4, metalness: 0.2 });
  group.add(instanced(new THREE.CylinderGeometry(0.13, 0.15, 0.62, 12), red, props.hydrants, T(0, 0.31, 0)));
  group.add(instanced(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, props.hydrants, T(0, 0.62, 0)));
  group.add(instanced(new THREE.CylinderGeometry(0.05, 0.05, 0.38, 8), red, props.hydrants, T(0, 0.42, 0, Math.PI / 2)));

  // lanterns along the boardwalk (the Khronos glTF sample "Lantern", CC0); scaled to 4.4 m
  const lanternLights: THREE.MeshStandardMaterial[] = [];
  new GLTFLoader().load("/models/Lantern.glb", gltf => {
    const src = gltf.scene, box = new THREE.Box3().setFromObject(src), size = box.getSize(new THREE.Vector3());
    const k = 4.4 / size.y; src.scale.setScalar(k); src.position.y = -box.min.y * k;
    src.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && "emissive" in m && m.emissiveMap) { m.emissive = new THREE.Color("#ffe0b0"); m.emissiveIntensity = 0.3; lanternLights.push(m); }  // only the glass glows
      if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    for (const p of props.lanterns) { const l = src.clone(); l.position.x += p.x; l.position.z += p.z; group.add(l); }
    loaded.lanterns = true;
  });
  const loaded = { lanterns: false };

  return {
    group, loaded,
    /** t: game time; snow: 0..1. Signals cycle every 12 s per direction; lamps glow brighter under the snow sky. */
    update(t: number, snow: number) {
      const phase = t % 12;
      axes.forEach((_, a) => {
        const p = (phase + a * 6) % 12, state = p < 5 ? 2 : p < 6 ? 1 : 0;   // 0 red, 1 amber, 2 green
        bulbs[a].forEach((m, k) => (m.emissiveIntensity = k === state ? 3.2 : 0.04));
      });
      lampGlow.emissiveIntensity = 1.2 + snow * 2.4;
      poolMat.opacity = 0.12 + snow * 0.38;
      lanternLights.forEach(m => (m.emissiveIntensity = 0.3 + snow * 1.5));
    },
  };
}
