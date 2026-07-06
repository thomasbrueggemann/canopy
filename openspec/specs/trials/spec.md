# trials Specification

## Purpose
TBD - created by archiving change codify-missions-trials. Update Purpose after archive.
## Requirements
### Requirement: Six trials in an unlock ladder

The trials system SHALL offer six named trials in the fixed order Sun Courier, Track
Runner, The Ascent, Night Salvage, Freefall Faith, The Rumor. Each trial except The Rumor
SHALL unlock only when its predecessor has been completed at any tier (the first is always
unlocked); The Rumor SHALL unlock once any two other trials are completed. At most one
trial runs at a time, and starting a trial SHALL fail any active errand (mutual exclusion).

#### Scenario: Ordered gating

- **WHEN** the player has completed only Sun Courier
- **THEN** Track Runner is unlocked and The Ascent is not

#### Scenario: The Rumor unlocks after any two

- **WHEN** any two trials other than The Rumor are completed at any tier
- **THEN** The Rumor becomes offerable

### Requirement: Tier ladder with persistent best

Each trial SHALL be attempted at the tier after its best completed tier — bronze, then
silver, then gold, repeating gold once earned. Tier SHALL scale the time budget by a fixed
multiplier: bronze 1.35, silver 1.15, gold 1.0. Best tiers SHALL persist to
`localStorage['canopy.trials']` as a map of trial id to best tier index, written only when a
completion improves the stored tier, and restored on load with the guarded storage idiom.

#### Scenario: Next attempt climbs the ladder

- **WHEN** the player has completed Sun Courier at bronze and accepts it again
- **THEN** the attempt runs at silver with the 1.15 time multiplier

#### Scenario: Best tier persists

- **WHEN** the game reloads after a silver completion
- **THEN** the stored best tier for that trial is still silver and the next offer is gold

### Requirement: Deterministic trial-master placement

Trial-masters SHALL spawn at deterministic chunk centres: plaza chunks where
`hash2(ix,iz,7788) % 2 === 0` and city chunks where `hash2(ix,iz,7789) % 17 === 0`. They
SHALL be synced over the 3×3 chunk window around the player — created on entry, removed on
exit — and turn smoothly to face the player within 18 m. They carry a distinct staff-and-orb
silhouette and appear as teal dots on the minimap.

#### Scenario: Same plazas every session

- **WHEN** the player revisits a plaza chunk whose hash passes the gate in a later session
- **THEN** a trial-master stands at the same chunk centre

#### Scenario: Culled with the window

- **WHEN** the player leaves the 3×3 chunk window around a trial-master
- **THEN** that trial-master is removed from the scene

### Requirement: Offering respects feasibility and steers when blocked

Pressing the interact key within 3.4 m of a trial-master with no trial active SHALL offer a
trial: the master's deterministic preference (seeded by its chunk hash) when that trial is
unlocked and feasible, else the first unlocked feasible trial. Feasibility SHALL be checked
live: Track Runner needs a viaduct within 2 chunks, Night Salvage needs night (day factor
< 0.35) and a sinkhole within 8 chunks, Freefall Faith needs a high Weave or nest pad (≥
24 m), The Rumor needs both of its first two clue features findable. When nothing is
offerable the master SHALL explain the first real blocker (come back after dusk, no viaduct
in reach, and so on); when every trial is gold he SHALL bow and decline.

#### Scenario: Blocked salvage steers to dusk

- **WHEN** the only unlocked-but-infeasible trial is Night Salvage during the day
- **THEN** the trial-master tells the player to come back after dusk instead of starting anything

#### Scenario: All-gold has nothing to teach

- **WHEN** every trial is completed at gold and the player interacts
- **THEN** the master bows and no trial starts

### Requirement: Time budgets derived from distance and top speed

Timed trials SHALL compute their budget from the actual course and the player's effective
sprint speed (walk speed × sprint factor, ×1.1 with the sprint boost), scaled by the tier
multiplier: Sun Courier gets distance ÷ sprint speed; Track Runner gets a per-checkpoint
budget of 64 ÷ sprint speed × 1.7, refilled at each of three checkpoints 64 m apart; The
Ascent gets (height ÷ 1.05 + horizontal ÷ sprint speed) × 1.7; Night Salvage gets (2 ×
distance) ÷ sprint speed × 2.0; Freefall Faith's drop phase gets start height × 0.6. The
Rumor and pre-gate phases are untimed. Any timed trial SHALL fail when its clock reaches
zero, and all trials except The Rumor SHALL fail if the player's heat reaches 98 while
exposed.

#### Scenario: Clock runs out

- **WHEN** an active timed trial's remaining time reaches zero
- **THEN** the trial fails with the "clock beat you" line and markers hide

#### Scenario: Budget scales with tier

- **WHEN** the same course is attempted at bronze and later at gold
- **THEN** the bronze budget is 1.35× the base formula and the gold budget 1.0×

### Requirement: Per-trial course rules

Each trial SHALL enforce its own course rules: Sun Courier completes within 5 m of a far
rooftop target (picked ~3 chunks away in a master-seeded direction) at its height; Track
Runner starts untimed at a deck gate, then fails if the player drops below deck height
(y < 7) and completes after three checkpoints; The Ascent targets a waytree lookout when
one is within 4 chunks, else the colossus, else the Spire beacon, arms once the player is
3 m off the base, fails on touching true ground while armed (grounded with no support layer
at y < 1.5), and shows two intermediate ring markers at one- and two-thirds height; Night
Salvage requires descending below ground level (y < 0) to take the relic, after which the
flashlight is fouled (dim, flickering, off-tint) until the return point; Freefall Faith
requires reaching a high canopy start marker then dropping to a ground marker before the
fall clock empties, arriving grounded below 4 m.

#### Scenario: Off the deck ends the run

- **WHEN** the player falls below y = 7 during Track Runner's run phase
- **THEN** the trial fails with the off-the-deck line

#### Scenario: Ground touch breaks The Ascent

- **WHEN** the player, having climbed above the arming height, lands on true ground (no canopy or structure support, y < 1.5)
- **THEN** The Ascent fails with the unbroken-climb line

#### Scenario: The relic fouls the light

- **WHEN** the player takes the Night Salvage relic below ground and heads home
- **THEN** the flashlight flickers dim and off-colour until the trial ends, when its colour is restored

### Requirement: The Rumor — three clues to the Hidden Hamlet

The Rumor SHALL be an untimed three-clue chase over real deterministic world features: a
broken viaduct span (located via the same span-hash the builder uses), then the nearest
sinkhole, fern circle, or wind-chime pole (with a clue line matching which kind was found),
then the Hidden Hamlet itself — final leg deliberately marker-less, guided only by a
compass-bearing phrase toward the hamlet. Markers SHALL appear only for the clue already
given. Reaching within 12 m of the hamlet completes the trial, records the tier, and fires
the hamlet discovery. If the story campaign already discovered the hamlet by walking this
rumor, offering The Rumor SHALL record the tier and acknowledge instead of re-running.

#### Scenario: Clue two matches its feature

- **WHEN** the player reaches the broken span and the second clue resolves to a fern circle
- **THEN** the clue line is the fern-ring line and the marker moves to the fern circle

#### Scenario: Final leg has no marker

- **WHEN** the third clue is given
- **THEN** no marker or objective points at the hamlet; only the bearing phrase guides the player

#### Scenario: Story already walked the rumor

- **WHEN** the campaign discovered the hamlet via its Chapter 5 rumor and the player accepts The Rumor
- **THEN** the tier is recorded and the master acknowledges without restarting the chase

### Requirement: Hidden Hamlet discovery event

Hidden Hamlet discovery SHALL fire exactly once per save, triggered either by proximity
(within 25 m of the hamlet centre) or by completing The Rumor: it sets the persistent flag
(`localStorage['canopy.hamlet']`), shows the discovery message once, renames the hamlet
chunk's HUD district label to "The Hidden Hamlet", and adds the permanent hut marker to the
minimap. Completing The Rumor additionally SHALL set `canopy.hamletErrand`, which unlocks a
one-time standing thank-you from the hamlet elders when the player next stands within 3.2 m
of a resident.

#### Scenario: Walking into the hamlet counts

- **WHEN** an undiscovered player wanders within 25 m of the hamlet centre with no trial active
- **THEN** the discovery fires, persists, and the hut appears on the minimap in this and later sessions

#### Scenario: Elders remember the rumor-follower

- **WHEN** `canopy.hamletErrand` is set and the player stands within 3.2 m of a hamlet resident
- **THEN** the elder's thank-you line plays once per save

### Requirement: Abandoning is always possible

Holding the abandon key (G) for 0.9 s during any trial SHALL abandon it without penalty
beyond losing the attempt: markers hide, the objective reverts, and the trial-master's line
notes the way stays open. The hold gesture SHALL be taught in every trial's start message.

#### Scenario: Hold G to walk away

- **WHEN** the player holds G for 0.9 s mid-trial
- **THEN** the trial ends as abandoned, with no tier recorded and no lockout

### Requirement: Completion rewards and the sprint boost

Completing a trial SHALL play a rising synthesized fanfare, show the gold completion line,
and record the tier if improved. When the completion makes every trial gold, the player
SHALL permanently gain a 1.1× sprint-speed boost, persisted to
`localStorage['canopy.sprintboost']` and re-applied on load; the boost SHALL be announced
once with a delayed gold message.

#### Scenario: All-gold grants the boost

- **WHEN** the final gold completion lands and the boost is not yet owned
- **THEN** `canopy.sprintboost` is set, sprint speed gains the 1.1× multiplier immediately and on every later load

#### Scenario: Improved tier recorded

- **WHEN** a trial completes at a higher tier than stored
- **THEN** the stored best tier updates and is saved

### Requirement: Trial HUD, markers, and SHOT gating

An active trial SHALL own the mission panel (title "name · TIER", objective line) and the
minimap label, and show the trial timer — "· · ·" for untimed phases, mm:ss otherwise,
tinted amber under 20 s and red under 8 s. Course markers SHALL come from a pooled set of
reusable marker meshes (toggled visible, never re-created) with a distinct relic tint for
special targets. The trial update (including trial-master sync) SHALL NOT run in SHOT mode.

#### Scenario: Timer colour warns

- **WHEN** a timed trial has 15 s left
- **THEN** the timer shows m:ss in amber, turning red under 8 s

#### Scenario: Markers are pooled

- **WHEN** trials start and end repeatedly in one session
- **THEN** the same pooled marker meshes are re-positioned and toggled, never allocated anew

#### Scenario: No trials in SHOT mode

- **WHEN** the game runs with a SHOT preset
- **THEN** no trial-masters spawn and no trial state appears

