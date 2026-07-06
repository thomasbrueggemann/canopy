## ADDED Requirements

### Requirement: Analytic sun-occlusion probe

Sun exposure SHALL be computed by marching an implicit ray from the player toward the sun direction against the runtime collision arrays of the 3×3 resident chunks — no THREE.Raycaster and no allocations. Any solid AABB across the path SHALL yield full shade (exposure 0). Each genuinely-overhead leaf pad (`pad.y > playerY + 0.5`, hit within `0.92 × r`) SHALL multiply transmittance by `1 − 0.75` (leaves are partial cover), a `net` pad by only `1 − 0.35`, and a trunk crossing by `1 − 0.9` — matching the per-layer shade behavior in the canopy-layers and sky-nets capabilities. When the sun's direction has `y ≤ 0.05` (dawn/dusk/night) exposure SHALL be 0. If the ray leaves the 3×3 ring horizontally while still below leaf height (~45 m) and the player is below `CANOPY_Y = 24`, a beyond-range canopy-average factor of `1 − 0.5` SHALL be applied so low sun angles do not falsely burn sheltered streets.

#### Scenario: A roof gives full shade

- **WHEN** a solid AABB lies on the ray between the player and the sun
- **THEN** exposure is exactly 0

#### Scenario: Stacked leaf pads multiply

- **WHEN** two leaf pads overhang the player on the sun ray
- **THEN** transmittance is `0.25 × 0.25`, far deeper shade than one pad

#### Scenario: Low sun over the endless forest

- **WHEN** the player stands in a street below `CANOPY_Y` with the sun low so the ray exits the 3×3 ring below 45 m
- **THEN** the statistical canopy factor halves the remaining transmittance

### Requirement: Throttled probe with smoothed exposure

The occlusion probe SHALL run at ~5 Hz (every 0.20 s), and the player's effective exposure `sunE` SHALL lerp toward the latest probe result at rate `dt × 4`, so walking through alternating sun shafts and shade produces smooth transitions instead of flicker. The player SHALL count as exposed (driving messages, missions, and the HUD sun state) when `sunE > 0.55`.

#### Scenario: No flicker between shafts

- **WHEN** the player runs through a row of alternating light shafts
- **THEN** exposure ramps smoothly between probe results rather than stepping every frame

#### Scenario: Exposed threshold

- **WHEN** smoothed exposure rises past 0.55
- **THEN** the player is flagged exposed

### Requirement: Body-heat gain in the sun

While the day factor is above 0.05, body heat SHALL rise at `dayF × 2.6 × smooth(0.25, 0.9, E)` per second (before modifiers), so exposure below 0.25 counts as shade and gains nothing, dappled light burns slowly, and a full noon shaft overheats an unprotected player in roughly 40 s. The rate SHALL be scaled by the Gardener's Mantle ×0.75 when owned (ciphers capability) and by the weather mixer's heat multiplier (weather-events capability). Heat SHALL always be clamped to [0, 100].

#### Scenario: Shade under 0.25 is free

- **WHEN** the player's smoothed exposure stays below 0.25 during the day
- **THEN** body heat does not rise

#### Scenario: Noon shaft overheats in about 40 seconds

- **WHEN** the player stands in raw noon sun (E ≈ 1, dayF ≈ 1) with no modifiers
- **THEN** heat climbs at ≈2.6/s, reaching 100 in roughly 40 s

### Requirement: Heat drain in shade, night, water, and pits

Whenever heat is not being gained (night, or an effectively shaded probe), body heat SHALL drain at 7/s baseline, 14/s while deep in a pit (`inPit` and `y < −1`, which also forces exposure to 0 — the sinkhole bowl is deep shade), and 28/s while wading in water. The weather mixer's drain multiplier applies on top (the Long Rain drains faster).

#### Scenario: Water cools fastest

- **WHEN** an overheated player wades into a reservoir
- **THEN** heat drains at ~28/s, four times the base shade rate

#### Scenario: The pit is cool and dark

- **WHEN** the player stands on a sinkhole floor below y = −1
- **THEN** exposure is forced to 0 and heat drains at ~14/s

### Requirement: Air-temperature readout

The HUD air temperature SHALL be modeled as `lerp(27, 46, dayF)` °C, +11 °C while exposed, cooled by altitude up to −3 °C above 40 m (`clamp((y − 40) × 0.04, 0, 3)`), −6 °C deep in a pit, plus the weather mixer's air addition. It is a readout only — body heat is driven by the exposure model, not this number.

#### Scenario: Noon reads hotter in the open

- **WHEN** it is full day and the player steps from shade into raw sun
- **THEN** the displayed air temperature rises by 11 °C

### Requirement: Last-shade anchor

The game SHALL maintain a last-shade position: whenever the player is grounded below `CANOPY_Y` with exposure under the shade-safe threshold (0.25, lowered during a heat wave per the weather-events capability), the position is recorded at most once per second. This anchor SHALL be the wake point for the R recall, heatstroke, and every blackout, guaranteeing recovery always starts somewhere sheltered.

#### Scenario: Anchor follows shaded ground travel

- **WHEN** the player walks a shaded street for several seconds
- **THEN** the last-shade anchor updates along the way (throttled to ~1 Hz)

#### Scenario: Exposed roofs never anchor

- **WHEN** the player stands exposed above `CANOPY_Y`
- **THEN** the last-shade anchor keeps its previous shaded position

### Requirement: Heatstroke faint

When body heat reaches 100 the player SHALL faint: the screen fades to black, and after ~0.85 s the player wakes at the last-shade anchor with velocity zeroed and heat set to 55, with a message. During the fade heat is pinned at 99 so the faint cannot retrigger.

#### Scenario: The sun takes the player

- **WHEN** heat reaches 100
- **THEN** the screen fades, the player wakes at the last shade with heat 55, and the faint fires exactly once
