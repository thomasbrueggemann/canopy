## Context

Retroactive codification. The minimap/HUD block and the audio block both live in `main.js`
and are pure consumers: they read state owned by other systems (objective, mission/trial
state, story/cipher flags, chunk data, day factors) and render or sonify it. These specs
document the working tree as-is; no code changes accompany them.

## Goals / Non-Goals

**Goals:**
- Make the minimap's marker vocabulary and its gating flags explicit — the map is the
  game's de-facto progression record, so which marker appears when is a contract.
- Capture the HUD cadences (0.2 s HUD, 0.08 s map) and the hint-vs-toast split.
- Capture the audio gating contract (lazy context, SHOT-never, mute-everywhere) that every
  sound in the game — including other capabilities' one-shots — relies on.

**Non-Goals:**
- Pixel colours, fonts, canvas transforms, exact oscillator envelopes — implementation.
- The toast queue (owned by `toasts`), the semantics of the flags the map reads (owned by
  story-campaign / ciphers / waytrees / errands / trials), and stride detection (movement
  code).

## Decisions

- **The map never leads the state**: every marker draws from a flag owned elsewhere
  (`hamletFound`, `ciph.met`, `ciphMantle`, `seen.lookout`, `STORY_SAVE.planted`,
  `storyComplete()`, giver/trial-master rosters). The minimap-hud spec therefore requires
  honouring the flags without redefining them — the cross-capability seam is one-way reads,
  typeof-guarded because script load order places main.js before story/puzzles.
  Deliberately marker-less features (cipher caches, the Rumor's final leg, the Ch4 vault
  walk) stay off the map per their owning specs.
- **Objective priority is rendered, not decided, here**: the map draws `activeObjective`;
  ownership order (trial > errand > story > SPIRE) is the `summit-goal` contract.
- **Cadence split**: HUD text at 0.2 s and map at 0.08 s keeps DOM writes and canvas
  redraws off the per-frame path; the specs cite the cadences as the performance contract.
- **hint() vs msg()**: one transient control-nudge line (latest wins, no queue) versus the
  FIFO toast queue with dedupe/pressure (toasts capability). Specced as separate channels
  so future UI work doesn't merge them.
- **once() beats keyed on `seen`**: session-scoped by design — re-entry narration returning
  each session is intentional atmosphere, except where a capability persists its own flag
  (hamlet). District/biome mood *lines* are triggers in gameplay code and specced here;
  what districts/biomes exist is engine-side.
- **Audio gate is one predicate**: `AC && !muted`, plus "SHOT never creates AC". Every
  sound — here and in puzzles.js (`ciphAudible`) — uses it, which is what makes the
  ciphers' muted-fallback-to-text requirement enforceable.
- **localStorage**: none in either capability. Audio/mute state and seen-beats are
  deliberately session-only; all persisted flags the map reads belong to other
  capabilities (`canopy.hamlet`, `canopy.story`, `canopy.inv`, cipher save, etc.).

## Risks / Trade-offs

- The marker vocabulary spec enumerates today's ten marker classes; adding a marker means a
  spec delta. Chosen deliberately — silent map additions are exactly what the spec should
  catch.
- Beds ramp with `setTargetAtTime`; a suspended AudioContext (tab switch) can leave gains
  mid-ramp on resume. Harmless in practice, unspecced.
- The 17 Hz cricket LFO gain doubles as the audibility floor; specs describe the audible
  behavior (pulsed, night-gated) rather than node topology so a synth refactor stays
  conformant.
