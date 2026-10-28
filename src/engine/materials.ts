// Palette, procedural textures and the small box/cylinder/sphere helpers everything is built from.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SWATCHES } from '../layout/items';

export const C = {
  white: 0xf6f4f0, wall: 0xddd5c9, facade: 0xebe7e0, cap: 0x3b3936, offwhite: 0xebe6de, light: 0xdedbd6, grey: 0xa4a3a1, dark: 0x2a2a2e, black: 0x1a1a1c,
  wood: 0xcaa074, darkwood: 0x8a6142, green: 0x2f6a47, leaf: 0x5b8f52, steel: 0xbfc3c7,
};
export const CAP_OPEN = 0xf1ede6; // wall top over doorways and glass doors (dark everywhere else)
export const PINK = 0xe5177e;
export const ENV = 0.55; // how much the soft environment light counts vs. the sun

function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
const once = <T,>(make: () => T) => { let v: T | undefined; return () => (v ??= make()); };

// Dark walnut boards: long narrow planks (~11 cm at a 1.8 m repeat), reddish-brown tones, fine grain.
// `gap` draws the dark joints; decking gets wider open gaps. Planks wrap at the edge so it tiles seamlessly.
function walnutTex(gap: number) {
  return canvasTex(1024, (ctx, s) => {
    const rows = 16, h = s / rows;
    const wrapped = (draw: (dx: number) => void) => { draw(0); draw(-s); };
    ctx.fillStyle = '#1c120d';
    ctx.fillRect(0, 0, s, s);
    for (let r = 0; r < rows; r++) {
      const start = Math.random() * s;
      for (let x = start; x < start + s;) {
        const len = Math.min(s * (0.45 + Math.random() * 0.5), start + s - x);
        const tone = `hsl(${18 + Math.random() * 8}, ${24 + Math.random() * 8}%, ${27 + Math.random() * 8}%)`;
        wrapped(dx => {
          ctx.fillStyle = tone;
          ctx.fillRect(x + dx + gap / 2, r * h + gap, len - gap, h - gap);
          for (let g = 0; g < 10; g++) {
            const y = r * h + gap + 1 + Math.random() * (h - gap - 2);
            ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(20,10,5,0.25)' : 'rgba(170,110,70,0.12)';
            ctx.lineWidth = 0.6 + Math.random();
            ctx.beginPath();
            ctx.moveTo(x + dx + gap, y);
            ctx.bezierCurveTo(x + dx + len * 0.3, y + (Math.random() - 0.5) * 3, x + dx + len * 0.7, y + (Math.random() - 0.5) * 3, x + dx + len - gap, y);
            ctx.stroke();
          }
        });
        x += len;
      }
    }
  });
}
export const woodTex = once(() => walnutTex(1.5));
export const deckTex = once(() => walnutTex(5));
export const tileTex = once(() => canvasTex(256, (ctx, s) => {
  ctx.fillStyle = '#8e8d8a';
  ctx.fillRect(0, 0, s, s);
  const n = 4, t = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    ctx.fillStyle = `hsl(40, 4%, ${64 + Math.random() * 5}%)`;
    ctx.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
  }
}));
const plaidTex = once(() => canvasTex(256, (ctx, s) => {
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, s, s);
  const n = 8, t = s / n;
  ctx.fillStyle = 'rgba(20,20,22,0.55)';
  for (let i = 0; i < n; i += 2) { ctx.fillRect(i * t, 0, t, s); ctx.fillRect(0, i * t, s, t); }
}));

export function texMat(base: THREE.Texture, rx: number, ry: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  const t = base.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, envMapIntensity: ENV, ...extra });
}

export type Paint = number | THREE.Material;

// Every call makes its own material; meshes that look the same are merged later anyway.
export function M(c: Paint, extra?: THREE.MeshStandardMaterialParameters): THREE.Material {
  return typeof c === 'number' ? new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, envMapIntensity: ENV, ...extra }) : c;
}

// A house-file colour (swatch name or #rrggbb) as paint; `fallback` when none was given.
export function paint(color: string | undefined, fallback: Paint): Paint {
  if (!color) return fallback;
  if (color === 'plaid') return texMat(plaidTex(), 2, 2);
  if (color.startsWith('#')) return parseInt(color.slice(1), 16);
  return SWATCHES[color as keyof typeof SWATCHES] ?? fallback;
}

export function shade<T extends THREE.Object3D>(m: T): T {
  m.castShadow = m.receiveShadow = true;
  return m;
}
// Box resting on y (its bottom), centred on x / z
export function B(p: THREE.Object3D, w: number, h: number, d: number, c: Paint, x = 0, y = 0, z = 0) {
  const m = shade(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)));
  m.position.set(x, y + h / 2, z);
  p.add(m);
  return m;
}
// Soft-edged box, for the toy-like look of upholstery, mattresses and cushions; resting on y like B
export function RB(p: THREE.Object3D, w: number, h: number, d: number, c: Paint, x = 0, y = 0, z = 0, r = 0.04) {
  const radius = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const m = shade(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), M(c)));
  m.position.set(x, y + h / 2, z);
  p.add(m);
  return m;
}
// Cylinder resting on y; r = top radius, r2 = bottom radius
export function Cy(p: THREE.Object3D, r: number, h: number, c: Paint, x = 0, y = 0, z = 0, r2 = r) {
  const m = shade(new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, 28), M(c)));
  m.position.set(x, y + h / 2, z);
  p.add(m);
  return m;
}
export function Sp(p: THREE.Object3D, r: number, c: Paint, x: number, y: number, z: number) {
  const m = shade(new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), M(c)));
  m.position.set(x, y, z);
  p.add(m);
  return m;
}
// Sub-group at x / z turned by rot; furniture is built facing +z with its back toward -z
export function piece(p: THREE.Object3D, x: number, z: number, rot = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  p.add(g);
  return g;
}
