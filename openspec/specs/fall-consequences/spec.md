# fall-consequences Specification

## Purpose
TBD - created by archiving change codify-player-physics. Update Purpose after archive.
## Requirements
### Requirement: Fall-apex tracking

Fall height SHALL be measured as the drop from the highest point reached since the player last left support: while grounded or freeclimbing, `airPeakY` resets to the current height every frame; while airborne it tracks the running maximum of `pos.y`. The drop resolves exactly once, on the frame the player touches down after being airborne (grounded now, not grounded and not climbing last frame). Deliberate transitions reset the apex so they never bank phantom fall damage: releasing or topping out a ladder, mantling, hopping off, and the winch-lift rider carry all reset `airPeakY` to the current height (see the ladders and winch-lifts capabilities).

#### Scenario: Drop measured from the apex

- **WHEN** the player jumps upward 2 m off a 9 m roof and falls to the street
- **THEN** the resolved drop is ~11 m (from the jump apex), not 9 m

#### Scenario: Climbing resets the ledger

- **WHEN** the player falls a few metres onto a vine and climbs the rest of the way down
- **THEN** no drop resolves at the bottom because climbing reset the apex each frame

### Requirement: Hard-landing threshold ladder

Landing on hard support (streets, roofs, the viaduct deck, ramps, bridges — anything not a caught surface) SHALL apply consequences by drop height: below 7 m nothing happens (an ordinary jump is free); 7 m up to and including 10 m staggers the player — 1.1 s of ×0.45 movement, a 0.55 camera shake, and a message; above 10 m triggers the blackout.

#### Scenario: Ordinary hops are free

- **WHEN** the player drops 4 m onto pavement
- **THEN** no stagger, shake, or message occurs

#### Scenario: Hard but survivable band

- **WHEN** the player drops 9 m onto a rooftop
- **THEN** the player staggers for 1.1 s at 45% speed with a camera shake

#### Scenario: Past ten metres it goes dark

- **WHEN** the player drops 12 m onto the street
- **THEN** a blackout fires

### Requirement: Caught landings

Water and the leaf family SHALL swallow any drop of 7 m or more with no damage: landing in water, or on tree canopy (`onCanopy` with no layer tag), or on any `SAFE_LEAF` layer — `weave`, `nest`, `bough`, `net`, `lookout`, `lift` — is a caught landing with only a message and a proportional camera shake (`min(0.5, drop × 0.03)`). A walkable `net` additionally springs the player back up when the drop exceeds 3 m (see the sky-nets capability). The catching behavior of each surface family is specified by its own capability (canopy-layers, sky-nets, waytrees, winch-lifts); this requirement fixes the shared engine rule that maps `supportLayer`/`inWater` to zero fall damage.

#### Scenario: Water swallows a big fall

- **WHEN** the player falls 20 m into a canal
- **THEN** no stagger or blackout occurs, only the splash message

#### Scenario: Untagged tree canopy still catches

- **WHEN** the player lands on an ordinary street-tree canopy pad (no layer tag) from 15 m
- **THEN** the landing is caught with a shake and no damage

### Requirement: Blackout sequence

A blackout SHALL run exactly one at a time (a second trigger during the fade is ignored) and count toward the session's blackout tally. It fades the screen to black, immediately fails any active trial (reason `fell`) or errand, and after ~0.85 s wakes the player at the last-shade anchor (heat-exposure capability) with velocity zeroed, grounded, stagger and shake cleared, and body heat raised by +25 (clamped to 100), followed by a wake message. Weather strikes and other systems reuse this same path, so every blackout wake point is sheltered by construction.

#### Scenario: Blackout costs the errand

- **WHEN** the player blacks out from a fall while carrying an errand
- **THEN** the errand fails and the player wakes at the last shade, hotter by 25

#### Scenario: No double blackout

- **WHEN** a second blackout trigger arrives during the fade
- **THEN** it is ignored and only one wake occurs

