// Every piece of furniture a house file can use. Pure data: the 3D builders live in engine/furniture.ts.
//
// `model` names a catalog product in public/assets/models/manifest.json. When it's there, the real model is
// used at its catalog size; otherwise the item is drawn with the simple built-in version, at `size`.
// Sizes are [width, depth, height] in metres, with the front of the item facing +z (its back toward -z).

export interface ItemOpts {
  w?: number; // width, for resizable items
  d?: number; // depth, for resizable items
  color?: string; // swatch name or #rrggbb, for colorable items
  rail?: 'left' | 'right'; // stairs: which side has the glass rail
  flip?: boolean; // mirror left-right (sectional: chaise on the left)
}

export type Mount = 'floor' | 'wall' | 'top';

export interface ItemDef {
  label: string; // name in the room's price list when there's no catalog product
  desc: string; // one line for docs and `npm run items`
  group: 'living' | 'bedroom' | 'dining' | 'kitchen' | 'bath' | 'outdoor' | 'decor' | 'structure';
  model?: string;
  size: (o: ItemOpts) => [number, number, number];
  mount?: Mount; // 'wall': hangs on a wall at `y`; 'top': small decor meant to stand `on` another item
  y?: number; // default height of the bottom of wall decor
  flat?: boolean; // rugs: you can walk and place things on them
  resizable?: boolean; // honours w / d
  colorable?: boolean;
  glass?: boolean; // see-through: fine in front of a window
  reachIn?: boolean; // used from outside its space (closet rods): fine in the way through a closet's opening
  inventory?: boolean; // counts in the room's price list (default true)
}

const fixed = (w: number, d: number, h: number) => () => [w, d, h] as [number, number, number];

export const ITEMS = {
  // ----- living -----
  sofa: { label: 'Sofa', desc: 'Three-seat sofa', group: 'living', model: 'sofa', size: fixed(2.2, 0.88, 0.92), colorable: true },
  loveseat: { label: 'Loveseat', desc: 'Two-seat sofa', group: 'living', model: 'loveseat', size: fixed(1.8, 0.88, 0.92), colorable: true },
  armchair: { label: 'Armchair', desc: 'Upholstered lounge chair', group: 'living', model: 'armchair', size: fixed(1.0, 0.88, 0.92), colorable: true },
  coffee_table: { label: 'Coffee table', desc: 'Round coffee table', group: 'living', model: 'coffee_table', size: fixed(0.9, 0.9, 0.4) },
  side_table: { label: 'Side table', desc: 'Small round side table', group: 'living', model: 'side_table', size: fixed(0.6, 0.6, 0.5) },
  tv_stand: { label: 'TV unit', desc: 'Low media console; put a `tv` on it', group: 'living', model: 'tv_stand', size: fixed(1.8, 0.4, 0.42) },
  tv: { label: 'TV', desc: 'Flat-screen TV; stand it `on` a tv_stand', group: 'living', model: 'tv', size: fixed(1.5, 0.2, 0.91), mount: 'top' },
  bookcase: { label: 'Bookcase', desc: 'Tall open bookcase, 1.8 m', group: 'living', model: 'bookcase', size: fixed(1.0, 0.35, 1.8) },
  console_table: { label: 'Console table', desc: 'Narrow table for halls and entries', group: 'living', model: 'console_table', size: fixed(1.2, 0.35, 0.9) },
  floor_lamp: { label: 'Floor lamp', desc: 'Standing lamp', group: 'living', model: 'floor_lamp', size: fixed(0.4, 0.4, 1.68) },
  table_lamp: { label: 'Table lamp', desc: 'Lamp for nightstands, desks and consoles', group: 'living', model: 'table_lamp', size: fixed(0.32, 0.32, 0.42), mount: 'top' },
  sectional: { label: 'Sectional sofa', desc: 'L-shaped sofa; chaise on the right as seen from the front (flip: left); w / d = overall size', group: 'living', size: o => [o.w ?? 2.6, o.d ?? 1.9, 0.92], resizable: true, colorable: true },
  ottoman: { label: 'Ottoman', desc: 'Padded footstool', group: 'living', size: fixed(0.6, 0.6, 0.42), colorable: true },
  bench: { label: 'Bench', desc: 'Wooden bench (entries, foot of a bed); w = length', group: 'living', size: o => [o.w ?? 1.2, 0.4, 0.46], resizable: true },
  piano: { label: 'Piano', desc: 'Upright piano with bench', group: 'living', size: fixed(1.5, 1.33, 1.2) },
  beanbag: { label: 'Bean bag', desc: 'Bean bag seat', group: 'living', size: fixed(0.72, 0.72, 0.54), colorable: true },

  // ----- bedroom & study -----
  bed_queen: { label: 'Queen bed', desc: 'Queen bed with headboard (back = headboard)', group: 'bedroom', model: 'bed_queen', size: fixed(1.7, 2.16, 0.95), colorable: true },
  bed_full: { label: 'Full bed', desc: 'Double bed with headboard, 54" wide', group: 'bedroom', size: fixed(1.45, 2.06, 0.95), colorable: true },
  bed_king: { label: 'King bed', desc: 'King bed with headboard, 76" wide', group: 'bedroom', size: fixed(2.03, 2.16, 0.95), colorable: true },
  closet_rod: { label: 'Closet rod & shelf', desc: 'Shelf, hanging rod and clothes for a reach-in closet: put it on the closet\'s back wall; w = length', group: 'bedroom', size: o => [o.w ?? 1.8, 0.58, 1.74], resizable: true, reachIn: true },
  bed_twin: { label: 'Twin bed', desc: 'Single bed with headboard', group: 'bedroom', model: 'bed_twin', size: fixed(1.05, 2.06, 0.95), colorable: true },
  nightstand: { label: 'Nightstand', desc: 'Bedside table; put a table_lamp on it', group: 'bedroom', model: 'nightstand', size: fixed(0.45, 0.4, 0.5) },
  dresser: { label: 'Dresser', desc: 'Low chest of drawers', group: 'bedroom', model: 'dresser', size: fixed(1.0, 0.46, 0.85) },
  wardrobe: { label: 'Wardrobe', desc: 'Tall closet, 2.05 m', group: 'bedroom', size: o => [o.w ?? 1.2, 0.63, 2.05], resizable: true },
  clothes_rack: { label: 'Clothes rack', desc: 'Open rail with hanging clothes', group: 'bedroom', size: fixed(1.13, 0.45, 1.55) },
  basket: { label: 'Basket', desc: 'Laundry basket', group: 'bedroom', size: fixed(0.48, 0.48, 0.42) },
  desk: { label: 'Desk', desc: 'Writing desk with monitor and lamp', group: 'bedroom', model: 'desk', size: o => [o.w ?? 1.2, 0.6, 1.14], resizable: true },
  office_chair: { label: 'Desk chair', desc: 'Desk chair; put it `front` of a desk with a negative gap to tuck it in', group: 'bedroom', model: 'office_chair', size: fixed(0.44, 0.44, 0.92) },

  // ----- dining & kitchen -----
  dining_table: { label: 'Dining table', desc: 'Round dining table for four', group: 'dining', model: 'dining_table', size: fixed(1.1, 1.1, 0.76) },
  dining_chair: { label: 'Dining chair', desc: 'Dining chair; place `around` a dining_table', group: 'dining', model: 'dining_chair', size: fixed(0.42, 0.43, 0.92) },
  dining_table_rect: { label: 'Dining table', desc: 'Rectangular dining table; w / d resize it; place dining_chair around it', group: 'dining', size: o => [o.w ?? 1.6, o.d ?? 0.9, 0.76], resizable: true },
  bar_stool: { label: 'Bar stool', desc: 'Counter-height stool, for bars and islands', group: 'dining', size: fixed(0.38, 0.38, 0.75), colorable: true },
  chair: { label: 'Chair', desc: 'Simple chair', group: 'dining', size: fixed(0.44, 0.44, 0.92), colorable: true },
  counter: { label: 'Kitchen counter', desc: 'Base cabinets with worktop, sink and hob, for a quick kitchen; w = length. To match a drawn kitchen, use base_cabinet, kitchen_sink, dishwasher and range', group: 'kitchen', size: o => [o.w ?? 2.4, 0.62, 0.91], resizable: true },
  range: { label: 'Range', desc: 'Stove with oven, 30" wide; stands in a counter run (beside a counter)', group: 'kitchen', size: fixed(0.76, 0.71, 1.02) },
  island: { label: 'Kitchen island', desc: 'Free-standing island with an overhang at the front for stools; w / d = size', group: 'kitchen', size: o => [o.w ?? 1.8, o.d ?? 0.9, 0.92], resizable: true },
  fridge: { label: 'Fridge', desc: 'Tall fridge; put it `beside` the counter', group: 'kitchen', size: fixed(0.76, 0.68, 2.0) },
  wall_cabinets: { label: 'Wall cabinets', desc: 'Upper cabinets hung on a wall above the counter (keep them off windows); w = length', group: 'kitchen', size: o => [o.w ?? 1.6, 0.35, 0.7], mount: 'wall', y: 1.45, resizable: true },
  base_cabinet: { label: 'Base cabinets', desc: 'Plain base cabinets with worktop (no sink or hob), for the stretches of a counter run between sink and appliances; w = length', group: 'kitchen', size: o => [o.w ?? 1.2, 0.62, 0.9], resizable: true },
  kitchen_sink: { label: 'Kitchen sink', desc: 'Sink cabinet with a double-bowl sink and faucet, in a counter run; w = width', group: 'kitchen', size: o => [o.w ?? 0.84, 0.62, 1.02], resizable: true },
  dishwasher: { label: 'Dishwasher', desc: 'Built-in dishwasher, 24" wide, under the worktop; put it beside the kitchen_sink', group: 'kitchen', size: fixed(0.6, 0.62, 0.9) },

  // ----- bath & laundry -----
  toilet: { label: 'Toilet', desc: 'Toilet (back = tank)', group: 'bath', size: fixed(0.44, 0.58, 0.74) },
  sink: { label: 'Sink & mirror', desc: 'Vanity with basin and a mirror above', group: 'bath', size: fixed(0.82, 0.48, 1.95) },
  bathtub: { label: 'Bathtub', desc: 'Bathtub, long side against the wall', group: 'bath', size: fixed(1.7, 0.85, 0.55) },
  shower: { label: 'Glass shower', desc: 'Corner shower: glass on its front and right side, put it in a corner', group: 'bath', size: fixed(1.0, 1.01, 2.06), glass: true },
  shower_stall: { label: 'Shower', desc: 'Rectangular shower between walls (an alcove): glass front with a door; w / d as drawn, e.g. 72" x 30"', group: 'bath', size: o => [o.w ?? 1.5, o.d ?? 0.8, 2.06], resizable: true, glass: true },
  washer: { label: 'Washing machine', desc: 'Front-loading washer or dryer', group: 'bath', size: fixed(0.6, 0.62, 0.85) },
  washer_dryer: { label: 'Washer & dryer', desc: 'Stacked washer and dryer, for laundry closets', group: 'bath', size: fixed(0.68, 0.7, 1.7) },
  water_heater: { label: 'Water heater', desc: 'Tank water heater', group: 'bath', size: fixed(0.56, 0.58, 1.52), inventory: false },
  shelf: { label: 'Shelf', desc: 'Open utility shelf, 1.8 m', group: 'bath', size: fixed(1.0, 0.35, 1.8) },

  // ----- outdoor -----
  outdoor_table: { label: 'Bistro table', desc: 'Small round outdoor table', group: 'outdoor', model: 'outdoor_table', size: fixed(0.7, 0.7, 0.7) },
  outdoor_chair: { label: 'Outdoor chair', desc: 'Outdoor dining chair', group: 'outdoor', model: 'outdoor_chair', size: fixed(0.44, 0.44, 0.92) },
  outdoor_lounge: { label: 'Sun lounger', desc: 'Chaise lounge (front = foot end)', group: 'outdoor', model: 'outdoor_lounge', size: fixed(0.65, 1.77, 0.78) },

  // ----- decor -----
  planter: { label: 'Plant', desc: 'Potted plant; use `scale` 0.6-1 for smaller ones', group: 'decor', model: 'planter', size: fixed(0.68, 0.6, 1.1) },
  vase: { label: 'Vase', desc: 'Vase with greenery, for tables', group: 'decor', model: 'vase', size: fixed(0.2, 0.2, 0.42), mount: 'top' },
  bowl: { label: 'Bowl', desc: 'Decorative bowl, for coffee tables', group: 'decor', model: 'bowl', size: fixed(0.3, 0.3, 0.11), mount: 'top' },
  sculpture: { label: 'Sculpture', desc: 'Small sculpture, for dressers and shelves', group: 'decor', model: 'sculpture', size: fixed(0.2, 0.12, 0.26), mount: 'top' },
  rug: { label: 'Rug', desc: 'Flat rug; size with w / d, or `under` items to fit it around them', group: 'decor', size: o => [o.w ?? 2, o.d ?? 1.4, 0.015], flat: true, resizable: true, colorable: true },
  frames: { label: 'Picture frames', desc: 'Gallery of four frames, hangs on a wall', group: 'decor', size: fixed(1.6, 0.04, 0.88), mount: 'wall', y: 0.92 },
  clock: { label: 'Wall clock', desc: 'Round wall clock', group: 'decor', size: fixed(0.34, 0.05, 0.34), mount: 'wall', y: 1.73 },

  // ----- structure (not in the price list) -----
  stairs: { label: 'Stairs', desc: 'Straight stair going up toward its back; d = run length', group: 'structure', size: o => [1.04, o.d ?? 2.56, Math.round((o.d ?? 2.56) / 0.32) * 0.27], resizable: true, inventory: false },
  stairwell: { label: 'Stairwell', desc: 'Opening in an upper floor with steps down and a glass rail; d = length', group: 'structure', size: o => [1.07, o.d ?? 2.4, 0.9], resizable: true, inventory: false },
} satisfies Record<string, ItemDef>;

export type ItemKey = keyof typeof ITEMS;
export const ITEM_KEYS = Object.keys(ITEMS) as [ItemKey, ...ItemKey[]];
export const itemDef = (key: ItemKey): ItemDef => ITEMS[key];

// Named colours that match the house style. Prefer these over raw hex.
export const SWATCHES = {
  stone: 0xcfc9bf, linen: 0xd9cfbf, oat: 0xd8cfc2, cloud: 0xe2dcd4, mist: 0xd7e3e8, sand: 0xd9cbb4, cream: 0xf1efeb,
  white: 0xf6f4f0, grey: 0xa4a3a1, charcoal: 0x2a2a2e, green: 0x2f6a47, indigo: 0x3b3f6e, pink: 0xff6fa8, violet: 0x8f7cf0, plaid: -1,
} as const;

// Catalog entry shape (public/assets/models/manifest.json)
export interface CatalogEntry {
  file: string; title: string; width: number; depth: number; height: number;
  frontView?: number; price?: number | null; currency?: string; productUrl?: string;
}
export type Catalog = Record<string, CatalogEntry>;

// What will actually be drawn: the catalog product when there is one, else the built-in version.
export function footprint(key: ItemKey, opts: ItemOpts, catalog: Catalog, scale = 1) {
  const def = itemDef(key);
  const c = def.model ? catalog[def.model] : undefined;
  const [w, d, h] = c ? [c.width, c.depth, c.height] : def.size(opts);
  return { w: w * scale, d: d * scale, h: h * scale, model: c ? def.model : undefined };
}
