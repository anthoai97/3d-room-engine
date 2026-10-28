# House file format

A house is one JSON file in `src/houses/`. It's pure data: rooms, doors and windows, and furniture described by where it goes ("against the north wall", "beside the bed"). The engine works out exact positions, builds the walls and renders it. Drop a new file in `src/houses/` and it appears in the house selector (`?house=<file name>`).

The schema is `house.schema.json` (generated from `src/layout/schema.ts` with `npm run schema`); start every file with `"$schema": "../../house.schema.json"` for editor completion.

```jsonc
{
  "$schema": "../../house.schema.json",
  "title": "Cottage",                 // house selector, big
  "subtitle": "1 floor · 850 sf",     // house selector, small
  "units": "ft",                      // "m" (default) or "ft": applies to EVERY length in the file
  "furniture": "catalog",             // or "placeholder": simple built-in models only, no products or prices
  "plan": { "src": "assets/plans/cottage.png", "title": "Cottage, sheet A1", "bounds": [212, 140, 2650, 1630] },
  "floors": [{ "name": "Ground floor", "walkStart": "Living room" }],
  "rooms": [ ... ],
  "openings": [ ... ]
}
```

## Coordinates

- Plan view, looking down. **x grows to the right (east), z grows down the page (south). North is the top of the plan.**
- Use the plan's own numbers: put the origin at a corner of the house (top-left is easiest) and measure in feet or metres. The house is centred automatically when it loads.
- **Units.** With `"units": "ft"`, every length you write is in feet: points, widths, offsets, gaps, `y`, `w`/`d`. Defaults you leave out are fixed real distances, given below in metres with feet in brackets (for example, the default `gap` in front of a sofa is 0.4 m [1.3 ft]). `npm run items -- --ft` lists item sizes in feet.
- `floor` is 0 for the ground floor, 1 for the one above. Upper floors stack exactly on the ground floor, so they share the same coordinates.

## Rooms

```jsonc
{
  "name": "Bedroom #1",               // unique on its floor
  "floor": 0,                         // default 0
  "type": "bedroom",                  // living dining kitchen bedroom bath laundry office hall entry closet game outdoor other
  "pts": [[27.25, 0], [37.33, 0], [37.33, 12], [27.25, 12]],
  "floorTex": "wood",                 // wood | tile | deck. Default: wood; tile for bath/laundry; deck outdoors
  "outdoor": false,                   // terrace / balcony: low wall with glass rail, no ceiling
  "desc": "Queen bed, nightstand and dresser.",
  "items": [ ... ]                    // leave out to furnish the room automatically for its `type`
}
```

- `pts` go around the room in order (either direction). Any shape works: L-shapes, notches.
- **Neighbouring rooms share edges exactly**: the same coordinates on both sides of a wall. There are no gaps for wall thickness: a wall between two rooms is centred on the edge they share, and an outside wall sits just inside the room's outline. Rooms on a floor must not overlap. Together they make up the house outline. Outside walls get a continuous facade automatically.
- An outside wall takes 0.124 m (≈ 5 in) off the inside of a room's outline; a wall shared with another room takes 0.06 m (≈ 2.4 in), half its thickness. A wall 6 ft long between two outside corners leaves about 5.2 ft for furniture.
- `type: "outdoor"` makes the room outdoor (low wall with a glass rail, deck floor, no ceiling); you don't also need `outdoor: true`.
- Halls and open areas are rooms too. An open-plan living + dining space is one room, or two rooms joined by a `pass` with `full: true` as wide as the wall they share (that removes the wall entirely).

## Openings: doors, windows, archways

```jsonc
{ "type": "door",   "between": ["Hall", "Bath"], "offset": 1.7, "w": 2.67 },          // opens into Bath (the second room)
{ "type": "window", "room": "Bath", "wall": "N", "offset": 2.5, "w": 3, "sill": 4.6 },  // on an outside wall
{ "type": "door",   "room": "Hall", "wall": "S", "offset": 1, "w": 3 },               // front door, opens into Hall
{ "type": "pass",   "between": ["Living", "Kitchen"], "wall": "N", "w": 9.5, "full": true },
{ "type": "glass",  "between": ["Living room", "Terrace"], "w": 1.6 }
```

| type | what it is | defaults |
| --- | --- | --- |
| `door` | hinged door, drawn open into `swing`. Wider than 1.2 m [3.9 ft]: a pair of doors. Into a `closet` room and 1 m [3.3 ft] or wider: sliding closet doors (nothing swings into the closet) | head 2.05 m |
| `window` | glass with frame, sill and curtains | sill 0.8 m, head 2.0 m |
| `pass` | open doorway / arch; `full: true` = no header, open to the ceiling | head 2.05 m |
| `glass` | full-height sliding glass door (half open) | |
| `pony` | low bar wall, 1.15 m, with a wood top | |

Where it goes, one of:

- `between: [a, b]`: on the wall rooms `a` and `b` share. A door opens into `b` unless `swing` names the other room. `offset` / `along` are measured on the shared stretch of wall only, from its west / north end. If the two rooms share walls on more than one side (L-shaped rooms), add `wall` = the side of room `a` it's on; the validator warns when this is needed.
- `room` + `wall`: on a wall of one room, usually an outside wall. `wall` is `N`, `E`, `S` or `W` (when several walls face that way, outside walls are picked first, then the longest), or an edge index `i` (the edge from `pts[i]` to `pts[i + 1]`).
- `x` + `z`: the exact centre on a room edge.

Along the wall: `offset` = distance from the wall's start to the near side of the opening, `along` = 0 (start) to 1 (end), or nothing to centre it. **A wall starts at its west end (north and south walls) or its north end (east and west walls)**: the left end or top end as you look at the plan. `swing` is the name of the room a door opens into. `floor` is needed only when a room name exists on more than one floor.

## Items: furniture

Each item names what it is (`npm run items` lists every key with its size) and **one** way to place it. They're placed in order, so an item can only refer to ids listed before it in the same room.

| placement | meaning | tune with |
| --- | --- | --- |
| `"wall": "N"` | back against that wall, facing into the room | `along` 0–1, `offset` (start of wall → near side of item), `gap` off the wall. No `along`/`offset` = the free spot nearest the middle (avoids doors, windows and other items) |
| `"corner": "NE"` | into the corner, back and left side against the two walls | `gap`; corner index `i` = the corner at `pts[i]` |
| `"at": [x, z]` / `"at": "center"` | free-standing at a point (file coordinates) or the room's most open spot | `face`, `rot` |
| `"on": "id"` | standing on top of another item (lamp on a nightstand, TV on its stand) | `shift` |
| `"beside": "id"` | next to another item, backs lined up | `side`: a compass side (`"W"`: the side of it toward the west), or `left` / `right` as seen standing in front of it; `gap` (default 0.05 m [2 in]) |
| `"front": "id"` | in front of another item, facing it | `gap` (default 0.4 m [1.3 ft]); negative tucks in (desk chair) |
| `"around": "id"` | `count` copies on its sides, facing it, starting at its front (chairs at a table): all four sides of a square or round table (4 make a cross), the two long sides of a long one | `count` (4), `gap` (0), `rot` turns the set (`90`: a pair at a square table goes left and right instead of front and back) |
| `"under": "id"` or `["id", ...]` | rug centred under the items, sized to cover them, kept off the walls | `gap` = margin (0.3 m [1 ft]), or `w` / `d` |

Fine-tuning that works with any placement: `face` (`N`/`E`/`S`/`W`, or an item id to look at), `rot` (extra degrees, counter-clockwise from above), `y` (height of the bottom: wall decor, shelves), `shift: [dx, dz]` (final nudge), `scale`, `id`.

Item options: `w` / `d` resize resizable items (`npm run items` marks them `w/d`: `rug`, `counter`, `base_cabinet`, `kitchen_sink`, `island`, `wall_cabinets`, `wardrobe`, `closet_rod`, `desk`, `dining_table_rect`, `bench`, `sectional`, `shower_stall`, `stairs`, `stairwell`); `color` (a swatch: `stone linen oat cloud mist sand cream white grey charcoal green indigo pink violet plaid`, or `#rrggbb`) colours rugs, bean bags and the built-in versions of sofas and beds; `rail: "left" | "right"` for stairs.

Items with a catalog model (`npm run items` shows `catalog`) use the real product at its real size, and its price shows in the room card. The rest use simple built-in models.

What counts as a problem:

- Furniture must not overlap other furniture or stick into walls.
- **Keep-clear space.** Furniture must stay out of:
  - the square a door sweeps when it opens (an error);
  - 0.6 m [2 ft] in front of every door and glass door, on both sides (a warning). For `pass` openings, only a path 1.2 m [4 ft] wide through the middle needs to stay clear, so a wide open-plan pass doesn't empty the wall beside it;
  - the area in front of a window, but only for items taller than 0.25 m above the sill (a warning).
- **Things on top count too.** A lamp or sculpture standing `on` a dresser under a window blocks the window even though the dresser doesn't.
- **Wall decor** (`frames`, `clock`, `wall_cabinets`) must not hang over a door, opening or window on its own wall. It may hang right beside one.
- **Rugs are never in the way** (you walk on them), so a rug placed `at` a spot can end up under furniture. Use `under` or `front` to tie it to the furniture.
- **Reach-in closets.** The 0.6 m clearance applies inside small rooms too. A closet holding a washer needs about 0.6 m [2 ft] of free floor behind its door.

```jsonc
"items": [
  { "item": "bed_queen", "id": "bed", "wall": "E" },
  { "item": "nightstand", "id": "ns-l", "beside": "bed", "side": "left" },
  { "item": "table_lamp", "on": "ns-l" },
  { "item": "nightstand", "id": "ns-r", "beside": "bed", "side": "right" },
  { "item": "table_lamp", "on": "ns-r" },
  { "item": "rug", "under": "bed", "color": "oat" },
  { "item": "dresser", "id": "dresser", "wall": "W", "along": 0.4 },
  { "item": "sculpture", "on": "dresser" },
  { "item": "planter", "corner": "SE", "scale": 0.7 }
]
```

Common groups:

- **Living**: `tv_stand` on a wall, `tv` on it, `sofa` `front` of the TV stand (gap ≈ 2 m [6.5 ft]), `coffee_table` `front` of the sofa (gap 0.4 m [1.3 ft]), `rug` `under` [sofa, coffee table], an `armchair` `beside` the coffee table with `face` at it, `floor_lamp` `beside` the sofa.
- **Dining**: `dining_table` `at` a point, `vase` on it, `dining_chair` `around` it.
- **Kitchen**: `counter` on a wall (`w` = length), `fridge` `beside` it, `wall_cabinets` on the same wall with no `along` (they find a spot clear of windows). To match a drawn kitchen piece by piece, build the run from `base_cabinet`, `kitchen_sink`, `dishwasher`, `range` and `fridge`, each `beside` the last with `gap` 0.
- **Study**: `desk` on a wall, `office_chair` `front` of it with a small `gap`.
- **Bath**: `shower` in a corner, `shower_stall` between walls, or `bathtub` on a wall; `toilet` and `sink` on walls; a small `rug`.
- **Stairs**: `stairs` on the ground floor (`wall` with `face` toward the bottom step) and a `stairwell` at the same spot on the floor above.

## Automatic furnishing

Leave out `items` and give the room a `type`: it's furnished by a recipe in `src/layout/recipes.ts` (bed + nightstands + lamps + rug for a bedroom, sofa + TV + coffee table for a living room, and so on). Recipes use the same placement rules and skip anything that doesn't fit, so they never overlap or block doors. Use them for quick drafts, then switch to explicit `items` for control.

## Checking your work

```sh
npm run validate adu        # errors and warnings with their path in the file
npm run shots -- adu        # out/adu/plan-1F.png (top-down) + floor-1F.png (3D); add --rooms for every room
npm run items               # every item key and its size (-- --ft for feet)
```

The validator catches:

- **Outlines**: overlapping rooms, self-crossing outlines, corners that almost touch a neighbour's wall (they should share it exactly).
- **Openings**: openings not on a wall or running past its end, overlapping openings, a door swinging into a room it isn't on, and rooms nobody can walk into.
- **Furniture**: items overlapping, sticking into walls, blocking a door swing or doorway, or standing in front of a window. Messages name the exact opening, e.g. `blocks the swing of the door Hall ↔ Bath`. When `wall` with no `along` can't find any free spot, you get `no free spot on the N wall`, followed by what it hits in the middle.

Errors must be fixed. Warnings are usually worth fixing too.

In the plan picture, rooms are coloured by floor type and walls are drawn as dark bands. Doors show their swing as a dashed arc, and the keep-clear space in front of openings is lightly shaded. Windows are blue. Every item is drawn as its footprint, labelled with its `id` (or key), with a short tick pointing to its front. Anything with a problem is red. The grid is labelled in the file's own coordinates.
