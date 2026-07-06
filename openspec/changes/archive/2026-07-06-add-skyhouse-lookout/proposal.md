## Why

At canopy height ([22,30)) a waytree lookout never cleared the crowns — the canopy sea
(revealed only above ~31–40 m) stayed hidden and the deck felt buried in leaves. This change
raises the lookout into a **skyhouse** standing clear above the forest, with the leaf-sea
rolling to every horizon below the rail, and retunes the winch so the now-longer, sun-exposed
ride stays survivable. It is a retroactive codification of already shipped behavior.

## What Changes

- Raise the waytree deck from [22,30) to **[42,50)** by changing only the `deckY` base in
  `waytreeSpec` (`42 + hash2(ix,iz,7304) % 8`); salts and placement hashes are unchanged, so
  every finder updates automatically.
- Rework the waytree into a skyhouse: the tree's crown now sits BELOW the deck, a bare
  freeclimbable **mast trunk** continues up to carry the house, with support struts, a wider
  floor pad, a full pitched roof casting real shade, and a tall **beacon mast** lamp that reads
  across the whole night map (replacing the old rim lamp and half-roof).
- Retune the pump (`LIFT_PUMP 0.85→1.0`, `LIFT_VMAX 2.6→3.2`) so a ~45 m ride docks in
  ~18–24 s and the sun-exposed upper half is spicy but survivable.
- Update the lookout arrival beat to the skyhouse text.

## Capabilities

### Modified Capabilities
- `waytrees`: the deck height moves to [42,50) (placement/spec requirement) and the lookout
  structure becomes a mast-carried skyhouse with a full roof, shade pad, struts, and beacon mast.
- `winch-lifts`: the pump is retuned (faster crank, higher cap) so the longer, sun-exposed ride
  is deliberate but survivable.

### New Capabilities
- None.

## Impact

- Worldgen: `worldgen-builders.js` (`waytreeSpec` deckY base; `addWaytree` rework — tree height,
  mast trunk, floor, struts, parapet, full roof + shade pad, beacon mast; remove old half-roof /
  rim lamp; comment updates).
- Player: `player.js` (the two pump constants `LIFT_PUMP`, `LIFT_VMAX`).
- `main.js`: the `lookoutwalk` string.
- Unchanged: `waytreeSpec` purity/salts/placement, the lift mechanics, the ladder engine, the
  Ascent ground-touch rule, and the VANTAGE `checkSummit` extents (still cover the r 3.0 deck).
