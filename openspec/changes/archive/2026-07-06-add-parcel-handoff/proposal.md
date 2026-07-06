## Why

The ERRAND mission ("Carry the parcel to <district>") ended abruptly: the waiting
receiver was a bare static mannequin, and on delivery `completeMission` →
`clearMissionMeshes` removed her the instant the parcel changed hands, so the person
vanished mid-handoff. This change retroactively codifies the shipped fix: on delivery she
visibly takes the parcel and then jogs off down the street, turning corners until she is
out of sight, at which point the ordinary NPC lifecycle retires her.

## What Changes

- On delivery, promote the receiver into the live NPC system with a new `'depart'` role
  instead of removing her.
- Give her a brief "take" beat — she faces the player and reaches out an arm, and a parcel
  prop appears in her hand — before she leaves.
- Have her run off gracefully: pick a getaway street that opens distance from the player,
  jog along it, and corner at intersections (re-choosing direction away from the player
  each turn) while hugging the parcel, until the existing range cull retires her.
- Reuse existing idioms only (the pivoting-arm gesture, the street-walker mover + turns,
  the wander-off re-line trick, bob/waddle, wall/trunk push-out, the range cull) and one
  shared parcel prop recipe — no new materials, textures, or persistence.
- Retire her safely: never pop her out on-screen close to the player; only retire on the
  stuck-safety budget once she is far enough away.

## Capabilities

### New Capabilities
- `parcel-delivery`: The ERRAND receiver's waiting, parcel-handoff, graceful departure
  run, and safe retirement behavior.

### Modified Capabilities
<!-- None: the giver system, other NPC roles, and NPC density logic are untouched. -->

## Impact

- `entities.js`: shared parcel prop recipe, `departReceiver()`, and the `'depart'` role
  branch in `updateNPCs`.
- `main.js`: the ERRAND branch of `updateMissions` keeps the whole `{g, anim}` receiver
  pair (spawned with the chat/vendor arm rig), updates its waiting-phase facing, and on
  delivery calls `departReceiver` before `completeMission` (nulling the reference first so
  cleanup cannot remove the now-departing NPC).
- No changes anywhere else; no new materials/textures, no localStorage. SHOT is unaffected
  (`updateMissions` never runs there).
