## Why

The waytree rung ladder made the lookout climb passive. A hand-cranked winch lift makes the
ascent an active, deliberate ritual — step onto the platform and pump to crank up — while still
being forgiving. This change replaces the waytree ground-to-deck ladder with a counterweight
lift. It is a retroactive codification of already shipped behavior.

## What Changes

- Add **winch lifts**: each waytree gets a hand-cranked counterweight lift on the trunk's +x
  face — a static frame (guide rails, crossbeam, brass winch drum, hoist rope, counterweight)
  plus a dynamic riding platform.
- Add the **pump mechanic**: discrete Q presses crank up, C down; holding (auto-repeat) does
  nothing — the climb is made of deliberate cranks. Velocity decays so the player must keep
  cranking.
- Add **rider carry**: the platform carries the player exactly, up or down, with no fall-state
  flicker, no fall-damage accumulation, and no locked horizontal movement.
- Add a **proximity prompt** teaching the keys near or while stalled on a lift, and make the
  platform a caught landing.
- **BREAKING** (in-world): the waytree ground-to-deck rung ladder is removed and replaced by
  the lift. The Spire and fallen-tower ladders and the whole ladder engine are unchanged.

## Capabilities

### New Capabilities
- `winch-lifts`: the hand-cranked counterweight lift — structure, discrete-press pumping,
  velocity decay, rider carry, support/caught-landing, proximity prompt, and transient state.

### Modified Capabilities
- `waytrees`: the "Waytree ground-to-deck ascent" requirement changes from a rung ladder to a
  hand-cranked winch lift. Placement, the recomputable `waytreeSpec`, and every finder target
  are unchanged.

## Impact

- Worldgen: `worldgen-builders.js` (new `addLift`; `addWaytree` swaps `addLadder`→`addLift` and
  gains the `extraMeshes` param; `addLadder` itself unchanged), `worldgen-anomalies.js`
  (`colData.lifts: []` init, waytree call site passes `extraMeshes`; Spire/fallen ladder call
  sites unchanged).
- Player: `player.js` (`nearby.lifts`, `updateLifts`, Q/C pump keydown, support-scan lift
  candidacy + `onLift` carry, `SAFE_LEAF.lift`, `liftProxTick`, reworded ladder once-texts).
- `main.js`: two string tweaks (elder line, lookoutwalk).
- No changes to `waytreeSpec`/`nearestWaytree`, core.js, story.js, puzzles.js, inventory.js,
  weather.js, entities.js, index.html.
