## Why

CANOPY had no through-line: the world generated endless districts and anomalies but nothing that gave the player a reason to tour them or a story that ended. "The Second Seed" is a 7-chapter campaign — already shipped in `story.js` — that turns the whole generated world into one arc: recover the pieces, decode the route, open the Root Vault, and re-green the Scorch. This change retroactively codifies that shipped system as an archived spec so the campaign's gates, finders, rewards, and persistence are captured as behavioral truth.

## What Changes

- Codify the campaign giver (**the Archivist**) at a deterministic Spire-base anchor, its post-summit gate, and its role as the between-chapter objective spine.
- Codify the 7-chapter progression: Ch1 Dead Broadcast, Ch2 Shards of Noon, Ch3 Flooded Archive, Ch4 Heliograph, Ch5 Warden's Key, Ch6 Root Vault, Ch7 Scorch Bloom — each as chapter-start conditions, phase transitions, and completion checks.
- Codify the puzzle mechanics that are structural (not fetch): sun-gated shard glinting, the Heliograph noon-fire bearing derivation, the vault knot-order puzzle, the 3-second plant channel.
- Codify carry effects (Seed disables sprint and fouls the flashlight), the no-soft-lock finder/fallback guarantee, and coexistence with trials/errands (pause without progress loss).
- Codify persistence (`canopy.story`) and the two permanent world changes: the planted oasis sapling and the relit Spire beacon, plus the Seedbearer minimap reward.

This is a **retroactive codification** of already-implemented behavior; no code changes are proposed.

## Capabilities

### New Capabilities

- `story-campaign`: The Second Seed — the giver NPC, post-summit gating, chapter progression and phase logic, story puzzle mechanics, carry effects, HUD/objective priority, no-soft-lock finders, persistence, and the permanent finale rewards.

### Modified Capabilities

<!-- none — this is a brand-new capability -->

## Impact

- New spec: `openspec/specs/story-campaign/spec.md`.
- Describes shipped behavior in `story.js` and its read-only touch points: `core.js` (`STORY_SAVE`, `storyPlantedAt`, `storyComplete`), `player.js` (E-interact priority, carry sprint/flashlight), `main.js` (loop call, objective priority, minimap oasis + Seedbearer icons), `entities.js` (`'archivist'` role), `worldgen-anomalies.js` (sapling + relit beacon), and `index.html` (script tag).
- No runtime behavior changes; documentation/spec only.
