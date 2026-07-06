## Why

The player's two ambient information channels — the rotating minimap with its marker
vocabulary plus the survival HUD, and the fully synthesized WebAudio soundscape — already
ship in `main.js` but have no spec coverage. The archived capabilities reference individual
markers (waytree glyph, Tinker dot, oddity ticks) and one sound (the carillon fallback)
without owning the systems that draw or play them. This change retroactively codifies both
so the marker vocabulary, HUD readouts, and synth contracts are testable.

## What Changes

- Codify the minimap: geometry (rotating 200 px disc, ~0.82 scale, north tick, edge
  arrow), terrain rendering from chunk data, the full marker vocabulary (objective,
  giver, trial-masters, vantage pins, hamlet hut, oasis, Archivist/Tinker dots, reward
  ticks, waytree glyphs) with their gating flags, and the label line.
- Codify the HUD: clock, district/biome line, air temperature, altitude, cover state,
  heat bar and heat vignette, fps counter, the transient hint line, one-shot narration
  beats (the `once` mechanism and its canopy-layer/night/feature beats), and the update
  cadences. The toast queue itself stays specified by the `toasts` capability.
- Codify the synthesized audio: on-demand AudioContext creation and the mute toggle, the
  wind and cricket beds, birdsong, wind-chime proximity tinkles, the trial fanfare,
  footstep bursts, and the SHOT/mute gating contract shared by all of them.
- No behavior changes; this is a retroactive codification of code already in the working tree.

## Capabilities

### New Capabilities
- `minimap-hud`: the minimap disc, its marker vocabulary, the survival HUD readouts, the
  hint line, and one-shot narration beats.
- `audio-synth`: the all-synthesized soundscape — beds, one-shots, and gating.

### Modified Capabilities

(none — toasts, ciphers, waytrees, and the campaign own their specific messages/markers;
referenced in prose)

## Impact

- Specs only: `openspec/specs/minimap-hud`, `openspec/specs/audio-synth`. No game code is
  modified.
- Documents existing code in `main.js` (drawMinimap, HUD block, audio block, once-beats)
  and its read-only inputs from other systems (`activeObjective`, trial/mission state,
  story/cipher flags, chunk `colData`, day factors).
