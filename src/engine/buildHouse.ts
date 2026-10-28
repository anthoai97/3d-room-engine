// Resolved house -> three.js objects: one group per floor, and per room its floor, walls, furniture,
// pick prism, ceiling and hover outline.
import * as THREE from 'three';
import { FLOOR_H, LOW_H, WALL_H } from '../layout/constants';
import { edges, inside, polyInfo, toSegment, type Pt } from '../layout/geometry';
import { itemDef, type Catalog } from '../layout/items';
import type { Placed } from '../layout/place';
import type { ResolvedHouse, ResolvedRoom } from '../layout/resolve';
import { useStore } from '../store';
import { arrivals, invalidate } from './frame';
import { buildItem } from './furniture';
import { C, M, PINK, deckTex, piece, shade, texMat, tileTex, woodTex } from './materials';
import { mergeMeshes } from './merge';
import { loadModel } from './models';
import { openingsOnEdge, wallPieces } from '../layout/walls';
import { buildWall, type WallContext, type WallSegment } from './walls';

export interface InventoryItem { name: string; price: number | null; currency?: string; url?: string }

export interface RoomRuntime {
  index: number;
  data: ResolvedRoom;
  name: string; floor: number; outdoor: boolean; desc: string;
  group: THREE.Group;
  pick: THREE.Mesh;
  ceiling?: THREE.Mesh;
  frame: THREE.Group; // pink hover outline
  colliders: THREE.Box3[]; // furniture footprints for walk mode
  models: THREE.Group[]; // catalog models (kept out of the merged meshes)
  items: InventoryItem[];
  center: THREE.Vector3; w: number; d: number; minX: number; maxX: number; wallH: number;
  k: number; goal: number; // grow-in / shrink-away animation
}

// One stretch of wall. It belongs to the room on each side (one for outside walls, two for shared walls):
// it stays up while either room is shown, and drops for the camera when it's in front of the opened room.
export interface WallRuntime {
  group: THREE.Group;
  x: number; z: number; // centre
  x1: number; z1: number; x2: number; z2: number; // the stretch, for hanging pictures on it
  sides: { room: number; ox: number; oz: number; cuttable: boolean }[]; // ox / oz: outward from that room
  k: number; cut: boolean;
}

export interface HouseRuntime {
  floors: THREE.Group[];
  rooms: RoomRuntime[];
  walls: WallRuntime[];
  furniture: number; // catalog models to load and place
  glassBlocks: WallSegment[][];
  openingsOnEdge: WallContext['openingsOnEdge'];
  home: { target: THREE.Vector3; offset: THREE.Vector3 };
}

export const HOME_POS = new THREE.Vector3(7.5, 19, 13);
const HOME_AIM = new THREE.Vector3(0.5, 0, 0);

// Flat slab in the shape of the polygon, from y to y + h
function slab(g: THREE.Object3D, pts: Pt[], y: number, h: number, c: number | THREE.Material) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const m = shade(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }), M(c)));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  g.add(m);
  return m;
}

export function buildHouse(house: ResolvedHouse, catalog: Catalog): HouseRuntime {
  const nFloors = Math.max(house.floors.length, ...house.rooms.map(r => r.floor + 1));
  const floors = Array.from({ length: nFloors }, (_, i) => {
    const f = new THREE.Group();
    f.position.y = i * FLOOR_H;
    return f;
  });
  const glassBlocks: WallSegment[][] = [];
  // Point is inside some room on that floor (used to find outside walls and house corners)
  const inHouse = (f: number, x: number, z: number) => house.rooms.some(o => o.floor === f && inside(o.pts, x, z));
  const ctx = { openingsOnEdge: openingsOnEdge(house.openings), inHouse, glassBlocks };

  // Walls first, floor by floor, so pictures can be hung on them
  const walls: WallRuntime[] = [];
  floors.forEach((floorGroup, f) => {
    const onFloor = house.rooms.map((r, index) => ({ ...r, index })).filter(r => r.floor === f);
    for (const piece of wallPieces(onFloor)) {
      const w = buildWall(floorGroup, piece, ctx);
      const { e } = piece;
      walls.push({
        ...w, k: 1, cut: false,
        x1: e.x1 + e.dx * piece.t0, z1: e.z1 + e.dz * piece.t0, x2: e.x1 + e.dx * piece.t1, z2: e.z1 + e.dz * piece.t1,
        sides: [
          { room: piece.owner.index, ox: -e.nx, oz: -e.nz, cuttable: !piece.owner.outdoor },
          ...(piece.other ? [{ room: piece.other.index, ox: e.nx, oz: e.nz, cuttable: !piece.other.outdoor }] : []),
        ],
      });
    }
  });

  const rooms = house.rooms.map((data, index): RoomRuntime => {
    const info = polyInfo(data.pts);
    const wallH = data.outdoor ? LOW_H : WALL_H;
    const g = new THREE.Group();
    floors[data.floor].add(g);
    const r: RoomRuntime = {
      index, data, name: data.name, floor: data.floor, outdoor: data.outdoor, desc: data.desc,
      group: g, pick: null!, frame: null!, colliders: [], models: [], items: [],
      center: new THREE.Vector3((info.minX + info.maxX) / 2, 0, (info.minZ + info.maxZ) / 2),
      w: info.maxX - info.minX, d: info.maxZ - info.minZ, minX: info.minX, maxX: info.maxX, wallH, k: 1, goal: 1,
    };

    // thin light base + floor (extrude UVs are in world units, so repeat = 1 / tile size)
    slab(g, data.pts, -0.14, 0.12, 0xd6d0c7);
    const floorMat =
      data.floorTex === 'tile' ? texMat(tileTex(), 1 / 1.2, 1 / 1.2) :
      data.floorTex === 'deck' ? texMat(deckTex(), 1 / 1.8, 1 / 1.8, { roughness: 0.7 }) :
      texMat(woodTex(), 1 / 1.8, 1 / 1.8, { roughness: 0.45 });
    slab(g, data.pts, -0.02, 0.02, floorMat);

    const mine = walls.filter(w => w.sides.some(s => s.room === index));
    for (const it of data.items) {
      const p = placeItem(r, it, catalog);
      // Wall decor belongs to its wall, so it drops away with it when the wall is cut down for the camera
      if (itemDef(it.key).mount === 'wall' && mine.length) {
        const bx = it.x - Math.sin(it.rot) * it.d / 2, bz = it.z - Math.cos(it.rot) * it.d / 2;
        const dist = (w: WallRuntime) => toSegment(bx, bz, w.x1, w.z1, w.x2, w.z2).dist;
        floors[data.floor].updateMatrixWorld(true);
        mine.reduce((a, b) => (dist(b) < dist(a) ? b : a)).group.attach(p);
      }
    }

    // Merge the simple shapes in the room (catalog models stay separate)
    mergeMeshes(g, new Set(r.models));

    // Invisible prism used for hover / click picking, so the mouse never tests detailed furniture
    r.pick = slab(g, data.pts, 0, wallH, C.white);
    r.pick.visible = false;

    // Ceiling, only shown in walk mode; it doesn't block the sun so rooms stay bright inside
    if (!data.outdoor) {
      r.ceiling = slab(g, data.pts, WALL_H - 0.02, 0.02, M(0xf4f1ec, { emissive: 0xf4f1ec, emissiveIntensity: 0.45 }));
      r.ceiling.castShadow = false;
      r.ceiling.visible = false;
    }
    g.traverse(o => { o.userData.room = index; });

    // Thin pink hover outline following the room's shape, on top of the walls
    const frame = new THREE.Group();
    const fm = new THREE.MeshBasicMaterial({ color: PINK, depthTest: false });
    const ft = 0.08;
    for (const e of edges(data.pts)) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(e.len + ft, 0.04, ft), fm);
      m.position.set(e.mx, wallH + 0.07, e.mz);
      m.rotation.y = e.rot;
      m.renderOrder = 10;
      frame.add(m);
    }
    frame.visible = false;
    floors[data.floor].add(frame);
    r.frame = frame;
    return r;
  });

  // Each wall merged on its own (it gets cut down when zoomed in)
  for (const w of walls) mergeMeshes(w.group);

  // Frame the whole house: aim at its middle and pull the camera back in proportion to its size
  const all = polyInfo(house.rooms.flatMap(r => r.pts));
  const offset = HOME_POS.clone().sub(HOME_AIM).multiplyScalar(0.85 + Math.max(all.maxX - all.minX, all.maxZ - all.minZ) / 40);
  const target = new THREE.Vector3((all.minX + all.maxX) / 2, 0, (all.minZ + all.maxZ) / 2);
  return { floors, rooms, walls, furniture: rooms.reduce((n, r) => n + r.models.length, 0), glassBlocks, openingsOnEdge: ctx.openingsOnEdge, home: { target, offset } };
}

// One piece of furniture: the catalog model when there is one (built-in version if it fails to load).
function placeItem(r: RoomRuntime, it: Placed, catalog: Catalog): THREE.Group {
  const def = itemDef(it.key);
  const p = piece(r.group, it.x, it.z, it.rot);
  p.position.y = it.y;
  p.scale.setScalar(it.scale);
  const product = it.model ? catalog[it.model] : undefined;
  if (def.inventory !== false) {
    r.items.push(product
      ? { name: product.title, price: product.price ?? null, currency: product.currency, url: product.productUrl }
      : { name: def.label, price: null });
  }
  // walk-mode collider straight from the footprint (rugs and things on top of others don't block)
  if (!def.flat && it.y < 0.05 && it.h > 0.15) {
    const c = Math.abs(Math.cos(it.rot)), s = Math.abs(Math.sin(it.rot));
    const hx = (it.w * c + it.d * s) / 2, hz = (it.w * s + it.d * c) / 2;
    r.colliders.push(new THREE.Box3(new THREE.Vector3(it.x - hx, 0, it.z - hz), new THREE.Vector3(it.x + hx, it.h, it.z + hz)));
  }
  const fallback = () => {
    const obj = buildItem(it.key, it.opts);
    p.add(obj);
    return obj;
  };
  if (!product || !it.model) {
    fallback();
    return p;
  }
  r.models.push(p);
  loadModel(it.model, catalog).then(tpl => {
    const obj = tpl.clone();
    adopt(r, obj);
    arrivals.push({ slot: p, obj, t: performance.now() });
    invalidate();
  }).catch(err => {
    console.warn(`Could not load model "${it.model}"`, err);
    adopt(r, fallback());
    useStore.getState().furniturePlaced(1);
    invalidate(true);
  });
  return p;
}

// Give a loaded model to a room: shadows and picking.
function adopt(r: RoomRuntime, obj: THREE.Object3D) {
  obj.traverse(o => {
    o.userData.room = r.index;
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
}
