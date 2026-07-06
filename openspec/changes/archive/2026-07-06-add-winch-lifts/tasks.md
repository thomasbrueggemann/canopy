> NOTE: These features are ALREADY IMPLEMENTED. This is a retroactive codification of
> shipped behavior into specs, so every task is checked as done.

## 1. Lift worldgen

- [x] 1.1 `addLift` builds the static frame (rails, crossbeam, brass drum, hoist rope, counterweight)
- [x] 1.2 `addLift` builds the dynamic platform as a standalone batch reusing `matPlain` in a `THREE.Group`
- [x] 1.3 Platform open on ±x, rail ring on ±z only; registers a `colData.lifts` row parked at `y0`
- [x] 1.4 `addWaytree` gains `extraMeshes` and calls `addLift` where it called `addLadder`
- [x] 1.5 `colData.lifts: []` initialized in the buildChunk colData literal; waytree call site passes `extraMeshes`
- [x] 1.6 `addLadder` and the Spire/fallen-tower ladder call sites left unchanged (scope guard)

## 2. Pump input and motion

- [x] 2.1 Q/C keydown with `!e.repeat` adds ±`LIFT_PUMP`, clamped to ±`LIFT_VMAX`
- [x] 2.2 `nearestPumpableLift`: the ridden lift, else nearest within ~3.2 m (any height)
- [x] 2.3 First-pump `once('lift', …)` message
- [x] 2.4 `updateLifts` decays, integrates, clamps/docks each reachable lift once per frame

## 3. Rider carry and support

- [x] 3.1 `nearby.lifts` gathered/reset in `collectColliders`
- [x] 3.2 Carry snaps `pos.y` to the platform (both directions), `airPeakY` tracks it, jump preserved
- [x] 3.3 Support scan adds lift candidacy (`supportLayer 'lift'`) and records `onLift`
- [x] 3.4 `SAFE_LEAF.lift` catches falls onto the platform

## 4. Prompts and integration

- [x] 4.1 `liftProxTick` hints near a lift and once when stalled mid-ride
- [x] 4.2 Ladder once-texts reworded to drop the waytree reference
- [x] 4.3 `main.js` elder line "ride the lift" and lookoutwalk beat updated
- [x] 4.4 Ascent ground-touch check verified to ignore `supportLayer 'lift'`
