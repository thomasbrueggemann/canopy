/* CANOPY split file  worldgen: chunk-generation builders (trees, buildings, limbs, weave) (was game.js lines 653-1694). Header/error-handler in core.js. */
'use strict';
/* ======================================================================== */
/*  CHUNK GENERATION                                                        */
/* ======================================================================== */
function baseChunkType(ix, iz) {
  if (ix === SPIRE.cx && iz === SPIRE.cz) return 'spire';
  // Anomalies — rare landmark chunk types decided on their own salt so they override the
  // common types (never the spire) at fixed rates while leaving city/park/etc. dominant.
  const rr = hash2(ix, iz, 5150) / 4294967296;
  if (rr < 0.025) return 'colossus';        // ~1/40
  if (rr < 0.065) return 'fallen';          // ~1/25
  if (rr < 0.105) return 'sinkhole';        // ~1/25
  if (rr < 0.145) return 'reservoir';       // ~1/25
  const r = hash2(ix, iz, 1) / 4294967296;
  // Regions: remap the common-type weights per macro biome (anomaly/spire/hamlet
  // untouched above). Base weights match the old thresholds: city .55 park .12 plaza
  // .09 towers .16 grove .08. regionBiome is allocation-free (cheap in ring scans).
  const biome = regionBiome(ix, iz);
  let wCity = 0.55, wPark = 0.12, wPlaza = 0.09, wTowers = 0.16, wGrove = 0.08;
  if (biome === 'scorch') { wPlaza *= 2.5; wCity += wGrove; wGrove = 0; }                 // plaza-heavy, grove→city
  else if (biome === 'deepgreen') { wGrove *= 3; wPark *= 1.5; wCity += wTowers; wTowers = 0; } // groves/parks, towers→city
  if (biome === 'canopy' || biome === 'ashen') return r < 0.55 ? 'city' : r < 0.67 ? 'park' : r < 0.76 ? 'plaza' : r < 0.92 ? 'towers' : 'grove';
  const tot = wCity + wPark + wPlaza + wTowers + wGrove;
  let acc = wCity / tot; if (r < acc) return 'city';
  acc += wPark / tot; if (r < acc) return 'park';
  acc += wPlaza / tot; if (r < acc) return 'plaza';
  acc += wTowers / tot; if (r < acc) return 'towers';
  return 'grove';
}
// Hidden Hamlet — one deterministic chunk in ring 6–10 (Chebyshev) around the Spire.
// Scan a fixed ring-then-row order and take the first candidate whose hash gate passes
// (hash2%5===0) and whose *base* type is a common one (never spire/anomaly). Computed once
// at load; the search is a few hundred integer hashes and is identical every run.
const HAMLET = (function () {
  const common = { city: 1, park: 1, plaza: 1, towers: 1, grove: 1 };
  for (let ring = 6; ring <= 10; ring++) {
    for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;   // ring perimeter only
      const ix = SPIRE.cx + dx, iz = SPIRE.cz + dz;
      if (hash2(ix, iz, 9001) % 5 !== 0) continue;
      if (!common[baseChunkType(ix, iz)]) continue;
      return { cx: ix, cz: iz, x: ix * CHUNK + 32, z: iz * CHUNK + 32 };
    }
  }
  const ix = SPIRE.cx + 7, iz = SPIRE.cz;                            // deterministic fallback (unreached)
  return { cx: ix, cz: iz, x: ix * CHUNK + 32, z: iz * CHUNK + 32 };
})();
_hamletCell = HAMLET;   // Regions: enable the hamlet full-canopy clamp now that HAMLET is known
function chunkType(ix, iz) {
  if (ix === HAMLET.cx && iz === HAMLET.cz) return 'hamlet';
  return baseChunkType(ix, iz);
}
/* ---- Waytrees (Ladders feature): recomputable landmark spec -----------------
   A waytree's existence AND its exact (x, z, deckY) are pure functions of the
   chunk coords via hash2 — so finders/trials in story.js/main.js can locate a
   waytree lookout without building (or peeking) the chunk, and the builder in
   buildChunk places it from THIS SAME function, guaranteeing byte-identical
   geometry. Every third grove and every fourth park carries one.  Returns
   null | { x, z, deckY }.  deckY ∈ [42,50).  Global (var) so it is callable
   from the later-loaded gameplay files. */
var waytreeSpec = function (ix, iz) {
  const t = chunkType(ix, iz);
  const ok = (t === 'grove' && hash2(ix, iz, 7301) % 3 === 0) ||
             (t === 'park'  && hash2(ix, iz, 7302) % 4 === 0);
  if (!ok) return null;
  const x = ix * CHUNK + 20 + hash2(ix, iz, 7303) % 24;   // central-ish, inside the block
  const z = iz * CHUNK + 20 + hash2(ix, iz, 7305) % 24;
  const deckY = 42 + hash2(ix, iz, 7304) % 8;             // Skyhouse: lookout towers over the crowns, [42,50)
  return { x, z, deckY };
};
// Nearest waytree deck to chunk (cx,cz) in a Chebyshev ring scan (pure recompute,
// no chunk build). Returns { x, z, y:deckY, ix, iz } or null. Shared by the crown-nest
// chapter (story.js) and the Ascent trial (main.js).
var nearestWaytree = function (cx, cz, maxR, minR) {
  for (let r = (minR || 0); r <= maxR; r++) {
    let best = null, bd = 1e9;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const ix = cx + dx, iz = cz + dz, w = waytreeSpec(ix, iz);
      if (!w) continue;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = { x: w.x, z: w.z, y: w.deckY, ix, iz }; }
    }
    if (best) return best;
  }
  return null;
};
// Deterministic ring of giants carrying the treehouse village (pure from HAMLET — no rng —
// so the resident-NPC anchors and the platform build agree). h 32–40, platforms y 15–19.
function hamletGiants() {
  const out = [], n = 6, R = 15, cx = HAMLET.x, cz = HAMLET.z;
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2 + 0.35;
    out.push({
      x: cx + Math.cos(a) * R, z: cz + Math.sin(a) * R, ang: a,
      h: 32 + (hash2(k, 0, 4711) % 80) / 10,     // 32.0 .. 39.9
      platY: 15 + (k % 3) * 2                     // 15 / 17 / 19
    });
  }
  return out;
}

function addTree(B, colData, mini, rng, x, z, h, R, opts) {
  opts = opts || {};
  const tr = opts.trunkR || (0.55 + h * 0.028);
  // Terrain: one sample at the trunk axis, shared by trunk and every root so the flare never
  // shears across a slope. Only the BASE moves — the crown, the pads it registers and the
  // Weave/bough-road band above stay on their absolute design heights (a ±1.1 m shift 25 m
  // up is invisible, and moving them would drag the whole canopy registry with it).
  const ty = terrainY(x, z);
  // trunk (sunk 0.25 m so the flare never shows daylight under it on a slope)
  B.bark.addGeo(tplTrunk, compose(x, ty - 0.25, z, tr, h * 0.97, tr, 0, rng() * 7, (rng() - 0.5) * 0.06), COL.bark, 0.18, rng);
  // roots
  const nRoots = 3 + (rng() * 3 | 0);
  for (let k = 0; k < nRoots; k++) {
    const a = rng() * Math.PI * 2, rl = tr * (0.9 + rng() * 1.1);
    B.bark.addGeo(tplRoot,
      compose(x + Math.cos(a) * tr * 0.75, ty - 0.2, z + Math.sin(a) * tr * 0.75, tr * 0.38, rl, tr * 0.38, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5),
      COL.barkDark, 0.15, rng);
  }
  if (opts.dead) { mini.trees.push([x, z, R * 0.4, 1]); colData.trunks.push({ x, z, r: tr, y0: ty, h }); return; }
  // canopy blobs
  const nB = opts.blobs || (4 + (rng() * 4 | 0));
  const cy = h * 0.92;
  let padTop = 0;
  for (let k = 0; k < nB; k++) {
    const a = rng() * Math.PI * 2, rr = rng() * R * 0.55;
    const bx = x + Math.cos(a) * rr, bz = z + Math.sin(a) * rr;
    const by = cy + (rng() - 0.4) * R * 0.4;
    const br = R * (0.42 + rng() * 0.33);
    const leafCol = [COL.leafA, COL.leafB, COL.leafC, COL.leafA][(rng() * 4) | 0];
    B.leaf.addGeo(tplBlob, compose(bx, by, bz, br, br * 0.72, br, 0, rng() * 7, 0), leafTintByY(leafCol, by), 0.22, rng);
    padTop = Math.max(padTop, by + br * 0.5);
  }
  // low hanging blob for silhouettes
  if (rng() < 0.5) {
    const br = R * 0.36, a = rng() * 7, ly = cy - R * 0.55;
    B.leaf.addGeo(tplBlob, compose(x + Math.cos(a) * R * 0.5, ly, z + Math.sin(a) * R * 0.5, br, br * 0.6, br, 0, rng() * 7, 0), leafTintByY(COL.leafC, ly), 0.2, rng);
  }
  colData.trunks.push({ x, z, r: tr, y0: ty, h });
  colData.pads.push({ x, z, r: R * 0.8, y: padTop - R * 0.18 });
  mini.trees.push([x, z, R, 0]);
  // Crown Nest on grove giants — reached by climbing the full-height trunk (h).
  // Regions: no nests in scorch (bough/weave/nest layer skipped), a touch more in deepgreen.
  const nestMul = CUR_REG ? (CUR_REG.biome === 'scorch' ? 0 : CUR_REG.biome === 'deepgreen' ? 1.3 : 1) : 1;
  if ((opts.trunkR || 0) >= 1.9 && h >= 32 && rng() < 0.75 * nestMul)
    addCrownNest(B, colData, rng, x, h, z, 2.5 + rng() * 1.4);
}

/* ---- multi-layered canopy (Phase 1): walkable limbs + weave lattice --------
   All batched through the existing `plain`/`leaf` batches, deterministic per
   chunk, and integrated into colData.pads so the existing support check
   (feet within pad.y-1.3 .. +0.6) carries the player along a limb / platter. */
const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3(), _qq = new THREE.Quaternion(), _limbM = new THREE.Matrix4();
// Map the unit cylinder (tplCyl: y 0..1, r 1) onto the segment a→b at radius r.
function segMat(ax, ay, az, bx, by, bz, r) {
  _dir.set(bx - ax, by - ay, bz - az);
  const L = _dir.length() || 1e-4;
  _dir.multiplyScalar(1 / L);
  _qq.setFromUnitVectors(_up, _dir);
  _pv.set(ax, ay, az); _s.set(r, L, r);
  return _limbM.compose(_pv, _qq, _s);
}
// A gently curved walkable limb of 3–6 chained cylinder segments, bark below with
// a mossy top strip. Registers a run of small `pads` (r ≈ limb r + 0.3) along the
// top so walking is smooth but the sides are narrow enough to fall off.
function addLimb(B, colData, rng, x0, y0, z0, x1, y1, z1, r, opts) {
  opts = opts || {};
  const segs = opts.segs || (3 + (rng() * 4 | 0));                 // 3..6
  const sag = opts.sag !== undefined ? opts.sag : (0.5 + rng() * 1.3);
  const wob = (rng() - 0.5) * 0.5;                                 // tiny lateral weave
  const bark = _c.copy(COL.bark).multiplyScalar(0.82 + rng() * 0.3).clone();
  const moss = _c.copy(COL.moss).multiplyScalar(0.8 + rng() * 0.4).clone();
  // sample the curve (gentle sag + slight wobble → the per-segment rotation)
  const pts = [];
  for (let k = 0; k <= segs; k++) {
    const t = k / segs;
    const px = lerp(x0, x1, t), pz = lerp(z0, z1, t);
    const py = lerp(y0, y1, t) - Math.sin(t * Math.PI) * sag + Math.sin(t * Math.PI * 2) * wob;
    pts.push([px, py, pz]);
  }
  for (let k = 0; k < segs; k++) {
    const a = pts[k], b = pts[k + 1], rr = r * (1 - 0.12 * (k / segs));
    B.bark.addGeo(tplCyl, segMat(a[0], a[1], a[2], b[0], b[1], b[2], rr), bark, 0.16, rng);
    // mossy top strip (two-tone vertex colour via quad), normal facing up
    let hx = b[0] - a[0], hz = b[2] - a[2]; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
    const px2 = -hz, pz2 = hx, hw = rr * 0.9;
    B.plain.quad(
      [a[0] - px2 * hw, a[1] + rr, a[2] - pz2 * hw],
      [a[0] + px2 * hw, a[1] + rr, a[2] + pz2 * hw],
      [b[0] + px2 * hw, b[1] + rr, b[2] + pz2 * hw],
      [b[0] - px2 * hw, b[1] + rr, b[2] - pz2 * hw],
      [0, 0, 1, 1], moss);
  }
  // epiphyte tufts (Phase 3): occasional tiny leaf blobs perched on the limb top —
  // the mossy, overgrown Bough-Road underside look. Visual only (no collision).
  if (opts.tufts) {
    const nT = 1 + (rng() * 3 | 0);
    for (let k = 0; k < nT; k++) {
      const tt = 0.15 + rng() * 0.7, fp = tt * segs, si = Math.min(segs - 1, fp | 0), sf = fp - si;
      const a = pts[si], b = pts[si + 1];
      const ex = lerp(a[0], b[0], sf), ey = lerp(a[1], b[1], sf), ez = lerp(a[2], b[2], sf);
      const er = 0.32 + rng() * 0.5;
      const ecol = leafTintByY([COL.leafA, COL.leafC, COL.moss][(rng() * 3) | 0], ey);
      B.leaf.addGeo(tplBlob, compose(ex + (rng() - 0.5) * r, ey + r * 0.6, ez + (rng() - 0.5) * r, er, er * 0.55, er, 0, rng() * 7, 0), ecol, 0.25, rng);
    }
  }
  if (opts.noPads) return;
  // walkable pads at ~1.3 m spacing along the limb top (overlapping so it's smooth)
  const step = 1.3;
  const layer = opts.layer || null;
  const dropPad = (p) => colData.pads.push({ x: p[0], z: p[2], r: r + 0.3, y: p[1] + r, layer });
  dropPad(pts[0]);
  let dist = 0, nextAt = step;
  for (let k = 0; k < segs; k++) {
    const a = pts[k], b = pts[k + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1e-4;
    while (nextAt <= dist + L) {
      const t = (nextAt - dist) / L;
      dropPad([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]);
      nextAt += step;
    }
    dist += L;
  }
  dropPad(pts[segs]);
}

// L1 Bough Roads (~15–20 m): 2–4 walkable limb spans per chunk connecting street
// trees to each other or to a nearby building rooftop (landing just above the roof).
function addBoughRoads(B, colData, rng, ox, oz, type) {
  const trees = [];
  for (const t of colData.trunks) if (t.h >= 14 && t.r >= 0.7) trees.push(t);   // real trees only
  if (trees.length === 0) return;
  const roofs = [];
  for (const s of colData.solids) if (s.h >= 8) roofs.push(s);                   // building tops
  let nSpans = 2 + (rng() * 2 | 0);
  if (type === 'park' || type === 'grove') nSpans = 3 + (rng() * 2 | 0);
  else if (type === 'plaza') nSpans = 1 + (rng() * 2 | 0);
  for (let s = 0; s < nSpans; s++) {
    const src = trees[(rng() * trees.length) | 0];
    let tgt = null, tgtY = 0, ex = 0, ez = 0, bd = 1e9;
    const preferRoof = roofs.length && rng() < 0.5;
    for (let k = 0; k < trees.length; k++) {                                     // tree ↔ tree
      const o = trees[k]; if (o === src) continue;
      const d = Math.hypot(o.x - src.x, o.z - src.z);
      if (d < 10 || d > 40) continue;
      if (d < bd) { bd = d; tgt = o; tgtY = clamp(o.h * 0.68, 14, 20); ex = o.x; ez = o.z; }
    }
    for (let k = 0; k < roofs.length; k++) {                                     // tree ↔ rooftop
      const rf = roofs[k];
      const rx = clamp(src.x, rf.x0, rf.x1), rz = clamp(src.z, rf.z0, rf.z1);    // nearest parapet point
      const d = Math.hypot(rx - src.x, rz - src.z);
      if (d < 8 || d > 40) continue;
      if (d < bd || (preferRoof && tgt && d < bd * 1.4)) { bd = d; tgt = rf; tgtY = (rf.y0 || 0) + rf.h + 0.5; ex = rx; ez = rz; }
    }
    if (!tgt) continue;
    const srcY = clamp(src.h * 0.68, 14, 20);                                    // attach at 60–75% trunk height
    const dx = ex - src.x, dz = ez - src.z, dl = Math.hypot(dx, dz) || 1;
    const sx = src.x + dx / dl * (src.r + 0.2), sz = src.z + dz / dl * (src.r + 0.2);
    addLimb(B, colData, rng, sx, srcY, sz, ex, tgtY, ez, 0.5 + rng() * 0.3, { layer: 'bough', tufts: true });
    // a vine dangling from the fork down to the street — a way up onto the bough road
    if (rng() < 0.5) addVineRope(B, colData, rng, sx, sz, srcY, terrainY(sx, sz));
  }
}

// L2 The Weave (~24–28 m): interlocking flattened leaf platters tying crowns
// together, ~60–75% coverage with deliberate 4–8 m light-well gaps, none over
// plaza, thinner over the street borders. Placement is decided on a GLOBAL cell
// grid via hash2(gx,gz,…) so neighbouring chunks agree on the field; each chunk
// only emits the cells whose centre lies inside it (owner emits whole geometry),
// with large radii overhanging the borders for a seamless canopy.
function addWeave(B, colData, rng, ix, iz, ox, oz, type) {
  if (type === 'plaza') return;                          // plazas keep open sky
  if (type === 'colossus') return;                       // the colossus crown replaces the Weave
  if (type === 'sinkhole') return;                       // open sky over the pit is dramatic
  const N = 5, S = CHUNK / N;                            // 5×5 global cells, 12.8 m each
  const norm = (h) => (h >>> 0) / 4294967296;
  const cov = (CUR_REG && CUR_REG.biome === 'deepgreen') ? 0.90 : 0.66;   // Regions: deepgreen ≈90% coverage
  const placed = [];
  const wells = [];                                       // interior light-well cells (for net hammocks)
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const gx = ix * N + i, gz = iz * N + j;
    const h = hash2(gx, gz, 4242);
    const edge = (i === 0 || j === 0 || i === N - 1 || j === N - 1);   // over the street borders
    // Sky nets (Feature B): interior threshold nudged 0.60→0.66 so a little more of the
    // canopy fills in — noticeably less open sky from the street, still dappled, not a lid.
    if (norm(h) > (edge ? 0.30 : cov)) {                 // else: a light well — dappled, sky through
      if (!edge) wells.push({ x: ox + (i + 0.5) * S, z: oz + (j + 0.5) * S, h });
      continue;
    }
    const h2 = hash2(gx, gz, 99), h3 = hash2(gz, gx, 77);
    const jx = (((h >>> 8) & 255) / 255 - 0.5) * S * 0.5;
    const jz = (((h >>> 16) & 255) / 255 - 0.5) * S * 0.5;
    const cxp = ox + (i + 0.5) * S + jx, czp = oz + (j + 0.5) * S + jz;
    const R = 4 + norm(h2) * 4;                           // r 4..8
    const py = 24 + norm(h3) * 4;                         // y 24..28
    const flat = 0.25 + ((h2 >>> 10) & 15) / 15 * 0.1;    // y-scale 0.25..0.35
    const leafCol = [COL.leafA, COL.leafB, COL.leafC][(h2 >>> 5) % 3];
    B.leaf.addGeo(tplBlob, compose(cxp, py, czp, R, R * flat, R, 0, ((h >>> 3) & 255) / 255 * 7, 0), leafTintByY(leafCol, py), 0.2, rng);
    colData.pads.push({ x: cxp, z: czp, r: R * 0.82, y: py, layer: 'weave' });   // walkable platter
    placed.push({ x: cxp, y: py, z: czp, R, flat });
  }
  // Hanging fringe (Phase 3): short vine ribbons dangling from each platter's underside
  // rim — the "delicately intertwined" look seen from the street below. Visual only.
  for (let k = 0; k < placed.length; k++) {
    const pl = placed[k];
    const nFr = 3 + (rng() * 4 | 0);                      // 3..6 ribbons per platter
    const under = pl.y - pl.R * pl.flat * 0.7;            // just below the platter's flattened rim
    for (let f = 0; f < nFr; f++) {
      const a = rng() * Math.PI * 2, rr = pl.R * (0.5 + rng() * 0.38);
      const fx = pl.x + Math.cos(a) * rr, fz = pl.z + Math.sin(a) * rr;
      const len = rng() < 0.2 ? 2.8 + rng() * 1.4 : 0.5 + rng() * 2.0, w = 0.22 + rng() * 0.34;   // fewer hang to head height — opens the understory (rng-neutral: same call count)
      const dx = Math.cos(a) * w / 2, dz = Math.sin(a) * w / 2;
      const col = _c.copy(COL.vine).multiplyScalar(0.58 + rng() * 0.34).clone();
      B.vine.quad([fx - dx, under - len, fz - dz], [fx + dx, under - len, fz + dz], [fx + dx, under, fz + dz], [fx - dx, under, fz - dz],
        [0, 0, 1, Math.max(1, Math.round(len / 2))], col);
    }
  }
  // thin lattice limbs weaving between nearby platters — visual intertwining, no pads.
  // Record which platter pairs a limb ties so net panels only fill the gaps that don't
  // already have a woody link (Feature B).
  const pairKey = (a, b) => a < b ? a + '_' + b : b + '_' + a;
  const linked = new Set();
  for (let k = 0; k < placed.length; k++) {
    let bestI = -1, bd = 1e9;
    for (let m = 0; m < placed.length; m++) {
      if (m === k) continue;
      const d = Math.hypot(placed[m].x - placed[k].x, placed[m].z - placed[k].z);
      if (d > 6 && d < bd) { bd = d; bestI = m; }
    }
    if (bestI < 0 || bd >= 18) continue;
    if (rng() < 0.55) continue;
    linked.add(pairKey(k, bestI));
    addLimb(B, colData, rng, placed[k].x, placed[k].y - 0.4, placed[k].z, placed[bestI].x, placed[bestI].y - 0.4, placed[bestI].z, 0.18, { noPads: true, segs: 3, sag: 0.5 });
  }

  /* ---- Sky nets (Feature B): sagging woven panels between un-linked crown pairs,
          horizontal hammocks half-covering some light wells, and long aerial creepers.
          Kept clear of the canal sky-corridor so the water line stays a touch more open. */
  const overCanal = (x, z) => {
    const m = CANAL.half + 2;
    if (isCanalX(ix) && Math.abs(x - ox) < m) return true;
    if (isCanalX(ix + 1) && Math.abs(x - (ox + CHUNK)) < m) return true;
    if (isCanalZ(iz) && Math.abs(z - oz) < m) return true;
    if (isCanalZ(iz + 1) && Math.abs(z - (oz + CHUNK)) < m) return true;
    return false;
  };
  // sagging net panels between nearby platters that no limb already ties (~3–5 / chunk)
  let nets = 0;
  const netCap = 5;
  const madeNet = new Set();
  for (let k = 0; k < placed.length && nets < netCap; k++) {
    let bestI = -1, bd = 1e9;
    for (let m = 0; m < placed.length; m++) {
      if (m === k) continue;
      const d = Math.hypot(placed[m].x - placed[k].x, placed[m].z - placed[k].z);
      if (d > 7 && d < bd) { bd = d; bestI = m; }
    }
    if (bestI < 0 || bd >= 20) continue;
    const key = pairKey(k, bestI);
    if (linked.has(key) || madeNet.has(key)) continue;
    if (rng() < 0.45) continue;
    madeNet.add(key);
    addNetPanel(B, rng, placed[k], placed[bestI]);
    nets++;
  }
  // horizontal hammocks partially spanning a light well (well stays partly open); ~20% walkable
  for (let k = 0; k < wells.length && nets < netCap; k++) {
    const w = wells[k];
    if (norm(hash2(w.x | 0, w.z | 0, 7788)) > 0.5) continue;   // only some wells get one
    if (overCanal(w.x, w.z)) continue;                          // keep the canal corridor open
    const walk = norm(hash2(w.x | 0, w.z | 0, 3311)) < 0.20;    // ~20% register a walkable pad
    addNetHammock(B, colData, rng, w.x, w.z, 25 + norm(w.h) * 2, S * 0.5, walk);
    nets++;
  }
  // aerial creepers: long diagonal/horizontal catenary vine strands crown-to-crown (20–30 m)
  if (placed.length >= 2) {
    const nCreep = 4 + (rng() * 5 | 0);                         // 4..8
    for (let k = 0; k < nCreep; k++) {
      const a = placed[(rng() * placed.length) | 0];
      let b = null, bd = 1e9;
      for (let m = 0; m < placed.length; m++) {
        const d = Math.hypot(placed[m].x - a.x, placed[m].z - a.z);
        if (d >= 18 && d <= 32 && d < bd) { bd = d; b = placed[m]; }
      }
      if (!b) continue;
      addCreeper(B, rng, a.x, a.y - 0.3, a.z, b.x, b.y - 0.3, b.z);
    }
  }
  // Vine ropes: 2–4 climbable verticals hanging from platter undersides straight down
  // to whatever rooftop lies beneath (else the ground). Placed at platter centres so a
  // climber topping out lands cleanly on the platter's walkable pad.
  let ropes = 0;
  const ropeMul = (CUR_REG && CUR_REG.biome === 'deepgreen') ? 1.5 : 1;   // Regions: extra vine ropes in deepgreen
  const maxRopes = Math.round((2 + (rng() * 3 | 0)) * ropeMul);           // 2..4 (×1.5 deepgreen)
  for (let k = 0; k < placed.length && ropes < maxRopes; k++) {
    if (rng() < 0.45) continue;
    const pl = placed[k];
    // Terrain: the rope now lands on the ground under the platter, not on the old y=0 plane.
    // `s.h < 6` stays a RELATIVE test (it is a worldgen filter and must stay rng-stable), while
    // the ceiling test uses the ABSOLUTE roof top — that keeps the yTop − yBot ≥ 2 invariant
    // addVineRope's early-out depends on, and an early-out there would skip rng draws.
    let yBot = terrainY(pl.x, pl.z);
    for (const s of colData.solids) {                    // land on a roof under the platter, if any
      const top = (s.y0 || 0) + s.h;
      if (s.h < 6 || top > pl.y - 2) continue;
      if (pl.x > s.x0 && pl.x < s.x1 && pl.z > s.z0 && pl.z < s.z1) yBot = Math.max(yBot, top);
    }
    addVineRope(B, colData, rng, pl.x, pl.z, pl.y, yBot);
    ropes++;
  }
}

// Sky nets (Feature B) --------------------------------------------------------
// A sagging woven net panel strung between two crown platters' rims. Built as a
// 2×3 grid of quads into B.net (matNet, alphaTest rope texture); the middle sags,
// the ends attach just under each platter, and the whole sheet tilts with the
// height difference of the two crowns. Visual only (no pads — see hammocks).
const NET_COL = () => _c.copy(COL.deadwood).lerp(COL.bark, 0.4).multiplyScalar(0.85).clone();
function addNetPanel(B, rng, A, Bp) {
  let dx = Bp.x - A.x, dz = Bp.z - A.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  const px = -dz, pz = dx;                                 // width axis (perpendicular)
  const x0 = A.x + dx * A.R * 0.8, z0 = A.z + dz * A.R * 0.8;
  const x1 = Bp.x - dx * Bp.R * 0.8, z1 = Bp.z - dz * Bp.R * 0.8;
  const y0 = A.y - A.R * A.flat * 0.5, y1 = Bp.y - Bp.R * Bp.flat * 0.5;
  const width = 2.2 + rng() * 1.8, sag = 1.1 + rng() * 1.3;
  const nu = 2 + (rng() < 0.5 ? 1 : 0), nv = 2;            // 2..3 along × 2 across
  const col = NET_COL();
  const P = (iu, iv) => {
    const tu = iu / nu, tv = iv / nv - 0.5;
    return [lerp(x0, x1, tu) + px * width * tv, lerp(y0, y1, tu) - Math.sin(tu * Math.PI) * sag, lerp(z0, z1, tu) + pz * width * tv];
  };
  for (let iu = 0; iu < nu; iu++) for (let iv = 0; iv < nv; iv++)
    B.net.quad(P(iu, iv), P(iu + 1, iv), P(iu + 1, iv + 1), P(iu, iv + 1), [0, 0, 2, 2], col);
}
// A larger horizontal hammock net half-covering a light well (well stays partly open).
// 2×2 quads with a gentle centre sag + slight tilt; ~20% register a walkable 'net' pad
// set a touch below the sheet centre so landing on it feels like sinking into the sag.
function addNetHammock(B, colData, rng, cx, cz, y, size, walk) {
  const half = size * 0.5, sag = 0.8 + rng() * 0.9;
  const tiltX = (rng() - 0.5) * 0.14, tiltZ = (rng() - 0.5) * 0.14;
  const col = NET_COL();
  const nu = 2, nv = 2;
  const P = (iu, iv) => {
    const u = (iu / nu - 0.5), v = (iv / nv - 0.5);
    const bx = cx + u * size, bz = cz + v * size;
    const by = y + u * size * tiltX + v * size * tiltZ - Math.cos(u * Math.PI) * Math.cos(v * Math.PI) * sag;
    return [bx, by, bz];
  };
  for (let iu = 0; iu < nu; iu++) for (let iv = 0; iv < nv; iv++)
    B.net.quad(P(iu, iv), P(iu + 1, iv), P(iu + 1, iv + 1), P(iu, iv + 1), [0, 0, size / 6, size / 6], col);
  if (walk) colData.pads.push({ x: cx, z: cz, r: half * 0.7, y: y - sag * 0.5, layer: 'net' });
}
// A long aerial creeper: a thin vine ribbon strung crown-to-crown in a shallow catenary
// (diagonal/horizontal, not a vertical drop). Multiple B.vine segments; sags in the middle.
function addCreeper(B, rng, x0, y0, z0, x1, y1, z1) {
  const segs = 5 + (rng() * 3 | 0), sag = 1.5 + rng() * 2.5, w = 0.22 + rng() * 0.16;
  const col = _c.copy(COL.vine).multiplyScalar(0.6 + rng() * 0.3).clone();
  const pt = (t) => [lerp(x0, x1, t), lerp(y0, y1, t) - 4 * sag * t * (1 - t), lerp(z0, z1, t)];
  const vRep = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 4));
  let prev = pt(0);
  for (let k = 1; k <= segs; k++) {
    const cur = pt(k / segs);
    // a thin vertical ribbon following the strand (top/bottom offset by w)
    B.vine.quad([prev[0], prev[1] - w, prev[2]], [cur[0], cur[1] - w, cur[2]], [cur[0], cur[1] + w, cur[2]], [prev[0], prev[1] + w, prev[2]],
      [0, 0, vRep / segs, 1], col);
    prev = cur;
  }
}

// A thin, climbable hanging vine: two crossed vine-textured ribbons + a `trunks`
// entry (r ≈ 0.35, h = yTop) so the existing climb code carries the player up it.
// yTop should sit at a walkable pad (a Weave platter or a limb) so the mantle-over
// at the top drops the player onto solid footing.
function addVineRope(B, colData, rng, x, z, yTop, yBot) {
  if (yTop - yBot < 2) return;
  const col = _c.copy(COL.vine).multiplyScalar(0.68 + rng() * 0.44).clone();
  const w = 0.5, vRep = Math.max(1, Math.round((yTop - yBot) / 5));
  const lean = (rng() - 0.5) * 0.7, bx = x + lean, bz = z + (rng() - 0.5) * 0.7;   // slight drift toward top
  B.vine.quad([x - w / 2, yBot, z], [x + w / 2, yBot, z], [bx + w / 2, yTop, bz], [bx - w / 2, yTop, bz], [0, 0, 1, vRep], col);
  B.vine.quad([x, yBot, z - w / 2], [x, yBot, z + w / 2], [bx, yTop, bz + w / 2], [bx, yTop, bz - w / 2], [0, 0, 1, vRep], col);
  // Terrain/collision contract: the rope's climb volume spans [yBot, yTop], so record the base.
  colData.trunks.push({ x, z, r: 0.35, y0: yBot, h: yTop - yBot });
}

// Spiral limb: a walkable/climbable ramp that wraps a tower's corners as it rises from
// roughly roof level up into the Weave band (24–28). 3–5 gently-sagging limb segments,
// each stepping to the next corner one level up, offset just off the facade.
function addSpiralLimb(B, colData, rng, cx, cz, w, d, h) {
  const O = 0.7;                                          // stand-off from the wall
  const corners = [
    [cx - w / 2 - O, cz - d / 2 - O], [cx + w / 2 + O, cz - d / 2 - O],
    [cx + w / 2 + O, cz + d / 2 + O], [cx - w / 2 - O, cz + d / 2 + O]
  ];
  const segs = 3 + (rng() * 3 | 0);                      // 3..5
  const startY = clamp(h - 12, 11, 20);
  const endY = clamp(h + 1, 25, 28);
  const dy = (endY - startY) / segs;
  let ci = (rng() * 4) | 0, prev = corners[ci], prevY = startY;
  for (let k = 0; k < segs; k++) {
    ci = (ci + 1) % 4;
    const nxt = corners[ci], ny = prevY + dy;
    addLimb(B, colData, rng, prev[0], prevY, prev[1], nxt[0], ny, nxt[1], 0.42, { segs: 2, sag: 0.3, layer: 'bough' });
    prev = nxt; prevY = ny;
  }
}

// L3 Crown Nest (y 32–40): a woven basket platform (walkable pad), a twig railing, 1–2
// leaf umbrellas ~3 m overhead (real shadow → shade patch), some glow plants, and on
// ~30% a lamp-material beacon blob. Sits atop a giant trunk or a tower roof.
function addCrownNest(B, colData, rng, x, y, z, r) {
  const basket = _c.copy(COL.wood).multiplyScalar(0.9 + rng() * 0.3).clone();
  B.plain.addGeo(tplCyl, compose(x, y - 0.45, z, r, 0.55, r), basket, 0.14, rng);        // basket body
  B.plain.addGeo(tplCyl, compose(x, y - 0.12, z, r, 0.18, r), _c.copy(COL.moss).multiplyScalar(0.9).clone(), 0.16, rng); // mossy rim
  colData.pads.push({ x, z, r: r * 0.82, y, layer: 'nest' });
  const posts = 8 + (rng() * 4 | 0);                                                       // twig railing
  for (let k = 0; k < posts; k++) {
    const a = k / posts * Math.PI * 2;
    B.plain.addGeo(tplCyl, compose(x + Math.cos(a) * r * 0.92, y, z + Math.sin(a) * r * 0.92, 0.05, 0.65, 0.05, (rng() - 0.5) * 0.12, 0, (rng() - 0.5) * 0.12), COL.deadwood, 0.1, rng);
  }
  const nUmb = 1 + (rng() < 0.5 ? 1 : 0);                                                  // leaf umbrellas overhead
  for (let k = 0; k < nUmb; k++) {
    const ur = r * (0.7 + rng() * 0.45);
    B.leaf.addGeo(tplBlob, compose(x + (rng() - 0.5) * r * 0.5, y + 2.8 + rng() * 0.8, z + (rng() - 0.5) * r * 0.5, ur, ur * 0.5, ur, 0, rng() * 7, 0),
      [COL.leafA, COL.leafC][(rng() * 2) | 0], 0.2, rng);
  }
  if (rng() < 0.6) {                                                                       // glow garden
    const n = 1 + (rng() * 2 | 0);
    for (let k = 0; k < n; k++) {
      const a = rng() * 7, d2 = rng() * r * 0.6, s = 0.22 + rng() * 0.25;
      B.glow.addGeo(tplBlob, compose(x + Math.cos(a) * d2, y + s * 0.4, z + Math.sin(a) * d2, s, s * 0.7, s, 0, rng() * 7, 0), COL.glowPlant, 0.3, rng);
    }
  }
  if (rng() < 0.3)                                                                         // beacon
    B.lamp.addGeo(tplBlob, compose(x, y + 0.85, z, 0.4, 0.4, 0.4), srgb(0xffe0b0), 0, rng);
}

// Terrain: `y` stays an ABSOLUTE override (the viaduct deck passes y=9); omit it and the
// tuft roots itself on the local ground. Same convention for addMushroomCluster below.
function addGrassTuft(B, rng, x, z, s, y) {
  y = (y === undefined) ? terrainY(x, z) : y;
  let col = rng() < 0.5 ? COL.grassA : COL.grassB;
  // Regions: scorch → straw, ashen → grey-dust; deepgreen keeps the lush base green.
  if (CUR_REG) {
    if (CUR_REG.biome === 'scorch') col = _c.copy(COL.leafDry).multiplyScalar(0.92).clone();
    else if (CUR_REG.biome === 'ashen') col = _c.copy(col).lerp(srgb(0x9a9a86), 0.4).clone();
  }
  const dark = _c.copy(col).multiplyScalar(0.55).clone();
  for (let k = 0; k < 2; k++) {
    const a = rng() * Math.PI + k * Math.PI / 2;
    const dx = Math.cos(a) * s * 0.5, dz = Math.sin(a) * s * 0.5;
    B.grass.quad([x - dx, y, z - dz], [x + dx, y, z + dz], [x + dx, y + s, z + dz], [x - dx, y + s, z - dz],
      [0, 0, 1, 1], col, dark);
  }
}

// Terrain: `by` is the building's base y (0 for anything still founded at world zero); `h` is
// the wall height ABOVE it, so the strips hang between by and by+h.
function addWallVines(B, rng, x0, z0, x1, z1, h, side, by) {
  // side: 0:+x face 1:-x 2:+z 3:-z ; strips hang on that face
  // NB: `b` is already taken below as a quad corner (`let a, b, c2, d`), so this must not be
  // named `b` — doing so puts every read here inside that later declaration's dead zone.
  const base = by || 0;
  const n = 5 + (rng() * 7 | 0);
  for (let k = 0; k < n; k++) {
    const w = 1.8 + rng() * 2.4;
    const top = base + h * (0.55 + rng() * 0.45);
    const len = top * (0.5 + rng() * 0.5);
    const o = 0.14;
    const t = rng();
    const col = _c.copy(COL.vine).multiplyScalar(0.8 + rng() * 0.4).clone();
    const vRep = Math.max(1, Math.round(len / 5));
    let a, b, c2, d;
    if (side === 0) { const px = x1 + o, pz = lerp(z0 + 1, z1 - 1, t); a = [px, top - len, pz - w / 2]; b = [px, top - len, pz + w / 2]; c2 = [px, top, pz + w / 2]; d = [px, top, pz - w / 2]; }
    else if (side === 1) { const px = x0 - o, pz = lerp(z0 + 1, z1 - 1, t); a = [px, top - len, pz + w / 2]; b = [px, top - len, pz - w / 2]; c2 = [px, top, pz - w / 2]; d = [px, top, pz + w / 2]; }
    else if (side === 2) { const pz = z1 + o, px = lerp(x0 + 1, x1 - 1, t); a = [px + w / 2, top - len, pz]; b = [px - w / 2, top - len, pz]; c2 = [px - w / 2, top, pz]; d = [px + w / 2, top, pz]; }
    else { const pz = z0 - o, px = lerp(x0 + 1, x1 - 1, t); a = [px - w / 2, top - len, pz]; b = [px + w / 2, top - len, pz]; c2 = [px + w / 2, top, pz]; d = [px - w / 2, top, pz]; }
    B.vine.quad(a, b, c2, d, [0, 0, 1, vRep], col);
  }
}

// Weathered facade tints — linear multipliers over the grey concrete atlas. Districts
// (Phase A) swap the pool per neighbourhood so each reads as its own architecture; the
// blocks pool doubles as the neutral fallback (concrete-heavy, the odd painted render).
const BONE_TINT = srgb(0xcfc8b4);   // Regions: scorch sun-bleached facade wash (paler, desaturated)
const DUST_TINT = srgb(0x8f8c82);   // Regions: ashen grey-dust facade wash
function mkTints(a) { return a.map(v => new THREE.Color(v[0], v[1], v[2])); }
const FACADE_TINTS = mkTints([          // blocks: pale grey / beige concrete
  [0.95, 0.94, 0.88], [0.95, 0.94, 0.88], [0.90, 0.89, 0.84], [0.86, 0.87, 0.85],
  [0.92, 0.90, 0.85], [0.82, 0.83, 0.82]
]);
const STYLE_TINTS = {
  oldtown: mkTints([                     // warm plasters
    [1.06, 0.74, 0.55], [1.03, 0.86, 0.58], [0.98, 0.79, 0.77], [1.07, 1.00, 0.85], [1.02, 0.80, 0.62]
  ]),
  blocks: FACADE_TINTS,
  glass: mkTints([                       // cool blue-greens
    [0.72, 0.82, 0.92], [0.73, 0.90, 0.85], [0.68, 0.86, 0.88], [0.75, 0.86, 0.80], [0.66, 0.80, 0.90]
  ]),
  works: mkTints([                       // rust / brown / dark red
    [0.66, 0.42, 0.30], [0.55, 0.40, 0.32], [0.60, 0.34, 0.30], [0.70, 0.52, 0.36], [0.48, 0.38, 0.34]
  ]),
  garden: mkTints([                      // pastels
    [0.98, 0.86, 0.88], [0.83, 0.92, 0.83], [1.02, 0.98, 0.82], [0.88, 0.85, 0.95], [0.82, 0.90, 0.96]
  ]),
};
// Per-style build config: window rhythm [base,range] for bay & floor, vine weight,
// roof kind, and roof colour (null → default weathered concrete roof).
const STYLE_CFG = {
  oldtown: { bay: [2.4, 1.0], flr: [3.0, 0.7], vine: 1.15, roof: 'gable', rc: 0x6b3f2f },
  blocks: { bay: [3.0, 1.6], flr: [3.2, 0.9], vine: 0.9, roof: 'flat', rc: null },
  glass: { bay: [2.0, 0.9], flr: [3.4, 0.9], vine: 0.45, roof: 'flat', rc: null, tiered: true },
  works: { bay: [4.6, 2.0], flr: [4.2, 1.4], vine: 1.1, roof: 'saw', rc: 0x6a4a35 },
  garden: { bay: [3.0, 1.1], flr: [3.0, 0.7], vine: 1.15, roof: 'hip', rc: 0x4e5a52 },
};
// District grid: 3×3-chunk regions, weighted style pick on its own salt.
const DISTRICT_SALT = 8123;
function districtStyle(ix, iz) {
  const r = hash2(Math.floor(ix / 3), Math.floor(iz / 3), DISTRICT_SALT) / 4294967296;
  if (r < 0.25) return 'oldtown';
  if (r < 0.50) return 'blocks';
  if (r < 0.65) return 'glass';
  if (r < 0.80) return 'works';
  return 'garden';
}
let CUR_STYLE = 'blocks';   // set per chunk by buildChunk; read by addBuilding
let CUR_REG = null;         // Regions: current chunk's region descriptor (set per chunk by buildChunk)

// Per-style building footprint + height ranges, applied where buildChunk sizes buildings.
// `tall` requests the taller end (towers-chunk / perimeter feature). Returns {w,d,h}.
function bldDims(style, rng, tall) {
  switch (style) {
    case 'oldtown': return { w: 7 + rng() * 4, d: 8 + rng() * 3, h: 6 + rng() * 7 };
    case 'glass': return { w: 11 + rng() * 6, d: 11 + rng() * 6, h: tall ? 28 + rng() * 27 : 12 + rng() * 13 };
    case 'works': return { w: 16 + rng() * 8, d: 14 + rng() * 6, h: 6 + rng() * 6 };
    case 'garden': return { w: 6 + rng() * 3, d: 6 + rng() * 3, h: 4 + rng() * 3 };
    default: return { w: 14 + rng() * 8, d: 11 + rng() * 5, h: tall ? 20 + rng() * 14 : 15 + rng() * 12 }; // blocks
  }
}

// Emit the 4 window walls of one box tier from y0 up by h. vFloorBase continues the
// atlas floor phase so window rows line up across stacked tiers. Returns floors used.
// Terrain: `base` is the building's ground datum (the terrain it was founded on, 0 for
// anything still at world zero). The tier whose y0 sits ON that datum is the GROUND tier and
// gets a BLD_SKIRT-deep buried plinth, so a wall can never show daylight under it where the
// grade falls away. The skirt extends the atlas v-range DOWNWARD at the same texels-per-metre
// rather than adding a floor, so every window row keeps the exact phase it had when flat.
const BLD_SKIRT = 0.4;
/* Districts (photoreal pass): which of core.js's FACADES a district is BUILT of. The four
   named districts each get their own material, so a street no longer differs only in window
   rhythm; garden shares oldtown's brick (pastel-tinted, and garden is the villagey outlier). */
const FACADE_OF = { oldtown: 'brick', blocks: 'concrete', glass: 'tile', works: 'render', garden: 'brick' };
function bldWalls(B, x0, z0, x1, z1, y0, h, bay, flr, tint, mossy, vFloorBase, uo, vo, base, opts) {
  const b = base === undefined ? 0 : base;
  const sk = (y0 <= b + 1e-6) ? BLD_SKIRT : 0;
  const w = x1 - x0, d = z1 - z0, y1 = y0 + h, yB = y0 - sk;
  const uc = Math.max(1, Math.round(w / bay)), ucd = Math.max(1, Math.round(d / bay));
  const vc = Math.max(1, Math.round(h / flr));
  const vb = vo + vFloorBase, vt = vb + vc, vB = vb - sk / flr;
  // moss creep at ground level; Regions: deepgreen raises the moss line to y≈3 (flora climbing)
  const mossTop = (CUR_REG && CUR_REG.biome === 'deepgreen') ? 3 : 0.02;
  const low = ((y0 - b) <= mossTop) ? mossy : tint;
  // Facade material: one Batch (and one atlas) per material, selected by district. Falls back
  // to the concrete batch if a caller hands us a batch set that predates the split.
  const F = FACADES[(opts && opts.mat) || FACADE_OF[CUR_STYLE] || 'concrete'] || FACADES.concrete;
  const bat = B[F.batch] || B.bld;
  bat.quad([x1, yB, z1], [x1, yB, z0], [x1, y1, z0], [x1, y1, z1], [uo, vB, uo + ucd, vt], tint, low);
  bat.quad([x0, yB, z0], [x0, yB, z1], [x0, y1, z1], [x0, y1, z0], [uo, vB, uo + ucd, vt], tint, low);
  bat.quad([x0, yB, z1], [x1, yB, z1], [x1, y1, z1], [x0, y1, z1], [uo, vB, uo + uc, vt], tint, low);
  bat.quad([x1, yB, z0], [x0, yB, z0], [x0, y1, z0], [x1, y1, z0], [uo, vB, uo + uc, vt], tint, low);
  if (!opts || opts.relief !== false)
    bldRelief(bat, x0, z0, x1, z1, y0, h, uc, ucd, vc, uo, vt, vB, sk, tint, low, b, mossTop, F.bays,
      !!(opts && opts.cornice));
  return vc;
}

/* ---- Modelled facade relief -------------------------------------------------------
   The atlas PAINTS reveals, sills and slab bands, and a painted shadow dies the moment the
   light rakes along the wall or the player walks up to it — which is most of a street. So
   the same features are also BUILT: a plinth at the pavement, a band at every storey line,
   a cornice under the roofline, and a splayed surround with a projecting cill around every
   opening on the storeys you can actually reach.

   Two hard constraints shape all of it.
     · NOT ONE rng() CALL. Batch.quad consumes no randomness — only addGeo draws one per
       vertex — so every quad below is free; a single rng() here would re-roll the layout of
       every chunk generated after this building. All variation comes from what addBuilding
       has already drawn (uo/vo/bay/flr) or is a pure function of position.
     · The four wall quads are emitted UNCHANGED and the relief is added in front of them,
       so the terrain skirt, the atlas v-range and the "no daylight under a wall on a grade"
       guarantee are bit-for-bit what they were. The plinth is the only piece that reaches
       below y0, and it is dug REL_DIG deeper than the wall foot so a course projecting
       REL_PLINTH_O past the footprint cannot surface on a grade the wall itself is buried in
       (max terrain gradient is under 8 degrees, so 10 cm out costs at most 1.4 cm of drop).

   The window surround is SPLAYED, not a flat proud band: it rises from the wall plane at its
   outer edge to REL_REV_O at the opening, then steps straight back to the wall. That keeps
   the geometry closed — a flat band leaves an open step that shows along the wall — and the
   step at the opening edge is the face that catches the shadow and reads as the reveal.

   Corners are mitred by running every outward FACE the full outer extent of its side: the +x
   face reaches z1+o and the +z face reaches x1+o, so the two meet exactly on the corner edge
   with no overlap to z-fight. The horizontal ledges instead run full on the x-facing sides
   and inner-only on the z-facing ones, which rings the building without double-covering. */
const REL_FLOORS = 3;          // storeys that get modelled openings (the ones you stand next to)
const REL_BANDS = 9;           // storey bands modelled before the painted ones take over
const REL_DIG = 0.35;          // how far below the wall foot the plinth is buried
const REL_PLINTH_O = 0.10, REL_BAND_O = 0.065, REL_CORN_O = 0.19;
const REL_REV_O = 0.05, REL_SILL_O = 0.095;
function bldRelief(bat, x0, z0, x1, z1, y0, h, uc, ucd, vc, uo, vt, vB, sk, tint, low, b, mossTop, bays, cornice) {
  if (!bays) return;
  const y1 = y0 + h, yB = y0 - sk, fh = h / vc, span = y1 - yB;
  const dx = x1 - x0, dz = z1 - z0;
  let g0 = 0.5;                                   // lowest painted sill, in cell fractions
  for (const col of bays) for (const o of col) if (o[2] < g0) g0 = o[2];
  const plinthH = Math.min(0.52, 0.58 * g0 * fh);
  // Vertex tint follows the wall quads' own low→tint gradient so a projecting course never
  // pops against the wall behind it. low === tint on every tier above the moss line.
  const flat = low === tint;
  const cAt = (y) => flat ? tint : _c.copy(low).lerp(tint, clamp((y - yB) / span, 0, 1)).clone();
  const V = (y) => vB + (y - yB) * (vt - vB) / span;
  for (let s = 0; s < 4; s++) {
    const L = s < 2 ? dz : dx, nB = s < 2 ? ucd : uc;
    if (L < 1.2 || h < 1.6) continue;
    const U = (t) => uo + t * nB;
    const P = s === 0 ? (t, y, o) => [x1 + o, y, z1 - t * dz]
      : s === 1 ? (t, y, o) => [x0 - o, y, z0 + t * dz]
        : s === 2 ? (t, y, o) => [x0 + t * dx, y, z1 + o]
          : (t, y, o) => [x1 - t * dx, y, z0 - o];
    // outward panel from (t0,yb) to (t1,yt); oB/oT differ to splay it back to the wall
    const face = (t0, yb, t1, yt, oB, oT) =>
      bat.quad(P(t0, yb, oB), P(t1, yb, oB), P(t1, yt, oT), P(t0, yt, oT),
        [U(t0), V(yb), U(t1), V(yt)], cAt(yt), cAt(yb));
    // horizontal ledge at y — up = the weathering face, else the soffit under an overhang
    const ledge = (t0, t1, y, oIn, oOut, up) => {
      const c = cAt(y), vI = V(y), vO = V(up ? y - (oOut - oIn) : y + (oOut - oIn));
      if (up) bat.quad(P(t0, y, oOut), P(t1, y, oOut), P(t1, y, oIn), P(t0, y, oIn), [U(t0), vO, U(t1), vI], c, c);
      else bat.quad(P(t0, y, oIn), P(t1, y, oIn), P(t1, y, oOut), P(t0, y, oOut), [U(t0), vI, U(t1), vO], c, c);
    };
    // the step back to the wall at an opening edge; dir +1 faces along +t, -1 along -t
    const ret = (t, yb, yt, oIn, oOut, dir) => {
      const uO = U(t + dir * (oOut - oIn) / L), uI = U(t), ca = cAt(yt), cb = cAt(yb);
      if (dir > 0) bat.quad(P(t, yb, oOut), P(t, yb, oIn), P(t, yt, oIn), P(t, yt, oOut), [uO, V(yb), uI, V(yt)], ca, cb);
      else bat.quad(P(t, yb, oIn), P(t, yb, oOut), P(t, yt, oOut), P(t, yt, oIn), [uI, V(yb), uO, V(yt)], ca, cb);
    };
    const eP = REL_PLINTH_O / L, eB = REL_BAND_O / L, eC = REL_CORN_O / L;
    const full = s < 2;                            // this side owns the corner squares of the ring
    // 1. plinth: the base course a building meets the pavement with
    if (sk > 0 && plinthH > 0.14) {
      face(-eP, yB - REL_DIG, 1 + eP, y0 + plinthH, REL_PLINTH_O, REL_PLINTH_O);
      ledge(full ? -eP : 0, full ? 1 + eP : 1, y0 + plinthH, 0, REL_PLINTH_O, true);
    }
    // 2. storey bands: the slab edge at every floor line — the horizontal shadow rhythm
    //    that reads all the way down a street
    for (let k = 1; k < vc && k <= REL_BANDS; k++) {
      const yk = y0 + k * fh;
      if (yk + 0.09 > y1 - 0.1) break;
      face(-eB, yk - 0.13, 1 + eB, yk + 0.09, REL_BAND_O, REL_BAND_O);
      ledge(full ? -eB : 0, full ? 1 + eB : 1, yk + 0.09, 0, REL_BAND_O, true);
      ledge(full ? -eB : 0, full ? 1 + eB : 1, yk - 0.13, 0, REL_BAND_O, false);
    }
    // 2b. sill course: above the modelled storeys the openings go back to being painted, so
    //     the cill line becomes ONE continuous string course instead of a ledge per window.
    //     A twelfth of the geometry for most of the read, and it is what a real brick or
    //     spandrel-panel facade does with its cill line anyway.
    for (let k = REL_FLOORS; k < vc && k <= REL_BANDS; k++) {
      const ys = y0 + (k + g0) * fh, o = REL_BAND_O * 0.7, e = o / L;
      if (ys + 0.06 > y1 - 0.1) break;
      face(-e, ys - 0.09, 1 + e, ys + 0.03, o, o);
      ledge(full ? -e : 0, full ? 1 + e : 1, ys + 0.03, 0, o, true);
      ledge(full ? -e : 0, full ? 1 + e : 1, ys - 0.09, 0, o, false);
    }
    // 3. cornice: a two-step crown under the roofline (skipped where a pitched roof or a
    //    ragged ruin parapet already ends the wall)
    if (cornice && h > 3.2) {
      const oA = REL_CORN_O * 0.5, yA = y1 - 0.44, yM = y1 - 0.2;
      const t0 = full ? -eC : 0, t1 = full ? 1 + eC : 1;
      face(-eC * 0.5, yA, 1 + eC * 0.5, yM, oA, oA);
      ledge(full ? -eC * 0.5 : 0, full ? 1 + eC * 0.5 : 1, yA, 0, oA, false);
      face(-eC, yM, 1 + eC, y1, REL_CORN_O, REL_CORN_O);
      ledge(t0, t1, yM, oA, REL_CORN_O, false);
      ledge(t0, t1, y1, 0, REL_CORN_O, true);
    }
    // 4. openings on the lowest storeys: splayed surround + a projecting cill with a drip
    const nRel = Math.min(vc, REL_FLOORS);
    for (let k = 0; k < nRel; k++) {
      const fy = y0 + k * fh;
      for (let i = 0; i < nB; i++) {
        for (const o of bays[(uo + i) % BLD_CELLS]) {
          const ta = (i + o[0]) / nB, tb = (i + o[1]) / nB;
          const yb2 = fy + o[2] * fh, yt2 = fy + o[3] * fh;
          if ((tb - ta) * L < 0.55 || yt2 - yb2 < 0.7 || yt2 > y1 - 0.12) continue;
          const bw = Math.min(0.2, (tb - ta) * L * 0.3) / L;      // splay width, in t units
          const bh = Math.min(0.2, (yt2 - yb2) * 0.16);
          const R = REL_REV_O;
          // head: splay up to the wall, then the soffit that shadows the top of the glass
          face(ta - bw, yt2, tb + bw, yt2 + bh, R, 0);
          ledge(ta - bw, tb + bw, yt2, 0, R, false);
          // jambs: splay in from the wall on each side, then step back at the opening
          bat.quad(P(ta - bw, yb2, 0), P(ta, yb2, R), P(ta, yt2, R), P(ta - bw, yt2, 0),
            [U(ta - bw), V(yb2), U(ta), V(yt2)], cAt(yt2), cAt(yb2));
          ret(ta, yb2, yt2, 0, R, 1);
          bat.quad(P(tb, yb2, R), P(tb + bw, yb2, 0), P(tb + bw, yt2, 0), P(tb, yt2, R),
            [U(tb), V(yb2), U(tb + bw), V(yt2)], cAt(yt2), cAt(yb2));
          ret(tb, yb2, yt2, 0, R, -1);
          // cill: weathered top sloping out and down, a front face, and a drip soffit
          const so = REL_SILL_O, wt = 0.035, st = Math.min(0.13, (yt2 - yb2) * 0.1);
          const cs = cAt(yb2);
          bat.quad(P(ta - bw, yb2 - wt, so), P(tb + bw, yb2 - wt, so), P(tb + bw, yb2, 0), P(ta - bw, yb2, 0),
            [U(ta - bw), V(yb2 - wt - so), U(tb + bw), V(yb2)], cs, cs);
          face(ta - bw, yb2 - wt - st, tb + bw, yb2 - wt, so, so);
          ledge(ta - bw, tb + bw, yb2 - wt - st, 0, so, false);
        }
      }
    }
  }
}
// Pitched gable roof: two sloped quads + two triangular gable ends (facade tint), ridge
// along the long horizontal axis. Slopes/ends to B.plain (no window texture on the roof).
// `opts.interior` additionally emits the four faces reversed-wound and darker (a ceiling
// tint) so the roof also reads from BELOW — matPlain is FrontSide, so single-sided roofs
// vanish when viewed from under the eaves. Interior faces are for enterable/open structures
// ONLY (the skyhouse pavilion); closed buildings/huts must omit `opts` to keep the city's
// vertex count and geometry unchanged. RNG-free: this runs mid-stream in building generation,
// so it must never draw from rng (any draw here reflows every gabled district).
function addGableRoof(B, x0, z0, x1, z1, y, roofCol, gableCol, opts) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  const rh = clamp(Math.min(w, d) * 0.45, 1.4, 4.5);
  const interior = !!(opts && opts.interior);
  if (w >= d) {                                    // ridge runs along x, eaves at z0 / z1
    B.plain.quad([x1, y, z0], [x0, y, z0], [x0, y + rh, cz], [x1, y + rh, cz], [0, 0, 1, 1], roofCol);
    B.plain.quad([x0, y, z1], [x1, y, z1], [x1, y + rh, cz], [x0, y + rh, cz], [0, 0, 1, 1], roofCol);
    B.plain.quad([x0, y, z0], [x0, y, z1], [x0, y + rh, cz], [x0, y + rh, cz], [0, 0, 1, 1], gableCol);
    B.plain.quad([x1, y, z1], [x1, y, z0], [x1, y + rh, cz], [x1, y + rh, cz], [0, 0, 1, 1], gableCol);
    if (interior) {                                // undersides: same 4 faces, winding reversed, ceiling tint
      const rc = _c.copy(roofCol).multiplyScalar(0.55).clone(), gc = _c.copy(gableCol).multiplyScalar(0.55).clone();
      B.plain.quad([x1, y + rh, cz], [x0, y + rh, cz], [x0, y, z0], [x1, y, z0], [0, 0, 1, 1], rc);
      B.plain.quad([x0, y + rh, cz], [x1, y + rh, cz], [x1, y, z1], [x0, y, z1], [0, 0, 1, 1], rc);
      B.plain.quad([x0, y + rh, cz], [x0, y + rh, cz], [x0, y, z1], [x0, y, z0], [0, 0, 1, 1], gc);
      B.plain.quad([x1, y + rh, cz], [x1, y + rh, cz], [x1, y, z0], [x1, y, z1], [0, 0, 1, 1], gc);
    }
  } else {                                         // ridge runs along z, eaves at x0 / x1
    B.plain.quad([x0, y, z0], [x0, y, z1], [cx, y + rh, z1], [cx, y + rh, z0], [0, 0, 1, 1], roofCol);
    B.plain.quad([x1, y, z1], [x1, y, z0], [cx, y + rh, z0], [cx, y + rh, z1], [0, 0, 1, 1], roofCol);
    B.plain.quad([x0, y, z1], [x1, y, z1], [cx, y + rh, z1], [cx, y + rh, z1], [0, 0, 1, 1], gableCol);
    B.plain.quad([x1, y, z0], [x0, y, z0], [cx, y + rh, z0], [cx, y + rh, z0], [0, 0, 1, 1], gableCol);
    if (interior) {
      const rc = _c.copy(roofCol).multiplyScalar(0.55).clone(), gc = _c.copy(gableCol).multiplyScalar(0.55).clone();
      B.plain.quad([cx, y + rh, z0], [cx, y + rh, z1], [x0, y, z1], [x0, y, z0], [0, 0, 1, 1], rc);
      B.plain.quad([cx, y + rh, z1], [cx, y + rh, z0], [x1, y, z0], [x1, y, z1], [0, 0, 1, 1], rc);
      B.plain.quad([cx, y + rh, z1], [cx, y + rh, z1], [x1, y, z1], [x0, y, z1], [0, 0, 1, 1], gc);
      B.plain.quad([cx, y + rh, z0], [cx, y + rh, z0], [x0, y, z0], [x1, y, z0], [0, 0, 1, 1], gc);
    }
  }
}
// Pyramid hip roof: apex over the centre, one triangle per eave edge.
function addPyramidRoof(B, x0, z0, x1, z1, y, roofCol) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const rh = clamp(Math.min(x1 - x0, z1 - z0) * 0.5, 1.6, 5);
  const ap = [cx, y + rh, cz];
  B.plain.quad([x1, y, z0], [x0, y, z0], ap, ap, [0, 0, 1, 1], roofCol);   // -z edge
  B.plain.quad([x0, y, z1], [x1, y, z1], ap, ap, [0, 0, 1, 1], roofCol);   // +z edge
  B.plain.quad([x0, y, z0], [x0, y, z1], ap, ap, [0, 0, 1, 1], roofCol);   // -x edge
  B.plain.quad([x1, y, z1], [x1, y, z0], ap, ap, [0, 0, 1, 1], roofCol);   // +x edge
}
// Sawtooth shed roof: 3–5 asymmetric prisms across x (vertical riser + slope + side fills).
function addSawtoothRoof(B, x0, z0, x1, z1, y, roofCol, rng) {
  const n = 3 + (rng() * 3 | 0), bw = (x1 - x0) / n;
  const dark = _c.copy(roofCol).multiplyScalar(0.72).clone();
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * bw, xb = xa + bw, sh = 1.0 + rng() * 1.6, yt = y + sh;
    B.plain.quad([xa, y, z0], [xa, y, z1], [xa, yt, z1], [xa, yt, z0], [0, 0, 1, 1], dark);          // vertical riser (-x)
    B.plain.quad([xb, y, z0], [xa, yt, z0], [xa, yt, z1], [xb, y, z1], [0, 0, 1, 1], roofCol);       // slope down to next
    B.plain.quad([xa, y, z0], [xa, yt, z0], [xb, y, z0], [xb, y, z0], [0, 0, 1, 1], dark);           // side fill z0
    B.plain.quad([xb, y, z1], [xa, yt, z1], [xa, y, z1], [xa, y, z1], [0, 0, 1, 1], dark);           // side fill z1
  }
}

/* ---- Districts (Phase B): per-style ornaments — all batched, deterministic ----
   Small helpers hung on the finished building box, keyed to the same tint/rng so
   each neighbourhood reads as its own architecture. Offsets are >=0.06 off the
   facade so nothing z-fights the window atlas. */
const AWNING_COLS = [0x8a4033, 0x7a5a2f, 0x3f5e46, 0x35526b, 0x6b4a2f, 0x86502f].map(srgb);
const MURAL_COLS = [0x6a6f5c, 0x5c5750, 0x6e5a4a, 0x4e5a5c, 0x746a54, 0x5a5060].map(srgb);
const BRICK_COL = srgb(0x5a3428), BRICK_DK = srgb(0x47281f);
// Little details (sprinkle pass) palettes.
const BENCH_COL = srgb(0x6a5237), MAILBOX_COL = srgb(0x8a4a3a);
const PUDDLE_COL = srgb(0x1a222b), PUDDLE_SHEEN = srgb(0x4a5a68);
const MUSH_COLS = [0xcabfa0, 0xb87a5a, 0xd4a86a, 0xa8564a, 0xc9b28c].map(srgb), MUSH_STEM = srgb(0xd8cdb2);
const NEST_COL = srgb(0x6b5334), FRUIT_COLS = [0x9a7a3a, 0x8a4a3a, 0x6a7a3a, 0xa06a4a, 0x7a6a4a].map(srgb);
const WEB_COL = srgb(0xd6dcd8);
// side 0:+x 1:-x 2:+z 3:-z. faceMap(u,o) → world [x,z]: u runs along the face, o outward.
function faceMap(side, x0, x1, z0, z1) {
  if (side === 0) return (u, o) => [x1 + o, u];
  if (side === 1) return (u, o) => [x0 - o, u];
  if (side === 2) return (u, o) => [u, z1 + o];
  return (u, o) => [u, z0 - o];
}
function faceSpan(side, x0, x1, z0, z1) {   // [u0,u1] range along a face
  return (side === 0 || side === 1) ? [z0, z1] : [x0, x1];
}
// Flat panel flush against a face, wound so its normal faces outward. u = centre along
// the face, pw = half-width, yb..yt vertical, o = standoff.
function facePanel(batch, side, x0, x1, z0, z1, u, pw, yb, yt, o, col, colB) {
  let a, b, c2, d;
  if (side === 0) { const px = x1 + o; a = [px, yb, u + pw]; b = [px, yb, u - pw]; c2 = [px, yt, u - pw]; d = [px, yt, u + pw]; }
  else if (side === 1) { const px = x0 - o; a = [px, yb, u - pw]; b = [px, yb, u + pw]; c2 = [px, yt, u + pw]; d = [px, yt, u - pw]; }
  else if (side === 2) { const pz = z1 + o; a = [u - pw, yb, pz]; b = [u + pw, yb, pz]; c2 = [u + pw, yt, pz]; d = [u - pw, yt, pz]; }
  else { const pz = z0 - o; a = [u + pw, yb, pz]; b = [u - pw, yb, pz]; c2 = [u - pw, yt, pz]; d = [u + pw, yt, pz]; }
  batch.quad(a, b, c2, d, [0, 0, 1, 1], col, colB || col);
}
// A tilted awning slab (thin centred box) projecting from a face; robust to winding.
// Terrain: `by` (optional, default 0) is the building base the support rods stand on.
function faceAwning(B, side, x0, x1, z0, z1, u, pw, yTop, proj, col, rng, by) {
  const drop = 0.5 + rng() * 0.4, tilt = 0.28 + rng() * 0.12;
  const map = faceMap(side, x0, x1, z0, z1);
  const [mx, mz] = map(u, proj / 2);                               // slab centre, half-projected
  const yc = yTop - drop / 2;
  const dep = proj * 1.12, th = 0.09;
  if (side === 0) B.plain.addGeo(tplBoxC, compose(mx, yc, mz, dep, th, 2 * pw, 0, 0, tilt), col, 0.05, rng);
  else if (side === 1) B.plain.addGeo(tplBoxC, compose(mx, yc, mz, dep, th, 2 * pw, 0, 0, -tilt), col, 0.05, rng);
  else if (side === 2) B.plain.addGeo(tplBoxC, compose(mx, yc, mz, 2 * pw, th, dep, -tilt, 0, 0), col, 0.05, rng);
  else B.plain.addGeo(tplBoxC, compose(mx, yc, mz, 2 * pw, th, dep, tilt, 0, 0), col, 0.05, rng);
  // two thin support rods dropping from the outer edge to storefront height
  const rc = _c.copy(COL.wood).multiplyScalar(0.7).clone();
  for (const s of [-1, 1]) {
    const [rx, rz] = map(u + s * pw * 0.85, proj * 0.95);
    B.plain.addGeo(tplCyl, compose(rx, by || 0, rz, 0.05, yTop - drop - (by || 0), 0.05), rc, 0, rng);
  }
}

// oldtown: awnings + shutters + a gable chimney.
// Terrain: every orn* helper now takes the building base `by` as its LAST argument and adds it
// to the y of anything it hangs, so ornaments ride up with a building founded on relief. All
// heights handed in (h, wallTop) stay RELATIVE to that base.
function ornOldtown(B, colData, rng, x0, z0, x1, z1, cx, cz, w, d, h, roofType, bay, by) {
  by = by || 0;
  if (rng() < 0.5) {                                                // storefront awnings
    let sides = [0, 1, 2, 3].filter(() => rng() < 0.4);
    if (!sides.length) sides = [(rng() * 4) | 0];
    for (const s of sides.slice(0, 2)) {
      const [u0, u1] = faceSpan(s, x0, x1, z0, z1), fl = u1 - u0;
      if (fl < 3) continue;
      const pw = Math.min(1.6 + rng() * 1.2, fl / 2 - 0.6);
      const u = lerp(u0 + pw + 0.4, u1 - pw - 0.4, rng());
      const col = _c.copy(AWNING_COLS[(rng() * AWNING_COLS.length) | 0]).multiplyScalar(0.8 + rng() * 0.3).clone();
      faceAwning(B, s, x0, x1, z0, z1, u, pw, by + 2.9 + rng() * 0.5, 1.0 + rng() * 0.5, col, rng, by);
    }
  }
  if (rng() < 0.4) {                                                // window shutters on a couple of bays
    const dark = _c.copy(BRICK_DK).lerp(COL.wood, 0.5).multiplyScalar(0.8).clone();
    const sides = [0, 1, 2, 3].filter(() => rng() < 0.45);
    for (const s of sides.slice(0, 2)) {
      const [u0, u1] = faceSpan(s, x0, x1, z0, z1), fl = u1 - u0;
      const nb = Math.max(1, Math.round(fl / bay));
      const nfl = Math.max(1, Math.floor(h / 3.2));
      for (let bi = 0; bi < nb; bi++) {
        if (rng() < 0.5) continue;
        const uc = u0 + (bi + 0.5) * fl / nb, half = Math.min(0.9, fl / nb * 0.32);
        const fi = 1 + ((rng() * Math.max(1, nfl - 1)) | 0), yb = fi * 3.2 - 1.3;
        if (yb + 1.6 > h) continue;
        for (const sgn of [-1, 1])
          facePanel(B.plain, s, x0, x1, z0, z1, uc + sgn * (half + 0.3), 0.28, by + yb, by + yb + 1.6, 0.07, dark);
      }
    }
  }
  if ((roofType === 'gable' || roofType === 'hip') && rng() < 0.6) {  // brick chimney on the ridge
    const chx = cx + (rng() - 0.5) * w * 0.4, chz = cz + (rng() - 0.5) * d * 0.4;
    const ch = 1.4 + rng() * 1.4;
    B.plain.addGeo(tplBox, compose(chx, by + h, chz, 0.7, ch, 0.7), BRICK_COL, 0.12, rng);
    B.plain.addGeo(tplBox, compose(chx, by + h + ch, chz, 0.9, 0.22, 0.9), BRICK_DK, 0.1, rng);
    // Life pass: an occasional smoking oldtown chimney (runtime picks the nearest few).
    if (rng() < 0.4) colData.smokes.push({ x: chx, y: by + h + ch + 0.25, z: chz, r: 0.28 });
  }
  // Life pass: a NEW fluttering wall-banner at a free upper face spot (not the awnings above).
  if (rng() < 0.3 && h >= 5) {
    const s = (rng() * 4) | 0, [u0, u1] = faceSpan(s, x0, x1, z0, z1), map = faceMap(s, x0, x1, z0, z1);
    const uc = lerp(u0 + 0.9, u1 - 0.9, rng());
    const [ax, az] = map(uc, 0), [bx, bz] = map(uc, 1);
    let nx = bx - ax, nz = bz - az; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const [px, pz] = map(uc, 0.14);
    colData.bannerAnchors.push({ x: px, y: by + Math.min(h - 0.6, 3.2 + rng() * (h - 4)), z: pz, nx, nz, hue: (rng() * 3) | 0 });
  }
}

// blocks: balcony grids + an occasional faded mural.
function ornBlocks(B, colData, rng, x0, z0, x1, z1, cx, cz, w, d, h, roofType, by) {
  by = by || 0;
  if (rng() < 0.55 && h >= 8) {                                    // balcony grids
    const nSides = 1 + (rng() < 0.4 ? 1 : 0);
    const chosen = [0, 1, 2, 3].sort(() => rng() - 0.5).slice(0, nSides);
    const rail = _c.copy(COL.wire).lerp(COL.rock, 0.4).clone();
    const slab = _c.copy(COL.sidewalk).multiplyScalar(0.7).clone();
    const flr = 3.2, nfl = Math.max(1, Math.floor(h / flr) - 1);
    for (const s of chosen) {
      const [u0, u1] = faceSpan(s, x0, x1, z0, z1), fl = u1 - u0;
      const map = faceMap(s, x0, x1, z0, z1);
      const nc = 1 + (rng() < 0.5 ? 1 : 0), bw = Math.min(2.4, fl / (nc + 1));
      for (let ci = 0; ci < nc; ci++) {
        const uc = lerp(u0 + bw, u1 - bw, nc === 1 ? 0.35 + rng() * 0.3 : ci / Math.max(1, nc - 1));
        const [mx, mz] = map(uc, 0.35);
        for (let f = 1; f <= nfl; f++) {
          const yb = by + f * flr;
          B.plain.addGeo(tplBoxC, compose(mx, yb, mz, (s < 2 ? 0.7 : bw), 0.14, (s < 2 ? bw : 0.7)), slab, 0.05, rng);
          B.plain.addGeo(tplBoxC, compose(mx, yb + 0.5, mz, (s < 2 ? 0.66 : bw), 0.5, (s < 2 ? bw : 0.66)), rail, 0.05, rng);  // rail block (open feel via thin)
          const [rx, rz] = map(uc, 0.7);
          B.plain.addGeo(tplBox, compose(rx, yb, rz, (s < 2 ? 0.06 : bw), 0.5, (s < 2 ? bw : 0.06)), rail, 0, rng);            // outer rail bar
        }
      }
    }
  }
  if (rng() < 0.15) {                                              // faded 2-tone mural
    const s = (rng() * 4) | 0, [u0, u1] = faceSpan(s, x0, x1, z0, z1), fl = u1 - u0;
    if (fl > 5 && h > 10) {
      const mw = Math.min(fl * 0.5, 4 + rng() * 3), uc = lerp(u0 + mw / 2 + 1, u1 - mw / 2 - 1, rng());
      const yb = by + 3 + rng() * (h - 9), mh = 3 + rng() * 3;
      const a = _c.copy(MURAL_COLS[(rng() * MURAL_COLS.length) | 0]).multiplyScalar(0.9).clone();
      const b = _c.copy(MURAL_COLS[(rng() * MURAL_COLS.length) | 0]).multiplyScalar(0.9).clone();
      facePanel(B.plain, s, x0, x1, z0, z1, uc, mw / 2, yb, yb + mh, 0.06, a);
      facePanel(B.plain, s, x0, x1, z0, z1, uc, mw / 2, yb, yb + mh * 0.42, 0.065, b);
    }
  }
}

// glass: rooftop antenna/mast cluster + occasional vertical fin strips.
function ornGlass(B, colData, rng, x0, z0, x1, z1, cx, cz, w, d, h, top, by) {
  by = by || 0;
  if (rng() < 0.7) {                                               // mast cluster on the top tier
    const tx0 = top.x0, tz0 = top.z0, tx1 = top.x1, tz1 = top.z1, ty = by + top.y;
    const n = 2 + (rng() * 3 | 0);
    let tallX = cx, tallZ = cz, tallH = 0;
    for (let k = 0; k < n; k++) {
      const mx = lerp(tx0 + 0.8, tx1 - 0.8, rng()), mz = lerp(tz0 + 0.8, tz1 - 0.8, rng());
      const mh = 2.5 + rng() * 5;
      B.plain.addGeo(tplCyl, compose(mx, ty, mz, 0.06 + rng() * 0.04, mh, 0.06 + rng() * 0.04), COL.wire, 0, rng);
      if (mh > tallH) { tallH = mh; tallX = mx; tallZ = mz; }
    }
    B.lamp.addGeo(tplBlob, compose(tallX, ty + tallH, tallZ, 0.16, 0.16, 0.16), srgb(0xff5a4a), 0, rng);   // blinking-style beacon
  }
  if (rng() < 0.3) {                                               // vertical fin strips along one face
    const s = (rng() * 4) | 0, [u0, u1] = faceSpan(s, x0, x1, z0, z1), fl = u1 - u0;
    const map = faceMap(s, x0, x1, z0, z1);
    const nf = 3 + (rng() * 4 | 0), fc = _c.copy(COL.rock).multiplyScalar(0.9).clone();
    for (let k = 0; k < nf; k++) {
      const uc = lerp(u0 + 0.6, u1 - 0.6, nf === 1 ? 0.5 : k / (nf - 1));
      const [mx, mz] = map(uc, 0.2);
      B.plain.addGeo(tplBox, compose(mx, by + 0.5, mz, (s < 2 ? 0.4 : 0.14), h - 1, (s < 2 ? 0.14 : 0.4)), fc, 0.04, rng);
    }
  }
}

// works: brick chimney stack + a rusty silo with pipe runs to the shed.
function ornWorks(B, colData, rng, x0, z0, x1, z1, cx, cz, w, d, h, by) {
  by = by || 0;
  if (rng() < 0.5) {                                               // tall brick chimney stack
    const chx = lerp(x0 + 1.5, x1 - 1.5, rng()), chz = lerp(z0 + 1.5, z1 - 1.5, rng());
    const ch = h * 1.5, cw = 0.8 + rng() * 0.5;
    // the stack is founded on its own ground, not the shed's, so it never floats on a grade
    const cy = Math.min(by, terrainY(chx, chz) - 0.3);
    B.plain.addGeo(tplBox, compose(chx, cy, chz, cw, ch + (by - cy), cw), BRICK_COL, 0.14, rng);
    B.plain.addGeo(tplBox, compose(chx, by + ch, chz, cw + 0.2, 0.3, cw + 0.2), BRICK_DK, 0.1, rng);
    colData.trunks.push({ x: chx, z: chz, r: cw * 0.75, y0: cy, h: ch + (by - cy) });
    // Life pass: works-district chimneys smoke steadily (the runtime picks the nearest few).
    colData.smokes.push({ x: chx, y: by + ch + 0.3, z: chz, r: 0.45 });
  }
  if (rng() < 0.35) {                                              // silo beside the shed
    const s = (rng() * 4) | 0, map = faceMap(s, x0, x1, z0, z1), [u0, u1] = faceSpan(s, x0, x1, z0, z1);
    const uc = lerp(u0 + 3, u1 - 3, rng()), r = 2 + rng();
    const [sx, sz] = map(uc, r + 0.6), sh = 8 + rng() * 4;
    const rust = _c.copy(COL.rust).multiplyScalar(0.85 + rng() * 0.3).clone();
    const sy = terrainY(sx, sz) - 0.3;                             // the silo stands outside the footprint
    B.plain.addGeo(tplCyl, compose(sx, sy, sz, r, sh + 0.3, r), rust, 0.12, rng);
    B.plain.addGeo(tplBlob, compose(sx, sy + sh + 0.3, sz, r, r * 0.6, r), _c.copy(rust).multiplyScalar(0.85).clone(), 0.1, rng);  // domed cap
    colData.trunks.push({ x: sx, z: sz, r: r + 0.2, y0: sy, h: sh + 0.3 });
    // horizontal pipe runs between shed wall and silo
    const [wx, wz] = map(uc, 0.2);
    for (let p = 0; p < 2; p++) {
      const py = by + 2.5 + p * 2 + rng();
      B.plain.addGeo(tplCyl, segMat(wx, py, wz, sx, py, sz, 0.14 + rng() * 0.06), COL.rust, 0.1, rng);
    }
  }
}

// garden: dress a yard gap between detached houses — a low weathered-wood fence around
// its perimeter, a small shed (~25%) and a hanging laundry line (~30%). Yards live inside
// the INSET band so fences never reach the sidewalk or the street trees.
const FENCE_COL = srgb(0x6b5a44);
function addGardenYard(B, colData, rng, yx0, yz0, yx1, yz1, houseWall) {
  const yw = yx1 - yx0, yd = yz1 - yz0;
  if (yw < 1.4 || yd < 1.4) return;
  // Terrain: one sample at the yard centre carries the whole enclosure — posts and rails must
  // agree or the fence saws itself apart across the grade.
  const yty = terrainY((yx0 + yx1) / 2, (yz0 + yz1) / 2);
  const post = _c.copy(FENCE_COL).multiplyScalar(0.8 + rng() * 0.35).clone();
  const railY = 0.55 + rng() * 0.25;                               // height ABOVE the yard grade
  const runFence = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L / 1.5));
    for (let k = 0; k <= n; k++) {
      const t = k / n, px = lerp(ax, bx, t), pz = lerp(az, bz, t);
      B.plain.addGeo(tplBox, compose(px, yty - 0.15, pz, 0.09, 1.05 + rng() * 0.2, 0.09), post, 0.1, rng);
    }
    for (const ry of [railY, railY * 0.5]) {                       // 1–2 rails
      // NOTE: this predicate is never true (ry is never below railY*0.5) so the rng() is never
      // drawn — preserved verbatim from the flat version so the worldgen stream is untouched.
      if (ry < railY * 0.5 && rng() < 0.4) continue;
      B.plain.addGeo(tplBoxC, segRailBox(ax, yty + ry, az, bx, yty + ry, bz), post, 0.08, rng);
    }
  };
  runFence(yx0, yz0, yx1, yz0); runFence(yx1, yz0, yx1, yz1);
  runFence(yx1, yz1, yx0, yz1); runFence(yx0, yz1, yx0, yz0);
  const cx = (yx0 + yx1) / 2, cz = (yz0 + yz1) / 2;
  if (rng() < 0.25 && yw > 2.6 && yd > 2.6) {                      // garden shed
    const sw = 1.6 + rng() * 0.6, sh = 1.8 + rng() * 0.5;
    const wall = _c.copy(COL.wood).multiplyScalar(1.1).clone();
    B.plain.addGeo(tplBox, compose(cx, yty - 0.2, cz, sw, sh + 0.2, sw), wall, 0.1, rng);
    addPyramidRoof(B, cx - sw / 2, cz - sw / 2, cx + sw / 2, cz + sw / 2, yty + sh, srgb(0x4e5a52));
    colData.solids.push({ x0: cx - sw / 2, z0: cz - sw / 2, x1: cx + sw / 2, z1: cz + sw / 2, y0: yty, h: sh, vine: false });
  } else if (rng() < 0.3 && houseWall) {                          // laundry line: house wall → a pole
    const px = clamp(cx + (rng() - 0.5) * yw * 0.4, yx0 + 0.4, yx1 - 0.4);
    const pz = clamp(cz + (rng() - 0.5) * yd * 0.4, yz0 + 0.4, yz1 - 0.4);
    const ly = yty + 2.0 + rng() * 0.4;
    B.plain.addGeo(tplCyl, compose(px, yty, pz, 0.05, ly - yty + 0.2, 0.05), COL.wood, 0, rng);
    addLaundryLine(B, rng, houseWall[0], ly, houseWall[1], px, ly, pz);
  }
}

// Shared sagging laundry line: a slack cord from a→b with a few hanging cloth quads
// (muted colours, slight rotation). Used by garden yards (wall→pole) and by the Little-details
// sprinkle pass (building face→pole, or between two facing buildings across a gap).
function addLaundryLine(B, rng, ax, ay, az, bx, by, bz, opts) {
  opts = opts || {};
  const L = Math.hypot(bx - ax, bz - az) || 1;
  const sag = opts.sag != null ? opts.sag : 0.18 + L * 0.03 + rng() * 0.2;
  const w = 0.025, px = -(bz - az) / L * w, pz = (bx - ax) / L * w;
  const segs = 4;
  let lx = ax, ly = ay, lz = az;
  for (let k = 1; k <= segs; k++) {
    const t = k / segs;
    const nx = lerp(ax, bx, t), nz = lerp(az, bz, t), ny = lerp(ay, by, t) - Math.sin(t * Math.PI) * sag;
    B.plain.quad([lx - px, ly, lz - pz], [lx + px, ly, lz + pz], [nx + px, ny, nz + pz], [nx - px, ny, nz - pz], [0, 0, 1, 1], COL.wire);
    B.plain.quad([lx + px, ly, lz + pz], [lx - px, ly, lz - pz], [nx - px, ny, nz - pz], [nx + px, ny, nz + pz], [0, 0, 1, 1], COL.wire);
    lx = nx; ly = ny; lz = nz;
  }
  const nCloth = opts.nCloth != null ? opts.nCloth : 3 + (rng() * 3 | 0);   // 3–5
  for (let k = 0; k < nCloth; k++) {
    const t = 0.15 + rng() * 0.7, hx = lerp(ax, bx, t), hz = lerp(az, bz, t);
    const hy = lerp(ay, by, t) - Math.sin(t * Math.PI) * sag;
    const cw = 0.35 + rng() * 0.35, ch = 0.5 + rng() * 0.5, rot = (rng() - 0.5) * 0.3;
    const dx = Math.cos(rot) * cw / 2, dz = Math.sin(rot) * cw / 2;
    const col = _c.copy(AWNING_COLS[(rng() * AWNING_COLS.length) | 0]).lerp(srgb(0xffffff), 0.35 + rng() * 0.2).clone();
    B.plain.quad([hx - dx, hy - ch, hz - dz], [hx + dx, hy - ch, hz + dz], [hx + dx, hy, hz + dz], [hx - dx, hy, hz - dz], [0, 0, 1, 1], col);
  }
}

// weathered park bench: seat + backrest planks on short legs, facing +z(local). Registers a
// low solid (h 0.8) so you bump it instead of walking through — matching how addStall collides.
function addBench(B, colData, rng, x, z, ang) {
  const ty = terrainY(x, z);   // one sample at the bench centre — legs stay level, no shear
  const rot = (lx, lz) => [x + lx * Math.cos(ang) + lz * Math.sin(ang), -lx * Math.sin(ang) + lz * Math.cos(ang) + z];
  const wood = _c.copy(BENCH_COL).multiplyScalar(0.8 + rng() * 0.35).clone();
  const leg = _c.copy(wood).multiplyScalar(0.75).clone();
  B.plain.addGeo(tplBoxC, compose(x, ty + 0.44, z, 1.8, 0.1, 0.5, 0, -ang, 0), wood, 0.14, rng);          // seat
  const [brx, brz] = rot(0, -0.22);
  B.plain.addGeo(tplBoxC, compose(brx, ty + 0.66, brz, 1.8, 0.42, 0.08, 0, -ang, 0), wood, 0.14, rng);    // backrest
  for (const [lx, lz] of [[-0.78, -0.18], [0.78, -0.18], [-0.78, 0.18], [0.78, 0.18]]) {
    const [gx, gz] = rot(lx, lz);
    B.plain.addGeo(tplBox, compose(gx, ty - 0.06, gz, 0.1, 0.5, 0.1, 0, -ang, 0), leg, 0.1, rng);         // 6 cm buried: no floating legs on a grade
  }
  const hw = Math.abs(Math.cos(ang)) * 0.95 + Math.abs(Math.sin(ang)) * 0.32;
  const hd = Math.abs(Math.sin(ang)) * 0.95 + Math.abs(Math.cos(ang)) * 0.32;
  colData.solids.push({ x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd, y0: ty, h: 0.8, vine: false });
}

// rusted mailbox: a thin box tilted on a short post, red-brown rust tint, near an entrance.
function addMailbox(B, colData, rng, x, z, ang) {
  const tilt = (rng() - 0.5) * 0.2;
  const rust = _c.copy(MAILBOX_COL).lerp(COL.rust, 0.4 + rng() * 0.35).multiplyScalar(0.8 + rng() * 0.3).clone();
  const ph = 1.0 + rng() * 0.2;
  const ty = terrainY(x, z);
  B.plain.addGeo(tplCyl, compose(x, ty - 0.1, z, 0.055, ph + 0.1, 0.055, 0, 0, tilt), _c.copy(COL.wood).multiplyScalar(0.85).clone(), 0.1, rng);
  B.plain.addGeo(tplBox, compose(x + Math.sin(tilt) * ph, ty + ph, z, 0.34, 0.4, 0.24, 0, -ang, tilt), rust, 0.16, rng);
  colData.trunks.push({ x, z, r: 0.2, y0: ty, h: ph + 0.4 });
}

// morning puddle: a flattened irregular disc (very dark blue-grey) with a lighter inner sheen
// patch. Batched into the chunk's puddle batch (matPuddle), whose opacity fades in at dawn.
function addPuddle(B, rng, x, z) {
  const ty = terrainY(x, z);
  const r = 0.6 + rng() * 1.4, a = rng() * 7;
  const col = _c.copy(PUDDLE_COL).multiplyScalar(0.75 + rng() * 0.4).clone();
  B.puddle.addGeo(tplRock, compose(x, ty + 0.02, z, r, 0.02, r * (0.7 + rng() * 0.5), 0, a, 0), col, 0.15, rng);
  B.puddle.addGeo(tplRock, compose(x + (rng() - 0.5) * r * 0.4, ty + 0.035, z + (rng() - 0.5) * r * 0.4, r * 0.42, 0.02, r * 0.32, 0, rng() * 7, 0), _c.copy(PUDDLE_SHEEN).multiplyScalar(0.85 + rng() * 0.3).clone(), 0.1, rng);
}

// mushroom cluster: 2–3 tiny cap+stem pairs on deadwood / rubble / roots / sinkhole floor.
function addMushroomCluster(B, rng, x, z, y) {
  y = (y === undefined) ? terrainY(x, z) : y;
  const n = 2 + (rng() * 3 | 0);
  const cap = _c.copy(MUSH_COLS[(rng() * MUSH_COLS.length) | 0]).multiplyScalar(0.8 + rng() * 0.35).clone();
  for (let k = 0; k < n; k++) {
    const mx = x + (rng() - 0.5) * 0.6, mz = z + (rng() - 0.5) * 0.6;
    const h = 0.12 + rng() * 0.18, r = 0.06 + rng() * 0.06;
    B.plain.addGeo(tplCyl, compose(mx, y, mz, r * 0.5, h, r * 0.5), MUSH_STEM, 0.1, rng);
    B.plain.addGeo(tplRock, compose(mx, y + h, mz, r, r * 0.55, r, 0, rng() * 7, 0), cap, 0.2, rng);
  }
}

// cobweb: a pale translucent triangle fan spanning a corner. n1,n2 are the two edge
// directions ([dx,dy,dz]); the fan sweeps from n1 to n2 at radius r. Into matWeb batch.
function addCobweb(B, rng, cx, cy, cz, r, n1, n2) {
  const seg = 3;
  let prev = n1;
  for (let k = 1; k <= seg; k++) {
    const t = k / seg;
    const cur = [lerp(n1[0], n2[0], t), lerp(n1[1], n2[1], t), lerp(n1[2], n2[2], t)];
    const rr = r * (0.6 + rng() * 0.5);
    B.web.quad([cx, cy, cz], [cx + prev[0] * rr, cy + prev[1] * rr, cz + prev[2] * rr],
      [cx + cur[0] * rr, cy + cur[1] * rr, cz + cur[2] * rr], [cx, cy, cz], [0, 0, 1, 1], WEB_COL);
    prev = cur;
  }
}

// a small broken/open crate: 3–4 thin plank walls (one occasionally missing), tilted.
function addBrokenCrate(B, rng, x, z) {
  const ty = terrainY(x, z);
  const wood = _c.copy(COL.wood).multiplyScalar(1.1 + rng() * 0.3).clone();
  const s = 0.3 + rng() * 0.15, h = 0.28 + rng() * 0.16, th = 0.04;
  const ang = rng() * 7, tilt = rng() < 0.3 ? (rng() - 0.5) * 0.4 : 0, drop = (rng() * 4) | 0;
  const walls = [[0, -s, s, th], [0, s, s, th], [-s, 0, th, s], [s, 0, th, s]];
  for (let i = 0; i < 4; i++) {
    if (i === drop && rng() < 0.5) continue;                 // a missing side reads "broken"
    const [ox2, oz2, sx, sz] = walls[i], c = Math.cos(ang), si = Math.sin(ang);
    const wx = x + ox2 * c + oz2 * si, wz = z - ox2 * si + oz2 * c;
    B.plain.addGeo(tplBoxC, compose(wx, ty + h / 2, wz, sx * 2, h, sz * 2, 0, -ang, tilt), wood, 0.15, rng);
  }
}
// A thin horizontal rail as a centred box spanning a→b (for fence rails).
function segRailBox(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1e-4, ang = Math.atan2(dz, dx);
  return compose((ax + bx) / 2, ay, (az + bz) / 2, L, 0.08, 0.06, 0, -ang, 0);
}

function addBuilding(B, colData, mini, rng, cx, cz, w, d, h, opts) {
  opts = opts || {};
  const style = opts.style || CUR_STYLE;
  const cfg = STYLE_CFG[style] || STYLE_CFG.blocks;
  // Regions: deepgreen crushes the towers shorter, ashen slumps them; opts.noRegion keeps
  // landmarks (fallen tower shell) at their designed height.
  const rbiome = (CUR_REG && !opts.noRegion) ? CUR_REG.biome : 'canopy';
  if (rbiome === 'deepgreen') h *= 0.8;
  else if (rbiome === 'ashen') h *= 0.75;
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  /* Terrain: gY is the datum the whole box is founded on — the LOWEST terrain over its
     footprint (4 corners + centre). Taking the minimum means the downhill wall foot lands on
     the ground while the uphill side simply buries more of its plinth, so no wall can ever
     show daylight underneath. bldWalls then sinks the ground tier a further BLD_SKIRT below
     gY. Everything the box carries — roof, parapet, ornaments, sign, vines, rooftop garden —
     is emitted at gY + its old absolute y, so each stays exactly where it was relative to its
     own building. Landmark chunks (spire, colossus, fallen, hamlet, reservoir, canals) are
     forced flat by core.js's mask, so gY is exactly 0 there and they are untouched. */
  const gY = Math.min(terrainY(x0, z0), terrainY(x1, z0), terrainY(x0, z1), terrainY(x1, z1), terrainY(cx, cz));
  const pool = STYLE_TINTS[style] || FACADE_TINTS;
  const tint = pool[(rng() * pool.length) | 0].clone().multiplyScalar(0.82 + rng() * 0.26);
  if (rbiome === 'scorch') tint.lerp(BONE_TINT, 0.32);       // sun-bleached facades
  else if (rbiome === 'ashen') tint.lerp(DUST_TINT, 0.22);   // grey-dusted
  const mossy = _c.copy(tint).lerp(COL.moss, 0.74).multiplyScalar(0.66).clone();  // stronger ground-level moss creep
  // per-building window rhythm from the district style (glass tight, works sparse/big)
  const bay = cfg.bay[0] + rng() * cfg.bay[1], flr = cfg.flr[0] + rng() * cfg.flr[1];
  const uo = (rng() * BLD_CELLS) | 0, vo = (rng() * BLD_CELLS) | 0;
  const roofCol = cfg.rc != null ? srgb(cfg.rc).multiplyScalar(0.8 + rng() * 0.3)
    : _c.copy(COL.roof).multiplyScalar(0.85 + rng() * 0.3).clone();
  // Tiered towers: glass always; 20% of any tall building elsewhere. Boxes stack with
  // shrinking setbacks, each tier a ground-up solid + parapet.
  const tallTier = h >= 18 && rng() < 0.20;
  const tiered = !opts.noTier && (cfg.tiered || tallTier);
  // roof kind (tiers are boxes → flat top); garden picks gable vs pyramid ~50/50.
  let roofType = tiered ? 'flat' : cfg.roof;
  if (roofType === 'hip' && rng() < 0.5) roofType = 'gable';
  const flatRoof = roofType === 'flat';
  let topX0 = x0, topZ0 = z0, topX1 = x1, topZ1 = z1, topY = h;   // top-tier rect (for glass masts)
  let tier1Y = h;                                                 // first-tier top (ornaments cling below setbacks)
  // Facade material + modelled relief for this box. A cornice only crowns a wall that ENDS
  // at the roofline — a gable/hip/ruin wall carries on up into a pitch or a broken parapet,
  // and a neat crown across those reads as a mistake.
  const fac = { mat: FACADE_OF[style] || 'concrete', cornice: flatRoof || roofType === 'saw' };

  // Ruin variant (~12% of non-tiered buildings, any style except glass): a reduced,
  // roofless shell with a ragged broken parapet, one exposed interior floor slab, heavy
  // vines and rubble at a corner. Self-contained → pushes its own solid + minimap rect.
  if (!opts.noTier && !opts.noRuin && !tiered && style !== 'glass' && rng() < (rbiome === 'ashen' ? 0.55 : 0.12)) {
    const rh = h * (0.4 + rng() * 0.3);
    bldWalls(B, x0, z0, x1, z1, gY, rh, bay, flr, tint, mossy, 0, uo, vo, gY, { mat: fac.mat, cornice: false });
    const fy = gY + rh - 3;                                        // exposed interior floor slab
    if (rh - 3 > 1.5) B.plain.quad([x0, fy, z1], [x1, fy, z1], [x1, fy, z0], [x0, fy, z0], [0, 0, 1, 1], _c.copy(COL.rock).multiplyScalar(0.45).clone());
    const pc = _c.copy(tint).multiplyScalar(0.7).clone();          // ragged parapet: short broken segments
    for (const s of [0, 1, 2, 3]) {
      const [u0, u1] = faceSpan(s, x0, x1, z0, z1), map = faceMap(s, x0, x1, z0, z1), fl = u1 - u0;
      const nseg = Math.max(2, Math.round(fl / 1.6));
      for (let k = 0; k < nseg; k++) {
        if (rng() < 0.32) continue;                                // some segments missing
        const uc = u0 + (k + 0.5) * fl / nseg, [mx, mz] = map(uc, -0.15);
        const sh = 0.3 + rng() * 0.9;
        B.plain.addGeo(tplBox, compose(mx, gY + rh, mz, (s < 2 ? 0.3 : fl / nseg * 0.9), sh, (s < 2 ? fl / nseg * 0.9 : 0.3)), pc, 0.08, rng);
      }
    }
    for (const s of [0, 1, 2, 3]) addWallVines(B, rng, x0, z0, x1, z1, rh, s, gY);   // heavy vines all sides
    const rcx = rng() < 0.5 ? x0 : x1, rcz = rng() < 0.5 ? z0 : z1;              // rubble at one corner
    for (let k = 0; k < 4 + (rng() * 3 | 0); k++) {
      const rr = 0.6 + rng() * 1.3, jx = (rng() - 0.5) * 4, jz = (rng() - 0.5) * 4;
      // rubble spills outside the footprint, so each boulder sits on its OWN patch of ground
      B.plain.addGeo(tplRock, compose(rcx + jx, terrainY(rcx + jx, rcz + jz) + rr * 0.25, rcz + jz, rr, rr * 0.5, rr, rng(), rng() * 7, rng()), COL.rock, 0.2, rng);
    }
    colData.trunks.push({ x: rcx, z: rcz, r: 1.4, y0: gY, h: 1.2 });
    colData.solids.push({ x0, z0, x1, z1, y0: gY, h: rh, vine: true });
    mini.rects.push([x0, z0, w, d, rh]);
    return;
  }

  if (tiered) {
    let bx0 = x0, bz0 = z0, bx1 = x1, bz1 = z1, y0 = 0, floors = 0, hLeft = h;
    const nT = 2 + (rng() * 2 | 0);
    for (let ti = 0; ti < nT; ti++) {
      const th = (ti === nT - 1) ? hLeft : hLeft * (0.42 + rng() * 0.16);
      hLeft -= th;
      floors += bldWalls(B, bx0, bz0, bx1, bz1, gY + y0, th, bay, flr, tint, mossy, floors, uo, vo, gY, fac);
      const tw = bx1 - bx0, td = bz1 - bz0;
      const ph = 0.35 + rng() * 0.4, pc = _c.copy(roofCol).multiplyScalar(0.8).clone();
      B.plain.addGeo(tplBox, compose(cx, gY + y0 + th, bz1 - 0.15, tw, ph, 0.3), pc, 0.05, rng);
      B.plain.addGeo(tplBox, compose(cx, gY + y0 + th, bz0 + 0.15, tw, ph, 0.3), pc, 0.05, rng);
      B.plain.addGeo(tplBox, compose(bx1 - 0.15, gY + y0 + th, cz, 0.3, ph, td), pc, 0.05, rng);
      B.plain.addGeo(tplBox, compose(bx0 + 0.15, gY + y0 + th, cz, 0.3, ph, td), pc, 0.05, rng);
      colData.solids.push({ x0: bx0, z0: bz0, x1: bx1, z1: bz1, y0: gY, h: y0 + th, vine: ti === 0 });
      if (ti === 0) tier1Y = y0 + th;
      if (ti === nT - 1) { B.plain.quad([bx0, gY + y0 + th, bz1], [bx1, gY + y0 + th, bz1], [bx1, gY + y0 + th, bz0], [bx0, gY + y0 + th, bz0], [0, 0, 1, 1], roofCol); topX0 = bx0; topZ0 = bz0; topX1 = bx1; topZ1 = bz1; topY = y0 + th; }
      y0 += th;
      const shr = 0.15 + rng() * 0.15, nw = tw * (1 - shr), nd = td * (1 - shr);
      bx0 = cx - nw / 2; bx1 = cx + nw / 2; bz0 = cz - nd / 2; bz1 = cz + nd / 2;
    }
  } else {
    bldWalls(B, x0, z0, x1, z1, gY, h, bay, flr, tint, mossy, 0, uo, vo, gY, fac);
    if (roofType === 'gable') {
      // The walls render tint × the dark concrete texture; gable ends sit on the
      // untextured plain material, so raw tint reads glaring white. Pre-multiply
      // down to the texture's effective brightness and grey it toward weathered
      // render so the triangle reads as the same aged plaster as the wall below.
      const gableCol = _c.copy(tint).multiplyScalar(0.5).lerp(COL.rock, 0.22).clone();
      addGableRoof(B, x0, z0, x1, z1, gY + h, roofCol, gableCol);
    }
    else if (roofType === 'hip') { addPyramidRoof(B, x0, z0, x1, z1, gY + h, roofCol); }
    else if (roofType === 'saw') { B.plain.quad([x0, gY + h, z1], [x1, gY + h, z1], [x1, gY + h, z0], [x0, gY + h, z0], [0, 0, 1, 1], roofCol); addSawtoothRoof(B, x0, z0, x1, z1, gY + h, roofCol, rng); }
    else { B.plain.quad([x0, gY + h, z1], [x1, gY + h, z1], [x1, gY + h, z0], [x0, gY + h, z0], [0, 0, 1, 1], roofCol); }
  }
  // vines on some faces (weighted per district: heavy oldtown/works/garden, light glass/blocks)
  // Regions: scorch strips vines (need shade), deepgreen thickens them; canopy drifts ±30%.
  let vineMul = CUR_REG ? (1 + clamp((CUR_REG.verdancy - 0.51) / 0.21, -1, 1) * 0.30) : 1;
  if (rbiome === 'scorch') vineMul = 0.15; else if (rbiome === 'deepgreen') vineMul = 1.6;
  const hasVines = opts.vines !== undefined ? opts.vines : rng() < clamp(0.92 * cfg.vine * vineMul, 0, 0.98);
  if (hasVines) {
    const sides = (opts.allSides || rng() < 0.4) ? [0, 1, 2, 3] : [0, 1, 2, 3].filter(() => rng() < 0.85);
    if (sides.length === 0) sides.push((rng() * 4) | 0);
    for (const s of sides) addWallVines(B, rng, x0, z0, x1, z1, h, s, gY);
  }
  // Flat-roof-only dressing: parapet + roof clutter + rooftop garden + roofline spill.
  // Pitched / sawtooth / pyramid / tiered roofs skip these so nothing floats mid-air.
  const bareRoof = flatRoof && !tiered;
  if (bareRoof) {
    // parapet
    const ph = 0.35 + rng() * 0.4, pc = _c.copy(roofCol).multiplyScalar(0.8).clone();
    B.plain.addGeo(tplBox, compose(cx, gY + h, z1 - 0.15, w, ph, 0.3), pc, 0.05, rng);
    B.plain.addGeo(tplBox, compose(cx, gY + h, z0 + 0.15, w, ph, 0.3), pc, 0.05, rng);
    B.plain.addGeo(tplBox, compose(x1 - 0.15, gY + h, cz, 0.3, ph, d), pc, 0.05, rng);
    B.plain.addGeo(tplBox, compose(x0 + 0.15, gY + h, cz, 0.3, ph, d), pc, 0.05, rng);
    // roof clutter: water tank, AC units, antenna
    if (rng() < 0.4 && w > 10) {
      const tx = lerp(x0 + 2, x1 - 2, rng()), tz = lerp(z0 + 2, z1 - 2, rng());
      B.plain.addGeo(tplCyl, compose(tx, gY + h, tz, 1.1, 2.1, 1.1), COL.rust, 0.15, rng);
      B.plain.addGeo(tplCyl, compose(tx, gY + h + 2.1, tz, 1.15, 0.3, 1.15), COL.deadwood, 0.1, rng);
    }
    if (rng() < 0.55) {
      const n = 1 + (rng() * 3 | 0);
      for (let k = 0; k < n; k++)
        B.plain.addGeo(tplBox, compose(lerp(x0 + 1.4, x1 - 1.4, rng()), gY + h, lerp(z0 + 1.4, z1 - 1.4, rng()), 1.1, 0.55, 0.85, 0, rng() * 7, 0), COL.rock, 0.15, rng);
    }
    if (rng() < 0.45) {
      const ax2 = lerp(x0 + 1.5, x1 - 1.5, rng()), az2 = lerp(z0 + 1.5, z1 - 1.5, rng());
      const ah = 2.5 + rng() * 4;
      B.plain.addGeo(tplCyl, compose(ax2, gY + h, az2, 0.05, ah, 0.05), COL.wire, 0, rng);
      B.plain.addGeo(tplBox, compose(ax2, gY + h + ah * 0.75, az2, 0.7, 0.05, 0.05, 0, rng() * 7, 0), COL.wire, 0, rng);
    }
  }
  // faded shop sign band at storefront height
  if (h < 22 && rng() < 0.4) {
    const sc = _c.copy(SIGN_COLS[(rng() * SIGN_COLS.length) | 0]).multiplyScalar(0.7 + rng() * 0.4).clone();
    const sw = Math.min(w - 2, 3 + rng() * 4), sy = gY + 2.7, sh = 0.9;
    const side = (rng() * 4) | 0, o = 0.08;
    const mid = lerp(-0.3, 0.3, rng());
    if (side === 2) { const px = cx + mid * w; B.plain.quad([px - sw / 2, sy, z1 + o], [px + sw / 2, sy, z1 + o], [px + sw / 2, sy + sh, z1 + o], [px - sw / 2, sy + sh, z1 + o], [0, 0, 1, 1], sc); }
    else if (side === 3) { const px = cx + mid * w; B.plain.quad([px + sw / 2, sy, z0 - o], [px - sw / 2, sy, z0 - o], [px - sw / 2, sy + sh, z0 - o], [px + sw / 2, sy + sh, z0 - o], [0, 0, 1, 1], sc); }
    else if (side === 0) { const pz = cz + mid * d; B.plain.quad([x1 + o, sy, pz + sw / 2], [x1 + o, sy, pz - sw / 2], [x1 + o, sy + sh, pz - sw / 2], [x1 + o, sy + sh, pz + sw / 2], [0, 0, 1, 1], sc); }
    else { const pz = cz + mid * d; B.plain.quad([x0 - o, sy, pz - sw / 2], [x0 - o, sy, pz + sw / 2], [x0 - o, sy + sh, pz + sw / 2], [x0 - o, sy + sh, pz - sw / 2], [0, 0, 1, 1], sc); }
  }
  // rooftop garden
  if (bareRoof && opts.garden !== false && rng() < 0.55 && h < 40) {
    const nG = 1 + (rng() * 3 | 0);
    for (let k = 0; k < nG; k++) {
      const gr = 1.4 + rng() * 2.4;
      const gx = lerp(x0 + gr, x1 - gr, rng()), gz = lerp(z0 + gr, z1 - gr, rng());
      B.leaf.addGeo(tplBlob, compose(gx, gY + h + gr * 0.4, gz, gr, gr * 0.6, gr, 0, rng() * 7, 0), rng() < 0.4 ? COL.leafDry : COL.leafB, 0.2, rng);
    }
  }
  // Spiral limb wrapping ~1 in 4 towers (a climb/walk route toward the Weave), and an
  // occasional Crown Nest on a tall roof (L3, y 32–40).
  // green roofline: on ~40% of buildings, small leaf blobs spill over the parapet corners
  if (bareRoof && rng() < 0.4) {
    const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const nBlob = 1 + (rng() * 3 | 0);
    for (let k = 0; k < nBlob; k++) {
      const cn = corners[(rng() * 4) | 0];
      const br = 0.7 + rng() * 1.3;
      const bx = clamp(cn[0] + (cn[0] < cx ? 1 : -1) * br * 0.3, x0, x1);
      const bz = clamp(cn[1] + (cn[1] < cz ? 1 : -1) * br * 0.3, z0, z1);
      B.leaf.addGeo(tplBlob, compose(bx, gY + h - br * 0.15, bz, br, br * 0.55, br, 0, rng() * 7, 0), leafTintByY(rng() < 0.35 ? COL.leafDry : COL.leafB, h), 0.22, rng);
    }
  }
  // Regions: scorch skips the bough/weave/nest layer (spiral limbs + roof crown nests);
  // deepgreen adds a few more crown nests. rng() consumed regardless to keep the stream stable.
  const nestMul = rbiome === 'scorch' ? 0 : rbiome === 'deepgreen' ? 1.3 : 1;
  if (h > 20 && rng() < 0.25 && rbiome !== 'scorch') addSpiralLimb(B, colData, rng, cx, cz, w, d, gY + h);
  // addCrownNest is (x, y, z, r). This call used to pass (cx, cz, h) — transposing z into the
  // y slot — so the nest and, worse, the walkable pad it registers in colData.pads landed at
  // y = cz: a world Z coordinate, i.e. kilometres up in empty sky. Now founded on the roof at
  // gY + h. Only argument VALUES changed; the rng() sequence (the gate draw, then the radius
  // draw) is untouched, so the world layout is unaffected.
  if (h >= 30 && h <= 46 && rng() < 0.3 * nestMul) addCrownNest(B, colData, rng, cx, gY + h, cz, 2.5 + rng() * 1.3);
  // Districts (Phase B): per-style ornaments hung on the finished box.
  const wallTop = tiered ? tier1Y : h;   // ornaments cling to the base tier (below any setback)
  if (style === 'oldtown') ornOldtown(B, colData, rng, x0, z0, x1, z1, cx, cz, w, d, h, roofType, bay, gY);
  else if (style === 'blocks') ornBlocks(B, colData, rng, x0, z0, x1, z1, cx, cz, w, d, wallTop, roofType, gY);
  else if (style === 'glass') {
    ornGlass(B, colData, rng, x0, z0, x1, z1, cx, cz, w, d, wallTop, { x0: topX0, z0: topZ0, x1: topX1, z1: topZ1, y: topY }, gY);
    // Night glow: a few extra lit-window quads (matLamp glows warm at night, dark by day)
    // so glass towers sparkle after dark without touching the shared window atlas.
    const nLit = 2 + (rng() * 4 | 0);
    for (let k = 0; k < nLit; k++) {
      const s = (rng() * 4) | 0, [u0, u1] = faceSpan(s, x0, x1, z0, z1);
      const uc = lerp(u0 + 1, u1 - 1, rng()), yb = gY + 2 + rng() * (wallTop - 4);
      facePanel(B.lamp, s, x0, x1, z0, z1, uc, 0.5 + rng() * 0.5, yb, yb + 1 + rng() * 0.8, 0.09, srgb(0x33302a), null);
    }
  }
  else if (style === 'works') ornWorks(B, colData, rng, x0, z0, x1, z1, cx, cz, w, d, h, gY);
  if (!tiered) colData.solids.push({ x0, z0, x1, z1, y0: gY, h, vine: hasVines });  // tiered pushed a solid per tier
  mini.rects.push([x0, z0, w, d, h]);
}

function addCurtain(B, rng, ax, ay, az, bx, by, bz) {
  const segs = 7 + (rng() * 3 | 0), sag = 2 + rng() * 3.5;
  const skip = 0.15 + rng() * 0.18;                    // density variance per curtain
  for (let k = 0; k <= segs; k++) {
    const t = k / segs;
    const px = lerp(ax, bx, t), pz = lerp(az, bz, t);
    const py = lerp(ay, by, t) - Math.sin(t * Math.PI) * sag;
    if (rng() < skip) continue;
    const len = 1.4 + rng() * (rng() < 0.3 ? 5.5 : 3.4), w = 1.0 + rng() * 1.2;
    const a = rng() * Math.PI;
    const dx = Math.cos(a) * w / 2, dz = Math.sin(a) * w / 2;
    const col = _c.copy(COL.vine).multiplyScalar(0.7 + rng() * 0.5).clone();
    B.vine.quad([px - dx, py - len, pz - dz], [px + dx, py - len, pz + dz], [px + dx, py, pz + dz], [px - dx, py, pz - dz],
      [0, 0, 1, Math.max(1, Math.round(len / 5))], col);
  }
}

function addGlowPlant(B, rng, x, z, s, y) {
  const base = (y === undefined) ? terrainY(x, z) : y;
  B.glow.addGeo(tplBlob, compose(x, base + s * 0.4, z, s, s * 0.7, s, 0, rng() * 7, 0), COL.glowPlant, 0.3, rng);
}

// Flat root/ivy creep patch on the ground (visual only): an irregular dark-green leaf
// quad laid just above the pavement. Cheap — one textured quad per patch.
function addIvyPatch(B, rng, x, z, s) {
  const y = terrainY(x, z) + 0.06 + rng() * 0.04;
  const a = rng() * Math.PI, ca = Math.cos(a) * s, sa = Math.sin(a) * s;
  const j = () => (rng() - 0.5) * s * 0.4;
  const col = _c.copy(COL.leafC).multiplyScalar(0.55 + rng() * 0.3).clone();
  B.leaf.quad(
    [x - ca + j(), y, z - sa + j()], [x + sa + j(), y, z - ca + j()],
    [x + ca + j(), y, z + sa + j()], [x - sa + j(), y, z + ca + j()],
    [0, 0, 1, 1], col);
}

/* ---- streets: asphalt, markings, sidewalks, kerbs ----
   Emitted into B.surf / matSurf (aggregate + crack normal map, world-space UVs) rather than
   the untextured B.plain these used to use. Every quad here now maps its UVs from WORLD x/z
   at SURF_TILE metres, so texel density is identical on an 11 m asphalt slab and a 0.26 m
   lane dash, and the tiling runs unbroken across chunk borders (CHUNK is a multiple of the
   tile). Nothing in this function's rng() sequence changed — see the note on kerbs below. */
/* Terrain: a street panel is no longer one flat quad. `y` became an offset ABOVE terrainY,
   and the panel is diced into ~SURF_STEP cells whose every corner is sampled from terrainY,
   so asphalt and pavement drape over the relief instead of slicing through it. Subdivision is
   necessary, not cosmetic: an 11 m unsubdivided chord can deviate ~12 cm from the ground mesh
   (terrainY's shortest octave is a 12.5 m wave of ±12 cm) — far more than the 5 cm the asphalt
   rides proud of it, so the ground would poke through the road. Batch.quad consumes NO rng,
   so every extra cell here is free and the worldgen stream is bit-identical. */
const SURF_STEP = 2;                 // metres per street cell
const _hqA = new THREE.Color(), _hqB = new THREE.Color();
function hquad(B, x0, z0, x1, z1, y, col, colB) {
  const T = SURF_TILE;
  const nx = Math.max(1, Math.round((x1 - x0) / SURF_STEP));
  const nz = Math.max(1, Math.round((z1 - z0) / SURF_STEP));
  const dz = (z1 - z0) || 1;
  const Y = (px, pz) => terrainY(px, pz) + y;
  for (let i = 0; i < nx; i++) {
    const xa = x0 + (x1 - x0) * (i / nx), xb = x0 + (x1 - x0) * ((i + 1) / nx);
    for (let j = 0; j < nz; j++) {
      const za = z0 + dz * (j / nz), zb = z0 + dz * ((j + 1) / nz);
      // colB tints the z1 edge and col the z0 edge — carry that gradient through the rows
      let cA = col, cB = colB || col;
      if (colB) {
        cA = _hqA.copy(col).lerp(colB, (za - z0) / dz);
        cB = _hqB.copy(col).lerp(colB, (zb - z0) / dz);
      }
      B.quad([xa, Y(xa, zb), zb], [xb, Y(xb, zb), zb], [xb, Y(xb, za), za], [xa, Y(xa, za), za],
        [xa / T, zb / T, xb / T, za / T], cA, cB);
    }
  }
}
// Vertical kerb riser along a constant-x (axis 0) or constant-z (axis 1) line. `face` is the
// direction the stone looks (+1/-1 along the perpendicular axis) so the normal points at the
// road and catches raking light. UVs come off the same world grid, using height for v.
// Terrain: yBot/yTop are offsets above terrainY and the run is diced along s at SURF_STEP,
// sampling terrain at the SAME points the road and sidewalk panels use — so both lips of the
// kerb stay welded to their surfaces with no gap and no overlap on a grade.
function kquad(B, axis, k, s0, s1, yBot, yTop, face, col) {
  const T = SURF_TILE;
  // The winding that yields a POSITIVE perpendicular normal flips between the two axes
  // (the cross product picks up an extra sign when the sweep runs along x instead of z),
  // so resolve it per axis rather than letting `face` mean opposite things in each branch.
  const fwd = axis === 0 ? face > 0 : face < 0;
  const P = axis === 0 ? (sv, y) => [k, y, sv] : (sv, y) => [sv, y, k];
  const TY = axis === 0 ? (sv) => terrainY(k, sv) : (sv) => terrainY(sv, k);
  const n = Math.max(1, Math.round(Math.abs(s1 - s0) / SURF_STEP));
  for (let i = 0; i < n; i++) {
    const e0 = s0 + (s1 - s0) * (i / n), e1 = s0 + (s1 - s0) * ((i + 1) / n);
    const a = fwd ? e1 : e0, b = fwd ? e0 : e1;
    const ta = TY(a), tb = TY(b);
    B.quad(P(a, ta + yBot), P(b, tb + yBot), P(b, tb + yTop), P(a, ta + yTop),
      [a / T, yBot / T, b / T, yTop / T], col, col);
  }
}
function addRoads(B, rng, ox, oz, canalX, canalZ) {
  const RW = 5.5, SW = 8;
  for (const axis of [0, 1]) {   // 0: street along z at x=ox · 1: street along x at z=oz
    const canal = axis === 0 ? canalX : canalZ;   // this street line is a canal → skip the asphalt (keep sidewalks as tow-paths)
    // Sidewalks sit 10 cm proud of the asphalt so the kerb riser below has a face to show.
    // (Was 0.11/0.13 — a pure colour change with no step, which is why streets read flat.)
    // Terrain: these are now heights ABOVE terrainY, not absolute y — hquad/kquad add the
    // ground under every corner they emit. The per-axis nudges keep the two crossing streets
    // from z-fighting exactly as before.
    const yA = 0.05 + axis * 0.03, yS = 0.15 + axis * 0.02, yD = 0.17 + axis * 0.01;
    for (let s = 0; s < CHUNK; s += 8) {
      const mossy = rng() < 0.3;
      const rc = _c.copy(COL.surfRoad).multiplyScalar(0.85 + rng() * 0.3);
      if (mossy) rc.lerp(COL.moss, 0.25 + rng() * 0.3);
      const rcc = rc.clone();
      const sc1 = _c.copy(COL.surfWalk).multiplyScalar(0.8 + rng() * 0.35).clone();
      const sc2 = _c.copy(COL.surfWalk).multiplyScalar(0.8 + rng() * 0.35).clone();
      if (rng() < 0.25) sc1.lerp(COL.moss, 0.4); if (rng() < 0.25) sc2.lerp(COL.moss, 0.4);
      // Kerb stone: derived from the sidewalk tint, no fresh rng() draw — Batch.quad consumes
      // none either, so adding this geometry leaves the worldgen stream (and world) untouched.
      const kc1 = sc1.clone().multiplyScalar(0.8), kc2 = sc2.clone().multiplyScalar(0.8);
      if (axis === 0) {
        if (!canal) hquad(B.surf, ox - RW, oz + s, ox + RW, oz + s + 8, yA, rcc);
        hquad(B.surf, ox - SW, oz + s, ox - RW, oz + s + 8, yS, sc1);
        hquad(B.surf, ox + RW, oz + s, ox + SW, oz + s + 8, yS, sc2);
        kquad(B.surf, 0, ox - RW, oz + s, oz + s + 8, yA, yS, 1, kc1);
        kquad(B.surf, 0, ox + RW, oz + s, oz + s + 8, yA, yS, -1, kc2);
      } else {
        if (!canal) hquad(B.surf, ox + s, oz - RW, ox + s + 8, oz + RW, yA, rcc);
        hquad(B.surf, ox + s, oz - SW, ox + s + 8, oz - RW, yS, sc1);
        hquad(B.surf, ox + s, oz + RW, ox + s + 8, oz + SW, yS, sc2);
        kquad(B.surf, 1, oz - RW, ox + s, ox + s + 8, yA, yS, 1, kc1);
        kquad(B.surf, 1, oz + RW, ox + s, ox + s + 8, yA, yS, -1, kc2);
      }
    }
    // faded center dashes
    for (let s = 3; s < CHUNK; s += 6.5) {
      if (canal || rng() < 0.4) continue;
      const dc = _c.copy(COL.surfDash).multiplyScalar(0.55 + rng() * 0.4).clone();
      if (axis === 0) hquad(B.surf, ox - 0.13, oz + s, ox + 0.13, oz + s + 2.6, yD, dc);
      else hquad(B.surf, ox + s, oz - 0.13, ox + s + 2.6, oz + 0.13, yD, dc);
    }
  }
}

/* ---- abandoned cars: parametric wrecks (sedan / wagon / pickup / van) ----
   The silhouette is a run of roofline "stations" [x, roofY, widthFrac] (front → rear). The
   shell is stitched from quads: tapered tops, per-segment flanks, a tumblehome glasshouse
   inset behind shoulder strips, nose/tail, and (pickup) an open bed with inner walls. Over
   that go painted details — wheel wells, door seams + handles, pillars, lights, grille,
   plates, rust patches — and prop geometry: bumpers, mirrors, hubcaps, antenna, exhaust,
   roof racks. Deflated tires sag the body with a small pitch/roll. */
function addCar(B, colData, rng, x, z, ang) {
  // One draw from the world stream seeds a car-local stream: however the shell evolves
  // (more panels, new variants), chunk worldgen after this call never re-rolls again.
  rng = mulberry32((rng() * 0x100000000) >>> 0);
  const rot = (lx, lz) => [x + lx * Math.cos(ang) + lz * Math.sin(ang), -lx * Math.sin(ang) + lz * Math.cos(ang) + z];
  /* palette */
  const rusty = rng() < 0.4;
  const body = _c.copy(CAR_COLS[(rng() * CAR_COLS.length) | 0]).multiplyScalar(0.7 + rng() * 0.4).clone();
  if (rusty) body.lerp(COL.rust, 0.4 + rng() * 0.3);
  if (CUR_REG && CUR_REG.biome === 'scorch') body.lerp(COL.rust, 0.35);   // Regions: sun-baked cars rust brighter
  const husk = rng() < 0.08;                                              // the odd burned-out shell
  if (husk) body.copy(srgb(0x2b2723)).lerp(COL.rust, rng() * 0.3);
  const grime = _c.copy(body).multiplyScalar(0.55).clone();               // sills fade dark
  const glass = srgb(rng() < 0.2 || husk ? 0x14191b : 0x2b3a40).multiplyScalar(0.75 + rng() * 0.5);
  const dark = srgb(0x232322), metal = srgb(0x55544f);
  /* variant tables: stations [x, roofY, wFrac]; tGlass = glazed top runs; pickup's last run is the open bed */
  const V = rng(), T = V < 0.45 ? 0 : V < 0.7 ? 1 : V < 0.85 ? 2 : 3;   // sedan / wagon / pickup / van
  const pts = [
    [[2.08, 0.86, 0.82], [1.9, 0.92, 0.86], [0.72, 1.0, 0.97], [0.26, 1.52, 0.94], [-0.88, 1.52, 0.94], [-1.42, 1.0, 0.97], [-2.08, 0.94, 0.85]],
    [[2.08, 0.86, 0.82], [1.9, 0.92, 0.86], [0.72, 1.0, 0.97], [0.3, 1.5, 0.94], [-1.52, 1.48, 0.93], [-2.0, 1.0, 0.85]],
    [[2.0, 0.9, 0.82], [1.78, 0.98, 0.88], [1.2, 1.04, 0.96], [0.75, 1.56, 0.92], [-0.3, 1.56, 0.92], [-0.35, 1.0, 0.96], [-2.05, 1.0, 0.88]],
    [[1.95, 0.98, 0.85], [1.6, 1.06, 0.94], [1.05, 1.66, 0.96], [-1.8, 1.66, 0.94], [-1.98, 1.08, 0.86]],
  ][T];
  const tGlass = [[0, 0, 1, 0, 1, 0], [0, 0, 1, 0, 1], [0, 0, 1, 0, 1, 0], [0, 1, 0, 0]][T];
  const open = T === 2 ? [0, 0, 0, 0, 0, 1] : null;
  const roofSpan = [[0.26, -0.88], [0.3, -1.52], [0.75, -0.3], [1.05, -1.8]][T];
  const wheelXs = [[1.38, -1.38], [1.38, -1.38], [1.3, -1.35], [1.25, -1.32]][T];
  const seamXs = [[0.62, -0.44], [0.62, -0.44], [0.55], [1.0, -0.12]][T];
  const mirX = [0.72, 0.72, 1.2, 1.6][T] + 0.15;                        // just ahead of the A-pillar base
  /* stance: overall size jitter; deflated corners sag the body with a small pitch/roll */
  const sL = 0.94 + rng() * 0.16, sW = 0.92 + rng() * 0.1, lift = rng() * 0.06;
  const dfl = [rng() < 0.22, rng() < 0.22, rng() < 0.22, rng() < 0.22]; // F+z F-z R+z R-z
  const pitch = ((dfl[2] + dfl[3]) - (dfl[0] + dfl[1])) * -0.016;
  const roll = ((dfl[0] + dfl[2]) - (dfl[1] + dfl[3])) * -0.02;
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const y0 = 0.4 + lift, belt = 1.0 + lift, w = 0.92 * sW, roofY = Math.max(...pts.map(p => p[1])) + lift;
  const X = i => pts[i][0], Y = i => pts[i][1] + lift, W = i => pts[i][2] * w;
  const cW = i => W(i) * 0.86;                                          // glasshouse tumblehome inset
  const gW = i => (Y(i) > belt + 0.01 ? cW(i) : W(i));                  // width the roofline run uses
  const n = pts.length - 1, xF = X(0), xR = X(n);
  const WA = lx => {                                                    // flank half-width at any x
    for (let i = 0; i < n; i++) if (lx <= X(i) && lx >= X(i + 1))
      return W(i) + (W(i + 1) - W(i)) * (X(i) - lx) / (X(i) - X(i + 1) || 1);
    return W(lx > 0 ? 0 : n);
  };
  // Terrain: ONE sample at the wreck's centre, folded into the local→world transform, so the
  // entire shell (and every detail quad and prop that goes through P) lifts together and the
  // sag pitch/roll still reads as deflated tyres rather than a hillside.
  const ty = terrainY(x, z);
  const P = (lx, ly, lz) => {
    lx *= sL;
    const x2 = lx * cp - ly * sp, y2 = ly * cp + lx * sp;               // pitch, then roll
    const y3 = y2 * cr - lz * sr, z3 = y2 * sr + lz * cr;
    const [wx, wz] = rot(x2, z3);
    return [wx, ty + y3, wz];
  };
  const Q = (a, b, c, d, col, colB) => B.plain.quad(P(...a), P(...b), P(...c), P(...d), [0, 0, 1, 1], col, colB);
  // Face helpers with verified windings. sideQ: wall strip on a z=zz plane (outward = sign of zz);
  // noseQ/tailQ: quads on an x plane facing +x / -x.
  const sideQ = (x0, x1, yLo, yHi0, yHi1, zz0, zz1, col, colB) => {     // x0 = front-more edge
    if (zz0 > 0) Q([x1, yLo, zz1], [x0, yLo, zz0], [x0, yHi0, zz0], [x1, yHi1, zz1], col, colB);
    else Q([x0, yLo, zz0], [x1, yLo, zz1], [x1, yHi1, zz1], [x0, yHi0, zz0], col, colB);
  };
  const noseQ = (xx, yLo, yHi, zA, zB, col, colB) => {                  // faces +x; zA < zB
    Q([xx, yLo, zB], [xx, yLo, zA], [xx, yHi, zA], [xx, yHi, zB], col, colB);
  };
  const tailQ = (xx, yLo, yHi, zA, zB, col, colB) => {                  // faces -x; zA < zB
    Q([xx, yLo, zA], [xx, yLo, zB], [xx, yHi, zB], [xx, yHi, zA], col, colB);
  };
  /* shell */
  for (let i = 0; i < n; i++) {                        // roofline run: hood / screens / roof / trunk lid
    if (open && open[i]) continue;
    Q([X(i), Y(i), gW(i)], [X(i), Y(i), -gW(i)], [X(i + 1), Y(i + 1), -gW(i + 1)], [X(i + 1), Y(i + 1), gW(i + 1)], tGlass[i] ? glass : body);
  }
  for (let i = 0; i < n; i++) {                        // flanks follow the plan-view taper
    sideQ(X(i), X(i + 1), y0, belt, belt, W(i), W(i + 1), body, grime);
    sideQ(X(i), X(i + 1), y0, belt, belt, -W(i), -W(i + 1), body, grime);
  }
  for (let i = 0; i < n; i++) {                        // glasshouse + shoulder strips (belt → inset)
    if (Y(i) <= belt + 0.01 && Y(i + 1) <= belt + 0.01) continue;
    for (const s of [1, -1]) {
      const g0 = Math.max(Y(i), belt + 0.06), g1 = Math.max(Y(i + 1), belt + 0.06);
      if (s > 0) Q([X(i + 1), belt + 0.06, cW(i + 1)], [X(i), belt + 0.06, cW(i)], [X(i), g0, gW(i)], [X(i + 1), g1, gW(i + 1)], glass);
      else Q([X(i), belt + 0.06, -cW(i)], [X(i + 1), belt + 0.06, -cW(i + 1)], [X(i + 1), g1, -gW(i + 1)], [X(i), g0, -gW(i)], glass);
      if (s > 0) Q([X(i + 1), belt, W(i + 1)], [X(i), belt, W(i)], [X(i), belt + 0.06, cW(i)], [X(i + 1), belt + 0.06, cW(i + 1)], body);
      else Q([X(i), belt, -W(i)], [X(i + 1), belt, -W(i + 1)], [X(i + 1), belt + 0.06, -cW(i + 1)], [X(i), belt + 0.06, -cW(i)], body);
    }
  }
  noseQ(xF, y0, Y(0), -W(0), W(0), body, grime);
  tailQ(xR, y0, Y(n), -W(n), W(n), body, grime);
  Q([xF, y0 + 0.01, -w * 0.8], [xF, y0 + 0.01, w * 0.8], [xR, y0 + 0.01, w * 0.8], [xR, y0 + 0.01, -w * 0.8], dark); // underbody (faces down)
  if (open) {                                          // pickup bed: floor, inward walls, rims
    const bi = w * 0.96 - 0.12, bf = 0.78 + lift, bw = w * 0.96;
    Q([-0.42, bf, bi], [-0.42, bf, -bi], [-1.95, bf, -bi], [-1.95, bf, bi], grime);         // floor (up)
    Q([-0.42, bf, bi], [-1.95, bf, bi], [-1.95, belt, bi], [-0.42, belt, bi], grime);       // +z wall faces inward (-z)
    Q([-1.95, bf, -bi], [-0.42, bf, -bi], [-0.42, belt, -bi], [-1.95, belt, -bi], grime);   // -z wall faces inward (+z)
    noseQ(-1.95, bf, belt, -bi, bi, grime);                                                 // tailgate inner (faces cab)
    tailQ(-0.42, bf, belt, -bi, bi, grime);                                                 // cab back inner (faces tailgate)
    Q([-0.38, belt, bw], [-0.38, belt, bi], [-2.0, belt, bi], [-2.0, belt, bw], body);      // side rims (up)
    Q([-0.38, belt, -bi], [-0.38, belt, -bw], [-2.0, belt, -bw], [-2.0, belt, -bi], body);
    Q([-1.95, belt, bw], [-1.95, belt, -bw], [-2.05, belt, -bw], [-2.05, belt, bw], body);  // tailgate rim (up)
  }
  /* painted details (thin overlays nudged off the panel so they never z-fight) */
  for (const wx of wheelXs) for (const s of [1, -1]) { // wheel wells: stepped dark arches
    const zz = s * (WA(wx) + 0.013);
    sideQ(wx + 0.48, wx - 0.48, y0 - 0.03, y0 + 0.24, y0 + 0.24, zz, zz, dark);
    sideQ(wx + 0.3, wx - 0.3, y0 + 0.24, y0 + 0.36, y0 + 0.36, zz, zz, dark);
  }
  const seamCol = _c.copy(grime).multiplyScalar(0.7).clone();
  for (const sx of seamXs) for (const s of [1, -1]) {  // door seams + handles
    const zz = s * (WA(sx) + 0.016);
    sideQ(sx + 0.012, sx - 0.012, y0 + 0.18, belt - 0.03, belt - 0.03, zz, zz, seamCol);
    sideQ(sx - 0.12, sx - 0.28, belt - 0.15, belt - 0.115, belt - 0.115, zz, zz, metal);
  }
  {                                                    // pillars along the sloped glass edges + B-pillar
    const pc = _c.copy(body).multiplyScalar(0.9).clone();
    for (let i = 0; i < n; i++) {
      const hi0 = Y(i) > belt + 0.01, hi1 = Y(i + 1) > belt + 0.01;
      if (hi0 === hi1) continue;                       // only the rising / falling runs
      for (const s of [1, -1]) {
        const zi = s * (cW(i) + 0.012), zi1 = s * (cW(i + 1) + 0.012);
        if (s > 0) Q([X(i + 1) - 0.05, belt + 0.05, zi1], [X(i) + 0.05, belt + 0.05, zi], [X(i) - 0.05, Y(i), zi], [X(i + 1) + 0.05, Y(i + 1), zi1], pc);
        else Q([X(i) + 0.05, belt + 0.05, zi], [X(i + 1) - 0.05, belt + 0.05, zi1], [X(i + 1) + 0.05, Y(i + 1), zi1], [X(i) - 0.05, Y(i), zi], pc);
      }
    }
    if (T < 2) {
      const bx = (roofSpan[0] + roofSpan[1]) / 2, bz = w * 0.94 * 0.86 + 0.012;
      sideQ(bx + 0.045, bx - 0.045, belt + 0.05, roofY - 0.02, roofY - 0.02, bz, bz, pc);
      sideQ(bx + 0.045, bx - 0.045, belt + 0.05, roofY - 0.02, roofY - 0.02, -bz, -bz, pc);
    }
  }
  {                                                    // face furniture: lights, grille, plate
    const fx2 = xF + 0.014, ly = Y(0) - 0.16;
    const lens = srgb(0xc8ccb8).multiplyScalar(rng() < 0.25 ? 0.35 : 0.6 + rng() * 0.35);
    for (const s of [1, -1]) {
      const zc = s * W(0) * 0.55;
      noseQ(fx2, ly - 0.07, ly + 0.07, Math.min(zc - 0.14, zc + 0.14), Math.max(zc - 0.14, zc + 0.14), lens);
    }
    noseQ(fx2 - 0.002, ly - 0.06, ly + 0.06, -W(0) * 0.34, W(0) * 0.34, dark);              // grille
    const rx2 = xR - 0.014, ry2 = Y(n) - 0.15, tl = srgb(0x83140e).multiplyScalar(0.5 + rng() * 0.35);
    for (const s of [1, -1]) {
      const zc = s * W(n) * 0.62;
      tailQ(rx2, ry2 - 0.065, ry2 + 0.065, Math.min(zc - 0.12, zc + 0.12), Math.max(zc - 0.12, zc + 0.12), tl);
    }
    tailQ(rx2, ry2 - 0.36, ry2 - 0.23, -0.17, 0.17, srgb(0xa8a496).multiplyScalar(0.7 + rng() * 0.3));  // plate
  }
  if (rusty || husk) {                                 // rust blooms on the flanks
    const np2 = 2 + (rng() * 3 | 0);
    for (let k = 0; k < np2; k++) {
      const s = rng() < 0.5 ? 1 : -1, px2 = -1.5 + rng() * 3;
      const zz = s * (WA(px2) + 0.008 + k * 0.002);
      const wq = 0.25 + rng() * 0.5, hq = 0.1 + rng() * 0.25, yc = y0 + 0.15 + rng() * (belt - y0 - 0.4);
      const rc = _c.copy(COL.rust).multiplyScalar(0.7 + rng() * 0.5).lerp(body, 0.25).clone();
      sideQ(px2 + wq, px2 - wq, yc, yc + hq, yc + hq, zz, zz, rc);
    }
  }
  /* prop geometry (positions ride the sag transform so nothing floats off a tilted body) */
  const G = (px, py, pz, sx, sy, sz, col, cyl) => {
    const [gx, gy, gz] = P(px, py, pz);
    B.plain.addGeo(cyl ? tplCyl : tplBoxC, compose(gx, gy, gz, sx, sy, sz, 0, ang, 0), col, 0.05, rng);
  };
  for (const ex of [xF + 0.02, xR - 0.02]) G(ex, 0.56 + lift, 0, 0.16, 0.18, w * 2 - 0.12, COL.tire);   // bumpers
  for (const s of [1, -1]) G(mirX, belt + 0.14, s * (w + 0.08), 0.14, 0.08, 0.06, body);                // mirrors
  if (rng() < 0.4) G(X(1) - 0.12, Y(1), w * 0.55, 0.014, 0.48, 0.014, dark, true);                      // antenna
  if (rng() < 0.55) G(xR - 0.02, 0.16 + lift, -w * 0.45, 0.2, 0.05, 0.05, dark);                        // exhaust
  if ((T === 1 || T === 3) && rng() < 0.35)                                                             // roof rack rails
    for (const s of [1, -1]) G((roofSpan[0] + roofSpan[1]) / 2, roofY + 0.06, s * w * 0.55, (roofSpan[0] - roofSpan[1]) * 0.72, 0.05, 0.05, metal);
  let wi2 = 0;
  for (const wx of wheelXs) for (const s of [1, -1]) { // wheels + hubcaps (deflated ones squash)
    const flat = dfl[wi2++], r = flat ? 0.26 : 0.34;
    const [px, pz] = rot(wx * sL, s * (w - 0.06));
    B.plain.addGeo(tplWheel, compose(px, ty + r, pz, 0.34, r, 0.22, 0, ang, 0), COL.tire, 0.05, rng);
    const [hx2, hz2] = rot(wx * sL, s * (w + 0.058));
    B.plain.addGeo(tplWheel, compose(hx2, ty + r, hz2, 0.13, 0.13, 0.02, 0, ang, 0), metal, 0.08, rng);
  }
  /* the forest takes them back */
  if (rng() < 0.5) {                                   // moss on the hood
    const [mx, mz] = rot((X(1) - 0.2 - rng() * 0.8) * sL, (rng() - 0.5) * 0.8);
    const mr = 0.5 + rng() * 0.5;
    B.leaf.addGeo(tplBlob, compose(mx, ty + Y(1) + 0.06, mz, mr, mr * 0.5, mr, 0, rng() * 7, 0), COL.leafC, 0.2, rng);
  }
  if (open && rng() < 0.5) {                           // a shrub claims the pickup bed
    const [mx, mz] = rot((-0.7 - rng() * 0.9) * sL, (rng() - 0.5) * 0.7);
    const mr = 0.45 + rng() * 0.4;
    B.leaf.addGeo(tplBlob, compose(mx, ty + belt + 0.1, mz, mr, mr * 0.7, mr, 0, rng() * 7, 0), COL.leafB, 0.2, rng);
  }
  if (rng() < 0.55) {                                  // vine drapes over the roof
    const nd = 1 + (rng() < 0.4 ? 1 : 0);
    for (let k = 0; k < nd; k++) {
      const lx = (roofSpan[1] + (roofSpan[0] - roofSpan[1]) * rng()) * sL;
      const [dx0, dz0] = rot(lx, -w), [dx1, dz1] = rot(lx, w);
      const vcol = _c.copy(COL.vine).multiplyScalar(0.55 + rng() * 0.4).clone();
      B.vine.quad([dx0, ty + roofY + 0.04, dz0], [dx1, ty + roofY + 0.04, dz1], [dx1, ty + roofY - 0.86 - rng() * 0.5, dz1], [dx0, ty + roofY - 0.86 - rng() * 0.5, dz0], [0, 0, 1, 1], vcol);
    }
  }
  const hw = Math.abs(Math.cos(ang)) * 2.15 * sL + Math.abs(Math.sin(ang)) * (w + 0.05);
  const hd = Math.abs(Math.sin(ang)) * 2.15 * sL + Math.abs(Math.cos(ang)) * (w + 0.05);
  colData.solids.push({ x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd, y0: ty, h: T >= 2 ? 1.7 : 1.55, vine: false });
}

/* ---- street lamps (some still alive) ---- */
function addLamp(B, colData, rng, x, z, armAng) {
  const ty = terrainY(x, z);   // whole lamp rides one sample: pole foot, ivy, arm and head
  const pole = _c.copy(COL.lampPole).multiplyScalar(0.8 + rng() * 0.3).clone();
  B.plain.addGeo(tplCyl, compose(x, ty - 0.2, z, 0.09, 4.8, 0.09), pole, 0, rng);
  // ivy creeping up the pole (visual only): a couple of narrow vine ribbons on facing sides
  if (rng() < 0.7) {
    const vh = ty + 1.6 + rng() * 2.4, vw = 0.26 + rng() * 0.2, o = 0.11;
    const vcol = _c.copy(COL.vine).multiplyScalar(0.6 + rng() * 0.35).clone();
    B.vine.quad([x - vw / 2, ty, z + o], [x + vw / 2, ty, z + o], [x + vw / 2, vh, z + o], [x - vw / 2, vh, z + o], [0, 0, 1, Math.max(1, (vh - ty) / 2 | 0)], vcol);
    if (rng() < 0.5) B.vine.quad([x + o, ty, z - vw / 2], [x + o, ty, z + vw / 2], [x + o, ty + (vh - ty) * 0.8, z + vw / 2], [x + o, ty + (vh - ty) * 0.8, z - vw / 2], [0, 0, 1, 1], vcol);
  }
  const dx = Math.cos(armAng), dz = Math.sin(armAng);
  B.plain.addGeo(tplBox, compose(x + dx * 0.75, ty + 4.42, z + dz * 0.75, 1.6, 0.12, 0.12, 0, -armAng, 0), pole, 0, rng);
  const head = compose(x + dx * 1.45, ty + 4.18, z + dz * 1.45, 0.55, 0.2, 0.32, 0, -armAng, 0);
  // Regions: ashen quarters keep few working lamps (dark streets at night). rng-neutral.
  const working = rng() < 0.55 * (CUR_REG && CUR_REG.biome === 'ashen' ? 0.3 : 1);
  if (working) B.lamp.addGeo(tplBox, head, srgb(0xfff1cf), 0, rng);
  else B.plain.addGeo(tplBox, head, COL.wire, 0, rng);
  // Little details: a bird's nest on ~10% of lamp heads — a brown ring blob + a few twigs.
  if (rng() < 0.1) {
    const nx = x + dx * 1.45, nz = z + dz * 1.45, ny = ty + 4.42;
    B.plain.addGeo(tplBlob, compose(nx, ny, nz, 0.26, 0.15, 0.26, 0, rng() * 7, 0), _c.copy(NEST_COL).multiplyScalar(0.85 + rng() * 0.3).clone(), 0.25, rng);
    for (let k = 0, nt = 2 + (rng() * 2 | 0); k < nt; k++)
      B.plain.addGeo(tplCyl, compose(nx + (rng() - 0.5) * 0.2, ny + 0.06, nz + (rng() - 0.5) * 0.2, 0.02, 0.28 + rng() * 0.18, 0.02, 0, rng() * 7, Math.PI / 2), _c.copy(COL.deadwood).multiplyScalar(0.9 + rng() * 0.3).clone(), 0, rng);
  }
  colData.trunks.push({ x, z, r: 0.14, y0: ty, h: 4.6 });
  colData.lamps.push({ x, z, working, hx: x + dx * 1.45, hy: ty + 4.18, hz: z + dz * 1.45 });
}

/* ---- Ladders (Ladders feature) ---------------------------------------------
   A rung ladder strapped to a vertical face: two thin wood side-rails and rungs
   every ~0.45 m, all batched into B.plain (wood/brass palette). (nx,nz) is the
   outward face normal — the side the player hangs on. Registers a climb volume
   in colData.ladders as a vertical line segment + normal; player.js does the
   latch. Runs longer than ~16 m get a small rest platform pad (layer 'lookout',
   a caught landing) every ~14 m so a long climb reads as a deliberate route.
   (Extends the spec's addLadder(B,x,z,y0,y1,nx,nz) with colData+rng, like every
   other builder — it must register collision + jitter its geometry.) */
function addLadder(B, colData, rng, x, z, y0, y1, nx, nz) {
  const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
  const tx = -nz, tz = nx;                                   // horizontal tangent along the face
  const railHalf = 0.28, off = 0.06;                         // rail spacing, stand-off from the face
  const rail = _c.copy(COL.wood).multiplyScalar(1.1 + rng() * 0.2).clone();
  const rung = _c.copy(COL.rust).multiplyScalar(0.9 + rng() * 0.2).clone();   // brassy rungs
  const H = y1 - y0;
  if (H <= 0) return;
  const yaw = Math.atan2(nx, nz);                            // face the box's z-thickness along the normal
  // two side-rails (thin tall boxes)
  for (const s of [-1, 1]) {
    const rx = x + tx * railHalf * s + nx * off, rz = z + tz * railHalf * s + nz * off;
    B.plain.addGeo(tplBox, compose(rx, y0, rz, 0.08, H, 0.08, 0, yaw, 0), rail, 0.12, rng);
  }
  // rungs every ~0.45 m
  const nR = Math.max(1, Math.floor(H / 0.45));
  for (let k = 0; k <= nR; k++) {
    const ry = y0 + k * (H / nR);
    B.plain.addGeo(tplBoxC, compose(x + nx * (off + 0.02), ry, z + nz * (off + 0.02), 0.05, 0.05, railHalf * 2 + 0.1, 0, yaw, 0), rung, 0.1, rng);
  }
  // rest platforms on long runs (deliberate stacked-segment feel + a caught landing)
  if (H > 16) {
    const segs = Math.ceil(H / 14);
    for (let k = 1; k < segs; k++) {
      const py = y0 + (H / segs) * k;
      const cxp = x + nx * 1.2, czp = z + nz * 1.2;          // ledge juts out along the normal
      const plat = _c.copy(COL.wood).multiplyScalar(0.9).clone();
      B.plain.addGeo(tplCyl, compose(cxp, py - 0.12, czp, 1.6, 0.24, 1.6), plat, 0.1, rng);
      colData.pads.push({ x: cxp, z: czp, r: 1.5, y: py, layer: 'lookout' });
    }
  }
  colData.ladders.push({ x, z, y0, y1, nx, nz });
}

/* ---- Lifts (winch lift): a hand-cranked counterweight platform ---------------
   Replaces the waytree ground→deck ladder. A static frame (two guide rails, a
   crossbeam, a brass winch drum, a taut hoist rope, and a hanging stone counter-
   weight) is batched into B.plain in world coords like every other builder. The
   moving platform is a SEPARATE, standalone Batch baked with vertex colours and
   reusing matPlain (the chunk's plain material) — ONE shared material, never a
   per-lift one, because chunk disposal only disposes geometry, so a fresh material
   would leak. That mesh rides in its own THREE.Group (default matrixAutoUpdate,
   like the reservoir water plane) whose world y is driven each frame by
   updateLifts in player.js. Registers a { x,z,r,y0,y1,y,v,mesh } row in
   colData.lifts; player.js does the pump/decay/clamp + rider carry. */
function addLift(B, colData, rng, extraMeshes, x, z, deckY) {
  const px = x + 3.6, pz = z;                                // shaft on the +x side (the deck railing's gap)
  const ty = terrainY(px, pz);                               // Terrain: the shaft foot, and the platform's parked height
  const railTop = deckY + 1.8;
  const wood = _c.copy(COL.wood).multiplyScalar(1.05 + rng() * 0.2).clone();
  const brass = _c.copy(COL.rust).multiplyScalar(0.95 + rng() * 0.2).clone();
  const rope = _c.copy(COL.deadwood).multiplyScalar(0.85 + rng() * 0.2).clone();
  const stone = _c.copy(COL.rock).multiplyScalar(0.75).clone();
  // two guide rails (thin tall boxes) + a crossbeam joining their tops
  for (const s of [-1, 1]) B.plain.addGeo(tplBox, compose(px, ty - 0.2, pz + s * 1.25, 0.1, railTop - ty + 0.2, 0.1), wood, 0.1, rng);
  B.plain.addGeo(tplBoxC, compose(px, railTop, pz, 0.12, 0.12, 2.72), wood, 0.1, rng);
  // winch drum under the crossbeam centre (short fat cylinder, axis along z) + a taut hoist rope to the ground
  B.plain.addGeo(tplCyl, compose(px, railTop - 0.28, pz - 0.3, 0.26, 0.6, 0.26, Math.PI / 2, 0, 0), brass, 0.12, rng);
  B.plain.addGeo(tplBox, compose(px, ty, pz, 0.04, railTop - 0.28 - ty, 0.04), rope, 0, rng);
  // counterweight: a stone block on a second rope beside the +z rail, hanging at mid-height (static visual — do not animate)
  const cwy = deckY * 0.5;
  B.plain.addGeo(tplBox, compose(px, cwy, pz + 1.25, 0.04, railTop - 0.28 - cwy, 0.04), rope, 0, rng);
  B.plain.addGeo(tplBoxC, compose(px, cwy, pz + 1.25, 0.42, 0.6, 0.42), stone, 0.12, rng);
  // --- the moving platform: a standalone batch, local origin = platform TOP surface
  // at y 0, centred on (0,0); the Group carries it to (px, lift.y, pz). ---
  const pb = new Batch();
  const plank = _c.copy(COL.wood).multiplyScalar(1.1 + rng() * 0.2).clone();
  const post = _c.copy(COL.deadwood).clone();
  pb.addGeo(tplCyl, compose(0, -0.22, 0, 1.15, 0.22, 1.15), plank, 0.1, rng);        // plank disc, top face at y 0
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    pb.addGeo(tplBox, compose(sx * 0.86, 0, sz * 0.86, 0.08, 0.6, 0.08), post, 0.1, rng);   // corner posts
  for (const sz of [-1, 1])                                                          // low rail ring on the ±z (rail) sides only — ±x stays open to walk on/off
    pb.addGeo(tplBoxC, compose(0, 0.52, sz * 1.0, 1.9, 0.06, 0.06), post, 0.1, rng);
  for (const s of [-1, 1])                                                           // rope yoke rising to a hang point ~2 m up (the "hanging basket" read)
    pb.addGeo(tplCyl, segMat(s * 0.9, 0, 0, 0, 2.0, 0, 0.03), rope, 0.05, rng);
  const pmesh = pb.mesh(matPlain, true, true);
  const group = new THREE.Group();
  group.position.set(px, ty + 0.28, pz);
  if (pmesh) group.add(pmesh);
  extraMeshes.push(group);
  colData.lifts.push({ x: px, z: pz, r: 1.15, y0: ty + 0.28, y1: deckY, y: ty + 0.28, v: 0, mesh: group });
}

/* ---- Waytrees → Skyhouse (Skyhouse feature, supersedes the canopy-height lookout)
   A special mission tree whose lookout now TOWERS over the crowns. The tree's own
   crown caps ~6 m BELOW the deck (addTree → a colData.trunks entry + a canopy pad
   that shades the lift ride); a bare mast-trunk (a second, thinner colData.trunks
   entry, freeclimbable + sun-occluding) carries on up to the floor. On top sits the
   skyhouse at deckY ∈ [42,50): a big plank deck (colData.pads, layer 'lookout', the
   friendly vantage), diagonal support struts so it reads BUILT, a parapet, a FULL
   pitched roof registering real shade (a no-layer pad → 0.75 sun attenuation, so the
   roof is a genuine cool spot at the top of a sun-baked climb), and a beacon mast whose
   glowing head (colData.lamps) reads across the whole night map. The ground→deck winch
   lift (Lifts feature) is unchanged. Position/height come from waytreeSpec(ix,iz) so
   finders can recompute it. Called LAST in buildChunk so its rng draws never shift
   other chunk content (RNG discipline). */
function addWaytree(B, colData, mini, rng, x, z, deckY, extraMeshes) {
  // Skyhouse: the tree crown now tops out ~4–6 m BELOW the deck (addTree puts blobs at cy=h*0.92);
  // h≥32 still lets addTree hang a crown nest in the foliage under the house — charming, kept.
  addTree(B, colData, mini, rng, x, z, deckY - 6, 10 + rng() * 2, { trunkR: 2.1, blobs: 6 });
  // Skyhouse: a bare mast-trunk continues from inside the crown up to the floor — sun-occluding AND
  // freeclimbable (trunks with h>14 take the climb path), so purists can skip the lift entirely.
  B.bark.addGeo(tplTrunk, compose(x, deckY - 7, z, 1.5, 8, 1.5, 0, rng() * 7, 0), COL.bark, 0.18, rng);
  // Terrain: the freeclimbable mast column runs from the ground up to the skyhouse floor.
  const wty = terrainY(x, z);
  colData.trunks.push({ x, z, r: 1.5, y0: wty, h: deckY - wty });
  // Lifts: a hand-cranked counterweight lift on the +x face (replaces the ground→deck ladder)
  addLift(B, colData, rng, extraMeshes, x, z, deckY);
  // --- the skyhouse floor: a bigger plank disc (+ the faint grain disc idiom) ---
  const r = 3.2;
  const plank = _c.copy(COL.wood).multiplyScalar(1.05 + rng() * 0.2).clone();
  const plankDk = _c.copy(COL.wood).multiplyScalar(0.6).clone();
  B.plain.addGeo(tplCyl, compose(x, deckY - 0.16, z, r, 0.3, r), plank, 0.12, rng);       // deck slab
  B.plain.addGeo(tplCyl, compose(x, deckY + 0.01, z, r, 0.02, r), plankDk, 0.1, rng);     // faint plank grain
  colData.pads.push({ x, z, r: 3.0, y: deckY, layer: 'lookout' });                        // the vantage deck
  // Skyhouse: 5 diagonal support struts from the mast (~deckY−4) out to the deck rim — reads BUILT, not floating
  const strut = _c.copy(COL.wood).multiplyScalar(0.8).clone();
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2 + 0.3;
    const ex = x + Math.cos(a) * (r - 0.25), ez = z + Math.sin(a) * (r - 0.25);
    B.plain.addGeo(tplCyl, segMat(x, deckY - 4, z, ex, deckY - 0.25, ez, 0.1), strut, 0.1, rng);
  }
  // parapet: railing posts + rail caps around the rim, gap on the lift-dock side (+x)
  const posts = 14;
  for (let k = 0; k < posts; k++) {
    const a = k / posts * Math.PI * 2;
    if (Math.cos(a) > 0.72) continue;                        // leave the lift dock open
    const px = x + Math.cos(a) * (r - 0.2), pz = z + Math.sin(a) * (r - 0.2);
    B.plain.addGeo(tplCyl, compose(px, deckY, pz, 0.05, 0.9, 0.05), COL.deadwood, 0.1, rng);
    if (k % 2 === 0)                                         // top rail cap between posts
      B.plain.addGeo(tplBoxC, compose(px, deckY + 0.88, pz, 0.06, 0.06, 0.06), COL.deadwood, 0.1, rng);
  }
  // Skyhouse: a FULL pitched roof on 6 posts that casts real shade (no-layer pad → 0.75 sun atten).
  const roofY = deckY + 2.8, roofR = 3.3;
  const roofCol = srgb(0x5a3a28), gableCol = srgb(0x6b4630);
  for (let k = 0; k < 6; k++) {                              // roof posts carrying the eaves
    const a = k / 6 * Math.PI * 2 + 0.2;
    const cx2 = x + Math.cos(a) * roofR * 0.92, cz2 = z + Math.sin(a) * roofR * 0.92;
    B.plain.addGeo(tplCyl, compose(cx2, deckY, cz2, 0.06, roofY - deckY, 0.06), COL.wood, 0.1, rng);
  }
  addGableRoof(B, x - roofR, z - roofR, x + roofR, z + roofR, roofY, roofCol, gableCol, { interior: true });
  colData.pads.push({ x, z, r: 3.2, y: deckY + 2.9 });       // real shade: E ≈ 0.25 inside → body-heat burn ≈ 0 under the roof
  // Skyhouse: a beacon mast from the ridge to a glowing head — reads across the night map (REPLACES the old rim lamp)
  const rh = clamp(roofR * 0.9, 1.4, 4.5);                   // matches addGableRoof's ridge height (min(w,d)*0.45)
  const ridgeY = roofY + rh, hy = deckY + 6.6;
  B.plain.addGeo(tplCyl, compose(x, ridgeY, z, 0.06, deckY + 7 - ridgeY, 0.06), COL.lampPole, 0, rng);   // beacon mast
  B.lamp.addGeo(tplBox, compose(x, hy, z, 0.34, 0.3, 0.34), srgb(0xfff1cf), 0, rng);                     // glowing head
  colData.lamps.push({ x, z, working: true, hx: x, hy, hz: z });
  const banner = _c.copy(COL.rust).multiplyScalar(1.1).clone();                                          // a small banner off the mast
  B.plain.quad([x, hy - 0.85, z], [x + 0.85, hy - 0.72, z], [x + 0.85, hy - 0.16, z], [x, hy - 0.16, z], [0, 0, 1, 1], banner);
  // Skyhouse ceiling carpentry: the open pavilion now shows the roof from below (addGableRoof
  // interior:true above), so dress the underside to read BUILT — a ridge beam under the peak
  // plus 3 rafter pairs, each running eave→ridge on one slope (parallel to the gable ends).
  // All dropped ~0.06 m under the roof plane so they sit proud of the ceiling face without
  // z-fighting it. Runs at the rng-stream tail, so this jitter shifts nothing outside the house.
  const ridgeCol = _c.copy(COL.wood).multiplyScalar(0.85).clone();
  const rafterCol = _c.copy(COL.wood).multiplyScalar(0.8).clone();
  B.plain.addGeo(tplBoxC, compose(x, roofY + rh - 0.06, z, roofR * 1.96, 0.1, 0.1), ridgeCol, 0.1, rng);   // ridge beam along x (matches the w>=d ridge)
  for (let k = 0; k < 3; k++) {                                                                             // rafter pairs across the ridge axis
    const xi = x + (k - 1) * roofR * 0.62 + (rng() - 0.5) * 0.3;
    B.plain.addGeo(tplCyl, segMat(xi, roofY - 0.06, z - roofR, xi, roofY + rh - 0.06, z, 0.05), rafterCol, 0.1, rng);   // slope toward -z eave
    B.plain.addGeo(tplCyl, segMat(xi, roofY - 0.06, z + roofR, xi, roofY + rh - 0.06, z, 0.05), rafterCol, 0.1, rng);   // slope toward +z eave
  }
}

/* ---- power poles & sagging wires ---- */
function wireSpan(B, ax, ay, az, bx, by, bz, sag, rng) {
  const segs = 5, w = 0.05;
  const rand = rng || Math.random;
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
  const px = -dz / L * w, pz = dx / L * w;
  let lx = ax, ly = ay, lz2 = az;
  for (let k = 1; k <= segs; k++) {
    const t = k / segs;
    const nx = lerp(ax, bx, t), nz = lerp(az, bz, t);
    const ny = lerp(ay, by, t) - Math.sin(t * Math.PI) * sag;
    B.plain.quad([lx - px, ly, lz2 - pz], [lx + px, ly, lz2 + pz], [nx + px, ny, nz + pz], [nx - px, ny, nz - pz], [0, 0, 1, 1], COL.wire);
    B.plain.quad([lx + px, ly, lz2 + pz], [lx - px, ly, lz2 - pz], [nx - px, ny, nz - pz], [nx + px, ny, nz + pz], [0, 0, 1, 1], COL.wire);
    lx = nx; ly = ny; lz2 = nz;
  }
  // short dangling vine ribbons hanging off the wire (visual only) — sampled along the catenary.
  // Only the wire that was handed a deterministic rng sprouts them (keeps the lower wire bare).
  const nHang = rng ? 2 + (rand() * 4 | 0) : 0;
  for (let k = 0; k < nHang; k++) {
    const t = 0.12 + rand() * 0.76;
    const hx = lerp(ax, bx, t), hz = lerp(az, bz, t);
    const hy = lerp(ay, by, t) - Math.sin(t * Math.PI) * sag;
    const len = 1.2 + rand() * 3.0, ww = 0.3 + rand() * 0.4;
    const a = rand() * Math.PI, ddx = Math.cos(a) * ww / 2, ddz = Math.sin(a) * ww / 2;
    const col = _c.copy(COL.vine).multiplyScalar(0.62 + rand() * 0.4).clone();
    B.vine.quad([hx - ddx, hy - len, hz - ddz], [hx + ddx, hy - len, hz + ddz], [hx + ddx, hy, hz + ddz], [hx - ddx, hy, hz - ddz],
      [0, 0, 1, Math.max(1, Math.round(len / 2))], col);
  }
}
function addPowerPole(B, colData, rng, x, z, axis) {
  // Terrain: the poles carry wireSpan catenaries strung at fixed absolute y (6.7 / 6.35) by
  // buildChunk, so the pole is SUNK to the ground rather than lifted — the crossarm and the
  // wires stay welded at their design height and the foot never floats.
  const ty = terrainY(x, z);
  B.plain.addGeo(tplCyl, compose(x, ty - 0.3, z, 0.11, 7.2 - ty + 0.3, 0.11), COL.wood, 0.1, rng);
  const arm = axis === 0 ? compose(x, 6.7, z, 1.7, 0.1, 0.12) : compose(x, 6.7, z, 0.12, 0.1, 1.7);
  B.plain.addGeo(tplBox, arm, COL.wood, 0.1, rng);
  colData.trunks.push({ x, z, r: 0.15, y0: ty, h: 7.2 - ty });
}

/* ---- market stalls ---- */
function addStall(B, colData, rng, x, z, ang) {
  const ty = terrainY(x, z);   // one sample at the stall centre: posts, awning and counter agree
  const rot = (lx, lz) => [x + lx * Math.cos(ang) + lz * Math.sin(ang), -lx * Math.sin(ang) + lz * Math.cos(ang) + z];
  const awn = _c.copy(SIGN_COLS[(rng() * SIGN_COLS.length) | 0]).multiplyScalar(0.85 + rng() * 0.3).clone();
  for (const [lx, lz] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) {
    const [px, pz] = rot(lx, lz);
    B.plain.addGeo(tplCyl, compose(px, ty - 0.15, pz, 0.06, 2.35 + (lz < 0 ? 0.4 : 0), 0.06), COL.wood, 0.1, rng);
  }
  // sloped awning
  const [a1x, a1z] = rot(-1.5, -1.1), [a2x, a2z] = rot(1.5, -1.1), [a3x, a3z] = rot(1.5, 1.1), [a4x, a4z] = rot(-1.5, 1.1);
  B.plain.quad([a1x, ty + 2.6, a1z], [a2x, ty + 2.6, a2z], [a3x, ty + 2.2, a3z], [a4x, ty + 2.2, a4z], [0, 0, 1, 1], awn);
  B.plain.quad([a2x, ty + 2.6, a2z], [a1x, ty + 2.6, a1z], [a4x, ty + 2.2, a4z], [a3x, ty + 2.2, a3z], [0, 0, 1, 1], _c.copy(awn).multiplyScalar(0.7).clone());
  // counter + crates
  const [ccx, ccz] = rot(0, 0.2);
  B.plain.addGeo(tplBox, compose(ccx, ty - 0.1, ccz, 2.4, 1.0, 1.1, 0, -ang, 0), COL.wood, 0.15, rng);
  for (let k = 0; k < 2 + (rng() * 2 | 0); k++) {
    const [bx2, bz2] = rot(-1 + rng() * 2, -0.6 + rng() * 0.5);
    B.plain.addGeo(tplBox, compose(bx2, ty + 0.9, bz2, 0.45, 0.3, 0.45, 0, rng() * 7, 0), _c.copy(COL.wood).multiplyScalar(1.2).clone(), 0.2, rng);
  }
  if (rng() < 0.6) addGlowPlant(B, rng, ...rot(1.1, 0.3), 0.22);
  // Little details: market litter spilled in front of the stall — broken crates, a cloth
  // scrap, and a few faded fruit dots scattered on the ground.
  for (let k = 0, nc = 1 + (rng() * 2 | 0); k < nc; k++) {
    const [lx, lz] = rot(-2 + rng() * 4, 1.5 + rng() * 1.3);
    addBrokenCrate(B, rng, lx, lz);
  }
  if (rng() < 0.7) {
    const [sx, sz] = rot(1.1 + rng() * 1.4, -0.5 + rng() * 1.6), cw = 0.4 + rng() * 0.3;
    const col = _c.copy(AWNING_COLS[(rng() * AWNING_COLS.length) | 0]).lerp(srgb(0x777066), 0.35).clone();
    const cy = terrainY(sx, sz);
    B.plain.quad([sx - cw, cy + 0.02, sz - cw * 0.6], [sx + cw, cy + 0.03, sz - cw * 0.4], [sx + cw * 0.8, cy + 0.02, sz + cw * 0.6], [sx - cw * 0.7, cy + 0.02, sz + cw * 0.5], [0, 0, 1, 1], col);
  }
  for (let k = 0, nf = 2 + (rng() * 3 | 0); k < nf; k++) {
    const [fx, fz] = rot(-1.6 + rng() * 3.2, -0.6 + rng() * 2.2);
    B.plain.addGeo(tplRock, compose(fx, terrainY(fx, fz) + 0.06, fz, 0.09, 0.09, 0.09, rng(), rng() * 7, rng()), _c.copy(FRUIT_COLS[(rng() * FRUIT_COLS.length) | 0]).multiplyScalar(0.7 + rng() * 0.35).clone(), 0.25, rng);
  }
  colData.solids.push({ x0: x - 1.6, z0: z - 1.3, x1: x + 1.6, z1: z + 1.3, y0: ty, h: 0.9, vine: false });
  // Life pass: a vendor/customer anchor. rot is the stall's local frame; the runtime places a
  // vendor behind the counter (local -z) and a customer in front (local +z).
  if (colData.stallAnchors) colData.stallAnchors.push({ x, z, rot: ang });
}

