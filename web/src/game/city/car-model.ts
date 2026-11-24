// The detailed car: "Car Concept" from the Khronos glTF sample assets (CC-BY 4.0, Eric Chadwick / Darmstadt Graphics
// Group), prepared for a game: turned to face +X, scaled to 4.3 m, set on the ground, and merged into one mesh per
// material (about 30 draw calls instead of ~100). Its licence plate texture is a Khronos logo and its tyre sidewalls
// carry embossed brand names, so the plate is replaced with our own and the sidewalls are made plain. The costly
// transmission glass is swapped for simple reflective glass. Paint colours are cloned per colour and cached.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const LENGTH = 4.3;

function plateTexture() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 128; const x = c.getContext("2d")!;
  x.fillStyle = "#f4f1e6"; x.fillRect(0, 0, 512, 128); x.strokeStyle = "#1d2b4a"; x.lineWidth = 8; x.strokeRect(6, 6, 500, 116);
  x.fillStyle = "#1d2b4a"; x.font = "bold 78px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("YETI 42", 256, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t;
}

export interface CarTemplate { make(color: string): THREE.Group }

export function loadCar(onReady: (t: CarTemplate) => void) {
  new GLTFLoader().load("/models/CarConcept.glb", gltf => {
    const root = gltf.scene; root.updateMatrixWorld(true);
    const plate = plateTexture();
    const glass = new THREE.MeshPhysicalMaterial({ color: "#1c2530", roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.55, envMapIntensity: 1.6, depthWrite: false });

    // collect every mesh, fixing materials on the way
    const meshes: THREE.Mesh[] = [];
    root.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      let mat = m.material as THREE.MeshPhysicalMaterial;
      if (/glass/i.test(mat.name) || (mat as THREE.MeshPhysicalMaterial).transmission > 0) mat = glass as THREE.MeshPhysicalMaterial;
      else {
        if (/license/i.test(mat.name)) { mat.map = plate; mat.emissiveMap = null; mat.needsUpdate = true; }
        if (/tireside/i.test(mat.name)) { mat.normalMap = null; mat.needsUpdate = true; }
        if ((mat as THREE.MeshPhysicalMaterial).iridescence) (mat as THREE.MeshPhysicalMaterial).iridescence = 0;
      }
      m.material = mat; meshes.push(m);
    });

    // orientation: length along +X, the headlights at the front
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
    const head = new THREE.Box3(); meshes.filter(m => /headlight/i.test((m.material as THREE.Material).name)).forEach(m => head.expandByObject(m));
    const fwd = new THREE.Vector3(); head.getCenter(fwd).sub(box.getCenter(new THREE.Vector3()));
    const turn = new THREE.Matrix4();
    if (size.z > size.x) turn.makeRotationY(fwd.z > 0 ? Math.PI / 2 : -Math.PI / 2);   // +Z front -> +X, or -Z front -> +X
    else if (fwd.x < 0) turn.makeRotationY(Math.PI);
    const k = LENGTH / Math.max(size.x, size.z);
    const fit = new THREE.Matrix4().makeScale(k, k, k).multiply(turn);
    const fitted = box.clone().applyMatrix4(fit), c = fitted.getCenter(new THREE.Vector3());
    const place = new THREE.Matrix4().makeTranslation(-c.x, -fitted.min.y, -c.z).multiply(fit);

    // merge per material (and per attribute layout, which merging requires)
    const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
    for (const m of meshes) {
      let g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(place, m.matrixWorld));
      if (!g.index) g = g.toNonIndexed(); // keep the shape of attribute sets consistent
      for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv", "tangent"].includes(name)) g.deleteAttribute(name);
      g.morphAttributes = {};
      const key = (m.material as THREE.Material).uuid + "|" + Object.keys(g.attributes).sort().join(",") + "|" + (g.index ? "i" : "n");
      if (!groups.has(key)) groups.set(key, { mat: m.material as THREE.Material, geos: [] });
      groups.get(key)!.geos.push(g);
    }
    const template = new THREE.Group();
    for (const { mat, geos } of groups.values()) {
      const merged = mergeGeometries(geos, false); if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = mat !== glass; mesh.receiveShadow = true; template.add(mesh);
    }
    if (process.env.NODE_ENV !== "production") {   // for the browser test: where the headlights ended up (front = +X)
      const lamps = template.children.filter(o => /headlight/i.test(((o as THREE.Mesh).material as THREE.Material).name));
      const hb = new THREE.Box3(); lamps.forEach(o => hb.expandByObject(o));
      (window as unknown as { __carCheck: object }).__carCheck = { headlightX: +hb.getCenter(new THREE.Vector3()).x.toFixed(2), size: new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3()).toArray().map(v => +v.toFixed(2)), meshes: template.children.length };
    }
    const paints = new Map<string, Map<THREE.Material, THREE.Material>>();
    onReady({
      make(color: string) {
        const car = template.clone();
        if (!paints.has(color)) paints.set(color, new Map());
        const cache = paints.get(color)!;
        car.traverse(o => {
          const m = o as THREE.Mesh; if (!m.isMesh) return;
          const mat = m.material as THREE.MeshPhysicalMaterial;
          if (!/^paint/i.test(mat.name)) return;
          if (!cache.has(mat)) { const p = mat.clone(); p.color = new THREE.Color(color); p.map = null; p.clearcoat = Math.max(p.clearcoat, 0.9); cache.set(mat, p); }
          m.material = cache.get(mat)!;
        });
        return car;
      },
    });
  });
}
