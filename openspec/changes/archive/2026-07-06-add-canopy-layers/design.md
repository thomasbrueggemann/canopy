## Context

The world is built from deterministic per-chunk geometry batched into a small set of
materials, with collision exposed through `colData` arrays (`solids`, `trunks`, `pads`,
`lamps`, `pits`, `waters`, …). This change layers a three-veil canopy on top of that engine
without new systems: everything is worldgen furniture plus collision-array entries that the
existing player physics already understands. The feature is already implemented; this
document records the invariants the shipped code relies on.

## Goals / Non-Goals

**Goals:**
- Three risk-graded, traversable canopy layers driven purely by `hash2`.
- Seamless canopy across chunk borders with no double-emit at seams.
- Reuse the existing pad/trunk collision, shade-ray, and fall models — no new physics.

**Non-Goals:**
- No persisted state (no new localStorage keys); layers regenerate identically each session.
- No minimap representation of the Weave.
- No changes to the freeclimb physics itself — climbables merely feed the existing path.

## Decisions

- **Collision via `colData.pads` layer tags.** Walkable canopy surfaces push pads carrying a
  `layer` string (`bough`, `weave`, `nest`, `net`). The player support scan reads `pad.layer`
  into `supportLayer`; `SAFE_LEAF` (`weave|nest|bough|net|lookout|lift`) makes those layers
  catch falls. Alternative (separate arrays per layer) rejected — one tagged array keeps the
  support scan single-pass.
- **Climbable vines as thin trunks.** `addVineRope` registers a `colData.trunks` entry
  (r ≈ 0.35, h = top). The climb path treats trunks with `h > 14` as climbable, so vine ropes
  reuse the trunk-climb code untouched. Chosen over a bespoke climb volume to avoid new player
  state.
- **Cross-chunk continuity on a global cell grid.** `addWeave` addresses a 5×5 global cell grid
  by `hash2(gx, gz, salt)`; only the chunk containing a cell centre emits that cell's platter,
  with radii overhanging borders. This guarantees each border platter is emitted exactly once
  and both neighbours agree — the same trick as power-pole side selection.
- **Sun model reuses `sunOcclusion` ray march.** Leaf pads attenuate 0.75, nets 0.35, trunks
  0.9, solids fully. A pad only shades if it is genuine overhead cover (`pd.y > py + 0.5`), so
  the platter you stand on never shades you. This unifies L1-shaded / L2-L3-exposed with real
  overhead cover above the sun line — no per-layer heat hack.
- **Canopy-sea reveal window.** The sea ring sits at y 26.5 inside the Weave; it is faded in
  over `smooth(31, 40, y)` and hidden below, so it never clips leaf platters.
- **RNG discipline / build order.** Bough roads and the Weave run in `buildChunk` before the
  viaduct/canal/oddity passes; scorch biome skips both. Layer builders draw from the shared
  chunk `rng` in fixed order so unrelated chunk content stays stable.

## Risks / Trade-offs

- [Dense canopy raises triangle count] → All geometry flows through the existing per-chunk
  batches with a target under ~40% triangle increase; no new materials except the net sheet.
- [Light wells could strand a falling player] → Leaf layers catch falls (`SAFE_LEAF`), so a
  fall through a well onto any lower leaf surface is survivable by design.
- [Global-cell continuity depends on identical hashing on both sides] → Placement is a pure
  function of global cell coords, so neighbours cannot disagree.

## Migration Plan

Not applicable — additive worldgen with no persisted state and no save-format change. A chunk
without canopy layers is byte-identical to before; a canopy chunk differs only by added
geometry and collision entries.

## Open Questions

None — behavior is codified from the shipped implementation.
