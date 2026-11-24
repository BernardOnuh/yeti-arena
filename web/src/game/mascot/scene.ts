// The mascot showcase: the Yeti in a three-quarter stance in a magical frozen mountain landscape, with towering ice
// crystals, snow-capped rocks, frozen ground, distant peaks and falling snow. Cinematic lighting with a warm key, an
// icy rim, ambient occlusion, depth of field and a little bloom. capture() renders a still at any size.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { makeYeti } from "../yeti-model";

function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const noise = (x: number, z: number) => Math.sin(x * 0.11) * Math.cos(z * 0.13) + Math.sin(x * 0.31 + z * 0.17) * 0.4 + Math.sin(x * 0.73 - z * 0.61) * 0.15;

function crystalGeometry(h: number, r: number) {
  const shaft = new THREE.CylinderGeometry(r, r * 1.08, h, 6, 1); shaft.translate(0, h / 2, 0);
  const tip = new THREE.ConeGeometry(r, r * 2.2, 6, 1); tip.translate(0, h + r * 1.1, 0);
  const g = mergeGeometries([shaft.toNonIndexed(), tip.toNonIndexed()])!; g.computeVertexNormals(); return g;
}

export function createMascotScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2("#cfe2f5", 0.0065);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2500);
  const r = rng(7);

  // sky: deep blue overhead fading to a pale, glowing horizon
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `varying vec3 vDir;
      void main(){ float y = max(vDir.y, 0.0);
        vec3 c = mix(vec3(0.86,0.93,1.0), vec3(0.36,0.58,0.86), smoothstep(0.0, 0.55, y));
        float glow = pow(max(dot(normalize(vDir), normalize(vec3(-0.5,0.35,-0.8))), 0.0), 6.0);
        gl_FragColor = vec4(c + vec3(0.9,0.95,1.0) * glow * 0.35, 1.0); }`,
  })));

  // light: a soft warm-white key from the front left, an icy rim from behind, sky fill and a cool bounce from the snow
  scene.add(new THREE.HemisphereLight("#d6ebff", "#f4f9ff", 1.15));
  const key = new THREE.DirectionalLight("#fff4e8", 2.7); key.position.set(9, 11, -7);
  key.castShadow = true; key.shadow.mapSize.set(4096, 4096); key.shadow.radius = 6; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.09;
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  const rim = new THREE.DirectionalLight("#7cd3ff", 4.2); rim.position.set(-9, 6, 6);
  const bounce = new THREE.PointLight("#bfe6ff", 6, 9, 2); bounce.position.set(2.5, 0.4, -1);
  scene.add(key, rim, bounce);

  // frozen ground: rolling snow, and a glassy ice patch around the Yeti
  const groundGeo = new THREE.PlaneGeometry(600, 600, 220, 220); groundGeo.rotateX(-Math.PI / 2);
  { const p = groundGeo.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z); p.setY(i, noise(x, z) * Math.min(1, Math.max(0, (d - 7) / 25)) * 2.2); } groundGeo.computeVertexNormals(); }
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: "#f2f8ff", roughness: 0.82 })); ground.receiveShadow = true; scene.add(ground);
  const ice = new THREE.Mesh(new THREE.CircleGeometry(5.5, 64), new THREE.MeshPhysicalMaterial({ color: "#cfeeff", roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, metalness: 0, transparent: true, opacity: 0.85 }));
  ice.rotation.x = -Math.PI / 2; ice.position.set(1.2, 0.01, -1.5); ice.receiveShadow = true; scene.add(ice);

  // towering blue ice crystals
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: "#a6e4ff", roughness: 0.06, transmission: 0.72, thickness: 1.6, ior: 1.31, attenuationColor: new THREE.Color("#3aa9ff"), attenuationDistance: 2.5,
    emissive: "#1b7fd4", emissiveIntensity: 0.38, flatShading: true, clearcoat: 1,
  });
  const cluster = (cx: number, cz: number, scale: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const h = (2.5 + r() * 5.5) * scale * (i === 0 ? 1.4 : 1), m = new THREE.Mesh(crystalGeometry(h, (0.35 + r() * 0.35) * scale), crystalMat);
      const a = r() * Math.PI * 2, d = i === 0 ? 0 : (0.4 + r() * 1.1) * scale;
      m.position.set(cx + Math.cos(a) * d, -0.3, cz + Math.sin(a) * d);
      m.rotation.set((r() - 0.5) * 0.6 + (i ? Math.sin(a) * 0.35 : 0), r() * Math.PI, (r() - 0.5) * 0.6 - (i ? Math.cos(a) * 0.35 : 0));
      m.castShadow = true; scene.add(m);
    }
  };
  cluster(-6.5, 6.2, 1.5, 7); cluster(-9, -6.5, 1.25, 6); cluster(-22, 2, 2.2, 6); cluster(-26, -16, 2.4, 5); cluster(-14, 18, 1.8, 5);
  cluster(4.2, -4.6, 0.4, 3);

  // snow-covered rocks: displaced boulders, white wherever they face up
  const rockGeo = (seed: number) => {
    const g = mergeVertices(new THREE.IcosahedronGeometry(1, 6)), p = g.attributes.position as THREE.BufferAttribute, rr = rng(seed);
    const ph = [rr() * 9, rr() * 9, rr() * 9];
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)), k = 1 + Math.sin(v.x * 3 + ph[0]) * 0.12 + Math.sin(v.y * 4 + ph[1]) * 0.1 + Math.sin(v.z * 5 + ph[2]) * 0.08;
      v.multiplyScalar(k); v.y *= 0.7; p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal as THREE.BufferAttribute, colors = new Float32Array(p.count * 3), snow = new THREE.Color("#f6fbff"), stone = new THREE.Color("#66788f");
    for (let i = 0; i < p.count; i++) { const c = stone.clone().lerp(snow, THREE.MathUtils.smoothstep(n.getY(i), 0.25, 0.6)); colors.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3)); return g;
  };
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  for (const [x, z, s] of [[-3.2, -3.6, 1.1], [-4.6, 3.2, 1.5], [5.5, 1.2, 0.8], [-12, -2, 2.6], [-10, 10, 2.2], [9, 9, 1.6], [-18, -10, 3.5], [6, -9, 1.4], [-30, 8, 5]] as const) {
    const m = new THREE.Mesh(rockGeo(x * 13 + z), rockMat); m.scale.setScalar(s); m.position.set(x, s * 0.3, z); m.rotation.y = r() * 6; m.castShadow = m.receiveShadow = true; scene.add(m);
  }

  // distant peaks with snowy tops
  const peakMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  for (let i = 0; i < 11; i++) {
    const h = 70 + r() * 120, rad = 50 + r() * 70, g = new THREE.ConeGeometry(rad, h, 200, 60, true), p = g.attributes.position as THREE.BufferAttribute, ph = r() * 9;
    const colors = new Float32Array(p.count * 3), snow = new THREE.Color("#f5faff"), rock = new THREE.Color("#7b8fae");
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k), a = Math.atan2(z, x), f = 1 + Math.sin(a * 5 + ph) * 0.12 + Math.sin(a * 9 + ph * 2) * 0.04 + Math.sin(y * 0.05 + a * 3) * 0.04;
      p.setXYZ(k, x * f, y, z * f);
      const t = (y + h / 2) / h, c = rock.clone().lerp(snow, THREE.MathUtils.smoothstep(t + Math.sin(a * 7 + ph) * 0.08, 0.42, 0.6)); colors.set([c.r, c.g, c.b], k * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3)); g.computeVertexNormals();
    const a = -Math.PI * 0.95 + (i / 10) * Math.PI * 1.25, d = 230 + r() * 160;
    const m = new THREE.Mesh(g, peakMat); m.position.set(Math.cos(a) * d - 60, h / 2 - 8, Math.sin(a) * d); scene.add(m);
  }

  // soft shafts of light falling from the upper left
  const shaftTex = (() => { const c = document.createElement("canvas"); c.width = 4; c.height = 256; const x = c.getContext("2d")!; const gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.35, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 4, 256); return new THREE.CanvasTexture(c); })();
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2.5 + r() * 3, 60), new THREE.MeshBasicMaterial({ map: shaftTex, color: "#e8f6ff", transparent: true, opacity: 0.07 + r() * 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    s.position.set(-14 + i * 4, 16, -14 + i * 2.5); s.rotation.set(0, 0.6, 0.55); scene.add(s);
  }

  // falling snow
  const N = 3000, flakes = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) flakes.set([(r() - 0.5) * 40, r() * 14, (r() - 0.5) * 40], i * 3);
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute("position", new THREE.BufferAttribute(flakes, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: "#ffffff", size: 0.06, transparent: true, opacity: 0.9, depthWrite: false }));
  scene.add(snow);

  // the Yeti: body turned a little away, head turned back to look straight down the lens
  const yeti = makeYeti("hero"); scene.add(yeti.root);
  const CAM_ANGLE = 0.3, BODY = CAM_ANGLE + 0.85, D = 8.4;
  yeti.root.rotation.y = -BODY;

  // post: ambient occlusion, depth of field, a touch of bloom
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, 1, 1); ao.blendIntensity = 0.7;
  ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 1.5, scale: 1, samples: 24 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 10, rings: 3, samples: 24 }); // denoise
  composer.addPass(ao);
  const bokeh = new BokehPass(scene, camera, { focus: D, aperture: 0.0018, maxblur: 0.009 }); composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.5, 0.9); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let t = 0, w = 1, h = 1;
  function frame(dt: number) {
    t += dt;
    const a = CAM_ANGLE + Math.sin(t * 0.12) * 0.035;
    camera.position.set(Math.cos(a) * D, 1.35 + Math.sin(t * 0.17) * 0.04, Math.sin(a) * D);
    camera.lookAt(0, 1.45, 0);
    yeti.pose(t, 0, "mascot", false, BODY - a);
    const pos = snowGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) { let y = pos.getY(i) - dt * (0.5 + (i % 7) * 0.08); if (y < 0) y += 14; pos.setXYZ(i, pos.getX(i) + Math.sin(t + i) * dt * 0.15, y, pos.getZ(i)); }
    pos.needsUpdate = true;
    composer.render();
  }
  function setSize(width: number, height: number, ratio = Math.min(window.devicePixelRatio || 1, 2)) {
    w = width; h = height;
    renderer.setPixelRatio(ratio); renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio); composer.setSize(width, height);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    (bokeh.uniforms as Record<string, THREE.IUniform>)["aspect"].value = camera.aspect;
  }
  return {
    frame, setSize,
    /** Renders one still at exactly width × height pixels and returns it as a PNG data URL. */
    capture(width: number, height: number) {
      const keep = [w, h, renderer.getPixelRatio()] as const;
      setSize(width, height, 1);
      frame(0); frame(0);
      const url = renderer.domElement.toDataURL("image/png");
      setSize(keep[0], keep[1], keep[2]);
      return url;
    },
    dispose() {
      scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mt)) mt.forEach(x => x.dispose()); else mt?.dispose(); });
      composer.dispose(); renderer.dispose();
    },
  };
}
