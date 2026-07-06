## ADDED Requirements

### Requirement: Waytree placement is deterministic and recomputable

A waytree's existence and its exact `(x, z, deckY)` SHALL be a pure function of the chunk
coordinates via `hash2`, exposed as a shared `waytreeSpec(ix, iz)` returning `null` or
`{ x, z, deckY }`. Waytrees SHALL appear in every third `grove` chunk (`hash2(ix,iz,7301) % 3
=== 0`) and every fourth `park` chunk (`hash2(ix,iz,7302) % 4 === 0`), with `deckY` in the
canopy-height range [22, 30). Finders SHALL be able to recompute a waytree's deck position
without building or peeking at the chunk, and a `nearestWaytree` ring scan SHALL return the
closest waytree deck to a chunk.

#### Scenario: Same waytree derived without building the chunk

- **WHEN** a finder calls `waytreeSpec(ix, iz)` for a qualifying grove chunk
- **THEN** it returns the same `(x, z, deckY)` that the builder uses to place the waytree

#### Scenario: Non-qualifying chunk has no waytree

- **WHEN** `waytreeSpec` is called for a chunk that is neither a qualifying grove nor park
- **THEN** it returns `null`

#### Scenario: Nearest waytree ring scan

- **WHEN** `nearestWaytree` scans outward from a chunk
- **THEN** it returns the closest waytree deck `{x, z, y}` found, or `null` if none in range

### Requirement: Waytree lookout structure

A waytree SHALL be built as one thick tall trunk (registered in `colData.trunks` with a
canopy) plus a treehouse lookout at `deckY`: a round plank deck registering a walkable pad
(layer `lookout`, radius ≈ 2.6), visual-only railing posts around the rim with a gap on the
dock side, a small pitched roof on posts over part of the deck, and a lamp at the deck edge
registered in `colData.lamps` so the waytree glows at night as a navigation beacon. The roof
SHALL register no solid so the deck stays sky-open and remains valid as a vantage point.

#### Scenario: Deck is a walkable lookout

- **WHEN** a waytree is generated
- **THEN** it registers exactly one `lookout` pad at `deckY` for the deck

#### Scenario: Roof does not block the sky

- **WHEN** the lookout roof is built
- **THEN** it registers no solid, leaving the deck open to the sky as a vantage point

#### Scenario: Night beacon

- **WHEN** night falls at a waytree
- **THEN** the deck-edge lamp glows as a registered working lamp

### Requirement: Waytree ground-to-deck ascent

A waytree SHALL provide a forgiving, locked-in ascent from the ground up to the lookout deck
at `deckY`, distinct from freeclimbing, so any mission that routes a player to a waytree
lookout is climbable without freeclimb mastery. In this ladder-era design the ascent SHALL be
a rung ladder strapped to the trunk from the ground to deck height.

#### Scenario: Climbing to the deck

- **WHEN** the player uses the waytree's ground-to-deck ascent
- **THEN** the player is carried from the ground up to the lookout deck without freeclimb steering

### Requirement: Lookout decks and rest platforms catch falls

Falling onto a waytree lookout deck SHALL be a caught landing (`SAFE_LEAF` includes `lookout`),
so the friendly route is also forgiving of a missed step. The deck SHALL slightly shade the
ground beneath it as an ordinary canopy pad.

#### Scenario: Falling onto a lookout deck

- **WHEN** the player falls onto a `lookout` pad from a height that would otherwise injure
- **THEN** the landing is caught with no fall damage or blackout

### Requirement: Mission finders prefer waytree lookouts

The mission finders that pick "somewhere high" SHALL prefer the nearest recomputable waytree
lookout, each retaining its previous behavior as a fallback when no waytree is in range:
the crown-nest story chapter (`findNestPad`), the Ascent trial target, and the VANTAGE errand
vantage point. The finders SHALL locate the waytree via the recomputable spec, not by building
the chunk.

#### Scenario: VANTAGE errand targets a waytree

- **WHEN** a VANTAGE errand is offered and a waytree lookout is within range
- **THEN** the errand vantage point is the waytree deck rather than a rooftop

#### Scenario: Fallback when no waytree

- **WHEN** a "somewhere high" finder runs and no waytree is in range
- **THEN** it falls back to its previous target (nest pad, rooftop, or giant trunk)

### Requirement: Waytree minimap glyph after first lookout

Resident-chunk waytrees SHALL show a small rung glyph on the minimap once the player has stood
on any lookout deck during the session, recomputed from `waytreeSpec`. Before the player has
stood on a lookout, no such glyph SHALL appear.

#### Scenario: Glyph unlocks on first lookout

- **WHEN** the player first stands on a lookout deck
- **THEN** resident waytrees begin showing a rung glyph on the minimap
