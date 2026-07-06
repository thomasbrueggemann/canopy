## Why

The 13 archived capability specs cover CANOPY's feature layer (canopy layers, climbing aids, weather, story, puzzles) but the player-facing physics core they all build on — movement kinematics, the sun-exposure/heat model, and fall consequences in `player.js` / `core.js` — has no spec at all. This change retroactively codifies that engine behavior exactly as shipped, so future changes have a baseline contract to diff against.

## What Changes

- Codify the base first-person movement model: constants (`WALK 5.2`, `SPRINT ×1.75`, `JUMP 6.2`, `GRAV 16`, `EYE 1.62`, `PR 0.42`), input handling, speed modifiers, horizontal collision resolve, the vertical support model, water immersion, pointer-lock/pause flow, the R shade-recall, camera feel, and the E interact priority chain.
- Codify the heat/exposure engine: the analytic sun-occlusion probe (no raycaster), its 5 Hz throttle and smoothing, heat gain/drain rates, air-temperature readout, the last-shade anchor, and the heatstroke faint.
- Codify fall consequences: apex tracking, the 7 m / 10 m damage thresholds, soft (caught) landings, the stagger state, and the blackout sequence.
- No behavior changes — this is retroactive codification of existing, shipped code. Sibling capabilities (freeclimbing, ladders, winch-lifts, canopy-layers, sky-nets, weather-events) are referenced by name, not restated.

## Capabilities

### New Capabilities
- `player-movement`: first-person kinematics, input, collision resolve, support model, water, pointer lock, interact dispatch.
- `heat-exposure`: sun-occlusion probe, exposure smoothing, body-heat gain/drain, air temperature, last shade, heatstroke.
- `fall-consequences`: fall-apex tracking, damage thresholds, caught landings, stagger, blackout.

### Modified Capabilities

(none — existing specs are factually consistent with the code; overlaps are referenced in prose)

## Impact

- Documentation only: `openspec/specs/player-movement`, `openspec/specs/heat-exposure`, `openspec/specs/fall-consequences`.
- Source of truth: `player.js` (stepPlayer, stepHeat, sunOcclusion, handleLanding, blackout), `core.js` (movement constants, CANOPY_Y, DAY_LEN), `main.js` loop touch points where they anchor player-observable behavior.
- No game code is touched.
