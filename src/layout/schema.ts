// The house file format (src/houses/*.json). This schema is the single source for the TypeScript types,
// the runtime check and the JSON Schema handed to editors and LLMs (npm run schema).
import { z } from 'zod';
import { ITEM_KEYS, SWATCHES } from './items';

const Num = z.number();
const Vec2 = z.tuple([Num, Num]);
const Dir = z.enum(['N', 'E', 'S', 'W']);
// A wall of a room: the compass side it's on (N = top of the plan), or an edge index (edge i runs from pts[i] to pts[i + 1]).
const WallRef = z.union([Dir, z.number().int().min(0)]);
const Color = z.union([z.enum(Object.keys(SWATCHES) as [keyof typeof SWATCHES]), z.string().regex(/^#[0-9a-fA-F]{6}$/)]);

export const ItemSpec = z.strictObject({
  item: z.enum(ITEM_KEYS).describe('What to place: a key from the item registry (npm run items)'),
  id: z.string().optional().describe('Name for this item, so later items can be placed relative to it'),

  // ---- where: exactly one of these ----
  wall: WallRef.optional().describe('Back against this wall of the room, facing into the room'),
  corner: z.union([z.enum(['NE', 'NW', 'SE', 'SW']), z.number().int().min(0)]).optional()
    .describe('Into this corner (or the corner at pts[i]), back and left side against the two walls'),
  at: z.union([Vec2, z.literal('center')]).optional().describe('Free-standing at [x, z] (house coordinates) or the room centre'),
  on: z.string().optional().describe('Standing on top of the item with this id'),
  beside: z.string().optional().describe('Next to the item with this id, lined up with its back'),
  front: z.string().optional().describe('In front of the item with this id, facing it'),
  around: z.string().optional().describe('Spread around the item with this id, facing it (chairs at a table); one entry places `count` copies'),
  under: z.union([z.string(), z.array(z.string())]).optional().describe('Rugs: centred under these items, sized to cover them'),

  // ---- fine-tuning ----
  along: z.number().min(0).max(1).optional().describe('wall: 0 = at the start corner (west or north end) ... 1 = at the end corner. Omit to take the free spot nearest the middle'),
  offset: Num.optional().describe('wall: distance from the start corner to the near side of the item'),
  gap: Num.optional().describe('Space between this item and the wall / the item it is placed against. Negative tucks in (chair under a desk)'),
  side: z.enum(['left', 'right', 'N', 'E', 'S', 'W']).optional().describe('beside: which side of the other item — a compass side (easiest), or left / right as seen standing in front of it'),
  count: z.number().int().min(1).max(12).optional().describe('around: how many (default 4)'),
  face: z.union([Dir, z.string()]).optional().describe('Override which way the front points: N/E/S/W, or the id of an item to look at'),
  rot: Num.optional().describe('Extra turn in degrees, counter-clockwise seen from above'),
  y: Num.optional().describe('Height of the bottom of the item (wall decor, shelves)'),
  shift: Vec2.optional().describe('Final nudge [dx, dz] in house coordinates'),
  scale: z.number().positive().optional(),
  w: z.number().positive().optional().describe('Width, for resizable items (rug, kitchen, wardrobe, desk, stairs)'),
  d: z.number().positive().optional().describe('Depth, for resizable items'),
  color: Color.optional().describe('Swatch name or #rrggbb, for colorable items drawn with the built-in model'),
  rail: z.enum(['left', 'right']).optional().describe('stairs: side of the glass rail'),
  flip: z.boolean().optional().describe('Mirror it left-right (sectional: chaise on the left as seen from the front)'),
});

export const Room = z.strictObject({
  name: z.string().min(1).describe('Shown on hover and in the room card; unique on its floor'),
  floor: z.number().int().min(0).default(0).describe('0 = ground floor'),
  pts: z.array(Vec2).min(3).describe('Outline in house coordinates, in order around the room. Neighbouring rooms share edges exactly'),
  type: z.enum(['living', 'dining', 'kitchen', 'bedroom', 'bath', 'laundry', 'office', 'hall', 'entry', 'closet', 'game', 'outdoor', 'other']).optional()
    .describe('Room kind. When `items` is left out, the room is furnished automatically for this kind'),
  floorTex: z.enum(['wood', 'tile', 'deck']).optional().describe('Default: wood indoors, tile for bath/laundry, deck outdoors'),
  outdoor: z.boolean().optional().describe('Terrace or balcony: low walls with a glass rail, no ceiling (default: true for type "outdoor")'),
  desc: z.string().default('').describe('One or two sentences for the room card'),
  items: z.array(ItemSpec).optional().describe('Furniture, placed in order; items can only refer to ids listed before them'),
});

export const Opening = z.strictObject({
  type: z.enum(['door', 'window', 'pass', 'glass', 'pony']).describe(
    'door: hinged door (a pair when wider than 1.2 m; sliding doors into a closet 1 m or wider); window; pass: open doorway; glass: full-height sliding glass door; pony: low bar wall (1.15 m)'),
  floor: z.number().int().min(0).optional().describe('Needed only when the room name exists on more than one floor'),
  w: z.number().positive().describe('Width of the opening'),

  // ---- where: one of these ----
  between: z.tuple([z.string(), z.string()]).optional().describe('On the wall shared by these two rooms. A door opens into the second one'),
  room: z.string().optional().describe('On a wall of this room (usually an outside wall); use with `wall`'),
  wall: WallRef.optional(),
  x: Num.optional().describe('Exact centre on a room edge, with z'),
  z: Num.optional(),
  along: z.number().min(0).max(1).optional().describe('0 = near the start corner (west / north end) ... 1 = near the end. Default: centred'),
  offset: Num.optional().describe('Distance from the start corner to the near side of the opening'),

  swing: z.string().optional().describe('door: the room the door opens into (default: the second `between` room, or `room`)'),
  sill: Num.optional().describe('window: height of the sill (default 0.8 m)'),
  head: Num.optional().describe('Height of the top of the opening (door 2.05 m, window 2.0 m)'),
  full: z.boolean().optional().describe('pass: full wall height, no header above'),
});

export const House = z.strictObject({
  $schema: z.string().optional(),
  title: z.string(),
  subtitle: z.string().default(''),
  units: z.enum(['m', 'ft']).default('m').describe('Unit of every length in this file. The house is centred automatically'),
  furniture: z.enum(['catalog', 'placeholder']).default('catalog')
    .describe('catalog: real products where the catalog has them. placeholder: simple built-in models for everything, no products or prices (houses from the floor plan pipeline, before furniture is chosen)'),
  plan: z.strictObject({
    src: z.string().describe('Image in public/, e.g. assets/plans/x.png'),
    title: z.string(),
    bounds: z.tuple([Num, Num, Num, Num]).optional().describe('Pixel box [left, top, right, bottom] of the house outline in the image, to overlay it on the plan preview'),
  }).optional().describe('Source floor plan, shown with the Floor plan button'),
  floors: z.array(z.strictObject({
    name: z.string(),
    walkStart: z.string().optional().describe('Room that walk mode starts in'),
  })).min(1),
  rooms: z.array(Room).min(1),
  openings: z.array(Opening).default([]),
});

export type ItemSpec = z.infer<typeof ItemSpec>;
export type RoomSpec = z.infer<typeof Room>;
export type OpeningSpec = z.infer<typeof Opening>;
export type HouseSpec = z.infer<typeof House>;
