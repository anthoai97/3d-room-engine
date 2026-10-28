// Default furniture for each room type, used when a room in a house file has a `type` but no `items`.
// Recipes use the same placement rules as hand-written items and simply skip anything that doesn't fit,
// so every room comes out in the house style without overlaps or blocked doors.
import { type Dir, polyInfo } from './geometry';
import type { MetricSpec, Placed, RoomLayout } from './place';
import type { RoomSpec } from './schema';

type Kind = NonNullable<RoomSpec['type']>;

// Walls longest first; walls with a door or opening go last.
function wallsByRoom(l: RoomLayout): Dir[] {
  const dirs = (['N', 'E', 'S', 'W'] as Dir[]).filter(d => l.wall(d));
  const busy = (d: Dir) => {
    const e = l.wall(d)!;
    return l.openings.filter(o => o.type !== 'window' && l.onEdge(e, o.x, o.z) != null).reduce((s, o) => s + o.w, 0);
  };
  return dirs.sort((a, b) => busy(a) - busy(b) || l.wall(b)!.len - l.wall(a)!.len);
}

// Try each spec in turn; return the first that fits.
function first(l: RoomLayout, ...specs: MetricSpec[]): Placed[] | null {
  for (const s of specs) {
    const r = l.tryPlace(s);
    if (r) return r;
  }
  return null;
}
const onWalls = (l: RoomLayout, base: Omit<MetricSpec, 'wall'>, walls = wallsByRoom(l)) => first(l, ...walls.map(wall => ({ ...base, wall })));
const inCorners = (l: RoomLayout, base: Omit<MetricSpec, 'corner'>) => first(l, ...(['NE', 'SW', 'NW', 'SE'] as const).map(corner => ({ ...base, corner })));

const RECIPES: Partial<Record<Kind, (l: RoomLayout) => void>> = {
  bedroom(l) {
    const twin = Math.min(...['N', 'E', 'S', 'W'].map(d => l.wall(d as Dir)?.len ?? 99)) < 2.6;
    const bed = onWalls(l, { item: twin ? 'bed_twin' : 'bed_queen', id: 'bed' });
    if (bed) {
      for (const side of ['right', 'left'] as const) {
        if (l.tryPlace({ item: 'nightstand', id: `ns-${side}`, beside: 'bed', side })) l.tryPlace({ item: 'table_lamp', on: `ns-${side}` });
      }
      l.tryPlace({ item: 'rug', under: 'bed', color: 'oat', gap: 0.25 });
    }
    if (onWalls(l, { item: 'dresser', id: 'dresser' })) l.tryPlace({ item: 'sculpture', on: 'dresser' });
    onWalls(l, { item: 'wardrobe' });
    inCorners(l, { item: 'planter', scale: 0.7 });
  },
  living(l) {
    const walls = wallsByRoom(l);
    const sofa = onWalls(l, { item: 'sofa', id: 'sofa' }, walls);
    if (sofa) {
      first(l, { item: 'coffee_table', id: 'coffee', front: 'sofa', gap: 0.45 }, { item: 'coffee_table', id: 'coffee', front: 'sofa', gap: 0.3 });
      if (l.byId.has('coffee')) l.tryPlace({ item: 'bowl', on: 'coffee' });
      // TV across the coffee table from the sofa
      if (first(l, ...[2.4, 2.0, 1.7].map(gap => ({ item: 'tv_stand' as const, id: 'tv-stand', front: 'sofa', gap })))) l.tryPlace({ item: 'tv', on: 'tv-stand' });
      l.tryPlace({ item: 'rug', under: ['sofa', 'coffee'], color: 'stone', gap: 0.25 });
      first(l, { item: 'floor_lamp', beside: 'sofa', side: 'left', gap: 0.1 }, { item: 'floor_lamp', beside: 'sofa', side: 'right', gap: 0.1 });
      first(l, { item: 'armchair', beside: 'coffee', side: 'right', gap: 0.3, face: 'coffee' }, { item: 'armchair', beside: 'coffee', side: 'left', gap: 0.3, face: 'coffee' });
    }
    onWalls(l, { item: 'bookcase' }, walls.slice(1));
    inCorners(l, { item: 'planter' });
  },
  dining(l) {
    if (l.tryPlace({ item: 'dining_table', id: 'table', at: 'center' })) {
      l.tryPlace({ item: 'vase', on: 'table' });
      if (!l.tryPlace({ item: 'dining_chair', around: 'table', count: 4 })) l.tryPlace({ item: 'dining_chair', around: 'table', count: 2 });
    }
    onWalls(l, { item: 'console_table' });
    inCorners(l, { item: 'planter', scale: 0.8 });
  },
  kitchen(l) {
    const walls = wallsByRoom(l);
    for (const wall of walls) {
      const len = l.wall(wall)!.len - 0.3 - 0.8;
      if (len < 1.2) continue;
      for (const w of [Math.min(3, len), Math.min(2, len), 1.2]) {
        if (!l.tryPlace({ item: 'counter', id: 'counter', wall, w, along: 0 })) continue;
        const fridgeRight = l.tryPlace({ item: 'fridge', beside: 'counter', side: 'right' });
        if (!fridgeRight) l.tryPlace({ item: 'fridge', beside: 'counter', side: 'left' });
        l.tryPlace({ item: 'range', beside: 'counter', side: fridgeRight ? 'left' : 'right', gap: 0 });
        first(l, ...[1.6, 1.2, 0.8].filter(cw => cw <= w).map(cw => ({ item: 'wall_cabinets' as const, wall, w: cw })));
        break;
      }
      if (l.byId.has('counter')) break;
    }
    // eat-in kitchens only
    if (polyInfo(l.room.pts).area > 16 && l.tryPlace({ item: 'dining_table', id: 'table', at: 'center' })) l.tryPlace({ item: 'dining_chair', around: 'table', count: 2 });
    inCorners(l, { item: 'planter', scale: 0.6 });
  },
  bath(l) {
    inCorners(l, { item: 'shower' }) ?? onWalls(l, { item: 'bathtub' });
    onWalls(l, { item: 'toilet' });
    onWalls(l, { item: 'sink' });
    l.tryPlace({ item: 'rug', at: 'center', w: 0.7, d: 1.0, color: 'mist' });
  },
  laundry(l) {
    if (onWalls(l, { item: 'washer', id: 'washer' })) l.tryPlace({ item: 'washer', beside: 'washer', gap: 0.05 });
    else onWalls(l, { item: 'washer_dryer' }); // a laundry closet: stacked
    onWalls(l, { item: 'shelf' });
    inCorners(l, { item: 'basket' });
  },
  office(l) {
    if (onWalls(l, { item: 'desk', id: 'desk' })) l.tryPlace({ item: 'office_chair', front: 'desk', gap: -0.2 });
    onWalls(l, { item: 'bookcase' });
    if (inCorners(l, { item: 'armchair', id: 'chair' })) l.tryPlace({ item: 'floor_lamp', beside: 'chair', side: 'left', gap: 0.1 });
    inCorners(l, { item: 'planter', scale: 0.7 });
  },
  game(l) {
    if (onWalls(l, { item: 'tv_stand', id: 'tv-stand' })) {
      l.tryPlace({ item: 'tv', on: 'tv-stand' });
      l.tryPlace({ item: 'beanbag', id: 'bag', front: 'tv-stand', gap: 1.2, color: 'pink', shift: [-0.5, 0] }) ?? l.tryPlace({ item: 'beanbag', front: 'tv-stand', gap: 1.0, color: 'pink' });
    }
    if (onWalls(l, { item: 'desk', id: 'desk' })) l.tryPlace({ item: 'office_chair', front: 'desk', gap: -0.2 });
    onWalls(l, { item: 'bookcase' });
  },
  hall(l) {
    onWalls(l, { item: 'frames' });
    onWalls(l, { item: 'console_table' });
    inCorners(l, { item: 'planter', scale: 0.6 });
  },
  entry(l) {
    if (onWalls(l, { item: 'console_table', id: 'console' })) l.tryPlace({ item: 'table_lamp', on: 'console' });
    inCorners(l, { item: 'planter', scale: 0.75 });
  },
  closet(l) {
    // a rod and shelf along the longest wall that fits one
    const walls = wallsByRoom(l).sort((a, b) => l.wall(b)!.len - l.wall(a)!.len);
    first(l, ...walls.flatMap(wall => [1.8, 1.2, 0.8].filter(w => w <= l.wall(wall)!.len - 0.2).map(w => ({ item: 'closet_rod' as const, wall, w }))));
  },
  outdoor(l) {
    if (l.tryPlace({ item: 'outdoor_table', id: 'table', at: 'center' })) l.tryPlace({ item: 'outdoor_chair', around: 'table', count: 2 });
    onWalls(l, { item: 'outdoor_lounge' });
    for (let i = 0; i < 3; i++) inCorners(l, { item: 'planter', scale: 0.8 });
  },
};

export function furnish(kind: Kind, l: RoomLayout) {
  RECIPES[kind]?.(l);
}
