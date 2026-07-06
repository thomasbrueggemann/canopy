> NOTE: These features are ALREADY IMPLEMENTED. This is a retroactive codification of
> shipped behavior into specs, so every task is checked as done.

## 1. Ladder worldgen

- [x] 1.1 `addLadder` builds side-rails + rungs and pushes a `colData.ladders` climb volume
- [x] 1.2 Runs over ~16 m split into stacked segments with `lookout` rest-platform pads every ~14 m
- [x] 1.3 `colData.ladders` initialized/disposed alongside the other collision arrays

## 2. Waytree worldgen

- [x] 2.1 `waytreeSpec(ix,iz)` pure-hash existence + `(x,z,deckY)`, `deckY ∈ [22,30)`
- [x] 2.2 Placement: every third grove (`%3==0`), every fourth park (`%4==0`)
- [x] 2.3 `addWaytree` builds trunk, ground-to-deck ladder, `lookout` deck pad, railing, roof (no solid), edge lamp
- [x] 2.4 `nearestWaytree` ring scan recomputes the nearest deck without building the chunk
- [x] 2.5 Waytree built last in `buildChunk` (RNG discipline)

## 3. Player ladder latch

- [x] 3.1 `nearby.ladders` gathered in `collectColliders`
- [x] 3.2 `ladderInteract()` in the E-chain (after inventory, before trial-master); E releases first
- [x] 3.3 Latch snaps to the climb line, zeroes velocity, sets `onLadder`
- [x] 3.4 Latched climb: W/S at `CLIMB_SPEED*1.25`, no facing, gravity off, gust-proof
- [x] 3.5 Top-out auto-mantle onto the deck; bottom-out grounded
- [x] 3.6 Space hops off backward; E lets go in place
- [x] 3.7 No auto-latch on fall-past; deliberate airborne E-latch allowed
- [x] 3.8 `ladderProxTick` throttled proximity hint; `SAFE_LEAF.lookout`

## 4. Structure ladders

- [x] 4.1 Spire south-face ground-to-summit ladder run (stacked + rest platforms)
- [x] 4.2 Fallen-tower ground-to-slab-top ladder

## 5. Mission integration

- [x] 5.1 `findNestPad` prefers nearest waytree lookout (fallback preserved)
- [x] 5.2 Ascent trial target prefers a waytree lookout in range (fallback preserved)
- [x] 5.3 VANTAGE errand vantage prefers the waytree deck (fallback preserved)
- [x] 5.4 Minimap rung glyph for resident waytrees, unlocked once the player stands on a lookout
