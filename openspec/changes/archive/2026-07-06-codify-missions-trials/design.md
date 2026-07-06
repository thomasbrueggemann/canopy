## Context

Retroactive codification. The errand/trial/summit layer already ships in `main.js` (missions
block, trials block, main-loop summit beat) with cross-file contacts in `player.js`
(E-dispatch, sprint multiplier, G hold) and `entities.js` (giver facing, receiver
departure). These specs document the working tree as-is; no code changes accompany them.

## Goals / Non-Goals

**Goals:**
- Capture the mission/trial contracts precisely enough to regression-test: feasibility
  gates, time-budget formulas, fail conditions, persistence keys, HUD ownership.
- Name the seams other capabilities own (parcel-delivery for the ERRAND handoff,
  story-campaign/ciphers for what the summit flag unlocks, waytrees for lookout recompute)
  instead of restating them.

**Non-Goals:**
- Rendering trivia (marker mesh shapes, exact message prose beyond load-bearing lines).
- Engine-side mechanics (climbing, heat model, chunk residency) — the sibling engine specs
  own those; these specs only consume their observable outputs (`p.exposed`, `p.grounded`,
  `p.supportLayer`, chunk scans).

## Decisions

- **Mutual exclusion, not stacking**: one mission OR one trial; `startTrial` fails any
  active mission. Simpler HUD ownership and no objective ambiguity.
- **Objective priority is trial > errand > story > SPIRE**, enforced by update order in the
  main loop (missions → trials → story) plus `storyPaused` checks inside `updateStory`. The
  summit-goal spec carries this as the cross-system contract.
- **Feasibility-first offering**: both systems check live feasibility before offering
  (pickArch options list; trialFeasible) so the player is never handed an impossible task;
  accept-time fallback to ERRAND double-guards target unloading.
- **Budgets from first principles**: trial timers derive from course geometry ÷ effective
  sprint speed × slack × tier multiplier (bronze 1.35 / silver 1.15 / gold 1.0) rather than
  hand-tuned constants, so re-rolled worlds stay fair.
- **Persistence keys** (all via the guarded try/catch localStorage idiom):
  `canopy.trials` (JSON map id→best tier index), `canopy.sprintboost` ('1'),
  `canopy.summited` ('1'), `canopy.hamlet` ('1'), `canopy.hamletErrand` ('1'). Session-only
  state deliberately NOT persisted: `doneVantages` pins, active mission/trial.
- **Pooled meshes**: LAMP flames come from the shared 8-slot LAMP_POOL; trial markers from
  the 8-slot TRIAL_POOL (`setMark`/`hideMarks`) — toggled, never re-created, freed by
  visibility not disposal.
- **SHOT gating**: `updateMissions`/`updateTrials` are simply not called in SHOT mode, so
  no giver, master, marker, or timer can perturb deterministic screenshots.
- **Rumor/story dedup**: `STORY_SAVE.foundHamletViaStory` + `hamletFound` short-circuits
  The Rumor so the campaign's Chapter 5 discovery and the trial never run their copies of
  the same chase simultaneously (mirrored from the story-campaign spec's guard).

## Risks / Trade-offs

- `doneVantages` being session-only means minimap pins vanish on reload while the trial/
  hamlet/summit flags persist — an intentional asymmetry (pins are breadcrumbs, not
  progress) but easy to misread as a bug.
- Trial-master density hashes (7788/7789 with %2 / %17) are load-bearing determinism; any
  worldgen chunk-type change silently moves masters. The spec cites the hashes so a change
  there is visibly breaking.
- The Ascent's ground-fail predicate (`grounded && supportLayer === null && !onCanopy &&
  y < 1.5`) depends on engine support-layer bookkeeping; specced behaviorally ("true
  ground") to survive refactors.
