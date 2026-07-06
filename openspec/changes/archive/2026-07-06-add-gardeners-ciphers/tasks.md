> Retroactive codification: the satchel (`inventory.js`) and the Gardeners' Ciphers (`puzzles.js`)
> already ship, with their touch points wired in `index.html`/`player.js`/`main.js`/`entities.js`.
> Every task below is already implemented and is checked to reflect existing truth.

## 1. Satchel — registry, API, persistence

- [x] 1.1 `ITEMS` registry + `INV_SAVE {v:1, items, notes, pagesAt}` persisted at `canopy.inv`
- [x] 1.2 API: `invRegister`, `invAdd` (with note + pickup toast), `invHas`, `invCount`, `invRemove`, `invNote`; unknown ids ignored
- [x] 1.3 On-load reconcile of derived page count/note from persisted `pagesAt`

## 2. Satchel — panel and input

- [x] 2.1 `#satchel` panel + CSS in `index.html`; `I — satchel` help line
- [x] 2.2 `KeyI` toggle when started; `Tab` cycle with `preventDefault` only when the panel owns the key (`player.js`)
- [x] 2.3 Rows show icon/name/×count; examine box shows desc + resolved note; empty-state message; non-blocking while open
- [x] 2.4 Read-only virtual story rows (shards/key/seed) computed from `STORY_SAVE`, never mutating story state

## 3. Satchel — ambient journal pages

- [x] 3.1 Deterministic host predicate: fern circle or chime pole in resident `colData` AND `hash2(ix,iz,9101)%5===0`
- [x] 3.2 4-mesh page-prop pool synced over 3×3 resident chunks using built `colData` only (no peek)
- [x] 3.3 Collect persists absolute chunk key, bumps stack, stores running journal note (page # = collection order)
- [x] 3.4 Twelfth page grants the `pressedflower` keepsake with a gold message

## 4. Ciphers — frame, Tinker, waybills

- [x] 4.1 `CIPH_SAVE {v:1, met, solved, mantle, attempts}` at `canopy.ciphers`; `ciph.loc` filled once by `ciphLocate`
- [x] 4.2 Summit gate; fully parallel to the campaign
- [x] 4.3 `'tinker'` role in `entities.js`; `ciphSyncTinker` spawn/cull; copper minimap dot once met
- [x] 4.4 First E hands over all five waybills with resolved clues; later E re-offers any missing and summarizes remaining
- [x] 4.5 Marker-less: never touches `activeObjective`/`#mission`; all feedback via `hint`/`msg`
- [x] 4.6 `puzzleInteract()` tried after `storyInteract()` and before the trial check (`player.js`)

## 5. Ciphers — no-soft-lock finders and hints ladder

- [x] 5.1 Every finder: primary → widened → plaza-nearest-Spire fallback with a "trail is cold" note
- [x] 5.2 Spire/Tinker-relative origins; solved flags persist even as husk positions move
- [x] 5.3 Attempts tracked; plaque re-read appends one hint after threshold 1, a blunter hint after threshold 2; never the raw answer

## 6. Ciphers — the five caches

- [x] 6.1 C1 Counting House: three-digit dial derived from real world features at the plaque's bearings; wrong third lock resets + attempt
- [x] 6.2 C2 Carillon: never-sorted bar→note shuffle + one-repeat melody; muted register-descriptor fallback; wrong strike resets + attempt
- [x] 6.3 C3 Shadow Clock: buried; late-afternoon window; live shadow tip; hold-E dig; recurs daily; T advances time
- [x] 6.4 C4 Glyph Ledger: six chained stones grant rubbings + next bearings; keyword→anomaly table (deterministic pick) places the cache; free open
- [x] 6.5 C5 Four Seasons: fallen-tower top; unique-solution constraint generator; wrong pull resets all + attempt

## 7. Ciphers — cogs, vault, Mantle

- [x] 7.1 Solving a cache grants one engraved cog; five cogs enable the vault
- [x] 7.2 Vault: five sockets; correct fixed-turning seating order (per engravings) opens; wrong order ejects + attempt
- [x] 7.3 `grantMantle`: heat-gain ×0.75 (`stepHeat`) + minimap oddity ticks; persisted and re-applied on load

## 8. Ciphers — shot mode and dev hooks

- [x] 8.1 SHOT: no updates, no Tinker, no audio
- [x] 8.2 `?cipher=1..5` and `?cipher=vault` jump with prerequisites and teleport; `?cipher=` logs computed truths to console
