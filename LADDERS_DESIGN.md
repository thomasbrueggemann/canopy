# CANOPY — Waytrees, ladders & lookouts (forgiving mission climbing)

Problem: freeclimbing (hold W facing vines/trunks, pitch steering, mantle timing) is
too fiddly when a mission *requires* height. Fix: any climb the game *asks* you to make
gets a **ladder** — and ladders use a locked-in climb mode, not freeclimb physics.
Freeclimbing stays in the game unchanged as the expert/optional path.

Three pieces:
1. **Waytrees** — special mission trees: a great trunk with a rung ladder strapped to
   it and a **treehouse lookout** platform at canopy height (deck, railing, small
   roof, a lamp that glows at night). Deterministic worldgen furniture.
2. **Ladder lock-in** — E near a ladder latches the player onto it: no facing cone, no
   pitch tricks. W/S (or ArrowUp/Down) move up/down, Space hops off backward, E lets
   go, reaching the top auto-mantles onto the deck. Simple, safe, readable.
3. **Mission finder preferences** — the finders that currently pick "somewhere high"
   (story nest chapter, the Ascent trial, vantage errands) now prefer waytree
   lookouts; the two big *structure* climbs (the Spire, the fallen tower) get
   deterministic ladder runs bolted onto them in worldgen.

## Engine invariants (unchanged rules)

- Deterministic worldgen from `hash2`; all new geometry batched into the chunk build
  like every other builder; collision via `colData`; no new textures; plain scripts.
- No per-frame `peekColData`; finder changes only at phase transitions.
- No new localStorage keys (everything here is deterministic worldgen or transient).
- `?shot=1..5` must still print READY err=0 (chunk content changes are fine — the
  smoke test checks render health, not pixels).

## 1. Worldgen: waytrees, and ladders on the big climbs

New builders in `worldgen-builders.js`, called from the chunk assembly code:

- **`addLadder(B, x, z, y0, y1, nx, nz)`** — a rung ladder against a vertical face:
  two thin side-rails + rungs every 0.45 m (thin batched boxes, wood palette). `nx,nz`
  is the outward facing normal (the side the player hangs on). Registers a climb
  volume in **`colData.ladders`**: `{x, z, y0, y1, nx, nz}` (a vertical line segment +
  normal; the latch logic does the rest). Rung count bounded; ladders longer than
  ~16 m are built as stacked segments with a small rest platform (1.6 m radius pad,
  layer `'lookout'`) every ~14 m so long climbs read as deliberate routes.
- **`addWaytree(B, rng, x, z)`** — a waytree: one thick tall trunk (existing trunk
  idiom, registered in `colData.trunks` as usual), a ladder from ground to deck
  height (pick the trunk's canopy height, ~L2, 22–30 m), and the **lookout**: a round
  or hexagonal plank deck (`colData.pads` entry, `layer: 'lookout'`, r ≈ 2.6),
  railing posts around the rim (visual only), a small pitched roof on posts above
  half the deck (visual only — it must NOT register a solid, so the deck stays mostly
  sky-open and lookouts still work as vantage points; the roof quarter gives real
  shade via one small `colData.pads` disc at roof height if trivial, else skip shade),
  and a lamp at the deck edge (`colData.lamps` so it glows at night like street lamps).
- **Placement:**
  - **Grove chunks:** `hash2(ix, iz, 7301) % 3 === 0` → one waytree near the chunk's
    biggest trunk position (offset a few metres so it doesn't intersect). Every third
    grove — common enough to be findable, rare enough to stay special.
  - **Park chunks:** `hash2(ix, iz, 7302) % 4 === 0` → one waytree.
  - **The Spire chunk:** a ladder run up the spire's south face, ground to summit,
    stacked segments with rest platforms (this is the big one — the main early-game
    goal becomes climbable by anyone; the vine faces stay for purists).
  - **The fallen-tower anomaly:** one ladder from the ground to the top of the fallen
    slab (its top is a story/cache target). Find the slab's top height in the
    existing builder and bolt the ladder to its high end.
- `colData.ladders` must be initialized (empty array) everywhere colData is created
  (worldgen-chunks.js) and disposed with the rest — mirror `chimes`.

## 2. Player: the ladder latch (player.js)

State: `player.onLadder = null | {lad, side}`.

- **Latch:** `ladderInteract()` global, wired into the E-chain **after** story/
  puzzles/inventory interacts and **before** the trial-master check: find the nearest
  ladder (from `nearby.ladders`, gathered in `collectColliders` from the 3×3 chunks)
  whose horizontal distance to its climb line is < 1.6 m and whose span contains
  (or is within 1.5 m of) the player's feet. Latch: snap the player to the climb line
  offset 0.55 m along the normal, zero velocity, `onLadder = lad`.
  Also **auto-hint**: when unlatched and a ladder is within 2.2 m, `hint('E — climb
  the ladder', 2)` (throttled via a timer, not every frame).
- **While latched** (early in `stepPlayer`, bypassing normal move/gravity):
  - W/ArrowUp climbs up, S/ArrowDown climbs down at `CLIMB_SPEED * 1.25` (ladders are
    faster than vines — they're the comfortable path). No facing requirement at all.
  - A/D do nothing. Gravity off. Heat/exposure still ticks normally.
  - **Top-out:** feet ≥ `lad.y1 - 0.3` while climbing up → auto-mantle: place the
    player 0.9 m inward (−normal) at `y1 + 0.05`, small upward pop, unlatch. Lands on
    the deck/rest platform pad.
  - **Bottom-out:** feet ≤ `lad.y0 + 0.05` while climbing down → unlatch, grounded.
  - **Space:** hop off backward (+normal · 2.5, vy 3) and unlatch. **E:** let go in
    place (falls — from high up that's the player's own choice; the fall rules
    already handle it). Latch again anytime.
- **Falling past a ladder does NOT auto-latch** (no surprise catches), but latching
  while airborne within the catch radius IS allowed — a deliberate E mid-fall next to
  a ladder is a save, which feels great and is always intentional.
- `SAFE_LEAF` gains `lookout: 1` — falling onto a treehouse deck is a caught landing
  (kindness beats realism here; these are the casual route).
- Freeclimb code path: untouched.

## 3. Mission integration (finder preferences, each with the old behavior as fallback)

- **story.js — the crown-nest chapter (`findNestPad`):** prefer the nearest waytree
  lookout (scan resident/ring chunks for a grove/park chunk passing the waytree hash
  and compute its deck position — a pure-hash predicate + deterministic offset, no
  peeking needed if the deck position is derivable from (ix,iz); make the builder
  derive waytree position/height from `hash2` of the chunk so finders can recompute
  it without building the chunk). Fallback: existing nest-pad behavior.
- **puzzles.js — Cache 5 (Four Seasons, fallen-tower top):** unchanged finder — the
  fallen tower now *has* a ladder by worldgen, so the climb is solved by the world.
- **main.js — the Ascent trial:** its target prefers a waytree lookout when one is in
  range (same recomputable-position trick); the time budget is the challenge, not the
  finger-work. Fallback: existing target.
- **main.js — VANTAGE errand:** if the target chunk hosts a waytree, the vantage
  point is the lookout deck. Fallback: existing roof target.
- **Spire summit:** no logic change — the ladder run simply exists; `checkSummit`
  already fires on arrival however you got there.
- **Minimap (optional, cheap):** a tiny rung glyph for waytrees in resident chunks
  once the player has stood on any lookout (`once`-style session flag). Skip if it
  clutters.

**Recomputable waytree spec (the key trick):** waytree existence AND its exact
`(x, z, deckY)` must be pure functions of `(ix, iz)` via `hash2` — e.g.
`wx = ix*CHUNK + 20 + hash2(ix,iz,7303)%24`, similarly z, `deckY = 22 +
hash2(ix,iz,7304)%8`. The builder places the waytree from this function, and finders/
trials recompute it without touching chunk data. Export it as a shared global
`waytreeSpec(ix, iz) → null | {x, z, deckY}` (defined in worldgen-builders.js,
callable from story.js/puzzles.js/main.js).

## Feel & fairness details

- Hint the mechanic once: first time a ladder hint shows, `once('ladder', …)`:
  "Waytrees. Someone keeps the rungs oiled — the lookouts belong to everyone."
- Ladder rungs/rails use the wood/brass palette already in the hamlet builders.
- Lookout decks are pads → they shade the ground below them slightly (0.75 pad
  attenuation) — negligible and fine.
- Lamps on decks make waytrees visible at night from a distance (navigation beacons).
- No change to trial *timings* — ladders make Ascent tier times *achievable by
  design* rather than by freeclimb mastery; if playtesting shows gold is now too
  easy, that's a later tuning knob, not this change.

## Touch points (complete list)

1. `worldgen-builders.js` — `addLadder`, `addWaytree`, `waytreeSpec` global.
2. `worldgen-chunks.js` — `colData.ladders` init/dispose; call sites for grove/park
   waytrees if chunk assembly lives here (else in worldgen-anomalies.js `buildChunk`).
3. `worldgen-anomalies.js` — Spire south-face ladder run; fallen-tower ladder;
   grove/park waytree calls if `buildChunk` lives here.
4. `player.js` — `nearby.ladders` in `collectColliders`; latch state machine in
   `stepPlayer`; `ladderInteract()` in the E-chain (after inventory, before
   trial-master); proximity hint; `SAFE_LEAF.lookout`.
5. `story.js` — `findNestPad` waytree preference (small, fallback-wrapped).
6. `main.js` — Ascent target + VANTAGE target waytree preference (small,
   fallback-wrapped); optional minimap glyph.
7. **No changes** to core.js, inventory.js, weather.js, index.html, entities.js.
