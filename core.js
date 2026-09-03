/* ============================================================================
   CANOPY — a first-person walk through an endless, overgrown city.
   Single-file game logic on top of three.js (r152 UMD).
   Everything is procedural: geometry, textures, city layout, sound.
   ========================================================================= */
'use strict';

const statusEl = document.getElementById('status');
window.addEventListener('error', e => { statusEl.textContent = 'ERR ' + e.message; });

/* ---------------------------------------------------------------- utils -- */
const clamp = (x, a, b) => x < a ? a : (x > b ? b : x);
const lerp  = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iz, salt) {
  let h = (ix * 374761393 + iz * 668265263 + (salt || 0) * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0);
}

/* ------------------------------------------------------- region field (macro) --
   Two smooth scalar fields (verdancy, ruin) over chunk coords select a macro biome
   that breaks the world's uniformity into bands/pockets hundreds of metres wide.
   Value noise = bilinear interp of hashed lattice corners with a smoothstep fade, at
   wavelength 12 chunks plus a 0.35-amplitude octave at 5 for edge wobble. Everything
   here is allocation-free (valueNoise2 / regionBiome are called in baseChunkType's
   weight remap and in mission/trial ring scans over hundreds of chunks). Thresholds
   were tuned so a 100×100 window lands scorch≈15% deepgreen≈14% ashen≈8%.
   The Spire and Hamlet chunks (and their 8 neighbours each) clamp to full canopy so
   the tutorial landmark and the hidden village never spawn sun-blasted. _hamletCell is
   filled in once HAMLET is known (worldgen-builders.js); it is null during that IIFE,
   when the hamlet clamp is a harmless no-op (the remap can't change hamlet selection). */
function valueNoise2(x, z, salt) {
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0, salt) / 4294967296;
  const b = hash2(x0 + 1, z0, salt) / 4294967296;
  const c = hash2(x0, z0 + 1, salt) / 4294967296;
  const d = hash2(x0 + 1, z0 + 1, salt) / 4294967296;
  const top = a + (b - a) * sx, bot = c + (d - c) * sx;
  return top + (bot - top) * sz;
}
let _hamletCell = null;   // set to HAMLET after worldgen-builders.js computes it
function _clampCanopy(ix, iz) {
  return (Math.abs(ix - SPIRE.cx) <= 1 && Math.abs(iz - SPIRE.cz) <= 1) ||
    (_hamletCell && Math.abs(ix - _hamletCell.cx) <= 1 && Math.abs(iz - _hamletCell.cz) <= 1);
}
function _verdancy(ix, iz) { return 0.65 * valueNoise2(ix / 12, iz / 12, 4201) + 0.35 * valueNoise2(ix / 5, iz / 5, 4202); }
function _ruin(ix, iz) { return 0.65 * valueNoise2(ix / 12, iz / 12, 4301) + 0.35 * valueNoise2(ix / 5, iz / 5, 4302); }
// Allocation-free biome string — the hot path used by baseChunkType and ring scans.
function regionBiome(ix, iz) {
  let v = _verdancy(ix, iz), r = _ruin(ix, iz);
  if (_clampCanopy(ix, iz)) { if (v < 0.45) v = 0.45; if (r > 0.5) r = 0.5; }
  if (v < 0.32) return 'scorch';          // canopy failed here — open sun, bleached
  if (v > 0.66) return 'deepgreen';       // engineered flora won completely
  if (r > 0.66) return 'ashen';           // intact canopy, dead city
  return 'canopy';
}
// Full descriptor (fresh object) — called once per chunk in buildChunk, plus by the
// minimap/HUD and (Part 2) the campaign's nearestBiomeChunk. Globally accessible.
function regionAt(ix, iz) {
  let verdancy = _verdancy(ix, iz), ruin = _ruin(ix, iz);
  if (_clampCanopy(ix, iz)) { if (verdancy < 0.45) verdancy = 0.45; if (ruin > 0.5) ruin = 0.5; }
  let biome = 'canopy';
  if (verdancy < 0.32) biome = 'scorch';
  else if (verdancy > 0.66) biome = 'deepgreen';
  if (biome === 'canopy' && ruin > 0.66) biome = 'ashen';
  return { verdancy, ruin, biome };
}
// Colors authored in sRGB, converted once to linear (r152 color management).
function srgb(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
const _c = new THREE.Color();

/* ------------------------------------------------------------- constants -- */
const CHUNK = 64;            // meters per city block (streets run on borders)
const VIEW_R = 3;            // chunk radius kept alive around the player
const INSET = 8;             // buildings are inset this far from chunk borders
const CANOPY_Y = 24;         // above this you are in the sun
const DAY_LEN = 600;         // seconds per full day
const GRAV = 16, JUMP = 6.2, WALK = 5.2, SPRINT = 1.75, EYE = 1.62, PR = 0.42;
const CLIMB_SPEED = 3.2;
function randomizeSPIRE() {
  const cx = Math.floor(Math.random() * 16);
  const cz = Math.floor(Math.random() * 16);
  return { cx, cz, x: cx * CHUNK + 32, z: cz * CHUNK + 32, size: 22, h: 78 };
}
const SPIRE = randomizeSPIRE();

/* ------------------------------------------------------------- terrain ----
   The world was dead flat at y=0 for its whole life, and a great deal of the codebase
   encodes that: ~30 builders emit compose(x, 0, z, …) against base-anchored templates,
   colData.solids/trunks record only a TOP (`h`) with the base implied at 0, player.js
   resolves support from `let groundY = 0`, and the global ground plane's hole-punch shader
   exists precisely because anything below y=0 is invisible.

   terrainY(x, z) is the single source of truth that replaces that constant. It is pure,
   deterministic, cheap, and consumes NO rng — so it can be called from physics, worldgen and
   entity code without perturbing the worldgen stream (see the note on Batch.addGeo).

   THE FLATNESS MASK is what makes this tractable. Several features have their whole vertical
   design welded to y=0 and cannot simply be lifted:
     · canals   — waterY is deliberately +0.14 ABOVE the plane, because a rect pit can't be
                  punched through it; the channel is cut into an assumed-flat street
     · sinkholes— the bowl is expressed as depth BELOW 0 and shows through a punched circle
     · reservoirs/hamlet/spire/colossus/fallen — tall structures on hand-tuned absolute heights
   Every one of those is gated by a pure function of the chunk index, so terrainY can ask
   "does this chunk (or a neighbour) need to stay flat?" without building anything, and taper
   relief to exactly zero there. Those features then keep working untouched.

   Amplitude is deliberately modest (TERRAIN_AMP ≈ 1.1 m over ~90 m wavelengths → grades of a
   few percent). That is enough to make the ground read as land rather than a table, while
   staying comfortably walkable and keeping building foundation skirts shallow. */
const TERRAIN_AMP = 1.1;
function _terrainRelief(x, z) {
  return (0.62 * valueNoise2(x / 92, z / 92, 8801)
        + 0.27 * valueNoise2(x / 34, z / 34, 8802)
        + 0.11 * valueNoise2(x / 12.5, z / 12.5, 8803)) * 2 - 1;   // valueNoise2 → [0,1]
}
// 1 = this chunk must stay perfectly flat. Pure function of the chunk index; safe to call
// before worldgen-builders.js has loaded (the typeof guards keep core.js self-contained).
function chunkNeedsFlat(ix, iz) {
  // The ±1 terms are load-bearing, do not "simplify" them away. isCanalX(ix) puts the channel
  // on x = ix*CHUNK — the chunk's WEST border — and the embankment straddles it by ±CANAL.bank
  // (5.5 m). Masking only the chunk east of the line leaves chunk ix-1, whose EAST edge is that
  // same border, carrying half the embankment unflattened; _flatness bilerps the two chunk
  // centres either side, so it bottoms out at 0.5 mid-channel instead of 1 and up to 0.61 m of
  // relief survives in the strip. The canal water plane is welded to an absolute y = +0.14, so
  // rising ground occludes the water and floods the tow-path and falling ground leaves the
  // water visibly floating. Same argument on z for isCanalZ.
  if (typeof isCanalX === 'function' && (isCanalX(ix) || isCanalX(ix + 1) || isCanalZ(iz) || isCanalZ(iz + 1))) return 1;
  if (ix === SPIRE.cx && iz === SPIRE.cz) return 1;
  if (typeof HAMLET !== 'undefined' && ix === HAMLET.cx && iz === HAMLET.cz) return 1;
  if (typeof chunkType === 'function') {
    const t = chunkType(ix, iz);
    if (t === 'sinkhole' || t === 'reservoir' || t === 'hamlet' || t === 'colossus' || t === 'fallen') return 1;
  }
  return 0;
}
// Bilinear blend of the flatness of the 4 surrounding chunk CENTRES, so relief tapers off
// over a chunk rather than stepping at a border (a step would tear every road and wall
// straddling that border).
function _flatness(x, z) {
  const fx = x / CHUNK - 0.5, fz = z / CHUNK - 0.5;
  const i0 = Math.floor(fx), j0 = Math.floor(fz);
  const tx = fx - i0, tz = fz - j0;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);   // smoothstep for C1 continuity
  const f00 = chunkNeedsFlat(i0, j0), f10 = chunkNeedsFlat(i0 + 1, j0);
  const f01 = chunkNeedsFlat(i0, j0 + 1), f11 = chunkNeedsFlat(i0 + 1, j0 + 1);
  return (f00 * (1 - sx) + f10 * sx) * (1 - sz) + (f01 * (1 - sx) + f11 * sx) * sz;
}
function terrainY(x, z) {
  const flat = _flatness(x, z);
  if (flat >= 0.999) return 0;
  return _terrainRelief(x, z) * TERRAIN_AMP * (1 - flat);
}

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');   // screenshot/smoke-test mode

/* ------------------------------------------------- campaign save (Part 2) --
   "The Second Seed" 7-chapter campaign persists here. Parsed ONCE at load so
   worldgen can read planted/complete state BEFORE story.js (which loads LAST):
   chunks build before story.js runs, so the sapling guard in buildChunk and the
   relit-spire beacon must read the persisted state directly. story.js owns all
   writes and keeps STORY_SAVE in sync in memory. `planted` is stored spire-relative
   (offset in chunks) so the grown oasis survives the per-session SPIRE re-roll —
   the same tradeoff the Hidden Hamlet makes. */
let STORY_SAVE = { v: 1, ch: 1, shards: 0, haveKey: false, haveSeed: false, planted: null, seedbearer: false, foundHamletViaStory: false };
try {
  const _ss = JSON.parse(localStorage.getItem('canopy.story') || 'null');
  if (_ss && _ss.v === 1) STORY_SAVE = Object.assign(STORY_SAVE, _ss);
} catch (e) { }
// Does chunk (ix,iz) hold the planted Second Seed? Spire-relative + cheap → safe in buildChunk.
function storyPlantedAt(ix, iz) {
  const p = STORY_SAVE.planted;
  return !!p && ix === SPIRE.cx + p.dx && iz === SPIRE.cz + p.dz;
}
function storyComplete() { return STORY_SAVE.ch > 7; }   // campaign done → relit spire beacon + Seedbearer map

/* ------------------------------------------------------------- renderer -- */
const canvas = document.getElementById('game');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!SHOT });
} catch (e) {
  statusEl.textContent = 'ERR no webgl';
  document.getElementById('goLabel').textContent = 'WEBGL NOT AVAILABLE';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
else renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Sky-reflection probe: a tiny cubemap of the procedural sky, re-rendered as the day
// cycle moves, so water / puddles / window glass / brass pick up real sky+sun
// reflections. envScene holds lightweight clones of the sky dome and sun/moon sprites
// (populated in worldgen-chunks.js once those exist); refreshEnvProbe() is throttled
// from updateSky. Per-material envMap assignment (not scene.environment) so matte
// batched geometry keeps its current look.
const envRT = new THREE.WebGLCubeRenderTarget(64);
const envCam = new THREE.CubeCamera(1, 900, envRT);
const envScene = new THREE.Scene();
function refreshEnvProbe() {
  const tm = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;   // don't double-tonemap the reflection
  envCam.update(renderer, envScene);
  renderer.toneMapping = tm;
  envRT.texture.needsPMREMUpdate = true;        // r152: re-filter the cubeUV copy PBR materials sample
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x88a37c, 18, 215);
// near/far ratio drives depth-buffer precision. The old 0.1/1200 (12000:1) starved
// city-distance facades of resolution, so flush ornaments (signs at 0.08 m, vines at
// 0.14 m) z-fought the wall behind them and flickered on every camera turn. Player
// collision keeps the first-person eye >= PR (0.42 m) off any wall, so a 0.3 m near
// clips nothing; far drops to 700 (well past the 580 m high-altitude fog cutoff).
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.3, 700);
scene.add(camera);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ------------------------------------------------------------- lighting -- */
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.castShadow = true;
// 2048 over the 150 m ortho span is ~7 cm/texel; 4096 halves that where the GPU allows.
const shadowRes = renderer.capabilities.maxTextureSize >= 8192 ? 4096 : 2048;
sun.shadow.mapSize.set(shadowRes, shadowRes);
sun.shadow.camera.left = -75; sun.shadow.camera.right = 75;
sun.shadow.camera.top = 75; sun.shadow.camera.bottom = -75;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 420;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.4;
scene.add(sun); scene.add(sun.target);

// ground term lifts the undersides of canopy/leaves seen from the street; kept modest so night stays put
const hemi = new THREE.HemisphereLight(0xbadfff, 0x2c4020, 0.5);
scene.add(hemi);
const amb = new THREE.AmbientLight(0x405040, 0.16);
scene.add(amb);

// Night street lighting: a small pool of real point lights that hop to the nearest
// still-burning lamp heads around the player, so the dark streets actually pool with
// warm light instead of only the lamp glass glowing. They read straight from each
// chunk's colData.lamps (working ones). Kept always-visible with intensity driven to
// 0 when unused, so the light count — and thus the shaders — never change.
const LAMP_LIGHTS = 6;
const LAMP_REACH = 30;
const lampLights = [];
for (let i = 0; i < LAMP_LIGHTS; i++) {
  const L = new THREE.PointLight(0xffb267, 0, LAMP_REACH, 2);
  L.castShadow = false;
  scene.add(L);
  lampLights.push(L);
}

// The player's flashlight — a spot cone parented to the camera so it always throws
// where you look. Toggled with F; its intensity ramps on/off smoothly in the loop.
const flashlight = new THREE.SpotLight(0xfff2d0, 0, 46, 0.46, 0.5, 1.3);
flashlight.position.set(0.3, -0.22, 0.1);    // held a touch to the right, below the eye
const flashTarget = new THREE.Object3D();
flashTarget.position.set(0, -0.14, -1);        // aimed slightly down the street
camera.add(flashlight);
camera.add(flashTarget);
flashlight.target = flashTarget;
let flashOn = false;

/* ---------------------------------------------------- procedural textures -- */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
// Roughness / bump data are raw scalars, not colour — they must NOT be sRGB-decoded.
function canvasTexLinear(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if ('colorSpace' in t) t.colorSpace = THREE.NoColorSpace; else t.encoding = THREE.LinearEncoding;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

// Building facade + matching emissive (lit windows) atlas.
// An 8×8 grid of window cells; the map/emissive repeat is set to 1/BLD_CELLS so that
// one atlas cell maps to exactly one facade bay — addBuilding then asks for ~3.2 m per
// bay, which is what reads correctly against the ~1.7 m citizens (before this the whole
// 8×8 atlas was crammed into a single bay, giving the "dollhouse micro-grid" look).
// Window geometry is constant DOWN each column and the floor band is constant ACROSS
// each row, so tiling always keeps windows aligned in columns and floors; the per-column
// style variety means a building that starts at a different phase (uo/vo) reads as a
// genuinely different facade.
const BLD_CELLS = 8;
function makeBuildingTextures() {
  // 1024px atlas → 128px per bay: windows read as glass with reveals and streaks
  // instead of 64px blobs. Realism comes from four things real weathered concrete
  // has: storey slab bands, recessed window reveals, rain streaks running DOWN from
  // sills, and large-scale tonal mottling — not from more speckle noise.
  const S = 1024, cell = S / BLD_CELLS, r = mulberry32(1234);
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const e = makeCanvas(S, S), y = e.getContext('2d');
  y.fillStyle = '#000'; y.fillRect(0, 0, S, S);
  // Micro-surface maps are drawn from RECORDED window rects after the cell loop, never by
  // interleaving fresh r() calls — the facade rng stream (and thus every layout) is unchanged.
  const cRough = makeCanvas(S, S), xr = cRough.getContext('2d');
  const cBump = makeCanvas(S, S), xb = cBump.getContext('2d');
  xr.fillStyle = '#dcdcdc'; xr.fillRect(0, 0, S, S);   // concrete ≈ 0.86 rough everywhere
  xb.fillStyle = '#808080'; xb.fillRect(0, 0, S, S);   // bump mid-grey = flat wall
  const panes = [], rails = [];
  // concrete base: vertical gradient + large soft mottling (patchy discoloration)
  const g = x.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#918f84'); g.addColorStop(1, '#787468');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) {
    const mx = r() * S, my = r() * S, mr = 60 + r() * 190;
    const gg = x.createRadialGradient(mx, my, 1, mx, my, mr);
    const dark = r() < 0.6;
    gg.addColorStop(0, dark ? `rgba(52,54,46,${0.05 + r() * 0.08})` : `rgba(210,206,190,${0.04 + r() * 0.06})`);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gg; x.beginPath(); x.arc(mx, my, mr, 0, 7); x.fill();
  }
  // long vertical grime runs from the top of the facade
  for (let i = 0; i < 70; i++) {
    const gx = r() * S, gw = 3 + r() * 12, gl = S * (0.3 + r() * 0.7);
    const gg = x.createLinearGradient(0, 0, 0, gl);
    gg.addColorStop(0, `rgba(42,46,38,${0.05 + r() * 0.09})`); gg.addColorStop(1, 'rgba(42,46,38,0)');
    x.fillStyle = gg; x.fillRect(gx, 0, gw, gl);
  }
  // fine grain
  for (let i = 0; i < 5200; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)';
    x.fillRect(r() * S, r() * S, 2, 2);
  }
  // spalled patches: plaster fallen off, lighter core with a darker rim
  for (let i = 0; i < 14; i++) {
    const sx = r() * S, sy = r() * S, sr = 9 + r() * 26;
    x.fillStyle = 'rgba(48,46,40,0.35)';
    x.beginPath();
    for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI * 2, rr = sr * (0.7 + r() * 0.5); x.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
    x.fill();
    x.fillStyle = `rgba(${168 + r() * 26 | 0},${160 + r() * 22 | 0},${142 + r() * 18 | 0},0.8)`;
    x.beginPath();
    for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI * 2, rr = sr * 0.72 * (0.7 + r() * 0.5); x.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
    x.fill();
  }
  // hairline cracks wandering mostly downward
  x.strokeStyle = 'rgba(38,38,32,0.35)'; x.lineWidth = 1.5;
  for (let i = 0; i < 22; i++) {
    let px = r() * S, py = r() * S * 0.7;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 7; k++) { px += (r() - 0.5) * 26; py += 10 + r() * 34; x.lineTo(px, py); }
    x.stroke();
  }
  // per-column window style (held constant down the column so windows stack vertically)
  const cols = [];
  for (let i = 0; i < BLD_CELLS; i++) {
    const t = r();
    if (t < 0.12)      cols.push({ pier: true });                                 // solid pier / party wall
    else if (t < 0.30) cols.push({ ww: 36 + r() * 12, panes: 1 });                // narrow window
    else if (t < 0.50) cols.push({ ww: 88 + r() * 16, panes: 1 });                // picture window
    else if (t < 0.68) cols.push({ ww: 84, panes: 2 });                           // twin panes
    else               cols.push({ ww: 64 + r() * 12, panes: 1, bal: r() < 0.35 }); // standard, maybe balcony
  }
  const WY = 22, WH = 80;               // floor band (constant across rows → aligned storeys)
  /* Published opening table — see makeFacadeAtlas for the contract. One entry per atlas
     COLUMN, each a list of [u0,u1,v0,v1] openings in CELL FRACTIONS (u from the cell's left
     edge, v from its BOTTOM, i.e. the way world v runs). bldWalls hangs modelled sills and
     reveals on exactly these rects, so a painted window and its geometry can never drift
     apart. Pure arithmetic over `cols` — draws no r(), so the facade rng stream is unmoved. */
  const bays = cols.map(col => {
    if (col.pier) return [];
    const g0 = (cell - (WY + WH)) / cell, g1 = (cell - WY) / cell;
    if (col.panes === 2) {
      const gap = 16, pw = (col.ww - gap) / 2, a = (cell - col.ww) / 2;
      return [[a / cell, (a + pw) / cell, g0, g1], [(a + pw + gap) / cell, (a + col.ww) / cell, g0, g1]];
    }
    return [[(cell - col.ww) / 2 / cell, (cell + col.ww) / 2 / cell, g0, g1]];
  });
  // glass tone families — real streets mix dead-dark glass, greenish reflection,
  // pale sky bounce; one gradient everywhere is what reads "video-gamey"
  const GLASS = [
    ['#38444c', '#161c20'], ['#2c3a36', '#121a16'], ['#1a2024', '#0b0e10'],
    ['#546a76', '#26343c'], ['#4a5a50', '#1e2822'], ['#243038', '#101418']
  ];
  // one glazed pane, drawn to both the albedo (x) and emissive (y) canvases
  function pane(wx, wy, ww, wh, state) {
    panes.push({ wx, wy, ww, wh, state });   // replayed onto rough/bump maps below
    // recessed reveal: dark surround, deepest at the top (glass sits back from the wall)
    x.fillStyle = 'rgba(30,30,26,0.55)'; x.fillRect(wx - 7, wy - 7, ww + 14, wh + 14);
    x.fillStyle = '#4c4a42'; x.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);          // frame
    if (state === 'lit') {
      const lg = x.createLinearGradient(0, wy, 0, wy + wh);
      lg.addColorStop(0, '#b7a684'); lg.addColorStop(1, '#7d6a45');
      x.fillStyle = lg; x.fillRect(wx, wy, ww, wh);
      y.fillStyle = '#ffb35e'; y.fillRect(wx, wy, ww, wh);
      y.fillStyle = '#241505'; y.fillRect(wx + ww / 2 - 2, wy, 3, wh); y.fillRect(wx, wy + wh / 2 - 2, ww, 3);
    } else if (state === 'broken') {
      x.fillStyle = '#0c0f10'; x.fillRect(wx, wy, ww, wh);
      x.fillStyle = 'rgba(150,160,170,0.35)';                                    // clinging shards
      for (let k = 0; k < 4; k++) {
        const bx2 = wx + r() * ww, by2 = wy + (r() < 0.5 ? 0 : wh);
        x.beginPath(); x.moveTo(bx2, by2); x.lineTo(bx2 - 6 - r() * 8, by2 + (by2 > wy ? -1 : 1) * (8 + r() * 14)); x.lineTo(bx2 + 6 + r() * 8, by2); x.fill();
      }
      x.fillStyle = 'rgba(90,120,60,0.5)';                                       // moss creeping inside
      for (let k = 0; k < 6; k++) { const mr2 = 3 + r() * 6; x.beginPath(); x.arc(wx + r() * ww, wy + wh - r() * 12, mr2, 0, 7); x.fill(); }
    } else {
      const tone = GLASS[(r() * GLASS.length) | 0];
      const dg = x.createLinearGradient(0, wy, 0, wy + wh);
      dg.addColorStop(0, tone[0]); dg.addColorStop(1, tone[1]);
      x.fillStyle = dg; x.fillRect(wx, wy, ww, wh);
      // interior shadow under the head of the reveal
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(wx, wy, ww, 6);
      // diagonal sky reflection, varying slope and strength
      if (r() < 0.8) {
        const sl = 0.3 + r() * 0.4, o = r() * 0.5;
        x.fillStyle = `rgba(200,215,220,${0.05 + r() * 0.1})`;
        x.beginPath();
        x.moveTo(wx + ww * o, wy + wh); x.lineTo(wx + ww * (o + sl), wy);
        x.lineTo(wx + ww * (o + sl + 0.18), wy); x.lineTo(wx + ww * (o + 0.18), wy + wh); x.fill();
      }
      // some windows keep curtains / blinds: pale inner band at a random height
      if (r() < 0.3) {
        x.fillStyle = 'rgba(190,180,150,0.18)';
        const ch = wh * (0.25 + r() * 0.4);
        x.fillRect(wx + 2, wy + (r() < 0.6 ? 6 : wh - ch), ww - 4, ch);
      }
    }
    x.fillStyle = '#3c3a33';                                                     // mullions
    x.fillRect(wx + ww / 2 - 2, wy, 3, wh); x.fillRect(wx, wy + wh / 2 - 2, ww, 3);
    // sill with a bright top edge, then rain streaks running down from its ends
    x.fillStyle = 'rgba(200,196,180,0.5)'; x.fillRect(wx - 8, wy + wh + 6, ww + 16, 2);
    x.fillStyle = 'rgba(30,30,26,0.6)'; x.fillRect(wx - 8, wy + wh + 8, ww + 16, 4);
    const nStreak = 1 + (r() * 3 | 0);
    for (let k = 0; k < nStreak; k++) {
      const sx2 = wx - 6 + r() * (ww + 12), sw2 = 2 + r() * 4, sl2 = 14 + r() * 40;
      const sg = x.createLinearGradient(0, wy + wh + 12, 0, wy + wh + 12 + sl2);
      sg.addColorStop(0, `rgba(44,48,40,${0.18 + r() * 0.2})`); sg.addColorStop(1, 'rgba(44,48,40,0)');
      x.fillStyle = sg; x.fillRect(sx2, wy + wh + 12, sw2, sl2);
    }
    // occasional rust bleed from a window-corner fixing
    if (r() < 0.18) {
      const rx2 = r() < 0.5 ? wx - 5 : wx + ww + 2, rl2 = 10 + r() * 26;
      const rg = x.createLinearGradient(0, wy + wh, 0, wy + wh + rl2);
      rg.addColorStop(0, 'rgba(122,72,40,0.4)'); rg.addColorStop(1, 'rgba(122,72,40,0)');
      x.fillStyle = rg; x.fillRect(rx2, wy + wh, 3, rl2);
    }
  }
  for (let cy = 0; cy < BLD_CELLS; cy++) for (let cx = 0; cx < BLD_CELLS; cx++) {
    const px = cx * cell, py = cy * cell, col = cols[cx];
    const lit = r() < 0.16, broken = !lit && r() < 0.10;
    const state = lit ? 'lit' : broken ? 'broken' : 'normal';
    if (col.pier) {
      x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(px + 12, py, cell - 24, cell); // faint pilaster shadow
      if (r() < 0.25) {                                                           // occasional vent grille
        x.fillStyle = '#3f3d36'; x.fillRect(px + cell / 2 - 16, py + 44, 32, 24);
        x.fillStyle = 'rgba(0,0,0,0.4)'; for (let v = 0; v < 5; v++) x.fillRect(px + cell / 2 - 16, py + 48 + v * 5, 32, 2);
        // grime shadow under the grille
        const vg = x.createLinearGradient(0, py + 68, 0, py + 108);
        vg.addColorStop(0, 'rgba(40,42,36,0.28)'); vg.addColorStop(1, 'rgba(40,42,36,0)');
        x.fillStyle = vg; x.fillRect(px + cell / 2 - 14, py + 68, 28, 40);
      }
    } else if (col.panes === 2) {
      const gap = 16, pw = (col.ww - gap) / 2, x0w = px + (cell - col.ww) / 2;
      pane(x0w, py + WY, pw, WH, state); pane(x0w + pw + gap, py + WY, pw, WH, state);
    } else {
      pane(px + (cell - col.ww) / 2, py + WY, col.ww, WH, state);
      if (col.bal) {                                                              // balcony rail across the bay
        x.fillStyle = 'rgba(35,38,32,0.8)'; x.fillRect(px + 8, py + WY + WH + 12, cell - 16, 5);
        for (let b = 0; b < 7; b++) x.fillRect(px + 12 + b * (cell - 24) / 6, py + WY + WH + 12, 2, 13);
        rails.push({ rx: px + 8, ry: py + WY + WH + 12, rw: cell - 16, rh: 5 });
      }
    }
    // creeping moss at some cell bottoms
    if (r() < 0.4) {
      for (let k = 0; k < 16; k++) {
        x.fillStyle = `rgba(${60 + r() * 30},${95 + r() * 40},${40 + r() * 20},${0.22 + r() * 0.28})`;
        const mr = 5 + r() * 16;
        x.beginPath(); x.arc(px + r() * cell, py + cell - r() * 24, mr, 0, 7); x.fill();
      }
    }
  }
  // Replay the recorded window rects onto rough/bump: frame → glass keeps the layout in
  // lockstep with the albedo without touching r(). Glass reads smooth (dark = low rough)
  // so it alone catches the probe + sun; the reveal/frame/glass step gives raking relief.
  for (const p of panes) {
    xr.fillStyle = '#a0a0a0'; xr.fillRect(p.wx - 4, p.wy - 4, p.ww + 8, p.wh + 8);           // matte frame
    xr.fillStyle = p.state === 'broken' ? '#c8c8c8' : '#2e2e2e';                             // glass gone vs smooth glass
    xr.fillRect(p.wx, p.wy, p.ww, p.wh);
    xb.fillStyle = '#4a4a4a'; xb.fillRect(p.wx - 7, p.wy - 7, p.ww + 14, p.wh + 14);         // recessed reveal
    xb.fillStyle = '#666'; xb.fillRect(p.wx - 4, p.wy - 4, p.ww + 8, p.wh + 8);              // frame
    xb.fillStyle = '#3a3a3a'; xb.fillRect(p.wx, p.wy, p.ww, p.wh);                           // glass deepest
    xb.fillStyle = '#b0b0b0'; xb.fillRect(p.wx - 8, p.wy + p.wh + 6, p.ww + 16, 2);          // proud sill
  }
  for (const rl of rails) { xb.fillStyle = '#a0a0a0'; xb.fillRect(rl.rx, rl.ry, rl.rw, rl.rh); }
  // storey slab bands across every floor line: light worn top edge + shadow below.
  // Drawn LAST so they sit over grime/streaks like a real projecting slab edge.
  for (let cy = 0; cy <= BLD_CELLS; cy++) {
    const by = (cy * cell) % S;
    x.fillStyle = 'rgba(205,200,184,0.34)'; x.fillRect(0, by, S, 3);
    x.fillStyle = 'rgba(28,28,24,0.4)'; x.fillRect(0, by + 3, S, 5);
    x.fillStyle = 'rgba(28,28,24,0.14)'; x.fillRect(0, by + 8, S, 5);
    xr.fillStyle = '#c4c4c4'; xr.fillRect(0, by, S, 3);        // worn-smooth slab top edge
    xb.fillStyle = '#c0c0c0'; xb.fillRect(0, by, S, 3);        // proud slab lip
    xb.fillStyle = '#606060'; xb.fillRect(0, by + 3, S, 3);    // shadow groove just below (sells the relief)
  }
  // faint panel joints between bays
  for (let cx2 = 0; cx2 < BLD_CELLS; cx2++) {
    x.fillStyle = 'rgba(30,30,26,0.16)'; x.fillRect(cx2 * cell, 0, 2, S);
    xb.fillStyle = '#5a5a5a'; xb.fillRect(cx2 * cell, 0, 2, S);   // recessed panel joint
  }
  const map = canvasTex(c), emissive = canvasTex(e);
  const rough = canvasTexLinear(cRough);
  // cBump was drawn as a HEIGHT field all along, so it feeds normalFromHeight directly and
  // the material gets stable tangent-space relief instead of three's screen-space bumpMap
  // (which softened every reveal at the grazing angles a street-level camera actually sees a
  // facade from). One blur first: the reveals/sills are hard fillRect steps, and a 1-texel
  // cliff Sobels into a rim of extreme normals that reads as an ink outline, not a chamfer.
  wrapBlur(cBump, 1.1);
  const normal = normalFromHeight(cBump, 5.5);
  // r152 shares one uv transform (taken from map) across these maps; set all four anyway.
  for (const t of [map, emissive, rough, normal]) t.repeat.set(1 / BLD_CELLS, 1 / BLD_CELLS);
  return { map, emissive, rough, normal, bays };
}

/* ------------------------------------------------------------- facade materials --
   Every building in the city used to sample the ONE concrete sheet above, which is why
   every street read as the same building repeated. These are the other materials a real
   street mixes in — fired brick, painted render over blockwork, glazed ceramic tile —
   picked per district by FACADE_OF in worldgen-builders.js.

   They honour the concrete sheet's contract, and all of it is load-bearing:
     · BLD_CELLS x BLD_CELLS cells at repeat 1/BLD_CELLS, so one cell IS one facade bay;
     · window geometry constant DOWN a column and the window band constant ACROSS every row,
       so tiling keeps windows stacked in columns and storeys in line whatever atlas phase
       (uo, vo) a building starts at — and so the skirt can extend v downward without moving
       a window row;
     · `bays[]` publishes each column's openings in cell fractions (u from the cell's LEFT
       edge, v from its BOTTOM) so bldWalls can hang MODELLED sills and reveals on exactly
       the painted ones. Nothing outside this file can otherwise know where a window is.

   Drawn at TRUE WORLD SCALE. PMx/PMy are px per metre, derived from the district's nominal
   bay width and storey height (STYLE_CFG's mid-range), and every feature below is sized in
   METRES through mx()/my(): brick 215x65 mm on 10 mm joints, concrete block 390x190,
   glazed tile 150. That scale is exactly why brick and tile need a 2048 sheet — at 1024 a
   bay is 128 px, i.e. ~44 px/m, and a 75 mm brick course lands on under 3 px and moires
   into felt. Render has no sub-decimetre pattern, so it stays at 1024.

   NOTE on wrap(), the same rule as makeGroundTexture: a mark that has to survive tiling is
   replayed at the neighbouring sheet offsets, and EVERY random value it uses must be drawn
   BEFORE the wrap call. Draw inside the callback and each copy gets a different colour and
   the seam you were hiding comes straight back. Same reason the brick bond re-draws the
   edge-straddling brick with the colour it ALREADY rolled instead of rolling a fresh one. */
const FACADE_SPEC = {
  // seed, sheet px, nominal bay/storey in metres (the district mean), and how far the
  // roughness / emissive sheets are downsampled (they carry no fine detail — only the
  // albedo and the Sobel'd normal need the full sheet, and this keeps VRAM sane).
  brick: { seed: 5501, S: 2048, bayM: 3.1, flrM: 3.35, roughDiv: 4, emiDiv: 8 },
  render: { seed: 6602, S: 2048, bayM: 5.6, flrM: 4.9, roughDiv: 4, emiDiv: 8 },
  tile: { seed: 7703, S: 2048, bayM: 2.45, flrM: 3.85, roughDiv: 4, emiDiv: 8 },
};
function makeFacadeAtlas(kind) {
  const K = FACADE_SPEC[kind];
  const S = K.S, cell = S / BLD_CELLS, r = mulberry32(K.seed);
  const PMx = cell / K.bayM, PMy = cell / K.flrM;          // px per metre, across / up
  const mx = (m) => m * PMx, my = (m) => m * PMy;          // metres → px
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const cH = makeCanvas(S, S), xh = cH.getContext('2d');   // height field → normal map
  const cR = makeCanvas(S, S), xr = cR.getContext('2d');
  const cE = makeCanvas(S, S), xe = cE.getContext('2d');
  xe.fillStyle = '#000'; xe.fillRect(0, 0, S, S);
  const wrap = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); };

  /* ---- 1. window rhythm. One style per COLUMN, held all the way down it. --------- */
  const cols = [];
  for (let i = 0; i < BLD_CELLS; i++) {
    const t = r();
    if (kind === 'tile') {                       // curtain wall: wide glazing, few solids
      if (t < 0.10) cols.push({ pier: true });
      else if (t < 0.55) cols.push({ w: 0.80 + r() * 0.08, n: 2 });
      else cols.push({ w: 0.70 + r() * 0.14, n: 1 });
    } else if (kind === 'render') {              // works: big steel-framed lights, blind bays
      if (t < 0.20) cols.push({ pier: true });
      else if (t < 0.52) cols.push({ w: 0.60 + r() * 0.16, n: 2 });
      else cols.push({ w: 0.48 + r() * 0.22, n: 1 });
    } else {                                     // brick: narrow punched openings
      if (t < 0.16) cols.push({ pier: true });
      else if (t < 0.44) cols.push({ w: 0.28 + r() * 0.08, n: 1 });
      else if (t < 0.74) cols.push({ w: 0.38 + r() * 0.09, n: 1 });
      else cols.push({ w: 0.46 + r() * 0.10, n: 2 });
    }
  }
  const G0 = kind === 'tile' ? 0.15 : kind === 'render' ? 0.24 : 0.20;   // window band, cell
  const G1 = kind === 'tile' ? 0.88 : kind === 'render' ? 0.86 : 0.80;   // fractions from BOTTOM
  const bays = cols.map(col => {
    if (col.pier) return [];
    const a = (1 - col.w) / 2, b = a + col.w;
    if (col.n === 2) { const g = 0.055, pw = (col.w - g) / 2; return [[a, a + pw, G0, G1], [a + pw + g, b, G0, G1]]; }
    return [[a, b, G0, G1]];
  });
  // cell fraction → sheet px. v is measured from the cell BOTTOM, the canvas from the top.
  const PX = (cx, f) => (cx + f) * cell;
  const PY = (f) => (1 - f) * cell;               // within a cell, top-relative

  /* ---- 2. the wall field, at true scale --------------------------------------- */
  if (kind === 'brick') {
    // Running bond. The mortar is the BACKGROUND and each brick face is inset by one joint,
    // so the joint width is exact everywhere instead of accumulating rounding. bwPx divides
    // S exactly and S/chPx is EVEN, so the half-brick offset on alternate courses tiles.
    const bwPx = S / Math.round(S / mx(0.225));
    const chPx = S / (2 * Math.round(S / my(0.075) / 2));
    const jx = Math.max(0.75, mx(0.010)), jy = Math.max(0.7, my(0.010));
    x.fillStyle = '#6b6058'; x.fillRect(0, 0, S, S);        // lime mortar
    xh.fillStyle = '#5e5e5e'; xh.fillRect(0, 0, S, S);      // joints sit BELOW the faces
    xr.fillStyle = '#ececec'; xr.fillRect(0, 0, S, S);      // mortar is very rough
    const nC = Math.round(S / chPx), nB = Math.round(S / bwPx);
    for (let j = 0; j < nC; j++) {
      const by = j * chPx, off = (j & 1) ? bwPx / 2 : 0;
      for (let k = 0; k < nB; k++) {
        const bx = k * bwPx + off;
        // fired clay is never one colour: mostly mid red-brown, some over-burnt blue-black
        // headers, some pale under-fired, and the odd frost-spalled face
        const t = r(); let cr, cg, cb, ro = 226, hv;
        if (t < 0.06) { cr = 76 + r() * 18; cg = 70 + r() * 16; cb = 74 + r() * 18; ro = 150; }
        else if (t < 0.14) { cr = 156 + r() * 20; cg = 138 + r() * 18; cb = 118 + r() * 16; }
        else if (t < 0.17) { cr = 142 + r() * 18; cg = 116 + r() * 14; cb = 100 + r() * 12; ro = 250; }  // spalled
        else { const v = r(); cr = 122 + v * 34 + r() * 10; cg = 94 + v * 24 + r() * 9; cb = 78 + v * 18 + r() * 8; }
        hv = (t < 0.17 && t >= 0.14) ? 110 : 150 + r() * 40;     // spalled faces sink
        const fill = `rgb(${cr | 0},${cg | 0},${cb | 0})`, hgt = `rgb(${hv | 0},${hv | 0},${hv | 0})`;
        const rgh = `rgb(${ro},${ro},${ro})`;
        // a brick straddling the right edge is REDRAWN at the left with the colour it already
        // rolled — rolling a fresh one there is the wrap() seam bug in bond form
        for (const ox of (bx + bwPx > S ? [0, -S] : [0])) {
          x.fillStyle = fill; x.fillRect(bx + ox + jx, by + jy, bwPx - 2 * jx, chPx - 2 * jy);
          xh.fillStyle = hgt; xh.fillRect(bx + ox + jx, by + jy, bwPx - 2 * jx, chPx - 2 * jy);
          xr.fillStyle = rgh; xr.fillRect(bx + ox + jx, by + jy, bwPx - 2 * jx, chPx - 2 * jy);
        }
      }
    }
    // stepped cracks that follow the bond (brick fails through the joints, not the bricks)
    for (let i = 0; i < 16; i++) {
      const sx = r() * S, sy = r() * S, len = 6 + (r() * 14 | 0), dir = r() < 0.5 ? 1 : -1;
      const pts = []; let px2 = sx, py2 = sy;
      for (let k = 0; k < len; k++) { pts.push([px2, py2]); px2 += dir * bwPx * (r() < 0.5 ? 0.5 : 1); py2 += chPx; }
      wrap((ox, oy) => {
        x.strokeStyle = 'rgba(38,34,30,0.5)'; x.lineWidth = Math.max(1, jx * 1.4);
        x.beginPath(); x.moveTo(pts[0][0] + ox, pts[0][1] + oy);
        for (const p of pts) x.lineTo(p[0] + ox, p[1] + oy);
        x.stroke();
        xh.strokeStyle = 'rgba(52,52,52,0.7)'; xh.lineWidth = Math.max(1, jx * 1.4);
        xh.beginPath(); xh.moveTo(pts[0][0] + ox, pts[0][1] + oy);
        for (const p of pts) xh.lineTo(p[0] + ox, p[1] + oy);
        xh.stroke();
      });
    }
    // efflorescence: the pale salt bloom that leaches out of damp brick, ~0.3-1.2 m across
    for (let i = 0; i < 26; i++) {
      const ex = r() * S, ey = r() * S, er = mx(0.15 + r() * 0.45), a = 0.06 + r() * 0.14;
      const g = x.createRadialGradient(ex, ey, 1, ex, ey, er);
      g.addColorStop(0, `rgba(226,224,214,${a})`); g.addColorStop(1, 'rgba(226,224,214,0)');
      x.fillStyle = g; x.beginPath(); x.arc(ex, ey, er, 0, 7); x.fill();
    }
  } else if (kind === 'render') {
    // Painted render over blockwork: one broad painted field, then everything that happens
    // to it — patch repairs in a slightly-off tone, crazing, and blown patches where the
    // render has come away and the 390x190 blocks show through.
    x.fillStyle = '#b6b1a6'; x.fillRect(0, 0, S, S);
    xh.fillStyle = '#8c8c8c'; xh.fillRect(0, 0, S, S);
    xr.fillStyle = '#dedede'; xr.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) {                    // patch repairs, 0.4-2.5 m across
      const px2 = r() * S, py2 = r() * S, pw = mx(0.4 + r() * 2.1), ph = my(0.3 + r() * 1.6);
      const v = r() < 0.5 ? 16 : -18, a = 0.10 + r() * 0.18;
      x.fillStyle = `rgba(${182 + v | 0},${177 + v | 0},${166 + v | 0},${a})`;
      x.fillRect(px2, py2, pw, ph);
      xh.fillStyle = `rgba(${140 + (v > 0 ? 16 : -14)},${140},${140},0.5)`;
      xh.fillRect(px2, py2, pw, ph);
    }
    // Float texture. This is the only thing standing between a render wall and a sheet of
    // plastic at close range, but it is FINE — 1-4 cm of sand grain, packed dense. Drawn big
    // and sparse (the first pass here used 3-12 cm blobs at 0.4 height alpha) it reads as
    // bubble wrap, because the Sobel turns every isolated blob into a blister.
    for (let i = 0; i < 26000; i++) {
      const sx = r() * S, sy = r() * S, sr = mx(0.012 + r() * 0.028), up = r() < 0.5;
      x.fillStyle = up ? 'rgba(255,253,246,0.05)' : 'rgba(86,82,74,0.05)';
      x.beginPath(); x.arc(sx, sy, sr, 0, 7); x.fill();
      xh.fillStyle = up ? 'rgba(188,188,188,0.28)' : 'rgba(90,90,90,0.28)';
      xh.beginPath(); xh.arc(sx, sy, sr, 0, 7); xh.fill();
    }
    for (let i = 0; i < 60; i++) {                    // and the slow unevenness of a floated wall
      const sx = r() * S, sy = r() * S, sr = mx(0.3 + r() * 0.9), up = r() < 0.5;
      const g = xh.createRadialGradient(sx, sy, 1, sx, sy, sr);
      g.addColorStop(0, up ? 'rgba(160,160,160,0.5)' : 'rgba(112,112,112,0.5)');
      g.addColorStop(1, 'rgba(140,140,140,0)');
      xh.fillStyle = g; xh.beginPath(); xh.arc(sx, sy, sr, 0, 7); xh.fill();
    }
    // Crazing: the map-crack network. It is a FINE net — 10-40 cm cells — and drawing it at
    // metre scale (the first pass here did) reads as somebody scribbled on the wall.
    for (let i = 0; i < 260; i++) {
      let px2 = r() * S, py2 = r() * S; const pts = [[px2, py2]];
      for (let k = 0; k < 5; k++) { px2 += (r() - 0.5) * mx(0.16); py2 += (r() - 0.5) * my(0.16); pts.push([px2, py2]); }
      wrap((ox, oy) => {
        x.strokeStyle = 'rgba(120,114,102,0.22)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(pts[0][0] + ox, pts[0][1] + oy);
        for (const p of pts) x.lineTo(p[0] + ox, p[1] + oy);
        x.stroke();
        xh.strokeStyle = 'rgba(112,112,112,0.42)'; xh.lineWidth = 1.2;
        xh.beginPath(); xh.moveTo(pts[0][0] + ox, pts[0][1] + oy);
        for (const p of pts) xh.lineTo(p[0] + ox, p[1] + oy);
        xh.stroke();
      });
    }
    // blown render: an irregular patch where the render has come off the blockwork behind.
    // Kept shallow and low-contrast — a bright rim reads as scribbled-on graffiti, not damage.
    const blW = mx(0.4), blH = my(0.2);
    for (let i = 0; i < 13; i++) {
      const bx = r() * S, by = r() * S, br = mx(0.2 + r() * 0.5), pts = [];
      for (let k = 0; k <= 11; k++) { const a = k / 11 * Math.PI * 2; pts.push([Math.cos(a) * br * (0.5 + r() * 0.75), Math.sin(a) * br * 0.7 * (0.5 + r() * 0.75)]); }
      const path = (ctx) => { ctx.beginPath(); ctx.moveTo(bx + pts[0][0], by + pts[0][1]); for (const p of pts) ctx.lineTo(bx + p[0], by + p[1]); ctx.closePath(); };
      x.save(); path(x); x.clip();
      x.fillStyle = '#8b877e'; x.fillRect(bx - br * 2, by - br * 2, br * 4, br * 4);          // grey block
      x.strokeStyle = 'rgba(66,64,60,0.5)'; x.lineWidth = Math.max(1, mx(0.012));              // block joints
      for (let j = -3; j <= 3; j++) { const ly = by + j * blH; x.beginPath(); x.moveTo(bx - br * 2, ly); x.lineTo(bx + br * 2, ly); x.stroke(); }
      for (let j = -3; j <= 3; j++) { const lx = bx + j * blW + ((Math.round(by / blH) & 1) ? blW / 2 : 0); x.beginPath(); x.moveTo(lx, by - br * 2); x.lineTo(lx, by + br * 2); x.stroke(); }
      x.restore();
      xh.save(); path(xh); xh.fillStyle = '#6e6e6e'; xh.fill(); xh.restore();                  // the patch sits BELOW the render
      xr.save(); path(xr); xr.fillStyle = '#f2f2f2'; xr.fill(); xr.restore();                  // bare block drinks light
      x.save(); path(x); x.strokeStyle = 'rgba(206,202,192,0.28)'; x.lineWidth = Math.max(1, mx(0.02)); x.stroke(); x.restore();
    }
    // rust bleeding out of the reinforcement and the fixings — the works district's own stain
    for (let i = 0; i < 22; i++) {
      const rx2 = r() * S, ry2 = r() * S, rw = mx(0.03 + r() * 0.09), rl = my(0.4 + r() * 2.2);
      const g = x.createLinearGradient(0, ry2, 0, ry2 + rl);
      g.addColorStop(0, `rgba(126,74,40,${0.16 + r() * 0.2})`); g.addColorStop(1, 'rgba(126,74,40,0)');
      x.fillStyle = g; x.fillRect(rx2, ry2, rw, rl);
    }
  } else {   // tile
    // 150 mm glazed ceramic on a grout bed. The grout is the background; every tile is
    // inset, so grout lines stay a constant width and the grid tiles exactly.
    /* CONTRAST DISCIPLINE — this grid is the highest-frequency thing in the city and it sits
       right at the Nyquist limit for a facade a street away. Drawn the obvious way (dark grout,
       bright glaze, tiles glossy against matte grout) it mip-averages into a shimmering
       black/white checker, and with the sky probe on the glaze it does it in bright cyan. So:
       grout stays CLOSE to the tile in tone, grout lines are at least 1.6 px wide so a mip has
       something to average, the glaze/grout roughness step is gentle, and the crispness lives
       in the normal map (which is blurred harder before the Sobel) instead of the albedo. */
    const tp = S / Math.round(S / mx(0.155)), tq = S / Math.round(S / my(0.155));
    const gx2 = Math.max(1.6, mx(0.008)), gy2 = Math.max(1.6, my(0.008));
    x.fillStyle = '#9d9a92'; x.fillRect(0, 0, S, S);
    xh.fillStyle = '#5a5a5a'; xh.fillRect(0, 0, S, S);
    xr.fillStyle = '#a8a8a8'; xr.fillRect(0, 0, S, S);
    const nX = Math.round(S / tp), nY = Math.round(S / tq);
    for (let j = 0; j < nY; j++) for (let k = 0; k < nX; k++) {
      const tx = k * tp, ty = j * tq, t = r();
      if (t < 0.012) {                                  // a tile off: adhesive comb marks
        x.fillStyle = '#83807a'; x.fillRect(tx + gx2, ty + gy2, tp - 2 * gx2, tq - 2 * gy2);
        x.fillStyle = 'rgba(72,70,66,0.4)';
        for (let v = 0; v < 5; v++) x.fillRect(tx + gx2, ty + gy2 + v * (tq / 6), tp - 2 * gx2, Math.max(1, tq * 0.05));
        xh.fillStyle = '#4c4c4c'; xh.fillRect(tx + gx2, ty + gy2, tp - 2 * gx2, tq - 2 * gy2);
        xr.fillStyle = '#cacaca'; xr.fillRect(tx + gx2, ty + gy2, tp - 2 * gx2, tq - 2 * gy2);
        continue;
      }
      // glazed tiles come out of the kiln with a real spread of tone — that variation IS
      // the look; one flat colour reads as printed paper. Kept to a ~15% spread around the
      // grout, though: a wide spread is a random checker, and a random checker aliases.
      const v = r(), cr = 158 + v * 22 + r() * 6, cg = 164 + v * 21 + r() * 6, cb = 158 + v * 20 + r() * 6;
      x.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
      x.fillRect(tx + gx2, ty + gy2, tp - 2 * gx2, tq - 2 * gy2);
      const hv = 162 + r() * 26;
      xh.fillStyle = `rgb(${hv | 0},${hv | 0},${hv | 0})`;
      xh.fillRect(tx + gx2, ty + gy2, tp - 2 * gx2, tq - 2 * gy2);
      const ro = 120 + r() * 26;                         // glaze is the glossiest thing here,
      xr.fillStyle = `rgb(${ro | 0},${ro | 0},${ro | 0})`;   // but only just — see the note above
      xr.fillRect(tx + gx2, ty + gy2, tp - 2 * gx2, tq - 2 * gy2);
    }
    for (let i = 0; i < 20; i++) {                       // dirt washed down the grout lines
      const gxp = Math.round(r() * nX) * tp, gl = my(0.8 + r() * 3.2), gyp = r() * S;
      const g = x.createLinearGradient(0, gyp, 0, gyp + gl);
      g.addColorStop(0, `rgba(66,66,60,${0.1 + r() * 0.14})`); g.addColorStop(1, 'rgba(66,66,60,0)');
      x.fillStyle = g; x.fillRect(gxp - gx2, gyp, gx2 * 3, gl);
    }
  }

  /* ---- 3. the weathering every material shares -------------------------------- */
  for (let i = 0; i < 34; i++) {                         // large tonal drift, metres across
    const px2 = r() * S, py2 = r() * S, pr = mx(0.8 + r() * 3.4), dark = r() < 0.6;
    const g = x.createRadialGradient(px2, py2, 1, px2, py2, pr);
    g.addColorStop(0, dark ? `rgba(48,50,44,${0.04 + r() * 0.08})` : `rgba(214,210,196,${0.03 + r() * 0.06})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px2, py2, pr, 0, 7); x.fill();
  }
  for (let i = 0; i < 54; i++) {                         // grime running down from above
    const gxp = r() * S, gw = mx(0.05 + r() * 0.26), gl = my(1 + r() * 5), gy2 = r() * S;
    const g = x.createLinearGradient(0, gy2, 0, gy2 + gl);
    g.addColorStop(0, `rgba(44,48,40,${0.05 + r() * 0.1})`); g.addColorStop(1, 'rgba(44,48,40,0)');
    x.fillStyle = g; x.fillRect(gxp, gy2, gw, gl);
  }

  /* ---- 4. the windows ---------------------------------------------------------- */
  const FRAME = kind === 'brick' ? '#4b4034' : kind === 'render' ? '#585a54' : '#9aa0a6';
  const GLASS = kind === 'tile'
    ? [['#5c7382', '#2a3a44'], ['#48606c', '#1e2a32'], ['#6b8492', '#32444e'], ['#334552', '#141d24'], ['#54707a', '#26353c']]
    : [['#38444c', '#161c20'], ['#2c3a36', '#121a16'], ['#1a2024', '#0b0e10'], ['#4a5a50', '#1e2822'], ['#243038', '#101418']];
  const eD = 1 / K.emiDiv;
  const rects = [];                                      // replayed onto rough after the loop
  function pane(wx, wy, ww, wh, state, mull) {
    rects.push({ wx, wy, ww, wh, state });
    const rv = Math.max(2, mx(0.05));                    // the painted part of the reveal
    x.fillStyle = 'rgba(26,26,22,0.5)'; x.fillRect(wx - rv, wy - rv, ww + 2 * rv, wh + 2 * rv);
    x.fillStyle = FRAME; x.fillRect(wx - rv * 0.6, wy - rv * 0.6, ww + rv * 1.2, wh + rv * 1.2);
    if (state === 'lit') {
      const lg = x.createLinearGradient(0, wy, 0, wy + wh);
      lg.addColorStop(0, '#b9a888'); lg.addColorStop(1, '#7e6b47');
      x.fillStyle = lg; x.fillRect(wx, wy, ww, wh);
      xe.fillStyle = '#ffb35e'; xe.fillRect(wx * eD, wy * eD, ww * eD, wh * eD);
    } else if (state === 'broken') {
      x.fillStyle = '#0b0e0f'; x.fillRect(wx, wy, ww, wh);
      x.fillStyle = 'rgba(150,160,170,0.32)';
      for (let k = 0; k < 4; k++) {
        const bx2 = wx + r() * ww, by2 = wy + (r() < 0.5 ? 0 : wh), sg = by2 > wy ? -1 : 1;
        x.beginPath(); x.moveTo(bx2, by2); x.lineTo(bx2 - mx(0.05) - r() * mx(0.1), by2 + sg * (my(0.1) + r() * my(0.2)));
        x.lineTo(bx2 + mx(0.05) + r() * mx(0.1), by2); x.fill();
      }
      x.fillStyle = 'rgba(86,116,58,0.5)';
      for (let k = 0; k < 6; k++) { x.beginPath(); x.arc(wx + r() * ww, wy + wh - r() * my(0.3), mx(0.03 + r() * 0.07), 0, 7); x.fill(); }
    } else {
      const tone = GLASS[(r() * GLASS.length) | 0];
      const dg = x.createLinearGradient(0, wy, 0, wy + wh);
      dg.addColorStop(0, tone[0]); dg.addColorStop(1, tone[1]);
      x.fillStyle = dg; x.fillRect(wx, wy, ww, wh);
      x.fillStyle = 'rgba(0,0,0,0.34)'; x.fillRect(wx, wy, ww, Math.max(2, my(0.12)));   // head shadow
      if (r() < 0.8) {                                                                    // sky reflection
        const sl = 0.3 + r() * 0.4, o = r() * 0.5;
        x.fillStyle = `rgba(200,215,220,${0.05 + r() * 0.1})`;
        x.beginPath(); x.moveTo(wx + ww * o, wy + wh); x.lineTo(wx + ww * (o + sl), wy);
        x.lineTo(wx + ww * (o + sl + 0.18), wy); x.lineTo(wx + ww * (o + 0.18), wy + wh); x.fill();
      }
      if (r() < 0.32) {                                                                   // blinds / curtain
        x.fillStyle = 'rgba(190,180,150,0.18)';
        const ch2 = wh * (0.25 + r() * 0.4);
        x.fillRect(wx + 2, wy + (r() < 0.6 ? my(0.08) : wh - ch2), ww - 4, ch2);
      }
    }
    x.fillStyle = FRAME;                                                                  // mullion + transom
    const mw = Math.max(2, mx(0.045));
    for (let k = 1; k < mull[0]; k++) x.fillRect(wx + ww * k / mull[0] - mw / 2, wy, mw, wh);
    for (let k = 1; k < mull[1]; k++) x.fillRect(wx, wy + wh * k / mull[1] - mw / 2, ww, mw);
    // rain streaks off the ends of the sill
    for (let k = 0, n = 1 + (r() * 3 | 0); k < n; k++) {
      const sx2 = wx - mx(0.08) + r() * (ww + mx(0.16)), sw2 = mx(0.02 + r() * 0.05), sl2 = my(0.2 + r() * 0.7);
      const sg = x.createLinearGradient(0, wy + wh + my(0.1), 0, wy + wh + my(0.1) + sl2);
      sg.addColorStop(0, `rgba(44,48,40,${0.16 + r() * 0.2})`); sg.addColorStop(1, 'rgba(44,48,40,0)');
      x.fillStyle = sg; x.fillRect(sx2, wy + wh + my(0.1), sw2, sl2);
    }
  }
  for (let cy = 0; cy < BLD_CELLS; cy++) for (let cx = 0; cx < BLD_CELLS; cx++) {
    const py = cy * cell, op = bays[cx];
    const lit = r() < 0.15, broken = !lit && r() < 0.10;
    const state = lit ? 'lit' : broken ? 'broken' : 'normal';
    const mull = kind === 'tile' ? [2, 3] : kind === 'render' ? [3, 4] : [2, 2];
    if (!op.length) {                                    // solid pier / party wall
      if (r() < 0.22) {                                  // a vent grille, 0.6 x 0.4 m
        const gw = mx(0.6), gh = my(0.4), gxp = cx * cell + (cell - gw) / 2, gyp = py + cell * 0.35;
        x.fillStyle = '#3d3b34'; x.fillRect(gxp, gyp, gw, gh);
        x.fillStyle = 'rgba(0,0,0,0.4)';
        for (let v = 0; v < 5; v++) x.fillRect(gxp, gyp + gh * (0.1 + v * 0.18), gw, Math.max(1, gh * 0.09));
        const vg = x.createLinearGradient(0, gyp + gh, 0, gyp + gh + my(0.8));
        vg.addColorStop(0, 'rgba(40,42,36,0.26)'); vg.addColorStop(1, 'rgba(40,42,36,0)');
        x.fillStyle = vg; x.fillRect(gxp, gyp + gh, gw, my(0.8));
      }
      continue;
    }
    for (const o of op) {
      const wx = PX(cx, o[0]), ww = (o[1] - o[0]) * cell;
      const wy = py + PY(o[3]), wh = (o[3] - o[2]) * cell;
      // brick punches its openings, so they get a stone lintel over and a stone sill under —
      // both drawn where bldWalls will later MODEL them, so paint and geometry reinforce
      if (kind === 'brick') {
        const lh = my(0.13), sh2 = my(0.10), ov = mx(0.09);
        x.fillStyle = '#a49c8c'; x.fillRect(wx - ov, wy - lh, ww + 2 * ov, lh);
        xh.fillStyle = '#c8c8c8'; xh.fillRect(wx - ov, wy - lh, ww + 2 * ov, lh);
        x.fillStyle = '#9c9484'; x.fillRect(wx - ov, wy + wh, ww + 2 * ov, sh2);
        xh.fillStyle = '#cccccc'; xh.fillRect(wx - ov, wy + wh, ww + 2 * ov, sh2);
        xr.fillStyle = '#c0c0c0'; xr.fillRect(wx - ov, wy - lh, ww + 2 * ov, lh + wh + sh2);
      }
      pane(wx, wy, ww, wh, state, mull);
    }
  }
  // Replay the recorded openings onto rough + height: same layout as the albedo without
  // spending a single r(), exactly as the concrete sheet does.
  const rvH = Math.max(2, mx(0.05));
  for (const p of rects) {
    xr.fillStyle = '#a8a8a8'; xr.fillRect(p.wx - rvH * 0.6, p.wy - rvH * 0.6, p.ww + rvH * 1.2, p.wh + rvH * 1.2);
    xr.fillStyle = p.state === 'broken' ? '#cccccc' : '#282828';   // glass is the smooth thing
    xr.fillRect(p.wx, p.wy, p.ww, p.wh);
    xh.fillStyle = '#4a4a4a'; xh.fillRect(p.wx - rvH, p.wy - rvH, p.ww + 2 * rvH, p.wh + 2 * rvH);
    xh.fillStyle = '#6a6a6a'; xh.fillRect(p.wx - rvH * 0.6, p.wy - rvH * 0.6, p.ww + rvH * 1.2, p.wh + rvH * 1.2);
    xh.fillStyle = '#363636'; xh.fillRect(p.wx, p.wy, p.ww, p.wh);
  }

  /* ---- 5. storey line + bay joints, drawn last so they read as real edges ------- */
  for (let cy = 0; cy <= BLD_CELLS; cy++) {
    const by = (cy * cell) % S, lip = Math.max(2, my(0.05)), sh2 = Math.max(3, my(0.11));
    if (kind === 'brick') {                              // a projecting brick-on-edge band
      x.fillStyle = 'rgba(196,172,150,0.30)'; x.fillRect(0, by, S, lip);
      x.fillStyle = 'rgba(26,24,20,0.34)'; x.fillRect(0, by + lip, S, sh2);
      xh.fillStyle = '#c8c8c8'; xh.fillRect(0, by - lip, S, lip * 2);
    } else if (kind === 'render') {                      // a moulded render band + its stain
      x.fillStyle = 'rgba(224,220,208,0.34)'; x.fillRect(0, by - lip, S, lip * 2);
      x.fillStyle = 'rgba(30,30,26,0.34)'; x.fillRect(0, by + lip, S, sh2);
      x.fillStyle = 'rgba(76,84,58,0.16)'; x.fillRect(0, by + lip + sh2, S, sh2 * 2);   // algae under it
      xh.fillStyle = '#cccccc'; xh.fillRect(0, by - lip, S, lip * 2);
    } else {                                             // tile: a spandrel closer
      x.fillStyle = 'rgba(74,80,84,0.42)'; x.fillRect(0, by - lip * 2, S, lip * 4);
      x.fillStyle = 'rgba(34,36,38,0.34)'; x.fillRect(0, by + lip * 2, S, sh2);
      xh.fillStyle = '#b4b4b4'; xh.fillRect(0, by - lip * 2, S, lip * 4);
    }
    xr.fillStyle = '#c8c8c8'; xr.fillRect(0, by - lip, S, lip * 2);
    xh.fillStyle = '#565656'; xh.fillRect(0, by + lip, S, sh2 * 0.6);   // the shadow groove
  }
  for (let cx = 0; cx < BLD_CELLS; cx++) {               // bay / party joint
    // render is cast in bays with a real 20 mm movement joint between them; brick and tile
    // only ever show a hairline party joint
    const jw = kind === 'render' ? Math.max(2, mx(0.02)) : Math.max(1.5, mx(0.012));
    x.fillStyle = kind === 'render' ? 'rgba(26,26,22,0.4)' : 'rgba(30,30,26,0.13)';
    x.fillRect(cx * cell, 0, jw, S);
    xh.fillStyle = kind === 'render' ? '#3e3e3e' : '#5c5c5c'; xh.fillRect(cx * cell, 0, jw, S);
  }
  /* A cast-iron downpipe down some of the solid bays. It is painted, not modelled, but the
     height field carries a half-round profile so the normal map gives it real cylindrical
     shading — which is most of what a downpipe is at street distance — plus the dark stain
     every leaking joint leaves behind it. Solid bays are the ones a pipe would actually run
     down, and a bay is solid for the WHOLE column, so the pipe tiles vertically. */
  if (kind !== 'tile') {
    for (let cx = 0; cx < BLD_CELLS; cx++) {
      if (bays[cx].length || r() > 0.55) continue;
      const dw = mx(0.09), dxp = cx * cell + cell * (0.16 + r() * 0.1);
      const sg = x.createLinearGradient(dxp - dw, 0, dxp + dw * 2, 0);     // damp stain behind it
      sg.addColorStop(0, 'rgba(46,50,42,0)'); sg.addColorStop(0.5, 'rgba(46,50,42,0.3)'); sg.addColorStop(1, 'rgba(46,50,42,0)');
      x.fillStyle = sg; x.fillRect(dxp - dw, 0, dw * 3, S);
      for (let k = 0; k < 5; k++) {                                        // half-round profile
        const f = k / 4, w2 = dw * (1 - f * 0.8), v = 150 + f * 96;
        x.fillStyle = `rgba(${58 + f * 34 | 0},${56 + f * 32 | 0},${52 + f * 30 | 0},1)`;
        x.fillRect(dxp - w2 / 2 + dw * 0.1 * f, 0, w2, S);
        xh.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
        xh.fillRect(dxp - w2 / 2 + dw * 0.1 * f, 0, w2, S);
      }
      xr.fillStyle = '#c0c0c0'; xr.fillRect(dxp - dw / 2, 0, dw, S);
      for (let k = 0; k < BLD_CELLS * 2; k++) {                            // socket every ~1.7 m
        const by2 = k * cell / 2 + cell * 0.12;
        x.fillStyle = 'rgba(40,38,34,0.85)'; x.fillRect(dxp - dw * 0.75, by2, dw * 1.5, my(0.08));
        xh.fillStyle = '#dcdcdc'; xh.fillRect(dxp - dw * 0.75, by2, dw * 1.5, my(0.08));
      }
    }
  }
  // moss creeping up out of the shadow at the foot of each storey
  for (let cy = 0; cy < BLD_CELLS; cy++) for (let cx = 0; cx < BLD_CELLS; cx++) {
    if (r() > 0.34) continue;
    for (let k = 0; k < 14; k++) {
      x.fillStyle = `rgba(${60 + r() * 30 | 0},${95 + r() * 40 | 0},${40 + r() * 20 | 0},${0.18 + r() * 0.26})`;
      x.beginPath(); x.arc(cx * cell + r() * cell, (cy + 1) * cell - r() * my(0.7), mx(0.04 + r() * 0.16), 0, 7); x.fill();
    }
  }

  /* ---- 6. ship it -------------------------------------------------------------- */
  const map = canvasTex(c);
  const rS = S / K.roughDiv, cR2 = makeCanvas(rS, rS);
  cR2.getContext('2d').drawImage(cR, 0, 0, rS, rS);
  const eS = S / K.emiDiv, cE2 = makeCanvas(eS, eS);
  cE2.getContext('2d').drawImage(cE, 0, 0, eS, eS);
  const rough = canvasTexLinear(cR2), emissive = canvasTex(cE2);
  // Same reasoning as the concrete sheet: blur the drawn height field first so a 1-texel
  // fillRect cliff Sobels into a chamfer instead of an ink outline, then take a real
  // tangent-space normal map (three's bumpMap flattens out at exactly the grazing angles a
  // street-level camera sees a facade from).
  wrapBlur(cH, S >= 2048 ? 1.6 : 1.1);
  const normal = normalFromHeight(cH, kind === 'brick' ? 4.2 : kind === 'tile' ? 3.4 : 3.0);
  for (const t of [map, emissive, rough, normal]) t.repeat.set(1 / BLD_CELLS, 1 / BLD_CELLS);
  return { map, emissive, rough, normal, bays };
}

/* The forest floor — the global ground plane between the streets and under the trees.
   This used to be cracked-pavement art (wandering pale-lipped crack polylines up to ~4 m
   long), which is now the WRONG job: roads and sidewalks carry their own asphalt/concrete
   sheet via matSurf, so everything this texture covers is soil, moss, litter and root mat.
   Tiled at GROUND_TILE metres with a Sobel-derived normal map, so raking sun and lamp light
   find real clumping instead of a flat felt. Drawn at true scale: a leaf is ~10 cm, a twig
   ~20 cm, a root ridge ~8 cm wide.

   Deep-canopy floors are BROWN-dominant — humus and litter, with moss taking the damp
   patches. Reading as an even green lawn is the classic tell of a painted-on ground.

   NOTE on wrap(): it replays a mark at the 8 surrounding tile offsets so the sheet is
   seamless. Every random value a mark uses must therefore be drawn BEFORE the wrap call —
   drawing inside the callback gives each of the 9 copies different colour/alpha, which
   defeats the whole point and leaves a visible seam. */
const GROUND_TILE = 8;                                   // metres per tile (repeat set in worldgen-chunks)
function makeGroundTexture() {
  const S = 1024, r = mulberry32(77);                    // 128 px per metre
  const PM = S / GROUND_TILE;                            // pixels per metre
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const cH = makeCanvas(S, S), xh = cH.getContext('2d');
  const cRough = makeCanvas(S, S), xr = cRough.getContext('2d');
  x.fillStyle = '#43392e'; x.fillRect(0, 0, S, S);       // damp humus brown
  xh.fillStyle = '#808080'; xh.fillRect(0, 0, S, S);
  xr.fillStyle = '#e4e4e4'; xr.fillRect(0, 0, S, S);     // forest floor is very rough
  const wrap = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); };

  // 1) soil tone variation — wet hollows and dry rises, metres across
  for (let i = 0; i < 40; i++) {
    const px = r() * S, py = r() * S, pr = (0.6 + r() * 2.4) * PM, wet = r() < 0.5, a = 0.08 + r() * 0.14;
    const g = x.createRadialGradient(px, py, 1, px, py, pr);
    g.addColorStop(0, wet ? `rgba(30,25,19,${a})` : `rgba(110,95,72,${a * 0.8})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, pr, 0, 7); x.fill();
  }
  // 2) moss cushions — damp patches only, not a lawn. Desaturated olive, PROUD of the soil
  //    and rougher than bare earth.
  for (let i = 0; i < 90; i++) {
    const mx = r() * S, my = r() * S, mr = (0.12 + r() * 0.42) * PM;
    const hue = 78 + r() * 24, sat = 14 + r() * 15, lig = 12 + r() * 9;
    const a0 = 0.4 + r() * 0.24, a1 = 0.3 + r() * 0.2;
    wrap((ox, oy) => {
      const g = x.createRadialGradient(mx + ox, my + oy, 1, mx + ox, my + oy, mr);
      g.addColorStop(0, `hsla(${hue},${sat}%,${lig + 6}%,${a0})`);
      g.addColorStop(0.66, `hsla(${hue},${sat}%,${lig}%,${a1})`);
      g.addColorStop(1, `hsla(${hue},${sat}%,${lig}%,0)`);
      x.fillStyle = g; x.beginPath(); x.arc(mx + ox, my + oy, mr, 0, 7); x.fill();
      const gh = xh.createRadialGradient(mx + ox, my + oy, 1, mx + ox, my + oy, mr);
      gh.addColorStop(0, 'rgba(172,172,172,0.7)'); gh.addColorStop(1, 'rgba(128,128,128,0)');
      xh.fillStyle = gh; xh.beginPath(); xh.arc(mx + ox, my + oy, mr, 0, 7); xh.fill();
      xr.fillStyle = 'rgba(255,255,255,0.4)'; xr.beginPath(); xr.arc(mx + ox, my + oy, mr * 0.8, 0, 7); xr.fill();
    });
  }
  // 3) fine moss/lichen speckle so the cushions aren't smooth blobs
  for (let i = 0; i < 5200; i++) {
    const sx = r() * S, sy = r() * S, sr = 1 + r() * 2.2;
    x.fillStyle = `hsla(${76 + r() * 28},${14 + r() * 16}%,${11 + r() * 12}%,${0.12 + r() * 0.2})`;
    x.beginPath(); x.arc(sx, sy, sr, 0, 7); x.fill();
  }
  // 4) grit and small stones pressed into the soil
  for (let i = 0; i < 2600; i++) {
    const gx = r() * S, gy = r() * S, gr = 0.9 + r() * 2.6, lit = r() < 0.5;
    const v = lit ? 132 + r() * 52 : 40 + r() * 34;
    x.fillStyle = `rgba(${v | 0},${(v * 0.94) | 0},${(v * 0.84) | 0},${0.16 + r() * 0.24})`;
    x.beginPath(); x.arc(gx, gy, gr, 0, 7); x.fill();
    const hv = 128 + (lit ? 30 + r() * 36 : -(22 + r() * 26));
    xh.fillStyle = `rgba(${hv | 0},${hv | 0},${hv | 0},0.7)`;
    xh.beginPath(); xh.arc(gx, gy, gr, 0, 7); xh.fill();
  }
  // 5) leaf litter — fallen leaves ~8-18 cm long, each an ellipse with a midrib, drifted
  //    (denser in patches, as wind piles them) rather than evenly sprinkled. Kept low in
  //    contrast: fresh-fallen colour on a forest floor is muted, not autumn-postcard.
  const drifts = [];
  for (let i = 0; i < 7; i++) drifts.push([r() * S, r() * S, (1 + r() * 2.2) * PM]);
  for (let i = 0; i < 760; i++) {
    let lx, ly;
    if (r() < 0.62) { const d = drifts[(r() * drifts.length) | 0], a = r() * 7, rr = r() * d[2]; lx = d[0] + Math.cos(a) * rr; ly = d[1] + Math.sin(a) * rr; }
    else { lx = r() * S; ly = r() * S; }
    const ll = (0.04 + r() * 0.055) * PM, lw = ll * (0.4 + r() * 0.3), rot = r() * 7;
    const dry = r() < 0.6;
    const col = dry
      ? `rgba(${84 + r() * 34 | 0},${60 + r() * 26 | 0},${30 + r() * 16 | 0},`
      : `rgba(${50 + r() * 26 | 0},${68 + r() * 26 | 0},${32 + r() * 14 | 0},`;
    const a = 0.34 + r() * 0.3;
    wrap((ox, oy) => {
      x.save(); x.translate(lx + ox, ly + oy); x.rotate(rot);
      x.fillStyle = col + a + ')';
      x.beginPath(); x.ellipse(0, 0, ll, lw, 0, 0, 7); x.fill();
      x.strokeStyle = 'rgba(28,22,15,0.22)'; x.lineWidth = 1;      // midrib
      x.beginPath(); x.moveTo(-ll, 0); x.lineTo(ll, 0); x.stroke();
      x.restore();
      xh.save(); xh.translate(lx + ox, ly + oy); xh.rotate(rot);
      xh.fillStyle = 'rgba(150,150,150,0.5)';
      xh.beginPath(); xh.ellipse(0, 0, ll, lw, 0, 0, 7); xh.fill(); xh.restore();
    });
  }
  // 6) twigs — short, straight, dark, with a lit top edge. A few per square metre.
  for (let i = 0; i < 120; i++) {
    const tx = r() * S, ty = r() * S, tl = (0.08 + r() * 0.18) * PM, rot = r() * 7, tw = 1.4 + r() * 2;
    const tc = `rgba(${40 + r() * 22 | 0},${31 + r() * 17 | 0},${22 + r() * 12 | 0},0.7)`;
    wrap((ox, oy) => {
      x.save(); x.translate(tx + ox, ty + oy); x.rotate(rot);
      x.strokeStyle = tc; x.lineWidth = tw;
      x.beginPath(); x.moveTo(-tl, 0); x.lineTo(tl, 0); x.stroke();
      x.strokeStyle = 'rgba(142,130,104,0.26)'; x.lineWidth = tw * 0.4;
      x.beginPath(); x.moveTo(-tl, -tw * 0.3); x.lineTo(tl, -tw * 0.3); x.stroke();
      x.restore();
      xh.save(); xh.translate(tx + ox, ty + oy); xh.rotate(rot);
      xh.strokeStyle = 'rgba(180,180,180,0.65)'; xh.lineWidth = tw;
      xh.beginPath(); xh.moveTo(-tl, 0); xh.lineTo(tl, 0); xh.stroke(); xh.restore();
    });
  }
  // 7) surface roots creeping through — long, tapering, proud ridges. This is the cue that
  //    says "giant trees grow here" more than anything else on the floor.
  for (let i = 0; i < 7; i++) {
    let px = r() * S, py = r() * S; const pts = [[px, py]];
    const dir = r() * 7, wob = (r() - 0.5) * 0.5;
    for (let k = 0; k < 8; k++) {
      const a = dir + wob * k + (r() - 0.5) * 0.35;
      px += Math.cos(a) * 0.5 * PM; py += Math.sin(a) * 0.5 * PM; pts.push([px, py]);
    }
    const rw = (0.04 + r() * 0.055) * PM;
    const body = `rgba(${66 + r() * 20 | 0},${52 + r() * 16 | 0},${36 + r() * 12 | 0},0.72)`;
    wrap((ox, oy) => {
      const stroke = (ctx, w, st) => {
        ctx.strokeStyle = st; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath();
        ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
        for (const p of pts) ctx.lineTo(p[0] + ox, p[1] + oy);
        ctx.stroke();
      };
      stroke(x, rw * 2.1, 'rgba(26,20,14,0.3)');                   // contact shadow
      stroke(x, rw * 1.5, body);
      stroke(x, rw * 0.55, 'rgba(138,118,90,0.26)');               // lit crest
      stroke(xh, rw * 1.8, 'rgba(120,120,120,0.5)');
      stroke(xh, rw * 1.2, 'rgba(200,200,200,0.8)');
      stroke(xr, rw * 1.4, 'rgba(150,150,150,0.55)');              // bark is smoother than humus
    });
  }
  // 8) damp hollows: darker, smoother, so they catch a low sun as sheen
  for (let i = 0; i < 10; i++) {
    const sx = r() * S, sy = r() * S, sr = (0.3 + r() * 0.9) * PM, a = 0.4 + r() * 0.3, a2 = 0.12 + r() * 0.12;
    const g = xr.createRadialGradient(sx, sy, 1, sx, sy, sr);
    g.addColorStop(0, `rgba(96,96,96,${a})`); g.addColorStop(1, 'rgba(96,96,96,0)');
    xr.fillStyle = g; xr.beginPath(); xr.arc(sx, sy, sr, 0, 7); xr.fill();
    const g2 = x.createRadialGradient(sx, sy, 1, sx, sy, sr);
    g2.addColorStop(0, `rgba(20,16,12,${a2})`); g2.addColorStop(1, 'rgba(20,16,12,0)');
    x.fillStyle = g2; x.beginPath(); x.arc(sx, sy, sr, 0, 7); x.fill();
  }
  const map = canvasTex(c), rough = canvasTexLinear(cRough);
  const normal = normalFromHeight(cH, 2.2);
  return { map, rough, normal };
}

/* Street surface: the asphalt / sidewalk / tow-path sheet the player actually walks on.
   Before this existed the streets were untextured flat quads tinted COL.road (~0.03 linear),
   which is why the floor read as a black void — the detailed makeGroundTexture() sheet is on
   the plane UNDERNEATH and is covered wherever a road is laid, i.e. everywhere you walk.
   Albedo stays LIGHT and neutral (same trick as makeBarkTexture) so addRoads' existing
   per-strip vertex tint still supplies asphalt-dark / sidewalk-pale / mossy-green — one
   texture set serves every surface type. Sampled with world-space UVs at SURF_TILE metres,
   so texel density is constant and never stretches with quad size.
   Normals are derived from a drawn height field via Sobel, so raking lamp/sun light finds
   real aggregate and crack relief instead of a flat sheet. */
const SURF_TILE = 2.0;                                   // metres per texture tile
function makeSurfaceTexture() {
  const S = 1024, r = mulberry32(9311);
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const cH = makeCanvas(S, S), xh = cH.getContext('2d');   // height field → normal map
  const cR = makeCanvas(S, S), xr = cR.getContext('2d');
  x.fillStyle = '#a8a49b'; x.fillRect(0, 0, S, S);         // light neutral; vertex colour tints it
  xh.fillStyle = '#808080'; xh.fillRect(0, 0, S, S);
  xr.fillStyle = '#d4d4d4'; xr.fillRect(0, 0, S, S);       // mostly rough
  const wrap = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); };

  // 1) broad tonal patches — laid/patched at different times, weathered unevenly
  for (let i = 0; i < 34; i++) {
    const px = r() * S, py = r() * S, pr = 70 + r() * 210, dark = r() < 0.5, a = 0.05 + r() * 0.09;
    const g = x.createRadialGradient(px, py, 1, px, py, pr);
    g.addColorStop(0, dark ? `rgba(70,68,62,${a})` : `rgba(198,194,184,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, pr, 0, 7); x.fill();
  }
  // 2) aggregate: the stone chips in the mix — the single biggest "this is asphalt" cue.
  //    Two grades, each with a lit top-left and a shadowed bottom-right in the height field.
  for (let i = 0; i < 9000; i++) {
    const gx = r() * S, gy = r() * S, gr = (r() < 0.75 ? 1.1 + r() * 1.9 : 3 + r() * 3.4);
    const lit = r() < 0.5, v = lit ? 190 + r() * 50 : 60 + r() * 55;
    x.fillStyle = `rgba(${v | 0},${(v * 0.99) | 0},${(v * 0.94) | 0},${0.16 + r() * 0.26})`;
    x.beginPath(); x.arc(gx, gy, gr, 0, 7); x.fill();
    const hv = 128 + (lit ? 40 + r() * 50 : -(30 + r() * 40));
    xh.fillStyle = `rgba(${hv | 0},${hv | 0},${hv | 0},0.75)`;
    xh.beginPath(); xh.arc(gx, gy, gr, 0, 7); xh.fill();
    if (r() < 0.3) { xr.fillStyle = `rgba(${150 + r() * 60 | 0},0,0,0.5)`; xr.beginPath(); xr.arc(gx, gy, gr, 0, 7); xr.fill(); }
  }
  // 3) tar seams: the snaking black repair lines, proud of the surface and glossy
  for (let i = 0; i < 9; i++) {
    let px = r() * S, py = r() * S; const pts = [[px, py]];
    for (let k = 0; k < 9; k++) { px += (r() - 0.5) * 150; py += (r() - 0.5) * 150; pts.push([px, py]); }
    wrap((ox, oy) => {
      x.strokeStyle = 'rgba(34,32,30,0.5)'; x.lineWidth = 5 + r() * 5;
      x.beginPath(); x.moveTo(pts[0][0] + ox, pts[0][1] + oy);
      for (const p of pts) x.lineTo(p[0] + ox, p[1] + oy);
      x.stroke();
      xh.strokeStyle = 'rgba(158,158,158,0.6)'; xh.lineWidth = 6; xh.beginPath();
      xh.moveTo(pts[0][0] + ox, pts[0][1] + oy);
      for (const p of pts) xh.lineTo(p[0] + ox, p[1] + oy);
      xh.stroke();
      xr.strokeStyle = 'rgba(70,70,70,0.7)'; xr.lineWidth = 6; xr.beginPath();   // tar is smoother → sheens
      xr.moveTo(pts[0][0] + ox, pts[0][1] + oy);
      for (const p of pts) xr.lineTo(p[0] + ox, p[1] + oy);
      xr.stroke();
    });
  }
  // 4) cracks: dark fissure with a pale spalled lip, recessed in height, with moss in the deeper ones
  for (let i = 0; i < 30; i++) {
    let px = r() * S, py = r() * S; const pts = [[px, py]];
    for (let k = 0; k < 7; k++) { px += (r() - 0.5) * 110; py += (r() - 0.5) * 110; pts.push([px, py]); }
    const mossy = r() < 0.45;
    wrap((ox, oy) => {
      const line = (ctx, w, st) => {
        ctx.strokeStyle = st; ctx.lineWidth = w; ctx.beginPath();
        ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
        for (const p of pts) ctx.lineTo(p[0] + ox, p[1] + oy);
        ctx.stroke();
      };
      line(x, 3.2, 'rgba(206,202,190,0.26)');           // spalled pale lip
      line(x, 1.5, 'rgba(26,25,22,0.62)');              // the fissure
      line(xh, 3, 'rgba(74,74,74,0.85)');               // recessed
      if (mossy) line(x, 2.6, 'rgba(78,104,52,0.4)');   // growth taking the crack
    });
  }
  // 5) wheel tracks: two polished bands where tyres wore the aggregate smooth
  for (const tb of [0.3, 0.68]) {
    const bx = tb * S, bw = 96;
    const g = xr.createLinearGradient(bx - bw, 0, bx + bw, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(96,96,96,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    xr.fillStyle = g; xr.fillRect(bx - bw, 0, bw * 2, S);
    const g2 = x.createLinearGradient(bx - bw, 0, bx + bw, 0);
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.5, 'rgba(58,56,52,0.14)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g2; x.fillRect(bx - bw, 0, bw * 2, S);
  }
  // 6) organic litter: grit, twigs and blown leaves collecting on a street under a forest
  for (let i = 0; i < 300; i++) {
    x.fillStyle = r() < 0.45 ? `rgba(112,86,40,${0.16 + r() * 0.26})` : `rgba(74,100,42,${0.14 + r() * 0.24})`;
    x.save(); x.translate(r() * S, r() * S); x.rotate(r() * 7);
    x.fillRect(0, 0, 4 + r() * 7, 2 + r() * 3); x.restore();
  }
  // 7) damp/oil sheen patches — smooth, so they catch the sky probe at low sun
  for (let i = 0; i < 12; i++) {
    const sx = r() * S, sy = r() * S, sr = 18 + r() * 52;
    const g = xr.createRadialGradient(sx, sy, 1, sx, sy, sr);
    g.addColorStop(0, `rgba(56,56,56,${0.4 + r() * 0.3})`); g.addColorStop(1, 'rgba(56,56,56,0)');
    xr.fillStyle = g; xr.beginPath(); xr.arc(sx, sy, sr, 0, 7); xr.fill();
    const g2 = x.createRadialGradient(sx, sy, 1, sx, sy, sr);
    g2.addColorStop(0, `rgba(42,42,40,${0.08 + r() * 0.1})`); g2.addColorStop(1, 'rgba(42,42,40,0)');
    x.fillStyle = g2; x.beginPath(); x.arc(sx, sy, sr, 0, 7); x.fill();
  }
  const map = canvasTex(c), rough = canvasTexLinear(cR);
  const normal = normalFromHeight(cH, 2.6);
  for (const t of [map, rough, normal]) t.repeat.set(1, 1);
  return { map, rough, normal };
}

/* Sobel a greyscale height canvas into a tangent-space normal map. Three.js only ships
   bumpMap (a screen-space derivative hack that softens and shimmers at grazing angles);
   a real normal map gives stable, directional relief — which is what separates "flat sheet
   with a pattern on it" from "a surface". Wraps at the edges so tiling stays seamless. */
function normalFromHeight(heightCanvas, strength) {
  const S = heightCanvas.width, H = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, S, H).data;
  const out = makeCanvas(S, H), oc = out.getContext('2d');
  const img = oc.createImageData(S, H), d = img.data;
  // Height is lifted into a flat Float64Array and the wrapped neighbour indices are computed
  // once per row/column. Same arithmetic, same doubles, byte-identical output — but this
  // helper now runs over ~5 megapixels of sheet at load, and the previous closure did two
  // modulos and a divide EIGHT times per texel, which alone cost most of a second.
  const h = new Float64Array(S * H);
  for (let i = 0, n = S * H; i < n; i++) h[i] = src[i * 4] / 255;
  const xm = new Int32Array(S), xp = new Int32Array(S);
  for (let px = 0; px < S; px++) { xm[px] = (px + S - 1) % S; xp[px] = (px + 1) % S; }
  for (let py = 0; py < H; py++) {
    const r0 = ((py + H - 1) % H) * S, r1 = py * S, r2 = ((py + 1) % H) * S;
    for (let px = 0; px < S; px++) {
      const a = xm[px], c2 = xp[px];
      // Sobel gradients
      const tl = h[r0 + a], t = h[r0 + px], tr = h[r0 + c2];
      const l = h[r1 + a], rr = h[r1 + c2];
      const bl = h[r2 + a], b = h[r2 + px], br = h[r2 + c2];
      const gx = (tr + 2 * rr + br) - (tl + 2 * l + bl);
      const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -gx * strength, ny = -gy * strength, nz = 1;
      const il = 1 / Math.hypot(nx, ny, nz); nx *= il; ny *= il; nz *= il;
      const o = (r1 + px) * 4;
      d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
    }
  }
  oc.putImageData(img, 0, 0);
  return canvasTexLinear(out);   // normal maps are vectors, never sRGB-decoded
}

/* Blur a height canvas IN PLACE without ever letting the kernel see an edge: the sheet is
   first laid out 3×3-wrapped on a padded canvas, so the blur reads real neighbours across
   the tile border and the sheet stays seamless. Used to round hard drawn silhouettes into
   shoulders before the Sobel — a 1-texel cliff turns into a rim of extreme normals, which
   reads as an ink outline rather than as a curved surface. */
function wrapBlur(cv, px) {
  const W = cv.width, H = cv.height, M = Math.ceil(px * 3) + 2, cx = cv.getContext('2d');
  const t = makeCanvas(W + 2 * M, H + 2 * M), tt = t.getContext('2d');
  for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) tt.drawImage(cv, ox + M, oy + M);
  cx.filter = `blur(${px}px)`; cx.drawImage(t, -M, -M); cx.filter = 'none';
}

/* Bark ------------------------------------------------------------------------------
   Drawn at TRUE WORLD SCALE. B.bark is a Batch(BARK_TILE), so one sheet always covers
   BARK_TILE metres of trunk circumference (and 2×BARK_TILE of height) whatever the tree's
   size — ≈233 px per metre, 1 px ≈ 4 mm. Every feature below is sized in metres via PM.
   What makes bark read as bark instead of a patterned cylinder, by viewing range:
     · 20 m — RIDGE PLATES: the 15-41 cm bands between furrows, DOMED in the height field so
       a low sun or the flashlight finds a lit crest and a shadowed far flank;
     ·  5 m — FURROWS: deep, broken, wandering vertical fissures separating those plates;
     ·  1 m — fibrous vertical grain, horizontal flake breaks, pores and lichen crusts.
   Furrows wander on INTEGER harmonics of the sheet height, so a furrow leaves the top edge
   exactly where it enters the bottom and the sheet tiles in v with no seam band.
   Albedo stays LIGHT — the per-tree COL.bark vertex tint (+0.18 jitter) still supplies the
   brown, exactly as before. Relief is a drawn height canvas run through normalFromHeight():
   the old bumpMap is a screen-space-derivative hack that softens and shimmers at precisely
   the grazing angles a flashlight and a low sun make, which is when bark should look best. */
const BARK_TILE = 2.2;              // metres per sheet in u — matches new Batch(2.2) for B.bark
function makeBarkTexture() {
  const W = 512, H = 1024, r = mulberry32(4187);
  const PM = W / BARK_TILE;                                  // ≈233 px per metre
  const c = makeCanvas(W, H), x = c.getContext('2d');
  const cH = makeCanvas(W, H), xh = cH.getContext('2d');     // height field → normal map
  const cR = makeCanvas(W, H), xr = cR.getContext('2d');
  // Base is LIGHT on purpose (the per-tree COL.bark vertex tint supplies the brown) and is
  // set so the finished sheet's mean lands where the old one did — every layer below only
  // subtracts, so starting at the old base would have shipped trunks a fifth darker.
  x.fillStyle = '#f2ebdc'; x.fillRect(0, 0, W, H);
  xh.fillStyle = '#5a5a5a'; xh.fillRect(0, 0, W, H);         // dark = furrow floor; plates rise
  xr.fillStyle = '#dcdcdc'; xr.fillRect(0, 0, W, H);
  const WX = [-W, 0, W], WY = [-H, 0, H];

  // Two generations of fissure, which is what real bark has and what a single comb of
  // cracks never gets: MAJOR furrows 17-40 cm apart bounding the plates, and MINOR
  // hairlines 4-11 cm apart splitting each plate's face. Both wander on integer harmonics.
  const mkLane = (p, major) => ({
    sx: p, major, w: (major ? 0.016 + r() * 0.026 : 0.005 + r() * 0.009) * PM, deep: major && r() < 0.45,
    a1: (0.008 + r() * 0.03) * PM, p1: 1 + (r() * 2 | 0), ph1: r() * 7,
    a2: (0.003 + r() * 0.012) * PM, p2: 3 + (r() * 3 | 0), ph2: r() * 7,
    // Run envelope: how deep the furrow is at each height. Integer harmonics again (v must
    // tile). Each pass is gated at its own slice of this envelope — a wide shallow pass at a
    // low threshold runs almost the whole height, the narrow deep pass only survives where
    // the envelope peaks — so a fissure TAPERS in and out instead of being a dash. A plain
    // setLineDash gave a chain of identical rounded capsules marching up the trunk.
    e1: 2 + (r() * 3 | 0), eph1: r() * 7, e2: 3 + (r() * 4 | 0), eph2: r() * 7,
    thr: (major ? 0.16 : 0.3) + r() * 0.2
  });
  const lanes = [], minor = [];
  for (let p = r() * 0.2 * PM; p < W - 0.05 * PM; p += (0.17 + r() * 0.23) * PM) lanes.push(mkLane(p, 1));
  for (let p = r() * 0.05 * PM; p < W - 0.01 * PM; p += (0.04 + r() * 0.07) * PM) minor.push(mkLane(p, 0));
  const N = lanes.length;
  const LX = (f, yy) => f.sx + Math.sin(yy / H * f.p1 * 6.283185 + f.ph1) * f.a1
    + Math.sin(yy / H * f.p2 * 6.283185 + f.ph2) * f.a2;
  const LE = (f, yy) => 0.5 + 0.5 * (Math.sin(yy / H * f.e1 * 6.283185 + f.eph1) * 0.66
    + Math.sin(yy / H * f.e2 * 6.283185 + f.eph2) * 0.34);
  // a lane runs the full height, so only u needs the 3× wrap replay. `g` (0..1) gates the
  // pass on the run envelope: 0 draws the whole height, higher values only the deepest runs.
  const laneStroke = (ctx, f, style, lw, dx, blur, g) => {
    ctx.save();
    if (blur) ctx.filter = `blur(${blur}px)`;
    ctx.strokeStyle = style; ctx.lineWidth = Math.max(0.7, lw); ctx.lineCap = 'round';
    const reach = f.a1 + f.a2 + lw + Math.abs(dx || 0) + (blur || 0) * 3;
    for (const ox of WX) {
      // only the lanes near a vertical edge need their ±W wrap copies; a filtered stroke
      // costs a full compositing layer, so skipping the off-canvas ones is most of the sheet
      if (f.sx + ox < -reach || f.sx + ox > W + reach) continue;
      ctx.beginPath();
      let pen = false;
      for (let yy = -12; yy <= H + 12; yy += 6) {
        if (g && LE(f, yy) < f.thr * g) { pen = false; continue; }
        const px = LX(f, yy) + ox + (dx || 0);
        if (pen) ctx.lineTo(px, yy); else ctx.moveTo(px, yy);
        pen = true;
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  // 0) metre-scale tonal mottle — weathering, old damp, sun-bleach. Everything else on this
  //    sheet is centimetre-scale and mips away by 20 m; this is what stops a distant trunk
  //    from flattening into one uniform brown pole.
  for (let i = 0; i < 26; i++) {
    const bx = r() * W, by = r() * H, br = (0.25 + r() * 1.05) * PM, ely = 1.3 + r() * 1.8;
    const dark = r() < 0.5, a = 0.07 + r() * 0.13;
    for (const ox of WX) for (const oy of WY) {
      if (Math.abs(bx + ox - W / 2) > W / 2 + br * ely || Math.abs(by + oy - H / 2) > H / 2 + br * ely) continue;
      x.save(); x.translate(bx + ox, by + oy); x.scale(1, ely);
      const g = x.createRadialGradient(0, 0, 1, 0, 0, br);
      g.addColorStop(0, dark ? `rgba(92,76,54,${a})` : `rgba(248,242,228,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, br, 0, 7); x.fill(); x.restore();
    }
  }

  // 1) ridge plates — one gradient-filled polygon per gap between neighbouring furrows.
  //    The cross-plate gradient is the dome; the albedo copy gives each plate its own tone
  //    (bark is never one colour — plates weather at different rates).
  for (let i = 0; i < N; i++) {
    const A = lanes[i], Bp = lanes[(i + 1) % N], wb = (i + 1 === N) ? W : 0;
    const crest = 196 + r() * 46, tone = 0.05 + r() * 0.11, warm = r() < 0.55;
    const l0 = A.sx, r0 = Bp.sx + wb;
    for (const ox of WX) {
      if (r0 + ox < -40 || l0 + ox > W + 40) continue;   // skip wrap copies that miss the sheet
      const path = (ctx) => {
        ctx.beginPath();
        for (let yy = -12; yy <= H + 12; yy += 9) ctx.lineTo(LX(A, yy) + ox, yy);
        for (let yy = H + 12; yy >= -12; yy -= 9) ctx.lineTo(LX(Bp, yy) + ox + wb, yy);
        ctx.closePath();
      };
      const cs = `rgb(${crest | 0},${crest | 0},${crest | 0})`;
      const gh = xh.createLinearGradient(l0 + ox, 0, r0 + ox, 0);
      gh.addColorStop(0, '#6e6e6e'); gh.addColorStop(0.2, cs); gh.addColorStop(0.8, cs); gh.addColorStop(1, '#6e6e6e');
      xh.save(); xh.filter = `blur(${(0.012 * PM) | 0}px)`; xh.fillStyle = gh; path(xh); xh.fill(); xh.restore();
      const ga = x.createLinearGradient(l0 + ox, 0, r0 + ox, 0);
      const mid = warm ? `rgba(253,249,240,${tone})` : `rgba(126,106,80,${tone})`;
      ga.addColorStop(0, 'rgba(0,0,0,0)'); ga.addColorStop(0.5, mid); ga.addColorStop(1, 'rgba(0,0,0,0)');
      x.save(); x.filter = `blur(${(0.02 * PM) | 0}px)`; x.fillStyle = ga; path(x); x.fill(); x.restore();
    }
  }

  // 2) furrows — cut through the plates. Wide soft shoulder first, then the firm dark core,
  //    then a lit lip on one side (painted relief for the face a light never reaches).
  //    Minor hairlines get the same treatment at a quarter of the depth.
  for (const f of lanes) {
    const dw = f.deep ? 1.6 : 1;
    laneStroke(xh, f, 'rgba(104,104,104,0.8)', f.w * 2.4 * dw, 0, 0.014 * PM, 0.5);
    laneStroke(xh, f, `rgb(${f.deep ? 32 : 56},${f.deep ? 32 : 56},${f.deep ? 32 : 56})`, f.w * dw, 0, 0.006 * PM, 1);
    laneStroke(xh, f, `rgb(${f.deep ? 12 : 34},${f.deep ? 12 : 34},${f.deep ? 12 : 34})`, f.w * 0.5 * dw, 0, 0.004 * PM, 1.7);
    laneStroke(x, f, `rgba(48,38,25,${f.deep ? 0.15 : 0.1})`, f.w * 2.4 * dw, 0, 0.016 * PM, 0.5);
    laneStroke(x, f, `rgba(24,18,11,${f.deep ? 0.34 : 0.22})`, f.w * dw, 0, 0.005 * PM, 1);
    laneStroke(x, f, `rgba(16,11,6,${f.deep ? 0.42 : 0.3})`, f.w * 0.5 * dw, 0, 0.004 * PM, 1.7);
    laneStroke(x, f, 'rgba(255,250,238,0.2)', f.w * 0.5, -(f.w * dw * 0.7 + 0.008 * PM), 0.006 * PM, 1);
    laneStroke(xr, f, 'rgba(255,255,255,0.45)', f.w * 2 * dw, 0, 0.02 * PM, 0.5);   // furrows hold damp
  }
  for (const f of minor) {
    laneStroke(xh, f, 'rgba(126,126,126,0.7)', f.w * 3.2, 0, 0.008 * PM, 1);
    laneStroke(x, f, 'rgba(38,29,19,0.18)', f.w * 1.6, 0, 0.004 * PM, 1);
    laneStroke(x, f, 'rgba(255,250,238,0.11)', f.w, -(f.w * 1.5), 0.004 * PM, 1);
  }

  // 3+4) grain and flake breaks are drawn CRISP onto two transparent scratch sheets and
  // composited once through a blur, not stroked 2000× with ctx.filter set: a filtered draw
  // costs a whole compositing layer in the 2d backend, so the per-stroke version spent half
  // a second here on its own. The result is the same soft mark either way.
  const cGa = makeCanvas(W, H), ga2 = cGa.getContext('2d');
  const cGh = makeCanvas(W, H), gh2 = cGh.getContext('2d');
  // 3) fibrous vertical grain — 3-70 cm slivers along the plates. This is the 1 m read.
  //    Kept faint and blurred in the height field: crisp full-strength slivers read as
  //    scratches gouged into sanded wood rather than as a fibrous surface.
  for (let i = 0; i < 2000; i++) {
    const gx = r() * W, gy = r() * H, gl = (0.03 + r() * 0.28) * PM, gw = (0.003 + r() * 0.008) * PM;
    const dark = r() < 0.55, a = 0.05 + r() * 0.1, tilt = (r() - 0.5) * 0.07 * PM;
    const hv = dark ? 108 + r() * 20 : 158 + r() * 26;
    const sa = dark ? `rgba(102,84,58,${a})` : `rgba(255,251,242,${a})`;
    const sh = `rgba(${hv | 0},${hv | 0},${hv | 0},${Math.min(1, a * 1.1)})`;
    for (const ox of WX) for (const oy of WY) {
      if (gx + ox < -8 || gx + ox > W + 8 || gy + oy < -gl || gy + oy > H) continue;
      for (const q of [[ga2, sa], [gh2, sh]]) {
        q[0].strokeStyle = q[1]; q[0].lineWidth = gw; q[0].lineCap = 'round';
        q[0].beginPath(); q[0].moveTo(gx + ox, gy + oy); q[0].lineTo(gx + ox + tilt, gy + oy + gl); q[0].stroke();
      }
    }
  }
  // 4) horizontal flake breaks — steps where a plate has lifted and split. Blurred and
  //    length-varied on purpose: crisp, same-length, same-alpha ticks scatter across the
  //    trunk like hyphens set in a monospace font, which is the giveaway of a stamped mark.
  for (let i = 0; i < 300; i++) {
    const fx0 = r() * W, fy0 = r() * H, fl = (0.02 + r() * r() * 0.34) * PM, dy = (r() - 0.5) * 0.03 * PM;
    const a = 0.07 + r() * 0.13, lw = (0.004 + r() * 0.009) * PM;
    for (const ox of WX) {
      if (fx0 + ox < -fl || fx0 + ox > W) continue;
      ga2.strokeStyle = `rgba(62,48,32,${a})`; ga2.lineWidth = lw; ga2.lineCap = 'round';
      ga2.beginPath(); ga2.moveTo(fx0 + ox, fy0); ga2.lineTo(fx0 + ox + fl, fy0 + dy); ga2.stroke();
      ga2.strokeStyle = `rgba(255,250,238,${a * 0.5})`; ga2.lineWidth = lw * 0.7;
      ga2.beginPath(); ga2.moveTo(fx0 + ox, fy0 + lw); ga2.lineTo(fx0 + ox + fl, fy0 + dy + lw); ga2.stroke();
      gh2.strokeStyle = `rgba(80,80,80,${Math.min(1, a * 2.2)})`; gh2.lineWidth = lw; gh2.lineCap = 'round';
      gh2.beginPath(); gh2.moveTo(fx0 + ox, fy0); gh2.lineTo(fx0 + ox + fl, fy0 + dy); gh2.stroke();
    }
  }
  x.save(); x.filter = 'blur(1px)'; x.drawImage(cGa, 0, 0); x.restore();
  xh.save(); xh.filter = 'blur(1.4px)'; xh.drawImage(cGh, 0, 0); xh.restore();

  // 5) lichen crusts — 2-11 cm pale grey-green scabs on the plate faces, slightly proud and
  //    rougher than the wood. Reads as age at any distance and breaks the vertical monotony.
  for (let i = 0; i < 130; i++) {
    const cx = r() * W, cy = r() * H, cr = (0.02 + r() * 0.09) * PM;
    const hue = 58 + r() * 46, sat = 6 + r() * 18, lig = 58 + r() * 24, a = 0.07 + r() * 0.15;
    const dots = [];
    for (let k = 0; k < 9; k++) dots.push([(r() - 0.5) * cr * 1.7, (r() - 0.5) * cr * 1.7, cr * (0.14 + r() * 0.26), 0.06 + r() * 0.13]);
    for (const ox of WX) for (const oy of WY) {
      if (cx + ox < -cr * 2 || cx + ox > W + cr * 2 || cy + oy < -cr * 2 || cy + oy > H + cr * 2) continue;
      const g = x.createRadialGradient(cx + ox, cy + oy, 1, cx + ox, cy + oy, cr);
      g.addColorStop(0, `hsla(${hue},${sat}%,${lig}%,${a})`); g.addColorStop(1, `hsla(${hue},${sat}%,${lig}%,0)`);
      x.fillStyle = g; x.beginPath(); x.arc(cx + ox, cy + oy, cr, 0, 7); x.fill();
      for (const d of dots) {
        x.fillStyle = `hsla(${hue},${sat}%,${lig + 10}%,${d[3]})`;
        x.beginPath(); x.arc(cx + ox + d[0], cy + oy + d[1], d[2], 0, 7); x.fill();
        xh.fillStyle = `rgba(178,178,178,${d[3] * 0.7})`;
        xh.beginPath(); xh.arc(cx + ox + d[0], cy + oy + d[1], d[2], 0, 7); xh.fill();
      }
      xr.fillStyle = `rgba(255,255,255,${a})`; xr.beginPath(); xr.arc(cx + ox, cy + oy, cr * 0.8, 0, 7); xr.fill();
    }
  }

  // 6) lenticels — the sub-centimetre pores. ELONGATED along the grain, not round: round
  //    dots at any real amplitude turn the trunk into bubble wrap under a raking light.
  //    Doubles as dither for the height field, which keeps 8-bit quantisation of the broad
  //    plate gradients from banding into contour rings.
  for (let i = 0; i < 7000; i++) {
    const sx = r() * W, sy = r() * H, rx = 0.5 + r() * 0.9, ry = rx * (1.5 + r() * 3);
    const dark = r() < 0.5, a = 0.03 + r() * 0.055;
    x.fillStyle = dark ? `rgba(74,60,40,${a})` : `rgba(255,252,246,${a})`;
    x.beginPath(); x.ellipse(sx, sy, rx, ry, 0, 0, 7); x.fill();
    const hv = dark ? 116 + r() * 14 : 146 + r() * 16;
    xh.fillStyle = `rgba(${hv | 0},${hv | 0},${hv | 0},0.28)`;
    xh.beginPath(); xh.ellipse(sx, sy, rx, ry, 0, 0, 7); xh.fill();
  }

  const map = canvasTex(c), rough = canvasTexLinear(cR);
  const normal = normalFromHeight(cH, 2.4);
  // no repeat here — the bark Batch bakes world-scale UV repeats per piece (Batch.uvWorld)
  return { map, normal, rough };
}

/* Canopy leaves — the signature surface of the game, so it gets the most work.
   · shape: a real lanceolate blade in the ALPHA (bezier margins, a petiole, pinnate
     venation) instead of the old blob, so the silhouette against the sky reads as foliage;
   · depth: three layers (deep shade → mid → lit) placed on jittered grids, with ~6% of the
     cells dropped so genuine sky gaps survive between the leaves — pure scatter instead
     leaves metre-wide bald patches that read as holes in the crown;
   · relief: a drawn height field → normal map, so each leaf shades separately. Without it a
     canopy blob shades as one smooth sphere with a picture painted on it, which is exactly
     the "flat green card" look.
   Scale: the sheet repeats LEAF_REPEAT times around a blob. Blobs are 4-8 m across, so at
   repeat 1 (the old sheet) one leaf was nearly four metres long; at 3 they land near
   0.4-0.7 m — still big, but these are engineered megaflora.
   texLeaf stays a bare THREE.Texture (leafDepth shares it, and its sibling vine/grass sheets
   are scrolled by entities.js through .offset), so the normal map rides along on
   .userData.normal and SHARES the offset/repeat Vector2 instances — sharing the instance is
   the only way a wind scroll can never desync albedo from relief. */
const LEAF_REPEAT = 2;
function makeLeafTexture() {
  const S = 1024, r = mulberry32(5150);
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const cH = makeCanvas(S, S), xh = cH.getContext('2d');
  x.clearRect(0, 0, S, S);
  xh.fillStyle = '#303030'; xh.fillRect(0, 0, S, S);        // gaps sit low; leaves are drawn proud

  // lanceolate blade: base at the origin, tip at +len, two cubics for the margins
  const blade = (ctx, len, wid, asym) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.13, -wid * (1 + asym), len * 0.7, -wid * 0.84, len, 0);
    ctx.bezierCurveTo(len * 0.7, wid * 0.84, len * 0.13, wid * (1 - asym), 0, 0);
    ctx.closePath();
  };
  const veins = (ctx, len, wid, style, lw) => {
    ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(len * 0.02, 0); ctx.lineTo(len * 0.95, 0); ctx.stroke();
    ctx.lineWidth = lw * 0.62;
    for (let k = 1; k <= 5; k++) {
      const t = k / 6, bx = len * t * 0.92, sp = wid * (1 - t * 0.75) * 0.82;
      ctx.beginPath();
      ctx.moveTo(bx, 0); ctx.quadraticCurveTo(bx + len * 0.09, -sp * 0.66, bx + len * 0.15, -sp);
      ctx.moveTo(bx, 0); ctx.quadraticCurveTo(bx + len * 0.09, sp * 0.66, bx + len * 0.15, sp);
      ctx.stroke();
    }
  };
  // Every random a stamp uses is drawn by the caller BEFORE this runs — the 9 wrap copies
  // must be byte-identical or the sheet seams.
  const stamp = (px, py, rot, len, wid, asym, hue, sat, lig, lit, hh) => {
    const rad = len * 1.3;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      if (px + ox < -rad || px + ox > S + rad || py + oy < -rad || py + oy > S + rad) continue;
      x.save(); x.translate(px + ox, py + oy); x.rotate(rot);
      x.strokeStyle = `hsl(${hue - 10},${Math.max(10, sat - 12)}%,${Math.max(8, lig - 6)}%)`;
      x.lineWidth = Math.max(1, wid * 0.1); x.lineCap = 'round';
      x.beginPath(); x.moveTo(-len * 0.19, 0); x.lineTo(0, 0); x.stroke();       // petiole
      const g = x.createLinearGradient(0, -wid, 0, wid);                          // the blade curls
      g.addColorStop(0, `hsl(${hue},${sat}%,${Math.min(80, lig + 10)}%)`);
      g.addColorStop(0.56, `hsl(${hue},${sat}%,${lig}%)`);
      g.addColorStop(1, `hsl(${hue},${sat + 6}%,${Math.max(5, lig - 14)}%)`);
      x.fillStyle = g; blade(x, len, wid, asym); x.fill();
      if (lit) {
        veins(x, len, wid, `hsla(${hue},${sat + 12}%,${Math.max(5, lig - 17)}%,0.7)`, Math.max(0.9, wid * 0.07));
        x.globalAlpha = 0.2;                                                      // waxy sheen band
        x.fillStyle = `hsl(${hue - 8},${Math.max(8, sat - 16)}%,${Math.min(90, lig + 28)}%)`;
        x.save(); x.scale(1, 0.4); x.translate(0, -wid * 0.9); blade(x, len * 0.88, wid, asym); x.fill(); x.restore();
        x.globalAlpha = 1;
      }
      x.restore();
      xh.save(); xh.translate(px + ox, py + oy); xh.rotate(rot);                  // domed along the midrib
      const lo = Math.max(0, hh - 52) | 0;
      const gh = xh.createLinearGradient(0, -wid, 0, wid);
      gh.addColorStop(0, `rgb(${lo},${lo},${lo})`);
      gh.addColorStop(0.5, `rgb(${hh | 0},${hh | 0},${hh | 0})`);
      gh.addColorStop(1, `rgb(${lo},${lo},${lo})`);
      xh.fillStyle = gh; blade(xh, len, wid, asym); xh.fill();
      xh.restore();
    }
  };

  const twig = (px, py, ang, len, style, lw) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const x0 = px + ox, y0 = py + oy;
      if (x0 < -len || x0 > S + len || y0 < -len || y0 > S + len) continue;
      x.strokeStyle = style; x.lineWidth = lw; x.lineCap = 'round';
      x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len); x.stroke();
    }
  };
  // Foliage grows in SPRAYS off a twig, and that clustering is most of what separates a
  // canopy from confetti: an even scatter of leaves gives a uniform speckle with no
  // structure at any scale, whatever the leaf shape.
  const LAYERS = [
    { g: 8, lig: [16, 13], sat: [20, 16], hh: [98, 20], lit: 0, len: [68, 34], tw: [165, 85] },
    { g: 9, lig: [25, 15], sat: [24, 18], hh: [140, 24], lit: 1, len: [60, 34], tw: [155, 85] },
    { g: 10, lig: [34, 18], sat: [27, 20], hh: [182, 32], lit: 1, len: [54, 32], tw: [145, 80] }
  ];
  for (const L of LAYERS) {
    const cell = S / L.g;
    for (let gy = 0; gy < L.g; gy++) for (let gx = 0; gx < L.g; gx++) {
      const keep = r(), jx = r(), jy = r(), ang = r() * 7;
      const tl = L.tw[0] + r() * L.tw[1], n = 5 + (r() * 5 | 0);
      const dry = r() < 0.1;
      const hue = dry ? 44 + r() * 20 : 78 + r() * 34;
      const sat = (dry ? 34 : L.sat[0]) + r() * L.sat[1];
      const lig0 = (dry ? L.lig[0] + 12 : L.lig[0]);
      const leaves = [];
      for (let k = 0; k < n; k++) {
        const t = 0.1 + (k / n) * 0.9, taper = 1 - t * 0.35, side = k & 1 ? 1 : -1;
        leaves.push({
          t, side,
          len: (L.len[0] + r() * L.len[1]) * taper,
          widF: 0.24 + r() * 0.12, asym: (r() - 0.5) * 0.5,
          spread: side * (0.5 + r() * 0.7), jit: (r() - 0.5) * 0.5,
          lig: lig0 + r() * L.lig[1], hh: L.hh[0] + r() * L.hh[1]
        });
      }
      if (keep < 0.05) continue;
      const px = (gx + 0.5 + (jx - 0.5) * 1.5) * cell, py = (gy + 0.5 + (jy - 0.5) * 1.5) * cell;
      twig(px, py, ang, tl, `hsl(${hue - 14},${Math.max(10, sat - 18)}%,${Math.max(7, lig0 - 4)}%)`, 2.2);
      for (const lf of leaves)
        stamp(px + Math.cos(ang) * tl * lf.t, py + Math.sin(ang) * tl * lf.t,
          ang + lf.spread + lf.jit, lf.len, lf.len * lf.widF, lf.asym,
          hue, sat, lf.lig, L.lit, lf.hh);
    }
  }

  wrapBlur(cH, 2);                                          // leaf edges become shoulders, not cliffs
  const map = canvasTex(c);
  const normal = normalFromHeight(cH, 1.6);
  map.repeat.set(LEAF_REPEAT, LEAF_REPEAT);
  normal.offset = map.offset; normal.repeat = map.repeat;   // shared instances can never desync
  map.userData.normal = normal;
  return map;
}

/* Vines: growth clinging to a wall, not paint on it. Real ivy silhouettes in the alpha (a
   heart base and three shallow lobes), a woody stem carrying its own contact shadow, and a
   height field → normal map so every leaf has an edge and a curl for the light to find.
   The quads are [0,0,1,vRep] with vRep ≈ height/2 m, so a sheet is roughly 0.9 m wide by 2 m
   tall and leaves land at 6-13 cm. Stems wander on INTEGER harmonics, so a strip repeated
   ten times up a facade never shows the same wiggle at the same height twice.
   Returns a bare Texture — entities.js scrolls texVine.offset for the wind shimmer. */
function makeVineTexture() {
  const W = 512, H = 1024, r = mulberry32(909);
  const c = makeCanvas(W, H), x = c.getContext('2d');
  const cH = makeCanvas(W, H), xh = cH.getContext('2d');
  x.clearRect(0, 0, W, H);
  xh.fillStyle = '#2c2c2c'; xh.fillRect(0, 0, W, H);
  const WY = [-H, 0, H];
  // ivy leaf, drawn tip-up in local coords: heart base, three shallow lobes
  const ivy = (ctx, s) => {
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.42, -s * 0.72, s * 0.5, -s * 0.5, s * 0.56, -s * 0.2);
    ctx.bezierCurveTo(s * 0.98, -s * 0.42, s * 1.06, s * 0.16, s * 0.62, s * 0.4);
    ctx.bezierCurveTo(s * 0.34, s * 0.54, s * 0.16, s * 0.5, 0, s * 0.42);
    ctx.bezierCurveTo(-s * 0.16, s * 0.5, -s * 0.34, s * 0.54, -s * 0.62, s * 0.4);
    ctx.bezierCurveTo(-s * 1.06, s * 0.16, -s * 0.98, -s * 0.42, -s * 0.56, -s * 0.2);
    ctx.bezierCurveTo(-s * 0.5, -s * 0.5, -s * 0.42, -s * 0.72, 0, -s);
    ctx.closePath();
  };
  for (let s = 0; s < 7; s++) {
    const bx = 18 + s * 70 + r() * 22, amp = 10 + r() * 22, ph = r() * 7, hz = 1 + (r() * 2 | 0);
    const stemW = 5 + r() * 5;
    const stemCol = `rgba(${44 + r() * 24 | 0},${58 + r() * 22 | 0},${34 + r() * 14 | 0},0.96)`;
    const sx = (yy) => bx + Math.sin(yy / H * hz * 6.283185 + ph) * amp;
    const stemPath = (ctx, dx) => {
      ctx.beginPath();
      for (let yy = -12; yy <= H + 12; yy += 10) ctx.lineTo(sx(yy) + (dx || 0), yy);
    };
    x.lineCap = 'round';
    x.strokeStyle = 'rgba(14,18,10,0.5)'; x.lineWidth = stemW * 1.9;              // contact shadow
    stemPath(x, stemW * 0.55); x.stroke();
    x.strokeStyle = stemCol; x.lineWidth = stemW; stemPath(x, 0); x.stroke();
    x.strokeStyle = 'rgba(150,160,120,0.3)'; x.lineWidth = stemW * 0.3;           // lit side of the stem
    stemPath(x, -stemW * 0.3); x.stroke();
    xh.lineCap = 'round';
    xh.strokeStyle = '#8c8c8c'; xh.lineWidth = stemW * 1.5; stemPath(xh, 0); xh.stroke();
    xh.strokeStyle = '#b4b4b4'; xh.lineWidth = stemW * 0.7; stemPath(xh, 0); xh.stroke();
    for (let t = 0; t < 7; t++) {                                                 // tendrils gripping the wall
      const ty = r() * H, dir = r() < 0.5 ? -1 : 1, tl = 14 + r() * 34, drop = 10 + r() * 16;
      const tc = `rgba(${58 + r() * 26 | 0},${80 + r() * 30 | 0},${44 + r() * 18 | 0},0.85)`;
      for (const oy of WY) {
        if (ty + oy < -60 || ty + oy > H + 60) continue;
        x.strokeStyle = tc; x.lineWidth = 1.6; x.beginPath();
        x.moveTo(sx(ty), ty + oy);
        x.quadraticCurveTo(sx(ty) + dir * tl * 0.7, ty + oy + 5, sx(ty) + dir * tl, ty + oy + drop);
        x.stroke();
      }
    }
    let yy = 6 + r() * 20, side = 1;                                              // leaves alternate sides
    while (yy < H) {
      const ls = 14 + r() * 24, rot = (r() - 0.5) * 1.5 + (side > 0 ? 2.6 : -2.6);
      const off = side * (6 + r() * 12);
      // age variation: most green, some yellowing, a few brown-dead still hanging on. A
      // strand of identically-coloured leaves reads as printed wallpaper, not as growth.
      const age = r();
      const hue = age > 0.9 ? 28 + r() * 16 : age > 0.76 ? 52 + r() * 14 : 82 + (r() - 0.5) * 40;
      const sat = age > 0.76 ? 30 + r() * 22 : 26 + r() * 26;
      const lig = age > 0.76 ? 26 + r() * 20 : 14 + r() * 26;
      const hh = 150 + r() * 60, lo = Math.max(0, hh - 62) | 0;
      const lxp = sx(yy) + off;
      for (const oy of WY) {
        if (yy + oy < -ls * 2 || yy + oy > H + ls * 2) continue;
        x.save(); x.translate(lxp, yy + oy); x.rotate(rot);
        const g = x.createLinearGradient(0, -ls, 0, ls);
        g.addColorStop(0, `hsl(${hue},${sat}%,${Math.min(74, lig + 13)}%)`);
        g.addColorStop(1, `hsl(${hue},${sat + 6}%,${Math.max(6, lig - 9)}%)`);
        x.fillStyle = g; ivy(x, ls); x.fill();
        x.strokeStyle = `hsla(${hue},${sat}%,${Math.min(84, lig + 30)}%,0.55)`;
        x.lineWidth = 1.1; x.lineCap = 'round'; x.beginPath();                     // palmate veins
        for (const a of [-1.05, -0.5, 0, 0.5, 1.05]) {
          x.moveTo(0, ls * 0.36);
          x.lineTo(Math.sin(a) * ls * 0.72, ls * 0.36 - Math.cos(a) * ls * 1.1);
        }
        x.stroke(); x.restore();
        xh.save(); xh.translate(lxp, yy + oy); xh.rotate(rot);
        const gh = xh.createLinearGradient(0, -ls, 0, ls);
        gh.addColorStop(0, `rgb(${hh | 0},${hh | 0},${hh | 0})`);
        gh.addColorStop(1, `rgb(${lo},${lo},${lo})`);
        xh.fillStyle = gh; ivy(xh, ls); xh.fill();
        xh.restore();
      }
      yy += 16 + r() * 22; side = -side;
    }
  }
  wrapBlur(cH, 2);
  const map = canvasTex(c);
  const normal = normalFromHeight(cH, 1.7);
  normal.offset = map.offset; normal.repeat = map.repeat;   // entities.js scrolls .offset for wind
  map.userData.normal = normal;
  return map;
}

/* Grass tufts: two crossed quads per tuft, one full sheet each, tuft ≈ 0.5-0.9 m — so the
   sheet is about that wide and a blade wants to be ~6 mm. The old sheet packed 100 blades of
   5-12 px into 256 px, which fused into a solid green wedge. Now: fewer, finer, properly
   tapered blades in three depth layers, a dark root shadow along the bottom, dry blades and
   seed heads mixed in, and a broad tonal drift so the sheet isn't one flat green.
   Blades wrap in u so the wind scroll (entities.js sets texGrass.offset.x) can never slide a
   cut edge into view. Returns a bare Texture for the same reason. */
function makeGrassTexture() {
  const S = 512, r = mulberry32(303);
  const c = makeCanvas(S, S), x = c.getContext('2d');
  x.clearRect(0, 0, S, S);
  const LAYERS = [
    { n: 46, lig: [20, 13], sat: [30, 16], h: [0.42, 0.34], w: [3.5, 4.5] },
    { n: 40, lig: [30, 15], sat: [36, 20], h: [0.55, 0.36], w: [4.5, 5] },
    { n: 34, lig: [38, 19], sat: [40, 24], h: [0.66, 0.32], w: [5, 6] }
  ];
  for (const L of LAYERS) {
    for (let i = 0; i < L.n; i++) {
      const bx = r() * S, h = (L.h[0] + r() * L.h[1]) * S, bend = (r() - 0.5) * S * 0.34;
      const w = L.w[0] + r() * L.w[1];
      const dry = r() < 0.15, seed = r() < 0.12;
      const hue = dry ? 48 + r() * 14 : 76 + (r() - 0.5) * 34;
      const sat = (dry ? 32 : L.sat[0]) + r() * L.sat[1];
      const lig = (dry ? L.lig[0] + 12 : L.lig[0]) + r() * L.lig[1];
      const tipL = Math.min(82, lig + 16 + r() * 10);
      for (const ox of [-S, 0, S]) {
        const b = bx + ox;
        if (b + Math.min(0, bend) < -w * 2 || b + Math.max(0, bend) > S + w * 2) continue;
        // two quadratics meeting at a point, so the tip is a real taper and not a cut quad
        const g = x.createLinearGradient(0, S, 0, S - h);
        g.addColorStop(0, `hsl(${hue},${sat}%,${Math.max(4, lig - 12)}%)`);       // root shadow
        g.addColorStop(0.35, `hsl(${hue},${sat}%,${lig}%)`);
        g.addColorStop(1, `hsl(${hue - 6},${Math.max(12, sat - 8)}%,${tipL}%)`);  // sun-caught tip
        x.fillStyle = g;
        // A real blade is NARROW at the sheath, widest around a third up, and ends in a
        // point. Straight-sided blades all rooted on the bottom row merge into one opaque
        // band, which is what made a tuft read as a dark card standing in the grass.
        x.beginPath();
        x.moveTo(b - w * 0.3, S);
        x.quadraticCurveTo(b + bend * 0.28 - w * 0.62, S - h * 0.55, b + bend, S - h);
        x.quadraticCurveTo(b + bend * 0.28 + w * 0.66, S - h * 0.55, b + w * 0.3, S);
        x.closePath(); x.fill();
        x.strokeStyle = `hsla(${hue},${sat}%,${Math.min(88, tipL + 8)}%,0.5)`;    // lit edge
        x.lineWidth = 1.1; x.lineCap = 'round';
        x.beginPath();
        x.moveTo(b - w * 0.3, S);
        x.quadraticCurveTo(b + bend * 0.28 - w * 0.62, S - h * 0.55, b + bend, S - h);
        x.stroke();
        if (seed) {                                                               // a dry seed head
          x.fillStyle = `hsla(${44 + hue * 0.1},${sat}%,${Math.min(76, lig + 22)}%,0.85)`;
          x.save(); x.translate(b + bend, S - h); x.rotate(Math.atan2(bend, -h));
          x.beginPath(); x.ellipse(0, -h * 0.05, w * 0.7, h * 0.07, 0, 0, 7); x.fill(); x.restore();
        }
      }
    }
  }
  // broad tonal drift + a shadowed root line, so the tuft isn't one flat green card
  x.globalCompositeOperation = 'source-atop';
  const gd = x.createLinearGradient(0, S, S, 0);
  gd.addColorStop(0, 'rgba(14,26,10,0.3)'); gd.addColorStop(0.5, 'rgba(0,0,0,0)');
  gd.addColorStop(1, 'rgba(196,208,140,0.14)');
  x.fillStyle = gd; x.fillRect(0, 0, S, S);
  const gr = x.createLinearGradient(0, S, 0, S * 0.88);
  gr.addColorStop(0, 'rgba(10,18,8,0.34)'); gr.addColorStop(1, 'rgba(10,18,8,0)');
  x.fillStyle = gr; x.fillRect(0, S * 0.88, S, S * 0.12);
  x.globalCompositeOperation = 'source-over';
  return canvasTex(c);
}

function makeGlowSprite(inner, outer) {
  const S = 128, c = makeCanvas(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner); g.addColorStop(0.35, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
  return t;
}

// The moon as a real disc — limb-lit sphere shading, a few maria, a soft halo — instead
// of the generic radial blob (which read as a distant streetlight, not a moon).
function makeMoonTexture() {
  const S = 128, r = mulberry32(777);
  const c = makeCanvas(S, S), x = c.getContext('2d');
  let g = x.createRadialGradient(S / 2, S / 2, S * 0.16, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(200,216,236,0.32)'); g.addColorStop(1, 'rgba(200,216,236,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  g = x.createRadialGradient(S * 0.45, S * 0.43, 2, S / 2, S / 2, S * 0.21);
  g.addColorStop(0, '#f5f8fc'); g.addColorStop(0.75, '#cdd8e6'); g.addColorStop(1, '#aebccf');
  x.fillStyle = g; x.beginPath(); x.arc(S / 2, S / 2, S * 0.20, 0, 7); x.fill();
  for (let i = 0; i < 8; i++) {                     // maria: soft grey basins off-centre
    const a = r() * 7, dd = r() * S * 0.12, mr = 2.5 + r() * 6;
    x.fillStyle = `rgba(118,132,152,${0.25 + r() * 0.3})`;
    x.beginPath(); x.arc(S / 2 + Math.cos(a) * dd, S / 2 + Math.sin(a) * dd, mr, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
  return t;
}

const texB = makeBuildingTextures();
const texBrick = makeFacadeAtlas('brick');
const texRender = makeFacadeAtlas('render');
const texTile = makeFacadeAtlas('tile');
const texG = makeGroundTexture();
const texGround = texG.map, texGroundNormal = texG.normal, texGroundRough = texG.rough;
const texLeaf = makeLeafTexture();
const texBark = makeBarkTexture();
const texVine = makeVineTexture();
const texGrass = makeGrassTexture();
const texSurf = makeSurfaceTexture();
const texSun = makeGlowSprite('rgba(255,255,255,1)', 'rgba(255,220,160,0.55)');
const texSoft = makeGlowSprite('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.25)');
const texMoon = makeMoonTexture();

/* ------------------------------------------------------------- materials -- */
const matPlain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
// Tree bark: trunks/roots/limbs (batched through B.bark). Vertex colour still carries
// the per-tree COL.bark tint + jitter; the map/normal/rough add the fissured wood relief.
// A real tangent-space normalMap replaced the old bumpMap: bumpMap perturbs from screen-space
// derivatives, so on a trunk lit from the side it flattened out exactly where the furrows
// should have been deepest, and crawled as the camera moved.
const matBark = new THREE.MeshStandardMaterial({
  vertexColors: true, map: texBark.map,
  normalMap: texBark.normal, normalScale: new THREE.Vector2(1.15, 1.15),
  roughnessMap: texBark.rough, roughness: 1, metalness: 0
});
// Street surface (asphalt / sidewalk / tow-path). Vertex colour carries the per-strip tint
// that addRoads already rolls; the maps supply aggregate, cracks, seams and wear. envMap at
// low intensity lets damp patches pick up the sky probe, which is what makes wet asphalt read
// as a surface rather than a shade of grey.
const matSurf = new THREE.MeshStandardMaterial({
  vertexColors: true, map: texSurf.map,
  normalMap: texSurf.normal, normalScale: new THREE.Vector2(0.85, 0.85),
  roughnessMap: texSurf.rough, roughness: 1, metalness: 0,
  envMap: envRT.texture, envMapIntensity: 0.22
});
/* awesome-pass A3 — grounded facades. Buildings used to float: the same clean plaster at
   ankle height as at the tenth floor, so the wall met the street on a hard seam with no
   contact darkening and no dirt. This hook darkens and greens the bottom of every facade in
   a deliberately wide 0..3.6 m band (world Y, so it follows the terrain rather than the
   building's own origin): a grime/contact-AO multiply plus an algae tint at the very base.
   The smoothstep is wide on purpose — a tight one reads as a painted skirting line.
   Applied to all four facade materials; each gets its own cache key so the four programs
   neither collide with each other nor with an un-hooked MeshStandardMaterial. */
function groundFacade(mat, name) {
  mat.onBeforeCompile = (shader) => {
    const AV = '#include <begin_vertex>', AF = '#include <map_fragment>';
    if (shader.vertexShader.indexOf(AV) === -1 || shader.fragmentShader.indexOf(AF) === -1) {
      console.error('CANOPY facade grounding: anchors not found in the r152 shader — ' + name + ' stays clean');
      return;
    }
    shader.vertexShader = 'varying float vCnpWY;\n' + shader.vertexShader.replace(AV, AV + '\n'
      + '  vCnpWY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;\n');
    shader.fragmentShader = 'varying float vCnpWY;\n' + shader.fragmentShader.replace(AF, AF + '\n'
      + '  {\n'
      + '    float g = smoothstep( -1.5, 3.6, vCnpWY );\n'
      + '    diffuseColor.rgb *= mix( 0.62, 1.0, g );\n'
      + '    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.78, 0.92, 0.70 ), ( 1.0 - g ) * 0.55 );\n'
      + '  }\n');
  };
  mat.customProgramCacheKey = () => 'canopy-bld-' + name;
  return mat;
}
const matBld = new THREE.MeshStandardMaterial({
  vertexColors: true, map: texB.map, emissiveMap: texB.emissive,
  emissive: srgb(0xffc27a), emissiveIntensity: 0,
  roughness: 1, roughnessMap: texB.rough,
  normalMap: texB.normal, normalScale: new THREE.Vector2(1, 1),
  envMap: envRT.texture, envMapIntensity: 0.6, metalness: 0
});
/* The other three facade materials. One material (and one Batch, see worldgen-anomalies'
   buildChunk) per building material, chosen per building by district — brick districts and
   concrete districts now differ in what they are MADE OF, not only in their proportions. */
function makeBldMaterial(tex, envI, nrm, name) {
  return groundFacade(new THREE.MeshStandardMaterial({
    vertexColors: true, map: tex.map, emissiveMap: tex.emissive,
    emissive: srgb(0xffc27a), emissiveIntensity: 0,
    roughness: 1, roughnessMap: tex.rough,
    normalMap: tex.normal, normalScale: new THREE.Vector2(nrm, nrm),
    envMap: envRT.texture, envMapIntensity: envI, metalness: 0
  }), name);
}
const matBldBrick = makeBldMaterial(texBrick, 0.35, 1.15, 'brick');   // fired clay: matte, deep joints
const matBldRender = makeBldMaterial(texRender, 0.4, 1.0, 'render');  // painted render: matte, soft relief
const matBldTile = makeBldMaterial(texTile, 0.95, 0.9, 'tile');       // glazed tile: it is glaze, it reflects
groundFacade(matBld, 'concrete');   // matBld is built inline above, so it gets the hook here
/* Night lighting: worldgen-chunks' updateSky drives the lit-window glow by writing
   matBld.emissiveIntensity once a frame, and that file is not ours to touch. Rather than
   leave three-quarters of the city's windows dead after dark, matBld's emissiveIntensity
   becomes an accessor that fans the value out to its siblings. three reads the property in
   WebGLMaterials (uniforms.emissive * emissiveIntensity), so a getter is transparent to it. */
const BLD_MATS = [matBld, matBldBrick, matBldRender, matBldTile];
{
  let _emi = matBld.emissiveIntensity;
  Object.defineProperty(matBld, 'emissiveIntensity', {
    get() { return _emi; },
    set(v) { _emi = v; for (let i = 1; i < BLD_MATS.length; i++) BLD_MATS[i].emissiveIntensity = v; },
    configurable: true, enumerable: true
  });
}
/* The registry worldgen-builders reads: material key → the per-chunk Batch name it draws
   into, the material that batch is meshed with, and the atlas's published opening table
   (used to hang modelled sills/reveals on the painted windows). Keep `batch` in step with
   buildChunk's B = {...} and its mesh list. */
const FACADES = {
  concrete: { batch: 'bld', mat: matBld, bays: texB.bays },
  brick: { batch: 'bldB', mat: matBldBrick, bays: texBrick.bays },
  render: { batch: 'bldR', mat: matBldRender, bays: texRender.bays },
  tile: { batch: 'bldT', mat: matBldTile, bays: texTile.bays }
};
// Canopy leaves. normalMap gives each leaf its own shading so a blob stops reading as one
// smooth sphere with foliage painted on it; roughness below 1 leaves a waxy sheen on the
// leaves that face the sun, which is most of what says "living plant" at midday.
const matLeaf = new THREE.MeshStandardMaterial({
  map: texLeaf, normalMap: texLeaf.userData.normal, normalScale: new THREE.Vector2(0.8, 0.8),
  vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0
});
/* Backlit leaves glow, and that is most of what a canopy looks like from underneath.
   MeshStandardMaterial has no transmission, so this adds a cheap two-lobe back-scatter term:
   a broad wrap lobe for light landing on the far face of a leaf, plus a tight forward lobe
   for looking straight into the sun through one.
   The hook point matters. r152's <lights_fragment_begin> runs its RE_Direct loops in the
   order point → spot → directional, and `IncidentLight directLight` is declared once outside
   them — so immediately AFTER the include, directLight still holds the last DIRECTIONAL
   light (this scene has exactly one, the sun), already attenuated by its shadow map. That
   gives a shadowed leaf no glow, for free. The term goes into indirectDiffuse, which
   <lights_fragment_end> only ever adds to. */
matLeaf.onBeforeCompile = (shader) => {
  const A = '#include <lights_fragment_begin>';
  if (shader.fragmentShader.indexOf(A) === -1) {
    console.error('CANOPY leaf translucency: anchor "' + A + '" not found in the r152 shader — leaves stay opaque');
    return;
  }
  shader.fragmentShader = shader.fragmentShader.replace(A, A + '\n'
    + '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )\n'
    + '  {\n'
    + '    float cnpBack = max( 0.0, - dot( normal, directLight.direction ) );\n'
    + '    float cnpFwd  = pow( max( 0.0, - dot( geometry.viewDir, directLight.direction ) ), 3.0 );\n'
    // chlorophyll transmits yellow-green, not the leaf's own reflected green; without the
    // warm bias the far side of a crown goes neon
    + '    vec3 cnpTint = diffuseColor.rgb * vec3( 1.15, 1.0, 0.55 );\n'
    + '    reflectedLight.indirectDiffuse += directLight.color * cnpTint * cnpBack * ( 0.30 + 0.95 * cnpFwd );\n'
    + '  }\n'
    + '#endif\n');
};
matLeaf.customProgramCacheKey = () => 'canopy-leaf-translucency';
const matVine = new THREE.MeshStandardMaterial({
  map: texVine, normalMap: texVine.userData.normal, normalScale: new THREE.Vector2(1, 1),
  vertexColors: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.86, metalness: 0
});
/* awesome-pass A2: vines are leaves too. Without back-scatter a curtain of vine hanging on
   a sunlit facade reads as a black cut-out — the camera almost always looks at the shaded
   face of it. Same hook, same anchor and same guard as matLeaf above (see the long comment
   there for why immediately after <lights_fragment_begin> is the right place); the tint is
   a shade warmer and the lobes a shade tighter, because vine leaf is thicker and waxier
   than canopy leaf and transmits less. */
matVine.onBeforeCompile = (shader) => {
  const A = '#include <lights_fragment_begin>';
  if (shader.fragmentShader.indexOf(A) === -1) {
    console.error('CANOPY vine translucency: anchor "' + A + '" not found in the r152 shader — vines stay opaque');
    return;
  }
  shader.fragmentShader = shader.fragmentShader.replace(A, A + '\n'
    + '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )\n'
    + '  {\n'
    + '    float cnpBack = max( 0.0, - dot( normal, directLight.direction ) );\n'
    + '    float cnpFwd  = pow( max( 0.0, - dot( geometry.viewDir, directLight.direction ) ), 3.0 );\n'
    + '    vec3 cnpTint = diffuseColor.rgb * vec3( 1.10, 1.0, 0.62 );\n'
    + '    reflectedLight.indirectDiffuse += directLight.color * cnpTint * cnpBack * ( 0.24 + 0.70 * cnpFwd );\n'
    + '  }\n'
    + '#endif\n');
};
matVine.customProgramCacheKey = () => 'canopy-vine-translucency';
const matGrass = new THREE.MeshStandardMaterial({
  map: texGrass, vertexColors: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.92, metalness: 0
});
const matGlow = new THREE.MeshStandardMaterial({
  vertexColors: true, emissive: srgb(0x5fe8b0), emissiveIntensity: 0, roughness: 0.7, metalness: 0
});
const matLamp = new THREE.MeshStandardMaterial({
  vertexColors: true, emissive: srgb(0xffd9a0), emissiveIntensity: 0, roughness: 0.6, metalness: 0
});
// Morning puddles (Little details): a dark, wet-looking material shared across all chunks.
// Its opacity is driven by the "dew" factor in updateSky (high at dawn, gone by noon), so the
// batched puddle discs simply fade in and out with the time of day — like matGlow's emissive.
const matPuddle = new THREE.MeshStandardMaterial({
  vertexColors: true, transparent: true, opacity: 0, roughness: 0.06, metalness: 0.35,
  envMap: envRT.texture, envMapIntensity: 1.2,
  depthWrite: false, side: THREE.DoubleSide
});
// Cobwebs (Little details): one shared pale, faintly translucent material for corner webs.
const matWeb = new THREE.MeshBasicMaterial({
  vertexColors: true, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide
});
const leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texLeaf, alphaTest: 0.45 });
// Still, dark reservoir water — one extra plane mesh per reservoir chunk (Anomalies).
// Water: blue with a procedural ripple texture. UVs on each water plane are scaled
// so one texture tile ≈ 4 m regardless of the plane's size (see scaleWaterUVs).
function makeWaterTexture(seed) {
  // Deep open-water look: a near-navy body (real depth reads blue-black, not teal) with
  // TWO ripple scales — long low swell crests plus fine chop between them — because a
  // single stroke family is what made the old water read as patterned glass. 512 px at
  // the same 4 m tile doubles crest detail up close.
  const S = 512, r = mulberry32(seed || 4242);
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#133f63'); g.addColorStop(0.5, '#0a2b4a'); g.addColorStop(1, '#133f63');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  // deep patches falling to navy-black
  for (let i = 0; i < 30; i++) {
    const mx = r() * S, my = r() * S, mr = 34 + r() * 120;
    const gg = x.createRadialGradient(mx, my, 1, mx, my, mr);
    gg.addColorStop(0, `rgba(3,17,34,${0.18 + r() * 0.22})`); gg.addColorStop(1, 'rgba(3,17,34,0)');
    x.fillStyle = gg; x.beginPath(); x.arc(mx, my, mr, 0, 7); x.fill();
  }
  // lighter upwell patches so the body isn't one flat tone
  for (let i = 0; i < 16; i++) {
    const mx = r() * S, my = r() * S, mr = 26 + r() * 90;
    const gg = x.createRadialGradient(mx, my, 1, mx, my, mr);
    gg.addColorStop(0, `rgba(48,108,152,${0.09 + r() * 0.11})`); gg.addColorStop(1, 'rgba(48,108,152,0)');
    x.fillStyle = gg; x.beginPath(); x.arc(mx, my, mr, 0, 7); x.fill();
  }
  // long swell crests: wandering near-horizontal pale strokes with a dark shadow twin
  for (let i = 0; i < 54; i++) {
    const yy = r() * S, ph = r() * 7, amp = 3 + r() * 6, len = 120 + r() * 300, x0 = r() * S;
    for (const [dy, col, lw] of [[2.2, `rgba(4,20,38,${0.22 + r() * 0.2})`, 2.8], [0, `rgba(140,195,230,${0.14 + r() * 0.2})`, 1.6]]) {
      x.strokeStyle = col; x.lineWidth = lw;
      x.beginPath();
      for (let t = 0; t <= len; t += 8) x.lineTo(x0 + t, yy + dy + Math.sin(t * 0.045 + ph) * amp);
      x.stroke();
    }
  }
  // fine chop between the swells: short, thin, slightly steeper crests
  for (let i = 0; i < 150; i++) {
    const yy = r() * S, ph = r() * 7, amp = 1 + r() * 2.2, len = 18 + r() * 56, x0 = r() * S;
    x.strokeStyle = `rgba(120,175,210,${0.10 + r() * 0.14})`; x.lineWidth = 1;
    x.beginPath();
    for (let t = 0; t <= len; t += 5) x.lineTo(x0 + t, yy + Math.sin(t * 0.14 + ph) * amp);
    x.stroke();
  }
  // sparse sun glints riding the crests
  for (let i = 0; i < 170; i++) {
    x.fillStyle = `rgba(215,240,250,${0.10 + r() * 0.22})`;
    x.fillRect(r() * S, r() * S, 1 + r() * 3, 1);
  }
  return canvasTex(c);
}
// Living water (Feature A): two counter-drifting ripple layers give the canals an
// interference shimmer that reads as slow flow. Layer 1 (texWater) is the opaque-ish
// blue body carried by matWater; layer 2 (texWater2) is a fainter transparent sheet
// 0.02 m above it, tiled a little coarser so the two grids beat against each other.
// updateSky (worldgen-chunks.js) drifts both offsets and drives matWater's noon
// emissive sparkle; the texture consts below are read from there.
const texWater = makeWaterTexture(4242);
const texWater2 = makeWaterTexture(1379);
// Near-white material color lets the deep-blue map own the hue; opacity up from 0.82 so
// the canal bed no longer bleeds through and repaints the surface green (the old look
// read as wet mossy pavement, not water).
const matWater = new THREE.MeshStandardMaterial({
  map: texWater, color: srgb(0xaccce4), transparent: true, opacity: 0.92,
  roughness: 0.08, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false,
  envMap: envRT.texture, envMapIntensity: 1.0,
  emissive: srgb(0xa8d4f0), emissiveIntensity: 0                              // sky-blue noon sparkle, driven per frame
});
const matWater2 = new THREE.MeshStandardMaterial({
  map: texWater2, color: srgb(0x9fc6e0), transparent: true, opacity: 0.30,
  roughness: 0.10, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false,
  envMap: envRT.texture, envMapIntensity: 0.7,
  blending: THREE.NormalBlending
});
// Scale a water plane's UVs so the ripple texture tiles at ~`tile` m (default 4, RepeatWrapping).
function scaleWaterUVs(geo, worldW, worldH, tile) {
  tile = tile || 4;
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * worldW / tile, uv.getY(k) * worldH / tile);
  uv.needsUpdate = true;
}

// Sky nets (Feature B): a woven rope grid on a transparent ground — the aerial jungle
// strung between crowns. Dark hemp-brown double strands running both diagonals at ~14 px
// spacing, lighter highlight along each rope, a few snapped strands and caught leaves.
// alphaTest so the holes read as open sky; DoubleSide, rough, no shine.
function makeNetTexture() {
  const S = 256, sp = 14, r = mulberry32(6161);
  const c = makeCanvas(S, S), x = c.getContext('2d');
  x.clearRect(0, 0, S, S);
  // draw one rope as a dark strand with a thin lighter highlight offset along it
  function rope(x0, y0, x1, y1, broken) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const cut = broken ? 0.3 + r() * 0.4 : 1;              // snapped strands stop partway
    const ex = x0 + dx * cut, ey = y0 + dy * cut;
    x.strokeStyle = `rgba(${44 + r() * 16 | 0},${32 + r() * 14 | 0},${20 + r() * 10 | 0},0.95)`;
    x.lineWidth = 3.2; x.beginPath(); x.moveTo(x0, y0); x.lineTo(ex, ey); x.stroke();
    x.strokeStyle = `rgba(${120 + r() * 30 | 0},${96 + r() * 24 | 0},${64 + r() * 18 | 0},0.7)`;
    x.lineWidth = 1.1; x.beginPath(); x.moveTo(x0 + nx, y0 + ny); x.lineTo(ex + nx, ey + ny); x.stroke();
  }
  // two diagonal families across a wrapped field (so tiling stays seamless)
  for (let d = -S; d < S * 2; d += sp) {
    rope(d, 0, d + S, S, r() < 0.06);          // ╲ strands
    rope(d + S, 0, d, S, r() < 0.06);          // ╱ strands
  }
  // a handful of caught leaves snagged in the mesh
  for (let i = 0; i < 22; i++) {
    const lx = r() * S, ly = r() * S, rw = 5 + r() * 7, rh = 3 + r() * 4;
    const hpx = 80 + (r() - 0.5) * 40, sat = 34 + r() * 24, lig = 26 + r() * 20;
    x.save(); x.translate(lx, ly); x.rotate(r() * 7);
    x.fillStyle = `hsl(${hpx},${sat}%,${lig}%)`;
    x.beginPath(); x.ellipse(0, 0, rw, rh, 0, 0, 7); x.fill();
    x.strokeStyle = `hsl(${hpx},${sat}%,${Math.max(10, lig - 14)}%)`; x.lineWidth = 1;
    x.beginPath(); x.moveTo(-rw * 0.8, 0); x.lineTo(rw * 0.8, 0); x.stroke();
    x.restore();
  }
  return canvasTex(c);
}
const texNet = makeNetTexture();
const matNet = new THREE.MeshStandardMaterial({
  map: texNet, vertexColors: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, metalness: 0
});

/* ------------------------------------------------------- geometry batching -- */
class Batch {
  // uvWorld (metres per texture tile, optional): rescale template UVs per piece so a tiled
  // material keeps constant world-space texel density across giants and saplings. Assumes
  // cylinder-style templates (u wraps the circumference, v runs the height); u repeats are
  // rounded to an integer so the wrap seam still tiles, v tiles at 2×uvWorld (tall textures).
  constructor(uvWorld) { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.v = 0; this.uvWorld = uvWorld || 0; }
  quad(a, b, c2, d, uv, col, colB) {
    // a,b,c2,d: [x,y,z] counter-clockwise; uv: [u0,v0,u1,v1]; col/colB: THREE.Color (colB = color at a,b edge)
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const cA = col, cB = colB || col;
    const verts = [a, b, c2, d];
    const uvs = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    const cols = [cB, cB, cA, cA];
    for (let k = 0; k < 4; k++) {
      this.p.push(verts[k][0], verts[k][1], verts[k][2]);
      this.n.push(nx, ny, nz);
      this.u.push(uvs[k][0], uvs[k][1]);
      this.c.push(cols[k].r, cols[k].g, cols[k].b);
    }
    this.i.push(this.v, this.v + 1, this.v + 2, this.v, this.v + 2, this.v + 3);
    this.v += 4;
  }
  addGeo(geo, mat4, color, jitter, rng) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(mat4);
    const v3 = new THREE.Vector3();
    let uRep = 1, vRep = 1;
    if (this.uvWorld) {
      const e = mat4.elements;
      const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
      uRep = Math.max(1, Math.round(Math.PI * (sx + sz) / this.uvWorld));
      vRep = Math.max(0.6, sy / (this.uvWorld * 2));
    }
    for (let k = 0; k < pos.count; k++) {
      v3.fromBufferAttribute(pos, k).applyMatrix4(mat4);
      this.p.push(v3.x, v3.y, v3.z);
      v3.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize();
      this.n.push(v3.x, v3.y, v3.z);
      if (uv) this.u.push(uv.getX(k) * uRep, uv.getY(k) * vRep); else this.u.push(0, 0);
      const j = jitter ? (1 - jitter + rng() * jitter * 2) : 1;
      this.c.push(color.r * j, color.g * j, color.b * j);
    }
    const idx = geo.index;
    if (idx) for (let k = 0; k < idx.count; k++) this.i.push(idx.getX(k) + this.v);
    else for (let k = 0; k < pos.count; k++) this.i.push(k + this.v);
    this.v += pos.count;
  }
  mesh(material, cast, receive, depthMat) {
    if (this.v === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    // A degenerate quad (two coincident corners) or a zero-scaled template leaves a zero-length
    // normal; normalize() in the fragment shader turns that into NaN, which used to die as one
    // black pixel and now smears into a hard square through the post-fx blur. Point them up.
    // Pure data repair — no rng, no vertex-count change, so the world layout is untouched.
    const n = this.n;
    for (let k = 0; k < n.length; k += 3) {
      if (n[k] * n[k] + n[k + 1] * n[k + 1] + n[k + 2] * n[k + 2] < 1e-12) { n[k] = 0; n[k + 1] = 1; n[k + 2] = 0; }
    }
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    const m = new THREE.Mesh(g, material);
    m.castShadow = !!cast; m.receiveShadow = !!receive;
    if (depthMat) m.customDepthMaterial = depthMat;
    m.matrixAutoUpdate = false;
    return m;
  }
}

/* ------------------------------------------------------ geometry templates -- */
// NOTE: radial segment count feeds Batch.addGeo's per-vertex colour jitter (one rng() per
// vertex) — changing it re-rolls every chunk's downstream worldgen. Keep at 9.
const tplTrunk = new THREE.CylinderGeometry(0.62, 1, 1, 9, 1, true); tplTrunk.translate(0, 0.5, 0);
const tplRoot = new THREE.CylinderGeometry(0.35, 1, 1, 6, 1, true); tplRoot.translate(0, 0.5, 0);
const tplBlob = new THREE.IcosahedronGeometry(1, 1);
const tplRock = new THREE.IcosahedronGeometry(1, 0);
const tplBox = new THREE.BoxGeometry(1, 1, 1); tplBox.translate(0, 0.5, 0);
const tplBoxC = new THREE.BoxGeometry(1, 1, 1);   // centered (for tilted slabs / decks)
const tplCyl = new THREE.CylinderGeometry(1, 1, 1, 8); tplCyl.translate(0, 0.5, 0);
const tplWheel = new THREE.CylinderGeometry(1, 1, 1, 8); tplWheel.rotateX(Math.PI / 2);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _pv = new THREE.Vector3(), _e = new THREE.Euler();
function compose(x, y, z, sx, sy, sz, rx, ry, rz) {
  _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
  _pv.set(x, y, z); _s.set(sx, sy, sz);
  return _m4.compose(_pv, _q, _s);
}

/* ---- lit-lamp overlays (lamplighter mission) --------------------------------
   matLamp's emissiveIntensity is driven by the sky every frame (~0 at dusk), so
   a re-lit lamp needs its own constant glow. A small pool of hidden blobs is
   parked at lamp heads on demand — batched geometry can't be toggled in place. */
const matLampLit = new THREE.MeshStandardMaterial({ emissive: srgb(0xffe0b0), emissiveIntensity: 2.4, color: 0x1a1a14, roughness: 0.6, metalness: 0 });
const LAMP_POOL = Array.from({ length: 8 }, () => {
  const m = new THREE.Mesh(tplBlob, matLampLit); m.scale.setScalar(0.4); m.visible = false; scene.add(m); return m;
});

/* ------------------------------------------------------------- palettes -- */
const COL = {
  bark: srgb(0x8a7157), barkDark: srgb(0x6e5942),
  leafA: srgb(0x5a8f3c), leafB: srgb(0x7aa348), leafC: srgb(0x44702e), leafDry: srgb(0x9a8f45),
  moss: srgb(0x54683c),
  roof: srgb(0x5c5b52), roofGarden: srgb(0x4e6337),
  rock: srgb(0x6b675e),
  grassA: srgb(0x6f9440), grassB: srgb(0x8fae4e),
  vine: srgb(0x74975a),
  glowPlant: srgb(0x1f4436),
  deadwood: srgb(0x4f463c),
  sidewalk: srgb(0x74736a),
  // Street-surface tints — these MULTIPLY matSurf's deliberately light albedo (~0.40 linear),
  // so they read brighter here than a standalone colour would. The old COL.road (0x33343a,
  // ~0.033 linear) went onto an untextured quad and landed at ~0.013 final albedo — darker
  // than coal, which is why every street was a black void. Asphalt's real albedo is ~0.06,
  // weathered concrete ~0.2; these are tuned to land there after the texture multiply.
  // Warm-neutral, not blue: the hemisphere light is sky-cyan, so a blue-biased tint drove the
  // asphalt navy. Real weathered bitumen is a warm grey that greys further as it oxidises.
  surfRoad: srgb(0x77726a), surfWalk: srgb(0xb6b2a6), surfDash: srgb(0xe8e4d2),
  lampPole: srgb(0x3d443c), wire: srgb(0x17171a), rust: srgb(0x6a4a35),
  wood: srgb(0x4a3b2e), tire: srgb(0x151517)
};
const CAR_COLS = [0x7a6f63, 0x5c6e7a, 0x6e5a50, 0x4a5a4a, 0x8a8578, 0x6b4a3f, 0x51586b, 0x746a4a].map(srgb);
const SIGN_COLS = [0x7a3b32, 0x35526b, 0x8a6b2f, 0x4e6242, 0x6b4a6e, 0x2f5a55].map(srgb);

// Height-graded foliage tint (Phase 3): the same base leaf colour reads deeper/darker
// green down in the shaded lower canopy and sun-bleached (brighter, a touch yellower)
// up in the crowns — so the strata separate when you look straight up from the street.
// Cheap: a per-blob vertex-colour lerp picked at emission time by the blob's world y.
// Returns a fresh Color (safe to hand to addGeo, which reads r/g/b).
// Regions: macro-biome foliage shifts, lerped over the height-graded tint (no new
// materials — the leaf batch is vertex-coloured). CUR_REG is the current chunk's region
// (worldgen-builders.js), null outside a chunk build.
const LEAF_SCORCH = srgb(0x8a7a3a);   // olive/tan sun-killed foliage
const LEAF_DEEP = srgb(0x1e4412);     // saturated dark green — the flora won
const LEAF_ASH = srgb(0x8f938a);      // grey-dusted (dead city under an intact roof)
function leafTintByY(base, y) {
  const t = smooth(8, 38, y);                               // 0 street canopy · 1 emergent crowns
  const c = _c.copy(base).multiplyScalar(0.90 + 0.38 * t)   // darker low → brighter high (low canopy lifted)
    .lerp(COL.leafDry, t * 0.14);                           // faint sun-bleach up top
  if (typeof CUR_REG !== 'undefined' && CUR_REG) {
    if (CUR_REG.biome === 'scorch') c.lerp(LEAF_SCORCH, 0.55);
    else if (CUR_REG.biome === 'deepgreen') c.lerp(LEAF_DEEP, 0.40);
    else if (CUR_REG.biome === 'ashen') c.lerp(LEAF_ASH, 0.22);
  }
  return c.clone();
}

/* ----------------------------------------------------------- city naming -- */
const NAME_A = ['Moss', 'Fern', 'Ivy', 'Bramble', 'Kudzu', 'Willow', 'Cedar', 'Banyan', 'Lichen', 'Sorrel', 'Alder', 'Rowan', 'Verdan', 'Hollow', 'Arbor', 'Tendril'];
const NAME_B = [' Row', ' Gate', ' Yards', ' Hollow', ' Cross', ' Terrace', ' Quarter', ' Reach', ' Steps', ' Court', 'field', ' Rise'];
// Districts (Phase B): per-style suffix flavour, biased in ~55% of chunks so a
// neighbourhood's name hints at its architecture. Deterministic on its own salt.
const NAME_STYLE = {
  works: [' Foundry', ' Mill', ' Yards', ' Works'],
  garden: [' Gardens', ' Lanes', ' Green', ' Orchard'],
  glass: [' Heights', ' Crown', ' Spires', ' Vista'],
  oldtown: [' Old Quarter', ' Steps', ' Lane', ' Wynd'],
  blocks: [' Estates', ' Blocks', ' Court', ' Terrace'],
};
function districtName(ix, iz) {
  if (ix === SPIRE.cx && iz === SPIRE.cz) return 'The Spire';
  const a = NAME_A[hash2(ix, iz, 7) % NAME_A.length];
  const pool = NAME_STYLE[districtStyle(ix, iz)];
  if (pool && hash2(ix, iz, 21) % 100 < 55) return a + pool[hash2(ix, iz, 23) % pool.length];
  return a + NAME_B[hash2(ix, iz, 13) % NAME_B.length];
}

