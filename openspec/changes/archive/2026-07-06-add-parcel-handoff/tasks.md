# Tasks

> NOTE: This feature is ALREADY IMPLEMENTED and shipped (`departReceiver` + the `'depart'`
> role in `entities.js`, and the ERRAND branch of `updateMissions` in `main.js`). These
> tasks are a retroactive codification of the existing behavior; all items are checked to
> reflect the shipped state.

## 1. Receiver waiting phase (main.js)

- [x] 1.1 Spawn the receiver with the arm rig (`makeNPCGroup(false, 'chat')`) once the player is within range, keeping the whole `{g, anim}` pair
- [x] 1.2 Rotate the waiting receiver to face the player each frame via `.g.rotation.y`

## 2. Handoff on delivery (main.js)

- [x] 2.1 On reaching the receiver, call `departReceiver` then null `m.receiver` before `completeMission` so cleanup cannot remove her
- [x] 2.2 Keep the existing gold reward line on completion
- [x] 2.3 Ensure `clearMissionMeshes` still removes the receiver only when the errand ends without delivery (fail/abandon/preemption)

## 3. Parcel prop and departReceiver (entities.js)

- [x] 3.1 Build the shared parcel prop recipe (`tplBox` ~0.22×0.15×0.16 with `npcPaperMat`), parented into the arm at the hand
- [x] 3.2 `departReceiver(r)` pushes a `'depart'` npcs entry (speed ~3.1–3.5, `stateT` 30, `greetCd` parked, `takeT` 1.15) and attaches the parcel
- [x] 3.3 Confirm `removeNPC` frees the parcel with the group without disposing the shared geometry/material

## 4. The 'depart' role branch (entities.js)

- [x] 4.1 Take beat: stand still, face the player, ease the arm out to receive (`rotation.x → −1.05`)
- [x] 4.2 On take-beat end, pick the getaway street (random axis, grid-snapped line, off ~5.6–7.3) with `dir` opening distance from the player
- [x] 4.3 Run via the walk mover; corner at intersections (~55%) re-choosing `dir` away from the player; hug the parcel (`rotation.x → −0.35`)
- [x] 4.4 Retire via the `d > 88` cull; `stateT` net removes only past 40 m, otherwise extends (never pops on-screen close)

## 5. Verification

- [x] 5.1 `node --check` on `entities.js` and `main.js`
- [x] 5.2 Headless smoke shots 1..5 print `CANOPY_STATUS READY … err=0`
- [x] 5.3 Direction check: receiver at (10,0,30) with player at (10,0,26) picks `dir` = +z (away); after ~25 s at ~3.1 m/s with turns she is > 60 m from start
