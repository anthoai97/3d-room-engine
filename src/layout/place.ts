// Furniture placement inside one room. Turns "against the north wall", "beside the bed", "around the table"
// into exact positions, using the room outline, wall thickness, door and window positions and item sizes.
// Pure TypeScript (no three.js), so the same code runs in the browser and in the CLI validator.
import { WALL_IN, DOOR_H, PONY_H, WIN_SILL, WIN_HEAD } from './constants';
import { doorLeaves, edgeSpans, insetOver } from './walls';
import { type Dir, type Edge, type Pt, type Rect, FACE, corners, edges, extents, inside, overlap, toSegment, wallFrame, yawTo, polyInfo } from './geometry';
import { type Catalog, type ItemKey, type ItemOpts, footprint, itemDef } from './items';
import type { ItemSpec } from './schema';

export interface Placed {
  key: ItemKey;
  id?: string;
  label: string; // for messages: key plus id
  x: number; z: number; y: number; rot: number;
  w: number; d: number; h: number; // footprint before rotation (scaled)
  scale: number;
  opts: ItemOpts;
  model?: string; // catalog slot when the real model is used
  parent?: string; // id of the item it was placed relative to
}

export interface Problem { level: 'error' | 'warning'; msg: string }

export interface PlacedOpening {
  type: 'door' | 'window' | 'pass' | 'glass' | 'pony';
  x: number; z: number; w: number;
  sill?: number; head?: number; swing?: string; full?: boolean;
  where?: string; // for messages, e.g. "door Hall ↔ Bath"
}

// Item specs in metres and final house coordinates (resolve.ts converts from the file's units).
export type MetricSpec = Omit<ItemSpec, 'at'> & { at?: Pt | 'center' };

// Space to keep clear. Floor items check swings, walkways and windows; wall decor only checks the
// openings themselves (`hole`), since a picture beside a doorway doesn't get in anyone's way.
export interface Zone {
  rect: Rect; y0: number; y1: number; why: string; level: Problem['level'];
  kind: 'swing' | 'walkway' | 'window' | 'hole';
  facing: number; // yaw of something hung on that wall
}

const MODES = ['wall', 'corner', 'at', 'on', 'beside', 'front', 'around', 'under'] as const;
const isDir = (v: unknown): v is Dir => v === 'N' || v === 'E' || v === 'S' || v === 'W';
const DEG = Math.PI / 180;

export class RoomLayout {
  readonly edges: Edge[];
  readonly placed: Placed[] = [];
  readonly byId = new Map<string, Placed>();
  readonly zones: Zone[] = [];

  // per edge: the stretches shared with neighbouring rooms (thin interior walls); the rest are exterior walls
  private spans: { lo: number; hi: number }[][];

  constructor(
    readonly room: { name: string; pts: Pt[]; outdoor?: boolean; type?: string },
    readonly openings: PlacedOpening[],
    private catalog: Catalog,
    private fmt: (m: number) => string,
    neighbours: Pt[][] = [], // the other rooms on this floor
  ) {
    this.edges = edges(room.pts);
    const others = neighbours.map(pts => ({ room: null, edges: edges(pts) }));
    this.spans = this.edges.map(e => edgeSpans(e, others));
    this.addOpeningZones();
  }

  // Distance from edge i's line to its wall's inner face, over [a, b] along the edge (from its start)
  inset(i: number, a: number, b = a) {
    return insetOver(this.spans[i], this.edges[i].len, a, b);
  }
  // ... at one of edge i's ends: 0 = its start, 1 = its end
  private insetAtEnd(i: number, end: 0 | 1) {
    const len = this.edges[i].len;
    return end ? this.inset(i, len - 0.02, len) : this.inset(i, 0, 0.02);
  }

  // Space that must stay clear: door swings, walkways through openings, and the glass of windows.
  private addOpeningZones() {
    for (const o of this.openings) for (const e of this.edges) {
      const t = this.onEdge(e, o.x, o.z);
      if (t == null) continue;
      const face = this.inset(e.i, t - o.w / 2, t + o.w / 2);
      const zone = (kind: Zone['kind'], depth: number, y0: number, y1: number, why: string, level: Problem['level'], width = o.w) => {
        const dd = face + depth;
        this.zones.push({ rect: { x: o.x + e.nx * dd / 2, z: o.z + e.nz * dd / 2, w: width, d: dd, rot: e.rot }, y0, y1, why, level, kind, facing: yawTo(e.nx, e.nz) });
      };
      const name = o.where ?? o.type;
      const top = o.full || o.type === 'glass' ? 9 : o.head ?? (o.type === 'window' ? WIN_HEAD : o.type === 'pony' ? PONY_H : DOOR_H);
      zone('hole', 0.1, o.type === 'window' ? o.sill ?? WIN_SILL : 0, top, `the ${name}`, 'error');
      const leaves = o.type === 'door' && o.swing === this.room.name ? doorLeaves(o.w, this.room) : 0;
      if (leaves) zone('swing', o.w / leaves, 0, DOOR_H, `the swing of the ${name}`, 'error');
      // a wide opening between open-plan areas only needs a path through its middle, not a clear strip along it
      else if (o.type === 'door' || o.type === 'pass' || o.type === 'glass') zone('walkway', 0.6, 0, o.full ? 9 : o.head ?? DOOR_H, `the way through the ${name} (keep ${this.fmt(0.6)} clear)`, 'warning', o.type === 'pass' ? Math.min(o.w, 1.2) : o.w);
      else if (o.type === 'window') zone('window', 0.4, (o.sill ?? WIN_SILL) + 0.25, o.head ?? WIN_HEAD, `the ${name}`, 'warning');
    }
  }

  // Position along edge e of a point on it, or null when the point isn't on that edge.
  onEdge(e: Edge, x: number, z: number) {
    const t = (x - e.x1) * e.dx + (z - e.z1) * e.dz;
    const dist = Math.abs(-(x - e.x1) * e.dz + (z - e.z1) * e.dx);
    return dist < 0.05 && t > 0 && t < e.len ? t : null;
  }

  wall(ref: Dir | number): Edge | undefined {
    if (typeof ref === 'number') return this.edges[ref];
    return this.edges.filter(e => e.dir === ref).sort((a, b) => b.len - a.len)[0];
  }

  // The most open spot in the room (the centroid of a rectangle; for L-shapes, the point furthest from the walls)
  center(): Pt {
    const { minX, maxX, minZ, maxZ } = polyInfo(this.room.pts);
    const mid: Pt = [(minX + maxX) / 2, (minZ + maxZ) / 2];
    const spots: { p: Pt; d: number }[] = [];
    for (let x = minX + 0.05; x < maxX; x += 0.05) for (let z = minZ + 0.05; z < maxZ; z += 0.05) {
      if (inside(this.room.pts, x, z)) spots.push({ p: [x, z], d: Math.min(...this.edges.map(e => toSegment(x, z, e.x1, e.z1, e.x2, e.z2).dist)) });
    }
    if (!spots.length) return mid;
    // among the roomiest spots, the one nearest the middle
    const top = Math.max(...spots.map(s => s.d));
    const near = (q: Pt) => Math.hypot(q[0] - mid[0], q[1] - mid[1]);
    return spots.filter(s => s.d > top - 0.05).sort((a, b) => near(a.p) - near(b.p))[0].p;
  }

  // Place an item; problems are returned (and the item is placed anyway, so you can see it).
  place(spec: MetricSpec): { items: Placed[]; problems: Problem[] } {
    const res = this.compute(spec);
    for (const it of res.items) this.commit(it, res.problems);
    return res;
  }

  // Place an item only if it fits without any problem (used by room recipes).
  tryPlace(spec: MetricSpec): Placed[] | null {
    const res = this.compute(spec);
    if (res.problems.length) return null;
    for (const it of res.items) this.commit(it, res.problems);
    return res.items;
  }

  private commit(it: Placed, problems: Problem[]) {
    this.placed.push(it);
    if (!it.id) return;
    if (this.byId.has(it.id)) problems.push({ level: 'error', msg: `id "${it.id}" is used twice in this room` });
    this.byId.set(it.id, it);
  }

  compute(spec: MetricSpec): { items: Placed[]; problems: Problem[] } {
    const problems: Problem[] = [];
    const def = itemDef(spec.item);
    const opts: ItemOpts = { w: spec.w, d: spec.d, color: spec.color, rail: spec.rail, flip: spec.flip };
    if ((spec.w || spec.d) && !def.resizable && spec.item !== 'rug') problems.push({ level: 'warning', msg: `${spec.item} can't be resized; w / d are ignored` });
    const scale = spec.scale ?? 1;
    const label = spec.id ? `${spec.item} "${spec.id}"` : spec.item;
    const modes = MODES.filter(m => spec[m] !== undefined);
    if (modes.length !== 1) {
      problems.push({ level: 'error', msg: modes.length ? `use only one of ${modes.join(', ')}` : `say where it goes: one of ${MODES.join(', ')}` });
      if (!modes.length) return { items: [], problems };
    }
    const mode = modes[0];
    const turn = (spec.rot ?? 0) * DEG;
    const faceDir = isDir(spec.face) ? FACE[spec.face] : undefined;
    const ref = (id: string | undefined): Placed | undefined => {
      const p = id === undefined ? undefined : this.byId.get(id);
      if (!p) problems.push({ level: 'error', msg: `no item with id "${id}" before this one in the room` });
      return p;
    };

    let fp = footprint(spec.item, opts, this.catalog, scale);
    const base = (x: number, z: number, rot: number, extra: Partial<Placed> = {}): Placed => ({
      key: spec.item, id: spec.id, label, x, z, rot, y: 0, w: fp.w, d: fp.d, h: fp.h, scale, opts, model: fp.model, ...extra,
    });
    let items: Placed[] = [];

    if (mode === 'wall') {
      const e = this.wall(spec.wall!);
      if (!e) return { items, problems: [...problems, { level: 'error', msg: `room has no ${spec.wall} wall` }] };
      const f = wallFrame(e), wallYaw = yawTo(f.nx, f.nz);
      const rot = (faceDir ?? wallYaw) + turn;
      const { along: ew, across: ed } = extents(fp.w, fp.d, rot - wallYaw);
      // reading order (s) may run against the edge's own direction (t)
      const flipped = Math.abs(f.sx - e.x1) > 1e-9 || Math.abs(f.sz - e.z1) > 1e-9;
      const toT = (s: number) => (flipped ? e.len - s : s);
      const n = this.edges.length, prev = (e.i - 1 + n) % n, next = (e.i + 1) % n;
      // clear of the walls at each end: the side wall's face at a convex corner, nothing at a reflex one
      const startWall = flipped ? this.insetAtEnd(next, 0) : this.insetAtEnd(prev, 1);
      const endWall = flipped ? this.insetAtEnd(prev, 1) : this.insetAtEnd(next, 0);
      const m0 = f.startReflex ? 0 : startWall, m1 = f.endReflex ? 0 : endWall;
      const lo = m0 + ew / 2, hi = f.len - m1 - ew / 2;
      const depthAt = (s: number) => {
        const a = toT(s - ew / 2), b = toT(s + ew / 2);
        return this.inset(e.i, Math.min(a, b), Math.max(a, b)) + (spec.gap ?? 0) + ed / 2;
      };
      const y = spec.y ?? (def.mount === 'wall' ? def.y ?? 1 : 0);
      const at = (s: number) => {
        const depth = depthAt(s);
        return base(f.sx + f.tx * s + f.nx * depth, f.sz + f.tz * s + f.nz * depth, rot, { y });
      };
      let s: number;
      if (hi < lo - 1e-6) {
        problems.push({ level: 'error', msg: `is ${this.fmt(ew)} wide but that wall only has ${this.fmt(f.len - m0 - m1)} of room` });
        s = f.len / 2;
      } else if (spec.along !== undefined) s = lo + spec.along * (hi - lo);
      else if (spec.offset !== undefined) {
        s = m0 + spec.offset + ew / 2;
        if (s > hi + 0.01) problems.push({ level: 'error', msg: `offset ${this.fmt(spec.offset)} pushes it past the end of the wall (max ${this.fmt(hi - m0 - ew / 2)})` });
      } else {
        // free spot nearest the middle of the wall
        const mid = (lo + hi) / 2;
        let free: number | undefined;
        for (let i = 0; i <= (hi - lo) / 0.05 + 1 && free === undefined; i++) {
          const c = mid + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.05;
          if (c >= lo - 1e-6 && c <= hi + 1e-6 && !this.conflicts(at(c)).length) free = c;
        }
        if (free === undefined) problems.push({ level: 'error', msg: `no free spot on the ${e.dir} wall (${this.fmt(f.len)} long): everywhere along it, it hits something (the problems at the middle of the wall follow). Try a smaller item, another wall, or move what's in the way` });
        s = free ?? mid;
      }
      items = [at(s)];
    } else if (mode === 'corner') {
      const v = this.cornerVertex(spec.corner!);
      if (v == null) return { items, problems: [...problems, { level: 'error', msg: `room has no convex ${spec.corner} corner` }] };
      const n = this.edges.length, eA = this.edges[(v - 1 + n) % n], eB = this.edges[v];
      // Back against one wall, left side (seen from the front) against the other
      let back = eA, side = eB;
      if (faceDir !== undefined) {
        if (Math.cos(faceDir - yawTo(eB.nx, eB.nz)) > Math.cos(faceDir - yawTo(eA.nx, eA.nz))) [back, side] = [eB, eA];
      } else {
        const th = yawTo(eA.nx, eA.nz);
        if (Math.cos(th) * eB.nx - Math.sin(th) * eB.nz <= 0) [back, side] = [eB, eA];
      }
      const rot = (faceDir ?? yawTo(back.nx, back.nz)) + turn;
      const { along: ew, across: ed } = extents(fp.w, fp.d, rot - yawTo(back.nx, back.nz));
      const [vx, vz] = this.room.pts[v], gap = spec.gap ?? 0;
      // the corner vertex is eA's end and eB's start
      const inA = this.insetAtEnd(eA.i, 1), inB = this.insetAtEnd(eB.i, 0);
      const backIn = back === eA ? inA : inB, sideIn = back === eA ? inB : inA;
      const x = vx + back.nx * (backIn + gap + ed / 2) + side.nx * (sideIn + gap + ew / 2);
      const z = vz + back.nz * (backIn + gap + ed / 2) + side.nz * (sideIn + gap + ew / 2);
      items = [base(x, z, rot)];
    } else if (mode === 'at') {
      const [x, z] = spec.at === 'center' ? this.center() : spec.at!;
      items = [base(x, z, (faceDir ?? 0) + turn)];
    } else if (mode === 'on') {
      const p = ref(spec.on);
      if (!p) return { items, problems };
      if (fp.w > p.w + 0.05 || fp.d > p.d + 0.05) problems.push({ level: 'warning', msg: `is bigger than ${p.label} it stands on` });
      items = [base(p.x, p.z, (faceDir ?? p.rot) + turn, { y: p.y + p.h, parent: p.id })];
    } else if (mode === 'beside' || mode === 'front') {
      const p = ref(mode === 'beside' ? spec.beside : spec.front);
      if (!p) return { items, problems };
      let lx: number, lz: number, rot: number;
      if (mode === 'beside') {
        const gap = spec.gap ?? 0.05;
        let sign = spec.side === 'left' ? -1 : 1;
        if (isDir(spec.side)) {
          // a compass side: must be one of the other item's sides, not its front or back
          const v = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[spec.side];
          const along = Math.cos(p.rot) * v[0] - Math.sin(p.rot) * v[1];
          if (Math.abs(along) < 0.7) problems.push({ level: 'error', msg: `the ${spec.side} side of ${p.label} is its front or back; beside goes on its left or right` });
          sign = along < 0 ? -1 : 1;
        }
        lx = sign * (p.w / 2 + gap + fp.w / 2);
        lz = -p.d / 2 + fp.d / 2;
        rot = (faceDir ?? p.rot) + turn;
      } else {
        lx = 0;
        lz = p.d / 2 + (spec.gap ?? 0.4) + fp.d / 2;
        rot = (faceDir ?? p.rot + Math.PI) + turn;
      }
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      items = [base(p.x + lx * c + lz * s, p.z - lx * s + lz * c, rot, { parent: p.id })];
    } else if (mode === 'around') {
      const p = ref(spec.around);
      if (!p) return { items, problems };
      const n = spec.count ?? 4, gap = spec.gap ?? 0;
      const c = Math.cos(p.rot + turn), s = Math.sin(p.rot + turn);
      const world = (lx: number, lz: number) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
      // Chairs sit on the table's sides, square on to them, starting at its front: a square or round table
      // gets all four (four chairs make a cross), a long one its two long sides
      const sides = Math.abs(p.w - p.d) < 0.15 ? [[0, 1], [0, -1], [1, 0], [-1, 0]] : p.w >= p.d ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
      let i = 0;
      items = sides.flatMap(([sx, sz], si) => {
        const k = Math.floor(n / sides.length) + (si < n % sides.length ? 1 : 0);
        const len = sx ? p.d : p.w, off = (sx ? p.w : p.d) / 2 + fp.d / 2 + gap;
        return Array.from({ length: k }, (_, j) => {
          const along = -len / 2 + (len * (j + 0.5)) / k;
          const lx = sx ? sx * off : along, lz = sz ? sz * off : along;
          const [x, z] = world(lx, lz), [tx, tz] = world(lx - sx * off, lz - sz * off);
          return base(x, z, yawTo(tx - x, tz - z), { parent: p.id, id: spec.id ? `${spec.id}-${++i}` : undefined });
        });
      });
    } else if (mode === 'under') {
      const ids = ([] as string[]).concat(spec.under!);
      const ps = ids.map(ref).filter((p): p is Placed => !!p);
      if (!ps.length) return { items, problems };
      const rot = ps[0].rot + turn, c = Math.cos(rot), s = Math.sin(rot);
      // bounding box of the items, measured in the rug's own frame
      const local = ps.flatMap(p => corners(p)).map(([x, z]) => [x * c - z * s, x * s + z * c]);
      const xs = local.map(q => q[0]), zs = local.map(q => q[1]), margin = spec.gap ?? 0.3;
      const lx = (Math.min(...xs) + Math.max(...xs)) / 2, lz = (Math.min(...zs) + Math.max(...zs)) / 2;
      opts.w = spec.w ?? Math.max(...xs) - Math.min(...xs) + 2 * margin;
      opts.d = spec.d ?? Math.max(...zs) - Math.min(...zs) + 2 * margin;
      let x = lx * c + lz * s, z = -lx * s + lz * c;
      // keep it off the walls: trim the sides that would run under them (square-on rooms)
      if (Math.abs(Math.sin(2 * rot)) < 1e-6) {
        const { minX, maxX, minZ, maxZ } = polyInfo(this.room.pts);
        const turned = Math.abs(Math.sin(rot)) > 0.5;
        let hw = (turned ? opts.d : opts.w) / 2, hd = (turned ? opts.w : opts.d) / 2;
        const x0 = Math.max(x - hw, minX + WALL_IN), x1 = Math.min(x + hw, maxX - WALL_IN);
        const z0 = Math.max(z - hd, minZ + WALL_IN), z1 = Math.min(z + hd, maxZ - WALL_IN); // a little clear of any wall
        [x, z, hw, hd] = [(x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2];
        [opts.w, opts.d] = turned ? [hd * 2, hw * 2] : [hw * 2, hd * 2];
      }
      fp = footprint(spec.item, opts, this.catalog, scale);
      items = [base(x, z, rot, { parent: ps[0].id })];
    }

    for (const it of items) {
      if (spec.y !== undefined) it.y = spec.y;
      if (spec.shift) { it.x += spec.shift[0]; it.z += spec.shift[1]; }
      if (typeof spec.face === 'string' && !isDir(spec.face)) {
        const t = ref(spec.face);
        if (t) it.rot = yawTo(t.x - it.x, t.z - it.z) + turn;
      }
      for (const c of this.conflicts(it)) problems.push(c);
    }
    return { items, problems };
  }

  private cornerVertex(c: string | number): number | null {
    const n = this.edges.length;
    if (typeof c === 'number') return c < n && !this.edges[c].r0 ? c : null;
    const want = new Set(c.split(''));
    const score = ([x, z]: Pt) => (want.has('E') ? x : -x) + (want.has('S') ? z : -z);
    let best: number | null = null;
    for (let v = 0; v < n; v++) {
      const a = this.edges[(v - 1 + n) % n], b = this.edges[v];
      if (b.r0 || !(want.has(a.dir) && want.has(b.dir) && a.dir !== b.dir)) continue;
      if (best === null || score(this.room.pts[v]) > score(this.room.pts[best])) best = v;
    }
    return best;
  }

  // Everything wrong with putting `it` here: overlaps, blocked doors/windows, sticking through a wall.
  conflicts(it: Placed): Problem[] {
    const out: Problem[] = [];
    const flat = itemDef(it.key).flat;
    const yOverlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0.02;
    for (const p of flat ? [] : this.placed) {
      if (p === it || itemDef(p.key).flat || (it.parent && it.parent === p.id) || (p.parent && p.parent === it.id)) continue;
      if (!yOverlap(it.y, it.y + it.h, p.y, p.y + p.h)) continue;
      const o = overlap(it, p);
      if (o > 0.02) out.push({ level: 'error', msg: `overlaps ${p.label} by ${this.fmt(o)}` });
    }
    const onWall = itemDef(it.key).mount === 'wall';
    for (const zn of flat ? [] : this.zones) {
      if ((zn.kind === 'hole') !== onWall || !yOverlap(it.y, it.y + it.h, zn.y0, zn.y1) || (zn.kind === 'window' && itemDef(it.key).glass)) continue;
      if (zn.kind === 'walkway' && itemDef(it.key).reachIn) continue;
      if (onWall && Math.cos(it.rot - zn.facing) < 0.9) continue; // hung on a different wall
      // a few cm of overlap is fine, except for thin things like pictures, which can't overlap more than their depth
      if (overlap(it, zn.rect) > Math.min(0.05, Math.min(it.w, it.d) / 2)) out.push({ level: zn.level, msg: `${onWall ? 'hangs over' : 'blocks'} ${zn.why}` });
    }
    // every corner and side midpoint must be inside the room, clear of the walls
    const cs = corners(it);
    const samples = [...cs, ...cs.map((p, i) => [(p[0] + cs[(i + 1) % 4][0]) / 2, (p[1] + cs[(i + 1) % 4][1]) / 2] as Pt)];
    let worst = 0, outside = false;
    for (const [x, z] of samples) {
      if (!inside(this.room.pts, x, z)) { outside = true; continue; }
      for (const e of this.edges) {
        const { dist, t } = toSegment(x, z, e.x1, e.z1, e.x2, e.z2);
        worst = Math.max(worst, this.inset(e.i, t * e.len) - dist);
      }
    }
    if (outside) out.push({ level: 'error', msg: 'sticks out of the room' });
    else if (worst > 0.015) out.push({ level: 'error', msg: `sticks ${this.fmt(worst)} into a wall` });
    return out;
  }
}
