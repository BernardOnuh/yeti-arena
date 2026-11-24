// The Yeti Arena mascot: a big, huggable Yeti in snow-white fur with icy-blue tips, a grey-blue face, oversized blue
// eyes, a cocked brow and a wide mischievous grin with a few rounded teeth. Shell-rendered fur, no clothing or props.
// One model for the mascot showcase ("hero" quality) and the games ("game" quality). It faces +X.
import * as THREE from "three";

const FUR = "#fbfdff", TIP = "#cfe9ff", FACE = "#9fb4c9", FACE_DARK = "#56697f", IRIS = "#3aa6f2";

// ---------- fur: stacked shells pushed out along the normal, thinned by a strand-noise texture ----------
let strandTex: THREE.DataTexture | null = null;
function strands() {
  if (strandTex) return strandTex;
  const S = 256, d = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { const v = Math.pow(Math.random(), 0.55) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  strandTex = new THREE.DataTexture(d, S, S); strandTex.wrapS = strandTex.wrapT = THREE.RepeatWrapping; strandTex.needsUpdate = true;
  return strandTex;
}
interface FurOpts { len: number; density: [number, number]; shells: number; wind?: [number, number] }
function furShell(h: number, o: FurOpts) {
  const m = new THREE.MeshStandardMaterial({ color: FUR, roughness: 0.92 });
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, {
      furH: { value: h }, furLen: { value: o.len }, furTex: { value: strands() }, furDensity: { value: new THREE.Vector2(...o.density) },
      furTip: { value: new THREE.Color(TIP) }, furWind: { value: new THREE.Vector2(...(o.wind ?? [0, 0])) },
    });
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float furH; uniform float furLen; uniform vec2 furWind; uniform sampler2D furTex; uniform vec2 furDensity; varying vec2 vFurUv;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        float k = furH * furH;
        float clump = texture2D(furTex, uv * furDensity * 0.07).r;   // fur grows in clumps
        transformed += normal * furLen * furH * (0.55 + 0.9 * clump);
        transformed.y -= furLen * k * 0.45;                     // strands droop
        transformed.xz += furWind * furLen * k;                 // and sweep with the wind
        vFurUv = uv;`);
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float furH; uniform sampler2D furTex; uniform vec2 furDensity; uniform vec3 furTip; varying vec2 vFurUv;")
      .replace("#include <map_fragment>", `#include <map_fragment>
        float strand = texture2D(furTex, vFurUv * furDensity).r;
        if (furH > 0.0 && strand < furH * 0.97) discard;          // thinner towards the tips
        float ao = 0.5 + 0.5 * furH;                              // deep fur is darker: self-shadowing
        diffuseColor.rgb = mix(diffuseColor.rgb, furTip, smoothstep(0.35, 1.0, furH) * 0.9) * ao;`);
  };
  m.customProgramCacheKey = () => "yeti-fur";
  return m;
}
function furry(geo: THREE.BufferGeometry, o: FurOpts) {
  const g = new THREE.Group();
  for (let i = 0; i <= o.shells; i++) { const m = new THREE.Mesh(geo, furShell(i / o.shells, o)); m.castShadow = i === 0; m.receiveShadow = i === 0; g.add(m); }
  return g;
}
const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
const skin = () => std(FACE, { roughness: 0.62, emissive: "#3d5d7f", emissiveIntensity: 0.28 }); // a soft glow stands in for subsurface scattering
function part(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; return o;
}
/** Bulges a geometry outward on one side, to shape muscles and bellies. */
function bulge(geo: THREE.BufferGeometry, f: (x: number, y: number, z: number) => number) {
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = f(x, y, z); p.setXYZ(i, x * k, y, z * k); }
  geo.computeVertexNormals(); return geo;
}

function eye(size: number) {
  const g = new THREE.Group();
  const white = part(new THREE.SphereGeometry(size, 32, 24), std("#ffffff", { roughness: 0.18 }), 0, 0, 0, false); white.scale.set(0.62, 1.1, 1); g.add(white);
  const iris = part(new THREE.SphereGeometry(size * 0.8, 32, 24), std(IRIS, { roughness: 0.2, emissive: "#0d4f8a", emissiveIntensity: 0.35 }), size * 0.3, 0, 0, false); iris.scale.set(0.6, 1, 1); g.add(iris);
  g.add(part(new THREE.SphereGeometry(size * 0.42, 24, 18), std("#05070d", { roughness: 0.1 }), size * 0.52, 0, 0, false));
  const glint = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  g.add(part(new THREE.SphereGeometry(size * 0.17, 12, 10), glint, size * 0.66, size * 0.34, -size * 0.2, false));
  g.add(part(new THREE.SphereGeometry(size * 0.08, 8, 6), glint, size * 0.66, -size * 0.25, size * 0.22, false));
  return g;
}

export type YetiMode = "walk" | "sit" | "wave" | "mascot";
export function makeYeti(quality: "game" | "hero" = "game") {
  const hero = quality === "hero", sh = (n: number) => (hero ? Math.round(n * 1.9) : n), dens = (u: number, v: number): [number, number] => hero ? [u * 1.7, v * 1.7] : [u, v];
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);

  // a big rounded body, wider at the belly and hips; the head sinks into it (no neck)
  const torsoGeo = bulge(new THREE.SphereGeometry(1.05, 56, 40), (x, y) => (1 + (y < 0.2 ? (0.2 - y) * 0.16 : -(y - 0.2) * 0.12)) * (x > 0 ? 1.04 : 1));
  torsoGeo.scale(0.95, 1.02, 1.06);
  const torso = furry(torsoGeo, { len: 0.22, density: dens(20, 11), shells: sh(18) }); torso.position.y = 1.28; body.add(torso);

  const head = new THREE.Group(); head.position.set(0.22, 2.22, 0); body.add(head);
  const headGeo = new THREE.SphereGeometry(0.74, 48, 36); headGeo.scale(1, 0.92, 1.06);
  head.add(furry(headGeo, { len: 0.15, density: dens(17, 9), shells: sh(16) }));
  // wild, windswept hair: tufts swept back and to one side
  const tufts: THREE.Group[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 1.9, len = 0.42 + ((i * 7) % 5) * 0.06;
    const t = furry(new THREE.CapsuleGeometry(0.075, len, 4, 12), { len: 0.07, density: dens(4, 9), shells: sh(9), wind: [-1.6, 0.8] });
    t.position.set(0.12 - Math.abs(a) * 0.1, 0.62 - Math.abs(a) * 0.12, a * 0.3);
    t.rotation.set(a * 0.7, 0, 1.25 + ((i * 3) % 4) * 0.08);   // lying back over the crown, fanned out
    head.add(t); tufts.push(t);
  }

  // the face: grey-blue skin, framed by fur
  const face = part(new THREE.SphereGeometry(0.55, 48, 36), skin(), 0.5, -0.05, 0, false); face.scale.set(0.8, 0.98, 1.12); head.add(face);
  const eyes = [-1, 1].map(s => { const e = eye(0.2); e.position.set(0.8, 0.1, s * 0.235); e.rotation.y = -s * 0.28; head.add(e); return e; });
  const browMat = std(FACE_DARK, { roughness: 0.8 });
  const brows = [-1, 1].map(s => { const b = part(new THREE.CapsuleGeometry(0.045, 0.2, 4, 10), browMat, 0.9, 0.37, s * 0.24, false); b.rotation.x = Math.PI / 2; head.add(b); return b; });
  head.add(part(new THREE.SphereGeometry(0.09, 20, 16), std("#33465c", { roughness: 0.25 }), 0.97, -0.07, 0, false));          // small rounded nose
  // a wide, lopsided grin: a dark mouth, a lip of skin over its top half, a few rounded teeth and a tongue
  const mouth = new THREE.Group(); mouth.position.set(0.83, -0.27, 0.02); mouth.rotation.x = 0.1; head.add(mouth);
  const inner = part(new THREE.SphereGeometry(0.2, 32, 20), std("#2a1724", { roughness: 0.7 }), 0, 0, 0, false); inner.scale.set(0.5, 0.5, 1.25); mouth.add(inner);
  const lip = part(new THREE.SphereGeometry(0.22, 32, 20), skin(), 0.015, 0.075, 0, false); lip.scale.set(0.52, 0.34, 1.3); mouth.add(lip);
  for (const z of [-0.07, 0.02, 0.1]) { const tooth = part(new THREE.CapsuleGeometry(0.028, 0.03, 4, 10), std("#fbf7ee", { roughness: 0.3 }), 0.08, -0.005, z, false); mouth.add(tooth); }
  const tongue = part(new THREE.SphereGeometry(0.08, 16, 12), std("#ff7f9a", { roughness: 0.5 }), 0.05, -0.07, 0.03, false); tongue.scale.set(0.6, 0.4, 1); mouth.add(tongue);
  for (const s of [-1, 1]) { const ear = part(new THREE.SphereGeometry(0.11, 16, 12), skin(), -0.08, 0.28, s * 0.74, false); ear.scale.set(0.6, 1, 0.5); head.add(ear); } // tiny ears, mostly under the fur

  // thick, muscular arms with big mitten hands (one thumb, three rounded fingers)
  const armGeo = bulge(new THREE.CapsuleGeometry(0.33, 0.78, 8, 20), (x, y) => 1 + Math.max(0, 0.25 - Math.abs(y - 0.1)) * 0.6 + (y < -0.2 ? 0.08 : 0));
  const arms = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(0.05, 1.86, s * 1.02);
    const arm = furry(armGeo, { len: 0.11, density: dens(10, 12), shells: sh(12) }); arm.position.y = -0.5; pivot.add(arm);
    const hand = new THREE.Group(); hand.position.set(0.06, -1.1, 0); pivot.add(hand);
    const palm = part(new THREE.SphereGeometry(0.36, 28, 20), skin()); palm.scale.set(1.05, 0.92, 0.95); hand.add(palm);
    for (const z of [-0.16, 0, 0.16]) hand.add(part(new THREE.SphereGeometry(0.13, 16, 12), skin(), 0.22, -0.26, z));
    hand.add(part(new THREE.SphereGeometry(0.13, 16, 12), skin(), 0.27, 0.04, -s * 0.26));
    body.add(pivot); return pivot;
  });
  // short, sturdy legs and big rounded feet with toe pads
  const legs = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(0, 0.62, s * 0.48);
    pivot.add(furry(new THREE.CapsuleGeometry(0.38, 0.22, 8, 18), { len: 0.11, density: dens(10, 8), shells: sh(12) }));
    const foot = new THREE.Group(); foot.position.set(0.16, -0.5, 0); pivot.add(foot);
    const top = furry(new THREE.SphereGeometry(0.42, 32, 20), { len: 0.08, density: dens(10, 6), shells: sh(10) }); top.scale.set(1.35, 0.55, 1); foot.add(top);
    const sole = part(new THREE.SphereGeometry(0.43, 32, 16), skin()); sole.scale.set(1.36, 0.22, 1.02); sole.position.y = -0.1; foot.add(sole);
    for (const z of [-0.2, 0, 0.2]) { const toe = part(new THREE.SphereGeometry(0.11, 14, 10), skin(), 0.52, -0.06, z); toe.scale.set(1, 0.7, 1); foot.add(toe); }
    root.add(pivot); return pivot;
  });

  let blinkAt = 1.5, grin = 0;
  return {
    root, head,
    /** t: real seconds; walk: walk phase; mode: how to stand; moving: whether the walk cycle plays; look: head yaw toward the camera. */
    pose(t: number, walk: number, mode: YetiMode, moving: boolean, look = 0) {
      const sw = moving ? Math.sin(walk) : 0, breathe = Math.sin(t * 1.9) * 0.018, bounce = moving ? Math.abs(Math.cos(walk)) : 0;
      body.scale.set(1 + bounce * 0.04 - breathe * 0.5, 1 - bounce * 0.05 + breathe, 1 + bounce * 0.04 - breathe * 0.5);
      body.position.y = moving ? bounce * 0.12 : 0;
      // mascot: a confident three-quarter stance, leaning toward the camera
      const lean = mode === "mascot" ? -0.13 : 0;
      body.rotation.set(moving ? sw * 0.06 : Math.sin(t * 1.2) * 0.015, 0, lean + (moving ? -0.06 : 0));
      head.rotation.set(moving ? sw * 0.05 : Math.sin(t * 0.8) * 0.04, look + (mode === "mascot" ? Math.sin(t * 0.5) * 0.06 : 0), (mode === "mascot" ? 0.1 : 0) + (moving ? Math.cos(walk * 2) * 0.03 : Math.sin(t * 0.9) * 0.03));
      if (mode === "sit") { arms.forEach(a => a.rotation.set(0, 0, 1.15)); legs.forEach(l => (l.rotation.z = 1.4)); }
      else if (mode === "wave") { arms[0].rotation.set(0.1, 0, Math.sin(t * 1.5) * 0.08); arms[1].rotation.set(-2.5, 0, 0.25 + Math.sin(t * 9) * 0.35); legs.forEach(l => (l.rotation.z = 0)); }
      else if (mode === "mascot") {
        // one fist on the hip, the other arm loose and ready: confident, a little cheeky
        arms[0].rotation.set(0.35, 0, 0.25 + Math.sin(t * 1.1) * 0.04); arms[1].rotation.set(-0.55, 0.2, 0.45 + Math.sin(t * 1.3 + 1) * 0.05);
        legs[0].rotation.set(0.1, 0, -0.08); legs[1].rotation.set(-0.12, 0, 0.12);
      } else { arms[0].rotation.set(-0.12, 0, sw * 0.8); arms[1].rotation.set(0.12, 0, -sw * 0.8); legs[0].rotation.set(0, 0, -sw * 0.7); legs[1].rotation.set(0, 0, sw * 0.7); }
      tufts.forEach((tf, i) => { tf.rotation.y = Math.sin(t * 2.2 + i) * 0.06; });
      // blinking
      if (t > blinkAt + 0.15) blinkAt = t + 2 + Math.random() * 3;
      const b = t > blinkAt ? Math.sin(((t - blinkAt) / 0.15) * Math.PI) : 0;
      eyes.forEach(e => (e.scale.y = 1 - 0.92 * b));
      // the mischievous look: a cocked brow and a grin that widens now and then
      grin += ((mode === "mascot" || mode === "wave" ? 0.75 + Math.max(0, Math.sin(t * 0.7)) * 0.25 : moving ? 0.5 : 0.35) - grin) * 0.06;
      brows[0].position.y = 0.36 - grin * 0.01; brows[0].rotation.x = Math.PI / 2 - 0.22;
      brows[1].position.y = 0.4 + grin * 0.09; brows[1].rotation.x = Math.PI / 2 - 0.3 - grin * 0.2;
      mouth.scale.set(1, 0.75 + grin * 0.4, 0.85 + grin * 0.3); mouth.rotation.x = 0.1 + grin * 0.06;
    },
  };
}
