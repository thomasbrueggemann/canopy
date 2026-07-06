# winch-lifts Specification

## Purpose
TBD - created by archiving change add-winch-lifts. Update Purpose after archive.
## Requirements
### Requirement: Waytree winch lift structure

Each waytree SHALL carry a hand-cranked counterweight lift on the +x face of the trunk (where
the deck railing leaves its gap). The lift SHALL comprise a static batched frame — two guide
rails rising to `deckY + 1.8`, a crossbeam joining their tops, a brass winch drum, a taut hoist
rope, and a hanging stone counterweight — plus a dynamic riding platform (a plank disc of
radius ~1.15 m with corner posts, a low rail ring on the ±z rail sides only so the ±x sides
stay open to step on and off, and a rope yoke). The platform SHALL register a `colData.lifts`
row `{ x, z, r: 1.15, y0, y1: deckY, y, v, mesh }` and SHALL start parked at the ground rest
(`y0 ≈ 0.28`, a low step-up). The platform mesh SHALL reuse one shared material (never a
per-lift material) so chunk disposal cannot leak.

#### Scenario: Lift registered at a waytree

- **WHEN** a waytree is generated
- **THEN** exactly one `colData.lifts` row is registered with `y1 = deckY` and the platform parked at `y0`

#### Scenario: Platform is open on the walk-on sides

- **WHEN** the riding platform is built
- **THEN** it has a rail ring only on the ±z sides, leaving the ±x sides open to step on and off

### Requirement: Discrete-press pumping

The lift SHALL be cranked only by discrete key presses: Q adds upward velocity, C adds
downward velocity, and auto-repeat (holding the key) SHALL be ignored so a held key does
nothing. Each successful press SHALL add ±`LIFT_PUMP` to the platform velocity, clamped to
±`LIFT_VMAX`. The pump target SHALL be the lift the player is riding, else the nearest lift
within ~3.2 m horizontally at any height difference (so a stranded platform can be recalled
from the deck or the ground). The first successful pump ever SHALL show a one-time message.

#### Scenario: Holding does nothing

- **WHEN** the player holds Q so the browser emits auto-repeat key events
- **THEN** only the initial press adds velocity and the repeats are ignored

#### Scenario: Recall a stranded platform

- **WHEN** the player stands at the deck and presses C while the platform is at the ground
- **THEN** the nearest lift within range gains downward velocity and begins descending

### Requirement: Velocity decay makes the climb deliberate

Each frame, every reachable lift's velocity SHALL decay exponentially and integrate its height:
`v *= exp(-LIFT_DECAY * dt)`, `y += v * dt`, with `y` clamped to `[y0, y1]` (hitting a clamp
zeroes the velocity and snaps exactly onto the end within a small tolerance). Because the
velocity bleeds off, the player MUST keep cranking to keep moving. With the skyhouse retune
(`LIFT_PUMP = 1.0`, `LIFT_VMAX = 3.2`), roughly two presses per second SHALL clear the ~45 m
skyhouse ride in ~18–24 s — fast enough that the sun-exposed upper half of the climb is spicy
but survivable at noon (roughly 40–55 heat on arrival), yet still deliberate cranking rather
than finger-work. Lifts outside the 3×3 resident chunks SHALL not move.

#### Scenario: Platform docks level with the deck

- **WHEN** an ascending platform reaches within the snap tolerance of `y1`
- **THEN** it snaps exactly to `deckY` and its velocity zeroes

#### Scenario: Stops without cranking

- **WHEN** the player stops pressing Q while ascending
- **THEN** the platform's velocity decays toward zero and it coasts to a stop

#### Scenario: Skyhouse ride is timely enough to survive the sun

- **WHEN** the player cranks steadily (~2 presses/second) up a ~45 m skyhouse ride at noon
- **THEN** the platform docks in ~18–24 s and the player arrives with survivable heat

### Requirement: Rider carry is exact in both directions

The platform SHALL carry the player exactly whenever the player stands on it, is horizontally
within `r + 0.15`, has feet within 1.2 m of the platform top, and is not moving upward
(`vel.y <= 0.01`): it snaps the player's `y` to the platform and zeroes vertical velocity, with
no falling-state flicker, no fall-damage accumulation (the fall-apex tracker follows the carried
descent), and no footstep or head-bob from the vertical motion. Horizontal movement SHALL never
be locked — walking or jumping off mid-ride is always allowed — and pressing jump SHALL still
jump normally.

#### Scenario: Carried down without fall damage

- **WHEN** the player rides the platform down from the deck
- **THEN** the player is carried smoothly and banks no fall damage on arrival

#### Scenario: Jump off mid-ride

- **WHEN** the player presses jump while riding
- **THEN** the jump is not eaten by the carry and the player leaves the platform

### Requirement: The platform is support and a caught landing

The lift platform SHALL be a vertical-support candidate exactly like a canopy pad (horizontal
within `r`, feet within the catch band), grounding the player with `supportLayer = 'lift'` and
recording which platform carries them. Falling onto the platform SHALL be a caught landing
(`SAFE_LEAF` includes `lift`).

#### Scenario: Standing on the platform grounds the player

- **WHEN** the player is over the platform within the catch band
- **THEN** the player is grounded with `supportLayer = 'lift'`

#### Scenario: Falling onto the platform is caught

- **WHEN** the player falls onto the platform from a height that would otherwise injure
- **THEN** the landing is caught with no fall damage

### Requirement: Proximity prompt teaches the keys

A throttled proximity prompt SHALL teach the pump keys: when the player is unlatched and not
riding but within ~3 m of a lift, and also when riding but stalled mid-shaft with near-zero
velocity for more than ~1 s (once per ride), the game SHALL hint that the player can step on and
crank with Q up / C down, so nobody gets stranded not knowing the controls.

#### Scenario: Hint near a lift

- **WHEN** the player stands within ~3 m of a lift without riding it
- **THEN** a throttled step-on / Q-up / C-down hint is shown

#### Scenario: Hint when stalled mid-ride

- **WHEN** the player is riding and the platform sits mid-shaft with near-zero velocity for over ~1 s
- **THEN** the same hint is shown once for that ride

### Requirement: Lift state is transient and SHOT-safe

Lift state SHALL be transient with no new persisted keys: a chunk rebuild SHALL park the
platform back at the ground rest (acceptable because resident chunks never rebuild under the
player). In screenshot/smoke (`?shot`) mode the lifts SHALL never move because nothing pumps
them. The Ascent trial's ground-touch fail check SHALL treat standing on a lift
(`supportLayer 'lift'`) as not touching the ground, so boarding at the bottom does not fail an
armed run.

#### Scenario: Rebuild parks the platform

- **WHEN** a waytree chunk is rebuilt
- **THEN** its lift platform is re-created parked at the ground rest position

#### Scenario: Boarding does not fail the Ascent

- **WHEN** an armed Ascent run has the player standing on a lift platform near the ground
- **THEN** the ground-touch fail check does not trigger

