import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { shade } from './materials';

// Bakes every mesh under `root` (except inside `skip`) into one mesh per material look.
// Hundreds of little boxes become a handful of draw calls.
function materialKey(m: THREE.MeshStandardMaterial) {
  return [m.type, m.side, m.color?.getHex(), m.opacity, m.transparent, m.roughness, m.metalness,
    m.emissive?.getHex(), m.emissiveIntensity, m.map?.uuid ?? ''].join('|');
}

export function mergeMeshes(root: THREE.Object3D, skip = new Set<THREE.Object3D>()) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const merged: THREE.Object3D[] = [];
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (let q: THREE.Object3D | null = o; q && q !== root; q = q.parent) if (skip.has(q)) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const key = materialKey(material);
    if (!buckets.has(key)) buckets.set(key, { material, geos: [] });
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
    buckets.get(key)!.geos.push(geo);
    merged.push(o);
  });
  merged.forEach(o => o.removeFromParent());
  for (const { material, geos } of buckets.values()) {
    const geo = mergeGeometries(geos);
    if (geo) root.add(shade(new THREE.Mesh(geo, material)));
  }
}
