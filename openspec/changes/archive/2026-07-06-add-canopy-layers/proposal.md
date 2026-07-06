## Why

The canopy above the city was flat decoration. This change turns it into a layered,
intertwined green superstructure with three playable sub-layers keyed to the sun line
(`CANOPY_Y = 24`), so the roof of the forest becomes a traversable, risk-graded space
with its own shade, fall, and climb rules. This is a retroactive codification of already
shipped behavior.

## What Changes

- Add **L1 Bough Roads** (~15–20 m): walkable limb highways connecting trees to trees and
  trees to rooftops, deterministic per chunk.
- Add **L2 The Weave** (~24–28 m): a semi-continuous walkable leaf lattice with deliberate
  light-well gaps and seamless cross-chunk continuity.
- Add **L3 Crown Nests** (~32–40 m): sparse emergent platforms on giants and tower roofs,
  with railings, shade umbrellas, glow gardens and night beacons.
- Add **Sky Nets**: sagging woven net panels, walkable hammocks over light wells, and long
  aerial creepers strung crown to crown.
- Codify **Freeclimbing**: climbable vine ropes and spiral limbs plus the existing
  hold-to-climb trunk/vine mechanic, preserved as the expert/optional vertical path.
- Integrate all layers with the shade/exposure model (L1 shaded, L2/L3 exposed), the fall
  model (leaf layers catch the player), and the canopy-sea visibility reveal.

## Capabilities

### New Capabilities
- `canopy-layers`: the three-veil vertical zoning, L1 Bough Roads, L2 The Weave, light
  wells, cross-chunk continuity, and the shade/fall/sea-visibility integration.
- `crown-nests`: L3 emergent nest platforms — placement, structure, shade, and night beacons.
- `sky-nets`: woven net panels, walkable hammocks, aerial creepers, and their catch/shade behavior.
- `freeclimbing`: climbable vine ropes, spiral limbs, climbable big trunks, and the
  hold-to-climb mechanic (facing cone, descend, mantle, kick-off).

### Modified Capabilities
- None (foundational change; these capabilities are introduced here).

## Impact

- Worldgen: `worldgen-builders.js` (`addLimb`, `addBoughRoads`, `addWeave`, `addNetPanel`,
  `addNetHammock`, `addCreeper`, `addVineRope`, `addSpiralLimb`, `addCrownNest`),
  `worldgen-anomalies.js` (`buildChunk` call sites, `colData` init), `worldgen-chunks.js`.
- Player/systems: `player.js` (support scan, `SAFE_LEAF`, `sunOcclusion`, climb path),
  `main.js` (canopy-sea reveal, layer-walk message beats).
- Collision via `colData.pads` (layers `bough`/`weave`/`nest`/`net`) and `colData.trunks`
  (climbable vines). No new textures beyond the net material; all geometry batched per chunk.
