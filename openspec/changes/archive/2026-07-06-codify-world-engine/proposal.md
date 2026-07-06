## Why

The archived feature specs (canopy-layers, waytrees, ladders, winch-lifts, weather-events, story, puzzles, …) all sit on an unspecced world engine: the chunk streamer, the day-night sky, the biome/district identity system, the anomaly landmarks (colossus, fallen tower, sinkhole, reservoir, viaduct, canals, oddities), and the `?shot` screenshot/smoke harness in `core.js` / `worldgen-*.js` / the main loop. This change retroactively codifies those engine contracts exactly as shipped so the determinism and performance invariants everything else relies on are written down.

## What Changes

- Codify chunk streaming: the 64 m chunk grid, 7×7 residency window, build budget with a synchronous immediate ring, retirement/disposal rules, deterministic rebuild (RNG discipline), the `colData` contract, and geometry batching.
- Codify the day-night cycle: the 600 s day clock (T fast-forward), sun/day/night factors, sky dome and bodies, the sun→moon light handoff, night emissive drives, the dawn dew window, the night lamp-light pool, and altitude fog.
- Codify districts and regions: chunk-type assignment (with anomaly overrides), the verdancy/ruin macro region field and its biomes, landmark canopy clamps, biome expression in worldgen, the 3×3 district style grid, district naming, Hidden Hamlet placement, and the per-session Spire.
- Codify world anomalies (engine/geometry side only): the four Tier-1 landmark chunks, the Tier-2 Elevated Line viaduct, the canal waterways, Tier-3 oddities, and the little-details sprinkle pass — what exists, how it collides, and why it is deterministic. Gameplay triggers built on these (discovery events, summit checks, cache placement) belong to sibling capabilities and are referenced only.
- Codify SHOT mode: activation, preset scenes, frozen determinism, and the render-health status contract.
- No behavior changes — retroactive codification of existing, shipped code (including the uncommitted working-tree features: skyhouse waytrees, lifts, parcel handoff).

## Capabilities

### New Capabilities
- `chunk-streaming`: chunk residency, build budget, disposal, determinism/RNG discipline, colData contract, batching.
- `day-night-cycle`: day clock, sun/night factors, sky rendering, light handoff, emissive drives, dew, lamp-light pool, altitude fog.
- `districts-regions`: chunk types, macro biome field, clamps, biome worldgen expression, district styles and names, Hamlet placement, the Spire.
- `world-anomalies`: Tier-1 landmark chunks, the viaduct line, canals, Tier-3 oddities, sprinkle pass — geometry, collision, determinism.
- `shot-mode`: the `?shot` screenshot/smoke-test harness.

### Modified Capabilities

(none — existing specs remain factually correct; overlaps are referenced in prose)

## Impact

- Documentation only: five new spec folders under `openspec/specs/`.
- Source of truth: `core.js` (hash2, region field, constants, SHOT param, materials/batching), `worldgen-chunks.js` (chunk manager, sky, sea, ground), `worldgen-builders.js` (chunk types, districts, builders), `worldgen-anomalies.js` (anomalies, canals, oddities, buildChunk), `main.js` (day clock, fog/sea drive, SHOT presets and status line).
- No game code is touched.
