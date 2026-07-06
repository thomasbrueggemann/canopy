## Context

The waytree lift stopped at canopy height, so the lookout never cleared the crowns and the
canopy sea (revealed over `smooth(31,40,y)`, sitting at 26.5) stayed hidden — old decks in
[22,30) never saw it fully. Raising the deck into [42,50) puts the lookout in full sea reveal,
above the hamlet giants (32–40) yet below the colossus (56.5) and the Spire (78), preserving
the landmark hierarchy. The lift mechanics are unchanged; only the deck height, the house
structure, and the pump constants move. The feature is already implemented (or in flight); this
records its invariants, treating the skyhouse design as truth.

## Goals / Non-Goals

**Goals:**
- Put the lookout clear above the crowns with the leaf-sea rolling to every horizon below it.
- Keep the now-longer, sun-exposed ride deliberate but survivable at noon.
- Preserve `waytreeSpec` purity so every finder updates from one number.

**Non-Goals:**
- No change to lift mechanics, the ladder engine, or the Ascent ground-touch rule.
- No change to `waytreeSpec` salts or placement hashes — only the `deckY` base.

## Decisions

- **One load-bearing number.** `deckY = 42 + hash2(ix,iz,7304) % 8` (was `22 + …`). Same salt,
  same purity, so `findNestPad`, the Ascent trial, the VANTAGE errand, and the minimap glyph all
  follow automatically. Chosen over a separate skyhouse spec so there is a single source of truth.
- **Mast-carried house above the crown.** `addTree(…, deckY - 6, …)` drops the crown mass ~4–6 m
  below the deck; a bare `tplTrunk` from `deckY - 7` to `deckY + 1` (r ~1.5) plus a
  `colData.trunks` push at `h = deckY` carries the house and is sun-occluding AND freeclimbable
  (trunks with h > 14 take the climb path), so purists can skip the lift entirely.
- **Full roof with real shade.** The old half-roof and rim lamp are deleted. A full
  `addGableRoof` spans x±3.3/z±3.3 at `deckY + 2.8` on 6 posts and registers a shade pad
  `{ x, z, r: 3.2, y: deckY + 2.9 }` (no layer → 0.75 attenuation → near-zero burn under the
  roof; also a landable soft pad, which is fine — it's a roof). The shade at the top offsets the
  raw-sun ride.
- **Beacon mast.** A thin cylinder from the ridge to `deckY + 7` with a lamp head at ~`deckY +
  6.6` replaces the rim lamp; at 50+ m it reads across the whole night map.
- **Pump retune.** `LIFT_PUMP 0.85→1.0`, `LIFT_VMAX 2.6→3.2` targets ~45 m in ~18–24 s. The old
  tuning gave 30+ s for 45 m; at full noon burn (~2.5 heat/s) the slow ride courted heatstroke by
  itself. The faster winch keeps the day climb spicy (~40–55 heat on arrival at noon) but
  survivable; night/dusk rides are unaffected.
- **Rails clear the eaves.** Guide rails still run to `deckY + 1.8` at x+3.6, just outside the
  roof eaves at ±3.3, so the lift dock stays seamless.

## Risks / Trade-offs

- [Higher deck lengthens the ride into raw sun] → The pump retune plus the roofed house at the
  top keep noon arrival survivable; dusk/night rides are unaffected.
- [Changing deckY could desync a finder] → All finders read `waytreeSpec`; purity and salts are
  unchanged, so a single number moves them together.
- [Wider r 3.0 deck vs the VANTAGE check] → The `checkSummit` half-extents (2.8 + 1 tolerance)
  still cover the r 3.0 deck.

## Migration Plan

Change the `deckY` base, rework `addWaytree`, and bump the two pump constants. No save-format
change (lift state is transient). Rollback is reverting the `deckY` base and constants.

## Open Questions

None — behavior is codified from the skyhouse design, which is treated as truth here even where
the code has not yet caught up.
