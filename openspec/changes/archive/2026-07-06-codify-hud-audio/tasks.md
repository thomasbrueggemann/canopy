> Retroactive codification of existing code: every task below was already implemented in the
> working tree (`main.js` minimap, HUD, narration, and audio blocks) before this change was
> written. All tasks are checked; nothing remains to build.

## 1. Minimap

- [x] 1.1 Rotating 200 px disc at 0.82 scale with player arrow, north tick, rim ring, 0.08 s cadence
- [x] 1.2 Chunk-tile terrain (type colours, biome overrides, building greys, tree dots) from prebuilt mini data within ~190 m
- [x] 1.3 Objective dot / rim edge-arrow and the "✦" label line
- [x] 1.4 Gated marker vocabulary: giver, trial-masters, vantage pins, hamlet hut, oasis, Archivist, Tinker, Seedbearer ticks, Mantle ticks, waytree glyphs

## 2. HUD

- [x] 2.1 Clock, district/biome/hamlet line, air temp, altitude, cover state at 0.2 s cadence
- [x] 2.2 Heat bar + heat vignette (smooth 55→100, ×0.9)
- [x] 2.3 Transient hint line (latest-wins, timed fade), separate from the toast queue
- [x] 2.4 One-shot narration beats via the seen-key guard (layers, night, features, district/biome moods)
- [x] 2.5 Active-only gating (no HUD/map/narration before start)

## 3. Audio

- [x] 3.1 Lazy AudioContext + master gain 0.35, SHOT-never, fail-silent
- [x] 3.2 M mute toggle (first press initializes) with eased master gain and hint
- [x] 3.3 Wind bed (altitude/day-scaled) and cricket bed (night-scaled) with smoothed ramps
- [x] 3.4 Daytime birdsong scheduler (2–9 s, 1–3 descending chirps)
- [x] 3.5 Chime-pole proximity tinkles (3×3 scan, 10 m falloff, pentatonic)
- [x] 3.6 Trial-completion fanfare and the shared one-shot idiom
- [x] 3.7 Footstep/crank noise bursts

## 4. Verification

- [x] 4.1 `openspec validate codify-hud-audio` passes with no errors
