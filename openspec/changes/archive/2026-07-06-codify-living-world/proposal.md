## Why

The "living world" layer — cloaked citizens with street behaviors, the pooled ambient
wildlife of "The Returned", and the pooled vignette/particle systems (wind, pollen,
fireflies, smoke, banners, lanterns, drips, leaf scraps) — already ships in `entities.js`
and the hamlet-resident block of `main.js`, but none of it is spec-covered. The archived
capabilities only touch its edges (parcel-delivery specifies the departing receiver; the
errand/trial specs reference giver and trial-master NPCs). This change retroactively
codifies the rest so crowd density, role behaviors, and pooling contracts are testable.

## What Changes

- Codify the citizen crowd: day/night density (`lerp(5,17,dayF)` with market and Ash
  Quarter modifiers), street-grid spawning and movement, the role set (walk, lantern, chat,
  sweep, tend, vendor, customer, chase kids), greeting and collision push-out, the 88 m
  range cull, and the Hidden Hamlet residents. The mission-giver promotion and the
  departing receiver stay specified by `errands` and `parcel-delivery`.
- Codify the wildlife pools: cats, boars, frogs, canopy leapers, bird flocks, bats, and
  the raptor — spawn sources, caps, behaviors, day/night rosters, and cull distances.
- Codify ambient life: the global wind state and everything it drives — pollen and firefly
  drifters, chimney smoke, sweeper leaf scraps, swinging lanterns, morning drips, and
  cloth banners — as pooled, anchor-driven, allocation-free systems.
- No behavior changes; this is a retroactive codification of code already in the working tree.

## Capabilities

### New Capabilities
- `citizens-npcs`: the cloaked-citizen crowd — density, spawning, roles, interactions,
  culling, and the hamlet residents.
- `wildlife`: "The Returned" ambient animals — pools, rosters, and per-species behavior.
- `ambient-life`: wind and the pooled particle/vignette systems it drives.

### Modified Capabilities

(none — parcel-delivery's departure behavior and the giver/trial-master specs remain
authoritative for their NPCs; referenced in prose)

## Impact

- Specs only: `openspec/specs/citizens-npcs`, `openspec/specs/wildlife`,
  `openspec/specs/ambient-life`. No game code is modified.
- Documents existing code in `entities.js` (people, animals, vignettes, wind/particles)
  and `main.js` (hamlet residents), reading build-time anchors from chunk `colData`
  (lamps, stallAnchors, smokes, swingAnchors, dripAnchors, bannerAnchors, waters, pads).
