## MODIFIED Requirements

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
