# shot-mode Specification

## Purpose
TBD - created by archiving change codify-world-engine. Update Purpose after archive.
## Requirements
### Requirement: Activation and renderer configuration

SHOT mode SHALL be activated by the `?shot=<n>` URL parameter, read once at load. It configures the renderer with `preserveDrawingBuffer` so frames can be captured, auto-hides the start overlay without requiring pointer lock (the game counts as started), and never re-shows the pause overlay on lock loss.

#### Scenario: Headless start

- **WHEN** the page loads with `?shot=1`
- **THEN** the game starts rendering without any click or pointer lock

### Requirement: Deterministic preset scenes

Each shot number SHALL stage a fixed scene before the first frame, then build the world synchronously (`ensureChunks(..., true)`): shot 2 stands on the Spire summit at midday (`dayT 0.42`); shot 3 is night (`dayT 0.93`) at the origin street; shot 4 stands on a Hidden Hamlet platform (hamlet marked found, residents synced) in late afternoon; shot 5 stages a deterministic NPC conversation vignette; the default shot spawns at a randomized ring around the origin at midday with a handful of posed citizens. A `?px=&pz=` override (SHOT only) SHALL drop the camera at chosen world coordinates for dev verification.

#### Scenario: Shot presets stage the frame

- **WHEN** `?shot=3` loads
- **THEN** the clock is preset to night and the whole 7×7 window is built before rendering

#### Scenario: Coordinate override

- **WHEN** `?shot=1&px=640&pz=128` loads
- **THEN** the camera spawns at world (640, 128) with the surrounding chunks built synchronously

### Requirement: Frozen, pixel-stable simulation

In SHOT mode the simulation SHALL hold everything that could jitter a screenshot or smoke test: the day clock keeps its preset hour, weather never runs (the mixer stays neutral) and the `?wx` hook is inert, missions/trials/story/inventory/puzzle updates are skipped entirely (no givers, Tinker, Archivist, or props spawn), no audio context is ever created, winch lifts never move (nothing pumps them), wildlife collapses to a single deterministic flock, and the render loop freezes after 6 frames. Sibling capabilities each restate their own SHOT gate; this requirement fixes the harness-wide contract.

#### Scenario: Nothing moves that should not

- **WHEN** a SHOT session renders its frames
- **THEN** weather, missions, story, puzzles, and audio never run, and frame 6 is the last frame rendered

### Requirement: Render-health status contract

From the 5th frame, SHOT mode SHALL publish a machine-readable render-health line: it reads back the center pixel from the drawing buffer and writes `READY chunks=<n> err=<glError> px=<r,g,b,a> calls=<drawCalls> tris=<triangles> lost=<contextLost>` into the `#status` element, sets `document.title` to `READY`, and logs one `CANOPY_STATUS …` console line — so a headless runner can assert the world built, the GL context is healthy, and the frame is not black, without image diffing. Uncaught errors at any time replace `#status` with `ERR <message>`.

#### Scenario: Smoke check passes

- **WHEN** a headless browser loads `?shot=1` and waits for the title `READY`
- **THEN** the status line reports the chunk count, a zero GL error, a non-black center pixel, and draw-call/triangle counts

#### Scenario: Failure is loud

- **WHEN** a script error is thrown during load
- **THEN** the status element reads `ERR` plus the message, and the title never becomes `READY`

