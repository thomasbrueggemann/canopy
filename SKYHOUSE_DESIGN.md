# CANOPY — Waytree skyhouse (the lookout now towers OVER the forest)

Change of intent (supersedes the lookout-height part of LIFTS/LADDERS design): the
waytree lift no longer stops at canopy height. It rises INTO a **skyhouse** — a proper
treehouse lookout standing clear above the crowns, with the whole canopy sea rolling to
the horizon below it. The tree's own crown now sits BELOW the deck; a bare mast-trunk
continues up through it to carry the house.

Why the numbers work: the canopy sea reveals over `smooth(31, 40, y)` and sits at 26.5;
old decks ([22,30)) never saw it fully. New decks live in **[42,50)** — full sea reveal,
higher than the hamlet giants (32–40), below the colossus (56.5) and Spire (78), so the
landmark hierarchy is preserved.

## 1. `waytreeSpec` (worldgen-builders.js) — the one load-bearing number

`deckY = 42 + hash2(ix, iz, 7304) % 8` (was `22 + …`). Same salt, same purity — every
finder (crown-nest chapter, Ascent trial, VANTAGE errand, minimap glyph) updates
automatically. Update the `[22,30)` comments wherever they appear (grep `deckY` and
`7304`).

## 2. `addWaytree` rework (worldgen-builders.js)

- **The tree:** `addTree(…, x, z, deckY - 6, 10 + rng()*2, { trunkR: 2.1, blobs: 6 })`
  — crown mass tops out ~4–6 m BELOW the deck (addTree puts blobs at `cy = h*0.92`).
  Its canopy pad now shades part of the lift ride. (h ≥ 32 means addTree may still hang
  a crown nest in the foliage below the house — charming, keep it.)
- **Mast trunk:** a bare continuation from inside the crown to the floor: one batched
  `tplTrunk` from `deckY - 7` to `deckY + 1`, radius ~1.5, plus
  `colData.trunks.push({ x, z, r: 1.5, h: deckY })` — sun-occluding AND freeclimbable
  (trunks with h > 14 take the climb path), so purists can skip the lift entirely.
- **The skyhouse** at deckY:
  - Floor: plank disc r 3.2 (+ the faint grain disc idiom), pad
    `{ x, z, r: 3.0, y: deckY, layer: 'lookout' }`.
  - 4–6 diagonal support struts (`segMat` cylinders) from the mast at ~deckY−4 out to
    the deck rim — the house must read *built*, not floating.
  - Parapet: ~14 railing posts + rail caps around the rim, gap on the +x side (the
    lift dock — same `Math.cos(a) > 0.72` skip idiom as before).
  - **Full pitched roof** (not the old half-roof): `addGableRoof` spanning
    x±3.3/z±3.3 at `deckY + 2.8`, on 6 posts, wood palette. Register real shade:
    `colData.pads.push({ x, z, r: 3.2, y: deckY + 2.9 })` (no layer → 0.75 sun
    attenuation → E ≈ 0.25 inside → body-heat burn ≈ 0 under the roof; it's also a
    landable soft pad, which is fine — it's a roof).
  - Beacon mast: a thin cylinder from the ridge up to `deckY + 7`, glowing lamp head
    at ~`deckY + 6.6` (`B.lamp` box + `colData.lamps` entry — this REPLACES the old
    rim lamp), and a small banner quad off the mast if trivial. At 50+ m the beacon
    reads across the whole night map.
  - DELETE the old half-roof + rim-lamp code.
- **Lift:** unchanged mechanics; `y1 = deckY` flows from the spec. Guide rails still
  run to `deckY + 1.8` (they sit at x+3.6, just outside the roof eaves at ±3.3).

## 3. Pump tuning (player.js) — the ride roughly doubled in length

`LIFT_PUMP 0.85 → 1.0`, `LIFT_VMAX 2.6 → 3.2`. Target: ~45 m in **~18–24 s** at
2 presses/sec (re-run the pump harness and report the docking time). Rationale: the
old tuning gives ~30+ s for 45 m, and the upper half of the ride is in raw sun —
at full noon burn (~2.5 heat/s) the slow ride courts heatstroke by itself. The faster
winch keeps the day climb spicy (~40–55 heat on arrival at noon) but survivable, and
the roofed house is the shade at the top. Night/dusk rides are unaffected.

## 4. Text (main.js)

`lookoutwalk` once-beat becomes:
`'A waytree skyhouse, high over the crowns — the leaf-sea rolls to every horizon below the rail. The lift-rope belongs to everyone; the view belongs to whoever cranks.'`

## Invariants / no-changes

- `waytreeSpec` purity, salts, and placement hashes unchanged (only the deckY base).
- Ascent trial: budget allows 1.05 m/s vertical ×1.7 — a pumped lift at ~2.5 m/s
  clears 42–50 m with huge margin; ground-touch rule unaffected (supportLayer 'lift').
- VANTAGE `checkSummit` half-extents (2.8 + 1 tolerance) still cover the r 3.0 deck.
- SUNRUN/LAMP/ERRAND, ladders (Spire/fallen), hamlet, colossus: untouched.
- `?shot=1..5` READY err=0 (more/taller geometry is fine).
- No new materials/textures; everything batched except the existing dynamic lift
  platform.

## Touch points (complete list)

1. `worldgen-builders.js` — waytreeSpec deckY base; addWaytree rework (tree height,
   mast, floor, struts, parapet, full roof + shade pad, beacon mast; remove old
   half-roof/rim lamp); comment updates.
2. `player.js` — the two pump constants.
3. `main.js` — the lookoutwalk string.
4. Nothing else.

## Verification

- `node --check` on touched files; smoke shots 1..5 READY err=0 (serve on a free port
  — 8080 belongs to an unrelated project).
- Re-run the pump-math harness for a 46 m run with the new constants; report dock time.
- Sandbox-run the real `addWaytree` (stubbed B/colData like the addLift check last
  time): assert ONE lifts row with y1 ∈ [42,50), trunks entries at h=deckY−6-ish AND
  h=deckY, a 'lookout' pad at deckY, a shade pad at deckY+2.9, one lamps row at
  ~deckY+6.6.
