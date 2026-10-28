// Walls with real openings: windows with frames and curtains, open doors, archways, sliding glass doors, pony walls.
// Where each stretch of wall goes comes from layout/walls.ts: walls between rooms are built once, centred on the
// line between them; outside walls sit just inside the room's outline, with the facade skin outside.
import * as THREE from 'three';
import { DOOR_H, LOW_H, PONY_H, SHARED_T, T, WALL_H, WIN_HEAD, WIN_SILL } from '../layout/constants';
import { type Edge, type Pt, edges } from '../layout/geometry';
import { type WallPiece, doorLeaves } from '../layout/walls';
import type { ResolvedOpening } from '../layout/resolve';
import { B, C, CAP_OPEN, M, shade } from './materials';

export interface WallSegment { x: number; z: number; dx: number; dz: number; len: number }

export interface WallContext {
  // doors / windows on an edge, with `a`..`b` = their span measured from the edge's start
  openingsOnEdge: (floor: number, e: Edge) => (ResolvedOpening & { a: number; b: number })[];
  inHouse: (floor: number, x: number, z: number) => boolean;
  glassBlocks: WallSegment[][]; // per floor: the closed half of each sliding door (glass or closet), for walk-mode collisions
}

const LEAF = 0xe9e5de; // door leaves and closet doors

// Distance from (x, z) along (dx, dz) to the first edge of the polygon it meets.
function rayToEdge(pts: Pt[], x: number, z: number, dx: number, dz: number) {
  let best = Infinity;
  for (const f of edges(pts)) {
    const den = dx * f.dz - dz * f.dx;
    if (Math.abs(den) < 1e-9) continue;
    const qx = f.x1 - x, qz = f.z1 - z;
    const t = (qx * f.dz - qz * f.dx) / den, s = (qx * dz - qz * dx) / den;
    if (t > 0.02 && s >= -1e-6 && s <= f.len + 1e-6) best = Math.min(best, t);
  }
  return best;
}

// A gathered curtain: a plane rippled into soft vertical folds, hanging from y0 to y1, centred on x.
function drape(parent: THREE.Object3D, x: number, z: number, w: number, y0: number, y1: number) {
  const geo = new THREE.PlaneGeometry(w, y1 - y0, Math.max(8, Math.round(w * 40)), 1);
  const pos = geo.attributes.position, folds = Math.max(2, Math.round(w / 0.07));
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / w + 0.5) * Math.PI * 2 * folds) * 0.022);
  geo.computeVertexNormals();
  const m = shade(new THREE.Mesh(geo, M(0xf1ede6, { side: THREE.DoubleSide, roughness: 0.95 })));
  m.position.set(x, (y0 + y1) / 2, z);
  parent.add(m);
}

// Builds one stretch of wall, with holes for the doors / windows on it.
// The group's local x runs along the edge (measured from the edge's start) and local z across it,
// so scaling y cuts the whole wall down.
export function buildWall(parent: THREE.Object3D, piece: WallPiece, ctx: WallContext) {
  const { owner: r, other, e, t0, t1 } = piece;
  const shared = !!other;
  const outdoor = r.outdoor && (!other || other.outdoor);
  const H = outdoor ? LOW_H : WALL_H;
  const thick = shared ? SHARED_T : T;
  const off = shared ? 0 : T / 2 + 0.004; // shared: on the line; outside: just inside the owner room
  const x1 = e.x1, z1 = e.z1, f = r.floor;
  const at = (t: number): Pt => [x1 + e.dx * t, z1 + e.dz * t];
  const eg = new THREE.Group();
  eg.position.set(x1 + e.nx * off, 0, z1 + e.nz * off);
  eg.rotation.y = e.rot;
  parent.add(eg);
  const inSign = Math.sign(-e.nx * e.dz + e.nz * e.dx); // +1 when local +z points into the owner room
  const trim = 0xcfc6b8;

  // How far to run past each end. Outside walls close reflex (inward) corners; shared walls run on into a
  // junction with other inner walls, but never out through the facade.
  const beyondInside = (t: number, dir: number) => [-1, 1].every(s => {
    const [x, z] = at(t + dir * 0.05);
    return ctx.inHouse(f, x + e.nx * s * (thick / 2 - 0.01), z + e.nz * s * (thick / 2 - 0.01));
  });
  const ext0 = shared ? (t0 < 0.01 && beyondInside(t0, -1) ? thick / 2 : 0) : (t0 < 0.01 && e.r0 ? T : 0);
  const ext1 = shared ? (t1 > e.len - 0.01 && beyondInside(t1, 1) ? thick / 2 : 0) : (t1 > e.len - 0.01 && e.r1 ? T : 0);
  const from = t0 - ext0, to = t1 + ext1;

  const holes = ctx.openingsOnEdge(f, e).filter(h => (h.a + h.b) / 2 > t0 && (h.a + h.b) / 2 < t1);
  // A pony wall that stops a hand's width short of a corner runs on to it: a full-height sliver of wall
  // a few centimetres wide isn't something anyone builds.
  holes.forEach((h, i) => {
    if (h.type !== 'pony') return;
    const before = i ? holes[i - 1].b : from, after = i < holes.length - 1 ? holes[i + 1].a : to;
    if (h.a - before < 0.3) h.a = before;
    if (after - h.b < 0.3) h.b = after;
  });

  // Outside walls get a continuous facade skin: it hides the joints between rooms and runs from below the
  // floor slab to the wall top, closing the gap between storeys. It wraps the house corners.
  const exterior = !shared && !r.outdoor;
  const SKIN = 0.024, SKIN_Y0 = -0.17, skinZ = -inSign * (off + SKIN / 2), wrap = off + SKIN;
  const corner = (t: number, dir: number) => {
    const [x, z] = at(t);
    return !ctx.inHouse(f, x + e.dx * 0.05 * dir + e.nx * 0.05, z + e.dz * 0.05 * dir + e.nz * 0.05);
  };
  const s0 = corner(t0, -1) ? wrap : 0, s1 = corner(t1, 1) ? wrap : 0;
  const skin = (a: number, b: number, y0: number, y1: number) => {
    if (!exterior || b - a < 0.001 || y1 <= y0) return;
    if (a <= from + 1e-6) a -= s0;
    if (b >= to - 1e-6) b += s1;
    B(eg, b - a, y1 - y0, SKIN, C.facade, (a + b) / 2, y0, skinZ);
  };

  const solid = (a: number, b: number) => {
    if (b - a < 0.001) return;
    const mid = (a + b) / 2;
    B(eg, b - a, H, thick, C.wall, mid);
    skin(a, b, SKIN_Y0, H + 0.05);
    B(eg, b - a, 0.05, thick, C.cap, mid, H);
    if (outdoor) B(eg, b - a, 0.5, 0.03, M(0xcfe8f2, { transparent: true, opacity: 0.3, roughness: 0.05 }), mid, H + 0.05);
  };

  // An opening that starts at the stretch's end takes the corner run-on with it: built alone, the run-on would
  // stand as a thin full-height post (two open passes meeting at a corner).
  let cur = from;
  for (const h of holes) {
    if (h.a > t0 + 0.01) solid(cur, h.a);
    cur = h.b;
    if (outdoor) continue;
    const w = h.b - h.a, mid = (h.a + h.b) / 2;
    if (h.type === 'pony') {
      // low bar wall with a wood top
      B(eg, w, PONY_H, thick, C.wall, mid);
      B(eg, w, 0.04, thick + 0.14, C.wood, mid, PONY_H);
      continue;
    }
    if (h.type === 'pass' && (h.full || (h.head ?? DOOR_H) >= H)) continue; // fully open: no lintel, no cap
    B(eg, w, 0.05, thick, h.type === 'window' ? C.cap : CAP_OPEN, mid, H);
    {
      const head = h.type === 'glass' ? H : h.head ?? (h.type === 'window' ? WIN_HEAD : DOOR_H);
      skin(h.a, h.b, SKIN_Y0, h.type === 'window' ? h.sill ?? WIN_SILL : 0);
      skin(h.a, h.b, head, H + 0.05);
    }
    if (h.type === 'glass') {
      // floor-to-ceiling sliding glass door: the sliding panel is stacked on the fixed one, so half is open
      const pw = w / 2 + 0.03, gh = H - 0.08, glass = M(0xd6eaf5, { transparent: true, opacity: 0.28, roughness: 0.05 });
      B(eg, pw, gh, 0.02, glass, h.a + pw / 2, 0.04, -0.025);
      B(eg, pw, gh, 0.02, glass, h.a + pw / 2 + 0.03, 0.04, 0.025);
      for (const [fw, fh, fx, fy, fz] of [[0.05, H, h.a + 0.025, 0, 0], [0.05, H, h.b - 0.025, 0, 0], [w, 0.05, mid, H - 0.05, 0],
        [w, 0.02, mid, 0, 0], [0.04, gh, h.a + pw, 0.04, -0.025], [0.04, gh, h.a + pw + 0.03, 0.04, 0.025]])
        B(eg, fw, fh, 0.06, C.dark, fx, fy, fz);
      // sheer full-height curtains on the indoor side: one drawn over the closed half, one gathered beside the opening
      const cz = inSign * (thick / 2 + 0.1);
      drape(eg, h.a + 0.3, cz, 0.5, 0.04, H - 0.14);
      drape(eg, h.b + 0.16, cz, 0.3, 0.04, H - 0.14);
      B(eg, w + 0.7, 0.025, 0.025, C.dark, mid, H - 0.14, cz);
      const [gx, gz] = at(h.a);
      (ctx.glassBlocks[f] ??= []).push({ x: gx, z: gz, dx: e.dx, dz: e.dz, len: pw + 0.03 });
      continue;
    }
    const head = h.head ?? (h.type === 'window' ? WIN_HEAD : DOOR_H);
    B(eg, w, H - head, thick, C.wall, mid, head);
    if (h.type === 'window') {
      const sill = h.sill ?? WIN_SILL;
      B(eg, w, sill, thick, C.wall, mid, 0);
      B(eg, w, head - sill, 0.02, M(0xdcecf7, { roughness: 0.1, emissive: 0xcfe6ff, emissiveIntensity: 0.55 }), mid, sill);
      for (const [fw, fh, fx, fy] of [[w, 0.04, mid, sill], [w, 0.04, mid, head - 0.04], [0.04, head - sill, h.a + 0.02, sill], [0.04, head - sill, h.b - 0.02, sill], [0.03, head - sill, mid, sill]])
        B(eg, fw, fh, 0.05, C.dark, fx, fy);
      B(eg, w + 0.1, 0.03, thick + 0.08, C.wall, mid, sill - 0.03);
      // curtains gathered at both sides on the room side, hanging from a thin rod
      const cz = inSign * (thick / 2 + 0.09);
      for (const sd of [-1, 1]) drape(eg, mid + sd * (w / 2 + 0.12), cz, 0.3, Math.max(0.05, sill - 0.25), H - 0.14);
      B(eg, w + 0.7, 0.025, 0.025, C.dark, mid, H - 0.14, cz);
    } else {
      for (const x of [h.a + 0.03, h.b - 0.03]) B(eg, 0.06, head, thick + 0.04, trim, x);
      B(eg, w, 0.06, thick + 0.04, trim, mid, head - 0.06);
      const into = h.type === 'door' ? (h.swing === r.name ? r : other && h.swing === other.name ? other : null) : null;
      if (!into) continue;
      const side = into === r ? inSign : -inSign, leaves = doorLeaves(h.w, into), open = w - 0.12;
      if (!leaves) {
        // sliding closet doors: two panels in the wall, the front one slid over the back one, so half is open
        const pw = open / 2 + 0.02;
        for (const [px, pz] of [[h.a + 0.06 + pw / 2, -0.022], [h.a + 0.06 + pw / 2 + 0.03, 0.022]]) {
          B(eg, pw, head - 0.08, 0.025, LEAF, px, 0.02, pz);
          B(eg, 0.02, 0.22, 0.04, C.dark, px + pw / 2 - 0.06, 0.95, pz);
        }
        const [gx, gz] = at(h.a);
        (ctx.glassBlocks[f] ??= []).push({ x: gx, z: gz, dx: e.dx, dz: e.dz, len: pw + 0.09 });
        continue;
      }
      // open door leaves, hinged at the jambs and swung ~75° into the room they open into, or as far as the
      // room leaves space for (a shallow closet)
      const lw = open / leaves - 0.005;
      const inward = into === r ? 1 : -1;
      const depth = Math.min(...[h.a + 0.1, mid, h.b - 0.1].map(t => {
        const [x, z] = at(t);
        return rayToEdge(into.pts, x, z, e.nx * inward, e.nz * inward);
      })) - thick / 2 - 0.15;
      const swing = lw * Math.sin(1.3) <= depth ? 1.3 : Math.asin(Math.min(1, Math.max(0.25, depth / lw)));
      for (const end of leaves === 2 ? [1, -1] : [1]) {
        const hinge = new THREE.Group();
        hinge.position.set(end > 0 ? h.a + 0.06 : h.b - 0.06, 0, side * thick / 2);
        hinge.rotation.y = -side * end * swing;
        eg.add(hinge);
        B(hinge, lw, head - 0.07, 0.04, LEAF, end * lw / 2, 0, side * 0.02);
        B(hinge, 0.12, 0.02, 0.07, C.dark, end * (lw - 0.1), 1.0, side * 0.02);
      }
    }
  }
  if (cur < t1 - 0.01) solid(cur, to);
  // centre of the stretch, for the camera cutaway
  const [cx, cz] = at((t0 + t1) / 2);
  return { group: eg, x: cx + e.nx * off, z: cz + e.nz * off };
}
