> Retroactive codification of existing code: every task below was already implemented and shipped in `core.js` / `worldgen-chunks.js` / `worldgen-builders.js` / `worldgen-anomalies.js` / `main.js` before this change was written. All tasks are checked; nothing remains to build.

## 1. chunk-streaming

- [x] 1.1 Implement the 64 m chunk grid, 7×7 residency window, and distance-sorted build queue (`ensureChunks`)
- [x] 1.2 Implement the 2-chunk frame budget with a synchronous immediate ring and `syncAll`
- [x] 1.3 Implement retirement beyond Chebyshev VIEW_R+1 with geometry-only disposal (shared materials never disposed)
- [x] 1.4 Implement deterministic rebuild: `mulberry32(hash2(ix,iz,999))` stream, salted decisions, tail-built late features (`buildChunk`)
- [x] 1.5 Implement the `colData` contract arrays and the 3×3 `collectColliders` gather; keep per-frame paths free of chunk builds/peeks
- [x] 1.6 Implement per-chunk batching into the 10 shared-material batches plus `extraMeshes`

## 2. day-night-cycle

- [x] 2.1 Implement the 600 s day clock with T ×60 fast-forward and the SHOT freeze (`main.js` loop)
- [x] 2.2 Implement sun geometry, `dayF`/`nightF`/dusk factors, and `sunDir` (`updateSky`)
- [x] 2.3 Implement the vertex-colored dome, sun/moon sprites, stars, clouds, and fog/clear tinting
- [x] 2.4 Implement the sun→moon directional handoff and hemi/ambient curves
- [x] 2.5 Implement the shared-material emissive drives (windows, glow, lamps, water sparkle + ripple drift)
- [x] 2.6 Implement the dawn dew window driving puddle opacity and `dewF`
- [x] 2.7 Implement the fixed 6-light lamp pool over resident `colData.lamps`
- [x] 2.8 Implement altitude-driven fog relaxation with weather multipliers and floor clamps

## 3. districts-regions

- [x] 3.1 Implement deterministic chunk typing with anomaly overrides (salt 5150) and biome weight remaps (`baseChunkType`/`chunkType`)
- [x] 3.2 Implement the verdancy/ruin value-noise region field and biome thresholds (`regionBiome`/`regionAt`)
- [x] 3.3 Implement the Spire/Hamlet full-canopy clamps with the load-order-safe hamlet cell
- [x] 3.4 Implement biome expression across trees, canopy passes, buildings, lamps, cars, grass — rng-neutral where gated
- [x] 3.5 Implement the 3×3 district style grid (salt 8123), style tints/rhythms/roofs/dims/ornaments
- [x] 3.6 Implement deterministic district naming with style-flavored suffixes
- [x] 3.7 Implement the Hidden Hamlet ring-6–10 placement scan and the hamlet chunk village build
- [x] 3.8 Implement the per-session Spire roll, spire chunk build, and the core.js story-save pre-parse

## 4. world-anomalies

- [x] 4.1 Implement the colossus chunk (mega-tree, buttresses, spiral staircase, crown hamlet, beacon)
- [x] 4.2 Implement the fallen-tower chunk (standing tower, ramp slab with `fallen` pads, rubble, ladder anchor return)
- [x] 4.3 Implement the sinkhole chunk (pit descriptor, floor pads, rim, 3 climbable h-16 roots, glow garden)
- [x] 4.4 Implement the reservoir chunk (climbable walls, wade floor, interior water rect, ripple planes, vine ropes)
- [x] 4.5 Implement the Elevated Line (per-line selection 6001/6002, span survival 6003, deck pads, seeded track dressing, ramps 6004)
- [x] 4.6 Implement canal waterways (line selection 7001/7002, channel pit+water, embankments, bridges, guard strip)
- [x] 4.7 Implement Tier-3 oddities on independent salts with at-most-one precedence (`addOddities`)
- [x] 4.8 Implement the little-details sprinkle pass at the rng tail (`addLittleDetails`)

## 5. shot-mode

- [x] 5.1 Implement `?shot` activation, preserveDrawingBuffer, and overlay bypass
- [x] 5.2 Implement the five preset scenes plus the `?px/?pz` override, with synchronous world build
- [x] 5.3 Implement the frozen simulation (clock hold, no weather/missions/story/puzzles/audio, 6-frame freeze)
- [x] 5.4 Implement the READY render-health status line and CANOPY_STATUS console contract

## 6. Verification

- [x] 6.1 Confirm the delta specs match the shipped code paths (retroactive review of the working tree, including uncommitted features)
- [x] 6.2 `openspec validate codify-world-engine` passes
