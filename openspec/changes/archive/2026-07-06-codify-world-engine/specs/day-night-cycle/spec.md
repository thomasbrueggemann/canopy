## ADDED Requirements

### Requirement: The day clock

Time of day SHALL be a scalar `dayT ∈ [0,1)` advancing at `dt / DAY_LEN` with `DAY_LEN = 600` s, so one full in-game day lasts 10 real minutes. Holding the T key SHALL accelerate time ×60 (the player can always advance to a needed hour — the anti-soft-lock lever the ciphers and story capabilities rely on). Sessions start at `dayT = 0.30` (a long green morning); the HUD clock renders `dayT × 24` as HH:MM. In SHOT mode the clock SHALL hold its preset value so frames are deterministic.

#### Scenario: Ten-minute days

- **WHEN** 600 real seconds elapse in normal play
- **THEN** `dayT` wraps through one full day

#### Scenario: Fast-forwarding to a window

- **WHEN** the player holds T
- **THEN** the day advances at 60× until the key is released

### Requirement: Sun geometry and the day/night factors

The sun SHALL travel a fixed circle: angle `(dayT − 0.25) × 2π`, elevation `sunElev = sin(angle)`, direction `(cos, sin, 0.32)` normalized — the same `sunDir` the heat-exposure probe consumes. Two derived factors drive the rest of the game and SHALL be computed exactly as: `dayF = smooth(−0.06, 0.14, sunElev)` (heat rates, wildlife, water sparkle) and `nightF = 1 − smooth(−0.14, 0, sunElev)` (emissives, lamps, stars), plus a dusk/dawn glow band `exp(−(sunElev × 4.4)²)`.

#### Scenario: Noon is full day

- **WHEN** `dayT = 0.5`
- **THEN** `dayF = 1` and `nightF = 0`

#### Scenario: Deep night

- **WHEN** the sun is well below the horizon
- **THEN** `nightF = 1` and heat gain is off because `dayF = 0`

### Requirement: Sky dome, sun, moon, stars, and fog color

The sky SHALL be a vertex-colored back-side dome whose colors lerp between night, day, and dawn/dusk palettes by `dayF`/`nightF`/the dusk band each frame; a 150-unit additive sun sprite rides `sunDir` (opacity `smooth(−0.09, 0.02, sunElev)`), a moon sprite rides the antipode at `nightF × 0.9` opacity, 700 stars fade in with night, and 14 drifting cloud sprites stay faint. Scene fog color (and the clear color) SHALL follow the horizon color, tinted 26% toward leaf-moss during the day. The sky group is camera-centered so the dome never parallaxes.

#### Scenario: Dawn paints the horizon

- **WHEN** the sun crosses the horizon
- **THEN** the dusk band lerps the dome and fog toward the dawn palette while stars fade out

### Requirement: Directional light handoff and ambient levels

One directional light SHALL serve as both sun and moon: while `sunElev > −0.04` it carries the sun color at intensity `0.15 + dayF × 1.6` from the sun direction; else while the moon is up it swings to the antipode with moonlight color at 0.5; else it idles at 0.14 so true night is never pitch black. Hemisphere light SHALL run `0.37 + dayF × 1.14` (tinted toward moonlight at night) and ambient `0.26 + dayF × 0.50 + nightF × 0.2`.

#### Scenario: Moonlight takes over

- **WHEN** the sun sets below elevation −0.04 and the moon is up
- **THEN** the directional light switches to the moon color, intensity 0.5, lighting from the moon's direction

### Requirement: Night emissive drives

Shared materials' emissive intensities SHALL be driven from the day clock each frame: lit building windows at `nightF × 0.9 + dusk × 0.15`, glow plants at `nightF × 2.4`, lamp/beacon material at `nightF × 2.6 + dusk × 0.4`, and water's noon sparkle at `dayF × 0.10` while the two canal ripple textures counter-drift continuously. Because these are shared materials, one drive lights every chunk's batched geometry at once.

#### Scenario: Glow plants wake at night

- **WHEN** night falls
- **THEN** every glow-plant blob in every resident chunk brightens together via the single shared material

### Requirement: The dawn dew window

A dew factor SHALL rise after sunrise and dry before afternoon — `smooth(0.19, 0.30, dayT) × (1 − smooth(0.42, 0.54, dayT))` — driving the shared puddle material's opacity (peak 0.62) so the batched morning puddles fade in at dawn and vanish by midday, and exposed as `dewF` for the ambient drip vignettes.

#### Scenario: Puddles are a morning thing

- **WHEN** `dayT` passes 0.54
- **THEN** puddle opacity is 0 until the next dawn window

### Requirement: Night street lighting from a fixed lamp pool

Real night lighting SHALL come from a fixed pool of `LAMP_LIGHTS = 6` point lights (range `LAMP_REACH = 30`, no shadows) that each frame hop onto the nearest still-`working` lamp heads found in the 3×3 resident chunks' `colData.lamps`, at intensity `12 × nightF` faded smoothly by distance so pool churn never pops. Unused pool lights idle at intensity 0 but stay in the scene, so the light count — and therefore the compiled shaders — never changes. Broken lamps never receive a light; by day the whole pool idles.

#### Scenario: Lamps pool light on the street

- **WHEN** the player walks a lit street at night
- **THEN** the nearest working lamp heads carry point lights that fade with distance and hand off without popping

#### Scenario: Shader count is constant

- **WHEN** lamps enter and leave the pool
- **THEN** no lights are added to or removed from the scene — only intensities change

### Requirement: Altitude opens the horizon

Fog SHALL relax with player height: far distance lerps 215 → 580 and near 18 → 90 over `smooth(22, 44, y)`, both scaled by the weather mixer's fog multipliers and floor-clamped (far ≥ 22, near ≥ 8) so the world never fully vanishes. This is what makes breaking through the canopy read as the horizon opening; the canopy-sea reveal band itself (31–40 m) is specified in the canopy-layers capability.

#### Scenario: Climbing clears the air

- **WHEN** the player climbs from the street to 44 m
- **THEN** fog far expands from ~215 to ~580 and the horizon opens

#### Scenario: Weather cannot black out the world

- **WHEN** a dust storm multiplies fog distances down
- **THEN** the clamps hold fog far ≥ 22 and near ≥ 8
