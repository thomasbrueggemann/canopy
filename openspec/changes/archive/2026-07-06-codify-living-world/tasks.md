> Retroactive codification of existing code: every task below was already implemented in the
> working tree (`entities.js` people/animals/vignettes and the `main.js` hamlet residents)
> before this change was written. All tasks are checked; nothing remains to build.

## 1. Citizens

- [x] 1.1 Density formula round(lerp(5,17,dayF)) with market ×1.4 and ashen ×0.5 modifiers, 0.12 spawn roll, over-target thinning
- [x] 1.2 Street-grid spawning (22–75 m, canal tow-path lanes) and day/night role rosters with kid scaling
- [x] 1.3 Walker street movement, intersection turns (55%, 4–8 s cooldown), greet pause, bob/waddle, smooth facing
- [x] 1.4 Chat pairs (partner spawn, 4–9 s speaker swap, arm gestures, disband), sweeper (broom + scraps), tender, lantern-carrier
- [x] 1.5 Vendor+customer stall vignette and chasing-kids vignette with SHOT suppression
- [x] 1.6 Trunk/solid collision push-out
- [x] 1.7 88 m range cull with partner unlinking and giver demotion
- [x] 1.8 Hidden Hamlet residents (spawn within 1.7 chunks, fire pit + platform anchors, facing, elder thank-you)

## 2. Wildlife

- [x] 2.1 Pool caps and day/night rosters with opacity fades
- [x] 2.2 Cats: perimeter walk / sit / flee state machine on building edges
- [x] 2.3 Boars: green-chunk rooting wander with home tether
- [x] 2.4 Frogs: water-rim parabolic hops clamped to the water
- [x] 2.5 Leapers: pad scamper and squash-stretch pad-to-pad leaps
- [x] 2.6 Bird flocks: two vertex-animated flap meshes on curved wrapping paths; SHOT single anchored flock
- [x] 2.7 Bats: night jink flight near working lamps, speed/altitude clamps
- [x] 2.8 Raptor: landmark-centred circling at altitude

## 3. Ambient life

- [x] 3.1 Global wind state (two-sine gust + swell envelope) and shared foliage UV wobble
- [x] 3.2 Pollen and firefly drifters with player-box wrap, night blink, deepgreen ×1.8 glow
- [x] 3.3 Smoke pool at hearth anchors with downwind bend, fog-blend dissipation, dusk-peaked visibility
- [x] 3.4 Sweeper leaf-scrap pool
- [x] 3.5 Night swinging-lantern glow pool
- [x] 3.6 Morning drip pool at span undersides on the dew factor
- [x] 3.7 Wind-driven two-panel banner pool with per-anchor hues
- [x] 3.8 Pooled/anchor-driven/allocation-free architecture (nearest-N scans over resident chunks, parked slots)

## 4. Verification

- [x] 4.1 `openspec validate codify-living-world` passes with no errors
