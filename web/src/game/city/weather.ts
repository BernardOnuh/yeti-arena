// Sunburn City's weather and building shading, as small shader patches on three.js's standard materials:
// - snow cover: snow settles on every upward-facing surface (roofs, roads, palms, car roofs) as the storm builds
// - building facades: real plaster with "interior mapping" windows, a 3D room behind every pane, many of them lit
// - snowfall: drifting flakes in a box that follows the camera
// All share one set of uniforms, so the weather can blend smoothly between sunny and snowing.
import * as THREE from "three";

export const weather = {
  snow: { value: 0 },      // 0 sunny … 1 snowing (also how much snow has settled)
  lit: { value: 0.15 },    // the share of windows with the lights on
  glow: { value: 0.6 },    // how bright lit rooms look (brighter under the dark snow sky)
  time: { value: 0 },
};

// world-space normal, for anything that depends on which way a surface faces
const NORMAL_VARYING = `
  vec3 wN = inverseTransformDirection(transformedNormal, viewMatrix);
  vWorldN = wN;
  vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #ifdef USE_INSTANCING
    vWorldP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #endif
`;
const SNOW_FN = `
  float snowCover(vec3 n, vec3 p) {
    float grain = sin(p.x * 3.1 + p.z * 1.7) * sin(p.z * 2.3 - p.x * 1.1) * 0.08;
    return smoothstep(0.5 + grain, 0.82 + grain, n.y) * uSnow;
  }
`;

const patched = new WeakSet<THREE.Material>();

/** Lets snow settle on a standard material's upward-facing surfaces. Materials with their own shader patches are skipped. */
export function snowify(root: THREE.Object3D) {
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial) || m.transparent || patched.has(m) || m.userData.noSnow) continue;
      if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) continue; // already has its own shader patch (the Yeti's fur)

      patched.add(m);
      m.onBeforeCompile = s => {
        s.uniforms.uSnow = weather.snow;
        s.vertexShader = s.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vWorldN; varying vec3 vWorldP;")
          .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n" + NORMAL_VARYING);
        s.fragmentShader = s.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vWorldN; varying vec3 vWorldP; uniform float uSnow;\n" + SNOW_FN)
          .replace("#include <map_fragment>", "#include <map_fragment>\nfloat sc = snowCover(normalize(vWorldN), vWorldP);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), sc);")
          .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.72, sc);")
          .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, sc);");
      };
      m.customProgramCacheKey = () => "snow-cover";
      m.needsUpdate = true;
    }
  });
}

/**
 * A facade material: tinted plaster with windows laid out on the building's UVs (one UV unit = 5.5 m = 2 x 2 windows).
 * Behind each pane, interior mapping traces the view ray into a room (back wall, side walls, floor, ceiling).
 */
export function facadeMaterial(color: string, tex: { diff: THREE.Texture; nor: THREE.Texture; rough: THREE.Texture }) {
  const m = new THREE.MeshStandardMaterial({ color, map: tex.diff, normalMap: tex.nor, roughnessMap: tex.rough, normalScale: new THREE.Vector2(0.7, 0.7), envMapIntensity: 1.3 });
  m.userData.noSnow = true; // has its own snow on the roof, below
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, { uSnow: weather.snow, uLit: weather.lit, uGlow: weather.glow });
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorldN; varying vec3 vWorldP; varying vec2 vWinUv;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n" + NORMAL_VARYING + "\nvWinUv = uv;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vWorldN; varying vec3 vWorldP; varying vec2 vWinUv; uniform float uSnow, uLit, uGlow;
        ${SNOW_FN}
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float winMask, frameMask; vec3 roomLight;
        vec3 interior(vec2 cell, vec2 local, vec3 N, vec3 P) {
          // the room: one window cell wide and tall (2.75 m), 3 m deep; trace the view ray into it
          vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N));
          vec3 V = normalize(P - cameraPosition);
          vec3 d = vec3(dot(V, T) / 2.75, V.y / 2.75, max(dot(V, -N), 1e-3) / 3.0);
          vec3 o = vec3(local, 0.0);
          float tx = d.x > 0.0 ? (1.0 - o.x) / d.x : -o.x / min(d.x, -1e-4);
          float ty = d.y > 0.0 ? (1.0 - o.y) / d.y : -o.y / min(d.y, -1e-4);
          float tz = 1.0 / d.z;
          float t = min(tx, min(ty, tz)); vec3 hit = o + d * t;
          float seed = h21(cell + N.xz * 17.0);
          vec3 wall = mix(vec3(0.82, 0.7, 0.55), vec3(0.6, 0.72, 0.82), h21(cell * 1.7 + 3.1));
          vec3 c;
          if (t == tz) c = wall * (0.75 + 0.25 * hit.y) * (0.85 + 0.15 * step(0.5, fract(hit.x * 3.0 + seed)) * step(0.55, hit.y));   // back wall, with a picture or shelf
          else if (t == ty) c = d.y < 0.0 ? vec3(0.36, 0.24, 0.15) * (0.8 + 0.2 * step(0.5, fract(hit.x * 6.0))) : vec3(0.92, 0.9, 0.86) * (1.0 + 0.6 * exp(-dot(hit.xz - 0.5, hit.xz - 0.5) * 12.0)); // floorboards / ceiling lamp
          else c = wall * 0.72;                                                                                                         // side walls
          float on = step(seed, uLit);
          roomLight = c * mix(0.05, 1.0, on) * mix(vec3(0.6, 0.7, 0.85), vec3(1.0, 0.78, 0.52), on);
          if (h21(cell * 2.3 + 9.0) < 0.3 && local.y > 0.62 + 0.2 * h21(cell + 5.0)) roomLight = vec3(0.85, 0.78, 0.7) * mix(0.08, 0.9, on); // a half-drawn blind
          return roomLight;
        }`)
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec3 Nw = normalize(vWorldN);
        float isWall = 1.0 - step(0.6, abs(Nw.y));
        vec2 g = vWinUv * 2.0, cell = floor(g), wu = fract(g);
        float inner = step(0.22, wu.x) * step(wu.x, 0.81) * step(0.14, wu.y) * step(wu.y, 0.81);
        float outer = step(0.19, wu.x) * step(wu.x, 0.84) * step(0.11, wu.y) * step(wu.y, 0.84);
        winMask = inner * isWall; frameMask = (outer - inner) * isWall;
        roomLight = vec3(0.0);
        if (winMask > 0.5) interior(cell, vec2((wu.x - 0.22) / 0.59, (wu.y - 0.14) / 0.67), Nw, vWorldP);
        float sc = snowCover(Nw, vWorldP) + step(0.5, frameMask) * step(0.8, wu.y) * uSnow * 0.8;   // snow on roofs and window ledges
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.93, 0.9), frameMask * (1.0 - step(0.8, wu.y)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.015, 0.02, 0.03), winMask);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), clamp(sc, 0.0, 1.0));`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.035, winMask);")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += roomLight * winMask * uGlow;");
  };
  m.customProgramCacheKey = () => "facade";
  return m;
}

/** Falling snow: soft round flakes in a 70 m box around the camera, drifting with a gentle wind. */
export function snowfall(count = 14000) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos.set([(Math.random() - 0.5) * 70, Math.random() * 34, (Math.random() - 0.5) * 70], i * 3); seed[i] = Math.random(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const cam = { value: new THREE.Vector3() };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: weather.time, uSnow: weather.snow, uCam: cam, uScale: { value: 1 } },
    vertexShader: `attribute float aSeed; uniform float uTime, uSnow, uScale; uniform vec3 uCam; varying float vFade;
      void main() {
        vec3 box = vec3(70.0, 34.0, 70.0);
        vec3 p = position + vec3(sin(uTime * 0.7 + aSeed * 40.0) * 0.8 + uTime * 1.6, -uTime * (1.1 + aSeed * 0.9), cos(uTime * 0.5 + aSeed * 30.0) * 0.6 + uTime * 0.5);
        p = uCam + mod(p - uCam + box * 0.5, box) - box * 0.5; p.y = max(p.y, uCam.y - 17.0);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.09 + aSeed * 0.1) * uScale * 300.0 / -mv.z;
        vFade = uSnow * smoothstep(34.0, 6.0, -mv.z) * smoothstep(0.4, 1.5, -mv.z);
      }`,
    fragmentShader: `varying float vFade;
      void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0), vFade * smoothstep(0.5, 0.15, d) * 0.9); }`,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false;
  return { points, follow(camera: THREE.Camera, pixelHeight: number) { cam.value.copy(camera.position); mat.uniforms.uScale.value = pixelHeight / 900; } };
}
