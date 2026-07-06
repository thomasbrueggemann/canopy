## Context

Retroactive codification of CANOPY's world engine as shipped in the working tree (`core.js`, `worldgen-chunks.js`, `worldgen-builders.js`, `worldgen-anomalies.js`, plus the main-loop drives). No code changes. This design records the invariants the five new capability specs rest on, so future feature work can be validated against them.

## Goals / Non-Goals

**Goals:**
- Write down the determinism, performance, and collision contracts that every archived feature spec implicitly assumes.
- Cite the recomputable hash contracts (salts) only where another system depends on recomputing them (line selection, span survival, oddity gates, hamlet gate, waytree spec — the last is owned by the waytrees spec).

**Non-Goals:**
- Gameplay built on these structures: discovery events, summit/vantage checks, cache/journal placement, NPC/ambient runtime (sibling capabilities, and the concurrently-authored gameplay-side capabilities).
- three.js mechanics with no player-observable contract (texture painting internals, batch vertex layout).

## Decisions

- **`hash2` is the determinism backbone.** Everything positional is a pure function of integer coordinates plus a salt: `hash2(ix, iz, salt)` → 32-bit uint. Chunk rng is `mulberry32(hash2(ix,iz,999))`. Cross-chunk features (viaduct lines 6001/6002, span survival 6003, canals 7001/7002, weave cells 4242, oddity gates 3xxx, hamlet gate 9001, district grid 8123, region noise 42xx) hash the *global* line/cell/grid index, never the local chunk rng — that is what makes two chunks agree on shared geometry with no communication.
- **RNG discipline: one ordered stream + salted decisions + tail-built features.** The chunk rng stream is order-sensitive, so (a) yes/no decisions that vary by external state use independent salts and still consume their usual draws when disabled (biome remaps are explicitly rng-neutral), and (b) late-added systems (ladders, waytrees/lifts, little details) draw at the very end. Alternative — re-seeding per feature — was rejected in-code for hot-path cost and because tail-building achieves byte-stability more simply.
- **`colData` is the only runtime world interface.** Physics, the heat probe, lamp lights, and gameplay hosts all read resident chunks' typed arrays; nothing reads meshes back, and no per-frame path may build or peek a chunk (`peekColData` is banned in per-frame code — non-resident questions go through pure recompute specs like `waytreeSpec`/`nearestWaytree`).
- **Batching over instancing/materials.** All static geometry accumulates into ~10 per-chunk `Batch` objects, one mesh per shared material, variation baked as vertex color. Disposal is geometry-only, so builders must never mint materials (the lift platform reuses `matPlain` for exactly this reason). This bounds draw calls at roughly 10 per chunk and makes retirement leak-free.
- **Fixed light budget.** Exactly one directional light (sun/moon handoff), one hemi, one ambient, one flashlight spot, and a constant pool of 6 lamp point lights whose intensities go to 0 when unused — the scene's light count never changes, so shaders compile once.
- **Session-scoped randomness is quarantined.** Only `SPIRE` (and therefore the Hamlet, derived from it) is per-session `Math.random`; weather is per-session atmosphere (own spec). Persistent story state that must survive the Spire re-roll is stored Spire-relative and parsed in `core.js` *before* worldgen so `buildChunk` can read it — a deliberate load-order contract (`STORY_SAVE`, `storyPlantedAt`, `storyComplete`).
- **localStorage keys touched by this slice:** none are written by the engine itself; it only *reads* `canopy.story` (v1, parsed once at load). All other keys (`canopy.summited`, `canopy.sprintboost`, inventory/cipher saves) belong to gameplay capabilities.
- **SHOT is a harness, not a mode of play.** Determinism comes from freezing inputs (clock, weather, updates, audio) rather than seeding them; render health is asserted via the READY status line instead of image diffs.

## Risks / Trade-offs

- [Cited salts freeze implementation detail] → Only salts that define *recomputable contracts relied on elsewhere* are cited (line/span/oddity/hamlet/district/region); purely internal jitter salts are deliberately not specced.
- [7×7 residency and 2-chunk budget are tuning values] → They are player-observable (world completeness at sprint speed), so they belong in the spec; retunes ship as MODIFIEDs.
- [Overlap with O5's gameplay sweep] → Boundary held: this change specs what exists in the world, its collision and determinism; triggers and consumers are referenced by capability name only.

## Migration Plan

None — documentation of existing behavior; archive immediately with pre-checked tasks.

## Open Questions

None.
