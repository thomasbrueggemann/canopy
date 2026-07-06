# Tasks

> NOTE: This feature is ALREADY IMPLEMENTED and shipped (`weather.js` plus the guarded
> read points in `main.js` and `player.js`). These tasks are a retroactive codification
> of the existing behavior; all items are checked to reflect the shipped state.

## 1. WX mixer and touch points

- [x] 1.1 Define the global `WX` mixer with neutral defaults (fog near/far mul, sun mul, heat mul, air add, shade-safe threshold, wind vector, flood mul, strain)
- [x] 1.2 Call `updateWeather(dt, time)` in the `main.js` loop immediately after `updateSky`, guarded by `!SHOT` and `typeof`
- [x] 1.3 Multiply the loop's fog near/far by `WX.fogNearMul`/`WX.fogFarMul` with min clamps so the world never fully vanishes
- [x] 1.4 Apply flood slowdown and wind shove in `player.js stepPlayer`; apply heat mul, air add, shade threshold, and dust strain in `stepHeat`

## 2. Scheduling and lifecycle

- [x] 2.1 Implement the `clear → warn → active → clearing → clear` phase machine
- [x] 2.2 Implement the dawn roll (35%) with session grace, ≥1-clear-day cooldown, and trial/story-carry hold
- [x] 2.3 Restrict the heat wave to morning rolls; give dust/storm a random later start hour
- [x] 2.4 Bound active durations (dust 150–210 s, storm 180–260 s, heat ~240 s / dusk) and ramp via the smooth `WX.k` envelope
- [x] 2.5 Guarantee no persistence and full inertness in SHOT mode

## 3. Shelter and fairness

- [x] 3.1 Implement `weatherShelter()` (overhead solid ray, deep pit, water, ≥2 leaf pads), throttled ~5 Hz and cached
- [x] 3.2 Hard-cap wind shove below walk speed (2.5 m/s ground, 3 m/s air)
- [x] 3.3 Route all weather faints/strikes through the existing heatstroke/blackout wake-in-last-shade paths

## 4. The Grey Wind (dust storm)

- [x] 4.1 Telegraph (paper horizon tint, wind audio swell, message)
- [x] 4.2 Active effects: visibility collapse, sun dim, wandering gust, grey-mote particle cloud
- [x] 4.3 Strain when unsheltered (~30 s to faint), `STRAIN` HUD label, normal shade drain when sheltered

## 5. The Long Rain (thunderstorm)

- [x] 5.1 Telegraph (sky dim, distant thunder, message)
- [x] 5.2 Active effects: rain particles, wet ground tint, flood slowdown floor ~0.65, gusts stronger above canopy
- [x] 5.3 Rain cooling (no heat gain, faster drain when exposed)
- [x] 5.4 Lightning flashes (8–20 s), distance-delayed thunder, strike tell + blackout aloft, descend/cover cancels
- [x] 5.5 Clearing aftermath message and flood drain

## 6. The White Hour (heat wave)

- [x] 6.1 Morning-only start, hard end at dusk
- [x] 6.2 Telegraph (whitening sky, silenced wildlife, message)
- [x] 6.3 Active effects: heat-gain multiplier, lowered shade-safe threshold, air add; deep shade/water/pit/night still safe

## 7. HUD and dev hook

- [x] 7.1 `#wx` glyph + name beside the clock (dimmed during warn); `#heatlabel` swaps to `STRAIN` during dust
- [x] 7.2 `?wx=dust|storm|heat` dev hook: skip grace, short warn, console log on activation; disabled in SHOT

## 8. Verification

- [x] 8.1 `node --check weather.js`
- [x] 8.2 Headless smoke shots 1..5 print `CANOPY_STATUS READY … err=0` (weather inert in SHOT)
- [x] 8.3 `?wx=dust|storm|heat` logs the activation console line for headless per-event checks
