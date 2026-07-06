> Retroactive codification of existing code: every task below was already implemented in the
> working tree (`main.js` missions/trials/summit blocks and their cross-file contacts) before
> this change was written. All tasks are checked; nothing remains to build.

## 1. Errands

- [x] 1.1 Giver designation loop (2.5 s scan, 30 m pick, 34 m drop), marker, minimap dot, accept via E
- [x] 1.2 Archetype feasibility picker (SUNRUN/VANTAGE/LAMP gates, ERRAND always) with accept-time errand fallback
- [x] 1.3 VANTAGE waytree-preferred targeting, summit box check, session vantage pins
- [x] 1.4 SUNRUN two-stage out/back with lastShade home and heat-98 fail
- [x] 1.5 LAMP 4–5 lamp course, 3.2 m wake, pooled flames, nearest-unlit retarget, nightF > 0.55 fail
- [x] 1.6 ERRAND district target ~2 chunks out; handoff delegated to parcel-delivery; receiver nulled pre-completion
- [x] 1.7 Complete/fail plumbing (cooldowns 6–12 s / 8–14 s, mesh cleanup, objective reset) and mission HUD
- [x] 1.8 SHOT-mode gating (updateMissions never called)

## 2. Trials

- [x] 2.1 TRIAL_ORDER unlock ladder + Rumor after-any-two gate
- [x] 2.2 Tier ladder (bronze/silver/gold, 1.35/1.15/1.0) with `canopy.trials` persistence
- [x] 2.3 Deterministic trial-master spec (plaza %2, city %17), 3×3 sync/cull, facing, minimap dots
- [x] 2.4 Offer flow: seeded preference, feasibility checks, blocker steering, all-gold bow
- [x] 2.5 Time budgets from course ÷ sprint speed × slack × tier
- [x] 2.6 Course rules: Courier rooftop, Track deck gate + 3 checkpoints + y<7 fail, Ascent arm/ground-fail/rings, Salvage relic + fouled flashlight, Freefall ascend/drop
- [x] 2.7 The Rumor three-clue chase, marker-less final leg, story-discovery short-circuit
- [x] 2.8 Hidden Hamlet discovery event (25 m proximity or Rumor), `canopy.hamlet`/`canopy.hamletErrand`, elder thank-you
- [x] 2.9 Abandon (hold G 0.9 s), completion fanfare, all-gold sprint boost with `canopy.sprintboost`
- [x] 2.10 Trial HUD (timer colours, "· · ·" untimed), pooled TRIAL_POOL markers, SHOT gating

## 3. Summit goal

- [x] 3.1 Spire as idle objective and label; reversion on mission/trial end
- [x] 3.2 Objective priority trial > errand > story > SPIRE via loop order + storyPaused
- [x] 3.3 First-summit detection, `canopy.summited` persistence, Spire vantage pin
- [x] 3.4 Two-beat summit message, campaign/ciphers unlock flag, Spire-vantage errand completion
- [x] 3.5 One-time Spire approach hint (26 m, ground level)

## 4. Verification

- [x] 4.1 `openspec validate codify-missions-trials` passes with no errors
