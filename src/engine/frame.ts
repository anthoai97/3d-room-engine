import type * as THREE from 'three';
// Render on demand: anything that changes the picture calls invalidate(). Shadows are only re-drawn when
// the scene itself changed (not when just the camera moved).
let request = () => {};
export const frameState = { shadow: true };

// Furniture models load in the background. When one is ready it waits here, and the stage adds the waiting
// ones while nothing is moving (their first draw uploads them to the GPU, which takes a moment), then lets
// them grow into place.
export interface Arrival { slot: THREE.Group; obj: THREE.Object3D; t: number }
export const arrivals: Arrival[] = [];

// The rooms have grown in after the opening (furniture is placed from then on)
export const motion = { roomsSettled: false };

export function setRequester(fn: () => void) {
  request = fn;
}

export function invalidate(shadow = false) {
  if (shadow) frameState.shadow = true;
  request();
}

// Getting an object ready on the GPU (shaders compiled, textures uploaded) before it's first drawn, so
// furniture popping in or a floor coming back into view doesn't stall a frame. Set up by the stage.
type Preparer = (obj: THREE.Object3D) => Promise<void>;
let preparer: Preparer | null = null;
const waiting: (() => void)[] = [];
export function setPreparer(fn: Preparer) {
  preparer = fn;
  waiting.splice(0).forEach(resolve => resolve());
}
export async function prepare(obj: THREE.Object3D) {
  if (!preparer) await new Promise<void>(resolve => waiting.push(resolve));
  await preparer!(obj);
}
