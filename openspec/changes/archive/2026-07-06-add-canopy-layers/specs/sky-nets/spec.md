## ADDED Requirements

### Requirement: Woven net panels bridge crown gaps

The system SHALL string sagging woven net panels between nearby crown platters that are not
already tied by a woody limb, roughly 3–5 per canopy chunk. A net panel SHALL be a visual
sheet (no walkable pad) that sags in the middle and tilts with the height difference of the
two crowns it connects.

#### Scenario: Net fills an untied gap

- **WHEN** two nearby Weave platters have no limb linking them
- **THEN** some such pairs receive a sagging net panel between their rims

#### Scenario: Panels do not double up with limbs

- **WHEN** a crown pair is already tied by a woody lattice limb
- **THEN** no net panel is strung on that same pair

### Requirement: Walkable hammocks partially span light wells

The system SHALL place horizontal hammock nets partially covering some Weave light wells so
the well stays partly open. Roughly 20% of hammocks SHALL register a walkable pad tagged
`net`, set slightly below the sheet centre so landing feels like sinking into the sag.
Hammocks SHALL be kept clear of the canal sky-corridor so the water line stays open.

#### Scenario: Landing on a walkable hammock

- **WHEN** the player drops onto a walkable hammock over a light well
- **THEN** the player is supported as on canopy (layer `net`)

#### Scenario: Canal corridor stays open

- **WHEN** a light well lies over a canal corridor
- **THEN** no hammock is placed there

### Requirement: Sky nets catch and spring the player back

A walkable net SHALL catch the player from any height and spring them back up: a drop greater
than ~3 m onto a net SHALL bounce the player upward rather than merely stopping them, while a
gentle step-down onto it SHALL not bounce.

#### Scenario: High drop bounces

- **WHEN** the player falls more than 3 m onto a walkable `net` pad
- **THEN** the net flexes and throws the player back upward

#### Scenario: Gentle step-down does not bounce

- **WHEN** the player steps down onto a `net` pad from a small height
- **THEN** the player settles onto the net without a bounce

### Requirement: Nets barely shade

A sky net SHALL attenuate direct sun far less than leaf cover (roughly 0.35 versus 0.75 for
leaves), so standing beneath a net is close to full exposure.

#### Scenario: Net gives little shade

- **WHEN** the sun ray passes through a net pad above the player
- **THEN** transmittance is reduced only slightly, leaving the player near full exposure

### Requirement: Aerial creepers string crown to crown

The system SHALL hang long aerial creepers — thin catenary vine strands, roughly 20–32 m long
— between distant crowns as visual intertwining. Creepers SHALL sag in the middle and register
no collision.

#### Scenario: Creeper spans distant crowns

- **WHEN** a canopy chunk has two platters 18–32 m apart
- **THEN** some are joined by a sagging aerial creeper with no walkable surface
