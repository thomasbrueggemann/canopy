# chunk-streaming Specification

## Purpose
TBD - created by archiving change codify-world-engine. Update Purpose after archive.
## Requirements
### Requirement: Chunk grid and residency window

The world SHALL be generated in square chunks of `CHUNK = 64` m keyed by integer coordinates (`"ix,iz"`), streets running on the borders. Every frame the streamer SHALL want the `(2 × VIEW_R + 1)²` window (`VIEW_R = 3`, i.e. 7×7) of chunks around the player resident, enqueuing any missing chunk into a build queue sorted by squared chunk distance so the nearest build first.

#### Scenario: Walking extends the world

- **WHEN** the player crosses a chunk border
- **THEN** the newly-wanted edge chunks are enqueued nearest-first and built over the following frames

### Requirement: Build budget with a synchronous immediate ring

Chunk building SHALL be amortized: at most 2 far chunks (distance² > 2) per frame consume budget, but chunks in the immediate ring (distance² ≤ 2) SHALL always build immediately without consuming budget, so the player can never reach or see into an unbuilt neighboring chunk. A `syncAll` mode SHALL build the whole wanted window in one call, used at session start and after SHOT/dev teleports.

#### Scenario: Player never outruns the world

- **WHEN** the player sprints across chunk borders while the queue is deep
- **THEN** the chunks adjacent to the player build the same frame they become wanted

#### Scenario: Teleports build synchronously

- **WHEN** the session initializes or a SHOT preset repositions the player
- **THEN** `ensureChunks(..., true)` builds every chunk of the window before the next render

### Requirement: Chunk retirement and disposal

Chunks farther than `VIEW_R + 1` in Chebyshev distance from the player SHALL be removed from the scene and deleted, disposing every geometry in their group. Materials SHALL NOT be disposed on retirement: all chunk meshes reuse shared module-level materials, and any builder that created a per-chunk material would leak — builders MUST reuse shared materials (the winch-lifts platform explicitly reuses `matPlain` for this reason).

#### Scenario: Distant chunk retires cleanly

- **WHEN** a chunk falls outside Chebyshev `VIEW_R + 1`
- **THEN** its group leaves the scene and its geometries are disposed while shared materials remain live

### Requirement: Deterministic rebuild and RNG discipline

`buildChunk(ix, iz)` SHALL be a pure function of the chunk coordinates: it is seeded with `mulberry32(hash2(ix, iz, 999))` and consumes one ordered rng stream, so retiring and rebuilding a chunk — or rebuilding it in another session — produces byte-identical geometry and collision. Feature *decisions* that must not disturb the stream (anomaly type, oddity choice, viaduct/canal line membership, waytree existence) SHALL be made on independent `hash2` salts, not on the stream. Late-added features (waytrees with lifts, the Spire and fallen-tower ladders, little details) SHALL be built at the tail of the stream so chunks without them are byte-identical to builds before those features existed. The only cross-session inputs allowed are the per-session `SPIRE` roll and explicitly persisted story state (the planted oasis, campaign completion), which are read via cheap guards inside `buildChunk`.

#### Scenario: Retire and rebuild is identical

- **WHEN** a chunk is retired and later rebuilt in the same session
- **THEN** its geometry, collision arrays, and minimap data are identical to the first build

#### Scenario: Tail features do not shift earlier draws

- **WHEN** a chunk qualifies for a waytree or ladder
- **THEN** all its non-waytree content is identical to what the chunk would contain without the waytree, because the waytree's rng draws happen last

#### Scenario: Salted decisions leave the stream alone

- **WHEN** an oddity gate (its own hash salt) rejects a chunk
- **THEN** the rest of the chunk is unchanged relative to a world where the oddity system did not exist

### Requirement: The colData contract

Every chunk SHALL expose a `colData` record that is the single runtime source of truth for physics, heat, and gameplay queries: `solids` (AABBs `{x0,z0,x1,z1,h,vine}`), `trunks` (vertical cylinders `{x,z,r,h}` — climbable when `h > 14`), `pads` (walkable/shade discs `{x,z,r,y,layer}`), `pits` (circular `{x,z,r,depth}` or rect `{rect,x0,z0,x1,z1,depth}`), `waters` (`{x0,z0,x1,z1,y}`), `lamps` (`{x,z,working,hx,hy,hz}`), `ladders`, `lifts`, plus ambient anchor arrays (`chimes`, `ferns`, `smokes`, `stallAnchors`, `bannerAnchors`, `swingAnchors`, `dripAnchors`). Runtime systems SHALL read `colData` from already-resident chunks only — collision gathers the 3×3 ring around the player each frame, and no per-frame system may build or peek a chunk to answer a query (finders that must know about non-resident chunks recompute from pure hash specs instead, e.g. `waytreeSpec`).

#### Scenario: Physics sees exactly the 3×3 ring

- **WHEN** the player stands anywhere in the world
- **THEN** the frame's collision candidates are the concatenated `colData` arrays of the 9 chunks around them

#### Scenario: No per-frame chunk peeking

- **WHEN** any per-frame system (heat probe, lamp pool, journal-page sync) runs
- **THEN** it consults resident chunks' `colData` only and triggers no chunk build

### Requirement: Batched geometry per chunk

All static chunk geometry SHALL be accumulated into a fixed set of per-chunk batches — `plain`, `bld`, `leaf`, `vine`, `grass`, `glow`, `lamp`, `puddle`, `web`, `net` — each becoming at most one mesh bound to its shared material, with per-vertex colors carrying all variation (tints, jitter, biome shifts) so no per-feature materials or textures are created. The only non-batched additions are the small `extraMeshes` list (reservoir/canal water planes, the winch-lift platform group, the relit Spire beacon). Chunk group and batched meshes SHALL have `matrixAutoUpdate` disabled.

#### Scenario: Bounded draw calls

- **WHEN** a chunk is assembled
- **THEN** it contributes at most one mesh per batch material plus its few extra meshes, regardless of how many props it contains

#### Scenario: Variation without materials

- **WHEN** a builder needs a tinted or jittered prop
- **THEN** it bakes vertex colors into the batch rather than instantiating a new material

