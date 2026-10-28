# 3D Room Engine

An interactive 3D dollhouse for exploring a home room by room. Houses are plain JSON files; the engine lays out the furniture, builds the walls and renders it with [three.js](https://threejs.org) through [React Three Fiber](https://r3f.docs.pmnd.rs).

- **Dollhouse overview**: hover a room for a pink outline and its name, click it to fly in. Walls facing the camera drop away so you can see inside.
- **Floors**: switch floors from the floor cards; upper floors lift off in one piece.
- **Walk mode**: "Walk this floor" puts you inside at eye height. Use W A S D or the arrow keys to walk, the mouse to look, Shift to run and Esc to leave. Walls and furniture block you; doorways and open glass doors let you through.
- **Room inventory**: the room card lists every item with its catalog price, a product link and the room total.
- **Real openings**: windows with frames and curtains, doors that stand open, archways, sliding glass doors, pony walls.
- **Any room shape**: rooms are polygons (L-shapes, notches); exterior walls get a continuous facade automatically.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

| URL | House |
| --- | --- |
| `/?house=family` | Two-storey family home, 12 rooms |
| `/?house=adu` | Detached ADU "Plan B" (1,200 sf), traced from a county standard floor plan |
| `/?house=cottage` | Two-bedroom cottage (900 sf) |

Add `&floor=2` to open a floor or `&room=Kitchen` to open a room directly.

## Making a house

A house is a JSON file in `src/houses/`: rooms as outlines, doors and windows on their walls, and furniture placed by relation ("against the north wall", "beside the bed", "around the table") instead of coordinates. Leave out a room's furniture and it's furnished automatically for its type. See **[docs/house-format.md](docs/house-format.md)**.

```sh
npm run validate adu       # every error and warning, with its path in the file
npm run shots -- adu       # out/adu/plan-1F.png (top-down plan) and floor-1F.png (3D); --rooms for each room
npm run items              # all furniture keys and sizes
```

To turn a floor plan PDF or image into a house file, use the pipeline below.

## Floor plan to 3D: the pipeline

`pipeline/` is an HTTP server that turns an uploaded floor plan (PDF or image) into a house: a LangGraph agent reads the plan with a vision model, writes the house file and keeps fixing it against the engine's validator and a rendered plan until it checks out. The result opens in the viewer with `?src=<house url>`. See [pipeline/README.md](pipeline/README.md).

## Project layout

| Path | What |
| --- | --- |
| `src/houses/` | House files |
| `src/layout/` | House format (Zod schema), item registry, placement solver, auto-furnish recipes, validator. Pure TypeScript |
| `src/engine/` | three.js builders: walls and openings, built-in furniture, catalog models, materials |
| `src/scene/` | React Three Fiber components: stage and camera, house animation, picking, walk mode |
| `src/ui/` | Overlay: house selector, floor cards, room card, walk HUD, plan viewer |
| `tools/` | Command-line tools (validate, shots, items, schema) |
| `pipeline/` | Floor plan → house server (LangGraph agent, Hono, SSE) |

`npm test` checks the placement rules, the sample houses and that every built-in model matches its declared size. `npm run check` type-checks.

## Catalog furniture models

Furniture can use real product models (`.glb`) from `public/assets/models/`, listed in `public/assets/models/manifest.json`:

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

Each model is turned to face front (`frontView`), scaled to its catalog size and stood on the floor; the placement solver uses the same size. Large scanned models should be simplified first (`npx gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 1024`).

The models and manifest aren't in this repository. Without them every item uses its built-in model, so the houses still render.
