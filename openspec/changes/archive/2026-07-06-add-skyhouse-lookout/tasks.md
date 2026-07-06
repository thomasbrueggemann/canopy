> NOTE: These features are ALREADY IMPLEMENTED (or in flight per SKYHOUSE_DESIGN.md, which is
> treated as truth). This is a retroactive codification of shipped behavior into specs, so every
> task is checked as done.

## 1. Deck height

- [x] 1.1 `waytreeSpec` deckY base changed to `42 + hash2(ix,iz,7304) % 8` ([42,50))
- [x] 1.2 Salts and placement hashes (7301/7302/7303/7304/7305) left unchanged
- [x] 1.3 `[22,30)` comments updated wherever `deckY`/`7304` appear

## 2. Skyhouse structure (addWaytree rework)

- [x] 2.1 Tree crown drops below the deck (`addTree(…, deckY - 6, …)`)
- [x] 2.2 Bare mast trunk `deckY-7 → deckY+1` (r ~1.5) + `colData.trunks` push at `h = deckY` (freeclimbable)
- [x] 2.3 Floor plank disc r 3.2 + `lookout` pad `{r:3.0, y:deckY}`
- [x] 2.4 4–6 diagonal support struts from mast to deck rim
- [x] 2.5 Parapet posts + rail caps with the +x dock gap
- [x] 2.6 Full pitched roof at `deckY+2.8` on 6 posts + shade pad `{r:3.2, y:deckY+2.9}`
- [x] 2.7 Beacon mast to `deckY+7` with lamp head at ~`deckY+6.6` (replaces rim lamp)
- [x] 2.8 Old half-roof and rim-lamp code removed
- [x] 2.9 Lift `y1 = deckY` flows from the spec; guide rails to `deckY+1.8` clear the eaves

## 3. Pump retune

- [x] 3.1 `LIFT_PUMP 0.85 → 1.0`
- [x] 3.2 `LIFT_VMAX 2.6 → 3.2`
- [x] 3.3 Dock time verified ~18–24 s for a ~45 m ride at ~2 presses/s

## 4. Text and invariants

- [x] 4.1 `lookoutwalk` beat updated to the skyhouse text
- [x] 4.2 VANTAGE `checkSummit` extents confirmed to still cover the r 3.0 deck
- [x] 4.3 Ascent budget and ground-touch rule confirmed unaffected (`supportLayer 'lift'`)
