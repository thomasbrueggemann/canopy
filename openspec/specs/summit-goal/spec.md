# summit-goal Specification

## Purpose
TBD - created by archiving change codify-missions-trials. Update Purpose after archive.
## Requirements
### Requirement: The Spire is the standing objective

The game SHALL point the minimap objective at the Spire whenever nothing else owns it: no
active trial, no active errand, and no story-campaign claim. The minimap label SHALL read
"✦ THE SPIRE" in that idle state, and every mission/trial completion or failure SHALL reset
the objective back to the Spire.

#### Scenario: Idle objective points home

- **WHEN** no trial, errand, or story objective is active
- **THEN** the minimap objective marker points at the Spire and the label reads "✦ THE SPIRE"

#### Scenario: Reversion after a mission ends

- **WHEN** an errand or trial completes, fails, or is abandoned
- **THEN** the objective immediately reverts to the Spire

### Requirement: Objective priority contract

Objective and mission-HUD ownership SHALL follow the fixed priority trial > errand > story >
Spire. The story campaign only writes the objective when no trial or errand is active (per
the story-campaign capability); trials and errands never run simultaneously; and the Spire
is the fallback of last resort. Update order in the main loop SHALL enforce this: missions,
then trials, then story, each frame.

#### Scenario: Trial outranks everything

- **WHEN** a trial is active while the campaign has an in-progress chapter
- **THEN** the trial's target owns the objective marker and mission panel, and the story yields without losing progress

### Requirement: First summit is detected and persisted

The system SHALL detect the first Spire summit — the player horizontally within half the
Spire's footprint plus 1 m and vertically above its top minus 1.5 m — and set the summited
flag, persist it to `localStorage['canopy.summited']` with the guarded storage idiom, and pin the
Spire's position as a permanent session vantage on the minimap. The flag SHALL be restored
on load so the summit is only "first" once per save.

#### Scenario: The flag survives reload

- **WHEN** the player summits the Spire and reloads the game
- **THEN** `canopy.summited` is set and the summit event does not re-fire

### Requirement: The summit beat and its unlocks

The first summit SHALL play a two-part gold story beat (the horizon line immediately, the
54 °C "home is under the leaves" line ~10.5 s later). Setting the summited flag is what
unlocks the story campaign and the Gardeners' Ciphers, whose gate behaviors are specified by
the story-campaign and ciphers capabilities respectively; this capability owns writing the
flag they read. If a VANTAGE errand targeting the Spire itself is active, the summit SHALL
also complete that mission.

#### Scenario: Two-beat summit message

- **WHEN** the player first summits the Spire
- **THEN** the horizon gold message shows, followed about 10.5 s later by the second gold message

#### Scenario: Summit completes a Spire vantage errand

- **WHEN** a VANTAGE mission whose target is the Spire is active at the moment of summit
- **THEN** that mission completes along with the summit beat

### Requirement: The Spire teaches its own approach

The system SHALL show a one-time hint that the vine-covered Spire can be climbed when the
player first comes within 26 m of the Spire at ground level (below 4 m), steering the
player toward the summit goal without a quest entry.

#### Scenario: Approach hint fires once

- **WHEN** the player first walks within 26 m of the Spire base
- **THEN** the "vines cover every wall — climb" hint shows, and never again that session

