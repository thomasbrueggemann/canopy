## Context

Missions sometimes require height, but the only vertical tool was freeclimbing — a facing
cone, pitch steering, and mantle timing that is too fiddly when the game *asks* for a climb.
This change adds a forgiving, locked-in ladder mode and a class of deterministic mission trees
(waytrees) whose lookout decks the height-seeking finders can target. It reuses the existing
deterministic worldgen, `colData` collision, and the E-interaction chain. The feature is
already implemented; this records its invariants.

## Goals / Non-Goals

**Goals:**
- A locked-in climb that needs no facing or pitch skill, readable and safe.
- Waytree deck positions recomputable by finders without building the chunk.
- The two structure climbs (Spire, fallen tower) become climbable by anyone.

**Non-Goals:**
- No change to freeclimb physics — it remains the expert/optional path.
- No new persisted state or localStorage keys (all deterministic worldgen or transient state).
- No change to trial timings — ladders make Ascent times *achievable by design*, not by mastery.

## Decisions

- **Ladder as a climb volume, not a solid.** `addLadder` registers `colData.ladders`
  (`{x,z,y0,y1,nx,nz}`); the latch state machine in `player.js` owns all motion. Chosen over
  faking a climbable trunk so the latch can be locked-in (no facing cone) and readable.
- **`ladderInteract()` ordering in the E-chain.** It sits after story/puzzle/inventory
  interacts and before the trial-master check, and E always releases a latched ladder *first*
  so an adjacent cache or plaque can never steal the release press (e.g. the Four Seasons cache
  beside the fallen-tower ladder).
- **Recomputable `waytreeSpec(ix, iz)`.** Existence and `(x, z, deckY)` are pure `hash2`
  functions, so `findNestPad`, the Ascent trial, the VANTAGE errand, and the minimap glyph all
  recompute the same deck without peeking at chunk data. This is the key trick that keeps
  finders cheap and build-free.
- **Roof registers no solid.** The lookout roof is visual only so the deck stays sky-open and
  valid as a vantage — a `checkSummit`/vantage test must still see open sky above the deck.
- **Caught landings.** `SAFE_LEAF` gains `lookout`; decks and ladder rest platforms catch
  falls. Kindness beats realism on the casual route.
- **RNG discipline.** Waytrees are built last in `buildChunk` so their rng draws never shift
  other chunk content; a non-waytree chunk is byte-identical to before.

## Risks / Trade-offs

- [Airborne auto-latch would feel like a surprise grab] → Falling past a ladder never
  auto-latches; only a deliberate E within the catch radius latches mid-fall (an intentional
  save).
- [Ladders could trivialize Ascent gold times] → Accepted; timings are unchanged and any
  re-tuning is a later knob, not this change.
- [Long ladder runs read as a single tedious climb] → Runs over ~16 m are split into stacked
  segments with rest-platform pads every ~14 m.

## Migration Plan

Not applicable — additive worldgen plus transient player state. No save-format change.

## Open Questions

None — behavior is codified from the shipped implementation. A later change replaces the
waytree ground-to-deck ladder with a winch lift; the ladder engine and the structure ladders
stay.
