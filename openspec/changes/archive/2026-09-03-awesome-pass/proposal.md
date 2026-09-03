## Why

CANOPY already has a deep world, a campaign and six trials, but three things hold it back from
"super awesome": (1) the picture is flat — no bloom, vines read as black cut-outs against lit
facades, buildings float on the street with no grime or contact shadow; (2) the traversal
verbs stop at climb/jump — a vertical city with a leaf-roof begs for flight; (3) the trials
are text-and-blob affairs — a floating icosahedron for a target, a one-line message on
completion, no sense of a *course* or a *record* to beat.

## What Changes

- **Post-FX pipeline** (`post.js`): scene renders to an HDR target; a half-res bloom, sun
  shafts when the sun is on screen, a filmic grade and a soft vignette composite to the
  canvas. ACES + sRGB move into the composite pass. `P` toggles it; SHOT stays deterministic.
- **Vine translucency**: `matVine` gains the same back-scatter hook `matLeaf` has.
- **Grounded facades**: the four building materials darken and green toward the street in a
  0–3.5 m band (grime/AO), and sills cast a faint streak below them.
- **Leaf-sail gliding** (`player.js` + `sail.js`): press Space mid-air to unfurl a leaf-sail;
  steer with the mouse, dive by looking down, flare by looking up. Soft landings, FOV widen,
  roll into turns, a first-person leaf-wing rig, wind rush audio. Heavy loads ground you.
- **Glowseeds** (`seeds.js`): deterministic collectibles on high rooftops and canopy pads.
  Collected set persists. 25 / 50 seeds upgrade the sail's glide ratio.
- **Session persistence** (`session.js`): position, facing, and time of day survive a reload.
- **Trial overhaul** (`main.js`, `index.html`): pooled **ring gates** replace blob markers,
  a **3-2-1-GO countdown** with beeps precedes timed trials, a **completion / failure card**
  shows medal, time and best, **best times** persist per trial and tier, the timer pulses and
  ticks under ten seconds, and a new **Canopy Run** trial threads eight gates through
  boughs, weaves and rooftops (built for the sail).
- **Journal** (`J`): a panel listing trials with medals and best times, errands, vantages,
  glowseeds and the next unlock, and campaign progress.

## Capabilities

### New Capabilities
- `post-fx`: HDR render target, bloom, sun shafts, grade, vignette, toggle, SHOT determinism.
- `leaf-sail`: unfurl/furl rules, glide physics, camera feel, rig, audio, landings, upgrades.
- `glowseeds`: deterministic placement, pooled visuals, pickup, persistence, unlock ladder.
- `session-persistence`: what is saved, when, and how it is restored (and `?fresh=1`).
- `journal`: the J panel and what it lists.

### Modified Capabilities
- `trials`: ring gates, countdown, cards, best times, timer pulse, Canopy Run in the ladder.
- `player-movement`: mid-air Space semantics (jump on ground, sail in the air), FOV/roll.
- `minimap-hud`: faint glowseed dots within map range; journal key in the intro table.

## Impact

- New files: `post.js`, `sail.js`, `seeds.js`, `session.js`. Script tags in `index.html`.
- `core.js`: vine translucency hook, facade grounding hook. `player.js`: sail physics,
  Space semantics, landing rule. `main.js`: trial section, minimap dots, journal, render hook.
- No worldgen rng draws are added anywhere (see [[worldgen-rng-vertex-coupling]]): all new
  placement uses `hash2` and existing colData; the world layout does not re-roll.
