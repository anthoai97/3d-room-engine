// Plan geometry on the floor plane: points are [x, z] in metres, north is -z (the top of a plan).
export type Pt = [number, number];
export type Dir = 'N' | 'E' | 'S' | 'W';

export function polyInfo(pts: Pt[]) {
  let area = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  pts.forEach(([x1, z1], i) => {
    const [x2, z2] = pts[(i + 1) % pts.length];
    area += x1 * z2 - x2 * z1;
    minX = Math.min(minX, x1); maxX = Math.max(maxX, x1);
    minZ = Math.min(minZ, z1); maxZ = Math.max(maxZ, z1);
  });
  return { sign: Math.sign(area), area: Math.abs(area) / 2, minX, maxX, minZ, maxZ };
}

export function inside(pts: Pt[], x: number, z: number) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

// Direction a wall faces from inside the room (its outward normal), rounded to the compass.
function dirOf(outX: number, outZ: number): Dir {
  return Math.abs(outX) > Math.abs(outZ) ? (outX > 0 ? 'E' : 'W') : (outZ > 0 ? 'S' : 'N');
}

export interface Edge {
  i: number;
  x1: number; z1: number; x2: number; z2: number;
  mx: number; mz: number; // midpoint
  dx: number; dz: number; // unit direction from point i to point i + 1
  nx: number; nz: number; // unit normal pointing into the room
  len: number;
  rot: number; // y rotation that lines a group's local x up with the edge
  r0: boolean; r1: boolean; // start / end vertex is a reflex (inward-pointing) corner
  dir: Dir; // which way the wall faces, seen from inside the room
}

// One entry per polygon edge.
export function edges(pts: Pt[]): Edge[] {
  const { sign } = polyInfo(pts), n = pts.length;
  const reflex = pts.map((b, i) => {
    const a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    return cross !== 0 && Math.sign(cross) !== sign;
  });
  return pts.map(([x1, z1], i) => {
    const [x2, z2] = pts[(i + 1) % n];
    const len = Math.hypot(x2 - x1, z2 - z1), dx = (x2 - x1) / len, dz = (z2 - z1) / len;
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    let nx = -dz, nz = dx;
    if (!inside(pts, mx + nx * 0.05, mz + nz * 0.05)) { nx = -nx; nz = -nz; }
    return { i, x1, z1, x2, z2, mx, mz, dx, dz, nx, nz, len, rot: Math.atan2(-dz, dx), r0: reflex[i], r1: reflex[(i + 1) % n], dir: dirOf(-nx, -nz) };
  });
}

// A wall read the way you read a plan: it starts at its west end (north/south walls) or its north end (east/west walls).
export interface WallFrame {
  sx: number; sz: number; // start point
  tx: number; tz: number; // unit tangent, start -> end
  nx: number; nz: number; // into the room
  len: number;
  startReflex: boolean; endReflex: boolean;
}
export function wallFrame(e: Edge): WallFrame {
  const horizontal = e.dir === 'N' || e.dir === 'S';
  const flip = horizontal ? e.dx < 0 : e.dz < 0;
  return flip
    ? { sx: e.x2, sz: e.z2, tx: -e.dx, tz: -e.dz, nx: e.nx, nz: e.nz, len: e.len, startReflex: e.r1, endReflex: e.r0 }
    : { sx: e.x1, sz: e.z1, tx: e.dx, tz: e.dz, nx: e.nx, nz: e.nz, len: e.len, startReflex: e.r0, endReflex: e.r1 };
}

// Distance from a point to a segment, and how far along the segment its closest point is.
export function toSegment(px: number, pz: number, x1: number, z1: number, x2: number, z2: number) {
  const vx = x2 - x1, vz = z2 - z1, l2 = vx * vx + vz * vz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - x1) * vx + (pz - z1) * vz) / l2)) : 0;
  return { dist: Math.hypot(px - (x1 + vx * t), pz - (z1 + vz * t)), t };
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt) {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
export function selfIntersects(pts: Pt[]) {
  const n = pts.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
  }
  return false;
}

// A rectangle on the floor: centre, size along its own x (w) and z (d), turned by rot like an Object3D's rotation.y.
export interface Rect { x: number; z: number; w: number; d: number; rot: number }

export function corners(r: Rect): Pt[] {
  const c = Math.cos(r.rot), s = Math.sin(r.rot);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const lx = u * r.w / 2, lz = v * r.d / 2;
    return [r.x + lx * c + lz * s, r.z - lx * s + lz * c] as Pt;
  });
}

// How deep two rectangles overlap (0 when they don't), by separating axes.
export function overlap(a: Rect, b: Rect) {
  const pa = corners(a), pb = corners(b);
  let depth = Infinity;
  for (const r of [a, b]) for (const [ax, az] of [[Math.cos(r.rot), -Math.sin(r.rot)], [Math.sin(r.rot), Math.cos(r.rot)]]) {
    const proj = (ps: Pt[]) => ps.map(([x, z]) => x * ax + z * az);
    const A = proj(pa), B = proj(pb);
    const d = Math.min(Math.max(...A), Math.max(...B)) - Math.max(Math.min(...A), Math.min(...B));
    if (d <= 0) return 0;
    depth = Math.min(depth, d);
  }
  return depth;
}

// Size of a turned rectangle measured along a direction at angle `rel` from its own axes.
export function extents(w: number, d: number, rel: number) {
  const c = Math.abs(Math.cos(rel)), s = Math.abs(Math.sin(rel));
  return { along: w * c + d * s, across: w * s + d * c };
}

// y rotation that turns an object's front (+z) to face along (x, z)
export const yawTo = (x: number, z: number) => Math.atan2(x, z);
export const FACE: Record<Dir, number> = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };
