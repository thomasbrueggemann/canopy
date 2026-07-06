## Context

Waytrees shipped with a rung ladder to the lookout, but a passive ladder undersells the
climb. This change swaps that one ladder for a hand-cranked counterweight lift: a deliberate,
pumped ascent that is still forgiving. The ladder engine (`colData.ladders`, the latch state
machine, `ladderInteract`, `ladderProxTick`) and the two structure ladders (Spire, fallen
tower) stay exactly as they are — only the waytree ground-to-deck ladder is removed. The feature
is already implemented; this records its invariants.

## Goals / Non-Goals

**Goals:**
- Replace the waytree ascent with an active, discrete-crank lift that still meets the Ascent
  time budget and never fails an armed run when boarding.
- Carry the rider exactly up and down with no fall-state flicker or fall-damage accumulation.

**Non-Goals:**
- No change to `waytreeSpec`/`nearestWaytree` or any finder — every deck position is identical.
- No removal of the ladder engine or the Spire/fallen-tower ladders (scope guard).
- No new persisted state; lift position is transient.

## Decisions

- **Static frame batched, platform dynamic.** The rails/drum/rope/counterweight batch into the
  chunk's plain geometry like every builder. The moving platform is a standalone `Batch` baked
  with vertex colours and reusing `matPlain` (one shared material) inside a `THREE.Group` whose
  world `y` is driven each frame — mirroring the reservoir water plane. A per-lift material was
  rejected: chunk disposal only frees geometry, so a fresh material would leak.
- **Discrete presses via `e.repeat` guard.** Q/C pumps require `!e.repeat`; holding is inert.
  This is the mechanic, not a nicety — the climb is deliberate cranks. Velocity decays
  (`exp(-LIFT_DECAY·dt)`) so sustained motion needs sustained cranking.
- **`colData.lifts` row owns state.** `{x,z,r,y0,y1,y,v,mesh}`. `updateLifts` advances only the
  3×3 resident lifts (distant lifts can't be pumped, so skipping them is exact). `y` clamps to
  `[y0,y1]`; a clamp zeroes `v` and snaps within `LIFT_SNAP`.
- **Carry before input/gravity.** In `stepPlayer`, if `onLift` is set and the player is within
  `r+0.15`, `|feet−lift.y|<1.2`, and `vel.y<=0.01`, snap `pos.y=lift.y` and zero `vel.y`. The
  `vel.y<=0.01` guard preserves a jump; `airPeakY` tracks `pos.y` so a carried descent banks no
  fall damage. Horizontal movement is never locked.
- **Support + caught landing.** The platform is a support candidate like a pad
  (`supportLayer='lift'`); `SAFE_LEAF.lift` catches falls onto it. The Ascent ground-touch check
  already ignores `supportLayer 'lift'`, so boarding at the bottom is safe.
- **Single `updateLifts` call site.** Called once per frame from `stepPlayer` so both the
  ladder-latched early path and the normal path reach it — never called twice.

## Risks / Trade-offs

- [A slow ride courts heatstroke in raw sun] → Pump tuning targets ~1.5–2 m/s so the deck is
  reached in ~15–22 s; a later change retunes for taller decks.
- [Chunk rebuild resets the platform] → Documented and acceptable: resident chunks never rebuild
  under the player, and the parked-at-ground reset is harmless.
- [Weather gust while riding] → A capped velocity shove below walk speed is intentional; standing
  on a 1.15 m platform in a storm should feel exposed (the railing is visual).

## Migration Plan

Remove only the `addLadder` call inside `addWaytree`; add `addLift`. `colData.lifts` is
initialized as `[]` alongside `ladders`. No save-format change. Rollback is re-adding the
ladder call.

## Open Questions

None — behavior is codified from the shipped implementation. A later change raises the deck into
a skyhouse and retunes the pump constants; the lift mechanics here are unchanged by it.
