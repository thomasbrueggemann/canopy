# world-anomalies Specification

## Purpose
TBD - created by archiving change codify-world-engine. Update Purpose after archive.
## Requirements
### Requirement: The colossus chunk

A `colossus` chunk SHALL build one mega-tree piercing all three canopy veils: trunk height 55 at radius 6 (freeclimbable), root buttresses with low trunk collision to weave between, a spiral limb staircase of 11 `bough`-pad limb steps winding from the ground to ~46 m, a crown hamlet of 3–4 linked crown nests at 47–51 m joined by limb bridges, and a beacon lamp at the top that reads across the night map. Its chunk emits no shared Weave (the crown replaces it) and it registers a bold minimap tree dot.

#### Scenario: Two ways up

- **WHEN** a colossus is generated
- **THEN** the player can freeclimb the radius-6 trunk or walk the spiral limb staircase's `bough` pads to the crown

#### Scenario: Crown hamlet is walkable

- **WHEN** the player reaches ~47 m on a colossus
- **THEN** linked crown nests and limb bridges register walkable pads between them

### Requirement: The fallen-tower chunk

A `fallen` chunk SHALL build a standing tower (built with `noRegion` so biome height scaling never breaks the geometry contract) with a collapsed tower shell leaning against its south face as a walkable ramp: a tilted slab from the street to roof height `h − 1`, registering a run of `fallen`-layer ramp pads (~1.3 m spacing) so the incline is an ordinary walk — and a hard surface, not a caught landing. A rubble field with trunk collision and vine streamers dress the base. The builder SHALL return the east-face ladder anchor consumed at the rng-stream tail (ladders capability).

#### Scenario: Street to roof on foot

- **WHEN** the player walks up the fallen slab
- **THEN** overlapping `fallen` ramp pads support them continuously from the street to the standing tower's roof

#### Scenario: The slab is hard

- **WHEN** the player falls more than 10 m onto the ramp
- **THEN** the landing is a hard landing (ramp pads are not in the caught-surface set)

### Requirement: The sinkhole chunk

A `sinkhole` chunk SHALL cave its block interior into a bowl: a pit descriptor of radius 15 and depth 4 lowers the ground inside it (player-movement capability), with a grid of `pit`-layer floor pads at −4, a rock rim ring, inward-angled wall slabs, hanging root ribbons, a dense glow garden on the floor, and exactly 3 climbable roots registered as trunks with `h = 16` (above the 14 m climb threshold) so the player can always freeclimb back out. Deep in the bowl (y < −1) counts as deep shade and cools (heat-exposure capability).

#### Scenario: Always a way out

- **WHEN** the player is at the bottom of a sinkhole
- **THEN** at least three climbable roots (h 16 trunks) lead back to the rim

### Requirement: The reservoir chunk

A `reservoir` chunk SHALL build a 30 m square open tank: four wall solids of height 8 that are both walkable parapets and vine-climbable, an interior wade floor solid at 7.1, a water rect at y 7.8 spanning the interior only (so the parapet stays dry), two counter-drifting ripple planes reusing the shared water materials, and 3 climbable vine ropes up the outside. Wading inside drains heat at the water rate (heat-exposure capability).

#### Scenario: Over the wall into the water

- **WHEN** the player climbs an outside vine rope and drops into the tank interior
- **THEN** they wade at ~0.7 m depth with `inWater` true, and heat drains fast

### Requirement: The Elevated Line viaduct

Ruined viaducts SHALL run along rare grid lines chosen per line index — `hash2(ix,0,6001) % 7 === 0` for x-lines and `hash2(0,iz,6002) % 7 === 0` for z-lines — so every chunk touching a line renders its share identically with no cross-chunk seams. Each chunk carries 4 spans of 16 m at deck height 9: span survival is `hash2(lineIdx, spanIndex, 6003) % 100 < 75` (fallen spans leave street debris and a deadly gap), surviving decks register dense `viaduct`-layer pads (a hard surface), piers register short non-climbable trunk collision, and guard rails line the edges. Deck dressing (ballast, sleepers, twin rails with bright tops, bent rails drooping into ~60% of gap edges, a derailed carriage on ~1/4 of line chunks, a stranded bus every ~9 spans) SHALL be seeded off `(lineIdx, spanIndex)` salts so both chunks sharing a span edge agree byte-for-byte. About 1/3 of line chunks (salt 6004) SHALL add a collapsed access-ramp slab with `viaduct` ramp pads from the street to the deck.

#### Scenario: Neighbours agree on every span

- **WHEN** two adjacent chunks on a viaduct line are built independently
- **THEN** they agree on which spans exist and on the deck dressing at their shared edge

#### Scenario: The broken span is a real gap

- **WHEN** a span fails its survival roll
- **THEN** no deck or pads exist there — a walker on the deck can fall through the gap to the street

### Requirement: Canal waterways

Canals SHALL replace the street strip along rare street lines — `hash2(ix,0,7001) % 8 === 0` (x-lines) and `hash2(0,iz,7002) % 8 === 0` (z-lines): a channel of half-width 3.5 with silt bed at −1.2 (registered as a rect pit so the bed is the floor), water at −0.35 (a wading/cooling water rect spanning the channel), mossy embankment walls with tow-path banks, and two drifting ripple planes. The crossing border road SHALL always get an arched stone bridge (`bridge` pads), plus a mid-block plank footbridge on ~40% of chunks (salts 7003/7004). Street asphalt is skipped on canal lines while the sidewalks remain as tow-paths, and lamps, cars, and stalls SHALL keep out of the channel guard strip (±4.2 m). Canal-viaduct crossings are allowed (water below, rails above); the Weave's hammock pass keeps a sky corridor open above canals (sky-nets capability).

#### Scenario: Continuous water line across chunks

- **WHEN** consecutive chunks along a canal line are built
- **THEN** each renders its own share of the same channel, joining seamlessly at the borders

#### Scenario: Every crossing is bridged

- **WHEN** a border road crosses a canal
- **THEN** an arched stone bridge with walkable `bridge` pads carries the road over the water

### Requirement: Tier-3 oddities

Small landmark oddities SHALL be sprinkled at most one per chunk, gated on independent hash salts so the choice never disturbs the chunk's rng stream: a fern circle in 20% of park/grove chunks (salt 3221, registering a `ferns` descriptor used for night flavour and journal-page hosting), a greenhouse skeleton in 8% of park/plaza chunks (salt 3111), a candle shrine on a building corner in 12% of city chunks (salt 3333, flame dots glow at night), and a wind-chime pole in 10% of any chunk (salt 3444, registering a `chimes` point for proximity audio). Precedence follows that order — the first passing gate wins. Consumers of these registrations (journal pages, chime audio, flavour messages) belong to sibling capabilities.

#### Scenario: At most one oddity per chunk

- **WHEN** a chunk passes both the fern-circle and greenhouse gates
- **THEN** only the fern circle (higher precedence) is built

#### Scenario: Oddities are session-stable hosts

- **WHEN** a chunk hosts a fern circle this session
- **THEN** it hosts the same fern circle every session, because the gate is a pure hash of the chunk coordinates

### Requirement: The little-details sprinkle pass

Every chunk SHALL end its build (at the tail of the rng stream, so it barely perturbs earlier content) with a deterministic sprinkle of small props: 2–4 park benches (low solids, h 0.8, placed along sidewalks, around plaza fountains, or under park trees), 0–2 rusted mailboxes near building faces (trunk collision), 0–2 laundry lines from facades to poles, 3–6 dawn puddles biased to street edges (dew-driven opacity, day-night-cycle capability), 2–4 mushroom clusters on park/grove/sinkhole floors, and up to 2 corner cobwebs — all batched, visual-scale collision only where stated.

#### Scenario: Benches are solid furniture

- **WHEN** the player walks into a bench
- **THEN** a low solid (h 0.8) blocks them rather than letting them pass through

