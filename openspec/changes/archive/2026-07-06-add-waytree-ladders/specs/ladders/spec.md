## ADDED Requirements

### Requirement: Ladders are rung geometry plus a climb volume

`addLadder` SHALL build a rung ladder against a vertical face — two thin side-rails plus rungs
every ~0.45 m in the wood/brass palette — and register a climb volume in `colData.ladders` as
`{ x, z, y0, y1, nx, nz }` (a vertical line segment plus the outward-facing normal). Ladder
runs longer than ~16 m SHALL be built as stacked segments with a small rest-platform pad
(layer `lookout`, a caught landing) every ~14 m so a long climb reads as a deliberate route.

#### Scenario: Ladder registers a climb volume

- **WHEN** `addLadder` builds a ladder from `y0` to `y1` on a face with normal `(nx, nz)`
- **THEN** it pushes one `colData.ladders` entry describing that line segment and normal

#### Scenario: Long runs get rest platforms

- **WHEN** a ladder run exceeds ~16 m
- **THEN** it is split into stacked segments with a `lookout` rest-platform pad every ~14 m

### Requirement: Latching onto a ladder

Pressing E near a ladder SHALL latch the player onto it: the nearest ladder whose climb line is
within ~1.6 m horizontally and whose span contains (or is within ~1.5 m of) the player's feet
is chosen; the player is snapped to the climb line offset ~0.55 m along the normal, velocity is
zeroed, and `onLadder` is set. When unlatched and a ladder is within ~2.2 m, a throttled
"E — climb the ladder" hint SHALL be shown.

#### Scenario: E latches the nearest ladder

- **WHEN** the player presses E within catch range of a ladder
- **THEN** the player snaps onto the climb line with zeroed velocity and is latched

#### Scenario: Proximity hint

- **WHEN** the player is unlatched and within ~2.2 m of a ladder
- **THEN** a throttled climb hint is shown

### Requirement: Climbing while latched is locked-in and safe

While latched, the player SHALL climb up with W/ArrowUp and down with S/ArrowDown at
`CLIMB_SPEED * 1.25` (faster than vines), with no facing requirement, gravity off, and A/D
having no effect. The player SHALL stay snapped to the climb line so a weather gust can never
shove them off, while heat and exposure continue to tick normally.

#### Scenario: No facing requirement

- **WHEN** the player holds W while latched, regardless of view direction
- **THEN** the player climbs upward at the ladder climb speed

#### Scenario: Gust cannot dislodge a latched climber

- **WHEN** a weather gust occurs while the player is latched
- **THEN** the player remains snapped to the climb line

### Requirement: Topping out and bottoming out a ladder

Climbing up to within ~0.3 m of the top (`y1`) SHALL auto-mantle the player: place them ~0.9 m
inward (against the normal) at `y1 + 0.05` with a small upward pop, and unlatch — landing on
the deck or rest platform. Climbing down to the bottom (`y0`) SHALL unlatch the player grounded.

#### Scenario: Auto-mantle at the top

- **WHEN** the player climbs to near the top of a ladder
- **THEN** the player is placed inward onto the deck with an upward pop and is unlatched

#### Scenario: Step off at the bottom

- **WHEN** the player climbs down to the foot of a ladder
- **THEN** the player unlatches, grounded

### Requirement: Leaving a ladder

Pressing Space while latched SHALL hop the player off backward (a push along the normal with an
upward impulse) and unlatch. Pressing E while latched SHALL let go in place, dropping the
player, with the ensuing fall measured from the release point. E SHALL always release a latched
ladder before any positional interaction can consume the press.

#### Scenario: Space hops off backward

- **WHEN** the player presses Space while latched
- **THEN** the player is pushed backward off the ladder with an upward impulse and unlatched

#### Scenario: E lets go in place

- **WHEN** the player presses E while latched
- **THEN** the player releases and drops, the fall measured from the release point

### Requirement: No surprise catches, but deliberate saves allowed

Falling past a ladder SHALL NOT auto-latch the player (no surprise catches). Latching while
airborne within the catch radius via a deliberate E press SHALL be allowed as an intentional
mid-fall save.

#### Scenario: Falling past does not catch

- **WHEN** the player falls past a ladder without pressing E
- **THEN** the player is not latched and continues falling

#### Scenario: Mid-fall latch save

- **WHEN** the player presses E while airborne within a ladder's catch radius
- **THEN** the player latches onto the ladder, arresting the fall

### Requirement: Ladders on the two big structure climbs

The two big structure climbs SHALL carry deterministic ladder runs by worldgen: the Spire's
south face SHALL get a ground-to-summit ladder run (stacked segments with rest platforms), and
the fallen-tower anomaly SHALL get a ladder from the ground to the top of the fallen slab. No
mission logic change SHALL be required — the summit and cache checks fire on arrival however the
player got there.

#### Scenario: Spire is climbable by ladder

- **WHEN** the Spire chunk is generated
- **THEN** a ground-to-summit ladder run is bolted to its south face

#### Scenario: Fallen tower is climbable by ladder

- **WHEN** the fallen-tower anomaly is generated
- **THEN** a ladder runs from the ground to the top of the fallen slab
