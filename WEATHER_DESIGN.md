# CANOPY — Weather (occasional world events: the Grey Wind, the Long Rain, the White Hour)

One new file, **`weather.js`**: an occasional-event weather system with three event
kinds. Each is telegraphed in advance, lasts a bounded time, is genuinely dangerous if
ignored, and is always survivable with the tools the game already teaches (shade,
shelter, water, pits, night, the R-key shade recall). Weather makes the world harder
*sometimes* — it must never make it impossible to move or recover.

Design intent, per event:
- **Dust storm ("the Grey Wind")** — a foggy, scouring ash-wind out of the Scorch.
  Visibility collapses; being out in the open wears you down; you must hide in
  sheltered places until it blows through.
- **Thunderstorm ("the Long Rain")** — rain floods the streets: standing water on the
  ground slows walking; gusts shove you; lightning punishes anyone silhouetted above
  the canopy. But rain also cools — it drains body heat, a gift if you dare it.
- **Heat wave ("the White Hour")** — the sun goes white. Dappled light is no longer
  safe; only deep shade, water, and sinkholes hold. Ends at dusk, always.

## Engine invariants (same rules as everything else)

- Plain script, `'use strict'`, cross-file globals; loaded via a `<script>` tag placed
  with the other late scripts (note: **story.js must remain last**; put `weather.js`
  next to `inventory.js`/`puzzles.js` in whatever order those ended up — all loop calls
  are `typeof`-guarded so order among the add-on scripts is not load-bearing).
- No new textures. Particles/props are pooled meshes created once (drifter/firefly
  idiom); never allocate per frame; all per-frame math scalar and allocation-free.
- `msg`/`hint`/`once` for feedback. No changes to worldgen files or core.js.
- **SHOT mode:** weather never runs (`!SHOT` guard on the loop call, like the others);
  `?shot=1..5` output must be pixel-stable versus today.
- Weather is transient — **no persistence** (no new localStorage keys).

## The WX contract (how weather touches the rest of the game)

`weather.js` owns a global mixer object recomputed every frame:

```js
var WX = {
  kind: null,        // null | 'dust' | 'storm' | 'heat'   (active event only)
  phase: 'clear',    // 'clear' | 'warn' | 'active' | 'clearing'
  k: 0,              // 0..1 intensity envelope (ramps in/out smoothly)
  fogNearMul: 1, fogFarMul: 1,   // multiply the loop's computed fog values
  sunMul: 1,         // multiplies sun + hemi intensity after updateSky
  heatMul: 1,        // multiplies heatRate in stepHeat
  airAdd: 0,         // added to displayed/computed air temp
  shadeSafeE: 0.25,  // stepHeat's "counts as shade" threshold (heat wave lowers gameplay-safe exposure)
  windX: 0, windZ: 0,// m/s shove added to player velocity while airborne-or-grounded
  floodSlow: 1,      // walk-speed multiplier when on flooded ground
  strain: 0,         // dust storm: per-second body-strain rate when unsheltered
};
```

Existing files read WX at a handful of fixed points (the *only* touch points, all
`typeof WX !== 'undefined'`-guarded or safe-defaulted):

1. **main.js loop** — call `if (!SHOT && typeof updateWeather === 'function')
   updateWeather(dt, time);` immediately **after** `updateSky(dayT, dt)` (weather
   re-tints sun/hemi/fog *after* the sky sets them, so no updateSky edit is needed).
   Then the fog lines multiply: `scene.fog.far = lerp(215,580,high) * WX.fogFarMul`
   (same for near, min-clamped to ~8/22 so the world never fully vanishes).
2. **player.js `stepPlayer`** — after input speed is computed: `speed *=
   (WX.floodSlow < 1 && p.grounded && p.pos.y < 0.6 && !p.inWater && !p.inPit) ?
   WX.floodSlow : 1;` and after velocity integration add the gust shove
   `p.vel.x += WX.windX*dt; p.vel.z += WX.windZ*dt;`
3. **player.js `stepHeat`** — `heatRate *= WX.heatMul`; `air += WX.airAdd`; the shade
   test `E < 0.25` for `lastShade` becomes `E < Math.min(0.25, WX.shadeSafeE)`; and
   dust-storm strain: `if (WX.strain > 0 && stormExposed) p.heat += dt * WX.strain;`
   where `stormExposed` comes from `weatherShelter()` (below). At 100 the existing
   heatstroke faint already does the right thing (wake in last shade) — the dust storm
   deliberately reuses the body-heat bar as general strain, with the HUD label swapped.
4. **index.html** — one small `<span id="wx"></span>` beside the clock (event glyph +
   name during warn/active), and the `#heatlabel` text is swapped by weather.js between
   `BODY HEAT` and `STRAIN` during dust storms. Overlay help: no change.

Everything else (particles, sky tinting, sounds, scheduling, messages) lives inside
weather.js and touches only scene objects it owns plus `sun`/`hemi`/`sky` intensities
it rescales after updateSky each frame (store the pre-scale values it read, multiply,
and since updateSky rewrites them every frame there is no restore problem).

## Scheduling — occasional, telegraphed, fair

- State machine in `updateWeather`: `clear → warn → active → clearing → clear`.
- Roll: while `clear`, every in-game dawn (`dayT` crossing 0.24) roll
  `Math.random()` — **35 % chance** of one event that day; pick kind uniformly except
  `heat` only rolls when the day is young (it must run in daylight) and `storm`/`dust`
  get a random start time later that day. Also a **grace period**: no rolls until 4
  minutes of real play in the session, and never two events without at least one full
  clear in-game day between them.
- **Never start** (stay in `warn`-hold or skip) while a Trial is active or a story
  carry (`storyCarrying`) is in progress — an event may *continue* if the player
  starts one mid-event; that's their call. (Weather is random per session, not
  hash-seeded — it's atmosphere, not worldgen.)
- **Warn phase** (~90 s real): unmistakable telegraphs, per kind (below), plus one
  `msg()`; `#wx` shows the glyph dimmed. **Active** durations: dust 150–210 s, storm
  180–260 s, heat = until dusk (`dayT > 0.72`) but at most ~240 s real. **Clearing**
  ~30 s ramp-out. All envelopes smooth via `WX.k` (no pops).
- Dev hook: `?wx=dust|storm|heat` → skip grace, force `warn` immediately at session
  start (test path; log `WEATHER <kind> active` to console on activation).

## Event 1 — the Grey Wind (dust-fog storm; hide in shelter)

- **Telegraph:** horizon browns (sky/fog tint toward `0x8a7a5e`), wind audio swells,
  birds stop; `msg('The horizon goes the color of old paper. The Grey Wind is coming —
  get under a roof.', 9)`.
- **Active:** `fogNearMul→0.12`, `fogFarMul→0.10` (≈ 20–50 m visibility), `sunMul→0.35`,
  steady gust `windX/windZ` — a slowly rotating direction, magnitude ~2.2 m/s with
  ±60° wander (enough to feel, never enough to pin the player or shove them off a
  bough at walk speed... cap total shove so `|wind| ≤ 2.5`).
- **Shelter test — `weatherShelter()`:** sheltered iff a **vertical** ray from the
  player hits a solid overhead (reuse the `_rayHitsBox` march over `nearby.solids`
  straight up — cheap, throttled to ~5 Hz like the sun probe), **or** `p.inPit &&
  y < -1`, **or** in water, **or** under ≥ 2 stacked leaf pads (pads attenuate: count
  overhead pads; ≥ 2 counts as shelter — the deep canopy protects, a lone platter
  does not). Unsheltered → `WX.strain = 3.2` (≈ 30 s of open exposure to faint —
  survivable dash-between-cover distances); sheltered → strain 0 **and** heat drains
  at the normal shade rate, so recovery is real. HUD heat-bar label reads `STRAIN`.
- **Particles:** one pooled `THREE.Points` cloud (~350 sprites) of grey motes streaming
  horizontally around the camera (recycled through a box, drifter idiom); opacity
  scales with `WX.k`.
- **Mood lines:** `once('wx-dust', …)` first time sheltered during a storm: "Outside,
  the wind is a wall of grit. In here, it is only a sound."

## Event 2 — the Long Rain (thunderstorm; flooded streets, gusts, lightning)

- **Telegraph:** sky dims (`sunMul→0.55`), distant thunder rumbles (synth noise-burst
  through a lowpass, quiet), `msg('Thunderheads pile over the canopy. The streets will
  drown in an hour — mind where you stand.', 9)`.
- **Active:**
  - **Rain:** pooled `THREE.Points` (~500 short streak sprites falling fast around the
    camera); rain audio = the existing wind-noise idiom with a higher lowpass + more
    gain. `fogFarMul→0.45`, `sunMul→0.3`.
  - **Flood:** `WX.floodSlow → 0.65` ramped in over the first 60 s (puddles rise).
    Applied only when grounded at street level (`y < 0.6`, not already in water/pit —
    those have their own rules). Splashy footsteps: when flooded, `sfxStep` gets a
    small highpass noise tail (one extra node, same idiom). Visual: the ground plane
    material color lerps darker + slightly blue-glossy (`ground` mesh is a single
    global — tint its material color by `WX.k`, restore on clear; no new mesh).
  - **Cooling:** while out in the rain (not sheltered by the dust-storm test),
    `WX.heatMul = 0` and heat *drains* at 1.5× shade rate — the storm is the one
    weather that actively helps a hot player. Risk-reward.
  - **Gusts:** intermittent 1.5 s pulses up to 3 m/s (Perlin-ish sine mix), stronger
    above `CANOPY_Y` (×1.6). Capped as in dust.
  - **Lightning:** every 8–20 s a flash — hemi intensity spike for 120 ms + thunder
    delayed by distance (0.3–2.5 s). **Strike hazard:** if the player is above
    `CANOPY_Y + 3` **and** `weatherShelter()` says exposed, start a 4-second tell —
    `hint('Your hair lifts. The sky is looking at you.', 3)` + faint crackle; if they
    are still up there after 4 s, `blackout('The sky found you.')` (existing blackout:
    wake in last shade, trial/errand failed — harsh, telegraphed, avoidable by
    descending ~3 m). Cooldown 25 s between tells. Never strikes at street level.
- **Aftermath ("clearing")**: rain stops, flood drains over 30 s, drips keep falling
  (existing vignette drips), `once('wx-rain-after', …)` "The streets steam. Every leaf
  is dripping, and the whole forest smells green."

## Event 3 — the White Hour (extreme heat wave; deep shade only)

- Rolls only in the morning; **active window ends at dusk** no matter what.
- **Telegraph (at activation, dawn/morning):** `msg('The light goes white and flat.
  A killing heat rides the noon — dappled shade will not hold today. Find deep shadow,
  water, or the underground.', 10)`; sky whitens (hemi up, sky color desaturated),
  crickets/birds silent, `airAdd→+9`.
- **Active:** `heatMul → 2.1` and `shadeSafeE → 0.12`: the `smooth(0.25, 0.9, E)` burn
  curve in stepHeat is effectively re-based by multiplying — dappled light (E≈0.3–0.5)
  now burns at a real rate instead of a trickle. Deep shade (E < 0.12), water, deep
  pits and night remain fully safe, and shade-drain still works there — recovery is
  always available. Heat-wave visuals: `vignette` warm tint slightly earlier
  (weather.js can nudge the same smooth used for vignette via airAdd only — keep it
  simple: the hotter heat does it naturally), plus a subtle heat-shimmer: scale the
  existing sky brightness rather than post-processing (no new shaders).
- The R-key recall (return to `lastShade`) and water/pit drains are untouched — the
  event squeezes the *margin*, not the escape hatches. NPC flavor: skip (scope).
- `once('wx-heat', …)` when first exposed above 60 heat: "This is the heat the world
  died of. Respect it."

## Difficulty guarantees (implement as literal checks)

- Combined caps: `WX.strain` and boosted `heatMul` never apply together (one event at
  a time by construction). Wind shove hard-capped at 2.5 m/s ground / 3 m/s air —
  below WALK speed, so the player can always make headway and can never be blown off
  a ledge while standing still (shove only applies when `hSpeed > 0.3` or airborne?
  No — simpler and safer: cap at 2.5 and trust WALK ≈ 4+; verify WALK in core.js and
  keep the cap ≤ 60 % of it).
- Every event's danger has a zero-cost counter the game has already taught: dust →
  any roof/pit/deep canopy; storm → stay below the canopy line, or embrace it to cool
  off; heat wave → deep shade/water/pits/T-to-dusk.
- Faints from weather use the existing heatstroke/blackout paths (wake in last shade)
  — never a death spiral, `lastShade` is by definition sheltered.
- No event starts during a trial or story carry; `?wx=` exists so the verifier can
  check each event headlessly (console line on activation).

## Touch points (complete list)

1. `index.html` — `<script src="weather.js">` (before story.js, which stays last);
   `<span id="wx">` beside the clock.
2. `main.js` — loop: `updateWeather(dt, time)` right after `updateSky` (guarded
   `!SHOT` + typeof); fog near/far lines multiplied by `WX.fogNearMul/fogFarMul`
   (safe-defaulted if WX undefined).
3. `player.js` — `stepPlayer`: flood slowdown + wind shove; `stepHeat`: `heatMul`,
   `airAdd`, `shadeSafeE`, dust strain via `weatherShelter()`.
4. NEW `weather.js` — everything else: WX mixer, scheduler, three events, particles,
   thunder/rain/wind audio (all `AC`-gated, `sfxChime` idiom), lightning + strike
   tell, HUD label/glyph swaps, `?wx=` hook.
5. **No changes** to core.js, story.js, inventory.js, puzzles.js, entities.js,
   or worldgen files.
