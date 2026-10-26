# 3D Room Engine

An interactive 3D dollhouse for exploring a home room by room, built with [three.js](https://threejs.org) in a single `index.html`.

- **Dollhouse overview**: hover a room for a pink outline and its name, click it to fly in. Walls facing the camera drop away so you can see inside.
- **Floors**: switch floors from the floor cards; upper floors lift off in one piece. Click a room chip to jump straight into it.
- **Walk mode**: "Walk this floor" puts you inside at eye height. W A S D / arrows to walk, mouse to look, Shift to run, Esc to leave. Walls and furniture block you; doorways and open glass doors let you through.
- **Room inventory**: the room card lists every item with its catalog price, a product link and the room total.
- **Real openings**: windows with frames and curtains, doors that stand open, archways, sliding glass doors, pony walls.
- **Any room shape**: rooms are polygons (L-shapes, notches); exterior walls get a continuous facade automatically.

## Run it

Any static file server works; the page loads three.js from a CDN.

```sh
python3 -m http.server 5173
# open http://localhost:5173
```

Two sample houses are included. Switch with the selector at the top right, or by URL:

| URL | House |
| --- | --- |
| `/?house=family` | Two-storey family home, 12 rooms |
| `/?house=adu` | Detached ADU "Plan B" (1,200 sf), traced from a county standard floor plan |

## Adding a house

Houses live in the `HOUSES` object in `index.html`. Each one has:

- `rooms`: `{ name, floor, pts, floorTex, outdoor?, desc, build(g) }`. `pts` is the room outline in metres as `[x, z]` points; `build` places furniture with the `F.*` helpers (or catalog models with `F.glb`).
- `openings`: doors and windows on room edges, `{ floor, type, x, z, w, ... }` with `type` one of `window`, `door` (`swing`: the room it opens into), `pass` (open doorway; `head: WALL_H` for no lintel), `glass` (full-height sliding door) or `pony` (low bar wall).
- `floorNames`, `walkStart` (room to start walk mode in, per floor), `title`, `subtitle`.

## Catalog furniture models

Furniture can use real product models (`.glb`) from `assets/models/`, listed in `assets/models/manifest.json`:

```json
{
  "sofa": {
    "file": "assets/models/sofa.glb",
    "title": "Product name",
    "width": 2.21, "depth": 0.91, "height": 0.93,
    "frontView": 0,
    "price": 1299, "currency": "USD",
    "productUrl": "https://..."
  }
}
```

Each model is turned to face front (`frontView`), scaled to its catalog size and stood on the floor. Large scanned models should be simplified first (about 15–40k triangles each) to keep the page smooth.

The models and manifest aren't in this repository. Without them every piece falls back to the built-in simple furniture, so the house still renders.
