## Why

CANOPY shipped two coupled adult-facing systems — a real inventory ("the satchel") in `inventory.js` and a post-Spire expedition of five sealed Authority caches ("The Gardeners' Ciphers") in `puzzles.js` — whose difficulty comes from being marker-less: answers are derived from the real, deterministic world (counting real lamps, listening to real notes, chasing the real shadow), so nothing can be looked up. This change retroactively codifies both as archived specs so their genuinely tricky, no-soft-lock mechanics are captured as behavioral truth without hardcoding any puzzle answers.

## What Changes

- Codify the satchel: item registry API, counts, load-bearing examine texts, the HUD panel with its toggle/cycle input, read-only story-item rows, and persistence.
- Codify the ambient Gardener's journal: 12 deterministic session-stable pages at Tier-3 oddities, running journal notes, and the keepsake granted at 12.
- Codify the Ciphers frame: the summit gate, the Tinker giver who hands over all five waybills, nonlinear cache solving, cogs, the hints ladder, and marker-less feedback (never touching the objective/mission panel).
- Codify the five caches by their *puzzle type and rules* — counting-house dial, carillon melody, shadow-clock dig, glyph-ledger chain-and-decode, four-seasons logic lock — and the meta cog-vault, without hardcoding any per-session answer.
- Codify the Gardener's Mantle reward: its heat-gain reduction and cartographic (oddity-tick) effect, and persistence.

This is a **retroactive codification** of already-implemented behavior; no code changes are proposed.

## Capabilities

### New Capabilities

- `satchel-inventory`: the item registry/API, the satchel panel and its input, read-only story rows, the ambient journal-page collectible floor, and `canopy.inv` persistence.
- `ciphers`: the Gardeners' Ciphers expedition — summit gate, the Tinker and waybills, the five caches' locks and truth-derivation, the hints ladder, no-soft-lock finders, the cog-vault meta-puzzle, and the Mantle reward.

### Modified Capabilities

<!-- none — both are brand-new capabilities -->

## Impact

- New specs: `openspec/specs/satchel-inventory/spec.md` and `openspec/specs/ciphers/spec.md`.
- Describes shipped behavior in `inventory.js` and `puzzles.js` and their read-only touch points: `index.html` (script tags between `story.js` and `main.js`, `#satchel` panel), `player.js` (KeyI/Tab, `puzzleInteract()` before the trial check, `stepHeat` mantle multiplier), `main.js` (loop calls, minimap Tinker dot + oddity ticks), `entities.js` (`'tinker'` role).
- No runtime behavior changes; documentation/spec only.
