// Walk mode: first person inside the house. W A S D / arrows to walk, mouse to look, Shift to run.
// Walls and furniture block you; doorways and the open half of glass doors let you through.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { T } from '../layout/constants';
import { edges, inside } from '../layout/geometry';
import { invalidate } from '../engine/frame';
import type { HouseRuntime, RoomRuntime } from '../engine/buildHouse';
import type { WallSegment } from '../engine/walls';
import { useStore } from '../store';
import { pointer } from './Picking';

const EYE = 1.6, BODY = 0.2, WALL_HALF = T + 0.01, WALK_SPEED = 1.5, RUN_SPEED = 3;
export const plcRef: { current: PointerLockControls | null } = { current: null };

export function Walk({ house }: { house: HouseRuntime }) {
  const { gl, camera } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const canvas = gl.domElement;
  const plc = useMemo(() => new PointerLockControls(camera, canvas), [camera, canvas]);
  const walk = useRef({ floor: 0, keys: new Set<string>(), vel: new THREE.Vector3(), pos: new THREE.Vector3(), bob: 0, segs: [] as WallSegment[], here: null as RoomRuntime | null }).current;
  const lockLook = () => { (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {}); };

  // Solid wall pieces on a floor: every room edge minus its doorways (windows stay solid)
  const wallSegments = (f: number) => {
    const segs: WallSegment[] = [];
    for (const r of house.rooms) {
      if (r.floor !== f) continue;
      for (const e of edges(r.data.pts)) {
        let cur = 0;
        for (const h of [...house.openingsOnEdge(f, e).filter(o => o.type !== 'window' && o.type !== 'pony'), { a: e.len, b: e.len }]) {
          if (h.a > cur) segs.push({ x: e.x1 + e.dx * cur, z: e.z1 + e.dz * cur, dx: e.dx, dz: e.dz, len: h.a - cur });
          cur = Math.max(cur, h.b);
        }
      }
    }
    return segs.concat(house.glassBlocks[f] ?? []);
  };

  // Keep the body (a circle of radius BODY) out of thick wall pieces and furniture boxes
  const resolve = (p: { x: number; z: number }, cx: number, cz: number) => {
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d < BODY && d > 1e-5) { p.x = cx + dx / d * BODY; p.z = cz + dz / d * BODY; }
  };
  const pushOut = (p: { x: number; z: number }) => {
    const clamp = THREE.MathUtils.clamp;
    for (let pass = 0; pass < 3; pass++) {
      for (const s of walk.segs) {
        const rx = p.x - s.x, rz = p.z - s.z;
        const u = clamp(rx * s.dx + rz * s.dz, 0, s.len), v = clamp(-rx * s.dz + rz * s.dx, -WALL_HALF, WALL_HALF);
        resolve(p, s.x + s.dx * u - s.dz * v, s.z + s.dz * u + s.dx * v);
      }
      for (const r of house.rooms) if (r.floor === walk.floor) for (const b of r.colliders)
        resolve(p, clamp(p.x, b.min.x, b.max.x), clamp(p.z, b.min.z, b.max.z));
    }
  };
  const blocked = (x: number, z: number) => {
    const p = { x, z };
    pushOut(p);
    return Math.hypot(p.x - x, p.z - z) > 1e-4;
  };
  // Free spot closest to the middle of the room
  const spawnPoint = (r: RoomRuntime) => {
    let best = { x: r.center.x, z: r.center.z }, bestD = Infinity;
    for (let x = r.minX + 0.3; x < r.maxX - 0.3; x += 0.15) {
      for (let z = r.center.z - r.d / 2 + 0.3; z < r.center.z + r.d / 2 - 0.3; z += 0.15) {
        if (!inside(r.data.pts, x, z) || blocked(x, z)) continue;
        const d = Math.hypot(x - r.center.x, z - r.center.z);
        if (d < bestD) { bestD = d; best = { x, z }; }
      }
    }
    return best;
  };

  const walking = useStore(s => s.walking), walkRoom = useStore(s => s.walkRoom);
  useEffect(() => {
    plcRef.current = plc;
    const change = () => invalidate();
    const lock = () => useStore.setState({ walkPaused: false });
    const unlock = () => useStore.setState({ walkPaused: true });
    plc.addEventListener('change', change);
    plc.addEventListener('lock', lock);
    plc.addEventListener('unlock', unlock);
    return () => {
      plc.removeEventListener('change', change);
      plc.removeEventListener('lock', lock);
      plc.removeEventListener('unlock', unlock);
      plc.dispose();
    };
  }, [plc]);

  useEffect(() => {
    if (!walking || walkRoom === null) return;
    const r = house.rooms[walkRoom];
    walk.floor = r.floor;
    walk.segs = wallSegments(r.floor);
    walk.here = null;
    const s = spawnPoint(r);
    walk.pos.set(s.x, 0, s.z);
    // look toward the middle of the room's back wall
    const tx = r.center.x - s.x, tz = r.center.z - r.d / 2 - s.z;
    camera.quaternion.setFromEuler(new THREE.Euler(-0.08, Math.atan2(-tx, -tz), 0, 'YXZ'));
    cam.fov = 70;
    cam.updateProjectionMatrix();
    lockLook();
    invalidate(true);
    return () => {
      walk.keys.clear();
      walk.vel.set(0, 0, 0);
      if (plc.isLocked) plc.unlock();
      cam.fov = 35;
      cam.updateProjectionMatrix();
      invalidate(true);
    };
  }, [walking, walkRoom]);

  // Keys and mouse while walking
  useEffect(() => {
    if (!walking) return;
    const down = (e: KeyboardEvent) => {
      walk.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      invalidate();
    };
    const up = (e: KeyboardEvent) => walk.keys.delete(e.code);
    const blur = () => walk.keys.clear();
    // Without pointer lock (or before clicking), dragging the mouse looks around
    const look = new THREE.Euler(0, 0, 0, 'YXZ');
    const drag = (e: PointerEvent) => {
      if (plc.isLocked || !pointer.downAt || !(e.buttons & 1)) return;
      look.setFromQuaternion(camera.quaternion);
      look.y -= e.movementX * 0.004;
      look.x = THREE.MathUtils.clamp(look.x - e.movementY * 0.004, -1.4, 1.4);
      camera.quaternion.setFromEuler(look);
      invalidate();
    };
    const downAt = { x: 0, y: 0 };
    const press = (e: PointerEvent) => { downAt.x = e.clientX; downAt.y = e.clientY; };
    const release = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) <= 5 && !plc.isLocked) lockLook();
    };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('blur', blur);
    canvas.addEventListener('pointermove', drag);
    canvas.addEventListener('pointerdown', press);
    canvas.addEventListener('pointerup', release);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
      removeEventListener('blur', blur);
      canvas.removeEventListener('pointermove', drag);
      canvas.removeEventListener('pointerdown', press);
      canvas.removeEventListener('pointerup', release);
    };
  }, [walking]);

  const fwd = new THREE.Vector3(), side = new THREE.Vector3();
  useFrame((_, delta) => {
    if (!useStore.getState().walking) return;
    const dt = Math.min(delta, 0.05);
    const k = walk.keys, has = (...codes: string[]) => codes.some(c => k.has(c));
    const f = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0);
    const sd = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    side.set(-fwd.z, 0, fwd.x);
    const want = fwd.multiplyScalar(f).addScaledVector(side, sd);
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(has('ShiftLeft', 'ShiftRight') ? RUN_SPEED : WALK_SPEED);
    walk.vel.lerp(want, 1 - Math.exp(-dt * 10));
    const speed = walk.vel.length();
    if (speed > 0.01) {
      const p = { x: walk.pos.x + walk.vel.x * dt, z: walk.pos.z + walk.vel.z * dt };
      pushOut(p);
      // never leave the house (front door, balcony railing gaps)
      if (house.rooms.some(r => r.floor === walk.floor && inside(r.data.pts, p.x, p.z))) walk.pos.set(p.x, 0, p.z);
      walk.bob += dt * speed * 5;
      invalidate();
    }
    camera.position.set(walk.pos.x, house.floors[walk.floor].position.y + EYE + Math.sin(walk.bob) * 0.03 * Math.min(1, speed), walk.pos.z);
    const here = house.rooms.find(r => r.floor === walk.floor && inside(r.data.pts, walk.pos.x, walk.pos.z));
    if (here && here !== walk.here) {
      walk.here = here;
      useStore.setState({ walkHere: `${here.floor + 1}F · ${here.name}` });
    }
  });

  return null;
}
