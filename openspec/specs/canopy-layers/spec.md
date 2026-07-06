# canopy-layers Specification

## Purpose
TBD - created by archiving change add-canopy-layers. Update Purpose after archive.
## Requirements
### Requirement: Three-veil vertical zoning

The canopy SHALL be organized into three stacked, playable sub-layers keyed to the sun
line `CANOPY_Y = 24`: L1 Bough Roads (~15–20 m, below the sun line, shaded), L2 The Weave
(~24–28 m, dappled and exposed), and L3 Crown Nests (~32–40 m, full sun and exposed). All
layer geometry SHALL be deterministic per chunk seed and batched into the chunk build.

#### Scenario: Layers sit in their height bands

- **WHEN** a chunk with canopy layers is generated
- **THEN** bough-road walkable surfaces register below `CANOPY_Y` (~14–20 m)
- **AND** Weave platters register at y 24–28 m

#### Scenario: Determinism across sessions

- **WHEN** the same chunk is generated in two different sessions
- **THEN** the layer geometry and collision are byte-identical (pure `hash2`, no persisted state)

### Requirement: L1 Bough Roads connect trees and rooftops

The system SHALL grow walkable limb spans from street trees, each span connecting a tree
to a neighbouring tree or to a nearby building rooftop. There SHALL be 2–4 spans per chunk,
more in `park`/`grove` chunks and fewer over `plaza` chunks. A span SHALL attach at roughly
60–75% of trunk height (clamped to 14–20 m) and register as a run of narrow walkable pads
(layer `bough`) whose radius tracks the limb so the player can walk it but also fall off the
sides.

#### Scenario: Walking a bough road

- **WHEN** the player stands on a bough-road pad between 14 and 21 m
- **THEN** the player is supported as on canopy (layer `bough`)
- **AND** a first-time message names the great bough road

#### Scenario: Span density varies by chunk type

- **WHEN** a `park` or `grove` chunk builds bough roads
- **THEN** it emits more spans than a baseline `city` chunk
- **AND** a `plaza` chunk emits fewer

### Requirement: L2 The Weave is a walkable leaf lattice with light wells

The system SHALL build interlocking flattened leaf platters (radius 4–8 m) at y 24–28 tying
neighbouring crowns together, at roughly 66% coverage (≈90% in the `deepgreen` biome). Each
placed platter SHALL register a walkable pad (layer `weave`). The Weave SHALL leave deliberate
4–8 m light-well gaps that the player can fall through, and SHALL emit no coverage over
`plaza`, `colossus`, or `sinkhole` chunks so open sky reads there.

#### Scenario: Standing on the Weave

- **WHEN** the player stands on a Weave platter pad
- **THEN** the player is supported as on canopy (layer `weave`)
- **AND** a first-time message names the Weave

#### Scenario: Falling through a light well

- **WHEN** the player steps over a light-well gap in the Weave
- **THEN** there is no walkable pad there and the player falls through toward the street

#### Scenario: Open-sky chunk types

- **WHEN** a `plaza`, `colossus`, or `sinkhole` chunk is generated
- **THEN** the Weave pass emits no platters over it

### Requirement: Cross-chunk canopy continuity

Weave placement SHALL be decided on a global cell grid addressed by `hash2(gx, gz, salt)`
so that neighbouring chunks agree on the shared field; each chunk emits only the cells whose
centre lies inside it, with platter radii overhanging borders, producing a seamless canopy
across chunk boundaries with no duplicated or missing geometry at the seam.

#### Scenario: Seamless border

- **WHEN** two adjacent canopy chunks are generated
- **THEN** each border-spanning platter is emitted exactly once by its owning cell
- **AND** the canopy reads continuous across the shared border

### Requirement: Leaf layers catch falls

A leaf-family canopy surface SHALL catch the player as a soft landing that never causes fall
damage or blackout, regardless of drop height — this covers the Weave, bough roads, crown
nests, sky nets, and lookout decks. Landing on hard ground, roofs, or the viaduct deck SHALL
retain ordinary fall consequences.

#### Scenario: Soft canopy landing

- **WHEN** the player falls more than 10 m and lands on a canopy pad tagged `weave`, `bough`, or `nest`
- **THEN** the forest catches the player with no blackout

#### Scenario: Hard ground still hurts

- **WHEN** the player falls more than 10 m onto hard ground with no canopy support
- **THEN** the player blacks out and wakes in the last shade

### Requirement: Layer-appropriate shade and exposure

The shade/exposure model SHALL treat L1 (below `CANOPY_Y`) as shaded and L2/L3 (above
`CANOPY_Y`) as exposed to raw sun except where a real overhead leaf pad covers the player.
An overhead leaf pad SHALL attenuate direct sun by ~0.75 (partial, not opaque), so shafts of
sun reach the street between trees while genuine overhead cover shades the player even above
the sun line.

#### Scenario: Breaking through into raw sun

- **WHEN** the player rises above `CANOPY_Y` with no overhead leaf cover
- **THEN** exposure reads as raw sun and body heat climbs

#### Scenario: Overhead leaf cover shades above the sun line

- **WHEN** the player stands above `CANOPY_Y` directly under a leaf pad
- **THEN** the sun ray is attenuated and exposure is reduced

### Requirement: Canopy sea reveals only above the Weave

The canopy-sea ring (positioned at y 26.5, inside the Weave band) SHALL stay hidden until the
player rises well clear above the Weave, revealing over the height range ~31–40 m, so the sea
plane never clips through the leaf platters.

#### Scenario: Sea hidden while in the Weave

- **WHEN** the player is at or below ~31 m
- **THEN** the canopy-sea ring is effectively invisible

#### Scenario: Sea revealed above the crowns

- **WHEN** the player climbs above ~40 m
- **THEN** the canopy-sea ring is fully visible around them

