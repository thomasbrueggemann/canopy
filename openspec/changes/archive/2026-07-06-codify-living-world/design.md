## Context

Retroactive codification. The crowd, wildlife, and vignette systems already ship in
`entities.js` (with the hamlet residents in `main.js`); these specs document the working
tree as-is. All three systems share one architecture: small fixed pools, spawn-near /
cull-far, behaviors as cheap per-frame state machines, anchors read from build-time chunk
`colData`.

## Goals / Non-Goals

**Goals:**
- Pin down the player-observable contracts: density formulas, role behaviors, spawn bands,
  cull distances, day/night rosters, wind coupling.
- Pin down the performance contracts that keep the systems cheap: pooled meshes, one draw
  call per particle system, resident-chunk-only anchor scans, no per-frame allocation.

**Non-Goals:**
- Mesh construction details (merged box geometries, flap-mesh vertex layout) and material
  colours — implementation, not contract.
- Worldgen anchor *placement* (which buildings get chimneys, where stall anchors go) — the
  engine-side worldgen specs own what exists; these specs consume the anchors.

## Decisions

- **Density is a formula, not a table**: `want = round(lerp(5, 17, dayF))`, ×1.4 in day
  markets, ×0.5 in ashen chunks — so crowd feel tracks the day-night cycle continuously.
- **Cull distances are tiered by silhouette size**: citizens 88 m (fog hides them there),
  ground animals 74 m, leapers 78 m, bats wrap at 44 m, flocks at 70 m. The 88 m citizen
  cull doubles as the retirement mechanism for the parcel receiver (parcel-delivery) and
  the demotion path for a stranded giver (errands).
- **Roles are data on one NPC record**, not classes: every citizen carries the same field
  set (axis/line/off street state, timers, partner, anim handle) and behaviors switch on
  `role`, which is why promotion (giver), conversion (customer→walk, chat→walk) and
  hand-off (receiver→depart) are one-field writes. Specs describe the observable behavior
  per role and leave the record layout free.
- **Scripted vignettes gate on SHOT** (chase kids, vendor stalls, boars/leapers spawn
  rolls) because they are randomness-heavy; deterministic SHOT casts are placed explicitly
  by the preset code instead. One flock is anchored in SHOT for the same reason.
- **Wind is global and read-only**: one state advanced once per frame; consumers never
  mutate it. Foliage animates by shared UV offset because batched chunk geometry cannot be
  animated per-vertex without a re-upload.
- **Anchor scans reuse scratch arrays** (`_nc`, `_pick`/`_pickD`, `_perim`) — the
  allocation-free invariant is specced because breaking it shows up as GC hitches.
- **No persistence anywhere** in this change's systems: crowds, animals, and vignettes are
  session-ephemeral by design (the hamlet residents' *thank-you* gate reads the trials
  capability's persisted flag but writes nothing).

## Risks / Trade-offs

- Spawn probabilities (0.12 citizens, 0.03–0.05 animals) are per-frame and therefore
  frame-rate dependent; at very high refresh rates worlds populate slightly faster. Judged
  acceptable and left as-is; specs cite the probabilities as documentation, not as
  rate-invariant guarantees.
- The 88 m citizen cull is load-bearing for parcel-delivery's "never pop on-screen"
  requirement; lowering it below fog distance would violate that spec first.
- Chat-pair partner unlinking on cull relies on `removeNPC` clearing both sides; a missed
  path leaves a vendor gesturing at nobody (mitigated by the vendor's pack-up timer, which
  the citizens-npcs spec captures).
