// Hover a room for its outline and name, click to open it. Only the invisible room prisms of the active
// floor are tested, never the detailed furniture.
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { HouseRuntime } from '../engine/buildHouse';
import { useStore } from '../store';

// Shared with walk mode: where a drag started (null when the button is up)
export const pointer: { downAt: [number, number] | null } = { downAt: null };

export function Picking({ house }: { house: HouseRuntime }) {
  const { gl, camera } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const pick = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const { activeFloor } = useStore.getState();
      const targets = house.rooms.filter(r => r.floor === activeFloor && r.goal === 1).map(r => r.pick);
      const hit = raycaster.intersectObjects(targets, false)[0];
      return hit ? (hit.object.userData.room as number) : null;
    };
    const hover = (i: number | null) => {
      useStore.getState().setHovered(i);
      canvas.style.cursor = i === null ? 'grab' : 'pointer';
    };
    canvas.style.cursor = 'grab';

    const move = (e: PointerEvent) => {
      const s = useStore.getState();
      if (s.walking) return;
      if (s.focused === null && !pointer.downAt) hover(pick(e));
    };
    const leave = () => hover(null);
    const down = (e: PointerEvent) => { pointer.downAt = [e.clientX, e.clientY]; };
    const up = (e: PointerEvent) => {
      const moved = pointer.downAt && Math.hypot(e.clientX - pointer.downAt[0], e.clientY - pointer.downAt[1]) > 5;
      pointer.downAt = null;
      const s = useStore.getState();
      if (s.walking || moved || s.focused !== null) return;
      const r = pick(e);
      if (r !== null) s.focusRoom(r);
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointerup', up);
    return () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
    };
  }, [gl, camera, house]);

  // Opening a room or walking clears the hover outline
  const focused = useStore(s => s.focused), walking = useStore(s => s.walking);
  useEffect(() => {
    if (focused !== null || walking) gl.domElement.style.cursor = 'grab';
  }, [focused, walking, gl]);

  return null;
}
