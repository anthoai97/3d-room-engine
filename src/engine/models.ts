// Catalog models: GLBs downloaded from the Livinit catalog into public/assets/models, listed in manifest.json.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Catalog } from '../layout/items';
import { prepare } from './frame';
import { ENV } from './materials';

export async function loadCatalog(): Promise<Catalog> {
  try {
    const res = await fetch('assets/models/manifest.json');
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

// Models are meshopt-compressed with WebP textures (gltf-transform optimize).
// Meshopt decodes in background workers and images decode off the main thread, so loading barely touches
// the frame loop.
(MeshoptDecoder as typeof MeshoptDecoder & { useWorkers: (n: number) => void }).useWorkers(4); // missing from the r160 types
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const templates = new Map<string, Promise<THREE.Group>>();

// Same as the Livinit viewer: which raw model axis faces front for each `front_view`.
const frontViewToYaw = (fv?: number) => [-Math.PI / 2, 0, Math.PI / 2, Math.PI][(fv ?? 0) % 4];

// Loads a slot once: front turned to +z, stretched to the catalog size, centred and standing on y = 0.
// Models are decoded one at a time, so the little main-thread work each needs is spread out.
let decodingChain: Promise<unknown> = Promise.resolve();
export function loadModel(slot: string, catalog: Catalog) {
  if (!templates.has(slot)) {
    const info = catalog[slot];
    const file = fetch(info.file).then(r => {
      if (!r.ok) throw new Error(`${info.file}: ${r.status}`);
      return r.arrayBuffer();
    });
    const template = file.then(data => {
      const job = decodingChain.then(() => loader.parseAsync(data, info.file.replace(/[^/]*$/, ''))).then(gltf => {
        const lights: THREE.Object3D[] = [];
        gltf.scene.traverse(o => {
          if ((o as THREE.Light).isLight) lights.push(o);
          // glass-like transmission needs an extra render pass per frame; plain materials are plenty here
          const mesh = o as THREE.Mesh;
          for (const m of [mesh.material ?? []].flat() as THREE.MeshPhysicalMaterial[]) {
            if (m.transmission) m.transmission = 0;
            m.envMapIntensity = ENV;
          }
        });
        lights.forEach(l => l.removeFromParent());
        const turn = new THREE.Group();
        turn.rotation.y = -Math.PI / 2 - frontViewToYaw(info.frontView);
        turn.add(gltf.scene);
        const fit = new THREE.Group();
        fit.add(turn);
        const size = new THREE.Box3().setFromObject(fit).getSize(new THREE.Vector3());
        fit.scale.set(info.width / (size.x || 1), info.height / (size.y || 1), info.depth / (size.z || 1));
        const box = new THREE.Box3().setFromObject(fit);
        const c = box.getCenter(new THREE.Vector3());
        fit.position.set(-c.x, -box.min.y, -c.z);
        return prepare(fit).then(() => fit); // clones share these shaders and textures
      });
      decodingChain = job.catch(() => {});
      return job;
    });
    templates.set(slot, template);
  }
  return templates.get(slot)!;
}
