# districts-regions Specification

## Purpose
TBD - created by archiving change codify-world-engine. Update Purpose after archive.
## Requirements
### Requirement: Deterministic chunk-type assignment

Every chunk's type SHALL be a pure function of its coordinates. Precedence: the Spire chunk is `spire`; then a dedicated anomaly roll on salt 5150 assigns `colossus` (~1/40), `fallen` (~1/25), `sinkhole` (~1/25), or `reservoir` (~1/25); the Hidden Hamlet's one chunk overrides to `hamlet`; otherwise a common-type roll on salt 1 picks from base weights city 0.55 / park 0.12 / plaza 0.09 / towers 0.16 / grove 0.08, remapped by macro biome (scorch: plaza ×2.5 and grove folded into city; deepgreen: grove ×3, park ×1.5, towers folded into city; canopy/ashen keep the base split). Finders and ring scans SHALL be able to call `chunkType`/`baseChunkType` for arbitrary chunks without building them.

#### Scenario: Types are stable across sessions

- **WHEN** the same chunk coordinates are queried in two sessions
- **THEN** the type is identical (only the per-session Spire and its dependent Hamlet move)

#### Scenario: Anomalies override common types but never the Spire

- **WHEN** a chunk's salt-5150 roll lands in the anomaly bands
- **THEN** the chunk is that anomaly type regardless of its common-type roll, but the Spire chunk itself is always `spire`

### Requirement: The verdancy/ruin macro region field

A macro biome SHALL be derived from two smooth scalar fields over chunk coordinates — verdancy and ruin — each `0.65 × valueNoise(coords/12) + 0.35 × valueNoise(coords/5)` on dedicated salts (4201/4202 verdancy, 4301/4302 ruin), where the value noise is bilinear interpolation of hashed lattice corners with a smoothstep fade. Thresholds: verdancy < 0.32 → `scorch`, verdancy > 0.66 → `deepgreen`, else ruin > 0.66 → `ashen`, else `canopy` — tuned so a 100×100 window lands roughly 15% scorch, 14% deepgreen, 8% ashen. `regionBiome` SHALL be allocation-free (it runs in per-chunk weight remaps and mission/trial ring scans over hundreds of chunks); `regionAt` returns the full fresh descriptor once per chunk build.

#### Scenario: Regions form hundreds-of-metres bands

- **WHEN** biomes are sampled across the map
- **THEN** they vary at a ~12-chunk wavelength with ~5-chunk edge wobble, not per-chunk noise

#### Scenario: Ring scans stay allocation-free

- **WHEN** a finder scans hundreds of chunks for a biome
- **THEN** it uses `regionBiome` with no object allocations

### Requirement: Landmark canopy clamps

The Spire chunk and the Hidden Hamlet chunk, each with their 8 neighbors, SHALL clamp the region field to full canopy (verdancy raised to ≥ 0.45, ruin capped at 0.5) so the tutorial landmark and the hidden village can never spawn sun-blasted or dead. The hamlet clamp SHALL be inert until the Hamlet cell is computed (load-order: the region field is defined before the Hamlet search runs, and the clamp cannot change which chunk the Hamlet picks).

#### Scenario: The Spire is always green

- **WHEN** the per-session Spire lands inside what would be a scorch band
- **THEN** its 3×3 neighborhood still reads as canopy biome

### Requirement: Biome expression in worldgen

The macro biome SHALL visibly reshape chunk content, deterministically, without new materials (vertex-tint shifts only). Scorch: no bough roads, Weave, or crown nests; ~75% of street trees skipped and survivors half dead snags, half sun-stunted; vines ×0.15; facades washed toward bone; fewer cars, sparse straw grass, extra bleached snags. Deepgreen: ~90% Weave coverage; denser (×1.6) and taller street trees with occasional giants in any chunk; building moss line raised to ~3 m; towers crushed ×0.8; glow plants ×1.8; extra climbable vine ropes; grass through the asphalt. Ashen: ruin-shell rate raised to ~0.55; only ~30% of lamps working (dark streets); facades dust-washed and buildings slumped ×0.75; extra rubble. Canopy: micro-drift of tree density and vine weight ±~25–30% with local verdancy. Where a biome changes a probability, the rng draw SHALL still be consumed so the chunk's rng stream stays aligned across biomes.

#### Scenario: Scorch reads open and dead

- **WHEN** a scorch chunk builds
- **THEN** it has no Weave/bough/nest pads and mostly dead or stunted trees, so raw sun genuinely reaches the street

#### Scenario: Ashen nights are dark

- **WHEN** an ashen chunk builds its street lamps
- **THEN** only about 30% of the normal working fraction still burn

#### Scenario: rng-neutral remaps

- **WHEN** the same chunk is imagined under two biomes
- **THEN** the number of rng draws consumed by biome-gated features is unchanged

### Requirement: District style grid

Architectural identity SHALL come from a district grid: each 3×3-chunk cell picks one style on salt 8123 — oldtown 25%, blocks 25%, glass 15%, works 15%, garden 20%. The style SHALL drive facade tint pools, window bay/floor rhythm, roof kind (oldtown gable, blocks flat, glass flat + always tiered, works sawtooth, garden hip/gable), building footprint and height ranges, vine weight, and per-style ornament passes (awnings/shutters/chimneys; balconies/murals; rooftop masts/fins and night-lit panels; brick stacks/silos/pipes; fenced yards with sheds and laundry). All ornaments are batched and stand off facades ≥ 0.06 m so nothing z-fights the window atlas.

#### Scenario: Neighborhoods read as one architecture

- **WHEN** the player crosses a 3×3 district cell
- **THEN** every generated building in it shares the same style family, and the next cell may switch

### Requirement: District naming

Chunk display names SHALL be deterministic: the Spire chunk is "The Spire"; otherwise a first name from a fixed pool on salt 7, suffixed ~55% of the time (salt 21) with a style-flavored suffix picked on salt 23 (e.g. works → " Foundry"/" Mill"), else a generic suffix on salt 13 — so a neighbourhood's name hints at its architecture.

#### Scenario: Same chunk, same name

- **WHEN** a chunk's name is shown in two sessions
- **THEN** it is identical, and works districts skew toward industrial suffixes

### Requirement: Hidden Hamlet placement

The Hidden Hamlet SHALL occupy exactly one deterministic chunk found at load: scanning rings 6–10 (Chebyshev) around the Spire in fixed ring-then-row order, taking the first chunk that passes `hash2(ix,iz,9001) % 5 === 0` and whose *base* type is a common one (never spire or an anomaly), with a fixed fallback cell. The hamlet chunk SHALL build the treehouse village — a ring of six giants (heights 32–39.9, platforms at 15/17/19 from a pure, rng-free `hamletGiants()` shared with the resident-NPC anchors), plank platforms and sagging rope bridges registering `bough` pads, stilt huts, vine ropes to the ground, a fire pit — under a deliberately dense private Weave (~92% coverage) that hides it from above, skipping the shared canopy/viaduct/canal/oddity passes. Discovery, residents, and story use of the hamlet belong to sibling capabilities.

#### Scenario: Recomputable without building

- **WHEN** any system needs the hamlet location
- **THEN** the same ring scan yields the same chunk with no chunk build

#### Scenario: Village agrees with its anchors

- **WHEN** the hamlet chunk builds its platforms
- **THEN** they sit exactly where `hamletGiants()` says, so runtime NPC anchors and geometry never diverge

### Requirement: The per-session Spire

The Spire SHALL be re-rolled once per session to a random chunk with `cx, cz ∈ [0, 16)`, standing at the chunk center as a 22 m square tower of height 78 with vines on all sides, a guardian tree ring, a rooftop glow garden, and an old broadcast mast (climbable trunk entry to `h + 10`) with a lamp head. Persistent story state that must survive the re-roll is stored Spire-relative (story-campaign capability), and the campaign save is parsed in `core.js` before worldgen so `buildChunk` can render the planted oasis and the permanently relit beacon without story.js being loaded yet. The south-face ground-to-summit ladder is specified in the ladders capability.

#### Scenario: A fresh Spire every session

- **WHEN** a new session starts
- **THEN** the Spire occupies a random chunk in the 16×16 origin region and its chunk builds the iconic tower

#### Scenario: Worldgen reads story state before story.js loads

- **WHEN** the planted-oasis chunk or the completed campaign's Spire builds during session init
- **THEN** the sapling oasis / relit beacon appear, because the persisted save was parsed at load in core.js

