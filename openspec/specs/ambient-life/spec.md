# ambient-life Specification

## Purpose
TBD - created by archiving change codify-living-world. Update Purpose after archive.
## Requirements
### Requirement: One global wind drives all ambient motion

A single global wind state SHALL advance every frame — a fixed direction with a gust value
built from two beating sines under an occasional slow swell envelope (range about −1.6 to
+1.9) — and every ambient motion SHALL read it rather than rolling its own: foliage
"breathes" via a shared tiny UV-offset wobble on the batched vine/grass materials (batched
chunk geometry cannot animate per-vertex), pollen drifts downwind, smoke bends downwind as
it rises, banners flutter harder in gusts, lanterns sway, and leaf scraps skid.

#### Scenario: A gust moves everything together

- **WHEN** the gust envelope swells
- **THEN** foliage shimmer, pollen drift, smoke bend, banner flutter, and lantern sway all strengthen in the same frames from the same wind state

### Requirement: Pollen and firefly drifters wrap around the player

Two particle drifter clouds SHALL wrap in a box around the player so they are always
present without spawning: about 340 pollen motes (26 m box, sinking and drifting downwind,
opacity scaled 0.24 + dayF × 0.3) and about 150 fireflies (30 m box, low to the ground,
visible only at night with per-fly blink cycles). Fireflies over a deepgreen-biome chunk
SHALL glow 1.8× brighter, making the deep green read bioluminescent at night.

#### Scenario: Fireflies wake at night

- **WHEN** the night factor rises above the visibility threshold
- **THEN** fireflies appear, each blinking on its own cycle, and pollen fades toward its dim night opacity

#### Scenario: Deep green burns brighter

- **WHEN** the player's chunk is deepgreen biome at night
- **THEN** firefly glow is 1.8× its normal brightness

### Requirement: Chimney smoke at the hearths

Pooled smoke SHALL rise from up to 4 nearest smoke anchors within 62 m (chimneys and fire
pits recorded at chunk build time), 10 puffs per emitter, each puff cycling a 2.6–5 s life:
rising, spreading, bending downwind, and colour-blending from warm grey into the fog colour
as it dissipates. Smoke visibility SHALL peak at dusk and dawn, hold through the day, and
vanish at deep night.

#### Scenario: Smoke bends downwind and fades to fog

- **WHEN** a smoke puff ages through its life
- **THEN** it rises and drifts downwind, and its colour blends from warm grey to the current fog colour before recycling

#### Scenario: Dusk is the smoke hour

- **WHEN** the sun sits near the horizon
- **THEN** smoke opacity is at its strongest, and it is gone at deep night

### Requirement: Swinging lanterns mark the night streets

Up to 10 additive glow sprites SHALL hang at build-time swing anchors within 55 m, visible
only at night, each swaying ±0.1 m with wind bias and flickering gently on the night
factor.

#### Scenario: Lanterns come out at night

- **WHEN** the night factor exceeds its threshold and swing anchors are within 55 m
- **THEN** glow sprites appear at those anchors, swaying and flickering; by day they are hidden

### Requirement: Morning drips under the spans

Up to 6 dew drips SHALL fall from drip anchors (bridge and viaduct undersides) within 45 m
during the morning dew window: each spawns with probability scaled by the dew factor, falls
under gravity, and dies 4.5 m below its anchor. Outside the dew window the pool is hidden.

#### Scenario: Dew window opens

- **WHEN** the dew factor rises after dawn near a viaduct underside
- **THEN** occasional streaks drip from the deck underside, accelerating downward and vanishing after 4.5 m

### Requirement: Cloth banners flutter on the wind

A pool of 3 two-panel cloth banners SHALL attach to the nearest banner anchors within 52 m,
tinted per-anchor from a fixed three-hue palette, with the outer half-panel waving on a
hinge driven by the wind gust. Unassigned pool slots stay hidden.

#### Scenario: The outer panel rides the gust

- **WHEN** a banner is assigned to an anchor
- **THEN** its outer panel's hinge angle follows the wind gust on top of its idle wave, and the banner shows that anchor's palette hue

### Requirement: Pooled, anchor-driven, allocation-free

Every ambient system SHALL be a fixed-size pool created once (one Points draw call for
smoke, scraps, lanterns, and drips; a tiny mesh pool for banners; two Points clouds for the
drifters), fed by scanning only already-resident chunk collision data for its anchors (the
nearest-N-within-range idiom over the nearby chunk window) with reused scratch buffers — no
per-frame allocation, no chunk builds or peeks, and no persistence. Unused slots park
off-world rather than being destroyed.

#### Scenario: Anchors come from resident chunks only

- **WHEN** the per-frame vignette update runs
- **THEN** anchor queries read only chunks already resident around the player and never build or peek a chunk

#### Scenario: Pools never grow

- **WHEN** more anchors are in range than a pool has slots
- **THEN** only the nearest N are served and no new meshes or buffers are allocated

