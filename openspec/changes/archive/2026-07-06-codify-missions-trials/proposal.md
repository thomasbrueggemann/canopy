## Why

The mission and challenge layer of CANOPY — the errand-giver system, the six timed trials,
and the Spire summit goal that gates the late game — already ships in `main.js` but has no
spec coverage. The 13 archived capabilities cover the errand *ending* (parcel-delivery), the
campaign the summit unlocks (story-campaign), and the ciphers, but not the giver loop, the
mission archetypes and their fail conditions, the trial ladder with its tier timers and
persistent rewards, or the summit flag itself. This change retroactively codifies that
behavior so future work has a contract to test against.

## What Changes

- Codify the errand-giver loop: promoting a street NPC to giver, archetype feasibility
  selection, and the four mission archetypes (VANTAGE / SUNRUN / LAMP / ERRAND) with their
  targets, progress text, fail conditions, and completion cooldowns. The ERRAND delivery
  handoff itself stays specified by the existing `parcel-delivery` capability.
- Codify the trials system: the six-trial order with unlock gating, bronze/silver/gold tier
  timers, deterministic trial-master placement, per-trial rules and fail conditions, the
  abandon gesture, persistence (`canopy.trials`), the all-gold sprint-boost reward
  (`canopy.sprintboost`), and the Hidden Hamlet discovery event that The Rumor culminates in
  (`canopy.hamlet` / `canopy.hamletErrand`).
- Codify the summit goal: the Spire as the default objective, the first-summit event and its
  persisted flag (`canopy.summited`) that unlocks the campaign and ciphers, and the
  objective-priority contract (trial > errand > story > SPIRE).
- No behavior changes; this is a retroactive codification of code already in the working tree.

## Capabilities

### New Capabilities
- `errands`: the mission-giver system and the four errand archetypes, their HUD/objective
  plumbing, fail conditions, and cooldowns.
- `trials`: the six timed trials, trial-masters, tier ladder, timers, rewards, persistence,
  and the Hidden Hamlet discovery event.
- `summit-goal`: the Spire default objective, the first-summit flag and its unlocks, and
  objective priority between the systems.

### Modified Capabilities

(none — existing specs remain factually correct; overlaps are referenced in prose)

## Impact

- Specs only: `openspec/specs/errands`, `openspec/specs/trials`, `openspec/specs/summit-goal`.
- Documents existing code in `main.js` (missions, trials, main-loop summit beat) and its
  cross-file contacts (`player.js` E-dispatch and sprint multiplier, `entities.js` giver
  facing, `story.js` objective yielding). No game code is modified.
- localStorage keys documented: `canopy.trials`, `canopy.sprintboost`, `canopy.hamlet`,
  `canopy.hamletErrand`, `canopy.summited`.
