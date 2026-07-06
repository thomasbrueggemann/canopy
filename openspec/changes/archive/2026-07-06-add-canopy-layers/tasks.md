> NOTE: These features are ALREADY IMPLEMENTED. This is a retroactive codification of
> shipped behavior into specs, so every task is checked as done.

## 1. L1 Bough Roads

- [x] 1.1 `addLimb` builds curved walkable limbs with mossy tops and narrow `bough` pads
- [x] 1.2 `addBoughRoads` spans trees↔trees and trees↔rooftops, 2–4 per chunk (more park/grove, fewer plaza)
- [x] 1.3 Spans attach at ~68% trunk height clamped to 14–20 m
- [x] 1.4 First-walk `boughwalk` message beat wired in `main.js`

## 2. L2 The Weave

- [x] 2.1 `addWeave` emits leaf platters (r 4–8, y 24–28) with `weave` pads at ~66% coverage
- [x] 2.2 Deepgreen biome raises coverage to ~90%
- [x] 2.3 Light-well gaps left open; no Weave over plaza/colossus/sinkhole
- [x] 2.4 First-walk `weavewalk` message beat wired in `main.js`

## 3. Cross-chunk continuity

- [x] 3.1 Global 5×5 cell grid addressed by `hash2(gx,gz,salt)`; owner cell emits whole platter
- [x] 3.2 Platter radii overhang borders for a seamless seam

## 4. Shade, fall, and sea integration

- [x] 4.1 `sunOcclusion` attenuates leaf pads 0.75; overhead-only cover (`pd.y > py + 0.5`)
- [x] 4.2 L1 below `CANOPY_Y` shaded; above it raw sun unless covered; `above` message beat
- [x] 4.3 `SAFE_LEAF` catches falls on `weave`/`bough`/`nest`/`net`/`lookout`
- [x] 4.4 Canopy-sea ring at y 26.5 revealed over `smooth(31,40,y)`, hidden below

## 5. Collision plumbing

- [x] 5.1 `colData.pads` carry `layer` tags read into `supportLayer` in the player support scan
- [x] 5.2 Scorch biome skips bough roads and Weave (exposure follows real shadow rays)
