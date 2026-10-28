import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { HOUSE_FILES } from './houses';
import { resolveHouse, type ResolvedHouse } from './layout/resolve';
import type { Catalog } from './layout/items';
import { HOME_POS, buildHouse } from './engine/buildHouse';
import { loadCatalog } from './engine/models';
import { Stage } from './scene/Stage';
import { HouseView } from './scene/HouseView';
import { Picking } from './scene/Picking';
import { Walk } from './scene/Walk';
import { Overlay } from './ui/Overlay';
import { useStore } from './store';

const params = new URLSearchParams(location.search);
const keys = Object.keys(HOUSE_FILES);
// ?src=<url of a house file> opens a house from elsewhere (e.g. the floor plan pipeline); ?house=<key> a bundled one
const src = params.get('src');
const houseKey = keys.includes(params.get('house') ?? '') ? params.get('house')! : keys[0];

interface Source { key: string; data: unknown; href: string }

export function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [remote, setRemote] = useState<Source | null | undefined>(src ? undefined : null);
  useEffect(() => {
    loadCatalog().then(setCatalog);
    if (src) fetch(src).then(r => r.json()).then(data => setRemote({ key: 'uploaded', data, href: location.search })).catch(err => {
      console.error(`Could not load house from ${src}`, err);
      setRemote(null);
    });
  }, []);
  if (!catalog || remote === undefined) return <div id="bg" />;
  return <House catalog={catalog} source={remote ?? { key: houseKey, data: HOUSE_FILES[houseKey], href: `?house=${houseKey}` }} />;
}

function House({ catalog, source }: { catalog: Catalog; source: Source }) {
  const house = useMemo(() => resolveHouse(source.key, source.data, catalog), [catalog, source]);
  const runtime = useMemo(() => buildHouse(house, catalog), [house, catalog]);
  const ready = useStore(s => s.ready);
  const houses = useMemo(() => {
    const list = keys.map(key => {
      const h = HOUSE_FILES[key] as { title?: string; subtitle?: string };
      return { key, title: h.title ?? key, subtitle: h.subtitle ?? '', href: `?house=${key}` };
    });
    if (!keys.includes(source.key)) list.push({ key: source.key, title: house.title, subtitle: house.subtitle, href: source.href });
    return list;
  }, [source, house]);

  useEffect(() => {
    useStore.setState({ furniture: { total: runtime.furniture, placed: 0 } });
    reportIssues(house);
    // ?floor=1 (1-based, like the 1F/2F labels) and ?room=<name> open a view directly
    const top = runtime.floors.length - 1;
    const floor = Number(params.get('floor')) - 1;
    useStore.getState().showFloor(floor >= 0 && floor <= top ? floor : top);
    const room = runtime.rooms.find(r => r.name === params.get('room') && (floor < 0 || r.floor === floor));
    if (room) {
      useStore.getState().showFloor(room.floor);
      setTimeout(() => useStore.getState().focusRoom(room.index), 400);
    }
    // for npm run shots: true once the house is up and every furniture model has loaded and been placed
    (window as unknown as { __ready: () => boolean }).__ready = () => {
      const { furniture, ready } = useStore.getState();
      return ready && furniture.placed >= furniture.total;
    };
    if (import.meta.env.DEV) (window as unknown as { __store: typeof useStore }).__store = useStore;
  }, [house, runtime]);

  return (
    <>
      <div id="bg" />
      <div id="stage" className={ready ? 'ready' : ''}>
        <Canvas
          frameloop="demand"
          dpr={[1, 1.5]}
          shadows="soft"
          gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1 }}
          camera={{ fov: 35, near: 0.1, far: 200, position: HOME_POS.toArray() }}
        >
          <Stage house={runtime} />
          <HouseView house={runtime} />
          <Picking house={runtime} />
          <Walk house={runtime} />
        </Canvas>
      </div>
      <Overlay house={house} runtime={runtime} houses={houses} />
    </>
  );
}

// Problems in the house file show up in the browser console too (npm run validate prints the same list)
function reportIssues(house: ResolvedHouse) {
  if (!house.issues.length) return;
  console.groupCollapsed(`House "${house.key}": ${house.issues.length} issue(s) — run npm run validate ${house.key}`);
  for (const i of house.issues) (i.level === 'error' ? console.error : console.warn)(`${i.path} ${i.where}: ${i.msg}`);
  console.groupEnd();
}
