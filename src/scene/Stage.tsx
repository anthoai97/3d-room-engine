// Lights, environment, shadow catcher, orbit controls and the camera's glide between views.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FLOOR_H } from '../layout/constants';
import { arrivals, frameState, invalidate, motion, setPreparer, setRequester } from '../engine/frame';
import type { HouseRuntime } from '../engine/buildHouse';
import { useStore } from '../store';

// Where the camera is gliding to; cleared as soon as the user grabs the view.
const camGoal: { pos: THREE.Vector3 | null; target: THREE.Vector3 | null } = { pos: null, target: null };
const growing: THREE.Group[] = []; // furniture easing into place

export function Stage({ house }: { house: HouseRuntime }) {
  const { gl, scene, camera, invalidate: r3fInvalidate } = useThree();

  // Render on demand; shadows only when the scene changed
  useEffect(() => {
    setRequester(r3fInvalidate);
    gl.shadowMap.autoUpdate = false;
    invalidate(true);
  }, [gl, r3fInvalidate]);
  // We draw the frame ourselves (priority 1 runs after every animation step), refreshing shadows when asked.
  // Shadows refresh in every frame where something moved: a frame drawn with the last frame's shadows puts
  // anything that moved away from the sun (a floor coming down, a wall dropping) inside its own old shadow,
  // so it blinks dark.
  // Furniture that has arrived goes in once the rooms have grown in, a few pieces per frame: each is drawn
  // once first, on its own and clipped to one pixel, which uploads it to the GPU without touching the rest
  // of the house, then it grows into place.
  const placeArrivals = () => {
    if (!arrivals.length || !motion.roomsSettled) return;
    const batch = arrivals.splice(0, 6);
    const added: THREE.Object3D[] = [];
    for (const { slot, obj } of batch) {
      const grow = new THREE.Group();
      grow.scale.setScalar(0.001);
      grow.add(obj);
      slot.add(grow);
      growing.push(grow);
      added.push(grow);
    }
    const mask = camera.layers.mask, shadows = gl.shadowMap.needsUpdate;
    const culled: THREE.Object3D[] = [];
    for (const g of added) g.traverse(o => { o.layers.set(1); if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
    sun.layers.enable(1);
    camera.layers.set(1);
    gl.shadowMap.needsUpdate = false;
    gl.setScissorTest(true);
    gl.setScissor(0, 0, 1, 1);
    gl.render(scene, camera);
    gl.setScissorTest(false);
    gl.shadowMap.needsUpdate = shadows;
    camera.layers.mask = mask;
    for (const g of added) g.traverse(o => o.layers.set(0));
    culled.forEach(o => { o.frustumCulled = true; });
    useStore.getState().furniturePlaced(batch.length);
    invalidate(true);
  };

  useFrame(() => {
    placeArrivals();
    // newly placed furniture eases up to full size
    for (let i = growing.length - 1; i >= 0; i--) {
      const g = growing[i], k = g.scale.x + (1 - g.scale.x) * 0.18;
      g.scale.setScalar(k > 0.995 ? 1 : k);
      if (k > 0.995) growing.splice(i, 1);
      invalidate(true);
    }
    if (frameState.shadow) {
      gl.shadowMap.needsUpdate = true;
      frameState.shadow = false;
    }
    gl.render(scene, camera);
  }, 1);

  // Compile every shader and upload every texture before the first animation, including things that start
  // hidden (ceilings, outlines, covered floors), then wait (briefly) for the furniture models.
  useEffect(() => {
    let cancelled = false;
    const upload = (obj: THREE.Object3D) => obj.traverse(o => {
      for (const m of [(o as THREE.Mesh).material ?? []].flat() as THREE.MeshStandardMaterial[])
        for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap, m.aoMap]) if (t) gl.initTexture(t);
    });
    // Draw everything once, clipped to a single pixel of the real canvas: the GPU only receives a mesh's
    // geometry the first time it's drawn, and the browser's GPU backend (Metal on Macs) finishes its pipelines
    // per kind of target, so it has to be this canvas, not an offscreen one. That (not just shader compiling)
    // is what stalls a frame when a floor comes into view.
    const warmUp = () => {
      const hidden: THREE.Object3D[] = [], culled: THREE.Object3D[] = [];
      scene.traverse(o => {
        if (!o.visible) { hidden.push(o); o.visible = true; }
        if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; }
      });
      gl.shadowMap.needsUpdate = true;
      gl.setScissorTest(true);
      gl.setScissor(0, 0, 1, 1);
      gl.render(scene, camera);
      gl.setScissorTest(false);
      hidden.forEach(o => { o.visible = false; });
      culled.forEach(o => { o.frustumCulled = true; });
      frameState.shadow = true;
    };
    setPreparer(async obj => { await gl.compileAsync(obj, camera, scene); upload(obj); });
    (async () => {
      const hidden: THREE.Object3D[] = [];
      scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
      await gl.compileAsync(scene, camera);
      upload(scene);
      hidden.forEach(o => { o.visible = false; });
      // The house itself is ready: furniture models keep loading in the background (see arrivals below)
      if (cancelled) return;
      warmUp();
      // let the (slow) warm-up frame and one ordinary frame pass while the view is still hidden
      for (let i = 0; i < 2; i++) { invalidate(true); await new Promise(resolve => requestAnimationFrame(resolve)); }
      if (cancelled) return;
      useStore.setState({ ready: true });
      invalidate(true);
    })();
    return () => { cancelled = true; motion.roomsSettled = false; };
  }, [gl, camera, scene, house]);

  // Soft studio light from every side
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(gl), 0.04).texture;
    scene.environment = env;
    return () => { env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);

  const sun = useMemo(() => {
    const s = new THREE.DirectionalLight(0xfff2e2, 2.6);
    s.position.set(8, 16, 10);
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 0.02;
    Object.assign(s.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 });
    return s;
  }, []);

  const controls = useMemo(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.minPolarAngle = 0.15;
    c.maxPolarAngle = 1.15;
    c.minDistance = 4;
    c.maxDistance = 60;
    return c;
  }, [camera, gl]);
  useEffect(() => {
    const stop = () => { camGoal.pos = camGoal.target = null; };
    const change = () => invalidate();
    controls.addEventListener('start', stop);
    controls.addEventListener('change', change);
    return () => {
      controls.removeEventListener('start', stop);
      controls.removeEventListener('change', change);
      controls.dispose();
    };
  }, [controls]);
  useEffect(() => { controls.target.copy(house.home.target); }, [controls, house]);

  // Fly to the floor overview or the focused room
  const focused = useStore(s => s.focused), activeFloor = useStore(s => s.activeFloor), homeNonce = useStore(s => s.homeNonce);
  useEffect(() => {
    const r = focused === null ? null : house.rooms[focused];
    if (r) {
      const s = Math.max(r.w, r.d) * 1.05 + 1;
      camGoal.target = r.center.clone().setY(r.floor * FLOOR_H);
      camGoal.pos = camGoal.target.clone().add(new THREE.Vector3(s * 0.45, s * 1.25, s * 0.85));
    } else {
      camGoal.target = house.home.target.clone().setY(activeFloor * FLOOR_H);
      camGoal.pos = camGoal.target.clone().add(house.home.offset);
    }
    invalidate();
  }, [focused, activeFloor, homeNonce, house]);

  const walking = useStore(s => s.walking);
  useEffect(() => { controls.enabled = !walking; }, [controls, walking]);

  useFrame(() => {
    if (useStore.getState().walking) return;
    if (camGoal.pos && camGoal.target) {
      camera.position.lerp(camGoal.pos, 0.07);
      controls.target.lerp(camGoal.target, 0.07);
      if (camera.position.distanceTo(camGoal.pos) < 0.01) camGoal.pos = camGoal.target = null;
      invalidate();
    }
    controls.update();
  });

  return (
    <>
      <primitive object={sun} />
      {/* soft shadow under the floating model */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.18} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <shadowMaterial color={0x000000} opacity={0.3} />
      </mesh>
    </>
  );
}
