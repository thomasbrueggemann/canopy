# CANOPY — Waytree winch lifts (supersedes the waytree-ladder part of LADDERS_DESIGN.md)

> **Amended by SKYHOUSE_DESIGN.md:** the lookout deck moved from canopy height
> ([22,30)) up to [42,50) — a skyhouse towering over the crowns — with a rebuilt
> treehouse structure and faster pump tuning. Lift mechanics below are unchanged.

Change of direction: waytrees no longer carry a rung ladder to the lookout. Instead each
waytree gets a **hand-cranked counterweight lift**: step onto a wooden lift platform at
the foot of the tree and **pump Q to crank up, C to crank down** until the platform docks
level with the treehouse deck. Discrete presses only — holding the key does nothing; the
climb is made of deliberate cranks.

**Scope guard:** ONLY the waytree ground→deck ladder is removed. The Spire south-face
ladder run and the fallen-tower ladder remain ladders (they are *structure* climbs), and
the whole ladder engine (colData.ladders, the latch state machine, ladderInteract,
ladderProxTick) stays for them. Do not delete ladder code; only the `addLadder` call
inside `addWaytree` goes away.

## Engine invariants (unchanged rules)

- Deterministic worldgen from `hash2`; new static geometry batched into the chunk build;
  collision via `colData`; no new textures; plain scripts, no modules.
- `waytreeSpec(ix, iz)` and `nearestWaytree` are untouched — every finder (crown-nest
  chapter, Ascent trial, VANTAGE errand) still targets the same deck positions.
- No new localStorage keys. Lift state is transient: a chunk rebuild parks the platform
  back at the ground rest position (documented, acceptable — resident chunks never
  rebuild under the player).
- `?shot=1..5` must still print READY err=0 (geometry changes fine; lifts never move in
  SHOT because nothing pumps them).
- RNG discipline: addWaytree is still called LAST in buildChunk; addLift's rng draws
  happen inside that same tail position, so no other chunk content shifts.

## 1. Worldgen (`worldgen-builders.js`: new `addLift`, edit `addWaytree`)

`addWaytree(B, colData, mini, rng, x, z, deckY, extraMeshes)` — gains the `extraMeshes`
parameter (buildChunk already has that array in scope for non-batched meshes, cf. the
reservoir water plane). It calls `addLift(...)` where it used to call `addLadder(...)`.

**`addLift(B, colData, rng, extraMeshes, x, z, deckY)`** — shaft on the +x side of the
trunk (where the deck railing already leaves its gap):

- Platform axis at `(px, pz) = (x + 3.6, z)` — trunk r is 2.1, platform r 1.15, so the
  platform's inner edge slightly overlaps the deck rim (deck r 2.6): stepping across at
  the top is seamless.
- **Static, batched into B.plain (wood/brass palette like the ladder used):**
  - Two guide rails: thin tall boxes (~0.1 side) at `(px, pz ± 1.25)`, from ground to
    `deckY + 1.8`.
  - A crossbeam joining the rail tops, and a small winch drum (short fat cylinder,
    brass/rust tint) under its center.
  - A taut hoist rope: one 0.04-thick box from the drum down to the ground.
  - A counterweight: a stone/rust block hanging on a second thin rope beside one rail,
    at mid-height (static visual — do not animate it).
- **Dynamic (the platform — one small THREE.Group per waytree, pushed to extraMeshes):**
  - Local origin = platform *top surface* at group y 0; the whole group is placed by
    setting `group.position.y = lift.y` (and .x/.z once, at build).
  - A plank disc (cylinder r 1.15, thickness ~0.22, top face at local 0), 4 short corner
    posts and a low rail ring on the two *rail* sides only (±z) — the ±x sides stay open
    so you walk on at ground and off at the deck. A small rope yoke (two thin boxes in a
    V) rising from the rim to a point ~2 m up sells the "hanging basket" read.
  - Geometry/material: prefer instantiating the same batch helper the chunk builders use
    to bake ONE static BufferGeometry with vertex colors and reuse `matPlain` (zero new
    materials, zero leak risk). If that helper can't be reused standalone, fall back to
    THREE primitives with ONE shared module-level material — NEVER a per-lift material
    (chunk disposal only disposes geometry, a per-lift material would leak).
- **Collision/state registration:**
  `colData.lifts.push({ x: px, z: pz, r: 1.15, y0: 0.28, y1: deckY, y: 0.28, v: 0, mesh: group })`
  - `y` = current platform-top height (starts at the ground rest, a low step-up).
  - `colData.lifts` initialized as `[]` in the buildChunk colData literal
    (worldgen-anomalies.js, mirror `ladders`), disposed with the chunk group like
    everything else.

`addWaytree` keeps: trunk, deck, deck pad (`layer 'lookout'`), railing posts (gap on +x —
now the lift dock, keep it), roof, beacon lamp. The minimap rung glyph for waytrees stays
as-is (it marks the waytree, not the ladder).

## 2. Player (`player.js`): riding + the pump

- `nearby.lifts` gathered in `collectColliders` (guarded like ladders); reset in the
  same length-zeroing line.
- **`updateLifts(dt)`** — called once per frame from `stepPlayer` (both the ladder-latched
  early path and the normal path must reach it, or call it from the frame loop in main.js
  right before stepPlayer; pick one call site, never two). For each lift in
  `nearby.lifts`: `v *= Math.exp(-1.4 * dt)`, `y += v * dt`, clamp y to `[y0, y1]`
  (hitting a clamp zeroes v; snap exactly onto the end when within 0.05), then
  `mesh.position.y = y`. Distant lifts (outside the 3×3) never move — nobody can pump
  them — so skipping them is correct, not an approximation.
- **Pump input (keydown handler, next to the other key bindings):** on `KeyQ` / `KeyC`
  with `started && !e.repeat` (auto-repeat MUST be ignored — holding does nothing, that
  is the mechanic): find the target lift = the one the player is riding, else the
  nearest lift within 3.2 m horizontally (any height difference — this is how you recall
  a stranded platform from the deck or the ground). If found: `lift.v += (Q ? +0.85 : -0.85)`,
  clamp v to ±2.6. First successful pump ever:
  `once('lift', () => msg('A counterweight lift, rope waxed and true. Crank steady — the lookouts belong to everyone.', 8, true))`.
- **Support & riding (in stepPlayer):**
  - In the vertical-support scan, lifts are support candidates exactly like pads
    (horizontal within r, feet within the same catch band), with
    `supportIsCanopy = true` and `supportLayer = 'lift'`. Track which lift grounds the
    player: `player.onLift = lift` (null when support comes from anything else or the
    player is airborne — but see carry below).
  - Add `lift: 1` to `SAFE_LEAF` — falling onto the platform is a caught landing.
  - **Carry (no jitter, both directions):** early in stepPlayer (after the ladder-latch
    block, before input/gravity), if `p.onLift` is set, the player is horizontally
    within `r + 0.15` of it, `|feet − lift.y| < 1.2`, and `p.vel.y <= 0.01`: snap
    `p.pos.y = lift.y`, `p.vel.y = 0` — the platform carries the player exactly, up or
    down, with no falling-state flicker, no fall-damage accumulation
    (`airPeakY` must track pos.y while carried), and no footstep/bob from vertical
    motion. Otherwise clear `p.onLift`. Horizontal movement is NEVER locked: walking or
    jumping off mid-ride is always allowed (the fall rules own the consequence), and
    Space jumps normally (the `vel.y <= 0.01` guard keeps the carry from eating the
    jump).
- **Proximity prompt — `liftProxTick(dt)`** (mirror ladderProxTick, same throttle
  pattern, called next to it): unlatched/unriding player within 3 m of a lift →
  `hint('the winch lift — step on · Q cranks up, C cranks down', 2.5)`. While riding
  and the platform is mid-shaft with |v| ≈ 0 for > 1 s → the same hint (once per ride),
  so nobody gets stranded not knowing the keys.
- **Ladder texts lose their waytree reference** (waytrees no longer have rungs):
  player.js's two `once('ladder', ...)` messages become
  `'Someone bolted these rungs on and keeps them oiled — the high places belong to everyone.'`

## 3. Gameplay integration (main.js — small text/logic touch-ups only)

- **Ascent trial:** no logic change needed — verify, don't rewrite. The ground-touch
  fail check (`p.supportLayer === null && !p.onCanopy && p.pos.y < 1.5`) already ignores
  the player standing on the lift platform (supportLayer 'lift'), so boarding at the
  bottom doesn't fail an armed run, and the time budget (vertical allowance 1.05 m/s)
  is comfortably met by a pumped lift (~1.5–2 m/s effective).
- **VANTAGE elder line (main.js ~line 133):** "take the rungs to the lookout" →
  "ride the lift to the lookout".
- **lookoutwalk beat (main.js ~line 1269):** "The rungs belong to everyone; the view
  belongs to whoever climbs." → "The lift-rope belongs to everyone; the view belongs to
  whoever cranks."
- Frame loop: only needed if `updateLifts` is called from main.js instead of stepPlayer
  (one call site, `active` path).

## Feel & fairness

- Pump tuning targets: from a standstill, ~2 presses/second sustains ~1.5–2 m/s; a 26 m
  deck is ~15–20 s of steady cranking — deliberate, but never finger-work-precise.
  Constants live together at the top of the lift block so they're one-knob tunable.
- Optional, only if trivial with the existing synth audio: a soft wooden clunk per pump.
- Weather gusts still nudge a rider (velocity shove is capped below WALK) — standing on
  a 1.15 m platform in a storm *should* feel exposed; the railing is visual.

## Touch points (complete list)

1. `worldgen-builders.js` — new `addLift`; `addWaytree` swaps addLadder→addLift and gains
   the extraMeshes param. addLadder itself: UNCHANGED.
2. `worldgen-anomalies.js` — colData literal gains `lifts: []`; the waytree call site
   passes `extraMeshes`. Spire/fallen ladder call sites: UNCHANGED.
3. `player.js` — nearby.lifts in collectColliders; updateLifts; Q/C pump keydown;
   support-scan lift candidacy + onLift carry; SAFE_LEAF.lift; liftProxTick; reworded
   ladder once-texts.
4. `main.js` — two string tweaks (elder line, lookoutwalk); updateLifts call only if not
   placed in stepPlayer.
5. **No changes** to core.js, story.js, puzzles.js, inventory.js, weather.js,
   entities.js, index.html, waytreeSpec/nearestWaytree.

## Verification

- Serve (`python3 -m http.server 8080`) and smoke-test all five shots headless:
  `chrome --headless=new --enable-unsafe-swiftshader --virtual-time-budget=6000 --screenshot "http://localhost:8080/index.html?shot=N"`
  must print `CANOPY_STATUS READY … err=0` for N=1..5.
- Static syntax check every touched file (`node --check`).
- Manual sanity (describe in the report, best-effort): a waytree chunk builds with rails
  + platform and no ladder; Spire chunk still has its ladder run.
