import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { WALL_IN } from './constants';
import { RoomLayout } from './place';
import { resolveHouse } from './resolve';

// A plain 4 m x 3 m room: x 0..4, z 0..3 (north is z = 0)
const room = { name: 'Bedroom', pts: [[0, 0], [4, 0], [4, 3], [0, 3]] as [number, number][] };
const fmt = (m: number) => `${m.toFixed(2)} m`;
const layout = (openings = []) => new RoomLayout(room, openings, {}, fmt);
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 3);

describe('placement', () => {
  it('puts an item against a wall, facing into the room', () => {
    const l = layout();
    const [bed] = l.place({ item: 'bed_queen', id: 'bed', wall: 'N' }).items;
    close(bed.z, WALL_IN + bed.d / 2); // back flush with the inner face of the north wall
    close(bed.x, 2); // free spot nearest the middle
    close(bed.rot, 0); // front toward +z (south)
  });

  it('measures along a wall from its west / north end', () => {
    const l = layout();
    const [a] = l.place({ item: 'dresser', wall: 'S', along: 0 }).items;
    close(a.x, WALL_IN + a.w / 2);
    close(Math.cos(a.rot), -1); // faces north
    const [b] = l.place({ item: 'dresser', wall: 'E', offset: 0.5 }).items;
    close(b.z, WALL_IN + 0.5 + b.w / 2);
  });

  it('puts a corner item with its back and left side on the walls', () => {
    const [s] = layout().place({ item: 'shower', corner: 'NW' }).items;
    close(s.x, WALL_IN + s.w / 2);
    close(s.z, WALL_IN + s.d / 2);
    close(s.rot, 0);
  });

  it('places beside, on, in front of and around other items', () => {
    const l = layout();
    const [bed] = l.place({ item: 'bed_queen', id: 'bed', wall: 'N' }).items;
    const [ns] = l.place({ item: 'nightstand', id: 'ns', beside: 'bed', side: 'right', gap: 0.05 }).items;
    close(ns.x, bed.x + bed.w / 2 + 0.05 + ns.w / 2);
    close(ns.z - ns.d / 2, bed.z - bed.d / 2); // backs lined up
    const [lamp] = l.place({ item: 'table_lamp', on: 'ns' }).items;
    close(lamp.y, ns.h);
    const t = layout();
    t.place({ item: 'dining_table', id: 'table', at: 'center' });
    const chairs = t.place({ item: 'dining_chair', around: 'table', count: 4 }).items;
    expect(chairs).toHaveLength(4);
    for (const c of chairs) close(Math.hypot(c.x - 2, c.z - 1.5), 0.55 + c.d / 2);
    // one on each side (a cross), not at the corners
    expect(chairs.map(c => [Math.round(c.x - 2), Math.round(c.z - 1.5)].join())).toEqual(['0,1', '0,-1', '1,0', '-1,0']);
  });

  it('takes compass sides for beside', () => {
    const l = layout();
    const [bed] = l.place({ item: 'bed_queen', id: 'bed', wall: 'N' }).items;
    const [ns] = l.place({ item: 'nightstand', beside: 'bed', side: 'W' }).items;
    expect(ns.x).toBeLessThan(bed.x);
    expect(l.place({ item: 'nightstand', beside: 'bed', side: 'S' }).problems[0].msg).toMatch(/front or back/);
  });

  it('keeps wall decor off doorways but lets it hang beside them', () => {
    const door = () => layout([{ type: 'door', x: 2, z: 0, w: 0.9, swing: 'Hall', where: 'door' }] as never);
    expect(door().place({ item: 'frames', wall: 'N', along: 0.5 }).problems.map(p => p.msg)).toContain('hangs over the door');
    const l = door();
    const [c] = l.place({ item: 'clock', wall: 'N' }).items; // finds a spot clear of the door
    expect(Math.abs(c.x - 2)).toBeGreaterThan(0.45 + 0.17 - 0.03);
    expect(l.place({ item: 'clock', wall: 'W', along: 0 }).problems).toEqual([]); // right beside the door's wall
  });

  it('reports overlaps and blocked doors', () => {
    const l = layout([{ type: 'door', x: 2, z: 0, w: 0.9, swing: 'Bedroom' }] as never);
    const res = l.place({ item: 'dresser', wall: 'N', along: 0.5 });
    expect(res.problems.map(p => p.msg)).toContain('blocks the swing of the door');
    const auto = l.place({ item: 'dresser', wall: 'N' });
    expect(auto.problems).toEqual([]); // without `along` it finds a free spot
    expect(l.place({ item: 'sofa', at: [2, 1.5] }).problems).toEqual([]);
    expect(l.place({ item: 'armchair', at: [2, 1.5] }).problems[0].msg).toMatch(/^overlaps sofa/);
  });
});

describe('sample houses', () => {
  const dir = path.join(import.meta.dirname, '../houses');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    it(`${file} has no errors without the catalog`, () => {
      const house = resolveHouse(file, JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')), {});
      expect(house.issues.filter(i => i.level === 'error')).toEqual([]);
    });
  }

  it('furnishes rooms by type when items are left out', () => {
    const house = resolveHouse('t', {
      title: 'Test', floors: [{ name: 'Ground' }],
      rooms: [{ name: 'Bed', type: 'bedroom', pts: [[0, 0], [3.5, 0], [3.5, 3.2], [0, 3.2]] }],
      openings: [{ type: 'door', room: 'Bed', wall: 'S', w: 0.85 }],
    }, {});
    expect(house.rooms[0].items.map(i => i.key)).toContain('bed_queen');
    expect(house.issues.filter(i => i.level === 'error')).toEqual([]);
  });

  it('converts feet and recentres the house', () => {
    const house = resolveHouse('t', {
      title: 'Test', units: 'ft', floors: [{ name: 'Ground' }],
      rooms: [{ name: 'A', pts: [[0, 0], [20, 0], [20, 10], [0, 10]], items: [] }],
    }, {});
    close(house.rooms[0].pts[0][0], -10 * 0.3048);
    close(house.rooms[0].pts[2][1], 5 * 0.3048);
  });
});
