> Retroactive codification: "The Second Seed" campaign already ships in `story.js` and its
> touch points. Every task below is already implemented and is checked to reflect existing truth.

## 1. State, persistence, and gating

- [x] 1.1 `STORY_SAVE` bootstrapped in `core.js` (v:1) with `ch`, `shards`, `haveKey`, `haveSeed`, `planted`, `seedbearer`, `foundHamletViaStory`
- [x] 1.2 `saveStory()` writes `localStorage['canopy.story']`; `story.js` owns all writes
- [x] 1.3 Summit gate persisted as `canopy.summited`; set on first Spire summit in `main.js`
- [x] 1.4 `storyPlantedAt(ix,iz)` and `storyComplete()` helpers in `core.js` (Spire-relative plant, ch>7)

## 2. Giver NPC and hub

- [x] 2.1 `'archivist'` role in `entities.js` `makeNPCGroup`
- [x] 2.2 `syncArchivist` spawns/culls at the fixed Spire-relative anchor within the 3×3 window, facing the tower
- [x] 2.3 Locked-state dialogue directs the player to climb the Spire first
- [x] 2.4 `storyInteract()` starts a chapter at the hub, or restates the objective mid-chapter without losing progress

## 3. Chapter flow and objective priority

- [x] 3.1 `startChapter`/`completeChapter` with field-chaining (Ch4→5, Ch6→7) vs hub returns
- [x] 3.2 Between-chapter objective points at the Archivist; reverts to Spire after completion
- [x] 3.3 `storyPaused` yields markers/objective to trials and errands with no progress loss
- [x] 3.4 `updateStory` called from the main loop after `updateTrials`

## 4. No-soft-lock finders

- [x] 4.1 Pure-hash ring-scan finders for hall, plaza, reservoir, nest, fallen, sinkhole, crossing, scorch heart
- [x] 4.2 `resolve()`/`orSpire()` fallback to the Archivist with an apologetic message and retry-on-reaccept

## 5. Chapters 1–7

- [x] 5.1 Ch1: summit read → nearest oldtown records hall → interact completes, names the shard hiding places
- [x] 5.2 Ch2: three biome-spread shard targets, sun-gated glinting, reach + collect, persist shard count
- [x] 5.3 Ch3: reservoir wade → fallen-tower top → viaduct checkpoint spans → broken span; fix range count
- [x] 5.4 Ch4: three sockets → noon-window fire → bearing derived from the located sinkhole → walk (no marker) → chain to Ch5
- [x] 5.5 Ch5: hamlet talk or Rumor-style discovery (guarded) → crossing → canal chase → key at water level
- [x] 5.6 Ch6: night gate → geometry-derived knot order (reset on wrong, retryable) → descend → take Seed → chain to Ch7
- [x] 5.7 Ch7: cross to Scorch heart → 3-second plant channel → persist plant → oasis sapling → epilogue relights beacon + Seedbearer

## 6. Carry effects, markers, beam

- [x] 6.1 `storyCarrying` disables sprint (`player.js`) and fouls the flashlight (`story.js`) while carrying the Seed
- [x] 6.2 Dedicated `STORY_POOL` markers (never fight trial markers); `hideStoryMarks` each frame
- [x] 6.3 Single scene-level heliograph beam, shown ~20 s during the noon fire only

## 7. World changes and rewards

- [x] 7.1 Sapling oasis built in `worldgen-anomalies.js` when `storyPlantedAt`, hot-swapped on plant and rebuilt on load
- [x] 7.2 Relit Spire beacon head built when `storyComplete()`
- [x] 7.3 Minimap oasis dot and post-campaign Seedbearer anomaly icons in `main.js` `drawMinimap`

## 8. Dev/test hook

- [x] 8.1 `?story=N` jumps to chapter N with prerequisites granted and runs its finders once
