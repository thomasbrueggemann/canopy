# The Three Veils — multi-layered canopy design

The canopy stops being decoration and becomes a layered, intertwined green superstructure
above the city, with three playable sub-layers. All geometry is procedural, batched per
chunk (`Batch`), deterministic per chunk seed, and integrated into the existing collision
arrays (`colData.solids / trunks / pads`).

## Vertical zoning (keyed to CANOPY_Y = 24, the sun line)

| Layer | Height | Light | Role |
|---|---|---|---|
| L1 Bough Roads | 15–20 m | shaded (safe) | walkable limb highways connecting trees ↔ rooftops |
| L2 The Weave | 24–28 m | dappled (risky) | semi-continuous walkable leaf lattice with light wells |
| L3 Crown Nests | 32–40 m | full sun (exposed) | sparse emergent platforms, lookouts, glow gardens |

## L1 — Bough Roads (~15–20 m)
- Thick horizontal limbs (chained, slightly rotated cylinder segments → gentle curves,
  radius ~0.5–0.8 m, walkable top) growing from street trees at ~60–75% of trunk height.
- Spans: tree → neighboring tree, tree → rooftop (land on parapet height), occasional
  street crossings. 2–4 spans per chunk, more in `park`/`grove`.
- Collision: register each limb as a series of small `pads` (walkable) plus `trunks`
  for the side-block; keep pad radius ≈ limb radius so you can fall off.
- Dressing: moss tint on top, small leaf tufts, hanging vine fringes below.

## L2 — The Weave (~24–28 m)
- Dense interlocking leaf platters (flattened blobs, r 4–8) + woven limb lattice tying
  neighboring trees' crowns together. Coverage ~60–75% per chunk, ZERO over `plaza`
  chunks (they stay open sky) and thin over streets in `city`.
- Light wells: deliberate 4–8 m gaps; you can fall through them. They align with the
  existing openRect logic where present.
- Walkable: platters push `pads`; keep existing per-tree pads too.
- Cross-chunk continuity: border-spanning platters/limbs decided by `hash2(ix, iz, salt)`
  on the shared border (same trick as power-pole side selection) so both chunks generate
  the identical half.

## L3 — Crown Nests (~32–40 m)
- Only on `grove` giants (h 33–42) and `towers` roofs: woven basket platforms (r 2.5–4),
  railings of bent twigs, 1–2 leaf umbrellas overhead casting a small real shade patch.
- Night: glow plants + a lamp-material beacon blob on some nests.
- Reached by climbing the giant trunk or a vine rope from L2.

## Intertwining / vertical connection
- Vine ropes: climbable vertical vines hanging from Weave underside and limb forks down
  to Bough Roads / rooftops / ground. Implement as thin cylinders + register as
  `trunks` entries (r ~0.35) so the existing climb code (`CLIMB_SPEED`) works untouched.
- Spiral limbs: around 1-in-4 tall buildings, a limb wraps a corner as it rises
  (3–5 segments), doubling as a climb/walk route.

## Systems integration
- Shade logic: unchanged — L1 sits below CANOPY_Y (shaded), L2/L3 above (exposed).
  L3 leaf umbrellas rely on the real shadow map (`shadeRay`/exposure check) for shade.
- `sea` (canopy-sea ring) stays; raise its y to ~30 so L2 reads under it from above? No —
  keep 26.5 but hide it while player is between 24 and 32 to avoid clipping the Weave.
- Minimap: Weave platters optional; skip for now.
- Messages: new `once()` hints for first limb walk, first light well fall, first nest.
- Perf: everything through existing batches; aim < ~40% triangle increase per chunk;
  no new materials unless needed (moss tint via vertex colors).

## Implementation phases (sequential, single file game.js)
1. Core geometry + collision: limb builder, Bough Roads, Weave lattice + light wells,
   cross-chunk continuity.
2. Verticality: vine ropes (climbable), spiral limbs, Crown Nests, sea-ring visibility fix.
3. Polish: moss/height color gradient, hanging fringes, glow, messages, tuning, smoke test.

---

# Anomalies — unpredictable landmarks in the grid

Three tiers of rarity break the regular chunk rhythm. All deterministic (hash2), batched,
integrated with colData physics and the heat system.

## Tier 1 — landmark chunk types (override chunkType, mutually exclusive with spire)
- **colossus** (~1/40 chunks): mega-tree, trunk r≈6, h≈55, piercing all three veils.
  Root buttresses form crawl-through ground caves (solids with gaps). A limb staircase
  spirals up the trunk (walkable pads). Crown carries a nest hamlet: 3–4 linked basket
  platforms with limb bridges, glow gardens, a beacon. Visible far off = navigation.
- **fallen** (~1/25): a tall tower collapsed diagonally against a neighbor: tilted box
  facade as a walkable ramp (street → roof, sloped collision via a rising series of
  pads), rubble field, vine streamers. The standing neighbor keeps normal collision.
- **sinkhole** (~1/25): street block caved into a bowl: rock rim ring, pit floor at
  y≈-4 (a dark disc + pads so the player can descend/stand), hanging roots from rim,
  dense glow plants + fireflies bias; air is cooler at the bottom (small heat drain).
- **reservoir** (~1/25): one wide low building (h≈8) filled with still dark water
  (semi-transparent plane at parapet level, y≈7.8). Standing in it (feet near water y,
  inside rect) drains body heat fast. Dragonflies = reuse pollen-style drifters? No —
  keep it simple, skip particles. Ladders/vines to climb up.

## Tier 2 — the Elevated Line (cross-chunk linear ruin)
Ruined overpass along rare grid lines: chosen by hash2 of the street line index
(like power-pole side selection) so ~1 in 7 x-lines / z-lines carries one; deck at
y≈9 (below Bough Roads), 6 m wide, on concrete piers every ~16 m. Per-chunk deterministic
gaps where spans fell (jumpable 2.5–4 m, some too wide = dead ends), collapsed span
debris below, grass + saplings on deck, occasional stranded bus/train car (stretched
addCar or box shape), guard rails. Deck registers pads/solids for walking; piers = trunks.

## Tier 3 — small oddities (sprinkled by rng in normal chunks)
- greenhouse skeleton: arched rusty ribs + a few glinting glass shard quads (lamp
  material at low emissive), inside: dense glow plants.
- wind-chime pole: hanging bottles/shells on strings from a pole or wire; near it a
  soft procedural chime tinkle (reuse audio system patterns, gated by AC).
- shrine niche: small candle box at a building corner: lamp-material flame dot at
  night, dried flowers.
- fern circle: ring of tall fern fronds (grass quads scaled up) in parks/groves.

## Heat hooks
- sinkhole bottom (y < 0): air reads cooler (−6 °C) and heat drains ~2× shade rate.
- reservoir water: heat drains fast (~4×) while feet in water; brief msg once().

## Implementation phases
A. Tier 1 + Tier 2 (structures, collision, heat hooks, minimap dots optional).
B. Tier 3 oddities + messages + audio chime + tuning + headless smoke verification.

---

# Districts — architectural identity per neighborhood + building variance

## District grid
- District = 3×3-chunk region: `dix = Math.floor(ix/3)`, `diz = Math.floor(iz/3)`;
  style = hash2(dix, diz, salt) pick, weighted: oldtown 25%, blocks 25%, glass 15%,
  works 15%, garden 20%. Spire chunk keeps its build regardless.
- Style influences: palette, building shape/height ranges, roof type, ornament set,
  vine/moss weights, window rhythm. chunkType stays as-is (city/towers/park/... still
  set density/layout); the district style restyles what gets built.

## Styles
- **oldtown**: h 6–13, narrow (w 7–11), warm plasters (terracotta/ochre/rose/cream),
  pitched gable roofs (triangular prism, two sloped quads + gable ends), awnings over
  storefronts, shutters (dark slat quads beside windows), chimneys, denser vines.
- **blocks**: h 15–34, wide slabs (w 14–22), pale grey/beige, flat roofs, balcony grid
  (small protruding slabs + rail on facade), occasional big faded mural rectangle
  (2-tone painted quad), sparse ornaments, medium vines.
- **glass**: h 25–55 in towers-chunks / 12–25 otherwise, tiered: 2–3 stacked shrinking
  boxes with setbacks; facade tint cool blue-green, stronger night emissive (windows lit
  more — check matBld emissive mechanism / window atlas usage for a per-building boost
  via vertex color or second material — keep simple), roof antenna cluster, light vines.
- **works**: h 6–12 sheds (w 16–24), sawtooth roof (3–5 asymmetric prisms), rusted
  corrugated tint (rust/brown/dark red), brick chimney (tall thin box, darker), silo
  cylinders, pipes between buildings, heavy vines + rust streak tint.
- **garden**: h 4–7 small detached (w 6–9) with gaps between, hip-ish roof (pyramid),
  pastel palette, low fences (thin boxes) around yards, garden trees + extra grass,
  heavy greenery.

## Per-building micro-variance (all districts)
- 20% tiered (2–3 stacked boxes, shrinking 15–30% per tier, each tier gets parapet).
- 12% ruin variant: reduced height + exposed top floor: no roof slab, ragged parapet
  (broken segments), interior floor slab visible, heavy vines, rubble at base.
- 15% street arcade: ground floor inset with columns (city/oldtown only).
- balconies, corner chamfer (oldtown/glass), roofline clutter per style.

## Implementation phases
A. District grid + style plumbing through buildChunk→addBuilding; palettes; shapes:
   pitched/sawtooth/pyramid/tiered roofs; height/width ranges; per-style vine weights.
B. Ornaments (awnings, shutters, balconies, murals, chimneys, silos, fences, arcades,
   antennas), ruin variant, glass night-glow boost, district name → style coupling
   (optional: name pools per style), tuning + headless smoke verify + screenshots.

---

# Waterways, Animals, Hidden Hamlet, Details

## Waterways (canals)
- Line selection like the viaduct (hash2 of street-line index, own salt, ~1/8 lines);
  a canal replaces the road surface along that line: channel bed at y=-1.2, mossy
  stone embankment walls, water plane at y=-0.35 (reuse matWater + water descriptor →
  wading/heat relief works). Streets crossing a canal get an arched stone bridge
  (walkable, low parapets); mid-block occasional plank footbridge. Reeds + lily pads
  + drifting leaf quads. Canal chunks: reuse pit-style ground exception for the bed.
- Where canal meets viaduct line: both render (water below, rails above).

## Animals ("The Returned") — pooled, simple geometry, spawn near / despawn far
- Ground: cats (slink along building edges, sit), boars (root in parks), frogs (hop
  near canal/reservoir water, tiny). 
- Sky: day bird flocks (5–9 birds, flapping V drift), dusk bats (erratic), a raptor
  circling high above landmark chunks (colossus/spire).
- Canopy: monkeys/squirrels leaping tree-to-tree between canopy pads in arcs.
- Behavior: cheap state machines + sine animation; day/night rosters; no collision.

## Hidden Hamlet (treehouse district + discovery challenge)
- One deterministic chunk in ring 6–10 from spire (hash-picked, never on an anomaly):
  grove of giants carrying a treehouse village: plank platforms (walkable pads), rope
  bridges (limb-style with rails), stilt huts (small gable-roofed boxes on platforms),
  ladders/vine ropes, lanterns (lamp material), 2–3 resident NPCs, glow gardens.
- Hidden: no minimap presence until discovered (within ~25 m); dense Weave above.
- Trial "The Rumor": trial-master gives 3 sequential cryptic waypoint clues (each a
  real world feature: a viaduct broken span, a sinkhole, a fern circle...) — reaching
  each within a generous radius reveals the next; final clue leads to the hamlet.
  Completion: permanent minimap marker + unique resident errand + reward line.

## Little details (sprinkle pass)
Benches, rusted mailboxes, laundry lines between facing windows, puddle quads (dawn
hours, fade by noon), mushroom clusters on deadwood/rubble, cobweb corner quads in
arcades, birds' nests on lamp heads, market litter (crates, cloth scraps) near stalls.
