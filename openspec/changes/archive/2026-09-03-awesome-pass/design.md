# awesome-pass — design

This document is the authoritative spec for three parallel implementation streams. Each
stream owns a disjoint set of files; cross-stream contact happens ONLY through the
interfaces in §0. Anything not listed there must be `typeof`-guarded on the consuming side.

Non-negotiables for every stream:

- **No new worldgen rng draws.** `Batch.addGeo` draws `rng()` per vertex from the chunk
  stream; any builder change that adds vertices or `rng()` calls re-rolls the whole world.
  New placement uses `hash2(ix, iz, salt)` with a fresh salt, or reads existing `colData`.
- **SHOT mode stays deterministic and green.** All five `?shot=N` presets must print
  `CANOPY_STATUS READY … err=0` (recipe in §7). Nothing new spawns, animates or persists in
  SHOT (`if (SHOT) return;` at the top of every update, like the existing modules).
- **Plain scripts, no modules, no build.** Top-level `const/let/function` are shared
  globals across `<script>` tags. Guard cross-file globals that may load later with
  `typeof x !== 'undefined'`.
- **Storage idiom**: every `localStorage` access wrapped in `try { } catch (e) { }`.
- Keep the file-header comment convention (`/* CANOPY split file  <name>: … */`).

## 0. Interfaces between streams

| Provided by | Symbol | Contract |
|---|---|---|
| main.js (pre-wired) | `postRender()` hook | `loop()` calls `typeof postRender === 'function' ? postRender() : renderer.render(scene, camera)`. |
| main.js (pre-wired) | `updateSeeds(dt, time)`, `updateSession(dt)` | called each frame after `updateVerge`, never in SHOT. |
| B: player.js | `player.sailing` (bool), `player.sailT` (0..1 unfurl) | true while the sail is open. |
| B: seeds.js | `seedsStatus()` → `{ found, total, nextAt, tier }` | `total` is the running count of seeds ever discovered by placement (informational); `nextAt` is the next unlock threshold or `null`. |
| B: seeds.js | `seedsNearby(range)` → `[{x, y, z}]` | uncollected seeds within `range` m of the player, from resident chunks. |
| B: seeds.js | `sailTier` (0/1/2 global) | read by player.js for glide ratio. |
| C: main.js | `trialBest` object | `{ [trialId]: { [tierIdx]: seconds } }`, persisted at `canopy.trialbest`. |
| C: main.js | `journalToggle()` | optional; only main.js calls it. |
| A: post.js | `POST.enabled`, `POST.toggle()` | `P` key (bound in post.js itself). |

Existing globals everyone may read: `player`, `keys`, `SHOT`, `chunks` (Map of chunk →
`{ ix, iz, type, colData }`), `chunkAt(x,z)`, `chunkType(ix,iz)`, `terrainY(x,z)`,
`hash2`, `mulberry32`, `dayT`, `dayF`, `nightF`, `sunDir`, `sunSprite`, `msg`, `hint`,
`once`, `sfxNote(freq, dur, vol)`, `AC`, `master`, `muted`, `texSoft`, `texLeaf`,
`tplBlob`, `scene`, `camera`, `renderer`, `pickupBurst(x,y,z)`, `SAFE_LEAF`,
`CANOPY_Y`, `WALK`, `SPRINT`, `GRAV`, `JUMP`, `EYE`, `dist2`.

---

## Stream A — render polish (`post.js` new, `core.js`)

### A1. Post-FX pipeline (`post.js`, loaded right after `worldgen-chunks.js`)

Goal: bloom on everything emissive (lamps, fireflies, glow-moss, lit windows, ring gates,
the sun disc), soft sun shafts, a gentle filmic grade, a subtle vignette — and no visible
change to *exposure* at street level (the game is already tuned; shot 5's mean brightness
should stay within ±12 %).

Pipeline per frame (`postRender()`):

1. `renderer.setRenderTarget(rtScene); renderer.render(scene, camera)`. `rtScene` is a
   `WebGLRenderTarget(w, h, { type: HalfFloatType if supported else UnsignedByteType,
   samples: isWebGL2 ? 4 : 0, depthBuffer: true })`. Note: three r152 applies tone mapping
   and the sRGB output transform **only when rendering to the screen**, so `rtScene` holds
   linear scene radiance. Keep `renderer.toneMapping = ACESFilmic` set (harmless for RT
   renders; `refreshEnvProbe` still toggles it) — the composite pass does the actual mapping.
2. **Bright pass** at half res: `max(0, lum - threshold) / (lum + 0.4) * color`,
   threshold 1.05 in linear (so ordinary lit surfaces at exposure 1.45 don't bloom; emissives,
   sun and specular hot-spots do). With UnsignedByte fallback use threshold 0.82.
3. **Blur**: two ping-pong separable 9-tap gaussian passes at half res, then one more pair at
   quarter res, summed (wide + tight lobe).
4. **Sun shafts** (quarter res, only when `sunElev > -0.02` and the projected sun is within
   the screen rect ±25 %): project `sunSprite` world position with the camera; a 20-sample
   radial blur of the bright-pass toward the sun NDC point, decay 0.94, weight so a clear-sky
   sun gives visible rays through leaf gaps and nothing when occluded. Strength × `dayF`.
5. **Composite** to screen (`setRenderTarget(null)`): `c = scene + bloom * 0.55 + shafts *
   0.35`; grade: lift shadows slightly toward cool green (`c += vec3(0.010, 0.016, 0.012) *
   (1 - lum)`), warm highlights (`c *= mix(vec3(1), vec3(1.04, 1.0, 0.94), smoothstep(0.6,
   1.6, lum))`), saturation 1.06; then `ACESFilmic(c * 1.45)` (port three's
   `ACESFilmicToneMapping` GLSL exactly) and `LinearTosRGB`; vignette `1 - 0.18 *
   smoothstep(0.55, 1.35, r)`.
6. Night: bloom strength scales `0.55 → 0.8` with `nightF` so lamps and windows bloom more
   after dark.

Constraints:

- Resize: rebuild RTs on `resize` (listen on window; sizes use `renderer.getDrawingBufferSize`).
- All passes use one shared `THREE.OrthographicCamera(-1,1,1,-1,0,1)` + one
  `PlaneGeometry(2,2)` mesh with a swapped `ShaderMaterial`; no EffectComposer (not bundled).
- `POST.enabled` toggle (key `P`, with `hint('post-fx on/off')`); when off, `postRender` just
  calls `renderer.render(scene, camera)`. Also honour `?post=0`.
- If RT creation throws or the GL reports an error on first use, log once, set
  `POST.enabled = false` permanently, and fall back.
- SHOT mode: post-fx **on** (screenshots should show the new look), but readPixels in `loop`
  reads the default framebuffer — the final composite pass must be the last thing drawn.
- Sprites with `fog:false` / additive blending still work (they are rendered into rtScene).
- Do not touch `refreshEnvProbe`, the shadow map, or any material besides A2/A3.

### A2. Vine translucency (`core.js`)

`matVine` gets an `onBeforeCompile` identical in structure to `matLeaf`'s (same anchor,
same guard), with the tint `vec3(1.10, 1.0, 0.62)` and lobes `0.24 + 0.70 * cnpFwd`.
`matVine.customProgramCacheKey = () => 'canopy-vine-translucency'`. This is the fix for vines
reading as black cut-outs against a backlit facade (shot 1).

### A3. Grounded facades (`core.js`)

`makeBldMaterial` (and `matBld`, which is built separately — apply the same hook via a
shared `groundFacade(mat)` helper) gets an `onBeforeCompile` that:

- Vertex: after `#include <begin_vertex>` adds `vCnpWY = (modelMatrix * vec4(transformed,
  1.0)).y;` (declare `varying float vCnpWY;` in both stages).
- Fragment: after `#include <map_fragment>`:
  `float g = smoothstep(-1.5, 3.6, vCnpWY);` (0 at the street, 1 above 3.6 m)
  `diffuseColor.rgb *= mix(0.62, 1.0, g);` (grime / contact AO)
  `diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.92, 0.70), (1.0 - g) * 0.55);`
  (algae green at the base).
- Set `customProgramCacheKey` per material (`'canopy-bld-' + name`) so the four programs
  don't collide with one another or with any un-hooked material.

Verify under the fake-sun bench (see memory note `canopy-visual-test-benches`) that the
band reads as grime, not as a hard line — the `smoothstep` is deliberately wide.

### A4. Acceptance (Stream A)

- All five shots READY, err=0; shot 5 mean brightness within ±12 % of baseline
  (baseline centre px 81,95,72). Shot 3 (night) must show visible bloom halos around the
  lit windows and lamps; shot 1 must show vines with visible green translucency rather
  than pure black; shot 2 must show a sun with a soft halo and faint rays.
- Frame cost: ≤ 2.5 ms extra at 1280×800 on an integrated GPU (measure with
  `renderer.info` + `performance.now()` around `postRender`; report the number).
- `P` toggles cleanly with no leaked RTs; resize does not stretch.

---

## Stream B — leaf-sail, glowseeds, session (`player.js`, `sail.js` new, `seeds.js` new, `session.js` new)

### B1. Leaf-sail glide (physics in `player.js` `stepPlayer`; rig/audio/hints in `sail.js`)

State on `player`: `sailing: false, sailT: 0, spaceLatch: false, roll: 0, fovT: 0`.

**Unfurl** (in `stepPlayer`, after the input block, before gravity):

- Space is *edge-triggered* for the sail: `spaceLatch` becomes true when Space is released
  while airborne; a press with `spaceLatch` true unfurls, then clears the latch. This keeps
  a held jump from unfurling on the same press. On landing, `spaceLatch = false`.
- Conditions: `!grounded && !climbing && !onLadder && !onLift && vel.y < -0.5 && !carrying`
  (the existing `carrying` const: story seed / heavy verge pieces). If heavy: `hint('Too heavy
  to sail', 1.5)` once per airtime.
- Unfurl sets `sailing = true`, `sailT` ramps 0→1 over 0.25 s (used by the rig). Space
  pressed again while sailing furls (`sailing = false`); grounded/climbing/ladder/water/
  blackout also furl.

**Glide physics** (replaces the gravity line while `sailing`):

- Sink target `sinkT` and speed target `spdT` from pitch `θ = p.pitch` (−1.45 … 1.45, up
  positive): base `(sink, speed)` = `(−2.2, 9.5)`; dive `θ < 0`: `sink → −2.2 + 6.0 * θ`
  (clamped −8.5), `speed → 9.5 − 5.5 * θ` (max 15); flare `θ > 0`: `sink → −2.2 + 1.6 * θ`
  (max −0.7), `speed → 9.5 − 6.0 * θ` (min 3.5). Sail tiers (read `sailTier`, default 0):
  tier 1 base `(−1.8, 10.5)`, tier 2 `(−1.4, 11.5)`.
- `vel.y += (sinkT − vel.y) * min(1, 5 dt)`; horizontal: velocity blends toward
  `spdT * forward(yaw)` with `min(1, 3.5 dt)` (mouse yaw steers, no A/D strafe while
  sailing — A/D instead add a small bank of ±0.8 m/s²). Wind gust shove still applies.
- **Stall**: if `spdT < 4` for > 1.2 s continuous, the sail flutters: `hint('The sail
  stalls — look down to catch air', 2)`, sink −4.5 until pitch < 0.1.
- Vines: `climbNormal && W` still grabs the wall out of a glide (furls).

**Landing**: while sailing, each frame `p.airPeakY = p.pos.y + (vel.y > −4.0 ? 5.0 : 9.0)`
so a gentle touchdown is `drop < 7` (nothing happens) and a dive landing is a "hard but
survivable" 7–10 m stagger; never a blackout from the sail itself. Sky nets / water /
leaves keep their existing rules.

**Camera feel** (`stepPlayer` camera block): `camera.fov` lerps to 82 while sailing (72
normally) at 4/s; `camera.updateProjectionMatrix()` only when it changed by > 0.05.
Roll: `p.roll` lerps toward `clamp(−yawRate * 0.35, −0.16, 0.16)` while sailing, toward 0
otherwise, at 6/s; `camera.rotation.set(pitch, yaw, roll, 'YXZ')`. Head-bob off while
sailing.

**Rig** (`sail.js`, `updateSailRig(dt, time)` called from the end of `stepPlayer` via
`typeof` guard): a `THREE.Group` parented to `camera` at (0, 0.62, −0.55). Two lanceolate
wing meshes (custom `ShapeGeometry` blade, 1.9 m span each, using a `MeshStandardMaterial({
map: texLeaf, alphaTest: 0.45, side: DoubleSide, color: 0xa8d47a, emissive: 0x143a10,
emissiveIntensity: 0.25 })` — not `matLeaf`, which needs vertex colours), a short spar
between them, and two rope lines down to just outside the frame. Wings flap ±4° at 1.6 Hz
scaled by speed, tilt with `p.roll`, scale by `sailT` (unfurl pop). Hidden when
`sailT === 0`. Never in SHOT.

**Audio** (`sail.js`): a lazily created noise source (same idiom as `initAudio`'s wind:
buffer noise → bandpass 900 Hz Q 0.7 → gain) connected to `master`; gain target
`0.10 * clamp(speed / 12, 0, 1)` while sailing, 0 otherwise, `setTargetAtTime` 0.15 s.
Guard on `AC && !muted`. An unfurl "whump" — a 0.18 s noise burst with a low-pass sweep.

**Teaching**: `once('sailhint')` → `hint('Press SPACE mid-air to unfurl your leaf-sail',
5)` the first time the player is airborne with `airPeakY − pos.y > 4` and not sailing.
`once('sail')` on first unfurl → `msg('The leaf-sail snaps open and the fall turns into a
glide. Look down to dive, up to float.', 7)`.

### B2. Glowseeds (`seeds.js`, loaded after `main.js`)

**Placement** (pure function of chunk index, no rng):

```
seedsIn(ix, iz) → [{ x, y, z, key }]   // key = ix+','+iz+':'+k
```

Skip chunk types `spire` and `hamlet`. `n = hash2(ix, iz, 9101) % 100 < 48 ? 1 + (hash2(ix,
iz, 9102) % 2) : 0`. Candidates from `peekColData`-free sources — use the **resident**
chunk's `colData` only (`chunks.get`): rooftops = `solids` with `vine && h >= 10` at
`(cx, (y0||0) + h + 0.9, cz)`; pads with `layer ∈ {bough, weave, nest, lookout}` and
`y >= 10` at `(x, y + 0.9, z)`. Sort candidates by `hash2(round(x), round(z), 9103)` and
take the first `n`. Because colData is deterministic, the same seeds appear every session.

**Persistence**: `canopy.seeds` = JSON array of collected keys; in-memory `Set`.

**Visuals**: pool of 24 seed props: `tplBlob` scaled 0.2 with `MeshStandardMaterial({ color:
0xf4ffc0, emissive: 0xc8ff70, emissiveIntensity: 1.6, roughness: 0.4 })` + an additive
`texSoft` sprite halo (scale 1.1, colour 0xd6ff8a, opacity pulsing 0.35–0.6). Bob
0.12 m at 1.4 Hz, spin 0.8 rad/s. Only uncollected seeds within 2 chunks (Chebyshev) are
shown; the pool is re-synced when the player's chunk changes or every 1 s.

**Pickup**: feet within 1.7 m horizontally and |dy| < 2.2 → collect: add key, save,
`pickupBurst(x, y, z)`, `hint('Glowseed · N found', 2.5)`; `once('seed')` → `msg('A
glowseed — the canopy sheds them where the light is strongest. Collect them; they remember
the way up.', 7)`.

**Proximity cue**: an uncollected seed within 14 m plays a soft `sfxNote(1318.5, 0.25, 0.03)`
every 2.4 s (throttled; skip if `muted`/no `AC`).

**Unlock ladder**: `SEED_TIERS = [25, 50]`. On crossing 25: `sailTier = 1`, save
`canopy.sailtier`, gold `msg('Twenty-five glowseeds. You strip the ribs and re-lace the
sail — it holds the air longer now.', 8, true)`. On 50: `sailTier = 2`, `msg('Fifty. The
sail is all leaf now, and the leaf knows how to fly.', 8, true)`. `sailTier` restored on
load. Every 10 seeds otherwise: `hint('N glowseeds — next unlock at M')`.

`seedsStatus()` and `seedsNearby(range)` per §0.

### B3. Session persistence (`session.js`, loaded after `main.js`)

- Save `canopy.session` = `{ v: 1, x, y, z, yaw, pitch, dayT, spire: { cx, cz } }` every 4 s
  while `started && player.grounded && !player.blackout`, and on `visibilitychange` (hidden)
  and `beforeunload`. Never in SHOT.
- Restore once, synchronously at load (after `main.js` has set the default spawn): if the
  save parses and `?fresh` is absent → `player.pos.set(x,y,z)` through `groundTeleport`,
  `lastShade.copy(player.pos)`, yaw/pitch, `dayT`. If `spire` differs from the session's
  re-rolled `SPIRE`, still restore (the world is deterministic except the spire chunk; if
  the saved position is inside the *old* spire chunk, snap to the chunk's street corner
  `(cx*64+2, terrainY, cz*64+2)`).
- `?fresh=1` clears `canopy.session` and starts at the default spawn.
- One line on restore: `hint('Back under the leaves — where you left off', 4)` after the
  overlay is dismissed (poll `started`).

### B4. Acceptance (Stream B)

- Numeric harness (a node script in the scratchpad that stubs the globals it needs and
  requires the glide math as a pure function — extract `sailTargets(pitch, tier) → {sink,
  speed}` into `sail.js` for this): sink/speed at pitch −1.45, −0.5, 0, 0.5, 1.45 for each
  tier match the tables above; monotonic in pitch.
- Manual: from a 30 m rooftop, unfurl → glide ≥ 90 m horizontally at tier 0 before touching
  the street; dive landing staggers, level landing does not; Space on the ground still
  jumps; a held jump never unfurls.
- All five shots READY, err=0 — and their `px=` values **unchanged** from baseline (no new
  scene content in SHOT).
- Seeds: in a live session `seedsIn` for ten random chunks returns the same list on two
  calls; collecting one and reloading keeps it collected.

---

## Stream C — trials overhaul & journal (`main.js` trials/minimap/HUD sections, `index.html`)

### C1. Ring gates

Replace `TRIAL_POOL`'s `tplBlob` meshes with **gate** objects: `THREE.Group` holding a
`TorusGeometry(1.5, 0.08, 10, 40)` mesh (`MeshStandardMaterial({ color: 0x0c2a22, emissive:
0x8affd0, emissiveIntensity: 2.2, roughness: 0.5 })`) plus an inner additive `texSoft`
sprite (scale 2.4, opacity 0.22). `setMark(i, x, y, z, s, mat)` keeps its signature: `s`
scales the group, `mat === matRelic` swaps the emissive to gold (`0xffdf7a`) and hides the
torus in favour of a bright blob (relics stay orbs). Gates spin slowly about Y
(0.35 rad/s) and yaw to face the player when > 6 m away; pulse emissive 1.8–2.6 at 2 Hz.
The **current** gate (index 0) is full strength; index 1 (next) at 45 %; others hidden
unless explicitly set. Pool size 12.

### C2. Countdown

`startTrial` for timed trials (everything except The Rumor) enters `phase: 'count'` for
3.2 s: a centred `#countdown` element shows `3`, `2`, `1`, `GO` (serif, 84 px, teal,
scale-in/fade-out per beat via a CSS class re-trigger). Beeps: `sfxNote(660, 0.12, 0.08)`
×3 then `sfxNote(990, 0.3, 0.1)`. Timer and fail conditions are frozen during the
countdown; movement is not locked. After GO the trial's real first phase begins (store it
as `T.after`). Track Runner and Freefall keep their untimed pre-gate/ascend phases, so
they count down when the gate/start marker is reached instead.

### C3. Cards and best times

- `trialBest` persisted at `canopy.trialbest` per §0. `T.t0 = time` at GO; elapsed at
  completion is `time − T.t0`.
- `#trialCard` (centre, 360 px, panel style): title, medal glyph in tier colour (bronze
  `#c8834a`, silver `#cfd6dc`, gold `#ffd75e`), "TIME 1:23.4", "BEST 1:19.8" (or "FIRST
  CLEAR"), a "NEW BEST" tag when improved, the reward line. Slides in, holds 5.5 s, fades.
  Failure card: red-tinted border, reason line, "TIME" shown, no medal.
- Checkpoints (Track Runner, Canopy Run gates): `hint` shows `Gate 3 / 8 · 12.4 s`.
- Timer element: add class `urgent` under 10 s (CSS pulse 1 Hz) and a tick
  `sfxNote(880, 0.05, 0.05)` each whole second under 10.

### C4. Canopy Run (new trial)

`TRIAL.CANOPY = 'canopyrun'`, name **Canopy Run**, inserted into `TRIAL_ORDER` right after
COURIER (so it unlocks after Sun Courier; Track Runner then unlocks after it — the existing
predecessor gating applies).

**Course builder** `buildCanopyCourse(fromX, fromZ, fromY)`:
candidates from resident chunks — pads with `layer ∈ {bough, weave, nest, lookout}` and
`y >= 8` at `(x, y + 1.6, z)`; vined rooftops `solids` with `vine && h >= 8` at centre,
`(y0||0) + h + 1.6`. Greedy chain of 8 gates: from the current point pick the unused
candidate with 3D distance in `[16, 42]` that minimises `|Δheading| * 8 + |Δy| * 0.5 +
dist * 0.2` where `Δheading` is the turn from the previous segment (first segment: any);
if none in range, widen to `[10, 60]`; if still none, stop. Feasible when ≥ 6 gates.
Prefer ascending for the first half (add `+6` cost for `Δy < −3` while `k < 4`).

**Rules**: gates must be taken in order; a gate is passed when the player is within 2.8 m
(3D) of its centre. `T.timeLeft = Σ segment distances / 7.5 * 1.5 * TIER_MULT`; `hint`
per gate with split. Fail on time or heat (shared rule). Falling is *allowed* — the run is
about routing, and the sail (`player.sailing`) is the intended tool: start line reads
`'Eight gates through the boughs and rooftops. Unfurl the sail between them — jump, then
Space.'`. Completion at gate 8.

**Feasibility** (`trialFeasible`): `buildCanopyCourse` returns ≥ 6. Trial-master steer line
when infeasible: `'The Canopy Run needs boughs and rooftops within reach — not from here.'`

### C5. Trial-master presence

While a trial is offerable, a small gate (pool slot 11, scale 0.28) hovers 2.4 m above the
nearest trial-master's head, spinning; hidden while a trial runs.

### C6. Journal (`J`)

`#journal` panel (same `.panel` styling as the satchel, right side under the minimap,
`pointer-events:none`, toggled by `J` via a `keydown` listener in `main.js`; mutually
exclusive with the satchel — opening one hides the other if `satchelToggle` exists and the
satchel is open, close it via the same function). Contents, rebuilt on open and every 1 s
while open:

- **TRIALS**: one row per `TRIAL_ORDER` entry: name · medal glyph(s) for best tier (● in
  tier colour, or ○ locked/unplayed) · best time at that tier (or —). Locked trials show
  "locked".
- **ERRANDS** `missionsDone` · **VANTAGES** `doneVantages.size` (+ Spire if `summited`).
- **GLOWSEEDS** `found` · "next unlock at N" (from `seedsStatus()`, typeof-guarded).
- **THE SECOND SEED** chapter `STORY_SAVE.ch` of 7, or "complete".
- Ciphers / Verge one-liners if `ciphStatus` / `vergeStatus` exist (typeof-guarded;
  otherwise omit).

### C7. Minimap

`drawMinimap`: if `typeof seedsNearby === 'function'`, draw uncollected seeds within map
range as 2 px pale-green dots (`#d6ff8a`, alpha 0.7). Draw ring-gate positions of the
active trial's current gate with the existing objective glyph (already via
`activeObjective`).

### C8. Acceptance (Stream C)

- `node --check main.js`; all five shots READY err=0, `px=` unchanged from baseline.
- In a live session (`?shot=` absent), from a trial-master: Courier shows countdown, ring
  gate, card with time and FIRST CLEAR; replaying shows BEST and NEW BEST logic. Canopy
  Run builds ≥ 6 gates at three different plazas (log the gate list); gates pass in order.
- Journal opens/closes with J, lists all seven trials, and does not steal pointer lock.
- `openspec validate awesome-pass` passes after tasks are ticked.

---

## 7. Verification recipe (all streams)

```
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
python3 -m http.server 8147 &      # from repo root; NEVER use port 8080
for N in 1 2 3 4 5; do
  "$CHROME" --headless=new --enable-unsafe-swiftshader --virtual-time-budget=8000 \
    --enable-logging=stderr --window-size=1280,800 --screenshot=<scratchpad>/shot$N.png \
    "http://localhost:8147/index.html?shot=$N" 2>&1 | grep -o 'CANOPY_STATUS READY[^"]*'
done
```

Baseline (before this change): shot1 px=96,125,103 · shot2 px=53,71,30 · shot3 px=2,6,9 ·
shot4 px=11,16,10 · shot5 px=81,95,72. Stream A is expected to move these (report the new
values); streams B and C must not.

Also `node --check <file>` for every touched JS file.

---

## 8. Implementation notes (as built, 2026-09-03)

Deviations and findings from the streams, recorded so the next pass doesn't rediscover them.

- **Fog compensation (post.js).** three r152 built-in shaders mix fog AFTER tonemapping and
  output encoding, and r152 DOES apply tone mapping when rendering into a render target. With
  the composite owning ACES + sRGB, the scene RT is rendered with `NoToneMapping`, so the
  fog colours (tuned for the post-tonemap quirk) came out ~2× too bright in shot 5. Fix: the
  fog colour is pre-compensated with an inverse ACES fit per channel and linearised, blended
  with `FOG_K = 0.75` (full compensation over-darkened; `?fogk=` overrides).
- **Bloom knee.** A knee on linear-light luminance never fired on lit windows. The bright
  pass now measures perceptual luminance of the tone-mapped pixel with a
  `smoothstep(0.45, 0.85)` knee; `?bloom=` scales `BLOOM_MUL`.
- **NaN texels.** A single NaN texel in the scene RT smeared into hard black squares through
  the blur chain (worse with `?msaa=0`). Source: zero-length normals in `matPlain` batches
  (degenerate quads). Fixed at both ends: `Batch.mesh` (core.js) repairs zero normals to +Y
  before upload (no vertex-count or rng change, world unchanged), and post.js clamps the
  bright-pass input to `[0, 64]` and the composite reads to `≥ 0`.
- **Sail rig placement.** The spec'd rig position sat above the frustum at the design pitch.
  It now hangs at `(0, 0.30, −0.74)` camera-local with `rotation.x = 0.18 + (1 − sailT) · 0.5`,
  brighter blades (`0xbfe08a`, emissive `0x3d7a22 × 0.55`) and thinner, darker spar/ropes.
- **Trial cards.** BEST on the completion card is the stored best AFTER recording the current
  run, so a new record shows the new time (with the "new best" flag) rather than the old one.
- **Smoke-test px after post-fx.** shot1 85,110,90 · shot2 67,98,47 · shot3 15,27,22 ·
  shot4 17,30,20 · shot5 98,126,84 (shot 1 is a random spawn; its value varies per run).
