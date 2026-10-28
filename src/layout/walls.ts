// Where the walls go. Every room edge is split into stretches: a stretch shared with a neighbouring room is
// one interior wall centred on the line between them (SHARED_T thick, like a 2x4 stud wall); a stretch on the
// outside of the house is an exterior wall just inside the room's outline (WALL_IN to its inner face).
// Used by the 3D engine (to build walls), the placement solver (to know where a wall's face is) and the plan.
import { SHARED_T, WALL_IN } from './constants';
import { type Edge, type Pt, edges } from './geometry';
import type { ResolvedOpening } from './resolve';

export interface WallRoom { index: number; name: string; floor: number; outdoor: boolean; pts: Pt[]; type?: string }

// How a door opens: 0 = sliding closet doors (a wide door into a closet; nothing swings out), 1 = one hinged
// leaf, 2 = a pair of leaves meeting in the middle (wider than one door). The solver keeps the leaves' swing clear.
export function doorLeaves(w: number, into?: { type?: string }) {
  if (into?.type === 'closet' && w >= 1) return 0;
  return w > 1.2 ? 2 : 1;
}

// The doors, windows and openings on an edge, with `a`..`b` = their span measured from the edge's start.
export function openingsOnEdge(openings: ResolvedOpening[]) {
  return (floor: number, e: Edge) => openings.filter(o => o.floor === floor).map(o => {
    const t = (o.x - e.x1) * e.dx + (o.z - e.z1) * e.dz;
    const dist = Math.abs(-(o.x - e.x1) * e.dz + (o.z - e.z1) * e.dx);
    return dist < 0.05 && t > 0 && t < e.len ? { ...o, a: t - o.w / 2, b: t + o.w / 2 } : null;
  }).filter(o => o !== null).sort((p, q) => p.a - q.a);
}

// One stretch of wall: edge e of `owner`, from t0 to t1 along it (t measured from the edge's start).
export interface WallPiece { owner: WallRoom; other?: WallRoom; e: Edge; t0: number; t1: number }

export interface Span<R> { lo: number; hi: number; room: R }

// The parts of edge e that lie on one of the other rooms' edges, in order along e.
export function edgeSpans<R>(e: Edge, others: { room: R; edges: Edge[] }[]): Span<R>[] {
  const spans: Span<R>[] = [];
  for (const o of others) for (const f of o.edges) {
    if (Math.abs(e.dx * f.dz - e.dz * f.dx) > 1e-3) continue;
    if (Math.abs(-(f.x1 - e.x1) * e.dz + (f.z1 - e.z1) * e.dx) > 0.02) continue;
    const ta = (f.x1 - e.x1) * e.dx + (f.z1 - e.z1) * e.dz, tb = (f.x2 - e.x1) * e.dx + (f.z2 - e.z1) * e.dz;
    const lo = Math.max(0, Math.min(ta, tb)), hi = Math.min(e.len, Math.max(ta, tb));
    if (hi - lo > 0.02) spans.push({ lo, hi, room: o.room });
  }
  return spans.sort((a, b) => a.lo - b.lo);
}

// All wall stretches of one floor, each shared stretch listed once: built by the indoor room when one side
// is a terrace, otherwise by the first room.
export function wallPieces(rooms: WallRoom[]): WallPiece[] {
  const pieces: WallPiece[] = [];
  const roomEdges = new Map(rooms.map(r => [r, edges(r.pts)]));
  for (const r of rooms) {
    const others = rooms.filter(o => o !== r).map(o => ({ room: o, edges: roomEdges.get(o)! }));
    for (const e of roomEdges.get(r)!) {
      let t = 0;
      for (const s of edgeSpans(e, others)) {
        if (s.lo > t + 0.01) pieces.push({ owner: r, e, t0: t, t1: s.lo });
        const mine = r.outdoor === s.room.outdoor ? r.index < s.room.index : !r.outdoor;
        if (mine) pieces.push({ owner: r, other: s.room, e, t0: s.lo, t1: s.hi });
        t = Math.max(t, s.hi);
      }
      if (e.len > t + 0.01) pieces.push({ owner: r, e, t0: t, t1: e.len });
    }
  }
  return pieces;
}

// How far a room's wall face is from its edge line over [a, b] along the edge: the thicker of the walls there.
export function insetOver(spans: { lo: number; hi: number }[], len: number, a: number, b: number) {
  a = Math.max(0, a); b = Math.min(len, b);
  let t = a;
  for (const s of spans) {
    if (s.hi <= t) continue;
    if (s.lo > t + 0.005) return WALL_IN; // an exterior stretch in between
    t = s.hi;
    if (t >= b - 0.005) return SHARED_T / 2;
  }
  return t >= b - 0.005 && spans.length ? SHARED_T / 2 : WALL_IN;
}
