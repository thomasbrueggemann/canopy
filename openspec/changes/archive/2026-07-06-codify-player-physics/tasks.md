> Retroactive codification of existing code: every task below was already implemented and shipped in `player.js` / `core.js` before this change was written. All tasks are checked; nothing remains to build.

## 1. player-movement

- [x] 1.1 Implement core kinematics: WALK/SPRINT/JUMP/GRAV/EYE/PR constants, normalized WASD input, grounded 11 / airborne 3 acceleration (`player.js` stepPlayer)
- [x] 1.2 Implement speed modifiers: water ×0.35, stagger ×0.45, flood slow gate, seed-carry sprint lock, persisted sprint boost
- [x] 1.3 Implement mouse look (0.0021 rad/px, pitch clamp ±1.45, YXZ), head bob + footsteps, camera shake decay
- [x] 1.4 Implement horizontal resolve: solid AABB push-out at PR below h−0.35, trunk cylinder push-out at r+PR·0.9, climb-normal capture (vine solids, trunks > 14 m)
- [x] 1.5 Implement vertical support: pit-aware ground, solid/pad/lift candidates, highest-wins, catch bands, supportLayer recording, floor clamp
- [x] 1.6 Implement water immersion rect test
- [x] 1.7 Implement pointer-lock start/pause overlay flow and started-gated keys
- [x] 1.8 Implement R shade recall (teleport, zero velocity, heat cap 40)
- [x] 1.9 Implement E interact dispatch priority chain with typeof guards

## 2. heat-exposure

- [x] 2.1 Implement analytic sun-occlusion probe: solid slab test, overhead-pad discs (0.75 / 0.35 net), trunk cylinders (0.9), horizon fallback ×0.5 below CANOPY_Y (`sunOcclusion`)
- [x] 2.2 Implement 5 Hz throttle + dt×4 smoothing + exposed flag at 0.55 (`stepHeat`)
- [x] 2.3 Implement heat gain dayF·2.6·smooth(0.25,0.9,E) with Mantle/WX multipliers, clamp [0,100]
- [x] 2.4 Implement drains: 7 base / 14 deep pit / 28 water, WX drain multiplier, deep-pit E=0
- [x] 2.5 Implement air-temperature readout model
- [x] 2.6 Implement throttled last-shade anchor (grounded, below CANOPY_Y, E under shade-safe threshold)
- [x] 2.7 Implement heatstroke faint (fade, wake at last shade, heat 55, pin at 99)

## 3. fall-consequences

- [x] 3.1 Implement airPeakY apex tracking with grounded/climbing resets and deliberate-transition resets (ladder/lift/mantle)
- [x] 3.2 Implement landing resolve on the touch-down frame with the 7 m / 7–10 m stagger / >10 m blackout ladder (`handleLanding`)
- [x] 3.3 Implement caught landings: water, untagged canopy, SAFE_LEAF layer set, proportional shake, net bounce delegation
- [x] 3.4 Implement blackout sequence: single-flight guard, trial/errand failure, 0.85 s fade, wake at last shade with +25 heat (`blackout`)

## 4. Verification

- [x] 4.1 Confirm the delta specs match the shipped code paths line-by-line (retroactive review)
- [x] 4.2 `openspec validate codify-player-physics` passes
