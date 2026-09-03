## ADDED Requirements

### Requirement: Deterministic glowseed placement

Each non-spire, non-hamlet chunk SHALL place 0–2 glowseeds by chunk hash on its tallest
vined rooftops and high canopy pads, positions derived only from the chunk's colData so the
same seeds appear every session. Collected seed keys SHALL persist at `canopy.seeds`.

#### Scenario: Same seeds every session

- **WHEN** a chunk is rebuilt in a later session
- **THEN** its uncollected seeds appear at the same positions

### Requirement: Pickup, cues and unlocks

A seed SHALL be collected when the player's feet are within 1.7 m horizontally and 2.2 m
vertically, with a burst, chime and count hint; an uncollected seed within 14 m SHALL sound
a soft throttled note. Crossing 25 and 50 collected SHALL set sail tier 1 and 2, persisted
at `canopy.sailtier`, with a gold message.

#### Scenario: Twenty-fifth seed upgrades the sail

- **WHEN** the collected count reaches 25
- **THEN** `sailTier` becomes 1, is saved, and the upgrade message shows
