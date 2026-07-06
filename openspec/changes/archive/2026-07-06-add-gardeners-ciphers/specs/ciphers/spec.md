## ADDED Requirements

### Requirement: Post-summit gate and parallel framing

The Ciphers SHALL unlock only after the player has summited the Spire, and SHALL run fully in parallel with the story campaign with no ordering dependency in either direction. Cache solved-state, cog possession, mantle possession, and attempt counts SHALL persist to a versioned save; cache *positions* SHALL be recomputed each session by the finders.

#### Scenario: Locked before summit

- **WHEN** the player has not summited the Spire
- **THEN** the Ciphers do not activate and the Tinker offers no work

#### Scenario: Parallel with the campaign

- **WHEN** the player is mid-campaign or has not started it
- **THEN** the Ciphers are still fully available and unaffected, and vice versa

### Requirement: The Tinker and the five waybills

The Ciphers giver (the Tinker) SHALL spawn at a deterministic session-relative bench location (nearest works-style city chunk, degrading to any city, then the plaza nearest the Spire), synced and culled around the player, and marked with a copper dot on the minimap once met. The first interaction SHALL hand over all five waybills at once, each carrying a resolved word-based clue; later interactions SHALL re-offer any waybill the player is missing and summarize which caches remain.

#### Scenario: First meeting hands over all waybills

- **WHEN** the player first interacts with the Tinker after summiting
- **THEN** the Tinker is marked met and all five waybills are added to the satchel with their resolved clues

#### Scenario: Re-offering a missing waybill

- **WHEN** the player interacts again and a waybill is missing from the satchel
- **THEN** the Tinker re-issues that waybill

#### Scenario: Nonlinear order

- **WHEN** the player holds the five waybills
- **THEN** any cache may be attempted in any order

### Requirement: Marker-less by design

The Ciphers SHALL never write the active objective or the mission panel; being marker-less is the difficulty. All puzzle guidance and feedback SHALL be delivered through transient hint and message text only.

#### Scenario: No objective marker for caches

- **WHEN** the player is pursuing any cache
- **THEN** no minimap objective marker or mission-panel entry is created for it
- **AND** all guidance arrives as hint or message text

### Requirement: No-soft-lock finders and session-stable solved state

Every cache finder SHALL degrade primary scan to widened scan to a safe default (the plaza nearest the Spire), appending a "trail is cold" note when it falls back, so no cache can soft-lock. Finder origins SHALL be Spire- or Tinker-relative (not the player's position) and run only at session-init. A solved cache SHALL persist as solved across sessions even though its husk position may move when the Spire re-rolls.

#### Scenario: Finder degradation

- **WHEN** a cache's primary and widened scans both find nothing
- **THEN** the cache falls back to the plaza nearest the Spire and its clue notes that the trail is cold

#### Scenario: Solved state survives repositioning

- **WHEN** a solved cache is relocated by the per-session finder in a later session
- **THEN** it remains marked solved and appears as an opened, looted husk

### Requirement: Progressive hints ladder

Each cache SHALL track failed attempts and, on re-reading its plaque, append one deterministic hint after a first threshold of failures and a second, blunter hint after a higher threshold. The ladder SHALL never reveal the raw answer outright below the second threshold, and locks SHALL remain re-attemptable forever.

#### Scenario: First hint after repeated failures

- **WHEN** a cache has reached the first failure threshold and the player re-reads its plaque
- **THEN** one additional deterministic hint is appended

#### Scenario: Blunter hint at the higher threshold

- **WHEN** a cache has reached the higher failure threshold and the player re-reads its plaque
- **THEN** a second, blunter hint is appended, still short of the full raw answer

### Requirement: Cache 1 — The Counting House

Cache 1 SHALL sit at the plaza nearest the Tinker and be locked by a three-digit brass dial. The three digits SHALL be derived at session-init from real, deterministic world features referenced by the plaque (the lamps ringing the square, the standing spans of the nearest viaduct at the stated bearing, and the fern-circle figure at the stated bearing), and the referenced places SHALL be the same ones the finders used so the world and the answer cannot diverge. Tapping the interact key SHALL advance the selected digit and holding it SHALL lock and advance; a wrong third lock SHALL reset the dial and add an attempt.

#### Scenario: Digits derived from the real world

- **WHEN** the cache is located
- **THEN** each of the three digits is computed from the specific world feature its plaque names at the bearing the plaque gives

#### Scenario: Locking a correct combination

- **WHEN** the player locks all three digits matching the derived values
- **THEN** the cache opens and grants its cog

#### Scenario: Wrong combination resets

- **WHEN** the third digit is locked and the combination is wrong
- **THEN** the dial resets and an attempt is recorded

### Requirement: Cache 2 — The Carillon

Cache 2 SHALL sit at the largest trunk of the grove nearest the Tinker and present five brass chime bars whose bar-to-note mapping is a deterministic shuffle that is never a plain low-to-high ordering, so the player must listen. Striking bars SHALL play notes; the plaque SHALL give the required melody as bell names; a wrong strike mid-sequence SHALL reset it and add an attempt; the correct full melody SHALL open the lid. When audio is unavailable or muted, striking a bar SHALL instead show a fixed poetic register descriptor so the puzzle stays solvable.

#### Scenario: Bars are not sorted

- **WHEN** the carillon mapping is generated
- **THEN** the bar order is not a plain ascending pitch order

#### Scenario: Correct melody opens the cache

- **WHEN** the player strikes the bars in the melody the plaque specifies
- **THEN** the cache opens and grants its cog

#### Scenario: Muted accessibility fallback

- **WHEN** audio is unavailable or muted and the player strikes a bar
- **THEN** a fixed register descriptor for that bar's note is shown as text

### Requirement: Cache 3 — The Shadow Clock

Cache 3 SHALL be buried with no prop until solved, and SHALL be solvable only during a fixed late-afternoon window when the sun is up. During the window the live tip of the Spire's shadow SHALL be computed; standing within a short radius of the tip on the ground SHALL enable a multi-second hold-to-dig channel that, when completed, surfaces the cache. The window SHALL recur daily and time SHALL be advanceable, so the cache can never soft-lock.

#### Scenario: Solvable only in the window

- **WHEN** the current time is outside the late-afternoon window
- **THEN** no dig is offered

#### Scenario: Digging at the shadow tip

- **WHEN** the player stands within the short radius of the live shadow tip on the ground during the window and completes the dig channel
- **THEN** the cache surfaces and grants its cog

#### Scenario: Window recurs

- **WHEN** the player misses the window
- **THEN** the same window recurs on the following day and time can be advanced toward it

### Requirement: Cache 4 — The Glyph Ledger

Cache 4 SHALL be a chain of six boundary-glyph stones followed by a decode. Each stone, on interaction, SHALL grant a rubbing item whose note records its glyph-to-letter pairing and the bearing to the next stone, so the trail lives in the satchel. The waybill SHALL carry a coded six-glyph word; decoding it via the collected rubbings SHALL name an anomaly type from a fixed keyword-to-anomaly table (the specific keyword chosen deterministically per session), and the cache SHALL sit at the nearest anomaly of that type to the Spire. Opening SHALL be free once reached — the hunt and the decode were the lock.

#### Scenario: Stones grant rubbings and chain onward

- **WHEN** the player interacts with a boundary-glyph stone
- **THEN** a rubbing is granted whose note records its glyph pairing and the bearing to the next stone

#### Scenario: Decoded keyword places the cache

- **WHEN** the session-chosen keyword is decoded from the coded glyphs
- **THEN** the cache is located at the nearest anomaly of the keyword's mapped type to the Spire

#### Scenario: Opening is free once found

- **WHEN** the player reaches the decoded cache
- **THEN** interacting opens it and grants its cog with no further lock

### Requirement: Cache 5 — The Four Seasons

Cache 5 SHALL sit atop the fallen-tower anomaly nearest the Tinker and be locked by four season levers that must be pulled in one correct order. The secret order SHALL be chosen deterministically per session and the plaque constraints SHALL be generated so that exactly one permutation satisfies them (a unique solution). A wrong pull at any step SHALL reset all levers and add an attempt; pulling all four in the correct order SHALL open the cache.

#### Scenario: Generated constraints have a unique solution

- **WHEN** the season constraints are generated for a session
- **THEN** exactly one lever order satisfies all stated constraints

#### Scenario: Correct order opens, wrong pull resets

- **WHEN** the player pulls the levers in the unique correct order
- **THEN** the cache opens and grants its cog
- **AND** a wrong pull at any step resets all levers and records an attempt

### Requirement: Cogs and the cog-vault meta-puzzle

Solving each cache SHALL grant one engraved cog, and collecting all five SHALL enable the Vault at the Spire base. The Vault SHALL have five sockets; the required seating order SHALL be the fixed narrative turning communicated by the cog engravings, and seating the cogs out of that order SHALL eject them all and add an attempt. Seating them in the correct order SHALL sink the door and reveal the Gardener's Mantle to be taken.

#### Scenario: Each solved cache grants a cog

- **WHEN** a cache is solved
- **THEN** exactly one cog is granted and the recovered-cog count increases

#### Scenario: Wrong vault order ejects the cogs

- **WHEN** all five cogs are seated in an order that does not match the engraved turning
- **THEN** the cogs are ejected and an attempt is recorded

#### Scenario: Correct order reveals the Mantle

- **WHEN** the five cogs are seated in the engraved order
- **THEN** the door sinks and the Gardener's Mantle becomes available to take

### Requirement: The Gardener's Mantle reward

Taking the Gardener's Mantle SHALL persist it and apply two effects: body-heat gain SHALL be reduced by a fixed multiplier while worn, and the minimap SHALL draw Tier-3 oddity ticks for resident chunks. Both effects SHALL be re-applied on load from the persisted flag.

#### Scenario: Mantle reduces heat gain

- **WHEN** the player has taken the Mantle and is in the sun
- **THEN** body-heat gain is reduced by the Mantle's fixed multiplier

#### Scenario: Mantle reveals oddity ticks

- **WHEN** the player has taken the Mantle
- **THEN** the minimap draws oddity ticks for resident chunks

#### Scenario: Effects persist across sessions

- **WHEN** the game reloads after the Mantle was taken
- **THEN** both the heat reduction and the oddity ticks are active from the persisted flag

### Requirement: Shot mode and dev hooks

Under screenshot mode the Ciphers SHALL run no updates, spawn no Tinker, and create no audio, matching the rest of the game's screenshot behavior. Dev hooks SHALL let a session jump to a chosen cache (granting prerequisites and teleporting near it) or to the vault (granting five cogs), and SHALL log the computed cache truths to the console only when a dev hook is active, so a verifier can check answers headlessly.

#### Scenario: Inert in screenshot mode

- **WHEN** the game runs in screenshot mode
- **THEN** no Cipher update runs, no Tinker spawns, and no audio is created

#### Scenario: Dev jump to a cache

- **WHEN** the cache dev hook is used
- **THEN** the summit gate and Tinker-met state are set, waybills are granted, the chosen cache is located, and the player is placed near it

#### Scenario: Truths logged only under a dev hook

- **WHEN** a dev hook is active
- **THEN** the computed cache truths are logged to the console for headless verification
