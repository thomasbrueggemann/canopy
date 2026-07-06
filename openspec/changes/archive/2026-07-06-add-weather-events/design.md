## Context

CANOPY is a plain-script THREE.js game with cross-file globals and no build step. It
already teaches the player to manage exposure with shade, water, pits, night, and the
R-key shade recall. Weather adds occasional danger on top of those exact tools. The
shipped implementation lives entirely in a new `weather.js`, loaded after `puzzles.js`
and before `story.js` (which must stay last); all cross-script reads are `typeof`-guarded
so load order among add-on scripts is not load-bearing. This design records the HOW of the
already-shipped system so the specs have a durable technical companion.

## Goals / Non-Goals

**Goals:**
- Make weather a single-owner subsystem that touches the rest of the game only through a
  global mixer (`WX`) read at a handful of fixed, guarded points.
- Keep every event telegraphed, bounded, and survivable with tools the game already
  teaches; never make movement or recovery impossible.
- Zero per-frame allocation, no new textures, pixel-stable SHOT output, no persistence.

**Non-Goals:**
- No changes to `core.js`, `story.js`, `inventory.js`, `puzzles.js`, `entities.js`, or
  worldgen files.
- No NPC weather reactions (out of scope), no post-processing shaders, no new save keys.

## Decisions

- **Single global mixer `WX`, recomputed every frame, reset-then-paint.** Every frame
  `updateWeather` resets `WX` to neutral defaults and then the active event writes its
  values on top. Because exactly one event exists at a time by construction, hazards can
  never stack. Readers (`main.js` fog lines, `player.js` `stepPlayer`/`stepHeat`) are all
  `typeof WX !== 'undefined'`-guarded / safe-defaulted, so a neutral or absent mixer is a
  no-op. Alternative considered: event objects pushing effects directly into each system —
  rejected because it scatters weather logic across files and breaks the SHOT/neutral
  guarantee.
- **Re-tint after `updateSky`, never restore.** `updateWeather` is called immediately
  after `updateSky(dayT, dt)`; it multiplies sun/hemi and lerps fog/clear color *after*
  the sky sets them. Since `updateSky` rewrites those every frame there is nothing to
  restore — no bookkeeping, no pops. The street `ground` mesh is likewise driven back to
  white every frame, so a single global mesh self-restores.
- **Phase machine `clear → warn → active → clearing → clear` with a smooth envelope
  `WX.k`.** `WX.k` lerps toward a per-phase target (warn ramps to a low telegraph level,
  active is 1, clearing ramps to 0), so all effects fade without pops. Durations:
  warn ~90 s, dust active 150–210 s, storm 180–260 s, heat capped ~240 s and hard-ended
  at dusk (`dayT > 0.72`), clearing ~30 s.
- **Fair scheduling.** A dawn roll (day clock crossing ~0.24) fires a 35% chance while
  clear, gated by a 4-minute session grace, a ≥2-dawn cooldown (one full clear day
  between events), and `!_wxBusy()` (no trial or story-carry). Heat only rolls in the
  morning so it can run in daylight and end at dusk; dust/storm pick a random start hour
  later that day. An event may be *held* in warn while a trial/story-carry is live.
- **Shelter test reuses the sun-probe idiom.** `weatherShelter()` returns a cached verdict
  refreshed ~5 Hz: a vertical `_rayHitsBox` march over `nearby.solids`, or `inPit && y<-1`,
  or `inWater`, or ≥2 overhead leaf pads. The same cache drives dust strain, rain cooling,
  and the lightning exposure check.
- **Pooled particles, allocation-free.** Two `THREE.Points` clouds (350 dust motes, 500
  rain streaks) are built once and parked hidden; positions recycle through a box that
  follows the camera (drifter idiom), opacity rides `WX.k`. No per-frame allocation.
- **Audio via the existing wind-noise idiom.** Rain and dust-wind loops are one filtered
  noise buffer each, built lazily on first need and AC-gated (never in SHOT, never before
  the first click). Thunder and the strike crackle are one-shot noise bursts.

## Risks / Trade-offs

- [Wind could pin the player or shove them off a bough] → Hard-cap shove at 2.5 m/s
  ground / 3 m/s air, well below WALK, and apply it as an additive velocity nudge so the
  player always keeps headway.
- [Weather could soft-lock a hot or aloft player] → Every faint/strike routes through the
  existing heatstroke/blackout path that wakes the player in `lastShade` (by definition
  sheltered); the flood floor never fully stops movement; heat leaves the R-key recall and
  water/pit drains untouched.
- [Randomness could jitter screenshots] → `updateWeather` is never called in SHOT mode and
  the mixer stays at neutral defaults there, so `?shot=1..5` is pixel-stable; the `?wx=`
  hook is also disabled in SHOT.
- [Load-order fragility across add-on scripts] → All cross-script reads are `typeof`-guarded
  and safe-defaulted; only constraint is `story.js` stays last.

## Migration Plan

Retroactive codification only — the system is already implemented and shipped. No rollout
or rollback steps. If reverted, remove the `weather.js` script tag and the `#wx` span; the
guarded read points in `main.js`/`player.js` no-op when `WX` is neutral or absent.

## Open Questions

None — behavior is fixed by the shipped implementation and verified against the code.
