// House file -> everything the engine needs: metres, centred on the origin, openings and furniture at exact
// positions, plus a list of issues (errors and warnings) for the author to fix.
import { FT, WALL_IN } from './constants';
import { type Dir, type Edge, type Pt, wallFrame, edges } from './geometry';
import type { Catalog } from './items';
import { RoomLayout, type MetricSpec, type Placed, type PlacedOpening } from './place';
import { House, type HouseSpec, type ItemSpec, type OpeningSpec, type RoomSpec } from './schema';
import { furnish } from './recipes';
import { checkOpenings, checkReachable, checkRooms } from './validate';

export interface Issue { level: 'error' | 'warning'; path: string; where: string; msg: string }

export interface ResolvedRoom {
  name: string; floor: number; pts: Pt[]; type?: RoomSpec['type'];
  floorTex: 'wood' | 'tile' | 'deck'; outdoor: boolean; desc: string;
  items: Placed[]; path: string;
}
export interface ResolvedOpening extends PlacedOpening { floor: number; path: string; where: string }

export interface ResolvedHouse {
  key: string; title: string; subtitle: string; units: 'm' | 'ft'; furniture: HouseSpec['furniture'];
  plan?: HouseSpec['plan'];
  floors: HouseSpec['floors'];
  rooms: ResolvedRoom[];
  openings: ResolvedOpening[];
  issues: Issue[];
  // house coordinates (metres, centred) <-> file coordinates
  toFile: (p: Pt) => Pt;
  fmt: (m: number) => string;
}

export function resolveHouse(key: string, raw: unknown, catalog: Catalog): ResolvedHouse {
  const issues: Issue[] = [];
  const parsed = House.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) issues.push({ level: 'error', path: pathOf(i.path), where: 'schema', msg: i.message });
    const r = raw as Partial<HouseSpec> | undefined;
    return { key, title: r?.title ?? key, subtitle: '', units: 'm', furniture: 'catalog', floors: [], rooms: [], openings: [], issues, toFile: p => p, fmt: m => `${m.toFixed(2)} m` };
  }
  const h = parsed.data;
  // placeholder houses use the built-in models (and their sizes) for every item
  if (h.furniture === 'placeholder') catalog = {};
  const k = h.units === 'ft' ? FT : 1;
  const all = h.rooms.flatMap(r => r.pts);
  const cx = (Math.min(...all.map(p => p[0])) + Math.max(...all.map(p => p[0]))) / 2 * k;
  const cz = (Math.min(...all.map(p => p[1])) + Math.max(...all.map(p => p[1]))) / 2 * k;
  const P = ([x, z]: Pt): Pt => [x * k - cx, z * k - cz];
  const L = <T extends number | undefined>(v: T) => (v === undefined ? undefined : v * k) as T;
  const fmt = (m: number) => (h.units === 'ft' ? `${(m / FT).toFixed(2)} ft` : `${m.toFixed(2)} m`);
  const toFile = ([x, z]: Pt): Pt => [+((x + cx) / k).toFixed(3), +((z + cz) / k).toFixed(3)];
  const issue = (level: Issue['level'], path: string, where: string, msg: string) => issues.push({ level, path, where, msg });

  const rooms: ResolvedRoom[] = h.rooms.map((r, i) => ({
    name: r.name, floor: r.floor, pts: r.pts.map(P), type: r.type,
    floorTex: r.floorTex ?? (r.outdoor ?? r.type === 'outdoor' ? 'deck' : r.type === 'bath' || r.type === 'laundry' ? 'tile' : 'wood'),
    outdoor: r.outdoor ?? r.type === 'outdoor', desc: r.desc, items: [], path: `rooms[${i}]`,
  }));
  checkRooms(rooms, h.floors, issue, fmt, toFile);

  const findRoom = (name: string, floor: number | undefined, path: string, where: string) => {
    const found = rooms.filter(r => r.name === name && (floor === undefined || r.floor === floor));
    if (found.length === 1) return found[0];
    if (found.length > 1) issue('error', path, where, `"${name}" is on more than one floor: add "floor"`);
    else issue('error', path, where, `no room named "${name}"${floor !== undefined ? ` on floor ${floor}` : ''} (rooms: ${[...new Set(rooms.map(r => r.name))].join(', ')})`);
    return undefined;
  };

  const openings: ResolvedOpening[] = [];
  h.openings.forEach((o, i) => {
    const r = resolveOpening(o, `openings[${i}]`);
    if (r) openings.push(r);
  });

  function resolveOpening(o: OpeningSpec, path: string): ResolvedOpening | undefined {
    const where = `${o.type}${o.between ? ` ${o.between.join(' ↔ ')}` : o.room ? ` in ${o.room} (${o.wall})` : ''}`;
    const modes = [o.between && 'between', o.room && 'room', (o.x !== undefined || o.z !== undefined) && 'x/z'].filter(Boolean);
    if (modes.length !== 1) {
      issue('error', path, where, modes.length ? `use only one of ${modes.join(', ')}` : 'say where it goes: between, room + wall, or x + z');
      return;
    }
    const w = o.w * k;
    let floor = o.floor ?? 0, x: number, z: number, swing = o.swing;
    const place = (len: number, at: (s: number) => Pt) => {
      let s: number;
      if (o.offset !== undefined) {
        s = o.offset * k + w / 2;
        if (s + w / 2 > len + 0.01) issue('error', path, where, `offset ${fmt(o.offset * k)} + width runs past the end of the wall (${fmt(len)} long)`);
      } else {
        // keep a little wall at each end when there's room for it
        const m = Math.max(0, Math.min(WALL_IN, (len - w) / 2)), lo = m + w / 2, hi = len - m - w / 2;
        if (w > len + 0.01) issue('error', path, where, `is ${fmt(w)} wide but the wall is only ${fmt(len)}`);
        s = hi < lo ? len / 2 : lo + (o.along ?? 0.5) * (hi - lo);
      }
      return at(s);
    };
    if (o.between) {
      const [a, b] = o.between.map(n => findRoom(n, o.floor, path, where));
      if (!a || !b) return;
      if (a.floor !== b.floor) { issue('error', path, where, `"${a.name}" and "${b.name}" are on different floors`); return; }
      floor = a.floor;
      const segs = sharedWalls(a.pts, b.pts, o.wall), seg = segs[0];
      if (!seg) { issue('error', path, where, `"${a.name}" and "${b.name}" don't share a wall${o.wall !== undefined ? ` on the ${o.wall} side of "${a.name}"` : ''}`); return; }
      if (segs.length > 1) issue('warning', path, where, `"${a.name}" and "${b.name}" share walls on its ${segs.map(g => g.dir).join(' and ')} sides; add "wall" to say which (using the ${seg.dir} one)`);
      [x, z] = place(seg.len, s => [seg.sx + seg.tx * s, seg.sz + seg.tz * s]);
      swing ??= b.name;
    } else if (o.room) {
      const r = findRoom(o.room, o.floor, path, where);
      if (!r) return;
      floor = r.floor;
      if (o.wall === undefined) { issue('error', path, where, '`room` needs a `wall` (N, E, S, W or an edge index)'); return; }
      const others = rooms.filter(x => x !== r && x.floor === r.floor);
      const e = pickWall(r.pts, o.wall, e => others.some(x => sharedWalls(r.pts, x.pts, e.i).length > 0));
      if (!e) { issue('error', path, where, `"${r.name}" has no ${o.wall} wall`); return; }
      const f = wallFrame(e);
      [x, z] = place(f.len, s => [f.sx + f.tx * s, f.sz + f.tz * s]);
      swing ??= r.name;
    } else {
      if (o.x === undefined || o.z === undefined) { issue('error', path, where, 'needs both x and z'); return; }
      [x, z] = P([o.x, o.z]);
    }
    if (o.type === 'door' && !swing) issue('warning', path, where, 'door has no `swing` room, so no door leaf is drawn');
    return { type: o.type, floor, x, z, w, sill: L(o.sill), head: L(o.head), swing, full: o.full, path, where };
  }
  checkOpenings(openings, rooms, issue, fmt);

  // Furniture, room by room
  h.rooms.forEach((spec, i) => {
    const room = rooms[i];
    const neighbours = rooms.filter(r => r !== room && r.floor === room.floor).map(r => r.pts);
    const layout = new RoomLayout(room, openings.filter(o => o.floor === room.floor), catalog, fmt, neighbours);
    if (spec.items) {
      spec.items.forEach((s, j) => {
        const res = layout.place(toMetric(s));
        const label = s.id ? `${s.item} "${s.id}"` : s.item;
        for (const p of res.problems) issue(p.level, `${room.path}.items[${j}]`, `${room.name} › ${label}`, p.msg);
      });
    } else if (spec.type) furnish(spec.type, layout);
    room.items = layout.placed;
  });
  checkReachable(rooms, openings, h.floors, issue);

  function toMetric(s: ItemSpec): MetricSpec {
    return {
      ...s,
      at: s.at === 'center' || s.at === undefined ? s.at : P(s.at),
      offset: L(s.offset), gap: L(s.gap), y: L(s.y), w: L(s.w), d: L(s.d),
      shift: s.shift && [s.shift[0] * k, s.shift[1] * k],
    };
  }

  return { key, title: h.title, subtitle: h.subtitle, units: h.units, furniture: h.furniture, plan: h.plan, floors: h.floors, rooms, openings, issues, toFile, fmt };
}

// A room's wall by compass side (the longest one facing that way, outside walls first) or edge index.
function pickWall(pts: Pt[], ref: Dir | number, isShared: (e: Edge) => boolean = () => false) {
  const es = edges(pts);
  if (typeof ref === 'number') return es[ref];
  return es.filter(e => e.dir === ref).sort((a, b) => Number(isShared(a)) - Number(isShared(b)) || b.len - a.len)[0];
}

// Stretches of wall two rooms share (optionally only on one side of room a), longest first, each read
// from its west / north end. `dir` is the side of room a it's on.
function sharedWalls(a: Pt[], b: Pt[], side?: Dir | number) {
  const out: { sx: number; sz: number; tx: number; tz: number; len: number; dir: Dir }[] = [];
  for (const ea of edges(a)) for (const eb of edges(b)) {
    if (side !== undefined && (typeof side === 'number' ? ea.i !== side : ea.dir !== side)) continue;
    if (Math.abs(ea.dx * eb.dz - ea.dz * eb.dx) > 1e-3) continue;
    if (Math.abs(-(eb.x1 - ea.x1) * ea.dz + (eb.z1 - ea.z1) * ea.dx) > 0.03) continue;
    const f = wallFrame(ea);
    const t1 = (eb.x1 - f.sx) * f.tx + (eb.z1 - f.sz) * f.tz, t2 = (eb.x2 - f.sx) * f.tx + (eb.z2 - f.sz) * f.tz;
    const lo = Math.max(0, Math.min(t1, t2)), hi = Math.min(f.len, Math.max(t1, t2));
    if (hi - lo > 0.05) out.push({ sx: f.sx + f.tx * lo, sz: f.sz + f.tz * lo, tx: f.tx, tz: f.tz, len: hi - lo, dir: ea.dir });
  }
  return out.sort((p, q) => q.len - p.len);
}

function pathOf(path: PropertyKey[]) {
  return path.map((p, i) => (typeof p === 'number' ? `[${p}]` : `${i ? '.' : ''}${String(p)}`)).join('');
}
