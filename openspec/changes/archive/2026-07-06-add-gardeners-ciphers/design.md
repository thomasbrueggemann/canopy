## Context

Two coupled systems ship in two files, loaded in `index.html` as `story.js → inventory.js → puzzles.js → main.js` (main last, running the loop). `inventory.js` (~266 lines) is a generic satchel that later scripts extend; `puzzles.js` (~822 lines) is "The Gardeners' Ciphers": five marker-less caches plus a cog-vault, aimed at adults. Both follow the house pattern: `'use strict'`, a state object, a per-frame `updateX(dt,time)` driver, pure-hash finders run only at phase transitions, pooled markers, and `localStorage` persistence with no soft-locks. This document codifies the shipped behavior; where the original design markdown and the code diverge, the code is authoritative.

## Goals / Non-Goals

**Goals:**
- Capture the determinism, persistence keys, and no-soft-lock guarantees of both systems.
- Record the cross-file touch points and the verbatim runtime rules that make each puzzle solvable and unlookuppable.

**Non-Goals:**
- No code changes (retroactive codification).
- Spoiler-safe: no concrete puzzle answers in the spec. Every answer (dial digits, carillon melody, shadow tip, decoded keyword, season order, vault turning) is derived at runtime from real geometry or fixed narrative and belongs to the code, not the requirements.

## Decisions

### Satchel (inventory.js)
- Registry `ITEMS` + `INV_SAVE = { v:1, items, notes, pagesAt }`, persisted at `localStorage['canopy.inv']`. `items[id]` is the count; `notes[id]` is the resolved per-session examine text (clues are load-bearing).
- API globals consumed by puzzles.js and the story display: `invRegister`, `invAdd(id,n,note)` (fires a `msg()` toast), `invHas`, `invCount`, `invRemove`, `invNote`. Unknown ids are ignored until registered — this is why puzzles.js can register waybills/cogs/rubbings/mantle without inventory.js knowing what they are.
- Panel `#satchel`: `KeyI` toggles (only when `started`), `Tab` cycles (`satchelCycle()` returns true only when open, so `player.js` calls `preventDefault()` only then). The examine box shows `desc` + resolved `note`; empty state "Nothing but leaf-dust."; game keeps running while open (by design).
- Story items are **read-only virtual rows** computed from `STORY_SAVE` (shards / key / seed), typeof-guarded because story.js loads after inventory.js. They never write story state.

### Journal pages — deviation from the original design
- Design said page hosts are "shrine niche or fern circle." Shrine niches/greenhouse skeletons are **not** distinctly registered in `colData`, and worldgen is frozen, so the shipped host predicate reads the oddities that *are* in resident `colData`: **fern circles (`colData.ferns`) or chime poles (`colData.chimes`)**, gated by `hash2(ix,iz,9101)%5===0`. Deterministic and session-stable.
- Collected pages persist as absolute chunk keys `pagesAt = ['ix,iz', ...]`; `items.page = pagesAt.length`. Page props are a 4-mesh pool synced over the 3×3 resident chunks reading built `colData` only (never `peekColData`). Twelve pages → gold msg + `pressedflower` keepsake; page number = collection order; entries 9–12 gloss the vault cog order (soft cross-link).

### Ciphers (puzzles.js)
- State `ciph` (live) + `CIPH_SAVE = { v:1, met, solved{c1..c5}, mantle, attempts{...} }` at `localStorage['canopy.ciphers']`. `ciph.loc` holds this session's finder-computed positions/truths, filled once by `ciphLocate()`; after that the per-frame `updatePuzzles` never peeks a chunk.
- Gate `summited === true`. Fully parallel to the Second Seed (no ordering either way).
- **Marker-less invariant:** the Ciphers never touch `activeObjective` or the `#mission` panel; all feedback is `hint()`/`msg()`. This is the difficulty.
- Interact priority: `player.js` tries `storyInteract()` then `puzzleInteract()` then `inventoryInteract()` then ladders/trials — so a story NPC wins ties, then the Tinker/caches, then journal pickups. `puzzleInteract()` consumes E near a cache/vault/stone/shadow-tip while `updatePuzzles` does the actual lock work off key edges.
- SHOT mode: `ciphDevJump` returns early; `updatePuzzles` is only called `!SHOT`; `sfxNote` is `AC`-gated. No Tinker, props, or audio in screenshots.
- Dev hooks: `?cipher=1..5` and `?cipher=vault` mirror `?story=N`; `?cipher=` logs `CIPHER1..5` truths to console for headless verification.

### The five caches (truth derivation — kept out of the spec requirements)
- **C1 Counting House** (plaza nearest Tinker): three-digit dial. d1 = `plazaCol.lamps.length % 10` (real lamps counted from `peekColData`); d2 = standing viaduct spans over one chunk `% 10`; d3 = the fern-circle figure. **Deviation:** worldgen draws fern-frond counts at a stream position puzzles.js cannot reach and worldgen is frozen, so d3 is a dedicated location-keyed hash `(8 + hash2(fern.ix,fern.iz,3221)%5)%10`, framed in-fiction as the Authority's recorded figure; hint #2 states it outright so the cache is always solvable. All three referenced places are the same ones the finders used, so world and answer cannot diverge.
- **C2 Carillon** (largest grove trunk): `carillonMap` is a deterministic shuffle guaranteed non-identity with the centre bar moved (never sorted low→high); `carillonMelody` is six notes with exactly one repeat. Muted/no-AC path shows a fixed register descriptor per note.
- **C3 Shadow Clock** (buried): window `dayT ∈ [0.6979, 0.7188]` with `sunDir.y > 0.05`; live tip `SPIRE.{x,z} − sunDir.{x,z}/sunDir.y·SPIRE.h`; within 6 m and `y<4` → 3-second hold-E dig. Recurs daily; T advances time.
- **C4 Glyph Ledger**: six stones chained from the Tinker (each 2–4 chunks, oddity-biased across styles); each grants `rubbingN` with pairing + next bearing. `CIPH_KEYWORDS` maps six fixed 6-letter words to anomaly kinds (code: RAVINE→sinkhole, MIRROR→reservoir, TITANS→colossus, BRIDGE→crossing, FALLEN→fallen, GARDEN→greenhouse — **differs from the design draft's word list**, code wins); choice is `hash2(SPIRE.cx,SPIRE.cz,4501)%6`; cache at the nearest anomaly of that kind to the Spire; opening is free.
- **C5 Four Seasons** (fallen-tower top): `generateSeasons(seed)` picks a secret permutation and greedily adds relational constraints (`before`, `immediate`, `not-first/last`, `non-adjacent`, and `nth` as a last resort), brute-forcing all 24 permutations until exactly one survives — a guaranteed unique solution.

### The Vault and Mantle
- Five sockets at the Spire north base. Cogs are dispensed in cache order (0..4) as the player seats them into the sockets they aim at; `evalVault` requires `seated[s] === s` — i.e. the fixed narrative turning **counting → song → shadow → glyph → season**, left to right, communicated by each cog's engraving. Wrong order ejects all five and adds an attempt.
- Reward `grantMantle`: `CIPH_SAVE.mantle = true`, global `ciphMantle = true`. Effects: `player.js`/`stepHeat` multiplies `heatRate` by `0.75` when `ciphMantle` (confirmed at `player.js` `mantleF`); `main.js`/`drawMinimap` draws oddity ticks when `ciphMantle`. Both re-applied on load.

### Cross-file touch points (read-only from these files' perspective)
- `index.html`: two script tags between `story.js` and `main.js`; `#satchel` panel DOM/CSS; `I — satchel` help line.
- `player.js`: `KeyI`/`Tab`; `puzzleInteract()` after `storyInteract()` and before the trial check; `stepHeat` `×0.75` when `ciphMantle`.
- `main.js`: loop calls `updateInventory`/`updatePuzzles` (guarded `!SHOT`); `drawMinimap` copper Tinker dot once met and oddity ticks when `ciphMantle`.
- `entities.js`: `'tinker'` NPC role mirroring `'archivist'`.

## Risks / Trade-offs

- [Fern-frond digit could not be counted from rendered geometry] → Derived from a location-keyed hash instead; framed in-fiction and backed by hint #2, so C1 is always solvable. Documented deviation.
- [Journal host oddity set narrower than the design draft] → Uses the oddities actually present in `colData` (ferns/chimes); still deterministic, session-stable, and 12 pages remain reachable.
- [Spire re-roll moves solved husks] → Solved flags persist independently of position; a moved husk simply appears opened/looted. Sanctioned tradeoff.
- [Marker-less caches could frustrate] → The hints ladder (attempts → hint → blunter hint) is the difficulty valve; locks are re-attemptable forever and no finder can dead-end (plaza fallback + cold note).
- [Vault order is fixed, not per-session] → It is the fixed narrative turning; the engravings communicate it and journal entries 9–12 gloss it. Treated as a rule, not a per-session secret; the spec references it abstractly.

## Migration Plan

Not applicable — the behavior already ships. This change only adds the archived specs.

## Open Questions

None — behavior is fixed by the shipped code.
