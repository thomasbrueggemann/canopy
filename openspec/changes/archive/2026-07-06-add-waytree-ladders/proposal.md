## Why

Freeclimbing (hold-to-climb with a facing cone, pitch steering, and mantle timing) is too
fiddly when a mission *requires* height. Any climb the game asks the player to make should be
forgiving. This change adds **waytrees** — special mission trees with a treehouse lookout — and
a locked-in **ladder** climb mode, while leaving freeclimbing untouched as the expert path. It
is a retroactive codification of already shipped behavior.

## What Changes

- Add **waytrees**: deterministic mission trees carrying a ground-to-deck rung ladder and a
  treehouse lookout deck (railing, small roof, night lamp beacon) at canopy height.
- Add a recomputable `waytreeSpec(ix, iz)` so finders locate a waytree's exact deck position
  from chunk coordinates without building the chunk.
- Add the **ladder engine**: `addLadder` geometry, a `colData.ladders` climb volume, and a
  locked-in latch state machine (latch, climb, hop off, let go, top-out auto-mantle).
- Bolt deterministic ladder runs onto the two big *structure* climbs: the Spire south face and
  the fallen-tower slab.
- Point the "somewhere high" mission finders (crown-nest story chapter, the Ascent trial, the
  VANTAGE errand) at waytree lookouts, each with the old behavior as a fallback.
- Make lookout decks and ladder rest platforms caught landings.

## Capabilities

### New Capabilities
- `waytrees`: deterministic mission trees — placement, recomputable spec, lookout deck
  structure, ground-to-deck ascent, fall-catch, mission-finder preferences, and minimap glyph.
- `ladders`: the locked-in ladder climb — geometry and climb volume, the latch state machine,
  proximity hints, and the Spire and fallen-tower structure ladders.

### Modified Capabilities
- None (these capabilities are introduced here; later changes modify the waytree ascent).

## Impact

- Worldgen: `worldgen-builders.js` (`addLadder`, `addWaytree`, `waytreeSpec`, `nearestWaytree`),
  `worldgen-anomalies.js` (Spire/fallen-tower ladder call sites, waytree call site, `colData`
  init), `worldgen-chunks.js` (`colData.ladders` init/dispose).
- Player: `player.js` (`nearby.ladders`, latch state machine in `stepPlayer`, `ladderInteract`
  in the E-chain, proximity hint, `SAFE_LEAF.lookout`).
- Mission integration: `story.js` (`findNestPad`), `main.js` (Ascent target, VANTAGE target,
  minimap glyph).
- Collision via `colData.ladders` (climb volumes) and `colData.pads` (layer `lookout`).
