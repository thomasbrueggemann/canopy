# CANOPY — The parcel handoff (ERRAND receiver takes the package and runs off)

Problem: the ERRAND mission ("Carry the parcel to <district>") ends abruptly — the
waiting receiver is a bare static mannequin (`makeNPCGroup(false,'tend').g` added
straight to the scene in main.js), and on delivery `completeMission` →
`clearMissionMeshes` → `scene.remove(receiver)` — the person vanishes the instant the
parcel changes hands. Fix: on delivery she **takes the parcel** (a visible arm-out beat,
the parcel appearing in her hand) and then **runs off gracefully down the street,
turning corners, until she is out of sight** — at which point the ordinary NPC lifecycle
retires her.

## Approach: promote the receiver into the real NPC system at the moment of delivery

The waiting phase stays as-is (spawn at d<55 at the target, rotate to face the player).
On delivery the group is handed to `npcs` with a new role `'depart'`, whose behavior
lives in `updateNPCs` beside the other roles. Everything reuses existing idioms: the
pivoting-arm gesture (chat/vendor), the street-walker movement + intersection turns
(walk), the wander-off re-line trick (customer, entities.js ~353-357), the bob/waddle
`moving` path, wall/trunk push-out, and the existing d>88 range cull.

## 1. entities.js

- **Receiver body gets an arm:** the waiting receiver must be spawned with the
  chat/vendor pivoting arm so she can reach out. Cleanest: main.js spawns her with
  `makeNPCGroup(false, 'chat')` (same cloak body; `anim` = the arm) — see §2.
- **Parcel prop:** module-level shared mesh recipe — `tplBox` scaled ~0.22×0.15×0.16
  with the existing `npcPaperMat` (pale waxcloth read; NO new material). Created once
  per handoff, parented into the arm group at the hand (local y ≈ −0.5), so when the
  arm raises, the parcel visibly sits in her hand. Removed with the NPC (shared
  geometry/material — removeNPC's scene.remove is enough; verify removeNPC doesn't
  dispose shared resources).
- **`departReceiver(r)` global** (r = the `{g, anim}` pair main.js kept): pushes an
  npcs entry
  `{ g: r.g, anim: r.anim, role: 'depart', axis: 0, line: 0, off: 0, kid: false,
     dir: 1, speed: 3.1 + Math.random() * 0.4, phase: Math.random() * 7, turnCd: 2,
     stateT: 30, greetCd: 1e9, faceYaw: r.g.rotation.y, takeT: 1.15 }`
  and attaches the parcel to the arm. (greetCd parked at 1e9 so the walk-greet pause
  never hijacks her; stateT 30 s is the hard retirement budget in case she wedges.)
- **`'depart'` branch in updateNPCs:**
  - **Take beat (`takeT > 0`):** stand still, face the player
    (`faceYaw = atan2(player − pos)`), ease the arm out to receive:
    `anim.rotation.x → −1.05` (the chat-gesture idiom, rate ~8·dt). When takeT
    expires, pick the getaway street exactly like the customer wander-off: axis =
    whichever of |pos.x − player.x| / |pos.z − player.z| is larger is NOT required —
    random axis is fine; `line = 64 * Math.round((axis===0 ? pos.x : pos.z)/64)`;
    `off = (Math.random()<0.5?−1:1) * (5.6 + Math.random()*1.7)`;
    **`dir` = the sign that increases distance from the player** along the run axis
    (`sign((axis===0 ? pos.z−player.z : pos.x−player.x)) || 1`).
  - **Run:** `moving = true`; movement identical to the walk role (advance along axis
    at n.speed, ease onto line+off, turn at intersections when |along−grid| < 0.7 and
    turnCd elapsed — ~55% chance to take the perpendicular street, re-choosing `dir`
    away from the player each turn so she always opens distance and corners take her
    out of sight). faceYaw follows the run direction like the walker. Arm eases to a
    carrying hold (`anim.rotation.x → −0.35`) — she runs hugging the parcel.
  - **Retire:** the existing `d > 88` cull removes her naturally (fog + canopy make
    88 m genuinely out of sight); `stateT <= 0` → removeNPC as a stuck-safety net.
  - The shared post-role code (wall/trunk push-out, bob/waddle via `moving`, smooth
    facing) applies unchanged — that's what makes the run read as graceful.

## 2. main.js (ERRAND branch of updateMissions, ~lines 259-267, + spawn/cleanup refs)

- Spawn keeps the WHOLE pair: `m.receiver = makeNPCGroup(false, 'chat');`
  `m.receiver.g.position.set(...); scene.add(m.receiver.g);`
  (waiting-phase facing updates `m.receiver.g.rotation.y`).
- `clearMissionMeshes` removes `m.receiver.g` (unchanged semantics — only reached if
  the errand ends WITHOUT delivery: fail/abandon/trial-preemption).
- Delivery: at `d < 4 && m.receiver`:
  `if (typeof departReceiver === 'function') { departReceiver(m.receiver); m.receiver = null; } completeMission('Delivered. Her sister folds a sprig of glow-moss into your palm — "safe roads, wanderer." ');`
  — nulling first so clearMissionMeshes can't remove the now-departing NPC. Keep the
  existing gold line text exactly.

## Invariants & edge cases

- SHOT mode: updateMissions never runs in SHOT — no impact; `?shot=1..5` must still
  print READY err=0.
- Trials/story/puzzles untouched. No new materials or textures; one shared parcel prop
  recipe. No localStorage.
- She counts toward the ambient crowd budget for ~20 s — harmless (chase kids do too).
- Player chasing her: she just keeps running/turning; cull at 88 m from the PLAYER
  means a determined chaser keeps her alive — fine, she outlasts stateT (30 s) and
  retires then. If retirement while on-screen bothers, retire on stateT only when
  d > 40; otherwise extend stateT by 5 s (small kindness, implementer's choice — note
  what you did).
- The giver system (`giver`), other roles, and NPC density logic untouched.

## Touch points (complete list)

1. `entities.js` — parcel prop recipe, `departReceiver`, `'depart'` role branch in
   updateNPCs.
2. `main.js` — receiver spawn keeps {g, anim} (role 'chat'), waiting-phase rotation via
   `.g`, clearMissionMeshes via `.g`, delivery branch calls departReceiver before
   completeMission.
3. **No changes** anywhere else.

## Verification

- `node --check` on both files.
- Headless smoke test shots 1..5 print `CANOPY_STATUS READY … err=0` (serve on a free
  port — port 8080 on this machine belongs to an unrelated project; do not touch it).
- Logic check (run it, don't hand-trace): a small node harness stubbing THREE.Group-ish
  objects + player position that drives the 'depart' state through updateNPCs-extracted
  math is likely overkill; instead verify the direction-picking + intersection-turn
  snippet in isolation: from a receiver at (10, 0, 30) with player at (10, 0, 26), the
  chosen dir must move her away (+z if axis 0 ... axis 0 advances z: dir = sign(30−26)=+1 ✓),
  and after a simulated 25 s at 3.1 m/s with turns she must be > 60 m from the start.
  Report the numbers.
