# minimap-hud Specification

## Purpose
TBD - created by archiving change codify-hud-audio. Update Purpose after archive.
## Requirements
### Requirement: A rotating, player-centred minimap disc

The minimap SHALL render a 200 px circular canvas centred on the player, rotated so the
player's facing is always up, at a fixed world scale of 0.82 px/m (roughly a 120 m view
radius). It SHALL draw a player arrow fixed at the centre pointing up, an "N" tick riding
the rim at world north, and a rim ring. The map SHALL redraw on its own cadence of roughly
every 0.08 s, only while the game is active.

#### Scenario: Facing is always up

- **WHEN** the player turns in place
- **THEN** the map rotates around the fixed centre arrow so the facing direction stays up and the N tick moves along the rim

### Requirement: Terrain is drawn from resident chunk data

The minimap SHALL draw only chunks within range (~190 m), each as a background tile
coloured by chunk type, overridden by macro-biome colour for scorch/deepgreen/ashen
regions, with the 1.5 px tile inset gap reading as the street grid. On each tile it SHALL
draw building rectangles (two greys split at 30 m height), tree dots, and water, all from
the chunk's prebuilt mini-map data — no live geometry queries.

#### Scenario: Biome recolours the quarter

- **WHEN** a resident chunk belongs to a non-canopy biome
- **THEN** its minimap tile uses the biome colour instead of the chunk-type colour

#### Scenario: Only nearby chunks are drawn

- **WHEN** a chunk lies farther than the draw range from the player
- **THEN** it is skipped entirely that frame

### Requirement: The objective marker and edge arrow

The minimap SHALL always show the single active objective (owned per the priority contract
in `summit-goal`): as a gold dot when the target is within the disc, or as a gold arrow
pinned to the rim pointing toward it when beyond. The label line under the map SHALL name
the objective — "✦ THE SPIRE" by default, or the active mission/trial title in upper case.

#### Scenario: Distant objective becomes a rim arrow

- **WHEN** the objective lies beyond the disc radius
- **THEN** a gold arrow sits at the rim on the bearing to the objective, replacing the dot

### Requirement: A gated marker vocabulary

The minimap SHALL draw each progression marker only once its gating flag holds, so the map
itself is a record of discovery: the giver's yellow dot (pre-accept only, per `errands`);
teal trial-master dots; faint session vantage pins; the warm hamlet hut only after
discovery; the planted-oasis dot at its Spire-relative offset once the campaign plants the
Seed; the Archivist amber dot while the campaign is unfinished; the Tinker copper dot once
met; Seedbearer anomaly ticks after campaign completion; Gardener's-Mantle oddity ticks
once the Mantle is held; and waytree rung glyphs once any lookout has been stood on. The
flag semantics and rewards belong to their owning capabilities (story-campaign, ciphers,
waytrees, errands, trials); this capability owns that the map honours them.

#### Scenario: The hamlet hides until found

- **WHEN** the Hidden Hamlet has not been discovered
- **THEN** its chunk draws as an ordinary grove of tree dots with no hut marker

#### Scenario: Markers appear with their flags

- **WHEN** a gating flag (hamlet found, Tinker met, Mantle held, lookout stood on, campaign planted/complete) becomes true
- **THEN** the corresponding marker class is drawn from then on, within its draw range

### Requirement: Survival HUD readouts

The HUD SHALL update about five times per second while active, showing: a 24-hour clock
derived from the day phase; the current district name — suffixed with the macro-biome name
in non-canopy biomes and replaced by "The Hidden Hamlet" on the discovered hamlet chunk;
air temperature; altitude in metres; and a cover state word — "in water", "deep shade"
(in a pit below −1 m), "IN THE SUN" when exposed, "shaded", or "dappled light" — styled by
state.

#### Scenario: The district line tells the whole story

- **WHEN** the player stands at ground level in a scorch-biome quarter
- **THEN** the district line reads the district name suffixed with the Scorch, and on the discovered hamlet chunk it reads "The Hidden Hamlet" instead

#### Scenario: Cover state tracks exposure

- **WHEN** the player steps from shade into open sun
- **THEN** the cover word changes to "IN THE SUN" with its warning styling

### Requirement: Heat is shown twice

The HUD SHALL render body heat as a fill bar scaled to the heat percentage and as a
screen-edge vignette whose opacity ramps smoothly from heat 55 to full at 100 (×0.9), so
danger is readable both peripherally and precisely.

#### Scenario: The vignette closes in

- **WHEN** heat climbs from 55 toward 100
- **THEN** the heat bar fills proportionally and the screen vignette fades in smoothly to its maximum

### Requirement: The transient hint line

The system SHALL provide a single transient hint line, separate from the toast queue
(specified by `toasts`): showing a hint replaces the current one immediately and holds it
for the given duration (default 3 s) before fading. Hints are for controls and proximity
nudges; story text goes through toasts.

#### Scenario: A newer hint wins

- **WHEN** a hint is shown while another is displayed
- **THEN** the new text replaces the old immediately with a fresh expiry

### Requirement: One-shot narration beats

The system SHALL fire keyed one-shot narration beats at most once per session via a seen-key
guard: the opening morning message, first vine climb hint and climb line, breaking above the
canopy, first walk on each canopy layer (bough, weave, nest, waytree lookout), nightfall,
first close pass by citizens, first fern circle at night, first wading, first sinkhole
descent, the overheating warning, and first-entry district and biome mood lines (at ground
level, keyed per district style and per biome). A persisted flag may substitute for the
session guard where its owning capability says so (e.g. hamlet discovery in `trials`).

#### Scenario: Each beat fires once

- **WHEN** the player walks the Weave for the second time in a session
- **THEN** no weave narration repeats; the beat fired only on the first walk

#### Scenario: Mood lines key on place

- **WHEN** the player first sets foot at ground level in each district style or non-canopy biome
- **THEN** that style's or biome's mood line plays once for the session

### Requirement: HUD is idle until the game starts

All HUD, minimap, and narration updates SHALL run only when the game is active (started, or
a SHOT preset); before the start overlay is dismissed the canvas renders but the HUD stays
inert.

#### Scenario: No HUD before start

- **WHEN** the start overlay is still up
- **THEN** clock, minimap, hints, and narration beats do not update

