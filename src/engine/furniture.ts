// Built-in versions of every item, used when the catalog has no real model for it, and as the placeholder
// furniture of houses from the floor plan pipeline. Simple, toy-like shapes: soft rounded upholstery, flat
// colours. Each one is built facing +z with its back toward -z, standing on y = 0; buildItem() then centres it,
// so its footprint matches the size in layout/items.ts (checked by furniture.test.ts).
// `flip` mirrors an item left-right (which side a sectional's chaise is on).
import * as THREE from 'three';
import type { ItemKey, ItemOpts } from '../layout/items';
import { B, C, Cy, M, RB, Sp, paint, type Paint } from './materials';

type Build = (p: THREE.Group, o: ItemOpts) => void;
const LEGS: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

function sofa(p: THREE.Group, w: number, color: Paint) {
  for (const [lx, lz] of LEGS) B(p, 0.05, 0.08, 0.05, C.dark, lx * (w / 2 - 0.1), 0, lz * 0.36);
  RB(p, w, 0.36, 0.88, color, 0, 0.08, 0, 0.06);
  RB(p, w, 0.48, 0.2, color, 0, 0.44, -0.34, 0.07);
  RB(p, 0.18, 0.24, 0.88, color, -(w / 2 - 0.09), 0.44, 0, 0.07);
  RB(p, 0.18, 0.24, 0.88, color, w / 2 - 0.09, 0.44, 0, 0.07);
  const n = Math.max(2, Math.round(w / 0.75)), cw = (w - 0.36) / n;
  for (let i = 0; i < n; i++) RB(p, cw - 0.03, 0.1, 0.62, 0xf1efeb, -w / 2 + 0.18 + cw * (i + 0.5), 0.44, 0.08, 0.04);
}
function roundTable(p: THREE.Group, r: number, h: number, color: Paint = C.white) {
  Cy(p, r, 0.04, color, 0, h - 0.04);
  Cy(p, 0.04, h - 0.04, color);
  Cy(p, 0.22, 0.02, color);
}
function chair(p: THREE.Group, color: Paint, legs: Paint = C.dark, w = 0.44) {
  B(p, w, 0.05, w, color, 0, 0.45);
  B(p, w, 0.42, 0.04, color, 0, 0.5, -w / 2 + 0.02);
  for (const [lx, lz] of LEGS) B(p, 0.03, 0.45, 0.03, legs, lx * (w / 2 - 0.03), 0, lz * (w / 2 - 0.03));
}
function bed(p: THREE.Group, w: number, len: number, duvet: Paint) {
  B(p, w + 0.1, 0.28, len, C.wood);
  RB(p, w, 0.22, len - 0.08, C.white, 0, 0.28, 0.02, 0.06);
  RB(p, w + 0.04, 0.08, len * 0.62, duvet, 0, 0.5, len * 0.19, 0.035);
  const pillows = w > 1.2 ? [-w / 4, w / 4] : [0];
  for (const px of pillows) RB(p, w > 1.2 ? w / 2 - 0.14 : w - 0.3, 0.13, 0.36, C.offwhite, px, 0.5, -len / 2 + 0.3, 0.06);
  RB(p, w + 0.1, 0.95, 0.07, C.wood, 0, 0, -len / 2 - 0.02, 0.03);
}
// L-shaped sofa: a run along the back, and a chaise coming forward on the right (left when flipped)
function sectional(p: THREE.Group, w: number, d: number, color: Paint, flip: boolean) {
  const s = flip ? -1 : 1, seatD = 0.9;
  const z0 = -d / 2; // back edge
  RB(p, w, 0.36, seatD, color, 0, 0.08, z0 + seatD / 2, 0.06); // main seat
  RB(p, 0.9, 0.36, d - seatD, color, s * (w / 2 - 0.45), 0.08, z0 + seatD + (d - seatD) / 2, 0.06); // chaise
  RB(p, w, 0.48, 0.2, color, 0, 0.44, z0 + 0.1, 0.07); // back
  RB(p, 0.18, 0.24, seatD, color, -s * (w / 2 - 0.09), 0.44, z0 + seatD / 2, 0.07); // arm on the open end
  RB(p, 0.18, 0.24, d - 0.2, color, s * (w / 2 - 0.09), 0.44, z0 + 0.2 + (d - 0.2) / 2, 0.07); // arm along the chaise
  const n = Math.max(2, Math.round((w - 0.9) / 0.7)), cw = (w - 0.9 - 0.18) / n;
  for (let i = 0; i < n; i++) RB(p, cw - 0.03, 0.1, seatD - 0.26, 0xf1efeb, -s * (w / 2 - 0.18 - cw * (i + 0.5)), 0.44, z0 + 0.2 + (seatD - 0.26) / 2 + 0.02, 0.04);
  RB(p, 0.68, 0.1, d - 0.26, 0xf1efeb, s * (w / 2 - 0.18 - 0.36), 0.44, z0 + 0.2 + (d - 0.26) / 2 + 0.02, 0.04);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = lx * (w / 2 - 0.1), z = lz < 0 ? z0 + 0.1 : (Math.sign(x) === s ? d / 2 - 0.1 : z0 + seatD - 0.1);
    B(p, 0.05, 0.08, 0.05, C.dark, x, 0, z);
  }
}
function stool(p: THREE.Group, h: number, color: Paint) {
  Cy(p, 0.19, 0.05, color, 0, h - 0.05);
  for (const [lx, lz] of LEGS) B(p, 0.03, h - 0.05, 0.03, C.dark, lx * 0.12, 0, lz * 0.12);
  B(p, 0.3, 0.02, 0.02, C.dark, 0, h * 0.35, 0.12);
}
function shelves(p: THREE.Group) {
  const colors = [0xd9cbb4, 0x8f9aa6, 0xe8e2d6, 0x6f7f72, 0xb08f6a];
  B(p, 1.0, 1.8, 0.35, C.white);
  for (let i = 0; i < 3; i++) {
    B(p, 0.92, 0.02, 0.3, C.light, 0, 0.32 + i * 0.5, 0.03);
    for (let j = 0; j < 5; j++) if ((i * 5 + j) % 4 !== 3)
      B(p, 0.1, 0.24 + ((i + j) % 3) * 0.04, 0.24, colors[(i * 2 + j) % 5], -0.32 + j * 0.14, 0.34 + i * 0.5, 0.04);
  }
}
function lamp(p: THREE.Group) {
  Cy(p, 0.07, 0.02, C.white);
  Cy(p, 0.03, 0.22, C.white);
  Cy(p, 0.1, 0.2, M(C.offwhite, { emissive: 0xffe8c0, emissiveIntensity: 0.3 }), 0, 0.22, 0, 0.16);
}
function plant(p: THREE.Group) {
  Cy(p, 0.18, 0.38, C.white, 0, 0, 0, 0.13);
  Sp(p, 0.3, C.leaf, 0, 0.65, 0);
  Sp(p, 0.22, 0x6aa060, 0.14, 0.88, 0.06);
  Sp(p, 0.2, 0x4c7d45, -0.12, 0.82, -0.08);
}
const WORKTOP = 0x3a3a3d;
// Base cabinets with a worktop that ends flush, so counters, sinks, dishwashers, ranges and fridges stand right next to
// each other: a dark kick plate, a soft-edged door per 60 cm with a chunky handle, and a rounded worktop.
function baseCabinets(p: THREE.Group, len: number) {
  B(p, len, 0.08, 0.5, C.dark, 0, 0, -0.06);
  B(p, len, 0.77, 0.56, C.light, 0, 0.08, -0.03);
  const n = Math.max(1, Math.round(len / 0.6)), dw = len / n;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + dw * (i + 0.5);
    RB(p, dw - 0.016, 0.73, 0.03, C.white, x, 0.1, 0.265, 0.012);
    RB(p, Math.min(0.2, dw * 0.5), 0.025, 0.02, C.dark, x, 0.74, 0.29, 0.008);
  }
  RB(p, len, 0.05, 0.62, WORKTOP, 0, 0.85, 0, 0.015);
}
// A bowl set into the worktop: a steel rim around a darker recess, so it reads as a sink from any angle
function basin(p: THREE.Group, w: number, x: number) {
  RB(p, w, 0.012, 0.42, C.steel, x, 0.9, 0.02, 0.005);
  B(p, w - 0.06, 0.004, 0.36, 0x6f767d, x, 0.909, 0.02);
}
// Four burner rings on a black glass top
function hob(p: THREE.Group, w: number, x: number) {
  RB(p, w, 0.012, 0.44, C.black, x, 0.9, 0, 0.005);
  for (const [bx, bz] of [[-0.13, -0.1], [0.13, -0.1], [-0.13, 0.11], [0.13, 0.11]]) Cy(p, 0.075, 0.008, 0x4a4a4f, x + bx * (w / 0.56), 0.912, bz);
}
const mirror = () => M(0xdfeef5, { roughness: 0.05, metalness: 0.6 });
const glass = (opacity = 0.3) => M(0xcfe8f2, { transparent: true, opacity, roughness: 0.05 });

const BUILDERS: Record<ItemKey, Build> = {
  sofa: (p, o) => sofa(p, 2.2, paint(o.color, C.light)),
  loveseat: (p, o) => sofa(p, 1.8, paint(o.color, 0xf1efeb)),
  armchair: (p, o) => sofa(p, 1.0, paint(o.color, 0xd9cbb4)),
  coffee_table: p => roundTable(p, 0.45, 0.4),
  side_table: p => roundTable(p, 0.3, 0.5),
  tv_stand(p) {
    B(p, 1.8, 0.42, 0.4, C.white);
    B(p, 1.78, 0.01, 0.01, C.light, 0, 0.21, 0.2);
  },
  tv(p) {
    B(p, 0.4, 0.03, 0.2, C.black);
    B(p, 0.06, 0.08, 0.04, C.black, 0, 0.03);
    B(p, 1.5, 0.86, 0.05, C.black, 0, 0.05);
    B(p, 1.42, 0.78, 0.01, M(0x1d2733, { roughness: 0.15 }), 0, 0.09, 0.025);
  },
  bookcase: shelves,
  console_table(p) {
    B(p, 1.2, 0.9, 0.35, C.white);
    B(p, 0.01, 0.85, 0.01, C.light, 0, 0.03, 0.175);
  },
  floor_lamp(p) {
    Cy(p, 0.16, 0.03, C.dark);
    Cy(p, 0.02, 1.5, C.dark);
    Cy(p, 0.12, 0.28, M(C.offwhite, { emissive: 0xffe8c0, emissiveIntensity: 0.25 }), 0, 1.4, 0, 0.2);
  },
  table_lamp: lamp,
  piano(p) {
    B(p, 1.5, 1.2, 0.45, C.black, 0, 0, -0.08);
    B(p, 1.5, 0.08, 0.3, C.black, 0, 0.66, 0.28);
    B(p, 1.4, 0.03, 0.17, C.white, 0, 0.74, 0.3);
    for (const s of [-1, 1]) B(p, 0.08, 0.66, 0.08, C.black, s * 0.68, 0, 0.38);
    B(p, 0.8, 0.06, 0.34, C.black, 0, 0.45, 0.85);
    for (const [lx, lz] of LEGS) B(p, 0.04, 0.45, 0.04, C.black, lx * 0.35, 0, 0.85 + lz * 0.13);
  },
  beanbag(p, o) {
    const c = paint(o.color, 0xff6fa8);
    Sp(p, 0.36, c, 0, 0.22, 0).scale.set(1, 0.6, 1);
    Sp(p, 0.22, c, 0, 0.36, 0.16).scale.set(1.3, 0.8, 0.8);
  },

  sectional: (p, o) => sectional(p, o.w ?? 2.6, o.d ?? 1.9, paint(o.color, C.light), !!o.flip),
  ottoman: (p, o) => {
    RB(p, 0.6, 0.34, 0.6, paint(o.color, 0xd9cbb4), 0, 0.08, 0, 0.08);
    for (const [lx, lz] of LEGS) B(p, 0.04, 0.08, 0.04, C.dark, lx * 0.24, 0, lz * 0.24);
  },
  bench(p, o) {
    const w = o.w ?? 1.2;
    RB(p, w, 0.06, 0.4, C.wood, 0, 0.4, 0, 0.02);
    for (const s of [-1, 1]) B(p, 0.05, 0.4, 0.34, C.darkwood, s * (w / 2 - 0.08), 0, 0);
  },

  bed_queen: (p, o) => bed(p, 1.6, 2.1, paint(o.color, C.white)),
  bed_full: (p, o) => bed(p, 1.35, 2.0, paint(o.color, C.white)),
  bed_king: (p, o) => bed(p, 1.93, 2.1, paint(o.color, C.white)),
  bed_twin: (p, o) => bed(p, 0.95, 2.0, paint(o.color, C.white)),
  nightstand(p) {
    B(p, 0.45, 0.5, 0.4, C.wood);
    B(p, 0.4, 0.01, 0.01, C.darkwood, 0, 0.3, 0.2);
  },
  dresser(p) {
    B(p, 1.0, 0.85, 0.45, C.wood);
    for (let i = 0; i < 3; i++) {
      B(p, 0.94, 0.01, 0.01, C.darkwood, 0, 0.27 + i * 0.27, 0.225);
      B(p, 0.12, 0.02, 0.02, C.dark, 0, 0.15 + i * 0.27, 0.23);
    }
  },
  wardrobe(p, o) {
    const w = o.w ?? 1.2;
    B(p, w, 2.05, 0.6, C.white);
    B(p, 0.01, 1.95, 0.01, C.light, 0, 0.05, 0.3);
    B(p, 0.02, 0.3, 0.03, C.dark, -0.06, 0.95, 0.31);
    B(p, 0.02, 0.3, 0.03, C.dark, 0.06, 0.95, 0.31);
  },
  clothes_rack(p) {
    for (const s of [-0.55, 0.55]) { B(p, 0.03, 1.55, 0.03, C.steel, s); B(p, 0.03, 0.03, 0.45, C.steel, s); }
    B(p, 1.13, 0.03, 0.03, C.steel, 0, 1.52);
    [C.white, C.black, C.grey, C.offwhite, C.dark].forEach((c, i) => B(p, 0.06, 0.75, 0.42, c, -0.36 + i * 0.18, 0.75));
  },
  basket(p) {
    Cy(p, 0.24, 0.42, C.darkwood, 0, 0, 0, 0.2);
    Cy(p, 0.2, 0.02, C.offwhite, 0, 0.35);
  },
  desk(p, o) {
    const w = o.w ?? 1.2;
    B(p, w, 0.04, 0.6, C.wood, 0, 0.72);
    for (const [lx, lz] of LEGS) B(p, 0.04, 0.72, 0.04, C.white, lx * (w / 2 - 0.05), 0, lz * 0.25);
    B(p, 0.34, 0.02, 0.24, C.grey, 0.1, 0.76, 0.05);
    const screen = B(p, 0.34, 0.22, 0.015, C.dark, 0.1, 0.77, -0.08);
    screen.rotation.x = -0.25;
    Cy(p, 0.05, 0.02, C.white, -w / 2 + 0.2, 0.76);
    Cy(p, 0.012, 0.3, C.white, -w / 2 + 0.2, 0.76);
    Cy(p, 0.06, 0.1, C.white, -w / 2 + 0.2, 1.04, 0, 0.09);
  },
  office_chair: p => chair(p, C.wood, C.darkwood),

  dining_table: p => roundTable(p, 0.55, 0.76, C.wood),
  dining_table_rect(p, o) {
    const w = o.w ?? 1.6, d = o.d ?? 0.9;
    RB(p, w, 0.05, d, C.wood, 0, 0.71, 0, 0.02);
    for (const [lx, lz] of LEGS) B(p, 0.06, 0.71, 0.06, C.darkwood, lx * (w / 2 - 0.08), 0, lz * (d / 2 - 0.08));
  },
  bar_stool: (p, o) => stool(p, 0.75, paint(o.color, C.wood)),
  dining_chair: p => chair(p, C.white, C.wood, 0.42),
  chair: (p, o) => chair(p, paint(o.color, C.white)),
  counter(p, o) {
    const len = o.w ?? 2.4;
    baseCabinets(p, len);
    // sink and hob only where they fit on the worktop: a long run has both, a short one a sink, a filler neither
    if (len >= 1.3) {
      basin(p, 0.5, -len / 4);
      hob(p, 0.56, len / 4);
    } else if (len >= 0.6) basin(p, Math.min(0.5, len - 0.12), 0);
  },
  base_cabinet: (p, o) => baseCabinets(p, o.w ?? 1.2),
  kitchen_sink(p, o) {
    const w = o.w ?? 0.84, two = w >= 0.7, bw = two ? Math.min(0.36, (w - 0.16) / 2) : w - 0.16;
    baseCabinets(p, w);
    for (const s of two ? [-1, 1] : [0]) basin(p, bw, s * (bw / 2 + 0.02));
    // gooseneck faucet, low enough to sit under a window
    Cy(p, 0.022, 0.1, C.steel, 0, 0.9, -0.24);
    RB(p, 0.04, 0.02, 0.15, C.steel, 0, 1.0, -0.175, 0.009);
    Sp(p, 0.025, C.steel, 0.07, 0.925, -0.24);
  },
  dishwasher(p) {
    B(p, 0.6, 0.08, 0.5, C.dark, 0, 0, -0.06); // kick plate, in line with the cabinets
    B(p, 0.6, 0.77, 0.56, 0x9da3a9, 0, 0.08, -0.03);
    RB(p, 0.584, 0.65, 0.03, C.steel, 0, 0.1, 0.265, 0.014); // door
    RB(p, 0.584, 0.08, 0.03, 0x4a4d52, 0, 0.75, 0.265, 0.01); // control strip
    for (const bx of [-0.2, -0.13, -0.06]) Cy(p, 0.012, 0.006, C.white, bx, 0.79, 0.283).rotation.x = Math.PI / 2;
    Sp(p, 0.01, M(0x5ad1ff, { emissive: 0x5ad1ff, emissiveIntensity: 0.9 }), 0.2, 0.79, 0.28); // running light
    RB(p, 0.4, 0.03, 0.025, C.dark, 0, 0.67, 0.29, 0.01); // handle
    RB(p, 0.6, 0.05, 0.62, WORKTOP, 0, 0.85, 0, 0.015); // the worktop runs over it
  },
  range(p) {
    B(p, 0.76, 0.9, 0.64, C.steel, 0, 0, 0.01);
    B(p, 0.6, 0.38, 0.01, C.dark, 0, 0.22, 0.335); // oven window
    B(p, 0.5, 0.02, 0.03, C.dark, 0, 0.66, 0.345); // handle
    B(p, 0.76, 0.02, 0.62, C.black, 0, 0.9, 0);
    for (const [bx, bz] of [[-0.18, -0.13], [0.18, -0.13], [-0.18, 0.15], [0.18, 0.15]]) Cy(p, 0.09, 0.01, 0x3a3a3d, bx, 0.92, bz);
    B(p, 0.76, 0.12, 0.04, C.steel, 0, 0.9, -0.33); // back guard
  },
  island(p, o) {
    const w = o.w ?? 1.8, d = o.d ?? 0.9;
    B(p, w - 0.1, 0.88, d - 0.25, C.white, 0, 0, -0.1);
    for (let i = 1; i < (w - 0.1) / 0.6; i++) B(p, 0.01, 0.8, 0.01, C.light, -(w - 0.1) / 2 + i * 0.6, 0.04, -0.1 + (d - 0.25) / 2);
    RB(p, w, 0.04, d, 0x3a3a3d, 0, 0.88, 0, 0.01); // worktop with an overhang at the front for stools
  },
  fridge(p) {
    B(p, 0.76, 2.0, 0.66, 0xd5d9dc);
    B(p, 0.02, 0.5, 0.03, C.dark, -0.3, 1.2, 0.345);
  },
  wall_cabinets(p, o) {
    // same soft door fronts as the base cabinets, handles at the bottom
    const w = o.w ?? 1.6, n = Math.max(1, Math.round(w / 0.6)), dw = w / n;
    B(p, w, 0.7, 0.32, C.light, 0, 0, -0.015);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + dw * (i + 0.5);
      RB(p, dw - 0.016, 0.68, 0.025, C.white, x, 0.01, 0.1575, 0.012);
      RB(p, Math.min(0.2, dw * 0.5), 0.022, 0.01, C.dark, x, 0.06, 0.17, 0.004);
    }
  },

  toilet(p) {
    Cy(p, 0.2, 0.4, C.white, 0, 0, 0.08, 0.16);
    Cy(p, 0.21, 0.04, C.offwhite, 0, 0.4, 0.08);
    B(p, 0.44, 0.42, 0.18, C.white, 0, 0.32, -0.2);
  },
  sink(p) {
    B(p, 0.8, 0.8, 0.46, C.wood);
    B(p, 0.82, 0.04, 0.48, C.white, 0, 0.8);
    B(p, 0.46, 0.1, 0.32, C.white, 0, 0.84);
    B(p, 0.6, 0.75, 0.02, mirror(), 0, 1.2, -0.22);
  },
  bathtub(p) {
    B(p, 1.7, 0.55, 0.85, C.white);
    B(p, 1.52, 0.02, 0.68, M(0xa9d6ec, { roughness: 0.1 }), 0, 0.5);
  },
  shower(p) {
    B(p, 1.0, 0.06, 1.0, C.white);
    const g = glass();
    B(p, 1.0, 2.0, 0.02, g, 0, 0.06, 0.5);
    B(p, 0.02, 2.0, 1.0, g, 0.5, 0.06, 0);
    Cy(p, 0.1, 0.02, C.steel, -0.3, 1.9, -0.3);
  },
  shower_stall(p, o) {
    const w = o.w ?? 1.5, d = o.d ?? 0.8;
    RB(p, w, 0.08, d, C.white, 0, 0, 0, 0.03); // tray
    Cy(p, 0.04, 0.004, 0x6f767d, 0, 0.08, 0); // drain
    // glass front in a chrome frame; the walls close the other three sides
    B(p, w - 0.06, 1.95, 0.016, glass(), 0, 0.08, d / 2 - 0.015);
    for (const s of [-1, 1]) B(p, 0.03, 1.95, 0.03, C.steel, s * (w / 2 - 0.015), 0.08, d / 2 - 0.015);
    B(p, w, 0.03, 0.03, C.steel, 0, 2.03, d / 2 - 0.015);
    RB(p, 0.025, 0.4, 0.025, C.steel, w / 2 - 0.3, 0.85, d / 2 - 0.045, 0.01); // door handle
    // rain head on an arm from the back wall
    B(p, 0.025, 0.025, 0.25, C.steel, 0, 1.95, -d / 2 + 0.125);
    Cy(p, 0.12, 0.025, C.steel, 0, 1.925, -d / 2 + 0.27);
  },
  washer_dryer(p) {
    for (const y of [0, 0.86]) {
      B(p, 0.68, 0.84, 0.68, C.white, 0, y);
      const door = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.02, 28), M(C.dark));
      door.rotation.x = Math.PI / 2;
      door.position.set(0, y + 0.42, 0.35);
      p.add(door);
    }
  },
  water_heater(p) {
    Cy(p, 0.28, 1.4, C.white);
    Cy(p, 0.06, 0.12, C.steel, 0, 1.4);
    B(p, 0.12, 0.1, 0.04, C.dark, 0, 0.25, 0.28);
  },
  closet_rod(p, o) {
    // a shelf and rod across a reach-in closet, with clothes hanging
    const w = o.w ?? 1.8;
    B(p, w, 0.02, 0.38, C.white, 0, 1.72, -0.11);
    B(p, w * 0.6, 0.12, 0.3, C.darkwood, 0, 0, 0.04); // shoe rack on the floor
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, w - 0.04, 12), M(C.steel));
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, 1.62, -0.02);
    p.add(rod);
    const cols = [C.white, C.black, 0x8f9aa6, C.offwhite, 0xd9cbb4, C.dark, 0x6f7f72];
    for (let i = 0, n = Math.floor((w - 0.1) / 0.11); i < n; i++)
      B(p, 0.07, 0.75 + (i % 3) * 0.15, 0.56, cols[i % cols.length], -w / 2 + 0.1 + i * 0.11, 1.6 - (0.75 + (i % 3) * 0.15), 0);
  },
  washer(p) {
    B(p, 0.6, 0.85, 0.6, C.white);
    const door = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 28), M(C.dark));
    door.rotation.x = Math.PI / 2;
    door.position.set(0, 0.4, 0.31);
    p.add(door);
  },
  shelf: shelves,

  outdoor_table: p => roundTable(p, 0.35, 0.7),
  outdoor_chair: p => chair(p, C.white),
  outdoor_lounge(p) {
    B(p, 0.65, 0.3, 1.2, C.white, 0, 0, 0.25);
    B(p, 0.6, 0.06, 1.15, C.offwhite, 0, 0.3, 0.25);
    const back = B(p, 0.65, 0.08, 0.7, C.white, 0, 0.3, -0.62);
    back.rotation.x = 0.55;
    back.position.y = 0.55;
  },

  planter: plant,
  vase(p) {
    Cy(p, 0.08, 0.25, C.white, 0, 0, 0, 0.06);
    Sp(p, 0.1, C.leaf, 0, 0.32, 0);
  },
  bowl(p) {
    Cy(p, 0.15, 0.06, C.white, 0, 0, 0, 0.09);
    for (const [x, z] of [[-0.05, 0], [0.05, 0.02], [0, -0.05]]) Sp(p, 0.04, 0xd9a441, x, 0.07, z);
  },
  sculpture(p) {
    Cy(p, 0.06, 0.04, C.dark);
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 12, 28), M(0xc8b49a, { metalness: 0.4, roughness: 0.3 }));
    t.position.y = 0.16;
    t.castShadow = true;
    p.add(t);
  },
  rug: (p, o) => B(p, o.w ?? 2, 0.015, o.d ?? 1.4, paint(o.color, 0xcfc9bf)),
  frames(p) {
    for (const [w, h, dx, dy] of [[0.5, 0.65, -0.55, 0.18], [0.4, 0.4, 0, 0.48], [0.4, 0.4, 0, 0], [0.5, 0.65, 0.55, 0.18]]) {
      B(p, w, h, 0.03, C.black, dx, dy, 0.015);
      B(p, w - 0.08, h - 0.08, 0.01, C.offwhite, dx, dy + 0.04, 0.03);
    }
  },
  clock(p) {
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 32), M(C.black));
    face.rotation.x = Math.PI / 2;
    face.position.set(0, 0.17, 0.02);
    p.add(face);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.01, 32), M(C.white));
    inner.rotation.x = Math.PI / 2;
    inner.position.set(0, 0.17, 0.037);
    p.add(inner);
    B(p, 0.015, 0.1, 0.01, C.black, 0, 0.17, 0.045);
    B(p, 0.07, 0.015, 0.01, C.black, 0.035, 0.17, 0.045);
  },

  stairs(p, o) {
    const n = Math.round((o.d ?? 2.56) / 0.32), rail = o.rail === 'left' ? -1 : 1;
    for (let i = 0; i < n; i++) B(p, 1.0, 0.27 * (i + 1), 0.32, C.wood, 0, 0, -i * 0.32);
    B(p, 0.03, 0.9, n * 0.32, glass(0.35), rail * 0.52, 0.3, -(n - 1) * 0.16);
  },
  // Opening in the floor with steps going down and a glass railing
  stairwell(p, o) {
    const len = o.d ?? 2.4;
    B(p, 1.0, 0.012, len, 0x14151b);
    for (let i = 0; i < 7; i++) B(p, 0.94, 0.006, 0.12, M(C.wood, { color: new THREE.Color(C.wood).multiplyScalar(1 - i * 0.12) }), 0, 0.012, -len / 2 + 0.25 + i * 0.32);
    const g = glass(0.35);
    for (const s of [-1, 1]) B(p, 0.03, 0.9, len, g, s * 0.52);
    B(p, 1.07, 0.9, 0.03, g, 0, 0, len / 2);
  },
};

// The built-in version of an item as a group centred on x / z, front toward +z.
export function buildItem(key: ItemKey, opts: ItemOpts) {
  const inner = new THREE.Group();
  BUILDERS[key](inner, opts);
  const box = new THREE.Box3().setFromObject(inner);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, 0, -c.z);
  const g = new THREE.Group();
  g.add(inner);
  return g;
}
