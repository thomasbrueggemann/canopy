/* CANOPY split file  puzzles: "The Gardeners' Ciphers" (Part 2). A post-Spire expedition of
   five sealed Authority caches, each locked by a genuinely tricky puzzle, plus a final cog-
   vault at the Spire. Aimed at adults: NO minimap markers for solutions, answers derived from
   the real deterministic world (counting real lamps, listening to real notes, chasing the real
   shadow), so nothing can be looked up. Loaded AFTER inventory.js and BEFORE story.js: every
   runtime helper it calls (msg/hint/once, dist2, bearingPhrase, peekColData, chunkType,
   districtStyle, isCanalX/Z, sfxTrialDone, invRegister/invAdd/invHas/invNote, sunDir/dayF/
   nightF, summited, keys, camera, makeNPCGroup) already exists by load; anything from story.js
   (which loads LAST) is only ever touched runtime-guarded. Mirrors the story/trials house
   pattern: a state object, per-frame updatePuzzles(dt,time) driver, pure-hash finders run ONLY
   at session-init (never peekColData per frame), a pooled prop set (CIPH_POOL, ≤10 meshes), and
   localStorage persistence. The Ciphers NEVER touch activeObjective or the #mission panel —
   being marker-less is the difficulty; all feedback is hint()/msg(). No worldgen changes. */
'use strict';

/* ======================================================================== */
/*  STATE + PERSISTENCE (canopy.ciphers v1)                                  */
/*  Solved flags / cogs / mantle / attempts persist. Cache POSITIONS are     */
/*  recomputed every session by the finders (SPIRE re-rolls each session);   */
/*  that is the sanctioned tradeoff — solved husks may move between sessions. */
/* ======================================================================== */
let CIPH_SAVE = { v: 1, met: false, solved: { c1: false, c2: false, c3: false, c4: false, c5: false },
  mantle: false, attempts: { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, vault: 0 } };
try {
  const _cs = JSON.parse(localStorage.getItem('canopy.ciphers') || 'null');
  if (_cs && _cs.v === 1) CIPH_SAVE = Object.assign(CIPH_SAVE, _cs);
} catch (e) { }
CIPH_SAVE.solved = CIPH_SAVE.solved || { c1: false, c2: false, c3: false, c4: false, c5: false };
CIPH_SAVE.attempts = CIPH_SAVE.attempts || { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, vault: 0 };
function ciphSave() { try { localStorage.setItem('canopy.ciphers', JSON.stringify(CIPH_SAVE)); } catch (e) { } }

// Live state. `loc` holds this session's finder-computed positions/truths (null until located).
const ciph = { met: CIPH_SAVE.met, located: false, loc: null,
  _ePrev: false, _pressTgt: null, _eDownT: 0,
  c1: { locked: [false, false, false], dig: [0, 0, 0], sel: 0, holdT: 0 },
  c2: { step: 0 }, c3: { digT: 0 }, c5: { step: 0 },
  vault: { seated: [-1, -1, -1, -1, -1], opening: 0, mantleOut: false } };
var ciphMantle = !!CIPH_SAVE.mantle;   // var: read by player.js/stepHeat + main.js/drawMinimap (cross-file)
var ciphTinker = null;                 // the Tinker NPC, once spawned (read by drawMinimap)

/* ======================================================================== */
/*  PURE LOGIC — transcribed verbatim from the tested scratch harness        */
/*  (Four Seasons unique-solution generator, carillon shuffle, glyph cipher).*/
/*  These depend only on hash2/mulberry32, so they are deterministic and were */
/*  unit-tested in isolation across hundreds of seeds before wiring in.       */
/* ======================================================================== */

/* ---- Four Seasons: generate a constraint set with EXACTLY one solution ---- */
const CIPH_SEASON_NAMES = ['Sowing', 'Bloom', 'Harvest', 'Frost'];
const CIPH_SEASON_GLYPH = ['✿', '☀', '❦', '❄'];
const CIPH_ORDINAL = ['first', 'second', 'third', 'fourth'];
function seasonPosOf(order) { const p = [0, 0, 0, 0]; for (let i = 0; i < 4; i++) p[order[i]] = i; return p; }
function seasonClueHolds(cl, pos) {
  switch (cl.t) {
    case 'before': return pos[cl.a] < pos[cl.b];
    case 'immed': return pos[cl.a] === pos[cl.b] + 1;      // a immediately after b
    case 'nofirst': return pos[cl.a] !== 0;
    case 'nolast': return pos[cl.a] !== 3;
    case 'noadj': return Math.abs(pos[cl.a] - pos[cl.b]) !== 1;
    case 'nth': return pos[cl.a] === cl.n;
  }
  return false;
}
const SEASON_PERMS = (function () {
  const out = [], a = [0, 1, 2, 3];
  const rec = (k) => { if (k === 4) { out.push(a.slice()); return; } for (let i = k; i < 4; i++) { let s = a[k]; a[k] = a[i]; a[i] = s; rec(k + 1); s = a[k]; a[k] = a[i]; a[i] = s; } };
  rec(0); return out;
})();
function seasonCountSurvivors(clues) {
  let n = 0, only = null;
  for (const perm of SEASON_PERMS) {
    const pos = seasonPosOf(perm); let ok = true;
    for (const cl of clues) if (!seasonClueHolds(cl, pos)) { ok = false; break; }
    if (ok) { n++; only = perm; }
  }
  return { n, only };
}
// secret order from seed; greedy-best relational clues (each shrinks the survivor set the
// most) until exactly one perm (== secret) remains — typically 3 clues, deterministic.
function generateSeasons(seed) {
  const rng = mulberry32(seed >>> 0);
  const secret = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const s = secret[i]; secret[i] = secret[j]; secret[j] = s; }
  const pos = seasonPosOf(secret);
  const cand = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
    if (a === b) continue;
    if (pos[a] < pos[b]) cand.push({ t: 'before', a, b });
    if (pos[a] === pos[b] + 1) cand.push({ t: 'immed', a, b });
  }
  for (let a = 0; a < 4; a++) { if (pos[a] !== 0) cand.push({ t: 'nofirst', a }); if (pos[a] !== 3) cand.push({ t: 'nolast', a }); }
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) if (Math.abs(pos[a] - pos[b]) !== 1) cand.push({ t: 'noadj', a, b });
  for (let i = cand.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const s = cand[i]; cand[i] = cand[j]; cand[j] = s; }
  const clues = []; let survivors = 24; const used = new Array(cand.length).fill(false);
  while (survivors > 1) {
    let bestI = -1, bestN = survivors;
    for (let i = 0; i < cand.length; i++) { if (used[i]) continue; const { n } = seasonCountSurvivors(clues.concat([cand[i]])); if (n < bestN) { bestN = n; bestI = i; } }
    if (bestI < 0) break;
    used[bestI] = true; clues.push(cand[bestI]); survivors = bestN;
  }
  if (survivors > 1) for (let a = 0; a < 4 && survivors > 1; a++) { const cl = { t: 'nth', a, n: pos[a] }; const { n } = seasonCountSurvivors(clues.concat([cl])); if (n < survivors) { clues.push(cl); survivors = n; } }
  return { secret, clues };
}
function seasonClueText(cl) {
  const N = CIPH_SEASON_NAMES;
  switch (cl.t) {
    case 'before': return N[cl.a] + ' wakes before ' + N[cl.b] + '.';
    case 'immed': return N[cl.a] + ' follows ' + N[cl.b] + ' at once.';
    case 'nofirst': return N[cl.a] + ' is neither first.';
    case 'nolast': return N[cl.a] + ' is not the last.';
    case 'noadj': return N[cl.a] + ' and ' + N[cl.b] + ' never touch.';
    case 'nth': return N[cl.a] + ' is ' + CIPH_ORDINAL[cl.n] + '.';
  }
  return '';
}

/* ---- Carillon: bar→note shuffle (never sorted) + a 6-strike melody ---- */
const CIPH_PENTA = [523.25, 587.33, 698.46, 783.99, 880.0];       // C5 D5 F5 G5 A5 (low→high)
const CIPH_BELLNAMES = ['Rain', 'Root', 'Crown', 'Ash', 'Star'];  // note index 0..4 → fiction name
const CIPH_BELLDESC = ['a low, round tone', 'a warm middle tone', 'a clear rising tone', 'a bright high tone', 'a high, silver tone'];
function carillonMap(seed) {                                       // bar index → note index
  let s = seed >>> 0;
  for (let attempt = 0; attempt < 32; attempt++) {
    const rng = mulberry32((s + attempt * 2654435761) >>> 0);
    const m = [0, 1, 2, 3, 4];
    for (let i = 4; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = m[i]; m[i] = m[j]; m[j] = t; }
    let identity = true; for (let i = 0; i < 5; i++) if (m[i] !== i) { identity = false; break; }
    if (!identity && m[2] !== 2) return m;                         // non-sorted, centre bar moved
  }
  return [2, 0, 3, 1, 4];
}
function carillonMelody(seed) {                                    // 6 note-indices, exactly one repeat
  const rng = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const rep = (rng() * 5) | 0, pool = [0, 1, 2, 3, 4, rep];
  for (let i = pool.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  return pool.slice();
}

/* ---- Glyph Ledger: keyword → glyph substitution, round-trip safe ---- */
const CIPH_GLYPHS = ['◈', '⊕', '✦', '❈', '◆', '⬟', '⊘', '✜', '❉', '⟡'];
const CIPH_KEYWORDS = [
  { word: 'RAVINE', kind: 'sinkhole' }, { word: 'MIRROR', kind: 'reservoir' },
  { word: 'TITANS', kind: 'colossus' }, { word: 'BRIDGE', kind: 'crossing' },
  { word: 'FALLEN', kind: 'fallen' }, { word: 'GARDEN', kind: 'greenhouse' }
];
function glyphSubst(word, seed) {
  const pool = CIPH_GLYPHS.slice(), rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  for (let i = pool.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  const map = {}; let gi = 0;
  for (const ch of word) if (!(ch in map)) map[ch] = pool[gi++];
  return map;
}
function glyphEncode(word, map) { let s = ''; for (const ch of word) s += map[ch]; return s; }

/* ======================================================================== */
/*  FINDERS (pure-hash ring scans; run ONLY at session-init via ciphLocate)  */
/*  Each degrades: primary → widened → safe default (plaza nearest SPIRE) so  */
/*  no cache can ever soft-lock. Origins are SPIRE/Tinker-relative (not the   */
/*  player) so positions don't depend on where the player stands at init.     */
/* ======================================================================== */
const CIPH_COLD = ' (The trail is cold — she marked the nearest square instead.)';
function ringFrom(cx, cz, minR, maxR, pred) {
  for (let r = (minR || 0); r <= maxR; r++) {
    let best = null, bd = 1e9;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const ix = cx + dx, iz = cz + dz;
      if (!pred(ix, iz)) continue;
      const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = { ix, iz }; }
    }
    if (best) return best;
  }
  return null;
}
function ctrOf(c) { return { ix: c.ix, iz: c.iz, x: c.ix * CHUNK + 32, z: c.iz * CHUNK + 32 }; }
function plazaNearSpire() { const p = ringFrom(SPIRE.cx, SPIRE.cz, 0, 24, (ix, iz) => chunkType(ix, iz) === 'plaza') || { ix: SPIRE.cx + 2, iz: SPIRE.cz }; return ctrOf(p); }

// The Tinker's bench: nearest works-style city from SPIRE → any city → plaza nearest SPIRE.
function findTinkerSpot() {
  const w = ringFrom(SPIRE.cx, SPIRE.cz, 1, 16, (ix, iz) => chunkType(ix, iz) === 'city' && districtStyle(ix, iz) === 'works');
  if (w) return ctrOf(w);
  const c = ringFrom(SPIRE.cx, SPIRE.cz, 1, 18, (ix, iz) => chunkType(ix, iz) === 'city');
  if (c) return ctrOf(c);
  return plazaNearSpire();
}
// Nearest viaduct LINE to a chunk (mirrors main.js nearestViaduct but from an arbitrary origin).
function viaductNear(cx, cz, maxR) {
  let best = null, bd = 1e9;
  for (let d = 0; d <= maxR; d++) {
    for (const ix of [cx - d, cx + d]) if (hash2(ix, 0, 6001) % 7 === 0) { const dd = Math.abs(ix - cx); if (dd < bd) { bd = dd; best = { axis: 0, lineIdx: ix, cross: ix * CHUNK }; } }
    for (const iz of [cz - d, cz + d]) if (hash2(0, iz, 6002) % 7 === 0) { const dd = Math.abs(iz - cz); if (dd < bd) { bd = dd; best = { axis: 1, lineIdx: iz, cross: iz * CHUNK }; } }
  }
  return best;
}
function viaductSpanExists(lineIdx, g) { return (hash2(lineIdx, g, 6003) % 100) < 75; }   // mirrors buildViaductAxis
// Count the standing spans over the chunk of `line` nearest (perpendicular) to (px,pz).
function viaductStandingSpans(v, px, pz) {
  const alongChunk = v.axis === 0 ? Math.floor(pz / CHUNK) : Math.floor(px / CHUNK);
  const spanBase = alongChunk * 4; let n = 0;
  for (let sp = 0; sp < 4; sp++) if (viaductSpanExists(v.lineIdx, spanBase + sp)) n++;
  return n;
}
// A viaduct×canal crossing nearest SPIRE (pure hash intersection; reused for keyword BRIDGE).
function crossingNear(cx, cz, maxR) {
  for (let r = 0; r <= maxR; r++) {
    let best = null, bd = 1e9;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const ix = cx + dx, iz = cz + dz;
      let hit = false;
      if (hash2(ix, 0, 6001) % 7 === 0 && isCanalZ(iz)) hit = true;
      else if (hash2(0, iz, 6002) % 7 === 0 && isCanalX(ix)) hit = true;
      if (!hit) continue;
      const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = { ix, iz }; }
    }
    if (best) return ctrOf(best);
  }
  return null;
}
// The anomaly named by a decoded keyword, nearest SPIRE. Everything is a pure-hash ring scan.
function anomalyFinder(kind) {
  if (kind === 'crossing') return crossingNear(SPIRE.cx, SPIRE.cz, 20) || crossingNear(SPIRE.cx, SPIRE.cz, 28);
  if (kind === 'greenhouse') {
    const g = ringFrom(SPIRE.cx, SPIRE.cz, 0, 20, (ix, iz) => { const t = chunkType(ix, iz); return (t === 'park' || t === 'plaza') && hash2(ix, iz, 3111) % 100 < 8; });
    return g ? ctrOf(g) : null;
  }
  const a = ringFrom(SPIRE.cx, SPIRE.cz, 0, 22, (ix, iz) => chunkType(ix, iz) === kind);
  return a ? ctrOf(a) : null;
}
// Largest real trunk in a grove chunk (peek once at init) — the carillon hangs at it.
function groveTrunk(cx, cz) {
  const g = ringFrom(cx, cz, 1, 16, (ix, iz) => chunkType(ix, iz) === 'grove') || ringFrom(cx, cz, 1, 20, (ix, iz) => chunkType(ix, iz) === 'park');
  if (!g) { const d = plazaNearSpire(); return { x: d.x, z: d.z, cold: true }; }
  const cd = peekColData(g.ix, g.iz); let best = null, br = -1;
  for (const t of cd.trunks) if (t.r > br && t.r >= 0.9) { br = t.r; best = t; }
  if (best) return { x: best.x, z: best.z };
  return { x: g.ix * CHUNK + 32, z: g.iz * CHUNK + 32 };
}
// Top of the fallen-tower ramp nearest the Tinker (peek once) — the Four Seasons climb.
function fallenTopNear(cx, cz) {
  const f = ringFrom(cx, cz, 1, 18, (ix, iz) => chunkType(ix, iz) === 'fallen');
  if (!f) { const d = plazaNearSpire(); return { x: d.x, y: 0, z: d.z, cold: true }; }
  const cd = peekColData(f.ix, f.iz); let best = null, by = -1e9;
  for (const p of cd.pads) if (p.layer === 'fallen' && p.y > by) { by = p.y; best = p; }
  if (best) return { x: best.x, y: best.y, z: best.z };
  return { x: f.ix * CHUNK + 32, y: 20, z: f.iz * CHUNK + 32 };
}
// A fern-circle chunk near a chunk (has a real fern in colData). Used for Cache 1 digit 3.
function fernCircleNear(cx, cz) {
  const g = ringFrom(cx, cz, 0, 16, (ix, iz) => {
    const t = chunkType(ix, iz);
    return (t === 'park' || t === 'grove') && hash2(ix, iz, 3221) % 100 < 20;
  });
  if (!g) return null;
  const cd = peekColData(g.ix, g.iz);
  const f = cd.ferns && cd.ferns[0];
  return { ix: g.ix, iz: g.iz, x: f ? f.x : g.ix * CHUNK + 32, z: f ? f.z : g.iz * CHUNK + 32 };
}

/* ======================================================================== */
/*  LOCATE — run every finder ONCE per session, compute every cache truth.   */
/*  After this, updatePuzzles only reads ciph.loc; it never peeks a chunk.    */
/* ======================================================================== */
function ciphLocate() {
  if (ciph.located || !ciph.met) return;
  ciph.located = true;
  const L = ciph.loc = {};
  const T = findTinkerSpot(); L.tinker = T;                        // { x, z, ix, iz }
  const tcx = T.ix !== undefined ? T.ix : Math.floor(T.x / CHUNK), tcz = T.iz !== undefined ? T.iz : Math.floor(T.z / CHUNK);

  // ---- Cache 1 — The Counting House ----
  const plazaC = ringFrom(tcx, tcz, 0, 16, (ix, iz) => chunkType(ix, iz) === 'plaza');
  const plaza = plazaC ? ctrOf(plazaC) : plazaNearSpire();
  const plazaCol = peekColData(plaza.ix !== undefined ? plaza.ix : Math.floor(plaza.x / CHUNK), plaza.iz !== undefined ? plaza.iz : Math.floor(plaza.z / CHUNK));
  const d1 = (plazaCol.lamps.length) % 10;
  const via = viaductNear(plaza.ix !== undefined ? plaza.ix : Math.floor(plaza.x / CHUNK), plaza.iz !== undefined ? plaza.iz : Math.floor(plaza.z / CHUNK), 10);
  const d2 = via ? (viaductStandingSpans(via, plaza.x, plaza.z) % 10) : 4;
  const fern = fernCircleNear(plaza.ix !== undefined ? plaza.ix : Math.floor(plaza.x / CHUNK), plaza.iz !== undefined ? plaza.iz : Math.floor(plaza.z / CHUNK));
  // Fern frond count: worldgen draws it from the chunk rng at a stream position puzzles.js
  // cannot reach, and worldgen is frozen — so the recorded fern figure comes from a dedicated
  // location-keyed hash (deterministic, session-stable). Framed in-fiction as the Authority's
  // recorded count; hint #2 states the digit outright so the cache is always solvable.
  const d3 = fern ? ((8 + hash2(fern.ix, fern.iz, 3221) % 5) % 10) : 3;
  L.c1 = {
    x: plaza.x, z: plaza.z, digits: [d1, d2, d3],
    viaBearing: via ? bearingPhrase(plaza.x, plaza.z, via.axis === 0 ? via.cross : plaza.x, via.axis === 0 ? plaza.z : via.cross) : 'south',
    fernBearing: fern ? bearingPhrase(plaza.x, plaza.z, fern.x, fern.z) : 'north',
    cold: !plazaC
  };

  // ---- Cache 2 — The Carillon ----
  const gt = groveTrunk(tcx, tcz);
  const cSeed = hash2(SPIRE.cx, SPIRE.cz, 4502);
  L.c2 = { x: gt.x, z: gt.z, map: carillonMap(cSeed), melody: carillonMelody(cSeed), cold: !!gt.cold };

  // ---- Cache 3 — The Shadow Clock (no fixed position; the sun places it) ----
  L.c3 = { dug: CIPH_SAVE.solved.c3, x: 0, z: 0 };

  // ---- Cache 4 — The Glyph Ledger ----
  const kwPick = CIPH_KEYWORDS[hash2(SPIRE.cx, SPIRE.cz, 4501) % 6];
  const gmap = glyphSubst(kwPick.word, hash2(SPIRE.cx, SPIRE.cz, 4501));
  const coded = glyphEncode(kwPick.word, gmap);
  const anom = anomalyFinder(kwPick.kind) || plazaNearSpire();
  // six boundary-stones chained from the Tinker: each 2–4 chunks from the last, biased to
  // oddity-bearing chunks (chime/fern) across varied district styles.
  const stones = []; let scx = tcx, scz = tcz;
  for (let i = 0; i < 6; i++) {
    const salt = 4530 + i;
    let s = ringFrom(scx, scz, 2, 4, (ix, iz) => (hash2(ix, iz, 3444) % 100 < 10 || (chunkType(ix, iz) === 'park' && hash2(ix, iz, 3221) % 100 < 20)) && hash2(ix, iz, salt) % 2 === 0);
    if (!s) s = ringFrom(scx, scz, 2, 6, (ix, iz) => { const t = chunkType(ix, iz); return t !== 'spire' && hash2(ix, iz, salt) % 3 === 0; });
    if (!s) s = { ix: scx + 3, iz: scz };                         // deterministic fallback (no dead-end)
    stones.push({ ix: s.ix, iz: s.iz, x: s.ix * CHUNK + 32, z: s.iz * CHUNK + 32, letter: kwPick.word[i], glyph: gmap[kwPick.word[i]], style: districtStyle(s.ix, s.iz) });
    scx = s.ix; scz = s.iz;
  }
  for (let i = 0; i < 6; i++) stones[i].nextBearing = i < 5 ? bearingPhrase(stones[i].x, stones[i].z, stones[i + 1].x, stones[i + 1].z) : null;
  L.c4 = { keyword: kwPick.word, kind: kwPick.kind, coded, map: gmap, x: anom.x, z: anom.z, stones,
    stone1Bearing: bearingPhrase(T.x, T.z, stones[0].x, stones[0].z), stone1Blocks: Math.max(1, Math.round(dist2(T.x, T.z, stones[0].x, stones[0].z) / CHUNK)) };

  // ---- Cache 5 — The Four Seasons ----
  const ft = fallenTopNear(tcx, tcz);
  L.c5 = Object.assign({ x: ft.x, y: ft.y, z: ft.z, cold: !!ft.cold }, generateSeasons(hash2(SPIRE.cx, SPIRE.cz, 4505)));

  // ---- The Vault (Spire north base) ----
  const bz = SPIRE.z - SPIRE.size / 2 - 1.4;
  L.vault = { sockets: [], door: { x: SPIRE.x, y: 2.2, z: bz - 0.8 }, x: SPIRE.x, z: bz };
  for (let i = 0; i < 5; i++) L.vault.sockets.push({ x: SPIRE.x - 4 + i * 2, y: 1.5, z: bz });

  // Dev/verify: log the computed truths under ?cipher= only.
  if (params.get('cipher')) {
    console.log('CIPHER1 ' + L.c1.digits.join('·'));
    console.log('CIPHER2 map=' + L.c2.map.map(n => CIPH_BELLNAMES[n]).join('') + ' melody=' + L.c2.melody.map(n => CIPH_BELLNAMES[n]).join('·'));
    console.log('CIPHER4 keyword=' + L.c4.keyword + ' kind=' + L.c4.kind + ' coded=' + L.c4.coded);
    console.log('CIPHER5 order=' + L.c5.secret.map(s => CIPH_SEASON_GLYPH[s]).join(''));
  }
}

/* ======================================================================== */
/*  ITEMS — waybills, cogs, bell-card, rubbings, mantle (registered once)     */
/* ======================================================================== */
(function ciphRegisterItems() {
  invRegister('waybill1', { name: 'Waybill — the Counting House', icon: '✒', stack: false, desc: 'A folded slip in the Tinker’s hand.' });
  invRegister('waybill2', { name: 'Waybill — the Carillon', icon: '♪', stack: false, desc: 'A folded slip in the Tinker’s hand.' });
  invRegister('waybill3', { name: 'Waybill — the Shadow Clock', icon: '☼', stack: false, desc: 'A folded slip in the Tinker’s hand.' });
  invRegister('waybill4', { name: 'Waybill — the Glyph Ledger', icon: '◈', stack: false, desc: 'A folded slip in the Tinker’s hand.' });
  invRegister('waybill5', { name: 'Waybill — the Four Seasons', icon: '❦', stack: false, desc: 'A folded slip in the Tinker’s hand.' });
  invRegister('bellcard', { name: 'Bell-card', icon: '♫', stack: false, desc: 'A card of the carillon’s five bells, named low to high.' });
  for (let i = 1; i <= 6; i++) invRegister('rubbing' + i, { name: 'Rubbing ' + i, icon: '✎', stack: false, desc: 'A charcoal rubbing of an Authority boundary-glyph.' });
  for (let i = 1; i <= 5; i++) invRegister('cog' + i, { name: 'Brass cog ' + i, icon: '⚙', stack: false, desc: 'An engraved Authority cog. It wants a socket.' });
  invRegister('mantle', { name: 'Gardener’s Mantle', icon: '§', stack: false, desc: 'Woven from parasol-leaf. The sun forgets you a little. (Worn — the campaign keeps this one.)' });
})();

const CIPH_CACHE_NAME = { c1: 'the Counting House', c2: 'the Carillon', c3: 'the Shadow Clock', c4: 'the Glyph Ledger', c5: 'the Four Seasons' };
function ciphWaybillNote(k) {
  const L = ciph.loc, T = L.tinker;
  if (k === 'c1') { const b = bearingPhrase(T.x, T.z, L.c1.x, L.c1.z), n = Math.max(1, Math.round(dist2(T.x, T.z, L.c1.x, L.c1.z) / CHUNK)); return 'The Counting House. From my bench, ' + b + ', about ' + n + ' blocks, to the open square. Its brass dial keeps three figures: first, the lamps that ring the square; second, the standing spans of the nearest viaduct, ' + L.c1.viaBearing + '; third, the great ferns in the ring, ' + L.c1.fernBearing + '. The Authority kept only final figures — go and count.' + (L.c1.cold ? CIPH_COLD : ''); }
  if (k === 'c2') { const b = bearingPhrase(T.x, T.z, L.c2.x, L.c2.z), n = Math.max(1, Math.round(dist2(T.x, T.z, L.c2.x, L.c2.z) / CHUNK)); return 'The Carillon. ' + b + ' of my bench, about ' + n + ' blocks, in the grove — five brass bars hung at the great trunk. They are not strung low to high; some idle hand crossed two. Strike them, listen, and play the song on the plaque. Take the bell-card first.' + (L.c2.cold ? CIPH_COLD : ''); }
  if (k === 'c3') return 'The Shadow Clock. The Spire keeps the Authority’s last appointment. Stand at the very tip of its shadow at seventeen hundred, and dig. (Push the hours with T if the day is young.)';
  if (k === 'c4') { return 'The Glyph Ledger. ' + L.c4.stone1Bearing + ' of my bench, about ' + L.c4.stone1Blocks + ' blocks, stands the first boundary-stone. Each stone gives a rubbing and points to the next — six in all. The Authority’s mark for the hidden place is ' + L.c4.coded + '. Read the stones, spell it out, and go where the word names.'; }
  if (k === 'c5') { const b = bearingPhrase(T.x, T.z, L.c5.x, L.c5.z), n = Math.max(1, Math.round(dist2(T.x, T.z, L.c5.x, L.c5.z) / CHUNK)); return 'The Four Seasons. ' + b + ', about ' + n + ' blocks, a tower lies fallen; climb to its top. Four root-knot levers wait — Sowing, Bloom, Harvest, Frost. Pull them in the one right turning the plaque describes.' + (L.c5.cold ? CIPH_COLD : ''); }
  return '';
}

/* ======================================================================== */
/*  THE TINKER (giver NPC — mirrors story.js syncArchivist)                  */
/* ======================================================================== */
let ciphTinkerObj = null;
function ciphSyncTinker(dt) {
  if (!ciph.loc) return;
  const T = ciph.loc.tinker;
  const cx = Math.floor(player.pos.x / CHUNK), cz = Math.floor(player.pos.z / CHUNK);
  const tcx = Math.floor(T.x / CHUNK), tcz = Math.floor(T.z / CHUNK);
  const near = Math.abs(cx - tcx) <= 1 && Math.abs(cz - tcz) <= 1;
  if (near && !ciphTinkerObj) {
    const { g, anim } = makeNPCGroup(false, 'tinker');
    g.position.set(T.x, 0, T.z);
    g.rotation.y = Math.atan2(player.pos.x - T.x, player.pos.z - T.z);
    scene.add(g); ciphTinkerObj = { g, anim }; ciphTinker = ciphTinkerObj;
  } else if (!near && ciphTinkerObj) { scene.remove(ciphTinkerObj.g); ciphTinkerObj = null; ciphTinker = null; }
  if (ciphTinkerObj) {
    const d = dist2(ciphTinkerObj.g.position.x, ciphTinkerObj.g.position.z, player.pos.x, player.pos.z);
    if (d < 18) {
      const y = Math.atan2(player.pos.x - ciphTinkerObj.g.position.x, player.pos.z - ciphTinkerObj.g.position.z);
      let dy = y - ciphTinkerObj.g.rotation.y; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      ciphTinkerObj.g.rotation.y += dy * Math.min(1, 6 * (dt || 0.016));
    }
    if (ciphTinkerObj.anim) ciphTinkerObj.anim.material.emissiveIntensity = matLamp.emissiveIntensity + 0.4;
  }
}
function atTinker(r) { return ciphTinkerObj && dist2(ciphTinkerObj.g.position.x, ciphTinkerObj.g.position.z, player.pos.x, player.pos.z) < (r || 3.4); }

// First E on the Tinker: intro + hand over every waybill. Later E: re-offer any missing one.
function ciphTinkerTalk() {
  ciphLocate();
  if (!ciph.met) {
    ciph.met = true; CIPH_SAVE.met = true; ciphSave();
    msg('The Tinker looks up from a bench of brass gears: “So you climbed it. Good. The Authority left five sealed caches under this canopy, and I have spent forty years failing to open them. Perhaps a younger hand…”', 12, true);
    setTimeout(() => msg('“Here — five waybills, one for each lock. No maps; the Authority hid nothing and trusted no one to look. Count, listen, watch the light, read the stones, keep the seasons. Bring me five cogs, and the great door at the Spire will remember us.”', 13, true), 5500);
  }
  let gave = false;
  for (const k of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    const id = 'waybill' + k[1];
    if (!invHas(id)) { invAdd(id, 1, ciphWaybillNote(k)); gave = true; }
  }
  if (!gave) {
    const left = ['c1', 'c2', 'c3', 'c4', 'c5'].filter(k => !CIPH_SAVE.solved[k]);
    if (!left.length) msg('The Tinker turns a finished cog in the light: “Five cogs. All five. Now the door — the north face of the Spire’s foot. Seat them in the turning of the seasons.”', 10, true);
    else msg('The Tinker taps the bench: “Still open: ' + left.map(k => CIPH_CACHE_NAME[k]).join(', ') + '. Read your waybills again — the answers are all out there, in the world, not on paper.”', 10, true);
  }
}

/* ======================================================================== */
/*  PROPS — one shared pool (10 low-poly boxes, material swapped per use)     */
/*  Only the single nearest active feature is drawn each frame; caches sit    */
/*  chunks apart, so 10 meshes always suffice. Never added in buildChunk.     */
/* ======================================================================== */
const ciphMatBox = new THREE.MeshLambertMaterial({ color: 0x26271f });    // dark iron strongbox
const ciphMatBrass = new THREE.MeshLambertMaterial({ color: 0x9a7b3a });  // lid strip / dial / bars / sockets
const ciphMatStone = new THREE.MeshLambertMaterial({ color: 0x6b675e });  // plaque / glyph stone
const ciphMatGreen = new THREE.MeshLambertMaterial({ color: 0x4e6337 });  // season levers
const ciphMatDoor = new THREE.MeshLambertMaterial({ color: 0x3a3128 });   // vault door
const ciphMatGold = new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false });   // mantle / seated glint
const CIPH_POOL = Array.from({ length: 10 }, () => { const m = new THREE.Mesh(tplBox, ciphMatBox); m.visible = false; scene.add(m); return m; });
let _poolN = 0;
function poolBegin() { _poolN = 0; }
function poolBox(x, y, z, sx, sy, sz, mat, ry) {
  const m = CIPH_POOL[_poolN++]; if (!m) return;
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.material = mat || ciphMatBox; m.rotation.set(0, ry || 0, 0); m.visible = true;
}
function poolEnd() { for (let i = _poolN; i < CIPH_POOL.length; i++) CIPH_POOL[i].visible = false; }
// A strongbox + brass lid + stone plaque at (x,z); `open` rotates the lid ajar (solved husk).
function drawStrongbox(x, z, open, time) {
  poolBox(x, 0, z, 1.5, 0.9, 1.0, ciphMatBox);                              // body
  const lidRot = open ? -0.9 : (0.02 * Math.sin((time || 0) * 1.4));
  poolBox(x, 0.9, z - (open ? 0.4 : 0), 1.55, 0.14, 1.05, ciphMatBrass, lidRot);   // lid strip
  poolBox(x, 0, z + 0.95, 0.9, 0.7, 0.12, ciphMatStone);                    // plaque stub in front
}

/* ======================================================================== */
/*  AIM + AUDIO helpers                                                       */
/* ======================================================================== */
const _fwd = new THREE.Vector3(), _to = new THREE.Vector3();
function aimForward() { camera.updateMatrixWorld(); camera.getWorldDirection(_fwd); return _fwd; }
// Among candidate {x,y,z}, pick the one best under the crosshair within `reach` (cone dot>0.6).
function aimPick(cands, reach) {
  const f = aimForward(); let best = -1, bd = 0.6;
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    _to.set(c.x - camera.position.x, c.y - camera.position.y, c.z - camera.position.z);
    if (_to.length() > reach) continue;
    _to.normalize(); const dot = _to.dot(f);
    if (dot > bd) { bd = dot; best = i; }
  }
  return best;
}
// One pure carillon note (triangle osc), the sfxChime idiom. AC-gated (never in SHOT).
function sfxNote(freq, dur, vol) {
  if (typeof AC === 'undefined' || !AC || muted) return;
  const t0 = AC.currentTime + 0.01, o = AC.createOscillator(), g = AC.createGain();
  o.type = 'triangle'; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol || 0.08, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 1.0));
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + (dur || 1.0) + 0.05);
}
function ciphAudible() { return typeof AC !== 'undefined' && AC && !muted; }

/* ======================================================================== */
/*  HINTS LADDER — attempts add hints; never the raw answer                  */
/* ======================================================================== */
function attemptsOf(k) { return CIPH_SAVE.attempts[k] | 0; }
function bumpAttempt(k) { CIPH_SAVE.attempts[k] = (CIPH_SAVE.attempts[k] | 0) + 1; ciphSave(); }
function ladder(k, base) {
  let s = base; const a = attemptsOf(k), L = ciph.loc;
  if (a >= 3) {
    if (k === 'c1') s += '\n\nHint: lamps — only those on this square’s own ground; the Authority did not count its neighbours’.';
    else if (k === 'c2') s += '\n\nHint: two bars trade places near the middle of the row — the song is not left to right.';
    else if (k === 'c3') s += '\n\nHint: the day is yours to hurry — hold T.';
    else if (k === 'c4') s += '\n\nHint: the Authority wrote places, not names.';
    else if (k === 'c5') s += '\n\nHint (plainer): ' + seasonClueText(L.c5.clues[0]);
  }
  if (a >= 7) {
    if (k === 'c1') s += '\nHint: the first figure is ' + L.c1.digits[0] + '.';
    else if (k === 'c2') s += '\nHint: the leftmost bar is ' + CIPH_BELLNAMES[L.c2.map[0]] + '.';
    else if (k === 'c3') s += '\nAt seventeen hundred the shadow points east-northeast, long as the tower is tall — pace it out from the Spire’s foot.';
    else if (k === 'c4') s += '\nHint: six letters. It holds water — or held people. Read your rubbings side by side.';
    else if (k === 'c5') s += '\nHint: the first season is ' + CIPH_SEASON_NAMES[L.c5.secret[0]] + '.';
  }
  return s;
}

/* ======================================================================== */
/*  SOLVE + REWARD                                                            */
/* ======================================================================== */
function solveCache(k) {
  if (CIPH_SAVE.solved[k]) return;
  CIPH_SAVE.solved[k] = true; ciphSave();
  invAdd('cog' + k[1], 1, ciphCogNote(k));
  if (ciphAudible()) sfxTrialDone();
  const lore = {
    c1: 'The dial gives with a heavy clunk. Inside: a brass cog, and a clerk’s note — “counted true.” One of five.',
    c2: 'The last note hangs, and the lid lifts. A brass cog rests on green felt. The grove keeps ringing behind you.',
    c3: 'Your fingers find the box the shadow promised. A cog, cold from the ground, warm from the sun that marked it.',
    c4: 'The place the glyphs spelled gives up its cache without a fight — the reading was the lock. A fourth cog.',
    c5: 'The seasons turn true and the knots release. A cog, and the smell of old sap. Four turned; is it five now?'
  };
  msg(lore[k], 9, true);
  const have = ['c1', 'c2', 'c3', 'c4', 'c5'].filter(x => CIPH_SAVE.solved[x]).length;
  hint('Cogs recovered — ' + have + ' / 5', 3);
  if (have >= 5) setTimeout(() => msg('Five cogs. The Tinker’s great door waits at the north face of the Spire’s foot.', 9, true), 3500);
}
function ciphCogNote(k) {
  // Oblique self-placement riddle — the socket order is the lore turning counting→song→shadow→
  // glyph→season (sockets 1..5, left→right). Journal entries 9–12 gloss two of these.
  const r = {
    c1: '“I turn first, before any rain falls. Seat me at the left hand — socket one.”',
    c2: '“I follow the counting; the bells answer to me. Second.”',
    c3: '“The long finger of noon points me out. Third — the middle socket.”',
    c4: '“Read the stones to know my name. Fourth.”',
    c5: '“Last, I close the ring — frost round to sowing. The right hand — socket five.”'
  };
  return r[k];
}
function grantMantle() {
  if (CIPH_SAVE.mantle) return;
  CIPH_SAVE.mantle = true; ciphMantle = true; ciphSave();
  invAdd('mantle', 1);
  msg('The Gardener’s Mantle settles over your shoulders — woven from parasol-leaf, light as breath. The sun forgets you a little. And the world sharpens: you can read its oddities on the map now, the way the Authority once did.', 12, true);
}

/* ======================================================================== */
/*  PER-FRAME DRIVER                                                          */
/* ======================================================================== */
function nearestFeature() {
  const L = ciph.loc; if (!L) return null;
  const px = player.pos.x, pz = player.pos.z;
  const cands = [
    { k: 'vault', x: L.vault.x, z: L.vault.z },
    { k: 'c1', x: L.c1.x, z: L.c1.z }, { k: 'c2', x: L.c2.x, z: L.c2.z },
    { k: 'c4', x: L.c4.x, z: L.c4.z }, { k: 'c5', x: L.c5.x, z: L.c5.z }
  ];
  // (Cache 3's buried/husk box is owned entirely by runShadowClock — not a nearest-feature.)
  // glyph stones (nearest uncollected / any within range)
  for (let i = 0; i < L.c4.stones.length; i++) { const s = L.c4.stones[i]; cands.push({ k: 'stone', idx: i, x: s.x, z: s.z }); }
  let best = null, bd = CHUNK * 1.4;
  for (const c of cands) { const d = dist2(c.x, c.z, px, pz); if (d < bd) { bd = d; best = Object.assign({ d }, c); } }
  return best;
}

function updatePuzzles(dt, time) {
  if (typeof player === 'undefined') return;
  if (!summited) return;                                          // gated: climb the Spire first
  ciphSyncTinker(dt);
  if (!ciph.met) { if (atTinker(3.4)) hint('Press E — the Tinker has work for you', 0.4); poolBegin(); poolEnd(); return; }
  ciphLocate();

  // E edge/hold tracking (holds read keys.KeyE directly, the Ch7-plant idiom)
  const eDown = !!keys.KeyE, ePressed = eDown && !ciph._ePrev, eReleased = !eDown && ciph._ePrev;
  const feat = nearestFeature();

  poolBegin();
  runShadowClock(dt, time, eDown);                                // always live during the 17:00 window
  if (feat) runFeature(feat, dt, time, ePressed, eReleased, eDown);
  poolEnd();

  ciph._ePrev = eDown;
}

// Cache 3 runs off the real sun regardless of the nearest-feature pick (it is buried, no prop
// until dug). During 17:00±15min it computes the live shadow tip and offers a 3-second dig.
function runShadowClock(dt, time, eDown) {
  if (CIPH_SAVE.solved.c3) {                                      // solved husk: a surfaced, open box
    const L = ciph.loc.c3;                                        // dig spot is not persisted across
    if ((L.x || L.z) && dist2(L.x, L.z, player.pos.x, player.pos.z) < CHUNK) drawStrongbox(L.x, L.z, true, time);   // sessions → only shown if dug this run
    return;
  }
  if (!invHas('waybill3')) return;
  const inWindow = dayT >= 0.6979 && dayT <= 0.7188 && sunDir.y > 0.05;
  if (!inWindow) { ciph.c3.digT = 0; return; }
  const tx = SPIRE.x - sunDir.x / sunDir.y * SPIRE.h;
  const tz = SPIRE.z - sunDir.z / sunDir.y * SPIRE.h;
  const d = dist2(tx, tz, player.pos.x, player.pos.z);
  if (d > 6 || player.pos.y > 4) { ciph.c3.digT = 0; if (d < 40) hint('The Spire’s shadow-tip is near — stand on it and hold E to dig', 0.5); return; }
  if (eDown) {
    ciph.c3.digT += dt;
    hint('Digging where the shadow ends…  ' + Math.min(3, ciph.c3.digT).toFixed(1) + ' s', 0.3);
    if (ciph.c3.digT >= 3) { ciph.loc.c3.x = player.pos.x; ciph.loc.c3.z = player.pos.z; ciph.loc.c3.dug = true; solveCache('c3'); }
  } else { if (ciph.c3.digT > 0) ciph.c3.digT = 0; hint('Hold E to dig at the shadow’s tip', 0.5); }
}

function runFeature(feat, dt, time, ePressed, eReleased, eDown) {
  const L = ciph.loc;
  if (feat.k === 'vault') return runVault(feat, dt, time, ePressed);
  if (feat.k === 'stone') return runStone(feat, ePressed, time);
  const k = feat.k, solved = CIPH_SAVE.solved[k];

  if (k === 'c1') {
    const c = L.c1; drawStrongbox(c.x, c.z, solved, time);
    // dial: a brass block on the box top
    poolBox(c.x, 0.95, c.z, 0.5, 0.4, 0.3, ciphMatBrass);
    if (solved) return;
    const dialPos = { x: c.x, y: 1.3, z: c.z }, plaquePos = { x: c.x, y: 0.5, z: c.z + 0.95 };
    if (ePressed) {
      const pick = aimPick([dialPos, plaquePos], 4.5);
      if (pick === 1) { readPlaque('c1'); ciph._pressTgt = null; }
      else { ciph._pressTgt = 'dial'; ciph._eDownT = time; ciph.c1.holdT = 0; }
    }
    if (ciph._pressTgt === 'dial' && eDown) ciph.c1.holdT += dt;
    if (eReleased && ciph._pressTgt === 'dial') {
      const held = time - ciph._eDownT;
      if (held >= 0.6) c1Lock(); else c1Tick();
      ciph._pressTgt = null;
    }
    const st = ciph.c1;
    hint('◈ ' + [0, 1, 2].map(i => st.locked[i] ? st.dig[i] : (i === st.sel ? '[' + st.dig[i] + ']' : '_')).join(' · ') + '   (tap E +1 · hold E to set)', 0.5);

  } else if (k === 'c2') {
    const c = L.c2; drawStrongbox(c.x, c.z, solved, time);
    poolBox(c.x, 1.9, c.z, 3.4, 0.12, 0.12, ciphMatBrass);        // carillon crossbar
    const bars = [];
    for (let i = 0; i < 5; i++) { const bx = c.x - 1.4 + i * 0.7; bars.push({ x: bx, y: 1.35, z: c.z }); poolBox(bx, 1.0, c.z, 0.14, 0.85, 0.14, ciphMatBrass); }
    if (solved) return;
    if (!invHas('bellcard')) { const cp = { x: c.x + 1.9, y: 1.4, z: c.z }; if (dist2(cp.x, cp.z, player.pos.x, player.pos.z) < 3 && ePressed) { invAdd('bellcard', 1, 'The five bells, low to high: ' + CIPH_BELLNAMES.map((n, i) => n + ' (' + CIPH_BELLDESC[i] + ')').join(' · ') + '.'); return; } if (dist2(cp.x, cp.z, player.pos.x, player.pos.z) < 3) hint('Press E — take the bell-card from its hook', 0.4); }
    if (ePressed) {
      const pl = { x: c.x, y: 0.5, z: c.z + 0.95 };
      const pick = aimPick(bars.concat([pl]), 5);
      if (pick === 5) readPlaque('c2');
      else if (pick >= 0) c2Strike(pick);
    }

  } else if (k === 'c4') {
    const c = L.c4; drawStrongbox(c.x, c.z, solved, time);
    if (solved) return;
    if (ePressed && feat.d < 3.5) {                              // decode was the lock — opening is free
      if (allRubbings()) solveCache('c4');
      else { readPlaque('c4'); }
    } else if (feat.d < 3.5) hint('Press E — the cache the glyphs named', 0.4);

  } else if (k === 'c5') {
    const c = L.c5; drawStrongbox(c.x, c.z, solved, time);
    const levers = [];
    for (let i = 0; i < 4; i++) { const lx = c.x - 1.2 + i * 0.8; const pulled = leverPulled(i); levers.push({ x: lx, y: c.y + 1.0, z: c.z, season: i }); poolBox(lx, c.y, c.z, 0.16, pulled ? 0.5 : 1.0, 0.16, ciphMatGreen, pulled ? 0.5 : 0); }
    if (solved) return;
    if (ePressed) {
      const pl = { x: c.x, y: c.y + 0.5, z: c.z + 0.95 };
      const pick = aimPick(levers.concat([pl]), 5);
      if (pick === 4) readPlaque('c5');
      else if (pick >= 0) c5Pull(pick);
    }
  }
}

/* ---- Cache 1 dial ---- */
function c1Tick() { const st = ciph.c1; if (st.locked[st.sel]) return; st.dig[st.sel] = (st.dig[st.sel] + 1) % 10; if (ciphAudible()) sfxNote(660, 0.12, 0.05); }
function c1Lock() {
  const st = ciph.c1, L = ciph.loc.c1;
  if (st.locked[st.sel]) return;
  st.locked[st.sel] = true;
  if (ciphAudible()) sfxNote(880, 0.18, 0.06);
  if (st.sel < 2) { st.sel++; return; }
  // third lock → evaluate
  if (st.dig[0] === L.digits[0] && st.dig[1] === L.digits[1] && st.dig[2] === L.digits[2]) solveCache('c1');
  else { bumpAttempt('c1'); msg('A heavy clunk, and the dial spins itself back to nought. Wrong figures.', 6); st.locked = [false, false, false]; st.dig = [0, 0, 0]; st.sel = 0; }
}

/* ---- Cache 2 carillon ---- */
function c2Strike(bar) {
  const L = ciph.loc.c2, note = L.map[bar];
  if (ciphAudible()) sfxNote(CIPH_PENTA[note], 1.0, 0.09);
  else hint('The bar sounds ' + CIPH_BELLDESC[note] + ' — ' + CIPH_BELLNAMES[note], 2.5);
  const want = L.melody[ciph.c2.step];
  if (note === want) {
    ciph.c2.step++;
    if (ciph.c2.step >= L.melody.length) { ciph.c2.step = 0; solveCache('c2'); }
  } else {
    if (ciph.c2.step > 0) { bumpAttempt('c2'); if (ciphAudible()) sfxNote(150, 0.3, 0.05); msg('A sour, buzzing note — the song breaks and the bars still. Begin again.', 5); }
    ciph.c2.step = (note === L.melody[0]) ? 1 : 0;                // a first-note strike still counts
  }
}

/* ---- Cache 4 rubbings + decode ---- */
function allRubbings() { for (let i = 1; i <= 6; i++) if (!invHas('rubbing' + i)) return false; return true; }
function runStone(feat, ePressed, time) {
  const s = ciph.loc.c4.stones[feat.idx];
  poolBox(s.x, 0, s.z, 0.5, 1.1 + 0.1 * Math.sin(time * 0.6 + feat.idx), 0.4, ciphMatStone, feat.idx * 0.7);   // carved stone
  const rid = 'rubbing' + (feat.idx + 1);
  if (invHas(rid)) { if (feat.d < 3) hint('An Authority boundary-stone — already rubbed', 0.4); return; }
  if (feat.d < 3) hint('Press E — take a rubbing of the boundary-glyph', 0.4);
  if (ePressed && feat.d < 3.2) {
    const nextLine = s.nextBearing ? ' The next stone lies ' + s.nextBearing + '.' : ' This is the last stone.';
    invAdd(rid, 1, 'Glyph ' + s.glyph + ' = ' + s.letter + '.' + nextLine + ' (Rubbed at a ' + s.style + ' boundary.)');
    if (feat.idx === 0) once('ciph-c4-first', () => msg('The first stone. Its glyph, and a bearing to the next — the trail lives in the satchel now, not on the wall.', 8));
    if (allRubbings()) msg('Six rubbings. Lay them side by side and the Authority’s word stands up off them — then go where it names.', 8, true);
  }
}

/* ---- Cache 5 seasons ---- */
function leverPulled(i) { const L = ciph.loc.c5; for (let s = 0; s < ciph.c5.step; s++) if (L.secret[s] === i) return true; return false; }
function c5Pull(season) {
  const L = ciph.loc.c5;
  if (leverPulled(season)) return;
  if (L.secret[ciph.c5.step] === season) {
    ciph.c5.step++;
    if (ciphAudible()) sfxNote(CIPH_PENTA[ciph.c5.step % 5], 0.4, 0.05);
    if (ciph.c5.step >= 4) { ciph.c5.step = 0; solveCache('c5'); }
    else msg('A root-knot gives, deep in the tower. ' + CIPH_SEASON_NAMES[season] + '.', 4);
  } else {
    bumpAttempt('c5'); ciph.c5.step = 0;
    msg('The knots stiffen and snap back. Out of season. Begin again.', 5);
  }
}

/* ---- The Vault ---- */
function runVault(feat, dt, time, ePressed) {
  const L = ciph.loc.vault, V = ciph.vault;
  const opening = V.opening > 0;
  // door (sinks while opening / gone once mantle taken)
  const doorY = opening ? Math.max(0.2, 2.2 - V.opening) : 2.2;
  if (!CIPH_SAVE.mantle && !V.mantleOut) poolBox(L.door.x, doorY - 2.2, L.door.z, 4.4, 4.4, 0.5, ciphMatDoor);
  // five sockets. Gold glints on filled sockets only BEFORE the door opens, so the pool budget
  // stays ≤10 (door + 5 sockets + ≤4 glints while seating; door + 5 sockets + stand + mantle
  // while opening — never both glints and the mantle stand at once).
  for (let i = 0; i < 5; i++) { const s = L.sockets[i]; const filled = V.seated[i] >= 0; poolBox(s.x, s.y - 0.25, s.z, 0.4, 0.5, 0.4, filled ? ciphMatBrass : ciphMatStone); if (filled && !opening) poolBox(s.x, s.y + 0.05, s.z, 0.16, 0.16, 0.16, ciphMatGold); }

  if (CIPH_SAVE.mantle) return;

  if (opening) {                                                 // door sinking → reveal mantle stand
    V.opening += dt;
    poolBox(L.x, 0, L.z - 1.2, 0.6, 1.0, 0.6, ciphMatStone);      // stand
    poolBox(L.x, 1.0, L.z - 1.2, 0.9, 0.3, 0.7, ciphMatGold);     // the mantle
    if (V.opening > 4) V.mantleOut = true;
    if (V.mantleOut) { if (dist2(L.x, L.z - 1.2, player.pos.x, player.pos.z) < 3) { hint('Press E — take the Gardener’s Mantle', 0.4); if (ePressed) grantMantle(); } }
    return;
  }

  const haveAll = [1, 2, 3, 4, 5].every(i => invHas('cog' + i));
  if (!haveAll) { if (feat.d < 4) hint('Five brass sockets in the root-grown door — five cogs will wake it', 0.5); return; }

  const seatedN = V.seated.filter(s => s >= 0).length;
  if (feat.d < 5 && seatedN < 5) {
    hint('Seating the ' + ['Counting', 'Song', 'Shadow', 'Glyph', 'Season'][seatedN] + ' cog — aim at a socket, E to seat (read its engraving)', 0.6);
    if (ePressed) {
      const pick = aimPick(L.sockets.map(s => ({ x: s.x, y: s.y, z: s.z })), 6);
      if (pick >= 0 && V.seated[pick] < 0) {
        V.seated[pick] = seatedN;                                 // dispense cogs in cache order 0..4
        if (ciphAudible()) sfxNote(440 + seatedN * 60, 0.25, 0.06);
        if (V.seated.filter(s => s >= 0).length >= 5) evalVault();
      }
    }
  }
}
function evalVault() {
  const V = ciph.vault;
  let ok = true; for (let s = 0; s < 5; s++) if (V.seated[s] !== s) ok = false;   // socket s must hold cache-cog s (lore order)
  if (ok) {
    V.opening = 0.001;
    msg('Five cogs, five sockets, the turning of the seasons. Somewhere deep the old mechanism catches — and the great door begins to sink into the root mass.', 11, true);
  } else {
    bumpAttempt('vault'); V.seated = [-1, -1, -1, -1, -1];
    msg('The cogs shriek against each other and spit back out with a clang. Wrong turning. (Read the engravings — counting, song, shadow, glyph, season.)', 8);
  }
}

/* ---- plaque reading (rules + laddered hints) ---- */
function readPlaque(k) {
  const L = ciph.loc;
  let s;
  if (k === 'c1') s = 'THE COUNTING HOUSE — three figures, left to right. First: the lamps that ring this square. Second: the standing spans of the nearest viaduct, ' + L.c1.viaBearing + '. Third: the great ferns in the ring, ' + L.c1.fernBearing + '. (Recorded figures — count the world and set the dial.)';
  else if (k === 'c2') s = 'THE CARILLON — strike the bells in this order: ' + L.c2.melody.map(n => CIPH_BELLNAMES[n]).join(' · ') + '. (The bars are not strung low to high — listen, or read the bell-card.)';
  else if (k === 'c4') s = 'THE GLYPH LEDGER — the Authority wrote places, not names. Its mark: ' + L.c4.coded + '. Rubbings held: ' + [1, 2, 3, 4, 5, 6].filter(i => invHas('rubbing' + i)).length + ' / 6.';
  else if (k === 'c5') s = 'THE FOUR SEASONS — pull the levers in the one right order. ' + L.c5.clues.map(seasonClueText).join(' ') + ' (Levers: ' + CIPH_SEASON_NAMES.map((n, i) => CIPH_SEASON_GLYPH[i] + ' ' + n).join(' · ') + '.)';
  else s = '';
  msg(ladder(k, s), 11, true);
}

/* ======================================================================== */
/*  E-INTERACT (player.js tries this after storyInteract, before inventory)  */
/*  Returns true iff it consumed E. Discrete Tinker talk happens here; cache  */
/*  lock work happens in updatePuzzles via key edges, so a near-cache E is    */
/*  consumed here (blocking the trial-master) while the update does the work. */
/* ======================================================================== */
function puzzleInteract() {
  if (typeof player === 'undefined' || !summited) return false;
  if (atTinker(3.6)) { ciphTinkerTalk(); return true; }
  if (!ciph.met || !ciph.loc) return false;
  const feat = nearestFeature();
  if (feat && feat.d < (feat.k === 'stone' ? 3.2 : feat.k === 'vault' ? 6 : 5)) return true;   // consume; update() acts
  // shadow-clock dig spot (no prop): consume E while standing on the tip in the window
  if (!CIPH_SAVE.solved.c3 && invHas('waybill3') && dayT >= 0.6979 && dayT <= 0.7188 && sunDir.y > 0.05) {
    const tx = SPIRE.x - sunDir.x / sunDir.y * SPIRE.h, tz = SPIRE.z - sunDir.z / sunDir.y * SPIRE.h;
    if (dist2(tx, tz, player.pos.x, player.pos.z) < 6 && player.pos.y < 4) return true;
  }
  return false;
}

/* ======================================================================== */
/*  DEV / SMOKE-TEST HOOK — ?cipher=1..5 near a cache, ?cipher=vault at door  */
/*  Mirrors story.js ?story=N. Guarded so ?shot output is never affected.     */
/* ======================================================================== */
(function ciphDevJump() {
  if (SHOT) return;
  const q = params.get('cipher');
  if (!q) return;
  summited = true; try { localStorage.setItem('canopy.summited', '1'); } catch (e) { }
  ciph.met = true; CIPH_SAVE.met = true; ciphSave();
  ciphLocate();
  // grant every waybill so any cache is reachable
  for (const k of ['c1', 'c2', 'c3', 'c4', 'c5']) { const id = 'waybill' + k[1]; if (!invHas(id)) invAdd(id, 1, ciphWaybillNote(k)); }
  const L = ciph.loc;
  if (q === 'vault') {
    for (let i = 1; i <= 5; i++) if (!invHas('cog' + i)) invAdd('cog' + i, 1, ciphCogNote('c' + i));
    player.pos.set(L.vault.x, 0, L.vault.z + 8); player.yaw = Math.PI;
  } else if (/^[1-5]$/.test(q)) {
    const k = 'c' + q;
    if (k === 'c3') {
      dayT = 0.7083;                                            // 17:00 — the shadow-clock window
      if (typeof updateSky === 'function') updateSky(dayT);     // refresh sunDir for the tip below
      const tx = SPIRE.x - sunDir.x / sunDir.y * SPIRE.h, tz = SPIRE.z - sunDir.z / sunDir.y * SPIRE.h;
      player.pos.set(tx, 0, tz); player.yaw = Math.atan2(SPIRE.x - tx, SPIRE.z - tz);
    } else if (L[k]) { player.pos.set(L[k].x, (L[k].y || 0), L[k].z + 20); player.yaw = Math.PI; }
    if (k === 'c2' && !invHas('bellcard')) invAdd('bellcard', 1, 'The five bells, low to high: ' + CIPH_BELLNAMES.map((n, i) => n + ' (' + CIPH_BELLDESC[i] + ')').join(' · ') + '.');
  }
  if (typeof ensureChunks === 'function') ensureChunks(player.pos.x, player.pos.z, true);
})();
