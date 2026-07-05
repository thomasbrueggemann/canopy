# CANOPY — The Gardeners' Ciphers (inventory + adult-level puzzle expeditions)

Design for two new systems layered onto the existing game, in two new files:

- **`inventory.js`** — a real inventory ("the satchel"): item registry, counts, examine
  texts, a HUD panel, persistence. Examine texts are load-bearing: several puzzles put
  their clues *on items*, so reading your inventory is part of play.
- **`puzzles.js`** — "The Gardeners' Ciphers": a post-Spire expedition campaign of five
  sealed Authority caches, each locked by a different genuinely tricky puzzle, plus a
  final cog-vault at the Spire. Aimed squarely at adults: no minimap markers for
  solutions, answers derived from the real, deterministic world (counting real lamps,
  listening to real notes, chasing a real shadow), so nothing can be looked up.

Script order in `index.html`: `... story.js → inventory.js → puzzles.js → main.js`?
No — main.js is already last and must stay last (it runs the loop). Insert both **after
`story.js` and before `main.js`**: `story.js → inventory.js → puzzles.js → main.js`.
Both files follow the house pattern: `'use strict'`, plain script (no modules), state
object + per-frame `updateX(dt, time)` switch, pure-hash finders **only at phase
transitions**, pooled markers, `localStorage` persistence, no soft-locks.

## Engine invariants (verbatim rules — do not violate)

- Deterministic per-chunk generation from `hash2(ix, iz, salt)`; batched geometry;
  collision via per-chunk `colData` arrays (`solids`, `trunks`, `pads`, `lamps`,
  `ferns`, `chimes`, `pits`, `waters`); `CHUNK = 64`, chunk centre `ix*CHUNK+32`.
- `SPIRE` is re-randomized every session. Anything anchored to the world must be either
  (a) recomputed per session from `SPIRE` (ring-scan finders, the story.js precedent) or
  (b) keyed to absolute chunk coords `ix,iz` (stable across sessions — the hamlet-pages
  precedent). Solved-state persists; positions may move between sessions. That is fine.
- Finders: Chebyshev ring scans using `hash2`/chunk-type predicates, run **only at phase
  transitions**, never per frame. `peekColData(ix,iz)` builds a throwaway chunk — never
  call it per frame. Every finder needs a widened-radius fallback; if all fails, degrade
  gracefully (point at a safe default, tell the player "the trail is cold") — **no
  mission may soft-lock, ever**.
- Markers/props: pooled meshes only (see `STORY_POOL` in story.js). Never leak meshes.
  Props near the player are synced/culled like trial-masters, not added in `buildChunk`.
- Messages: `msg(text, secs, gold)`, `hint(text, secs)`, `once(key, fn)`.
- Priority chains: E-interact = story NPC > **puzzles** > trial-master > errand giver.
  Objective/HUD = trial > errand > story > SPIRE. **The Ciphers never touch
  `activeObjective` or the `#mission` panel** — being marker-less is the difficulty.
  All puzzle feedback goes through `hint()`/`msg()`.
- `SHOT` mode (`?shot=`): no puzzle updates, no Tinker spawn, no audio (`AC` is never
  created in SHOT). Guard with `!SHOT` exactly as `updateTrials`/`updateStory` are.
- Dev hooks required: `?cipher=1..5` (grant prerequisites, teleport near that cache) and
  `?cipher=vault` (grant five cogs, teleport to the Spire door) — mirroring `?story=N`.
- No new textures. Materials: flat `MeshLambertMaterial`/`MeshBasicMaterial` in the
  existing palette idiom; reuse `tplBlob`-style low-poly prop geometry.

---

# PART 1 — The Satchel (inventory.js)

## Data model

```js
// Registry: static item definitions. `examine` may be a function (clue text is often
// per-session, derived from hash2/SPIRE at grant time — store the *resolved* string in
// the save instead when so, see waybills below).
const ITEMS = {
  page:      { name: 'Gardener’s journal page', icon: '❧', stack: true,
               desc: 'A leaf-pressed page in a steady hand.' },
  rubbing:   { ... }, cog: { ... }, waybill1: { ... }, /* etc. — puzzles.js registers
               its own items via invRegister(id, def) so inventory.js stays generic */
};
let INV_SAVE = { v: 1, items: {}, notes: {} };   // items: id -> count
                                                 // notes: id -> resolved examine text
```

- Persistence: `localStorage['canopy.inv']`, same try/catch idiom as `canopy.story`.
  inventory.js self-bootstraps (worldgen never reads it, so no core.js change needed).
- API (globals, consumed by puzzles.js and story display):
  `invRegister(id, def)`, `invAdd(id, n=1, note)` (note = resolved examine text stored in
  `notes`; also fires a toast `msg('+ '+name (+count when stacked))`),
  `invHas(id, n=1)`, `invCount(id)`, `invRemove(id, n=1)`, `invNote(id)`.
- **Story items appear read-only**: the panel appends virtual rows computed from
  `STORY_SAVE` — shards (`✶ Beacon shard ×N`), the Warden's key, the Second Seed — so the
  satchel shows everything you carry without touching story.js logic.

## UI — the satchel panel

- `#satchel` panel in `index.html` (house `.panel` styling, right side, hidden by
  default): a title row ("SATCHEL — I to close · Tab to leaf through"), an item list
  (icon glyph + name + ×count, selected row highlighted), and an examine box beneath
  showing the selected item's `desc` + resolved note. Keep it readable at 12px HUD scale.
- Input (player.js): **KeyI** toggles the panel (only when `started`); **Tab** cycles
  selection while open (`e.preventDefault()` so focus never leaves the canvas). The game
  keeps running while reading — heat, time, everything. That's flavor, not a bug.
- Empty state: "Nothing but leaf-dust." The panel never blocks E/movement.
- Overlay help line: add `I — satchel` to the keys list in `index.html`.

## Ambient collectibles — the Gardener's journal (the "collect pieces" floor)

Twelve journal pages hidden at Tier-3 oddities. Deterministic and session-stable:

- Spawn rule: a chunk carries a page iff it has a shrine niche or fern circle (readable
  from its `colData` / build parameters) **and** `hash2(ix, iz, 9101) % 5 === 0`.
- Persist collected pages as absolute chunk keys: `INV_SAVE.pagesAt = ['ix,iz', ...]`;
  `invCount('page') = pagesAt.length`. Page prop: a small pale quad/blob at the shrine
  niche shelf / fern-circle centre, synced from a 4-mesh pool over the 3×3 player chunks
  (per-frame check of already-resident `chunks` colData only — no peeking).
- Each page's examine text: 12 short journal entries (write them — the Gardener's voice,
  foreshadowing the Ciphers and the Second Seed). Page number = order collected.
- At 12 pages: gold msg + grant item `pressedflower` ("Her bookmark. It still smells of
  green.") — a keepsake, no mechanical power. The *reading* is the reward; entries 9–12
  hint at the vault cog order (soft cross-link for attentive readers).

---

# PART 2 — The Gardeners' Ciphers (puzzles.js)

## Frame

- Gate: `summited === true` (same as the story). Fully parallel to the Second Seed;
  no ordering dependency either way.
- Giver: **the Tinker**, a new NPC (entities.js role `'tinker'`, mirror the `'archivist'`
  role wiring — a seated figure with a tool-bench prop). Location per session: centre of
  the nearest `city`-type chunk with district style `'works'` from the SPIRE (ring scan,
  fallback: any city chunk, fallback: the plaza nearest SPIRE). A small brazier lamp so
  she reads at night. Minimap: a copper dot (`#e0a05a`) once met.
- First E on the Tinker: intro dialogue (msg sequence), then she hands over **all five
  waybills at once** (inventory items `waybill1..5`, each with a *resolved* examine text
  — the clue). Nonlinear: the player picks any cache in any order. Each solved cache
  yields one **cog** (+ a lore msg). Five cogs → the Spire vault opens (below).
- State: `const ciph = { met, solved: {c1..c5}, cogs, mantle, attempts: {...} }`,
  persisted `localStorage['canopy.ciphers']` (v:1). Cache *positions* recomputed each
  session (finders below); solved caches respawn as opened/looted husks.
- Props: one shared `CIPH_POOL` (≤10 pooled meshes) for cache strongboxes, plaque
  stubs, glyph stones, the vault door dressing. Caches are small root-bound strongboxes
  (dark box + brass lid strip + a plaque stub in front); opened = lid rotated, gold gone.
- Interact: global `puzzleInteract()` returning true if consumed; player.js tries it
  **after** `storyInteract()` and **before** the trial-master check.
- Per-frame `updatePuzzles(dt, time)` from the main loop (guarded `!SHOT`, after
  `updateStory`): syncs the Tinker + nearby props, runs the active lock interaction
  state machines, journal-page pool sync (or keep pages in inventory.js's own small
  update called from updatePuzzles — implementer's choice, one loop call total).
- Hints ladder (every puzzle): each cache tracks `attempts`; after 3 failures,
  re-reading the plaque (E on the plaque stub) appends one deterministic extra hint;
  after 7, a second, blunter one. Never the raw answer. This is the difficulty valve —
  adults get stuck productively, not permanently.

## The five caches

Waybills locate caches with **words, not markers** — `bearingPhrase()` + landmark
descriptions ("south-southwest of my bench, where the viaduct crosses the canal").
Distances given in "blocks" (chunks), the Ch4 heliograph idiom.

### Cache 1 — The Counting House (observation + arithmetic)
- **Where:** the plaza chunk nearest the Tinker (ring scan; fallback widened).
- **Lock:** a 3-digit brass dial. Plaque: *"The Authority kept only final figures.
  First: the lamps that ring this square. Second: the standing spans of the nearest
  viaduct due [bearing]. Third: the great ferns in the ring at [bearing], two blocks."*
- **Truth:** digits computed at setup (phase transition) from real `colData`:
  `plazaLamps % 10`, viaduct-span count over one chunk of the nearest viaduct line
  `% 10`, fern count in the nearest fern-circle chunk `% 10`. The player must
  physically go and count real objects. All three referenced places are picked by the
  same finders that computed the truth, so the world and the answer can't diverge.
- **Interaction:** aim at the dial, E clicks the current digit +1 (soft tick sfx),
  hold E ≥ 0.6 s to lock a digit and advance; `hint('◈ 3 · 7 · _', 4)` shows the row.
  Third lock evaluates: wrong → heavy clunk, dial resets, `attempts++`.
- **Hints:** (3) "Lamps: only those on this square's own ground — the Authority did not
  count its neighbours'." (7) states one digit outright.

### Cache 2 — The Carillon (audio + deduction)
- **Where:** the grove chunk nearest the Tinker, at its largest trunk.
- **Prop:** the strongbox with a carillon frame above it — **five brass chime bars**
  side by side. Aim-based selection (nearest bar to the crosshair ray), E strikes: the
  bar swings and plays its note (triangle-osc, the `sfxChime` idiom, one pure note).
- **Truth:** bar→note mapping is a deterministic *shuffle* of the pentatonic five
  [C5 D5 F5 G5 A5] — not left-to-right ascending, so you must listen. The five notes
  carry fiction names: **Rain (C, lowest), Root (D), Crown (F), Ash (G), Star (A,
  highest)**. A **bell-card** item (on a hook beside the frame, E to take) teaches the
  name→pitch order. The plaque gives the required melody as names, 6 strikes with one
  repeat, deterministic, e.g. *"Root · Star · Rain · Root · Crown · Ash."*
- Wrong strike → discordant buzz, sequence resets, `attempts++`. Correct sequence →
  a little four-note fanfare (reuse `sfxTrialDone` shape) and the lid opens.
- **No-audio fallback (also the accessibility path):** if `!AC || muted`, striking a bar
  shows `hint()` with a poetic register descriptor — "a low, round tone" (C) … "a high,
  bright tone" (A) — five distinct fixed descriptors. Listening is still the intended
  path; the text keeps it solvable muted.
- **Hints:** (3) "Two bars trade places near the middle of the row." → nudges that the
  shuffle isn't sorted. (7) names the leftmost bar's bell outright.

### Cache 3 — The Shadow Clock (time + space, uses the real sun)
- **Where/what:** waybill only: *"The Spire keeps the Authority's last appointment.
  Stand at the very tip of its shadow at seventeen hundred, and dig."* No prop until
  solved-condition met — the cache is buried.
- **Truth:** during the window `17:00 ± 15 min` (dayT ∈ [0.6979, 0.7188]), compute the
  live shadow tip: `tip = (SPIRE.x − sunDir.x/sunDir.y·SPIRE.h, SPIRE.z −
  sunDir.z/sunDir.y·SPIRE.h)` (guard `sunDir.y > 0.05`). Player within **6 m** of the
  tip, on ground (`y < 4`), starts a 3-second hold-E "dig" channel (the Ch7 plant
  idiom). Complete → the strongbox surfaces at that spot (prop appears, opens free).
- **Play:** the player pushes time with T, watches the real shadow crawl, chases the
  tip. The shadow is *actually rendered* by the sun/shadow system, so the honest
  strategy — go stand in the shadow's point at five o'clock — just works. Tricky part
  is realizing T exists for this and reading the light. If the tip lands unreachable
  (inside a solid), accept the dig anywhere within 6 m horizontal at any standable
  spot — the radius forgives it. Window recurs daily — never soft-locks.
- **Hints:** (3, from re-reading the waybill) "The day is yours to hurry — hold T."
  (7) "At seventeen hundred the shadow points east-northeast, long as the tower is
  tall — pace it out from the Spire's foot."

### Cache 4 — The Glyph Ledger (chain hunt + substitution cipher)
- **Structure:** six **glyph stones** chained across the city, then a decode.
  Waybill gives stone 1 plainly (bearing + blocks from the Tinker: the nearest shrine
  niche chunk). Each stone, on E, grants a **rubbing** item *and* shows the bearing
  phrase to the next stone (also stored as the rubbing's note — the satchel keeps the
  trail, a deliberate teach-the-inventory beat). Stones 2–6: ring-scan picks across
  ≥ 3 different district styles / chunk types (shrine niches, greenhouse skeletons,
  chime poles — Tier-3 oddities), each 2–4 chunks from the previous, fallbacks widened.
- **Cipher:** each rubbing's examine text shows one pairing, `⊕ = R` style (six glyphs
  from a fixed set of ~10 unicode-safe glyphs rendered as text sprites/plaque label —
  keep glyphs in the *item text*, the stone prop itself is just a carved stone blob).
  The waybill's tail carries the coded line: six glyphs spelling a location keyword.
- **Truth:** keyword picked deterministically from a fixed table mapping word → finder:
  `RAVINE→sinkhole, MIRROR→reservoir, GIANT→colossus, BRIDGE→viaduct-canal crossing,
  SLEEPER→fallen tower, GLASSHOUSE→greenhouse skeleton`. (Choose 6-letter-unique words
  or allow repeated glyphs — implementer's pick; table words are fixed, the *choice*
  is `hash2(SPIRE.cx, SPIRE.cz, 4501) % 6`.) Decoded word names an anomaly type; the
  cache sits at the nearest such anomaly to the Spire (existing story.js finder
  idioms — reuse/adapt `findVaultSinkhole`, `findReservoir`, `findCrossing`...).
  Opening is free — the hunt and the decode were the lock.
- **Hints:** (3, plaque on stone 6) "The Authority wrote places, not names." (7) "Six
  letters. It holds water — or held people. Read your rubbings side by side."

### Cache 5 — The Four Seasons (pure logic, generated with a unique solution)
- **Where:** the top of the fallen-tower anomaly nearest the Tinker (reuse
  `findFallenTop` idiom) — the climb is the entry fee.
- **Prop:** strongbox + four root-knot levers in a row, tagged with season glyphs
  (Sowing, Bloom, Harvest, Frost — plaque icons ✿ ☀ ❦ ❄ as label text).
- **Lock:** pull all four in the one correct order. Plaque states three constraint
  lines, e.g.: *"Frost wakes before Harvest. The Sowing is neither first nor last.
  Bloom follows Frost at once."* Wrong pull at any step → all knots reset, attempts++.
- **Generation (the crux — must be airtight):** pick the secret permutation via hash.
  Build the clue set from constraint templates — `A before B`, `A immediately after B`,
  `A not first/not last`, `A and B not adjacent`, `A is Nth` (use sparingly) — filled
  against the secret order. Brute-force all 24 permutations after each added clue; keep
  adding (deterministically, seeded walk over the template list) until exactly **one**
  permutation survives, then stop (typically 3 clues, allow 4). Deterministic in, unique
  solution out — test this generator in isolation for all 24 secret orders.
- **Hints:** (3) restate one clue more plainly. (7) reveal the first season outright.

## The Vault — the Gardeners' Door (meta-puzzle + reward)

- **Where:** the north face of the Spire's base — a great root-grown door (pooled prop
  dressing against the existing spire geometry, no worldgen change).
- **Lock:** five brass sockets. Each cog (granted on cache completion) is engraved —
  its examine text is an oblique self-placement riddle, e.g. *"I turn first, before
  any rain falls"* / *"I follow the counting of lamps"* / *"Between the song and the
  seasons, I."* The engravings reference the *fictional identities* of the five caches
  (counting/ song/ shadow/ glyphs/ seasons), and the required socket order is a
  deterministic permutation. Aim at a socket, E seats the *selected satchel cog*? No —
  simpler and fair: E on the door seats cogs one at a time in the order the player
  chooses via which socket they aim at; each cog auto-picks (they're interchangeable
  in hand — the *order of seating* is the answer, socket 1→5 left to right). Wrong full
  order → all five pop out with a clang, attempts++. (3 fails → one engraving is
  glossed; 7 → two.) Journal pages 9–12 also gloss two engravings — cross-system reward.
- **Reward:** the door sinks into the root mass (prop animates down over ~4 s, deep
  synth rumble), revealing an alcove with the **Gardener's Mantle** on a stand. E to
  take (gold msg): *"Woven from parasol-leaf. The sun forgets you a little."*
  - **Mechanical effect:** body-heat gain × 0.75 (player.js/`stepHeat`: multiply
    `heatRate` when `ciphMantle` global is true) — meaningful in the Scorch, not
    trivializing. Shown in the satchel as equipment (§ icon, non-removable).
  - **Cartographic effect:** the minimap now draws Tier-3 oddity ticks (shrine, chime
    pole, fern circle) for resident chunks — the world opens up for the collector who
    still wants journal pages.
  - Persist both on `canopy.ciphers` (`mantle: true`); apply on load.

## Failure & no-soft-lock audit (implement all of these)

- Every finder: primary scan → widened scan → safe default (plaza nearest SPIRE) +
  waybill note appended: "(The trail is cold — she marked the nearest square instead.)"
- All locks re-attemptable forever; attempts only ever *add* hints.
- Shadow window recurs daily; T makes any wait ≤ ~40 s real time.
- The Tinker re-offers any waybill if the item is somehow absent (`invHas` check on E).
- Nothing here can strand the player: no carry debuffs, no timers, no heat overrides.

## Dev / test hooks

- `?cipher=N` (1–5): set `summited`, mark Tinker met, grant waybills, run that cache's
  finder immediately and teleport the player ~20 m from the cache (`?story=N` idiom).
  `?cipher=vault`: grant 5 cogs, teleport to the Spire door.
- Log the computed truths to console under `?cipher=` only (e.g. `CIPHER1 3·7·2`,
  `CIPHER5 order=✿❄☀❦`) so the verifier can check answers headlessly.
- `?shot=1..5` must still print READY with identical behavior (no Tinker, no props,
  no updates in SHOT mode).

## Touch points (complete list — keep to exactly these)

1. `index.html` — two script tags (`inventory.js`, `puzzles.js` between `story.js` and
   `main.js`); `#satchel` panel DOM + CSS; overlay help line `I — satchel`.
2. `player.js` — KeyI toggle + Tab cycle (preventDefault) in keydown; `puzzleInteract()`
   tried after `storyInteract()`, before the trial-master check; `stepHeat` heat-gain
   × 0.75 when the Mantle global is set (typeof-guarded like `storyCarrying`).
3. `main.js` — loop: `if (!SHOT && typeof updatePuzzles === 'function')
   updatePuzzles(dt, time);` after `updateStory`. `drawMinimap`: Tinker copper dot once
   met; oddity ticks when Mantle held.
4. `entities.js` — `'tinker'` NPC role in `makeNPCGroup` (mirror `'archivist'`).
5. New files: `inventory.js`, `puzzles.js`. **No changes to core.js or worldgen files.**
