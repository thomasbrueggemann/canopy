## ADDED Requirements

### Requirement: Crown nests are sparse emergent platforms

The system SHALL place L3 crown nests as sparse woven-basket platforms high in the open sky
(~32–40 m), only atop tall tree giants (trunk height in the giant range) and on tower roofs,
not over ordinary chunks. Each nest SHALL register a single walkable pad tagged `nest`.

#### Scenario: Nest on a giant

- **WHEN** a giant tree in the nest height range is generated
- **THEN** a fraction of them carry a crown nest with a walkable `nest` pad at the crown

#### Scenario: Standing on a nest

- **WHEN** the player stands on a crown-nest pad
- **THEN** the player is supported as on canopy (layer `nest`)
- **AND** a first-time message names the crown nest alone in the open sky

### Requirement: Crown nest structure and shade

Each crown nest SHALL be built as a woven basket body with a mossy rim, a twig railing of
posts around the rim, and 1–2 leaf umbrellas suspended overhead. The leaf umbrellas SHALL
cast a real shade patch (participating in the overhead-cover sun model), so a nest offers
genuine relief from raw sun despite sitting in the exposed layer.

#### Scenario: Umbrella shade

- **WHEN** the player stands under a crown-nest leaf umbrella at midday
- **THEN** the sun ray is attenuated by the overhead leaf cover and exposure is reduced

### Requirement: Crown nests are reached by climbing

A crown nest SHALL be reachable by climbing the giant trunk beneath it or by a climbable vine
rope descending from the Weave, and SHALL never require a ladder or lift. Falling onto a nest
SHALL be a caught landing.

#### Scenario: Climb up to the nest

- **WHEN** the player climbs the giant trunk carrying a nest and tops out
- **THEN** the player mantles onto the crown-nest pad

#### Scenario: Nest catches a fall

- **WHEN** the player falls onto a crown-nest pad from any height
- **THEN** the landing is caught with no fall damage

### Requirement: Crown nests glow at night as beacons

A fraction of crown nests SHALL carry glow plants and a lamp-material beacon so that they read
as navigation beacons across the night map, using the same lamp registration as street lamps.

#### Scenario: Beacon visible at night

- **WHEN** night falls and a nest carries a beacon
- **THEN** its lamp head glows and is registered as a working lamp
