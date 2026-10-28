// UI state shared by the 3D scene and the overlay. Per-frame animation values (room growth, wall cutaway,
// floor lift) stay on the scene objects themselves; only what the UI shows lives here.
import { create } from 'zustand';

interface State {
  activeFloor: number;
  hovered: number | null; // room index
  focused: number | null; // room index
  homeNonce: number; // bumps whenever the camera should fly back to the floor overview
  walking: boolean;
  walkRoom: number | null; // room walk mode started in
  walkHere: string; // "1F · Kitchen"
  walkPaused: boolean; // pointer not locked
  planOpen: boolean;
  furniture: { total: number; placed: number }; // catalog models: how many there are, how many are in the house
  ready: boolean; // the scene is compiled and the furniture loaded: the opening animation can start

  showFloor: (f: number) => void;
  focusRoom: (i: number) => void;
  goHome: () => void;
  setHovered: (i: number | null) => void;
  startWalk: (i: number) => void;
  stopWalk: () => void;
  setPlanOpen: (open: boolean) => void;
  furniturePlaced: (n: number) => void;
}

export const useStore = create<State>((set, get) => ({
  activeFloor: 0,
  hovered: null,
  focused: null,
  homeNonce: 0,
  walking: false,
  walkRoom: null,
  walkHere: '',
  walkPaused: true,
  planOpen: false,
  furniture: { total: 0, placed: 0 },
  ready: false,

  showFloor: f => set(s => ({ activeFloor: f, focused: null, hovered: null, homeNonce: s.homeNonce + 1 })),
  focusRoom: i => set({ focused: i, hovered: null }),
  goHome: () => set(s => ({ focused: null, hovered: null, homeNonce: s.homeNonce + 1 })),
  setHovered: i => { if (get().hovered !== i) set({ hovered: i }); },
  startWalk: i => set({ walking: true, walkRoom: i, focused: null, hovered: null, walkPaused: true }),
  stopWalk: () => set(s => ({ walking: false, walkRoom: null, focused: null, homeNonce: s.homeNonce + 1 })),
  setPlanOpen: open => set({ planOpen: open }),
  furniturePlaced: n => set(s => ({ furniture: { ...s.furniture, placed: s.furniture.placed + n } })),
}));
