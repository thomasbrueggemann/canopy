## Why

CANOPY's world was static weather-wise: the sky cycled day to night but nothing ever
threatened or changed the player's relationship to shade, water, and shelter. Occasional,
telegraphed world events make the world feel alive and raise the stakes of navigation
*sometimes* — while never making it impossible to move or recover. This change
retroactively codifies the shipped weather system (`weather.js`) as archived specs.

## What Changes

- Add an occasional-event weather system with three bounded, telegraphed events:
  the **Grey Wind** (dust storm), the **Long Rain** (thunderstorm), and the
  **White Hour** (heat wave).
- Each event is scheduled by a fair dawn roll (grace period, cooldown, held during
  trials/story-carries), runs a `clear → warn → active → clearing → clear` lifecycle,
  and drives the rest of the game through a single global `WX` mixer read at a few
  guarded touch points (fog, sun/hemi, heat rate, walk speed, wind shove).
- Each event has a distinct hazard (visibility + body-strain; flood + gusts + lightning;
  extreme heat) and a zero-cost counter the game already teaches (shelter; descend below
  the canopy; deep shade/water/pits).
- Weather is transient atmosphere: no persistence, fully inert in SHOT mode, and a
  `?wx=` dev hook forces each event for headless verification.

## Capabilities

### New Capabilities
- `weather-events`: Occasional, telegraphed, bounded world weather events (dust storm,
  thunderstorm, heat wave), their scheduling, hazards, counterplay, and fairness
  guarantees.

### Modified Capabilities
<!-- None: weather is a new capability that touches existing systems only through the guarded WX mixer. -->

## Impact

- New file `weather.js` (WX mixer, scheduler, three events, particle pools, weather
  audio, lightning, HUD glyph/label swaps, `?wx=` hook).
- Guarded read points in `main.js` (loop calls `updateWeather` after `updateSky`; fog
  near/far multiplied) and `player.js` (`stepPlayer` flood slow + wind shove; `stepHeat`
  heat multiplier, air add, shade threshold, dust strain).
- One HUD span `#wx` beside the clock; the `#heatlabel` text swaps to `STRAIN` during
  dust storms. No worldgen, core, story, inventory, puzzle, or entity changes.
