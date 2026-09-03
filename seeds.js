/* CANOPY split file  seeds: awesome-pass — see openspec/changes/awesome-pass/design.md */
'use strict';
/* ==========================================================================
   GLOWSEEDS (design B2)
   Collectibles the canopy sheds where the light is strongest: on vined rooftops
   and on the high leaf platters. Placement is a PURE FUNCTION of the chunk index
   and that chunk's already-built colData — no rng() is drawn anywhere here, so
   the world does not re-roll (see the worldgen-rng-vertex-coupling note) and the
   same seeds sit in the same places every session.
   Collected keys persist; 25 and 50 seeds re-lace the leaf-sail (sailTier).
   Fully inert in SHOT — updateSeeds is only called when SHOT is falsy.
   ========================================================================== */

const SEED_PAD_LAYERS = { bough: 1, weave: 1, nest: 1, lookout: 1 };
const SEED_TIERS = [25, 50];
const SEED_POOL_N = 24;
const SEED_RADIUS = 2;              // Chebyshev chunk radius the pool covers

/* ---- persistence ---------------------------------------------------------- */
const seedsFound = new Set();
let sailTier = 0;
try {
  const raw = localStorage.getItem('canopy.seeds');
  if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) for (const k of a) seedsFound.add(k); }
} catch (e) { }
try { sailTier = Math.max(0, Math.min(2, parseInt(localStorage.getItem('canopy.sailtier'), 10) || 0)); } catch (e) { }
function seedsSave() {
  try { localStorage.setItem('canopy.seeds', JSON.stringify(Array.from(seedsFound))); } catch (e) { }
}

/* ---- placement ------------------------------------------------------------
   Reads the RESIDENT chunk's colData only (never builds or peeks one), so this is
   free to call every frame for the 5×5 ring around the player. Candidates are the
   high vined roofs and the high leaf platters; a hash of the rounded position gives
   a stable order, and the first n of it are the seeds. Cached per chunk key — the
   inputs are deterministic, so the cache can never go stale. */
const _seedCache = new Map();
const _seedsEverSeen = new Set();

function seedsIn(ix, iz) {
  const key = ix + ',' + iz;
  const hit = _seedCache.get(key);
  if (hit) return hit;
  const out = [];
  const t = (typeof chunkType === 'function') ? chunkType(ix, iz) : null;
  if (t === 'spire' || t === 'hamlet') { _seedCache.set(key, out); return out; }
  const n = (hash2(ix, iz, 9101) % 100) < 48 ? 1 + (hash2(ix, iz, 9102) % 2) : 0;
  if (!n) { _seedCache.set(key, out); return out; }
  const c = chunks.get(chunkKey(ix, iz));
  if (!c || !c.colData) return out;                  // not resident yet — don't cache an empty answer
  const cand = [];
  for (const s of c.colData.solids) {
    if (!s.vine || s.h < 10) continue;
    cand.push({ x: (s.x0 + s.x1) / 2, y: (s.y0 || 0) + s.h + 0.9, z: (s.z0 + s.z1) / 2 });
  }
  for (const pd of c.colData.pads) {
    if (!SEED_PAD_LAYERS[pd.layer] || pd.y < 10) continue;
    cand.push({ x: pd.x, y: pd.y + 0.9, z: pd.z });
  }
  for (const cd of cand) cd.o = hash2(Math.round(cd.x), Math.round(cd.z), 9103);
  // Ties broken on position so the order never depends on the source array order.
  cand.sort((a, b) => (a.o - b.o) || (a.x - b.x) || (a.z - b.z));
  for (let k = 0; k < cand.length && k < n; k++) {
    const cd = cand[k];
    const sk = ix + ',' + iz + ':' + k;
    out.push({ x: cd.x, y: cd.y, z: cd.z, key: sk });
    _seedsEverSeen.add(sk);
  }
  _seedCache.set(key, out);
  return out;
}

/* ---- the prop pool --------------------------------------------------------
   24 seeds' worth of geometry, built once and parked; the sync assigns the nearest
   uncollected placements to them. Never built in SHOT (updateSeeds is not called). */
let seedPool = null;
function _buildSeedPool() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xf4ffc0, emissive: 0xc8ff70, emissiveIntensity: 1.6, roughness: 0.4 });
  const pool = [];
  for (let i = 0; i < SEED_POOL_N; i++) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(tplBlob, mat);
    core.scale.setScalar(0.2);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texSoft, color: 0xd6ff8a, transparent: true, opacity: 0.45,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    }));
    halo.scale.setScalar(1.1);
    g.add(core); g.add(halo);
    g.visible = false;
    scene.add(g);
    pool.push({ g: g, core: core, halo: halo, seed: null });
  }
  return pool;
}

/* ---- runtime -------------------------------------------------------------- */
let _seedSyncT = 1e9, _seedChunkKey = '', _seedCueT = 0, _seedNear = [];

function _seedSync() {
  const cx = Math.floor(player.pos.x / CHUNK), cz = Math.floor(player.pos.z / CHUNK);
  _seedNear.length = 0;
  for (let dx = -SEED_RADIUS; dx <= SEED_RADIUS; dx++) for (let dz = -SEED_RADIUS; dz <= SEED_RADIUS; dz++) {
    for (const s of seedsIn(cx + dx, cz + dz)) if (!seedsFound.has(s.key)) _seedNear.push(s);
  }
  // Nearest first, so a dense ring never starves the seed you are walking toward.
  const px = player.pos.x, pz = player.pos.z;
  _seedNear.sort((a, b) => ((a.x - px) * (a.x - px) + (a.z - pz) * (a.z - pz)) -
                           ((b.x - px) * (b.x - px) + (b.z - pz) * (b.z - pz)));
  for (let i = 0; i < seedPool.length; i++) {
    const slot = seedPool[i], s = i < _seedNear.length ? _seedNear[i] : null;
    slot.seed = s;
    slot.g.visible = !!s;
    if (s) slot.g.position.set(s.x, s.y, s.z);
  }
}

function _seedCollect(s) {
  seedsFound.add(s.key);
  seedsSave();
  if (typeof pickupBurst === 'function') pickupBurst(s.x, s.y, s.z);
  const n = seedsFound.size;
  hint('Glowseed · ' + n + ' found', 2.5);
  once('seed', () => msg('A glowseed — the canopy sheds them where the light is strongest. Collect them; they remember the way up.', 7));
  // Unlock ladder: 25 re-laces the sail, 50 finishes it.
  if (n === SEED_TIERS[0] || n === SEED_TIERS[1]) {
    sailTier = n === SEED_TIERS[0] ? 1 : 2;
    try { localStorage.setItem('canopy.sailtier', String(sailTier)); } catch (e) { }
    msg(sailTier === 1
      ? 'Twenty-five glowseeds. You strip the ribs and re-lace the sail — it holds the air longer now.'
      : 'Fifty. The sail is all leaf now, and the leaf knows how to fly.', 8, true);
  } else if (n % 10 === 0) {
    const next = seedsNextAt(n);
    if (next) hint(n + ' glowseeds — next unlock at ' + next, 3);
  }
  _seedSyncT = 1e9;                                  // re-sync the pool on the next frame
}

function seedsNextAt(n) {
  for (const t of SEED_TIERS) if (n < t) return t;
  return null;
}

function updateSeeds(dt, time) {
  if (SHOT) return;
  if (!seedPool) seedPool = _buildSeedPool();
  const p = player;

  const ck = Math.floor(p.pos.x / CHUNK) + ',' + Math.floor(p.pos.z / CHUNK);
  _seedSyncT += dt;
  if (_seedSyncT > 1 || ck !== _seedChunkKey) { _seedChunkKey = ck; _seedSyncT = 0; _seedSync(); }

  const bob = Math.sin(time * 1.4 * Math.PI * 2) * 0.12;
  const pulse = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(time * 2.2));
  let nearest = Infinity;
  for (const slot of seedPool) {
    const s = slot.seed;
    if (!s) continue;
    slot.g.position.y = s.y + bob;
    slot.core.rotation.y += 0.8 * dt;
    slot.halo.material.opacity = pulse;
    const dx = s.x - p.pos.x, dz = s.z - p.pos.z, dy = s.y - p.pos.y;
    const hd = Math.hypot(dx, dz);
    if (hd < 1.7 && Math.abs(dy) < 2.2) { _seedCollect(s); slot.seed = null; slot.g.visible = false; continue; }
    const d = Math.hypot(hd, dy);
    if (d < nearest) nearest = d;
  }

  // Proximity cue: a soft high note every 2.4 s while an uncollected seed is close.
  _seedCueT -= dt;
  if (nearest < 14 && _seedCueT <= 0 && typeof AC !== 'undefined' && AC && !muted) {
    _seedCueT = 2.4;
    if (typeof sfxNote === 'function') sfxNote(1318.5, 0.25, 0.03);
  }
}

/* ---- interfaces consumed by other streams (design §0) --------------------- */
function seedsStatus() {
  return { found: seedsFound.size, total: _seedsEverSeen.size, nextAt: seedsNextAt(seedsFound.size), tier: sailTier };
}
function seedsNearby(range) {
  const out = [], r = range || 0, r2 = r * r, px = player.pos.x, pz = player.pos.z;
  const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
  const cr = Math.max(1, Math.ceil(r / CHUNK));
  for (let dx = -cr; dx <= cr; dx++) for (let dz = -cr; dz <= cr; dz++) {
    for (const s of seedsIn(cx + dx, cz + dz)) {
      if (seedsFound.has(s.key)) continue;
      const ex = s.x - px, ez = s.z - pz;
      if (ex * ex + ez * ez <= r2) out.push({ x: s.x, y: s.y, z: s.z });
    }
  }
  return out;
}
