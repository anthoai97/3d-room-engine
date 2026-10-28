// Top-down plan of one floor as SVG: rooms, walls, doors with their swing, windows, every item's footprint
// labelled with its id or key, and problems from the validator in red. The grid is labelled in the house
// file's own coordinates and units, so you can read positions straight off it. When the house file gives
// plan.bounds, the source floor plan image is drawn underneath to check the tracing.
import { SHARED_T, T } from '../src/layout/constants';
import { doorLeaves, openingsOnEdge, wallPieces } from '../src/layout/walls';
import { type Pt, corners, edges, polyInfo } from '../src/layout/geometry';
import { itemDef } from '../src/layout/items';
import { RoomLayout } from '../src/layout/place';
import type { ResolvedHouse } from '../src/layout/resolve';
import { hosts } from '../src/layout/validate';

const PX = 70; // pixels per metre
const PAD = 70;
const TEX = { wood: '#e9dccb', tile: '#e4e6e8', deck: '#e2d3bf' };

export function planSvg(house: ResolvedHouse, floor: number, image?: { href: string; width: number; height: number }) {
  const rooms = house.rooms.filter(r => r.floor === floor);
  const b = polyInfo(house.rooms.flatMap(r => r.pts));
  const W = (b.maxX - b.minX) * PX + PAD * 2, H = (b.maxZ - b.minZ) * PX + PAD * 2 + 30;
  const X = (x: number) => +((x - b.minX) * PX + PAD).toFixed(1);
  const Y = (z: number) => +((z - b.minZ) * PX + PAD).toFixed(1);
  const poly = (pts: Pt[]) => pts.map(([x, z]) => `${X(x)},${Y(z)}`).join(' ');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const out: string[] = [];
  const bad = new Set(house.issues.map(i => i.path));

  out.push(`<rect width="${W}" height="${H}" fill="#fbfaf8"/>`);
  if (image && house.plan?.bounds) {
    const [l, t, r, btm] = house.plan.bounds, sx = (b.maxX - b.minX) * PX / (r - l), sy = (b.maxZ - b.minZ) * PX / (btm - t);
    out.push(`<image href="${image.href}" x="${X(b.minX) - l * sx}" y="${Y(b.minZ) - t * sy}" width="${image.width * sx}" height="${image.height * sy}" opacity="0.35"/>`);
  }

  // grid in file units
  const k = house.units === 'ft' ? 0.3048 : 1, step = house.units === 'ft' ? 2 : 1, major = house.units === 'ft' ? 10 : 5;
  const [fx0, fz0] = house.toFile([b.minX, b.minZ]), [fx1, fz1] = house.toFile([b.maxX, b.maxZ]);
  for (let v = Math.ceil(fx0 / step) * step; v <= fx1 + 1e-6; v += step) {
    const x = X(b.minX + (v - fx0) * k), m = Math.abs(v % major) < 1e-6;
    out.push(`<line x1="${x}" y1="${PAD - 8}" x2="${x}" y2="${H - PAD - 22}" stroke="${m ? '#c9c4bb' : '#e6e2dc'}" stroke-width="1"/>`);
    if (m) out.push(`<text x="${x}" y="${PAD - 14}" class="axis" text-anchor="middle">${+v.toFixed(2)}</text>`);
  }
  for (let v = Math.ceil(fz0 / step) * step; v <= fz1 + 1e-6; v += step) {
    const y = Y(b.minZ + (v - fz0) * k), m = Math.abs(v % major) < 1e-6;
    out.push(`<line x1="${PAD - 8}" y1="${y}" x2="${W - PAD + 8}" y2="${y}" stroke="${m ? '#c9c4bb' : '#e6e2dc'}" stroke-width="1"/>`);
    if (m) out.push(`<text x="${PAD - 14}" y="${y + 4}" class="axis" text-anchor="end">${+v.toFixed(2)}</text>`);
  }

  for (const r of rooms) out.push(`<polygon points="${poly(r.pts)}" fill="${r.outdoor ? TEX.deck : TEX[r.floorTex]}" opacity="${image ? 0.75 : 1}"/>`);

  // space kept clear in front of doors and openings (furniture there is flagged)
  for (const r of rooms) {
    const l = new RoomLayout(r, house.openings.filter(o => o.floor === floor), {}, house.fmt, rooms.filter(o => o !== r).map(o => o.pts));
    for (const z of l.zones) if (z.kind === 'swing' || z.kind === 'walkway')
      out.push(`<polygon points="${poly(corners(z.rect))}" fill="${z.kind === 'swing' ? 'rgba(107,111,140,.10)' : 'rgba(107,111,140,.06)'}" stroke="none"/>`);
  }

  // furniture
  for (const r of rooms) for (const it of r.items) {
    const def = itemDef(it.key), flat = def.flat, top = it.y > 0.05 && def.mount !== 'wall';
    const wrong = bad.has(`${r.path}.items[${r.items.indexOf(it)}]`);
    const fill = flat ? 'rgba(160,150,135,.18)' : def.mount === 'wall' ? '#7d7a8c' : top ? 'rgba(255,255,255,.9)' : '#fff';
    const stroke = wrong ? '#e0245e' : flat ? '#b3a998' : '#6b6f8c';
    out.push(`<polygon points="${poly(corners(it))}" fill="${fill}" stroke="${stroke}" stroke-width="${wrong ? 2.5 : 1.2}" ${flat ? 'stroke-dasharray="4 3"' : ''}/>`);
    if (!flat && !top && def.mount !== 'wall') {
      // front marker: a short tick from the centre toward the front
      const fx = it.x + Math.sin(it.rot) * it.d * 0.35, fz = it.z + Math.cos(it.rot) * it.d * 0.35;
      out.push(`<line x1="${X(it.x)}" y1="${Y(it.z)}" x2="${X(fx)}" y2="${Y(fz)}" stroke="${stroke}" stroke-width="1.5"/>`);
    }
    if (!flat && !top) out.push(`<text x="${X(it.x)}" y="${Y(it.z) + (def.mount === 'wall' ? -6 : 13)}" class="item${wrong ? ' bad' : ''}" text-anchor="middle">${esc(it.id ?? it.key)}</text>`);
  }

  // walls as the engine builds them: between rooms centred on the line, outside walls just inside it, with the
  // openings cut out (windows and pony walls are drawn in the gap below); the piece's own ends run on half a
  // wall's thickness to close the corners
  const pieces = wallPieces(house.rooms.map((r, index) => ({ ...r, index })).filter(r => r.floor === floor));
  const onEdge = openingsOnEdge(house.openings);
  for (const { owner, other, e, t0, t1 } of pieces) {
    const shared = !!other, thick = shared ? SHARED_T : T, o = shared ? 0 : 0.004 + T / 2;
    const at = (t: number) => [X(e.x1 + e.dx * t + e.nx * o), Y(e.z1 + e.dz * t + e.nz * o)];
    const outdoor = owner.outdoor && (!other || other.outdoor);
    let cur = t0;
    for (const h of [...onEdge(floor, e).filter(h => (h.a + h.b) / 2 > t0 && (h.a + h.b) / 2 < t1), { a: t1, b: t1 }]) {
      if (h.a > cur + 0.001) {
        const [ax, az] = at(cur === t0 ? cur - thick / 2 : cur), [bx, bz] = at(h.a >= t1 ? h.a + thick / 2 : h.a);
        out.push(`<line x1="${ax}" y1="${az}" x2="${bx}" y2="${bz}" stroke="${outdoor ? '#9fb6c4' : '#3b3936'}" stroke-width="${thick * PX}"/>`);
      }
      cur = Math.max(cur, h.b);
    }
  }

  // openings
  for (const o of house.openings.filter(o => o.floor === floor)) {
    const hs = hosts(o, rooms), h = hs[0];
    const wrong = bad.has(o.path);
    if (!h) {
      out.push(`<circle cx="${X(o.x)}" cy="${Y(o.z)}" r="9" fill="none" stroke="#e0245e" stroke-width="2.5"/>`);
      continue;
    }
    const e = edges(h.room.pts).find(e => Math.abs(-(o.x - e.x1) * e.dz + (o.z - e.z1) * e.dx) < 0.05 && Math.abs((o.x - e.x1) * e.dx + (o.z - e.z1) * e.dz - h.t) < 1e-6)!;
    const ax = o.x - e.dx * o.w / 2, az = o.z - e.dz * o.w / 2, bx = o.x + e.dx * o.w / 2, bz = o.z + e.dz * o.w / 2;
    // in the middle of the wall it's cut from: on the line between two rooms, just inside an outside wall
    const off = hs.length > 1 ? 0 : 0.004 + T / 2;
    const gap = `x1="${X(ax + e.nx * off)}" y1="${Y(az + e.nz * off)}" x2="${X(bx + e.nx * off)}" y2="${Y(bz + e.nz * off)}"`;
    if (o.type === 'pony') out.push(`<line ${gap} stroke="${wrong ? '#e0245e' : '#b9b2a6'}" stroke-width="${(off ? T : SHARED_T) * PX}"/>`);
    if (o.type === 'window' || o.type === 'glass') out.push(`<line ${gap} stroke="${wrong ? '#e0245e' : o.type === 'window' ? '#5aa7d6' : '#7cc4e8'}" stroke-width="5"/>`);
    if (o.type === 'door') {
      const into = rooms.find(r => r.name === o.swing);
      const ie = into && edges(into.pts).find(f => Math.abs(-(o.x - f.x1) * f.dz + (o.z - f.z1) * f.dx) < 0.05);
      const leaves = doorLeaves(o.w, into), stroke = wrong ? '#e0245e' : '#6b6f8c';
      if (ie && !leaves) {
        // sliding closet doors: two panels, one just behind the other
        for (const [t0, t1, d] of [[0, 0.52, 0.03], [0.48, 1, 0.09]]) {
          const p = (t: number) => [ax + (bx - ax) * t + ie.nx * d, az + (bz - az) * t + ie.nz * d];
          const [x1, z1] = p(t0), [x2, z2] = p(t1);
          out.push(`<line x1="${X(x1)}" y1="${Y(z1)}" x2="${X(x2)}" y2="${Y(z2)}" stroke="${stroke}" stroke-width="2"/>`);
        }
      } else if (ie) {
        // leaves drawn open at 90° from their hinges, with the swing arcs (a pair meets in the middle)
        const lw = o.w / leaves;
        for (const [hx, hz, ex, ez] of leaves === 2 ? [[ax, az, o.x, o.z], [bx, bz, o.x, o.z]] : [[ax, az, bx, bz]]) {
          const lx = hx + ie.nx * lw, lz = hz + ie.nz * lw;
          out.push(`<line x1="${X(hx)}" y1="${Y(hz)}" x2="${X(lx)}" y2="${Y(lz)}" stroke="${stroke}" stroke-width="2"/>`);
          out.push(`<path d="M ${X(lx)} ${Y(lz)} A ${lw * PX} ${lw * PX} 0 0 ${sweep(hx, hz, lx, lz, ex, ez)} ${X(ex)} ${Y(ez)}" fill="none" stroke="${wrong ? '#e0245e' : '#9a9db5'}" stroke-width="1" stroke-dasharray="3 3"/>`);
        }
      }
    }
    if (wrong) out.push(`<circle cx="${X(o.x)}" cy="${Y(o.z)}" r="${o.w * PX / 2 + 4}" fill="none" stroke="#e0245e" stroke-width="2"/>`);
  }

  // room names
  for (const r of rooms) {
    const c = polyInfo(r.pts);
    const area = c.area * (house.units === 'ft' ? 10.7639 : 1);
    out.push(`<text x="${X((c.minX + c.maxX) / 2)}" y="${Y((c.minZ + c.maxZ) / 2) - 4}" class="room" text-anchor="middle">${esc(r.name)}</text>`);
    out.push(`<text x="${X((c.minX + c.maxX) / 2)}" y="${Y((c.minZ + c.maxZ) / 2) + 12}" class="area" text-anchor="middle">${area.toFixed(0)} ${house.units === 'ft' ? 'sf' : 'm²'}</text>`);
  }

  const errors = house.issues.filter(i => i.level === 'error').length, warnings = house.issues.length - errors;
  out.push(`<text x="${PAD}" y="${H - 18}" class="title">${esc(house.title)} · ${house.floors[floor]?.name ?? `floor ${floor}`} · grid ${step} ${house.units} · N ↑ · ${errors} errors, ${warnings} warnings</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">
<style>.axis{font-size:11px;fill:#9a958c}.item{font-size:10px;fill:#4b4f6e}.item.bad{fill:#e0245e;font-weight:bold}.room{font-size:14px;font-weight:bold;fill:#2d2d30;paint-order:stroke;stroke:#fbfaf8;stroke-width:4px}.area{font-size:11px;fill:#6b6f8c;paint-order:stroke;stroke:#fbfaf8;stroke-width:3px}.title{font-size:13px;fill:#2d2d30}</style>
${out.join('\n')}
</svg>`;
}

// SVG arc sweep flag that draws the swing on the room side
function sweep(ax: number, az: number, lx: number, lz: number, bx: number, bz: number) {
  const cross = (lx - ax) * (bz - az) - (lz - az) * (bx - ax);
  return cross > 0 ? 1 : 0;
}
