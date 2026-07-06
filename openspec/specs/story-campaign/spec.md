# story-campaign Specification

## Purpose
TBD - created by archiving change add-second-seed-campaign. Update Purpose after archive.
## Requirements
### Requirement: Campaign gating behind the Spire summit

The campaign SHALL remain locked until the player has summited the Spire at least once, and the summited state SHALL persist across sessions. While locked, the giver SHALL refuse to begin and instead direct the player to climb the Spire first.

#### Scenario: Campaign locked before first summit

- **WHEN** the player has never summited the Spire and interacts with the giver
- **THEN** no chapter starts
- **AND** the giver tells the player to climb the Spire first

#### Scenario: Campaign unlocks on first summit and persists

- **WHEN** the player reaches the Spire summit for the first time
- **THEN** the summited state is recorded to persistent storage
- **AND** the giver will begin the campaign on the next interaction, including in later sessions

### Requirement: The Archivist giver NPC

The campaign giver (the Archivist) SHALL spawn at one deterministic anchor offset from the Spire base, off the Spire footprint and facing the tower, synced and culled within a 3×3 chunk window around the player. The Archivist SHALL be the hub at which chapters are started, and re-interacting mid-chapter SHALL restate the current objective without losing progress.

#### Scenario: Archivist spawns at the Spire base

- **WHEN** the player enters the 3×3 chunk window containing the Spire chunk
- **THEN** the Archivist appears at its fixed Spire-relative anchor, clear of the Spire footprint
- **AND** it is removed again when the player leaves that window

#### Scenario: Starting a chapter at the hub

- **WHEN** the campaign is unlocked, no chapter is currently active, and the player interacts with the Archivist
- **THEN** the next chapter starts and its finders run once

#### Scenario: Re-interacting during an active chapter

- **WHEN** a chapter is active and the player interacts with the Archivist
- **THEN** the Archivist restates the current objective and chapter progress is unchanged

### Requirement: Chapter progression and objective spine

The campaign SHALL run one chapter at a time, tracking the next chapter to offer (1-based, with completion represented as beyond chapter 7). Some chapter transitions SHALL chain directly in the field while others SHALL return the player to the Archivist hub. Between chapters, when no trial, errand, or active chapter owns the objective, the campaign objective SHALL point at the Archivist rather than the Spire; after the campaign completes, default Spire objective behavior SHALL return.

#### Scenario: Only one chapter active at a time

- **WHEN** a chapter completes
- **THEN** the tracked chapter advances to the next
- **AND** no more than one chapter is ever active

#### Scenario: Between-chapter objective points at the Archivist

- **WHEN** the campaign is unlocked and unfinished, no chapter is active, and no trial or errand is active
- **THEN** the objective marker points at the Archivist's anchor

#### Scenario: Objective reverts after completion

- **WHEN** the campaign has completed all seven chapters
- **THEN** the objective no longer points at the Archivist and default Spire behavior resumes

### Requirement: No chapter may soft-lock

Every chapter target-finder SHALL be a deterministic scan with a widened-radius fallback. When a target cannot be resolved at all, the chapter SHALL fall back to pointing at the Archivist with an apologetic message and mark itself for a retry that re-runs the scan when the chapter is re-accepted.

#### Scenario: Finder fails to resolve a target

- **WHEN** a chapter's finder returns no target even after its widened fallback
- **THEN** the objective points back at the Archivist
- **AND** a message tells the player the trail went cold
- **AND** re-accepting the chapter re-runs the finder

### Requirement: Coexistence with trials and errands

The campaign SHALL coexist with the trials and errands systems. When a trial or errand owns the HUD, the campaign SHALL pause: its markers hide and its objective yields, but chapter progress SHALL NOT be lost. Objective priority SHALL be trial, then errand, then story, then Spire.

#### Scenario: A trial pauses the story without losing progress

- **WHEN** a trial or errand becomes active while a chapter is in progress
- **THEN** the campaign markers hide and the objective yields to the trial or errand
- **AND** the chapter's phase and progress are preserved for when the trial or errand ends

### Requirement: Chapter 1 — The Dead Broadcast

Chapter 1 SHALL first send the player to the Spire summit to read the empty sun-clock socket, then to the nearest oldtown-district records hall, where an interaction at the hall completes the chapter and names the three shard hiding places (a high sun-only place, the roof-lake, the open square).

#### Scenario: Summit reveals the missing glass

- **WHEN** Chapter 1 is active in its summit phase and the player reaches the Spire summit
- **THEN** the chapter advances to seek the nearest oldtown records hall

#### Scenario: Records hall completes the chapter

- **WHEN** the player interacts at the marked oldtown records hall
- **THEN** Chapter 1 completes and the three shard hiding places are named

### Requirement: Chapter 2 — Shards of Noon

Chapter 2 SHALL place three shard targets biased across the map (an open plaza point, a reservoir roof, and a high canopy pad), each requiring the player to reach it. A shard SHALL only be visible and collectible while it is full day; at night the objective SHALL tell the player to wait for or advance to full day. Collecting all three SHALL complete the chapter and persist the shard count.

#### Scenario: Shards glint only in daylight

- **WHEN** the player is at a shard target during night
- **THEN** the shard is neither shown nor collectible
- **AND** the objective indicates the player must wait for or advance to full day

#### Scenario: Collecting a shard in daylight

- **WHEN** it is full day and the player is within reach of an uncollected shard target (and, for elevated targets, high enough to reach it)
- **THEN** the shard is collected and the shard count increases

#### Scenario: All three shards complete the chapter

- **WHEN** the third shard is collected
- **THEN** Chapter 2 completes and the shard count is persisted

### Requirement: Chapter 3 — The Flooded Archive

Chapter 3 SHALL run three exploration phases: wade the nearest reservoir roof-lake (distinct from the Chapter 2 reservoir where possible), reach the top of the nearest fallen-tower ramp, then traverse a viaduct deck for a fixed number of untimed checkpoint spans to a broken-span edge. Completion SHALL fix the deterministic range-count value referenced later by Chapter 4.

#### Scenario: Wading the reservoir advances the chapter

- **WHEN** the player is in the water inside the marked reservoir chunk
- **THEN** the chapter advances to the fallen-tower phase

#### Scenario: Viaduct traversal ends at the broken span

- **WHEN** the player has passed the checkpoint spans and reached the broken-span edge (or no viaduct is reachable and the fallback fires)
- **THEN** Chapter 3 completes and the range-count value is fixed for Chapter 4

### Requirement: Chapter 4 — The Heliograph

Chapter 4 SHALL require placing the three shards into three summit sockets in any order, then firing the Heliograph when the player is at the summit during the high-noon window. The fired beam's bearing text SHALL be derived from the found Root Vault sinkhole (so the clue is always true), and no minimap marker SHALL be shown for the vault — the player walks the stated bearing until reaching the sinkhole rim, which chains directly into Chapter 5.

#### Scenario: Sockets then noon fire

- **WHEN** all three sockets are filled and the player is at the summit during the noon window
- **THEN** the Heliograph fires and states a bearing and block count toward the vault

#### Scenario: Bearing is derived from the real target

- **WHEN** the Heliograph fires
- **THEN** the stated bearing is computed from the located sinkhole's position, not chosen independently

#### Scenario: Walking the beam with no marker

- **WHEN** the player reaches the sinkhole rim by following the stated bearing
- **THEN** Chapter 4 completes and chains directly into Chapter 5 in the field

### Requirement: Chapter 5 — The Warden's Key

Chapter 5 SHALL route the player to the Hidden Hamlet — talking to the elders if already discovered, or running a Rumor-style discovery if not, without ever running the trial and story discovery copies simultaneously. The elders SHALL send the player to the nearest viaduct-canal crossing and then down the canal to recover the warden's key at water level, granting the key and completing the chapter.

#### Scenario: Hamlet already discovered

- **WHEN** the Hidden Hamlet is already found and Chapter 5 is active
- **THEN** the objective is to speak with the elders at the fire pit

#### Scenario: Hamlet not yet discovered

- **WHEN** the Hidden Hamlet has not been found
- **THEN** Chapter 5 runs a bearing-based discovery, and discovering it marks the hamlet found and guards the separate Rumor trial from double-running

#### Scenario: Recovering the key

- **WHEN** the player reaches the key at water level below the footbridge down-canal from the crossing
- **THEN** the warden's key is granted and Chapter 5 completes

### Requirement: Chapter 6 — The Root Vault and the Seed

Chapter 6 SHALL require returning to the vault sinkhole at night, then solving a three-knot order puzzle around the rim whose correct order is derived from real geometry (an easternmost-then-westernmost-then-remaining mapping). A wrong knot SHALL reset the sequence with feedback and be infinitely retryable. Completing the order SHALL open the pit floor; taking the Second Seed SHALL set the carrying state and chain into Chapter 7.

#### Scenario: Vault only wakes at night

- **WHEN** the player reaches the vault sinkhole during day
- **THEN** the knot puzzle does not begin and the player is told to return at night

#### Scenario: Wrong knot resets, correct order opens

- **WHEN** the player turns a knot out of the correct derived order
- **THEN** the sequence resets with feedback and can be retried
- **AND** turning all three in the correct order opens the pit floor

#### Scenario: Taking the Seed sets the carry state

- **WHEN** the player takes the Second Seed at the pit floor
- **THEN** the carrying state is set and Chapter 6 chains into Chapter 7

### Requirement: Carrying the Second Seed applies debuffs

While the player is carrying the Second Seed, sprint SHALL be disabled and the flashlight SHALL be fouled (dimmed and off-color) until the Seed is planted.

#### Scenario: Seed carry disables sprint and fouls the light

- **WHEN** the player is carrying the Second Seed
- **THEN** sprint is disabled
- **AND** the flashlight is dimmed and off-color until the Seed is planted

### Requirement: Chapter 7 — The Scorch Bloom and permanent rewards

Chapter 7 SHALL send the player to the heart of the nearest Scorch region (a deterministic verdancy minimum), where a multi-second hold-to-plant channel plants the Seed. Planting SHALL clear the carry debuffs and persist the plant location Spire-relative. The planted chunk SHALL permanently gain an oasis sapling, and completing the epilogue summit SHALL permanently relight the Spire beacon and grant the Seedbearer minimap reward.

#### Scenario: Planting requires a sustained channel

- **WHEN** the player is at the Scorch heart and holds the interact key
- **THEN** a multi-second plant channel runs, and releasing early resets it
- **AND** completing the channel plants the Seed, clears the carry debuffs, and persists the plant location Spire-relative

#### Scenario: Planted chunk becomes a permanent oasis

- **WHEN** the planted chunk is (re)built
- **THEN** it contains the Second Seed sapling oasis, shown as an oasis dot on the minimap

#### Scenario: Epilogue relights the beacon and grants Seedbearer

- **WHEN** the player summits the Spire during the epilogue
- **THEN** the campaign completes, the Spire beacon is permanently relit, and the Seedbearer minimap reward is granted

### Requirement: Campaign persistence

The campaign SHALL persist its state (current chapter, shard count, key and seed possession, Spire-relative plant offset, and reward flags) under a versioned save. The plant offset SHALL be stored relative to the Spire so the oasis survives the per-session Spire re-roll.

#### Scenario: Progress restored across sessions

- **WHEN** the game is reloaded after progress was made
- **THEN** the current chapter, collected shards, key/seed possession, and reward flags are restored from the versioned save

#### Scenario: Planted oasis survives the Spire re-roll

- **WHEN** the game reloads and the Spire is re-randomized
- **THEN** the oasis appears at the stored Spire-relative offset rather than at a fixed absolute chunk

