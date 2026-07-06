# freeclimbing Specification

## Purpose
TBD - created by archiving change add-canopy-layers. Update Purpose after archive.
## Requirements
### Requirement: Climbable vine ropes connect layers to the ground

The system SHALL hang climbable vertical vine ropes from Weave platter undersides and limb
forks down to whatever rooftop lies beneath, else to the ground. Each vine rope SHALL register
a thin climbable cylinder in `colData.trunks` (radius ~0.35) so the existing climb path carries
the player up it, and its top SHALL sit at a walkable pad (a platter or limb) so topping out
mantles the climber onto solid footing.

#### Scenario: Climbing a vine rope to the Weave

- **WHEN** the player holds the climb input while facing a vine rope hanging from a platter
- **THEN** the player ascends the rope
- **AND** tops out onto the platter's walkable pad

#### Scenario: Rope lands on a roof if one is under it

- **WHEN** a vine rope hangs above a building roof
- **THEN** the rope terminates at the roof rather than passing through it

### Requirement: Big trunks are freeclimbable

Tree trunks taller than 14 m (including tall giants and mast trunks) SHALL be climbable via the
freeclimb path, letting the player scale a trunk without any ladder or lift. Thin decorative
trunks below that height SHALL not be climbable.

#### Scenario: Scaling a giant

- **WHEN** the player holds the climb input while facing a trunk taller than 14 m
- **THEN** the player climbs the trunk

### Requirement: Spiral limbs wrap towers as climb/walk routes

The system SHALL wrap a walkable spiral limb around some tower corners, rising in 3–5 gently
sagging segments from roughly roof level up into the Weave band (~24–28 m), each segment
stepping to the next corner one level up and offset off the facade. The spiral SHALL register
walkable `bough` pads so it doubles as both a climb and a walk route.

#### Scenario: Ascending a spiral limb

- **WHEN** the player walks up a tower's spiral limb
- **THEN** each segment supports the player as a `bough` surface up into the Weave band

### Requirement: Hold-to-climb mechanic on vines and trunks

The freeclimb mechanic SHALL let the player climb any climbable vine or trunk by holding the
forward/up input while facing it within a facing cone (facing dot > ~0.25); pitching the view
downward SHALL descend at climb speed. Nearing the top edge while looking up SHALL mantle the
player over onto the surface, and pressing the jump input SHALL kick the player off the wall.
This expert/optional path SHALL remain available and unchanged by the ladder and lift systems.

#### Scenario: Facing requirement

- **WHEN** the player holds the climb input but is not facing the surface within the cone
- **THEN** the player does not climb

#### Scenario: Descending by looking down

- **WHEN** the player is climbing and pitches the view down past the threshold
- **THEN** the player descends at climb speed

#### Scenario: Mantle over the top

- **WHEN** the player climbs to near the top edge of the surface while looking up
- **THEN** the player is popped up and over onto the top

#### Scenario: Kick off the wall

- **WHEN** the player presses jump while climbing
- **THEN** the player is thrown up and away from the surface and stops climbing

