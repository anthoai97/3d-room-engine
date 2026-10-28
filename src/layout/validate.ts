// Structural checks on a resolved house: room outlines, how rooms fit together, doors and windows,
// and whether every room can be reached. Furniture problems come from the placement solver (place.ts).
import { type Pt, edges, inside, polyInfo, selfIntersects, toSegment } from './geometry';
import { openingsOnEdge, wallPieces } from './walls';
import type { HouseSpec } from './schema';
import type { ResolvedOpening, ResolvedRoom, Issue } from './resolve';

type Report = (level: Issue['level'], path: string, where: string, msg: string) => void;

export function checkRooms(rooms: ResolvedRoom[], floors: HouseSpec['floors'], issue: Report, fmt: (m: number) => string, toFile: (p: Pt) => Pt) {
  const at = (p: Pt) => `(${toFile(p).join(', ')})`;
  rooms.forEach(r => {
    const where = `room "${r.name}"`;
    if (r.floor >= floors.length) issue('error', r.path, where, `floor ${r.floor} but the house lists only ${floors.length} floor(s)`);
    r.pts.forEach((p, i) => {
      const q = r.pts[(i + 1) % r.pts.length];
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05) issue('error', r.path, where, `points ${i} and ${(i + 1) % r.pts.length} are the same or almost the same ${at(p)}`);
    });
    if (selfIntersects(r.pts)) issue('error', r.path, where, 'outline crosses itself: list the points in order around the room');
    if (polyInfo(r.pts).area < 1) issue('warning', r.path, where, `is very small (${polyInfo(r.pts).area.toFixed(2)} m²)`);
    if (rooms.some(o => o !== r && o.floor === r.floor && o.name === r.name && rooms.indexOf(o) < rooms.indexOf(r)))
      issue('error', r.path, where, 'another room on this floor has the same name');
  });

  for (let f = 0; f < floors.length; f++) {
    const on = rooms.filter(r => r.floor === f);
    if (!on.length) issue('error', `floors[${f}]`, `floor ${f}`, 'has no rooms');
    const start = floors[f].walkStart;
    if (start && !on.some(r => r.name === start)) issue('error', `floors[${f}].walkStart`, `floor ${f}`, `walkStart "${start}" is not a room on this floor`);

    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) {
      const a = on[i], b = on[j];
      // overlap: sample the shared bounding box on a 10 cm grid
      const A = polyInfo(a.pts), B = polyInfo(b.pts);
      const x0 = Math.max(A.minX, B.minX), x1 = Math.min(A.maxX, B.maxX), z0 = Math.max(A.minZ, B.minZ), z1 = Math.min(A.maxZ, B.maxZ);
      let n = 0;
      for (let x = x0 + 0.05; x < x1; x += 0.1) for (let z = z0 + 0.05; z < z1; z += 0.1) if (inside(a.pts, x, z) && inside(b.pts, x, z)) n++;
      if (n * 0.01 > 0.05) issue('error', b.path, `room "${b.name}"`, `overlaps room "${a.name}" by about ${(n * 0.01).toFixed(1)} m²`);
    }
    // corners that almost (but not exactly) touch a neighbour's wall: the rooms should share that edge
    for (const a of on) for (const p of a.pts) for (const b of on) {
      if (a === b) continue;
      const ds = edges(b.pts).map(e => toSegment(p[0], p[1], e.x1, e.z1, e.x2, e.z2).dist);
      const d = Math.min(...ds);
      if (d > 0.01 && d < 0.3 && !inside(b.pts, p[0], p[1]))
        issue('warning', a.path, `room "${a.name}"`, `corner ${at(p)} is ${fmt(d)} from room "${b.name}" — neighbouring rooms should share walls exactly`);
    }
  }
}

// Rooms whose walls an opening sits on, with where along each wall it is.
export function hosts(o: ResolvedOpening, rooms: ResolvedRoom[]) {
  const out: { room: ResolvedRoom; edge: number; t: number; len: number }[] = [];
  for (const r of rooms) {
    if (r.floor !== o.floor) continue;
    for (const e of edges(r.pts)) {
      const t = (o.x - e.x1) * e.dx + (o.z - e.z1) * e.dz;
      const dist = Math.abs(-(o.x - e.x1) * e.dz + (o.z - e.z1) * e.dx);
      if (dist < 0.05 && t > 0 && t < e.len) { out.push({ room: r, edge: e.i, t, len: e.len }); break; }
    }
  }
  return out;
}

export function checkOpenings(openings: ResolvedOpening[], rooms: ResolvedRoom[], issue: Report, fmt: (m: number) => string) {
  for (const o of openings) {
    const hs = hosts(o, rooms);
    if (!hs.length) {
      let near = { d: Infinity, name: '' };
      for (const r of rooms.filter(r => r.floor === o.floor)) for (const e of edges(r.pts)) {
        const d = toSegment(o.x, o.z, e.x1, e.z1, e.x2, e.z2).dist;
        if (d < near.d) near = { d, name: `${r.name} (${e.dir} wall)` };
      }
      issue('error', o.path, o.where, `is not on any wall (nearest: ${near.name}, ${fmt(near.d)} away)`);
      continue;
    }
    for (const h of hs) {
      if (h.t - o.w / 2 < -0.01 || h.t + o.w / 2 > h.len + 0.01) issue('error', o.path, o.where, `runs past the end of the wall of "${h.room.name}"`);
    }
    if (o.swing && !hs.some(h => h.room.name === o.swing)) issue('error', o.path, o.where, `opens into "${o.swing}", but isn't on a wall of that room (it's on ${hs.map(h => `"${h.room.name}"`).join(' and ')})`);
    if (o.type === 'window' && hs.length > 1 && hs.every(h => !h.room.outdoor)) issue('warning', o.path, o.where, `window on an inside wall between ${hs.map(h => `"${h.room.name}"`).join(' and ')}`);
  }
  // openings on the same wall must not overlap
  for (let i = 0; i < openings.length; i++) for (let j = i + 1; j < openings.length; j++) {
    const a = openings[i], b = openings[j];
    if (a.floor !== b.floor) continue;
    const hb = hosts(b, rooms);
    const sameWall = hosts(a, rooms).find(x => hb.some(y => y.room === x.room && y.edge === x.edge));
    if (sameWall && Math.hypot(a.x - b.x, a.z - b.z) < (a.w + b.w) / 2 - 0.01) issue('error', b.path, b.where, `overlaps ${a.where} (${a.path})`);
  }
  // Two rooms open to each other on one wall but still walled, with no opening at all, on another stretch they
  // share (one wraps around the other in an L): in the open space that stretch stands as a post or a stub.
  const pair = (a: number, b: number) => `${Math.min(a, b)}|${Math.max(a, b)}`;
  const open = new Set(openings.filter(o => o.type === 'pass' && o.full).map(o => hosts(o, rooms)).filter(hs => hs.length === 2)
    .map(([a, b]) => pair(rooms.indexOf(a.room), rooms.indexOf(b.room))));
  const onEdge = openingsOnEdge(openings), indexed = rooms.map((r, index) => ({ ...r, index }));
  for (const f of new Set(rooms.map(r => r.floor))) for (const { owner, other, e, t0, t1 } of wallPieces(indexed.filter(r => r.floor === f))) {
    if (!other || !open.has(pair(owner.index, other.index))) continue;
    if (onEdge(f, e).some(h => (h.a + h.b) / 2 > t0 && (h.a + h.b) / 2 < t1)) continue;
    issue('warning', rooms[owner.index].path, `room "${owner.name}"`, `${fmt(t1 - t0)} of wall still stands between "${owner.name}" and "${other.name}" on the ${e.dir} side of "${owner.name}", though they're open to each other on another wall; in the open space it shows as a post. If the plan shows it open, add a full "pass" there too`);
  }
}

export function checkReachable(rooms: ResolvedRoom[], openings: ResolvedOpening[], floors: HouseSpec['floors'], issue: Report) {
  for (let f = 0; f < floors.length; f++) {
    const on = rooms.filter(r => r.floor === f);
    if (!on.length) continue;
    const OUT = 'outside', links = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      (links.get(a) ?? links.set(a, new Set()).get(a)!).add(b);
      (links.get(b) ?? links.set(b, new Set()).get(b)!).add(a);
    };
    let outsideDoor = false;
    for (const o of openings) {
      if (o.floor !== f || o.type === 'window' || o.type === 'pony') continue;
      const hs = hosts(o, rooms).map(h => h.room.name);
      if (hs.length === 1) { link(hs[0], OUT); if (!on.find(r => r.name === hs[0])?.outdoor) outsideDoor = true; }
      for (let i = 1; i < hs.length; i++) link(hs[0], hs[i]);
    }
    const start = f === 0 ? OUT : floors[f].walkStart ?? on[0].name;
    const seen = new Set([start]), queue = [start];
    while (queue.length) for (const n of links.get(queue.shift()!) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    if (f === 0 && !outsideDoor) issue('warning', `floors[${f}]`, `floor ${f}`, 'has no door to the outside');
    for (const r of on) if (!seen.has(r.name)) issue('warning', r.path, `room "${r.name}"`, `can't be reached: no door, opening or glass door leads into it from the ${f === 0 ? 'entrance' : `"${start}"`}`);
  }
}
