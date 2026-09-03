## ADDED Requirements

### Requirement: Countdown, cards and best times

Every timed trial SHALL begin its timed phase with a 3-2-1-GO countdown (beeps, timer and
fail rules frozen). Completion SHALL show a card with medal, elapsed time, best time for
that tier (or FIRST CLEAR) and a NEW BEST tag when improved; failure SHALL show a red card
with the reason. Best times SHALL persist at `canopy.trialbest` keyed by trial and tier.
The timer SHALL pulse and tick under ten seconds.

#### Scenario: New best recorded

- **WHEN** a gold Sun Courier completes faster than the stored gold time
- **THEN** the card shows NEW BEST and the stored time updates

### Requirement: Canopy Run

A seventh trial, Canopy Run, SHALL sit after Sun Courier in the unlock ladder. Its course
SHALL be eight ring gates chained greedily over resident canopy pads and vined rooftops
(segments 16–42 m, widening to 10–60 m), feasible with at least six gates, passed in order
within 2.8 m, budget Σdistance / 7.5 × 1.5 × tier multiplier. Falling does not fail it.

#### Scenario: Gates in order

- **WHEN** the player flies through gate 3 before gate 2
- **THEN** gate 3 does not count and gate 2 remains the current gate

## MODIFIED Requirements

### Requirement: Trial HUD, markers, and SHOT gating

An active trial SHALL own the mission panel (title "name · TIER", objective line) and the
minimap label, and show the trial timer — "· · ·" for untimed phases, mm:ss otherwise,
tinted amber under 20 s and red under 8 s, pulsing and ticking under 10 s. Course markers
SHALL be pooled **ring gates** (spinning emissive tori with an inner glow; the current gate
full strength, the next at 45 %) with a gold orb variant for relics; a small gate hovers
over a trial-master while a trial is offerable. The trial update SHALL NOT run in SHOT mode.

#### Scenario: Timer colour warns

- **WHEN** a timed trial has 15 s left
- **THEN** the timer shows m:ss in amber, turning red and pulsing under 8 s

#### Scenario: Markers are pooled

- **WHEN** trials start and end repeatedly in one session
- **THEN** the same pooled gate objects are re-positioned and toggled, never allocated anew

#### Scenario: No trials in SHOT mode

- **WHEN** the game runs with a SHOT preset
- **THEN** no trial-masters spawn and no trial state appears
