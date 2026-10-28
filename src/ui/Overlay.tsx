// Everything drawn over the 3D view: house selector, floor cards, hover tag, room card with prices,
// walk button and HUD, loading pill, and the source floor plan viewer.
import { useEffect, useState } from 'react';
import type { HouseRuntime, InventoryItem, RoomRuntime } from '../engine/buildHouse';
import type { ResolvedHouse } from '../layout/resolve';
import { tagRef } from '../scene/HouseView';
import { plcRef } from '../scene/Walk';
import { useStore } from '../store';

const floorLabel = (r: RoomRuntime) => `${r.floor + 1}F`;
const money = (v: number, cur = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v);

export function Overlay({ house, runtime, houses }: { house: ResolvedHouse; runtime: HouseRuntime; houses: { key: string; title: string; subtitle: string; href: string }[] }) {
  const s = useStore();
  const focused = s.focused === null ? null : runtime.rooms[s.focused];
  const hovered = s.hovered === null ? null : runtime.rooms[s.hovered];

  // Esc closes the plan, leaves walk mode (once the pointer is free) or closes the open room
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const st = useStore.getState();
      if (st.planOpen) st.setPlanOpen(false);
      else if (st.walking) { if (!plcRef.current?.isLocked) st.stopWalk(); }
      else if (st.focused !== null) st.goHome();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);

  const startWalk = () => {
    const f = s.activeFloor, start = house.floors[f]?.walkStart;
    const r = focused ?? runtime.rooms.find(r => r.floor === f && r.name === start) ?? runtime.rooms.find(r => r.floor === f);
    if (r) s.startWalk(r.index);
  };

  return (
    <div className={s.walking ? 'walking' : ''}>
      <button id="back" className={focused ? 'show' : ''} title="Back to house" onClick={s.goHome}>«</button>

      <nav id="houses">
        {houses.map(h => (
          <a key={h.key} href={h.href} className={h.key === house.key ? 'active' : ''}>
            <b>{h.title}</b><span>{h.subtitle}</span>
          </a>
        ))}
      </nav>
      {house.plan && <button id="planBtn" onClick={() => s.setPlanOpen(true)}>Floor plan</button>}
      {house.plan && s.planOpen && <PlanViewer plan={house.plan} onClose={() => s.setPlanOpen(false)} />}

      <nav id="floors">
        {runtime.floors.map((_, f) => f).reverse().map(f => (
          <div key={f} className={`floor${f === s.activeFloor ? ' active' : ''}`} onClick={() => s.showFloor(f)}>
            <div className="head">
              <b>{f + 1}F</b><span>{house.floors[f]?.name}</span><em>{runtime.rooms.filter(r => r.floor === f).length} rooms</em>
            </div>
          </div>
        ))}
      </nav>

      <button id="walk" className={focused ? 'beside-back' : ''} onClick={startWalk}>Walk this floor</button>

      <div id="tag" ref={tagRef} className={hovered ? 'show' : ''}>
        <div className="fl">{hovered && floorLabel(hovered)}</div>
        <div className="nm">{hovered?.name}</div>
      </div>

      <LoadingPill />
      <RoomCard room={focused} onClose={s.goHome} />

      <div id="walkHud" className={`${s.walking ? 'show' : ''}${s.walkPaused ? ' paused' : ''}`}>
        <div className="cross" />
        <div className="where">{s.walkHere}</div>
        <div className="paused">Click to look around</div>
        <div className="help">W A S D / arrows to walk · mouse to look · Shift to run · Esc to stop</div>
        <button id="exitWalk" onClick={s.stopWalk}>Exit walk</button>
      </div>
    </div>
  );
}

// Furniture pieces in the house so far: the bar fills as they appear
function LoadingPill() {
  const { total, placed } = useStore(s => s.furniture), ready = useStore(s => s.ready);
  return (
    <div id="loading" className={ready && placed < total ? 'show' : ''}>
      <span>Furniture</span><b>{placed} / {total}</b><i><em style={{ width: `${total ? (placed / total) * 100 : 0}%` }} /></i>
    </div>
  );
}

// Room card: every item with its catalog price (blank when the item isn't in the catalog) and the total
function RoomCard({ room, onClose }: { room: RoomRuntime | null; onClose: () => void }) {
  // keep showing the last room while the card slides away
  const [shown, setShown] = useState<RoomRuntime | null>(room);
  useEffect(() => { if (room) setShown(room); }, [room]);
  const r = room ?? shown;
  const rows = new Map<string, InventoryItem & { qty: number }>();
  for (const it of r?.items ?? []) {
    const row = rows.get(it.name) ?? { ...it, qty: 0 };
    row.qty++;
    rows.set(it.name, row);
  }
  const list = [...rows.values()].sort((a, b) => (b.price ?? -1) * b.qty - (a.price ?? -1) * a.qty);
  const total = list.reduce((t, it) => t + (it.price ?? 0) * it.qty, 0);
  return (
    <div id="card" className={room ? 'show' : ''}>
      <small>{r && floorLabel(r)}</small>
      <h2>{r?.name}</h2>
      <p>{r?.desc}</p>
      <ul className="items">
        {list.map(it => (
          <li key={it.name}>
            {it.url ? <a className="name" href={it.url} target="_blank" rel="noopener">{it.name}</a> : <span className="name">{it.name}</span>}
            <span className="qty">{it.qty > 1 ? `×${it.qty}` : ''}</span>
            <span className="price">{it.price != null ? money(it.price * it.qty, it.currency) : ''}</span>
          </li>
        ))}
      </ul>
      <div className="total"><span>Total</span><b>{money(total)}</b></div>
      <button id="close" onClick={onClose}>« Back to house</button>
    </div>
  );
}

// Source floor plan (for houses traced from a plan); click the image to see it full size
function PlanViewer({ plan, onClose }: { plan: NonNullable<ResolvedHouse['plan']>; onClose: () => void }) {
  const [zoom, setZoom] = useState(false);
  return (
    <div id="plan" className="show" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <header>
          <b>{plan.title}</b>
          <a href={plan.src} target="_blank" rel="noopener">Open full size ↗</a>
          <button className="x" title="Close" onClick={onClose}>×</button>
        </header>
        <div className="scroll"><img alt="Floor plan" src={plan.src} className={zoom ? 'zoom' : ''} onClick={() => setZoom(z => !z)} /></div>
      </div>
    </div>
  );
}
