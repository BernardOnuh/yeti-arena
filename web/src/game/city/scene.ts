// Draws Sunburn City with three.js: golden-hour sky and sun, an animated ocean, pastel buildings with windows, palms,
// ramps, the Yeti, vehicles, tourists, mission beams and a chase camera. Reads the game state; never changes it.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { makePerson } from "./characters";
import { makeYeti } from "../yeti-model";
import { MISSIONS, objectives, speedOf, type Game, type Ped, type Vehicle } from "./game";
import { BLOCK, CITY, N, PITCH, ROAD, SAND_END, roadC } from "./world";

const SUN_DIR = new THREE.Vector3(0.75, 0.32, -0.45).normalize();

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; return o;
}

export function createScene(canvas: HTMLCanvasElement, g: Game) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#ffd2a6", 110, 520);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 1600);

  // ---------- sky ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: SUN_DIR } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `varying vec3 vDir; uniform vec3 sun;
      void main(){ float y = max(vDir.y, -0.1);
        vec3 top = vec3(0.20,0.36,0.72), mid = vec3(1.0,0.62,0.45), hor = vec3(1.0,0.84,0.60);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.12, y)); c = mix(c, top, smoothstep(0.1, 0.65, y));
        float s = max(dot(normalize(vDir), sun), 0.0);
        c += vec3(1.0,0.75,0.45) * pow(s, 10.0) * 0.45 + vec3(1.0,0.95,0.8) * smoothstep(0.9975, 0.999, s);
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  scene.add(sky);

  // ---------- light ----------
  scene.add(new THREE.HemisphereLight("#ffe3c4", "#c79a6a", 1.6));
  const sun = new THREE.DirectionalLight("#ffc68f", 3.0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 400 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight("#9fc8ff", 1.1); rim.position.set(-80, 50, 90); scene.add(rim); // cool back light so characters pop
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.55, 0.86); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------- ground: grass, asphalt, sidewalks, sand, ocean ----------
  const grass = mesh(new THREE.PlaneGeometry(2400, 2400), mat("#97c56e"), CITY / 2 - 600, -0.05, CITY / 2, false); grass.rotation.x = -Math.PI / 2; scene.add(grass);
  const asphalt = mesh(new THREE.PlaneGeometry(CITY, CITY), mat("#737886", { roughness: 0.95 }), CITY / 2, 0, CITY / 2, false); asphalt.rotation.x = -Math.PI / 2; scene.add(asphalt);
  const sand = mesh(new THREE.PlaneGeometry(SAND_END - CITY + 30, 2400), mat("#f2d39a", { roughness: 1 }), (CITY + SAND_END + 30) / 2, 0.005, CITY / 2, false); sand.rotation.x = -Math.PI / 2; scene.add(sand);
  const boardwalk = mesh(new THREE.BoxGeometry(7, 0.18, 2400), mat("#c4935f"), CITY + 3.5, 0.09, CITY / 2, false); scene.add(boardwalk);
  const sidewalkMat = mat("#efe4d2"), parkMat = mat("#86c56a"), plazaMat = mat("#f4dfb8");
  for (let bz = 0; bz < N; bz++) for (let bx = 0; bx < N; bx++) {
    const k = `${bx},${bz}`, m = k === "2,2" ? plazaMat : k === "1,3" || k === "3,1" ? parkMat : sidewalkMat;
    scene.add(mesh(new THREE.BoxGeometry(BLOCK, 0.12, BLOCK), m, ROAD + bx * PITCH + BLOCK / 2, 0.06, ROAD + bz * PITCH + BLOCK / 2, false));
    if (m === parkMat) scene.add(mesh(new THREE.BoxGeometry(BLOCK - 4, 0.14, BLOCK - 4), mat("#79b85d"), ROAD + bx * PITCH + BLOCK / 2, 0.07, ROAD + bz * PITCH + BLOCK / 2, false));
  }
  // lane dashes
  const dashes: THREE.Matrix4[] = [];
  for (let i = 0; i <= N; i++) for (let a = 2; a < CITY; a += 6) {
    if (Math.abs(((a - roadC(0)) % PITCH + PITCH) % PITCH) < ROAD / 2 + 1 || Math.abs(((a - roadC(0)) % PITCH + PITCH) % PITCH - PITCH) < ROAD / 2 + 1) continue;
    dashes.push(new THREE.Matrix4().makeTranslation(a, 0.02, roadC(i)), new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(roadC(i), 0.02, a));
  }
  const dashMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 0.02, 0.28), new THREE.MeshBasicMaterial({ color: "#ffe9a8" }), dashes.length);
  dashes.forEach((m, i) => dashMesh.setMatrixAt(i, m)); scene.add(dashMesh);

  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1600, 2400, 1, 1), new THREE.ShaderMaterial({
    fog: true, transparent: false,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time: { value: 0 }, shore: { value: SAND_END } },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vW; uniform float time; uniform float shore;
      #include <fog_pars_fragment>
      void main() {
        float d = vW.x - shore;
        vec3 c = mix(vec3(0.36, 0.85, 0.86), vec3(0.07, 0.42, 0.68), smoothstep(0.0, 60.0, d));
        float w = sin(vW.x * 0.35 + time * 1.6) * sin(vW.z * 0.27 - time * 1.1) + sin(vW.x * 0.9 - vW.z * 0.6 + time * 2.3) * 0.5;
        c += vec3(1.0, 0.85, 0.6) * smoothstep(1.05, 1.4, w) * 0.35;
        float foam = smoothstep(4.0, 0.0, d + sin(vW.z * 0.15 + time * 1.2) * 1.5);
        c = mix(c, vec3(0.97, 0.98, 1.0), foam * 0.85);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(SAND_END - 6 + 800, 0.03, CITY / 2); scene.add(ocean);

  // ---------- buildings ----------
  const windows = canvasTexture(128, 128, c => {
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, 128, 128);
    for (const [x, y] of [[14, 12], [76, 12], [14, 74], [76, 74]]) {
      c.fillStyle = "rgba(60,95,135,.42)"; c.fillRect(x, y, 38, 44);
      c.fillStyle = "rgba(255,255,255,.55)"; c.fillRect(x + 4, y + 4, 10, 18);
      c.fillStyle = "rgba(0,0,0,.12)"; c.fillRect(x - 3, y + 44, 44, 5);
    }
  });
  windows.wrapS = windows.wrapT = THREE.RepeatWrapping;
  for (const b of g.world.buildings) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const geo = new THREE.BoxGeometry(w, b.h, d), uv = geo.attributes.uv as THREE.BufferAttribute;
    const faces = [[d, b.h], [d, b.h], [0, 0], [0, 0], [w, b.h], [w, b.h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
      const i = f * 4 + v, [fu, fv] = faces[f];
      uv.setXY(i, fu ? uv.getX(i) * (fu / 5.5) : 0.02, fv ? uv.getY(i) * (fv / 5.5) : 0.98);
    }
    const body = mesh(geo, mat(b.color, { map: windows, roughness: 0.8 }), (b.x0 + b.x1) / 2, b.h / 2, (b.z0 + b.z1) / 2);
    scene.add(body);
    scene.add(mesh(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), mat(b.roof), body.position.x, b.h + 0.25, body.position.z));
    if (w > 8 && d > 8 && !b.sign) scene.add(mesh(new THREE.BoxGeometry(2.4, 1.6, 2.4), mat("#d9d4c8"), b.x0 + 3, b.h + 1.3, b.z0 + 3));
    if (b.sign) {
      const tex = canvasTexture(512, 96, c => {
        c.fillStyle = b.kind === "lifeguard" ? "#ffe28a" : b.kind === "depot" ? "#ff5fa2" : "#1f8fd6"; c.fillRect(0, 0, 512, 96);
        c.fillStyle = b.kind === "lifeguard" ? "#c0392b" : "#ffffff"; c.font = "bold 58px Fredoka, Nunito, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(b.sign!, 256, 52);
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 2, 15), 2.8), new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.35 }));
      sign.position.set((b.x0 + b.x1) / 2, Math.min(b.h - 2, 7), b.z1 + 0.06); scene.add(sign);
      // a striped awning over the door
      scene.add(mesh(new THREE.BoxGeometry(8, 0.25, 2.2), mat(b.kind === "depot" ? "#ff8fbf" : b.kind === "lifeguard" ? "#ffffff" : "#7fd3ff"), (b.x0 + b.x1) / 2, 3.6, b.z1 + 1.1));
    }
  }
  // fountain on the plaza
  const plaza = g.world.places.plaza;
  scene.add(mesh(new THREE.CylinderGeometry(4.5, 4.8, 0.8, 32), mat("#e7d6b8"), plaza.x, 0.4, plaza.z - 9));
  scene.add(mesh(new THREE.CylinderGeometry(4, 4, 0.1, 32), new THREE.MeshStandardMaterial({ color: "#6fd6e6", roughness: 0.2 }), plaza.x, 0.82, plaza.z - 9, false));
  const jet = mesh(new THREE.CylinderGeometry(0.2, 0.5, 4, 12), new THREE.MeshStandardMaterial({ color: "#bff3ff", transparent: true, opacity: 0.7 }), plaza.x, 2.8, plaza.z - 9, false); scene.add(jet);
  // tiki shack
  const tiki = g.world.places.tiki;
  scene.add(mesh(new THREE.CylinderGeometry(2.6, 2.8, 2.6, 10), mat("#b07a45"), tiki.x, 1.3, tiki.z - 6));
  scene.add(mesh(new THREE.ConeGeometry(4.2, 2.4, 10), mat("#e0b96a"), tiki.x, 3.8, tiki.z - 6));
  // ramps: striped wedges
  for (const r of g.world.ramps) {
    const len = r.z1 - r.z0, ang = Math.atan2(r.h, len), slope = Math.hypot(len, r.h);
    const ramp = mesh(new THREE.BoxGeometry(r.x1 - r.x0, 0.35, slope), mat("#ffcf3f"), (r.x0 + r.x1) / 2, r.h / 2, (r.z0 + r.z1) / 2);
    ramp.rotation.x = -ang; scene.add(ramp);
    for (const s of [-1, 1]) { const stripe = mesh(new THREE.BoxGeometry(0.5, 0.37, slope), mat("#ff5a3c"), (r.x0 + r.x1) / 2 + s * 1.4, r.h / 2 + 0.01, (r.z0 + r.z1) / 2, false); stripe.rotation.x = -ang; scene.add(stripe); }
    scene.add(mesh(new THREE.BoxGeometry(r.x1 - r.x0, r.h, 0.3), mat("#8a6a4a"), (r.x0 + r.x1) / 2, r.h / 2, r.z1 - 0.15));
  }

  // ---------- palms (instanced) ----------
  const palms = g.world.palms;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.36, 7.5, 7), mat("#9b7653"), palms.length);
  const leaf = new THREE.InstancedMesh(new THREE.BoxGeometry(3.6, 0.06, 0.9), mat("#3f9a4c", { side: THREE.DoubleSide }), palms.length * 7);
  const nut = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), mat("#6b4a2b"), palms.length);
  trunk.castShadow = leaf.castShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  palms.forEach((p, i) => {
    const lean = ((i * 37) % 10) / 10 * 0.22 - 0.11, yaw = (i * 1.7) % (Math.PI * 2);
    e.set(lean, yaw, lean * 0.6); q.setFromEuler(e); m4.compose(new THREE.Vector3(p.x, 3.75, p.z), q, one); trunk.setMatrixAt(i, m4);
    const top = new THREE.Vector3(0, 3.75, 0).applyQuaternion(q).add(new THREE.Vector3(p.x, 3.75, p.z));
    for (let k = 0; k < 7; k++) {
      const a = yaw + (k / 7) * Math.PI * 2;
      e.set(0, -a, -0.45, "YZX"); q.setFromEuler(e);
      const off = new THREE.Vector3(Math.cos(a) * 1.6, -0.35, Math.sin(a) * 1.6);
      m4.compose(top.clone().add(off), q, one); leaf.setMatrixAt(i * 7 + k, m4);
    }
    m4.compose(top.clone().add(new THREE.Vector3(0, -0.3, 0)), new THREE.Quaternion(), one); nut.setMatrixAt(i, m4);
  });
  scene.add(trunk, leaf, nut);

  // ---------- the Yeti ----------
  const yeti = makeYeti(); scene.add(yeti.root);
  let anim = 0, orbit = 0, lastWalk = 0;

  // ---------- vehicles, tourists, coolers, beams ----------
  const cars = new Map<number, ReturnType<typeof makeVehicle>>();
  const pedMeshes = g.peds.map((_, i) => { const m = makePerson(1000 + i * 7919); m.root.scale.setScalar(0.95); scene.add(m.root); return m; });
  const coolerGeo = new THREE.BoxGeometry(1.2, 0.8, 0.8), coolerMat = mat("#2f8fe0"), lidMat = mat("#ffffff");
  const coolers = g.world.coolers.map(c => {
    const grp = new THREE.Group(); grp.add(mesh(coolerGeo, coolerMat), mesh(new THREE.BoxGeometry(1.26, 0.2, 0.86), lidMat, 0, 0.5, 0));
    grp.position.set(c.x, 0.5, c.z); grp.visible = false; scene.add(grp); return grp;
  });
  const beamGeo = new THREE.CylinderGeometry(1.4, 1.4, 70, 20, 1, true);
  const beams = Array.from({ length: 10 }, () => {
    const b = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    b.visible = false; scene.add(b); return b;
  });

  // ---------- camera ----------
  let camYaw = g.yeti.h, fov = 62;
  const camPos = new THREE.Vector3(g.yeti.x - 8, 5, g.yeti.z), look = new THREE.Vector3(g.yeti.x, 1, g.yeti.z);

  function update(dt: number, real: number, title = false) {
    const t = g.time; anim += real;
    (ocean.material as THREE.ShaderMaterial).uniforms.time.value = t;
    jet.scale.y = 1 + Math.sin(t * 6) * 0.08;

    // vehicles
    const alive = new Set<number>();
    for (const v of g.vehicles) {
      alive.add(v.id);
      let m = cars.get(v.id);
      if (!m) { m = makeVehicle(v); cars.set(v.id, m); scene.add(m.root); }
      m.root.position.set(v.x, v.y, v.z); m.root.rotation.set(0, -v.h, 0);
      if (v.air > 0) m.root.rotation.z = Math.max(-0.35, Math.min(0.35, v.vy * 0.04));
      for (const wh of m.wheels) wh.rotation.z = -v.wheel;
      if (m.driver) { m.driver.root.visible = v.ai !== "parked"; m.driver.pose(anim, "sit"); }
      if (m.lights) { const on = Math.floor(t * 8) % 2 === 0; m.lights[0].emissiveIntensity = on ? 2.2 : 0.1; m.lights[1].emissiveIntensity = on ? 0.1 : 2.2; }
    }
    for (const [id, m] of cars) if (!alive.has(id)) { scene.remove(m.root); cars.delete(id); }

    // the Yeti: walking, or sitting in the buggy (hidden inside closed cars)
    const c = g.car;
    if (c) {
      const seatBack = c.kind === "truck" ? 1.2 : 0.4;
      yeti.root.visible = c.kind === "buggy";
      yeti.root.position.set(c.x - Math.cos(c.h) * seatBack, c.y + 0.45, c.z - Math.sin(c.h) * seatBack); yeti.root.rotation.set(0, -c.h, 0); yeti.root.scale.setScalar(0.62);
      yeti.pose(anim, 0, "sit", false);
    } else {
      yeti.root.visible = true; yeti.root.scale.setScalar(0.72);
      yeti.root.position.set(g.yeti.x, 0.12, g.yeti.z); yeti.root.rotation.set(0, -g.yeti.h, 0);
      const moving = Math.abs(g.yeti.walk - lastWalk) > 1e-4; lastWalk = g.yeti.walk;
      yeti.pose(anim, g.yeti.walk, title ? "wave" : "walk", moving && !title);
    }

    // tourists
    g.peds.forEach((p: Ped, i) => {
      const m = pedMeshes[i];
      m.root.position.set(p.x, 0.12 + p.y, p.z);
      if (p.down > 0) { m.root.rotation.set(p.y > 0.05 ? t * p.spin : 0, -p.h, p.y > 0.05 ? t * p.spin * 0.7 : Math.PI / 2); m.pose(anim, "flail"); }
      else { m.root.rotation.set(0, -p.h, 0); m.pose(anim, "walk"); }
    });

    // coolers and beams
    const a = g.active;
    coolers.forEach((cm, i) => {
      const c0 = g.world.coolers[i], idx = a?.id === "coolers" ? a.targets.findIndex(tg => tg.x === c0.x && tg.z === c0.z) : -1;
      cm.visible = idx >= 0 && !a!.got[idx]; cm.rotation.y = t * 1.5; cm.position.y = 0.6 + Math.sin(t * 3 + i) * 0.2;
    });
    const spots: { x: number; z: number; color: string }[] = a
      ? objectives(g).map(o => ({ x: o.x, z: o.z, color: a.id === "coolers" ? "#4fc3ff" : o.label === "Cool Cave" ? "#7dffb0" : "#ff7ac0" }))
      : MISSIONS.map(m => ({ ...g.world.places[m.giver], color: g.done[m.id] !== undefined ? "#ffeaa0" : "#ffd84a" }));
    beams.forEach((b, i) => {
      const s = spots[i]; b.visible = !!s;
      if (s) { b.position.set(s.x, 35, s.z); (b.material as THREE.MeshBasicMaterial).color.set(s.color); (b.material as THREE.MeshBasicMaterial).opacity = 0.26 + Math.sin(t * 3 + i) * 0.06; }
    });

    // camera: behind the direction of travel, pulling back and widening with speed
    const target = c ?? null, px = c ? c.x : g.yeti.x, pz = c ? c.z : g.yeti.z, py = c ? c.y : 0;
    const spd = target ? speedOf(target) : 0;
    let want = c ? (spd > 4 ? Math.atan2(c.vz, c.vx) : c.h) : g.yeti.h;
    if (c && spd > 4 && Math.cos(Math.atan2(c.vz, c.vx) - c.h) < 0) want = c.h; // reversing: keep looking forward
    let dYaw = want - camYaw; dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    camYaw += dYaw * (1 - Math.exp(-dt * (c ? 3.2 : 4)));
    const back = c ? 9.5 + spd * 0.12 : 6.5, up = c ? 4.3 + spd * 0.03 : 3.4;
    const wantPos = new THREE.Vector3(px - Math.cos(camYaw) * back, py + up, pz - Math.sin(camYaw) * back);
    camPos.lerp(wantPos, 1 - Math.exp(-dt * 6));
    look.lerp(new THREE.Vector3(px + Math.cos(camYaw) * 4, py + 1.4, pz + Math.sin(camYaw) * 4), 1 - Math.exp(-dt * 10));
    if (title) {
      // title screen: a slow orbit in front of the waving Yeti
      orbit += real * 0.18;
      const a2 = g.yeti.h + 0.2 + Math.sin(orbit) * 0.7;
      camPos.set(g.yeti.x + Math.cos(a2) * 5.2, 2.1, g.yeti.z + Math.sin(a2) * 5.2);
      // aim a little to the Yeti's left so it stands on the right of the frame, beside the title text
      const dx = -Math.cos(a2), dz = -Math.sin(a2), side = window.innerWidth < 640 ? 0 : 1.7;
      look.set(g.yeti.x + dz * side, 1.35, g.yeti.z - dx * side);
    }
    camera.position.copy(camPos);
    if (g.shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake));
    camera.lookAt(look);
    fov += ((c ? 62 + Math.min(18, spd * 0.55) : 60) - fov) * (1 - Math.exp(-dt * 3));
    camera.fov = fov; camera.updateProjectionMatrix();
    sky.position.copy(camera.position);

    // the sun's shadow box follows the player
    sun.position.set(px + SUN_DIR.x * 150, SUN_DIR.y * 150, pz + SUN_DIR.z * 150); sun.target.position.set(px, 0, pz);
    composer.render();
  }

  return {
    update,
    resize(w: number, h: number) { renderer.setSize(w, h, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); bloom.resolution.set(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    dispose() {
      scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mt)) mt.forEach(x => x.dispose()); else mt?.dispose(); });
      composer.dispose(); renderer.dispose();
    },
  };
}

// ---------- models (all face +X) ----------
function makeVehicle(v: Vehicle) {
  const root = new THREE.Group(), wheels: THREE.Object3D[] = [];
  const wheelGeo = new THREE.CylinderGeometry(v.kind === "truck" ? 0.62 : 0.55, v.kind === "truck" ? 0.62 : 0.55, 0.45, 16); wheelGeo.rotateX(Math.PI / 2);
  const tire = mat("#1d1f24"), hub = mat("#d9d9d9");
  const wheel = (x: number, z: number) => { const w = new THREE.Group(); w.position.set(x, wheelGeo.parameters.radiusTop, z); w.add(mesh(wheelGeo, tire), mesh(new THREE.BoxGeometry(0.5, 0.12, 0.47), hub)); root.add(w); wheels.push(w); };
  let lights: THREE.MeshStandardMaterial[] | undefined, driver: ReturnType<typeof makePerson> | undefined;
  if (v.kind === "buggy") {
    root.add(mesh(new THREE.BoxGeometry(3.4, 0.55, 1.9), mat(v.color), 0, 0.85, 0));
    root.add(mesh(new THREE.BoxGeometry(1.1, 0.35, 1.7), mat("#ffd166"), 1.3, 1.25, 0));
    const bar = mat("#2b2d33", { metalness: 0.6, roughness: 0.4 });
    for (const [x, z] of [[-0.9, -0.85], [-0.9, 0.85], [0.6, -0.85], [0.6, 0.85]]) root.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.7), bar, x, 1.95, z));
    root.add(mesh(new THREE.BoxGeometry(1.7, 0.1, 1.8), bar, -0.15, 2.8, 0));
    for (const [x, z] of [[1.25, -1.1], [1.25, 1.1], [-1.25, -1.1], [-1.25, 1.1]]) wheel(x, z);
  } else if (v.kind === "truck") {
    root.add(mesh(new THREE.BoxGeometry(4.4, 2.6, 2.5), mat("#fff3f8"), -0.6, 2.0, 0));
    root.add(mesh(new THREE.BoxGeometry(4.42, 0.4, 2.52), mat("#ff5fa2"), -0.6, 1.2, 0));
    root.add(mesh(new THREE.BoxGeometry(1.6, 2, 2.4), mat("#ff8fbf"), 2.4, 1.7, 0));
    root.add(mesh(new THREE.BoxGeometry(0.1, 0.9, 2.1), mat("#24304a", { roughness: 0.2 }), 3.21, 2.1, 0));
    const cone = mesh(new THREE.ConeGeometry(0.75, 2, 16), mat("#e9b46a"), -0.6, 4.3, 0); cone.rotation.x = Math.PI; root.add(cone);
    root.add(mesh(new THREE.SphereGeometry(0.85, 18, 12), mat("#ff9ccc"), -0.6, 5.5, 0));
    root.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), mat("#e0254f"), -0.6, 6.4, 0));
    for (const [x, z] of [[1.9, -1.15], [1.9, 1.15], [-2, -1.15], [-2, 1.15]]) wheel(x, z);
  } else {
    root.add(mesh(new THREE.BoxGeometry(4, 0.8, 1.95), mat(v.color, { roughness: 0.45, metalness: 0.15 }), 0, 0.85, 0));
    const glass = new THREE.MeshStandardMaterial({ color: "#9fc4e8", roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false });
    root.add(mesh(new THREE.BoxGeometry(2.1, 0.75, 1.75), glass, -0.25, 1.62, 0, false));
    root.add(mesh(new THREE.BoxGeometry(2.14, 0.08, 1.79), mat(v.color), -0.25, 2.0, 0)); // the roof
    driver = makePerson(v.id * 104729 + 17, v.kind === "lifeguard" ? "lifeguard" : "driver"); driver.root.scale.setScalar(0.62); driver.root.position.set(-0.15, 0.55, -0.4); root.add(driver.root);
    if (v.kind === "lifeguard") {
      root.add(mesh(new THREE.BoxGeometry(4.02, 0.22, 1.97), mat("#ffffff"), 0, 0.95, 0));
      lights = [new THREE.MeshStandardMaterial({ color: "#ff2a2a", emissive: "#ff2a2a" }), new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff" })];
      root.add(mesh(new THREE.BoxGeometry(0.5, 0.22, 0.6), lights[0], -0.25, 2.15, -0.4), mesh(new THREE.BoxGeometry(0.5, 0.22, 0.6), lights[1], -0.25, 2.15, 0.4));
    }
    for (const [x, z] of [[1.35, -1.0], [1.35, 1.0], [-1.35, -1.0], [-1.35, 1.0]]) wheel(x, z);
  }
  return { root, wheels, lights, driver };
}
