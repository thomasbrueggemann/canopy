## Context

Retroactive codification: this change documents the already-shipped physics core of CANOPY (`player.js`, movement constants in `core.js`). No code is written or modified. The design section therefore records the engine invariants the specs rest on, so future changes do not break them by accident.

## Goals / Non-Goals

**Goals:**
- Fix the player-observable contracts of movement, heat, and falls as testable requirements with the load-bearing numbers (WALK 5.2, GRAV 16, CLIMB_SPEED 3.2, CANOPY_Y 24, 7/10 m thresholds, heat rates 2.6 gain / 7·14·28 drain).
- Record the invariants that make those contracts cheap and deterministic.

**Non-Goals:**
- Anything already specced by sibling capabilities: freeclimbing mechanics, ladder latch, lift carry, SAFE_LEAF per-surface behavior details, weather mixer values. Those are referenced by capability name.
- Rendering, worldgen, HUD layout (other changes / other agents' capabilities).

## Decisions

- **Collision reads resident `colData` only.** `collectColliders` gathers the 3×3 chunk ring's arrays (`solids`, `trunks`, `pads`, `pits`, `waters`, `ladders`, `lifts`) into flat scratch arrays reused every frame. Player physics never builds or peeks a chunk (`peekColData`-style probes are forbidden in per-frame paths); chunk-streaming guarantees the immediate ring is always built, which is what makes this sound.
- **Analytic sun probe over raycasting.** `sunOcclusion` marches slab/box, disc, and cylinder intersections in scalar math against the same resident arrays — zero allocations, throttled to 5 Hz, smoothed at `dt × 4`. Alternative (THREE.Raycaster against scene meshes) was rejected in the original implementation: batched chunk meshes make per-triangle raycasts orders of magnitude more expensive and non-deterministic in cost.
- **One resolve order per frame.** Lifts advance → ladder-latch early-return → carry → input/gravity/integration → horizontal push-out (solids then trunks) → climb intent → vertical support (highest candidate wins) → water flag → fall resolve → bob/camera. The ladder branch returning early is the mechanism that makes "gusts can never shove a latched climber" (ladders spec) true; specs in this change must not reorder it.
- **Fall damage as apex bookkeeping, not impact velocity.** `airPeakY` is reset by grounded/climbing frames and by every deliberate transition (mantle, release, hop, lift carry). Deciding consequences from `apex − landingY` keeps caught landings and carried descents free without inspecting velocity history.
- **Recovery is anchored, not respawned.** `lastShade` is only written when grounded, below `CANOPY_Y`, and effectively shaded (throttled ~1 Hz); heatstroke, blackout, R-recall all wake there. That single invariant is what guarantees "never a death spiral" across weather, falls, and heat.
- **`localStorage` discipline.** This slice touches exactly one persisted key: `canopy.sprintboost` ('1' flag, guarded try/catch). Movement, heat, and fall state are transient by design; specs must not add persistence.

## Risks / Trade-offs

- [Numbers cited in specs drift if code is retuned] → The specs cite only load-bearing constants that define feel contracts; retunes must ship as spec MODIFIEDs.
- [Overlap with sibling specs (SAFE_LEAF appears in canopy-layers)] → This change specs the shared engine rule and thresholds; per-surface behavior stays in the sibling capability, referenced by name.
- [The exposure threshold 0.55 and shade threshold 0.25 are coupled to weather's `shadeSafeE`] → Documented in both places; weather-events already owns the override semantics.

## Migration Plan

None — documentation of existing behavior. Archive immediately; tasks are pre-checked as retroactive.

## Open Questions

None.
