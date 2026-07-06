## Context

"The Second Seed" is a 7-chapter campaign already shipped in `story.js` (~720 lines), loaded last (after `main.js`) so it can call into every system. It mirrors the Trials house pattern: a state object, a `switch` in `updateStory` over `story.ch`/`story.phase`, pure-hash ring-scan finders (each with a widened-radius fallback), a pooled marker set, and HUD writers. This document captures the shipped design as codified truth. Where the original design markdown and the code diverge, the code is authoritative.

## Goals / Non-Goals

**Goals:**
- Capture the invariants that keep the campaign deterministic, save-stable, and soft-lock-free.
- Record the cross-file touch points and persistence keys so the behavior can be re-derived.

**Non-Goals:**
- No code changes. This is retroactive codification.
- Spoiler-safe: the spec records puzzle *structure and rules*, never concrete puzzle answers (bearings, knot identities, and range counts are all derived at runtime from real geometry).

## Decisions

### State and persistence
- Live state is the module `story` object; the persisted surface is `STORY_SAVE` (bootstrapped in `core.js` so worldgen can read it first) written only by `story.js`.
- `localStorage['canopy.story']`, versioned `v:1`, fields: `ch`, `shards`, `haveKey`, `haveSeed`, `planted:{dx,dz}`, `seedbearer`, `foundHamletViaStory`.
- `ch` is the next chapter to offer (1-based; `> 7` = campaign done). `storyComplete()` = `ch > 7`.
- `planted` is stored **Spire-relative** (`{dx,dz}` from `SPIRE.cx/cz`) because `SPIRE` re-randomizes each session; `storyPlantedAt(ix,iz)` in `core.js` re-derives the absolute chunk each load — the same tradeoff HAMLET made, and the reason the oasis lands somewhere fresh each session.
- Summit gate persists separately as `localStorage['canopy.summited']` (`summited` in `main.js`).

### Finders and no-soft-lock guarantee
- All target-finding is pure-hash Chebyshev ring scans (`nearestTypeFrom`, `findCrossing`, `findScorchHeart` verdancy hill-descent) plus `peekColData`/`peekOpenRect` for exact in-chunk features. Finders run only at chapter start / phase transitions, never per frame.
- Every finder result passes through `resolve(target, name)` or `orSpire(target)`: on null it points the objective at the Archivist, sets `story.stuck`, emits one apologetic `once()` message, and re-runs on re-accept.
- The vault sinkhole is found from `SPIRE.cx/cz` (not the player) so Ch4 and Ch6 agree on the same pit.

### Chapter flow
- `startChapter(chained)` sets phase and runs finders; `completeChapter(ch, chain)` advances `ch` and either chains in the field (`chain=true`, used Ch4→5 and Ch6→7 where the player is deep in the world) or returns to the hub (`chain=false`, used Ch1→2, 2→3, 3→4, 5→6, and the Ch7 epilogue).
- Objective priority: trial > errand > story > Spire. `storyPaused` is true whenever a `trial` or `activeMission` exists; while paused, markers hide and `sObj`/`smark` no-op so progress freezes intact.

### Markers and beam
- Own pool `STORY_POOL` (6 `tplBlob` meshes) + two basic materials (gold objective, green socket/knot/growth) — never shares the trial pool. Redrawn fresh each frame; `hideStoryMarks()` clears collected/filled marks.
- The Ch4 heliograph beam is one scene-level stretched cylinder created once, made visible ~20 s during the noon fire then hidden; never added to a chunk.

### Puzzle mechanics that are structural
- Ch2 shards glint only while `dayF > 0.5`; elevated targets also require `player.pos.y > target.y − 4`.
- Ch4 fires only when `checkSummit(...)` and `dayT ∈ [0.47, 0.57]`; `bearingPhrase(SPIRE, vault)` is derived from the located sinkhole so the clue can never lie; the range count is `rangeBlocks() = 4 + hash2(SPIRE.cx,SPIRE.cz,4444)%3`.
- Ch6 knot order is derived from geometry: easternmost knot = "dawn", westernmost = "dusk", remaining = "water"; wrong resets `knotStep` to 0, infinitely retryable; the night gate is `nightF > 0.5`.
- Ch7 plant is a 3-second hold-E channel (`s.plantT += dt`, reset on release); on completion it writes `planted`, clears carry state, un-fouls the flashlight, and `hotSwapChunk` rebuilds the planted chunk immediately.

### Carry effects
- `storyCarrying` (a `var`, read cross-file by `player.js`) mirrors `story.haveSeed`. `player.js` disables sprint when carrying; `story.js` fouls the flashlight color/intensity each frame while carrying.

### Cross-file touch points (all read-only from story.js's perspective)
- `index.html`: `<script src="story.js">` tag (loaded last).
- `player.js`: E-interact tries `storyInteract()` first (story NPC wins ties over trial-master/errand); sprint disabled while `storyCarrying`.
- `main.js`: loop calls `updateStory(dt,time)` after `updateTrials`; objective priority line; `drawMinimap` draws the oasis dot and (post-campaign) Seedbearer anomaly icons; sets `summited` on first summit.
- `entities.js`: `makeNPCGroup(false, 'archivist')` role (dusty-amber cloak tint).
- `worldgen-anomalies.js`: builds the sapling oasis when `storyPlantedAt(ix,iz)`, and the relit beacon head when `storyComplete()`.
- `core.js`: `STORY_SAVE` bootstrap, `storyPlantedAt`, `storyComplete`.

### Dev hook
- `?story=N` (1–7) sets `summited`, jumps `story.ch`, grants prerequisites (shards for ≥4, key for ≥6, seed for 7), and runs that chapter's finders once — the smoke-test entry point.

## Risks / Trade-offs

- [Spire re-roll moves the oasis each session] → Accepted and documented; storage is Spire-relative so the oasis is always valid, just not in a fixed world spot.
- [A finder could theoretically resolve nothing] → `resolve()`/`orSpire()` guarantee the objective always points somewhere safe (the Archivist) and the scan retries; no chapter can dead-end.
- [Ch2/Ch4 depend on time-of-day] → The T key lets the player advance time, so sun-gated steps can never strand the player.
- [Trial vs story discovery of the Hamlet could double-run] → Ch5 guards with `foundHamletViaStory`; the Rumor trial completes instantly if the story already discovered the Hamlet.
- [Ch2 crown-nest target now prefers a waytree lookout] → The finder falls through to the original crown-nest pad when no waytree is near; both are valid high canopy targets, so the spec states the target abstractly.

## Migration Plan

Not applicable — the behavior already ships. This change only adds the archived spec.

## Open Questions

None — behavior is fixed by the shipped code.
