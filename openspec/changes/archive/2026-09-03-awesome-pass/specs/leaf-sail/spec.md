## ADDED Requirements

### Requirement: Unfurling and furling the sail

The sail SHALL unfurl when Space is pressed while airborne, falling (vertical speed below
−0.5 m/s), not climbing, ladder-latched, lift-borne or heavy-laden, and after Space has been
released since leaving the ground. Space again, landing, grabbing vines, water, a ladder
or a blackout SHALL furl it. A heavy load SHALL refuse with a hint.

#### Scenario: Held jump does not unfurl

- **WHEN** the player jumps and keeps Space held through the apex
- **THEN** the sail stays furled until Space is released and pressed again

### Requirement: Glide physics and camera feel

While sailing, vertical speed SHALL blend toward a pitch-driven sink rate and horizontal
speed toward a pitch-driven glide speed along the look direction, with a dive (look down)
and a flare (look up) regime and a stall after 1.2 s of speed below 4 m/s. Sail tiers 1
and 2 SHALL improve the base sink/speed. The camera FOV SHALL widen to 82 and roll into
turns; head-bob SHALL be off.

#### Scenario: Level glide distance

- **WHEN** the player unfurls at 30 m and holds level pitch at tier 0
- **THEN** they travel at least 90 m horizontally before reaching the street

### Requirement: Soft landings

A touchdown while sailing with sink slower than 4 m/s SHALL cause no fall consequence; a
dive landing SHALL stagger but never black out from the sail alone.

#### Scenario: Dive landing staggers

- **WHEN** the player lands while diving at more than 4 m/s of sink
- **THEN** the hard-landing stagger fires and no blackout occurs
