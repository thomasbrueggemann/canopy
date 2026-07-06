## MODIFIED Requirements

### Requirement: Waytree placement is deterministic and recomputable

A waytree's existence and its exact `(x, z, deckY)` SHALL be a pure function of the chunk
coordinates via `hash2`, exposed as a shared `waytreeSpec(ix, iz)` returning `null` or
`{ x, z, deckY }`. Waytrees SHALL appear in every third `grove` chunk (`hash2(ix,iz,7301) % 3
=== 0`) and every fourth `park` chunk (`hash2(ix,iz,7302) % 4 === 0`), with `deckY` computed as
`42 + hash2(ix,iz,7304) % 8`, i.e. in the skyhouse-height range [42, 50) — clear above the
crowns, higher than the hamlet giants (32–40) but below the colossus (56.5) and the Spire (78).
Only the `deckY` base changes from the canopy-height design; the salts and placement hashes are
unchanged, so every finder updates automatically. Finders SHALL be able to recompute a
waytree's deck position without building or peeking at the chunk, and a `nearestWaytree` ring
scan SHALL return the closest waytree deck to a chunk.

#### Scenario: Same waytree derived without building the chunk

- **WHEN** a finder calls `waytreeSpec(ix, iz)` for a qualifying grove chunk
- **THEN** it returns the same `(x, z, deckY)` that the builder uses to place the waytree
- **AND** `deckY` lies in [42, 50)

#### Scenario: Non-qualifying chunk has no waytree

- **WHEN** `waytreeSpec` is called for a chunk that is neither a qualifying grove nor park
- **THEN** it returns `null`

#### Scenario: Nearest waytree ring scan

- **WHEN** `nearestWaytree` scans outward from a chunk
- **THEN** it returns the closest waytree deck `{x, z, y}` found, or `null` if none in range

### Requirement: Waytree lookout structure

A waytree SHALL be built as a mast-carried skyhouse standing clear above the forest crowns. The
tree's own crown SHALL top out several metres BELOW the deck, and a bare freeclimbable mast
trunk (radius ~1.5, registered in `colData.trunks` with height `deckY`, so purists can climb it
to skip the lift) SHALL continue up through the crown to carry the house at `deckY`. The
skyhouse SHALL comprise: a plank floor registering a walkable pad (layer `lookout`, radius ~3.0)
at `deckY`; 4–6 diagonal support struts from the mast out to the deck rim so the house reads
built, not floating; a parapet of railing posts and caps around the rim with a gap on the +x
lift-dock side; a full pitched roof above the deck that registers a real shade pad (~0.75 sun
attenuation, no solid) so the house shades its occupants; and a tall beacon mast rising above
the ridge with a glowing lamp head (registered in `colData.lamps`) that reads across the whole
night map. This replaces the earlier partial roof and rim lamp. The deck SHALL remain a valid
vantage point (the VANTAGE summit check still covers the r 3.0 deck).

#### Scenario: Skyhouse rides above the crown on a mast

- **WHEN** a waytree is generated
- **THEN** the tree crown tops out below `deckY` and a freeclimbable mast trunk carries the deck at `deckY`

#### Scenario: Deck is a walkable lookout with roof shade

- **WHEN** the skyhouse is built
- **THEN** it registers a `lookout` floor pad (radius ~3.0) at `deckY` and a roof shade pad above it

#### Scenario: Beacon mast glows at night

- **WHEN** night falls at a waytree
- **THEN** the beacon-mast lamp above the ridge glows as a registered working lamp

#### Scenario: Purist climbs the mast

- **WHEN** the player freeclimbs the bare mast trunk instead of riding the lift
- **THEN** the mast (height `deckY`, above the 14 m climb threshold) carries the player up to the deck
