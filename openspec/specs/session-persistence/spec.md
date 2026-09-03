# session-persistence Specification

## Purpose
TBD - created by archiving change awesome-pass. Update Purpose after archive.
## Requirements
### Requirement: Position and hour survive a reload

The game SHALL save position, facing and time of day to `canopy.session` every 4 s while
grounded and on tab hide/unload, and restore them at load unless `?fresh=1` is present,
which clears the save. Never in SHOT mode.

#### Scenario: Reload resumes in place

- **WHEN** the player reloads the page after walking to a rooftop at dusk
- **THEN** they start on that rooftop at dusk, facing the same way

