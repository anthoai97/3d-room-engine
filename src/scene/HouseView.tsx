// The house in the scene and everything that animates it: floors lifting off, rooms growing in and
// shrinking away, walls between the camera and the open room dropping to a stub, and the hover outline.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FLOOR_H } from '../layout/constants';
import { invalidate, motion } from '../engine/frame';
import type { HouseRuntime } from '../engine/buildHouse';
import { useStore } from '../store';

// Floors above the one you're on lift off up and away from the camera, in one piece
const LIFT = new THREE.Vector3(-4, 11, -6);
// Hover tag element, positioned next to the hovered room every frame
export const tagRef: { current: HTMLDivElement | null } = { current: null };

export function HouseView({ house }: { house: HouseRuntime }) {
  const { camera, size } = useThree();
  const { floors, rooms } = house;
  const top = floors.length - 1;

  // Intro: upper floors start lifted, every room grows up out of its floor
  useEffect(() => {
    if (top > 0) floors[top].position.set(0, top * FLOOR_H, 0).add(LIFT);
    for (const r of rooms) { r.k = 0.001; r.group.scale.y = 0.001; }
    invalidate(true);
  }, [floors, rooms, top]);

  // Which rooms are up: all of them, or only the opened one, or the whole floor you're walking
  // (none until the scene is ready, so the opening animation runs without hitches)
  const focused = useStore(s => s.focused), walking = useStore(s => s.walking), walkRoom = useStore(s => s.walkRoom), ready = useStore(s => s.ready);
  useEffect(() => {
    const walkFloor = walking && walkRoom !== null ? rooms[walkRoom].floor : null;
    for (const r of rooms) {
      r.goal = !ready ? 0 : walkFloor !== null ? Number(r.floor === walkFloor) : focused !== null ? Number(r.index === focused) : 1;
      if (r.ceiling) r.ceiling.visible = r.floor === walkFloor;
    }
    invalidate(true);
  }, [focused, walking, walkRoom, rooms, ready]);

  const hovered = useStore(s => s.hovered);
  useEffect(() => {
    rooms.forEach(r => { r.frame.visible = r.index === hovered; });
    invalidate();
  }, [hovered, rooms]);

  // reused every frame: allocating in the frame loop means garbage-collection pauses mid-animation
  const [tmp, floorGoal] = useMemo(() => [new THREE.Vector3(), new THREE.Vector3()], []);
  useFrame(() => {
    const { activeFloor, focused, hovered, ready } = useStore.getState();
    if (!ready) return;

    // Floors above the active one lift off (and hide once out of view); the active floor settles in place
    floors.forEach((f, i) => {
      floorGoal.set(0, i * FLOOR_H, 0);
      if (i > activeFloor) floorGoal.add(LIFT);
      const dist = f.position.distanceTo(floorGoal);
      if (dist > 0) {
        f.position.lerp(floorGoal, 0.085);
        if (dist < 0.001) f.position.copy(floorGoal);
        invalidate(true);
      }
      const show = i <= activeFloor || dist > 0.3;
      if (f.visible !== show) { f.visible = show; invalidate(true); }
    });
    // Floors under the active one are covered by it: skip their detailed models once it has landed
    const landed = floors[activeFloor].position.y === activeFloor * FLOOR_H;
    for (const r of rooms) for (const p of r.models) {
      const show = r.floor >= activeFloor || !landed;
      if (p.visible !== show) { p.visible = show; invalidate(true); }
    }

    let settled = true;
    for (const r of rooms) {
      if (r.k === r.goal) continue;
      settled = false;
      invalidate(true);
      r.k += (r.goal - r.k) * 0.12;
      if (Math.abs(r.goal - r.k) < 0.003) r.k = r.goal;
      r.group.scale.y = Math.max(r.k, 0.001);
      r.group.visible = r.k > 0.01;
    }
    if (settled) motion.roomsSettled = true;

    // Walls stand while a room on either side is up. Dollhouse cutaway: in the opened room, walls between
    // the camera and the room drop to a low stub.
    for (const w of house.walls) {
      const vx = camera.position.x - w.x, vz = camera.position.z - w.z, d = Math.hypot(vx, vz);
      let cut = false, roomK = 0;
      for (const s of w.sides) {
        roomK = Math.max(roomK, rooms[s.room].k);
        if (s.cuttable && s.room === focused && (vx * s.ox + vz * s.oz) / d > (w.cut ? 0.05 : 0.2)) cut = true;
      }
      w.cut = cut;
      const goal = w.cut ? 0.08 : 1;
      if (w.k !== goal) {
        w.k += (goal - w.k) * 0.15;
        if (Math.abs(goal - w.k) < 0.002) w.k = goal;
      }
      const sy = Math.max(w.k * roomK, 0.001);
      if (w.group.scale.y !== sy) { w.group.scale.y = sy; invalidate(true); }
      w.group.visible = roomK > 0.01;
    }

    // Keep the hover tag next to the room's right edge
    const h = hovered === null ? null : rooms[hovered];
    if (h && tagRef.current) {
      tmp.set(h.maxX, floors[h.floor].position.y + h.wallH, h.center.z).project(camera);
      tagRef.current.style.left = `${(tmp.x + 1) / 2 * size.width + 8}px`;
      tagRef.current.style.top = `${(1 - tmp.y) / 2 * size.height - 40}px`;
    }
  });

  return <>{floors.map((f, i) => <primitive key={i} object={f} />)}</>;
}
