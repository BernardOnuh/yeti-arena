// The parts of N8AO (ambient occlusion for three.js) that Sunburn City uses; the package ships no type declarations.
declare module "n8ao" {
  import type { Camera, Color, Scene } from "three";
  import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: { aoRadius: number; distanceFalloff: number; intensity: number; color: Color; halfRes?: boolean; [key: string]: unknown };
    setQualityMode(mode: "Performance" | "Low" | "Medium" | "High" | "Ultra"): void;
    setSize(width: number, height: number): void;
  }
}
