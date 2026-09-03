## 1. Stream A — render polish (post.js, core.js)
- [x] 1.1 post.js: HDR target, bright pass, blur, shafts, composite (ACES + sRGB), resize, P toggle, `?post=0`, fallback
- [x] 1.2 core.js: matVine translucency hook
- [x] 1.3 core.js: groundFacade hook on matBld + makeBldMaterial
- [x] 1.4 Verify shots 1–5 READY err=0; report px deltas and frame cost

## 2. Stream B — leaf-sail, glowseeds, session (player.js, sail.js, seeds.js, session.js)
- [x] 2.1 player.js: sail state, Space edge latch, unfurl/furl rules, glide physics, stall, landing rule, FOV/roll
- [x] 2.2 sail.js: sailTargets(), rig, audio, hints
- [x] 2.3 seeds.js: seedsIn, pool, pickup, cue, persistence, unlock ladder, seedsStatus/seedsNearby
- [x] 2.4 session.js: save/restore, ?fresh=1
- [x] 2.5 Numeric harness for sailTargets; shots 1–5 READY err=0 with unchanged px

## 3. Stream C — trials & journal (main.js, index.html)
- [x] 3.1 Ring-gate pool + setMark contract, relic orb variant, trial-master hover gate
- [x] 3.2 Countdown phase + beeps; timer urgent pulse + ticks
- [x] 3.3 trialBest persistence; completion/failure cards
- [x] 3.4 Canopy Run: course builder, rules, feasibility, order insertion
- [x] 3.5 Journal panel + J key; minimap seed dots
- [x] 3.6 Shots 1–5 READY err=0 with unchanged px; live checks per design §C8

## 4. Wrap-up
- [x] 4.1 README: sail, seeds, journal, P, Canopy Run
- [x] 4.2 `openspec validate awesome-pass`; archive
