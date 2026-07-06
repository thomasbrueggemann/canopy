## ADDED Requirements

### Requirement: One mission at a time, giver-driven

The errand system SHALL allow at most one accepted mission at any time, offered by a giver
NPC rather than a menu. While no mission is active, the system periodically (every 2.5 s
once an initial 4 s cooldown has elapsed) promotes the nearest ordinary street citizen (a
walker or tender within 30 m) to giver, pre-assigning it one feasible archetype. A giver
that drifts beyond 34 m of the player is demoted and a new one is designated later.

#### Scenario: A street citizen becomes the giver

- **WHEN** no mission is active, the giver cooldown has elapsed, and a walker or tender NPC is within 30 m
- **THEN** the nearest such NPC becomes the giver with a pre-picked archetype
- **AND** no second mission can be accepted while one is active

#### Scenario: Giver lost at range

- **WHEN** the current giver is more than 34 m from the player
- **THEN** it is demoted back to an ordinary citizen and a replacement is designated on a later scan

### Requirement: Giver marking and accept interaction

The system SHALL mark the active giver with a floating, gently bobbing yellow marker above
its head and a yellow dot on the minimap, and SHALL show the hint "Press E — hear them out"
while the player is within 3.2 m. Pressing the interact key within 3.4 m of the giver (with
no mission and no trial active, and no higher-priority interaction consuming the key) SHALL
accept the giver's archetype as a concrete mission. On accept the giver reverts to an
ordinary citizen and the marker hides.

#### Scenario: Accepting a mission

- **WHEN** the player presses E within 3.4 m of a marked giver with no mission or trial active
- **THEN** a concrete mission of the giver's archetype is built and becomes the active mission
- **AND** the giver marker hides and the giver reference is cleared

#### Scenario: Approach hint

- **WHEN** the player comes within 3.2 m of a marked giver
- **THEN** the "Press E — hear them out" hint is shown

### Requirement: Archetype selection never offers the impossible

The archetype picker SHALL only offer archetypes that are feasible at pick time: SUNRUN
requires day (day factor > 0.4) and a reachable open square or vined rooftop at least 26 m
tall; VANTAGE requires a vined rooftop (≥ 26 m) or a giant trunk (height > 20, radius ≥
1.2); LAMP requires dusk (day phase between 0.72 and 0.87) and at least three broken lamps
in loaded chunks; ERRAND is always possible. The pick SHALL be uniform among the feasible
options. If an accepted mission's target has since become unavailable, mission construction
SHALL fall back to an ERRAND rather than issuing an impossible mission.

#### Scenario: Dusk-only lamplighter

- **WHEN** the day phase is outside 0.72–0.87 or fewer than three broken lamps are loaded
- **THEN** the LAMP archetype is not offered

#### Scenario: Fallback to errand at accept

- **WHEN** a VANTAGE, SUNRUN, or LAMP mission is accepted but its target scan now returns nothing usable
- **THEN** the mission is built as an ERRAND parcel delivery instead

### Requirement: VANTAGE — reach the high roost

A VANTAGE mission SHALL target, in order of preference: a resident waytree lookout deck
(when one exists beyond 14 m, recomputed from the deterministic waytree hash per the
waytrees capability), else the closer of the nearest vined rooftop (≥ 26 m) and the nearest
giant trunk. It completes when the player stands on the summit: horizontally within the
target's half-extent plus 1 m and vertically above the top minus 1.5 m. Completed vantage
positions SHALL persist for the session as faint minimap pins.

#### Scenario: Waytree lookout preferred

- **WHEN** a VANTAGE mission is accepted and a waytree lookout is resident beyond 14 m
- **THEN** the mission targets the lookout deck rather than a rooftop or trunk

#### Scenario: Summiting completes the mission

- **WHEN** the player is within the summit box (half-extent + 1 m, top − 1.5 m) of the vantage target
- **THEN** the mission completes with its reward line and the vantage is pinned on the minimap for the session

### Requirement: SUNRUN — fetch the cache and return to shade

A SUNRUN mission SHALL run two stages. Stage one targets the cache (the nearest open square,
else a tall vined rooftop); it is reached within 5 m horizontally when the player is exposed
to the sun (ground targets) or within 2 m of the target height (elevated targets). Stage two
retargets the objective at the player's last shaded position; the mission completes when the
player is unexposed, grounded, and below the canopy line. At any point during the mission,
reaching full body heat (≥ 98) while exposed SHALL fail it.

#### Scenario: Cache reached flips the objective home

- **WHEN** the player reaches the cache point in stage one
- **THEN** the mission advances to stage two and the objective marker retargets the remembered shade position

#### Scenario: Overheating fails the run

- **WHEN** the player's heat reaches 98 while exposed during a SUNRUN
- **THEN** the mission fails with its failure line

### Requirement: LAMP — wake the dark lamps before true night

A LAMP mission SHALL select the 4–5 nearest broken lamps and require the player to wake each
by approaching within 3.2 m; each woken lamp gains a visible flame from a pooled mesh and
increments the progress counter shown in the HUD. The objective marker SHALL continuously
retarget the nearest unlit lamp. Waking all lamps completes the mission; if true night
arrives first (night factor > 0.55), the mission SHALL fail.

#### Scenario: Waking a lamp

- **WHEN** the player comes within 3.2 m of an unlit mission lamp
- **THEN** the lamp gains a flame, the "Lamps woken n / N" progress updates, and the objective retargets the nearest remaining unlit lamp

#### Scenario: True night fails the round

- **WHEN** the night factor exceeds 0.55 with mission lamps still unlit
- **THEN** the mission fails and the pooled flame meshes are hidden

### Requirement: ERRAND — carry the parcel to a neighbouring district

An ERRAND mission SHALL target the centre of a district about two chunks away in a random
cardinal or diagonal direction, naming the district in the title and progress text. The
receiver spawning (within 55 m of the target), her facing behavior, the 4 m delivery
handoff, and her departure are specified by the `parcel-delivery` capability; the errand
system SHALL complete the mission with its reward line at that handoff and MUST null its
receiver reference before completion so cleanup cannot remove the departing NPC.

#### Scenario: A real walk to a named district

- **WHEN** an ERRAND is built
- **THEN** its target is a district centre roughly two chunks away and the HUD reads "Deliver in <district>"

#### Scenario: Delivery completes via parcel handoff

- **WHEN** the player reaches the waiting receiver within delivery range
- **THEN** the handoff specified by parcel-delivery occurs and the mission completes with its reward line

### Requirement: Completion and failure plumbing

Completing a mission SHALL show its gold reward line, increment the missions-done counter,
clear mission meshes (pooled lamp flames; an undelivered receiver is removed), reset the
objective to the Spire, and set a giver cooldown of 6–12 s. Failing SHALL show the failure
line, perform the same cleanup, and set a cooldown of 8–14 s. Accepting a trial while a
mission is active SHALL fail the mission with the trial-master's line (trials and errands
are mutually exclusive).

#### Scenario: Cooldown after completion

- **WHEN** a mission completes
- **THEN** the objective reverts to the Spire and no new giver is designated for 6–12 s

#### Scenario: A trial displaces the errand

- **WHEN** the player starts a trial while an errand is active
- **THEN** the errand fails with the "Leave the errand" line before the trial begins

### Requirement: Mission HUD and objective plumbing

While a mission is active the mission panel SHALL show its title and archetype-specific
progress text, and the minimap label SHALL read "✦ " plus the title in upper case; the
minimap objective marker SHALL point at the mission's current target. With no mission and no
trial the panel hides and the label reverts to "✦ THE SPIRE". Mission targets SHALL be found
by scanning only loaded chunks, run once at accept (except LAMP/SUNRUN retargeting within
the accepted set).

#### Scenario: HUD reflects the active mission

- **WHEN** a mission is accepted
- **THEN** the mission panel shows its title and progress text and the minimap label shows the title in upper case

#### Scenario: HUD reverts when idle

- **WHEN** no mission and no trial is active
- **THEN** the mission panel is hidden and the minimap label reads "✦ THE SPIRE"

### Requirement: Errands are inert in screenshot mode

The mission update (giver designation, marking, progress, completion) SHALL NOT run in SHOT
(screenshot) mode, so screenshots are deterministic and no giver or mission state appears.

#### Scenario: No missions in SHOT mode

- **WHEN** the game runs with a SHOT preset
- **THEN** the mission update never runs and no giver marker or mission HUD appears
