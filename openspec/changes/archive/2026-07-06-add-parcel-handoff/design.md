## Context

The ERRAND mission spawns a waiting receiver at the target district; on delivery the old
flow ran `completeMission → clearMissionMeshes → scene.remove(receiver)`, so the receiver
vanished the instant the parcel changed hands — an abrupt, immersion-breaking beat. The
shipped fix promotes the receiver into the real NPC system at the moment of delivery so
she can take the parcel and jog away like any other street-walker before the ordinary NPC
lifecycle retires her. This design records the HOW of that shipped behavior.

## Goals / Non-Goals

**Goals:**
- Turn the delivery into a readable beat: she takes the parcel, then leaves gracefully and
  corners out of sight.
- Reuse existing NPC idioms and assets entirely; add no materials, textures, or state.
- Retire her safely and never pop her out on-screen close to the player.

**Non-Goals:**
- No changes to the giver system, other NPC roles, or NPC density logic.
- No new persistence; no SHOT-mode behavior (`updateMissions` never runs there).

## Decisions

- **Promote the receiver into `npcs` with a new `'depart'` role at delivery.** Rather than
  a bespoke animation, `departReceiver(r)` pushes an npcs entry reusing the existing role
  fields (`axis/line/off/dir/speed/turnCd/stateT/faceYaw`) plus `takeT` for the take beat.
  `greetCd` is parked very high so the walk-greet pause never hijacks her, and `stateT` is
  a 30 s hard retirement budget in case she wedges. Alternative considered: keep her a
  standalone mannequin and hand-animate a walk — rejected as duplicated movement logic.
- **Spawn her with the chat/vendor arm rig.** `main.js` spawns the receiver with
  `makeNPCGroup(false, 'chat')` and keeps the whole `{g, anim}` pair; the waiting phase
  updates `.g.rotation.y` to face the player. The arm (`anim`) is required so she can reach
  out to receive, and later hug the parcel.
- **Shared parcel prop recipe.** The parcel is a `tplBox` scaled ~0.22×0.15×0.16 with the
  existing `npcPaperMat`, created once per handoff and parented into the arm group at the
  hand (local y ≈ −0.5) so it rises with the arm. `removeNPC` only `scene.remove`s the
  group, so the parcel leaves with her while the shared geometry/material stay live for the
  crates/papers that also use them — verified against `removeNPC`.
- **Take beat then getaway.** While `takeT > 0` (~1.15 s) she stands still, faces the
  player, and eases the arm to `rotation.x → −1.05` (the chat-gesture idiom). When it
  expires she picks the getaway street with the customer wander-off trick: a random axis, a
  `line` snapped to the 64-grid, an `off` of ~5.6–7.3, and `dir` = the sign that increases
  distance from the player along that axis.
- **Run reuses the walk mover and corners away.** With `moving = true` she advances along
  the axis, eases onto `line+off`, and at intersections (|along−grid| < 0.7, `turnCd`
  elapsed, ~55% chance) turns onto the perpendicular street, each time re-choosing `dir`
  away from the player so corners carry her out of sight. The arm eases to a carrying hold
  (`rotation.x → −0.35`). The shared post-role code (wall/trunk push-out, bob/waddle via
  `moving`, smooth facing) is what makes the run read as graceful.
- **Safe retirement.** The existing `d > 88` range cull retires her naturally (fog + canopy
  make 88 m genuinely out of sight). The 30 s `stateT` net only removes her when she is
  past 40 m; if it expires while she is still within 40 m it is extended (`stateT = 5`), so
  a determined chaser keeps her alive and she never pops out on-screen close by.

## Risks / Trade-offs

- [She could be removed on-screen if the budget expires while close] → The stuck-safety net
  only culls past 40 m; within 40 m it extends the budget instead.
- [A player could chase her forever] → She keeps running and cornering; the 88 m
  player-relative cull ends it once she opens distance, and she outlasts `stateT` while
  chased — bounded and harmless (she counts toward the crowd budget for ~20 s, like chase
  kids).
- [Cleanup race removing the departing NPC] → `main.js` nulls `m.receiver` before
  `completeMission`, so `clearMissionMeshes` cannot remove the now-independent NPC.

## Migration Plan

Retroactive codification only — the handoff is already implemented and shipped in
`entities.js` and `main.js`. No rollout/rollback steps. Reverting would restore the
static-mannequin removal on delivery.

## Open Questions

None — behavior is fixed by the shipped implementation and verified against the code.
