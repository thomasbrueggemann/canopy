/* CANOPY split file  worldgen: chunk manager, sky / day-night, canopy sea, ground (was game.js lines 2445-2687). Header/error-handler in core.js. */
'use strict';
/* ======================================================================== */
/*  CHUNK MANAGER                                                           */
/* ======================================================================== */
const chunks = new Map();
const buildQueue = [];
function chunkKey(ix, iz) { return ix + ',' + iz; }

function ensureChunks(px, pz, syncAll) {
  const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
  const wanted = new Set();
  for (let dx = -VIEW_R; dx <= VIEW_R; dx++) for (let dz = -VIEW_R; dz <= VIEW_R; dz++) {
    const ix = cx + dx, iz = cz + dz, key = chunkKey(ix, iz);
    wanted.add(key);
    if (!chunks.has(key) && !buildQueue.some(q => q.key === key)) {
      const d = dx * dx + dz * dz;
      buildQueue.push({ ix, iz, key, d });
    }
  }
  buildQueue.sort((a, b) => a.d - b.d);
  let changed = false;   // ground-hole registry only rebuilds when the loaded pit set could shift
  // immediate ring: never let the player reach an unbuilt chunk
  let budget = syncAll ? 999 : 2;
  while (buildQueue.length && budget > 0) {
    const q = buildQueue.shift();
    if (chunks.has(q.key)) continue;
    const c = buildChunk(q.ix, q.iz);
    chunks.set(q.key, c);
    scene.add(c.group);
    changed = true;
    if (q.d > 2) budget--;
  }
  // retire distant chunks
  for (const [key, c] of chunks) {
    if (wanted.has(key)) continue;
    const dx = c.ix - cx, dz = c.iz - cz;
    if (Math.max(Math.abs(dx), Math.abs(dz)) > VIEW_R + 1) {
      scene.remove(c.group);
      c.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      chunks.delete(key);
      changed = true;
    }
  }
  // Sinkhole ground-holes: resync the shader's world-space hole circles from live chunks'
  // round pits whenever a chunk was built or retired (a bowl may have entered/left range).
  if (changed) syncGroundHoles(px, pz);
}
function chunkAt(x, z) { return chunks.get(chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK))); }

// Drive the pool of streetlamp point lights: at night, park each one on one of the
// nearest still-burning lamp heads around the player and fade it by distance so lamps
// entering or leaving the pool never pop. During the day every pool light idles at 0.
const _lampCand = [];
function updateLampLights() {
  _lampCand.length = 0;
  if (nightF > 0.015) {
    const cx = Math.floor(player.pos.x / CHUNK), cz = Math.floor(player.pos.z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const c = chunks.get(chunkKey(cx + dx, cz + dz));
      if (!c) continue;
      for (const L of c.colData.lamps) {
        if (!L.working) continue;                       // only lamps that still burn
        const ddx = L.hx - player.pos.x, ddz = L.hz - player.pos.z;
        _lampCand.push({ L, d2: ddx * ddx + ddz * ddz });
      }
    }
    _lampCand.sort((a, b) => a.d2 - b.d2);
  }
  const base = 12 * nightF;
  for (let i = 0; i < LAMP_LIGHTS; i++) {
    const light = lampLights[i];
    if (i < _lampCand.length) {
      const { L, d2 } = _lampCand[i];
      light.position.set(L.hx, L.hy - 0.1, L.hz);       // just under the head glass
      light.intensity = base * (1 - smooth(LAMP_REACH * 0.72, LAMP_REACH, Math.sqrt(d2)));
    } else {
      light.intensity = 0;
    }
  }
}

/* ======================================================================== */
/*  SKY / DAY-NIGHT                                                         */
/* ======================================================================== */
const skyGroup = new THREE.Group();
scene.add(skyGroup);

const domeGeo = new THREE.SphereGeometry(760, 28, 14);
const domeCols = new THREE.Float32BufferAttribute(new Float32Array(domeGeo.attributes.position.count * 3), 3);
domeGeo.setAttribute('color', domeCols);
const dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, toneMapped: true }));
dome.renderOrder = -10; dome.frustumCulled = false;
skyGroup.add(dome);

// stars — two size tiers: real night skies read as a few bright points over a dust of
// faint ones; a single uniform layer is what makes a game sky look like a decal
function makeStarField(n, seed, size, color) {
  const pos = new Float32Array(n * 3), rs = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const a = rs() * Math.PI * 2, e = Math.asin(rs());
    pos[i * 3] = Math.cos(a) * Math.cos(e) * 720;
    pos[i * 3 + 1] = Math.sin(e) * 720 + 20;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 720;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    color, size, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false
  }));
  p.renderOrder = -9; p.frustumCulled = false;
  skyGroup.add(p);
  return p;
}
const stars = makeStarField(700, 42, 1.7, 0xcfe0ff);
const starsDim = makeStarField(1100, 43, 0.9, 0xb8c8dd);
// sun & moon sprites
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texSun, blending: THREE.AdditiveBlending, fog: false, depthWrite: false, transparent: true }));
sunSprite.scale.set(150, 150, 1); sunSprite.renderOrder = -8;
skyGroup.add(sunSprite);
const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texMoon, color: 0xdce6f2, blending: THREE.AdditiveBlending, fog: false, depthWrite: false, transparent: true }));
moonSprite.scale.set(46, 46, 1); moonSprite.renderOrder = -8;   // texMoon disc fills ~40% of the sprite → apparent moon ≈ 18 units
skyGroup.add(moonSprite);

// Sky-probe scene (core.js): clones share the live dome geometry/material and the sprite
// materials, so every updateSky recolour propagates for free; only positions need copying
// at refresh time.
const domeEnv = new THREE.Mesh(domeGeo, dome.material);
domeEnv.frustumCulled = false;
envScene.add(domeEnv);
const sunEnv = new THREE.Sprite(sunSprite.material);  sunEnv.scale.copy(sunSprite.scale);
const moonEnv = new THREE.Sprite(moonSprite.material); moonEnv.scale.copy(moonSprite.scale);
envScene.add(sunEnv); envScene.add(moonEnv);

// Real multi-puff cloud textures (3 seeded variants): 7-12 soft white radial puffs biased
// to the upper canvas so the base reads flat, plus a few darker puffs along the bottom for
// a shaded underside. Own mulberry32 per seed — separate from the cloud-spawn rng below.
function makeCloudTexture(seed) {
  const W = 256, H = 128, r = mulberry32(seed);
  const cc = makeCanvas(W, H), xc = cc.getContext('2d');
  xc.clearRect(0, 0, W, H);
  const nPuff = 7 + (r() * 6 | 0);
  for (let i = 0; i < nPuff; i++) {
    const px = 30 + r() * (W - 60), py = H * (0.12 + r() * 0.48), rr = 26 + r() * 40, a = 0.30 + r() * 0.45;
    const g = xc.createRadialGradient(px, py, 1, px, py, rr);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    xc.fillStyle = g; xc.beginPath(); xc.arc(px, py, rr, 0, 7); xc.fill();
  }
  const nShade = 3 + (r() * 3 | 0);
  for (let i = 0; i < nShade; i++) {
    const px = 40 + r() * (W - 80), py = H * (0.66 + r() * 0.3), rr = 20 + r() * 30;
    const g = xc.createRadialGradient(px, py, 1, px, py, rr);
    g.addColorStop(0, `rgba(150,160,175,${0.18 + r() * 0.14})`); g.addColorStop(1, 'rgba(150,160,175,0)');
    xc.fillStyle = g; xc.beginPath(); xc.arc(px, py, rr, 0, 7); xc.fill();
  }
  return canvasTex(cc);
}
const texClouds = [makeCloudTexture(11), makeCloudTexture(12), makeCloudTexture(13)];

// drifting high clouds
const clouds = [];
{
  const rs = mulberry32(31337);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texClouds[i % 3], transparent: true, opacity: 0.1, fog: false, depthWrite: false }));
    const d = 250 + rs() * 350;
    const a = rs() * Math.PI * 2;
    s.position.set(Math.cos(a) * d, 130 + rs() * 160, Math.sin(a) * d);
    s.scale.set(220 + rs() * 300, 70 + rs() * 70, 1);
    s.userData.va = 0.4 + rs() * 0.8;
    skyGroup.add(s); clouds.push(s);
  }
}

// palette keyframes (sRGB hex, converted)
const SKY = {
  nightTop: srgb(0x0b1826), nightHor: srgb(0x182b36), nightSun: srgb(0x0),
  dawnTop: srgb(0x2b4a74), dawnHor: srgb(0xff9a55),
  dayTop: srgb(0x6fa8dc), dayHor: srgb(0xd7e6cc),
  sunLow: srgb(0xff7f36), sunHigh: srgb(0xfff3e0),
  moon: srgb(0x93aecd)
};
// Canopy-sea albedo drive (see the note in updateSky). These are MULTIPLIERS over the sheet
// texture, not colours in their own right, so they legitimately sit above 1.
const SEA_ALBEDO = new THREE.Color(0.56, 0.79, 0.48);   // tuned against the near leaf blobs; green-weighted so
                                                       // the distant roof keeps its colour under the pale fog wash
const SEA_MOON = new THREE.Color(0.60, 0.72, 1.00);     // moonlit roof goes blue-grey, not dim green
const _seaAlb = new THREE.Color();
const _top = new THREE.Color(), _hor = new THREE.Color(), _sunC = new THREE.Color(), _fogC = new THREE.Color();
const sunDir = new THREE.Vector3();
let dayF = 1, nightF = 0, sunElev = 1, dewF = 0;
let _envAccum = 0, _envDone = false;   // sky-probe refresh throttle (core.js refreshEnvProbe)

// Unit direction per dome vertex, precomputed once: the per-frame recolour below adds a
// forward-scatter term (sky brightens toward the sun — tight and warm at dusk, broad and
// faint by day; a cool patch around the moon at night) so the dome reads as a lit volume
// instead of the same gradient at every azimuth.
const domeDirs = (() => {
  const p = domeGeo.attributes.position, a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const l = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) || 1;
    a[i * 3] = p.getX(i) / l; a[i * 3 + 1] = p.getY(i) / l; a[i * 3 + 2] = p.getZ(i) / l;
  }
  return a;
})();

function updateSky(t, dt) {
  const ang = (t - 0.25) * Math.PI * 2;
  sunElev = Math.sin(ang);
  sunDir.set(Math.cos(ang), Math.sin(ang), 0.32).normalize();
  dayF = smooth(-0.06, 0.14, sunElev);
  nightF = 1 - smooth(-0.14, 0.0, sunElev);
  const duskF = Math.exp(-Math.pow(sunElev * 4.4, 2)); // glow band around horizon crossings

  _top.copy(SKY.nightTop).lerp(SKY.dayTop, dayF).lerp(SKY.dawnTop, duskF * 0.7 * (1 - nightF));
  _hor.copy(SKY.nightHor).lerp(SKY.dayHor, dayF).lerp(SKY.dawnHor, duskF * (1 - nightF * 0.85));
  _sunC.copy(SKY.sunLow).lerp(SKY.sunHigh, smooth(0.05, 0.5, sunElev));

  // dome vertex colors: base vertical gradient + directional scatter toward sun/moon.
  // The dusk term keeps glowing on the sun side just after set (duskF stays high while
  // nightF ramps), which is what an actual twilight afterglow does.
  const pos = domeGeo.attributes.position, colA = domeGeo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const ny = pos.getY(i) / 760;
    const k = Math.pow(clamp(ny * 1.15 + 0.12, 0, 1), 0.58);
    _c.copy(_hor).lerp(_top, k);
    const dot = domeDirs[i * 3] * sunDir.x + domeDirs[i * 3 + 1] * sunDir.y + domeDirs[i * 3 + 2] * sunDir.z;
    if (dot > 0) {
      const glow = Math.pow(dot, 6) * (0.38 * duskF * (1 - nightF) + 0.10 * dayF) + dot * dot * 0.06 * dayF;
      if (glow > 0.004) _c.lerp(_sunC, Math.min(0.5, glow));
    } else if (nightF > 0.02) {
      const mg = Math.pow(-dot, 8) * nightF * 0.12;
      if (mg > 0.004) _c.lerp(SKY.moon, mg);
    }
    colA.setXYZ(i, _c.r, _c.g, _c.b);
  }
  colA.needsUpdate = true;

  // fog tinted toward the leaves during the day (lighter tint keeps the far street tunnels open, not murky)
  _fogC.copy(_hor).lerp(COL.moss, 0.26 * dayF);
  scene.fog.color.copy(_fogC);
  renderer.setClearColor(_fogC);

  // lights
  const moonUp = -sunElev > 0.02;
  if (sunElev > -0.04) {
    sun.color.copy(_sunC);
    sun.intensity = 0.15 + dayF * 1.6;
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 170);
  } else if (moonUp) {
    sun.color.copy(SKY.moon);
    sun.intensity = 0.5;
    sun.position.copy(sun.target.position).addScaledVector(sunDir, -170);
  } else {
    sun.intensity = 0.14;
  }
  hemi.intensity = 0.37 + dayF * 1.14;   // higher daytime sky-fill lifts the shaded understory (night = 0.37, unchanged)
  // raw night-sky colors are near-black, so lerp toward moonlight or the night floor does nothing
  hemi.color.copy(_top).lerp(_hor, 0.6).lerp(SKY.moon, nightF * 0.55);
  amb.intensity = 0.26 + dayF * 0.50 + nightF * 0.2;   // brighter daytime ambient floor for deep-shade streets

  /* Canopy sea. This USED to be `COL.leafB * (0.16 + dayF*0.95)` on an unlit MeshBasicMaterial,
     i.e. the day/night swing was painted by hand. The sea is lit now, so that ramp would double
     count: the lights above already swing the roof by sun 0.15→1.75, hemi 0.37→1.51, amb
     0.26→0.76, a total of ×3.0 from night to noon — while the old hand ramp was ×6.9. What is
     left for the material is (a) an ALBEDO, not a brightness, and (b) the ×2.3 shortfall, so
     night still reads as night rather than as dim daylight. Hence a shallow 0.42→1.0 albedo
     ramp (0.42 × 3.0 ≈ the old 0.144 night/day ratio) plus a cool moonlit tint — the roof goes
     blue-grey under the moon, which no amount of green multiply ever gave. envMapIntensity
     rides the same curve so the sky probe does not light a night canopy like an overcast noon. */
  _seaAlb.copy(SEA_ALBEDO).multiplyScalar(0.42 + dayF * 0.58).lerp(SEA_MOON, nightF * 0.42);
  seaMat.color.copy(_seaAlb);
  seaMat.envMapIntensity = 0.07 + dayF * 0.15;

  // sky objects
  sunSprite.position.copy(sunDir).multiplyScalar(700);
  sunSprite.material.color.copy(_sunC);
  sunSprite.material.opacity = smooth(-0.09, 0.02, sunElev);
  moonSprite.position.copy(sunDir).multiplyScalar(-690);
  moonSprite.material.opacity = nightF * 0.9;
  stars.material.opacity = nightF * 0.9;
  starsDim.material.opacity = nightF * 0.55;
  for (const cl of clouds) {
    cl.material.opacity = 0.06 + dayF * 0.16;
    cl.material.color.copy(SKY.sunHigh).lerp(_sunC, duskF * 0.75);   // white by day, ember at dusk
  }

  // emissives
  matBld.emissiveIntensity = nightF * 0.9 + duskF * 0.15;
  matGlow.emissiveIntensity = nightF * 2.4;
  matLamp.emissiveIntensity = nightF * 2.6 + duskF * 0.4;
  // Little details: dawn puddles. "dew" rises after sunrise (~t 0.20) and dries by noon
  // (~t 0.52); puddle discs are batched per chunk but share matPuddle, so one opacity drive
  // fades them all together (invisible at night and afternoon).
  const dew = smooth(0.19, 0.30, t) * (1 - smooth(0.42, 0.54, t));
  dewF = dew;   // Life pass: drips under bridges/viaducts read this (entities.js)
  matPuddle.opacity = 0.62 * dew;

  // Living water (Feature A): drift the two ripple layers in opposite directions so the
  // canals read as slow flow, the counter-motion beating into a faint shimmer. And drive
  // matWater's emissive sparkle by day — a sky-blue glint at noon that dies at night, on
  // top of the material's blue body so daylight water stays clearly blue.
  const wdt = dt || 0;
  texWater.offset.x += wdt * 0.008; texWater.offset.y += wdt * 0.003;
  texWater2.offset.x -= wdt * 0.005; texWater2.offset.y -= wdt * 0.003;
  matWater.emissiveIntensity = dayF * 0.10;

  // Sky probe refresh: ~1 s cadence (sun moves <1% of the cycle between refreshes).
  // dt is undefined on the initial synchronous call — force that first refresh.
  _envAccum += (dt || 0);
  if (_envAccum >= 1 || !_envDone) {
    _envAccum = 0; _envDone = true;
    sunEnv.position.copy(sunSprite.position);
    moonEnv.position.copy(moonSprite.position);
    refreshEnvProbe();
  }
}

/* ======================================================================== */
/*  CANOPY SEA — the endless roof of leaves, seen from above                */
/* ======================================================================== */
/* This is the game's signature view: climb the Spire, turn round, and the forest roof runs
   to every horizon. It used to be an UNLIT MeshBasicMaterial disc — a painted texture at one
   fixed height — which can only ever read as green felt: no sun rakes across it, there is no
   terminator at dawn, and a flat disc has no silhouette. It is now a LIT, NORMAL-MAPPED,
   VERTICALLY DISPLACED surface:

     · MeshStandardMaterial, so sun / hemisphere / ambient / the sky probe all reach it and
       the roof shades with the hour (see the colour drive in updateSky above — with a lit
       material the material colour is an ALBEDO, not a brightness ramp);
     · a Sobel normal map off a drawn height field, so individual crowns catch the light;
     · real vertical displacement from world-space value noise, so the roof undulates and its
       far edge is ragged instead of a ruled line;
     · per-vertex species / moisture tint sampled from the SAME macro region field the chunk
       builders use (_verdancy/_ruin), so a scorch band in the distance really is olive.

   Everything here is world-locked: positionSea() re-bakes displacement, UVs and tint at a
   16 m snap exactly the way positionGround() re-displaces the floor sheet, because the mesh
   itself is parked on the player every frame. Without that the whole roof would swim.

   RNG: the ring is standalone geometry (never emitted through Batch.addGeo) and the texture
   draws from its own mulberry32(2024), so nothing in this section touches the worldgen rng
   stream — verified by diffing the worldgen fingerprint before/after. */
const SEA_TILE = 190;            // metres covered by one texture tile
const SEA_INNER = 110, SEA_OUTER = 950;
/* Relief amplitude. Note this is the NOMINAL swing, not the swing you get: three octaves of
   valueNoise2 summed toward a mean land in roughly the middle half of the range (the same
   reason TERRAIN_AMP 1.1 only ever produces ~±0.6 m of ground), so a nominal 12 reads as a
   roof that rises and falls by ~6 m — which is what a real closed canopy does between a
   gap and an emergent. */
const SEA_AMP = 17;
const SEA_LIFT = 2.0;            // mean roof height above the ring's base y

/* The canopy sheet, drawn at TRUE WORLD SCALE. One tile = SEA_TILE metres at S px, so a
   crown is painted the size a crown actually is (9-27 m across) instead of as a dot, and
   the lobed outline / gap shadow / clump texture all land at the metre scale they should. */
function makeSeaTexture() {
  const S = 1024, r = mulberry32(2024);
  const PM = S / SEA_TILE;                                   // ≈5.39 px per metre
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const cH = makeCanvas(S, S), xh = cH.getContext('2d');     // height field → normal map
  x.fillStyle = '#0c1808'; x.fillRect(0, 0, S, S);           // the gap floor: deep shade between crowns
  xh.fillStyle = '#1c1c1c'; xh.fillRect(0, 0, S, S);         // gaps are the LOW ground of the height field

  /* Seam handling. core.js's makeSurfaceTexture uses wrap(), which replays EVERY mark at all
     8 neighbour offsets; at this feature size that is 9× the fill cost for nothing, because a
     crown well inside the sheet can never cross an edge. wrapAt() replays a mark only on the
     sides it actually reaches (1 copy for an interior mark, up to 4 in a corner) — same
     seamless result, a fifth of the work. The core.js warning still applies in full: every
     random a mark uses MUST be drawn before the wrapAt call, or the copies diverge and the
     seam comes straight back. Everything below obeys that. */
  const wrapAt = (mx, my, rad, fn) => {
    const xs = mx < rad ? [0, S] : (mx > S - rad ? [0, -S] : [0]);
    const ys = my < rad ? [0, S] : (my > S - rad ? [0, -S] : [0]);
    for (const ox of xs) for (const oy of ys) fn(ox, oy);
  };

  // A crown outline is not a circle. Two sine harmonics give it big lobes, a smoothed random
  // ring gives the ragged sub-lobe edge — the cauliflower silhouette you actually see from
  // above. All of it is baked per crown, before any drawing.
  const LOBE_N = 40;
  function shape() {
    let j = new Float32Array(LOBE_N);
    for (let i = 0; i < LOBE_N; i++) j[i] = (r() - 0.5) * 0.24;
    for (let pass = 0; pass < 3; pass++) {                   // circular 3-tap smooth: lumpy, not spiky
      const o = new Float32Array(LOBE_N);
      for (let i = 0; i < LOBE_N; i++)
        o[i] = (j[(i + LOBE_N - 1) % LOBE_N] + 2 * j[i] + j[(i + 1) % LOBE_N]) * 0.25;
      j = o;
    }
    return { j, a1: 0.055 + r() * 0.065, f1: 5 + (r() * 5 | 0), p1: r() * 7, a2: 0.028 + r() * 0.036, f2: 11 + (r() * 8 | 0), p2: r() * 7 };
  }
  const lobe = (ctx, cx2, cy2, rad, k) => {
    ctx.beginPath();
    for (let i = 0; i <= LOBE_N; i++) {
      const a = i / LOBE_N * Math.PI * 2;
      const m = 1 + k.a1 * Math.sin(a * k.f1 + k.p1) + k.a2 * Math.sin(a * k.f2 + k.p2) + k.j[i % LOBE_N];
      const px = cx2 + Math.cos(a) * rad * m, py = cy2 + Math.sin(a) * rad * m;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  };
  const grey = v => { const g = Math.round(clamp(v, 0, 1) * 255); return `rgb(${g},${g},${g})`; };

  // 1) varied gap floor — the shade between crowns is not one flat value
  for (let i = 0; i < 90; i++) {
    const gx = r() * S, gy = r() * S, gr = (1.5 + r() * 6) * PM, dark = r() < 0.6, a = 0.25 + r() * 0.4;
    wrapAt(gx, gy, gr, (ox, oy) => {
      const g = x.createRadialGradient(gx + ox, gy + oy, 1, gx + ox, gy + oy, gr);
      g.addColorStop(0, dark ? `rgba(3,8,3,${a})` : `rgba(30,40,18,${a * 0.7})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(gx + ox, gy + oy, gr, 0, 7); x.fill();
    });
  }

  /* 2) the crowns. A jittered grid packs them the way a closed canopy actually packs — no
     lattice, no bald patches — and every crown carries its own height so the roof is a set of
     domes at DIFFERENT elevations rather than one embossed sheet. Drawn shortest-first, so a
     taller crown paints over its neighbours exactly as it occludes them from above. */
  const crowns = [];
  const G = 15, cell = S / G;                                // ≈12.7 m grid
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    // mean crown a little NARROWER than the grid cell, so the shadow gaps between crowns
    // survive instead of being paved over — the gaps are half of what says "forest" from above
    crowns.push(mkCrown((gx + 0.5 + (r() - 0.5) * 0.9) * cell, (gy + 0.5 + (r() - 0.5) * 0.9) * cell,
      (4.0 + r() * 4.7) * PM, 0.40 + r() * 0.30));
  }
  for (let i = 0; i < 14; i++)                               // emergents: giants a head above the roof
    crowns.push(mkCrown(r() * S, r() * S, (7.5 + r() * 5) * PM, 0.80 + r() * 0.20));
  function mkCrown(cx2, cy2, rad, top) {
    const k = {
      cx: cx2, cy: cy2, rad, top, sh: shape(),
      hue: 88 + (r() - 0.5) * 26, sat: 26 + r() * 24, lig: 12 + r() * 10,
      bl: []
    };
    for (let b = 0, n = 4 + (r() * 4 | 0); b < n; b++) {     // interior lobe clusters
      const a = r() * 7, d = (0.14 + r() * 0.44) * rad;
      k.bl.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, rr: (0.22 + r() * 0.34) * rad, dl: (r() - 0.5) * 9, sh: shape() });
    }
    return k;
  }
  crowns.sort((a, b) => a.top - b.top);
  for (const k of crowns) {
    wrapAt(k.cx, k.cy, k.rad * 1.4, (ox, oy) => {
      const cx2 = k.cx + ox, cy2 = k.cy + oy;
      // contact shadow the crown drops into the gap around it
      lobe(x, cx2, cy2, k.rad * 1.14, k.sh);
      x.fillStyle = 'rgba(4,10,4,0.55)'; x.fill();
      // body + view-independent AO (rim darker than crest). Baked directional light is
      // deliberately absent: the material is lit now, the normal map does that job.
      lobe(x, cx2, cy2, k.rad, k.sh);
      const g = x.createRadialGradient(cx2, cy2, k.rad * 0.12, cx2, cy2, k.rad * 1.02);
      g.addColorStop(0, `hsl(${k.hue},${k.sat}%,${k.lig + 2}%)`);
      g.addColorStop(0.62, `hsl(${k.hue},${k.sat}%,${k.lig}%)`);
      g.addColorStop(1, `hsl(${k.hue},${k.sat + 6}%,${Math.max(4, k.lig - 9)}%)`);
      x.fillStyle = g; x.fill();
      for (const b of k.bl) {
        lobe(x, cx2 + b.dx, cy2 + b.dy, b.rr, b.sh);
        const gb = x.createRadialGradient(cx2 + b.dx, cy2 + b.dy, 1, cx2 + b.dx, cy2 + b.dy, b.rr);
        gb.addColorStop(0, `hsla(${k.hue},${k.sat}%,${clamp(k.lig + b.dl + 2, 4, 60)}%,0.7)`);
        gb.addColorStop(1, `hsla(${k.hue},${k.sat}%,${clamp(k.lig + b.dl - 5, 3, 60)}%,0.1)`);
        x.fillStyle = gb; x.fill();
      }
      // height field: a dome from the crown's own top elevation down to the gap floor
      lobe(xh, cx2, cy2, k.rad * 1.01, k.sh);
      const gh = xh.createRadialGradient(cx2, cy2, k.rad * 0.06, cx2, cy2, k.rad * 1.01);
      gh.addColorStop(0, grey(k.top));
      gh.addColorStop(0.5, grey(k.top - 0.04));
      gh.addColorStop(0.86, grey(k.top - 0.13));
      gh.addColorStop(1, grey(k.top - 0.28));
      xh.fillStyle = gh; xh.fill();
      for (const b of k.bl) {
        lobe(xh, cx2 + b.dx, cy2 + b.dy, b.rr, b.sh);
        const gb = xh.createRadialGradient(cx2 + b.dx, cy2 + b.dy, 1, cx2 + b.dx, cy2 + b.dy, b.rr);
        gb.addColorStop(0, `rgba(255,255,255,${0.30 + (b.dl + 4.5) * 0.022})`);
        gb.addColorStop(0.7, `rgba(255,255,255,${0.12 + (b.dl + 4.5) * 0.012})`);
        gb.addColorStop(1, 'rgba(255,255,255,0)');
        xh.fillStyle = gb; xh.fill();
      }
    });
  }

  // 3) leaf-clump texture — 0.7-4 m masses, the scale you can actually resolve on a crown
  //    from a few hundred metres up. Also ripples the height field so the domes aren't smooth.
  for (let i = 0; i < 5000; i++) {
    const px = r() * S, py = r() * S, rr = (0.35 + r() * 1.6) * PM;
    const up = r() < 0.46, a = 0.04 + r() * 0.08;
    const col = up ? `rgba(${104 + r() * 46 | 0},${132 + r() * 48 | 0},${52 + r() * 30 | 0},${a})`
                   : `rgba(${8 + r() * 14 | 0},${16 + r() * 18 | 0},${6 + r() * 10 | 0},${a * 1.7})`;
    const hv = up ? 168 + r() * 40 : 88 - r() * 40;
    wrapAt(px, py, rr, (ox, oy) => {
      x.fillStyle = col; x.beginPath(); x.arc(px + ox, py + oy, rr, 0, 7); x.fill();
      xh.fillStyle = `rgba(${hv | 0},${hv | 0},${hv | 0},0.2)`;
      xh.beginPath(); xh.arc(px + ox, py + oy, rr, 0, 7); xh.fill();
    });
  }

  // 4) dead / bare crowns and vine-choked ones: a handful of odd notes so the roof is not
  //    one species. Cheap, and the eye finds them immediately from the Spire.
  for (let i = 0; i < 12; i++) {
    const px = r() * S, py = r() * S, rr = (3 + r() * 4) * PM, sh = shape(), dead = r() < 0.5;
    const col = dead ? `rgba(${74 + r() * 26 | 0},${64 + r() * 20 | 0},${34 + r() * 16 | 0},0.55)`
                     : `rgba(${44 + r() * 22 | 0},${88 + r() * 36 | 0},${34 + r() * 18 | 0},0.5)`;
    wrapAt(px, py, rr * 1.4, (ox, oy) => {
      lobe(x, px + ox, py + oy, rr, sh); x.fillStyle = col; x.fill();
    });
  }

  wrapBlur(cH, 2.6);                                         // crown edges become shoulders, not cliffs
  const map = canvasTex(c);
  const normal = normalFromHeight(cH, 1.9);
  for (const t of [map, normal]) t.repeat.set(1, 1);         // UVs are baked in world metres by positionSea
  return { map, normal };
}

const _seaTex = makeSeaTexture();
/* Lit, so the sun rakes it and a terminator crosses it at dawn/dusk. The sky probe supplies
   the blue/amber bounce a hemisphere light alone cannot. side: DoubleSide is load-bearing —
   from a shallow angle across 900 m of undulation you DO see the far flank of a crest, and
   with FrontSide those became holes straight through to the sky. */
const seaMat = new THREE.MeshStandardMaterial({
  map: _seaTex.map, normalMap: _seaTex.normal, normalScale: new THREE.Vector2(1.25, 1.25),
  vertexColors: true, transparent: true, opacity: 0, depthWrite: true,
  roughness: 0.97, metalness: 0, side: THREE.DoubleSide,
  envMap: envRT.texture, envMapIntensity: 0.2
});
/* Fog curve. scene.fog is linear and saturates at fog.far (580 m up here) while the camera
   far plane is 700, so past ~580 m the roof is one flat wash — every bit of relief the
   displacement buys is eaten before the horizon. Delaying the ramp (fog ^1.6) keeps crowns
   and shadow gaps readable a couple of hundred metres further out while STILL reaching full
   saturation at exactly fog.far, so the ring never shows a hard cut where the far plane
   slices it (the cube is the gentlest curve that still leaves the roof legible at ~500 m).
   Only this material is affected — the real leaf blobs beside it fog normally, which is only
   detectable inside ~220 m where the sea is tucked under them anyway. */
seaMat.onBeforeCompile = (shader) => {
  /* Kill the grazing-angle sheen FIRST. This one is not cosmetic: r152's standard material
     fixes specularF90 at 1.0, so Schlick's Fresnel climbs to ~0.35 white at the shallow angles
     you view a canopy from a tower — and with an albedo this dark that white term was running
     about 3× the diffuse. The result was a roof that turned into a pale tan sheet every time
     the sun sat low AHEAD of the camera (classic sun-glitter geometry, mirror lobe pointing
     straight back at you). Leaves do have a waxy sheen — matLeaf keeps one — but on a proxy
     surface standing in for a square kilometre of foliage it is pure artefact. */
  const S = '#include <lights_physical_fragment>';
  if (shader.fragmentShader.indexOf(S) === -1)
    console.error('CANOPY sea specular damp: anchor "' + S + '" not found in the r152 shader — the roof will glint');
  shader.fragmentShader = shader.fragmentShader.replace(S,
    S + '\n  material.specularColor *= 0.30;\n  material.specularF90 = 0.22;\n');
  const A = '#include <fog_fragment>';
  if (shader.fragmentShader.indexOf(A) === -1)
    console.error('CANOPY sea fog curve: anchor "' + A + '" not found in the r152 shader — sea fogs normally');
  shader.fragmentShader = shader.fragmentShader.replace(A,
    '#ifdef USE_FOG\n'
    + '  float _sf = smoothstep(fogNear, fogFar, vFogDepth);\n'
    + '  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, _sf * _sf * _sf);\n'
    + '#endif\n');
};
seaMat.customProgramCacheKey = () => 'canopy-sea-fog';

/* Ring layout. Radial rings are re-spaced GEOMETRICALLY (r = inner·(outer/inner)^t) because
   a surface seen from above projects as ~1/r: uniform radial steps put almost every ring in
   the last few pixels of the view and leave the near roof faceted. 160×56 ≈ 9.2 k verts /
   18 k tris, which is noise next to the ~500 k the city already draws. */
const seaGeo = new THREE.RingGeometry(SEA_INNER, SEA_OUTER, 160, 56);
const SEA_N = seaGeo.attributes.position.count;
const _seaRamp = new Float32Array(SEA_N);      // relief fades in past the real leaf geometry
{
  const p = seaGeo.attributes.position, a = p.array;
  const LOGR = Math.log(SEA_OUTER / SEA_INNER);
  const col = new Float32Array(SEA_N * 4);
  for (let i = 0, o = 0; i < SEA_N; i++, o += 3) {
    const r0 = Math.hypot(a[o], a[o + 1]) || 1;
    const t = (r0 - SEA_INNER) / (SEA_OUTER - SEA_INNER);
    const r1 = SEA_INNER * Math.exp(LOGR * t);
    a[o] *= r1 / r0; a[o + 1] *= r1 / r0;
    _seaRamp[i] = smooth(SEA_INNER, 300, r1);
    // Blend into the real leaf blobs at the inner rim: the painted roof fades out under the
    // crowns you can actually see instead of ending on a drawn circle. Vertex ALPHA, so the
    // ring stays a single draw. Safe against depthWrite because opaque geometry has already
    // been drawn by the time the transparent pass reaches the sea.
    col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1;
    col[i * 4 + 3] = smooth(SEA_INNER + 2, SEA_INNER + 38, r1);
  }
  p.needsUpdate = true;
  seaGeo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  seaGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(SEA_N * 2), 2));
}
const sea = new THREE.Mesh(seaGeo, seaMat);
sea.rotation.x = -Math.PI / 2;
sea.position.y = 26.5;
sea.visible = false;
sea.frustumCulled = false;      // it is always centred on the player; the bounding sphere lies after displacement
scene.add(sea);

// Roof relief. Three octaves of the same value noise the terrain uses, amplitude modulated by
// the macro verdancy field so a deepgreen stand really does pile up higher than a scorch flat.
function seaHeight(x, z, verd) {
  const amp = SEA_AMP * (0.6 + 0.8 * verd);
  return SEA_LIFT + (0.58 * valueNoise2(x / 178, z / 178, 5501)
                   + 0.27 * valueNoise2(x / 61, z / 61, 5502)
                   + 0.15 * valueNoise2(x / 22, z / 22, 5503)) * 2 * amp - amp;
}
// Species / moisture tint, as a multiplier over the sheet. Sampled from the SAME macro region
// field regionBiome() thresholds, so the distant roof agrees with the biome you walk into:
// olive where the canopy failed, near-black green where the flora won, grey where the city died.
const SEA_SCORCH = new THREE.Color(1.30, 1.06, 0.50);
const SEA_DEEP = new THREE.Color(0.66, 1.02, 0.58);
const SEA_ASH = new THREE.Color(1.10, 1.08, 1.24);
function seaTint(x, z, verd, ruin, out) {
  const moist = 0.86 + 0.26 * valueNoise2(x / 132, z / 132, 5511);
  out.setRGB(moist, moist, moist);
  // Windows track regionBiome's own thresholds (0.32 / 0.66) so the far roof changes colour
  // where the biome actually changes — a wider window just paints most of the world olive.
  if (verd < 0.36) out.lerp(SEA_SCORCH, smooth(0.36, 0.22, verd) * 0.85);
  else if (verd > 0.62) out.lerp(SEA_DEEP, smooth(0.62, 0.74, verd) * 0.8);
  if (ruin > 0.62 && verd >= 0.36 && verd <= 0.66) out.lerp(SEA_ASH, smooth(0.62, 0.74, ruin) * 0.7);
  return out;
}
/* Re-bake the roof at an (px, pz) snap — the same contract as positionGround(). The mesh is
   parked on the player every frame, so displacement, UVs and tint all have to be recomputed
   in the new local frame or the whole forest swims along with you. Rotation −90° about x maps
   local (lx, ly, lz) → world (lx, lz, −ly), so the world lookup is (px + lx, pz − ly) and the
   height goes into the LOCAL z. UVs follow PlaneGeometry's convention (v grows with local +y)
   so the normal map's handedness matches the ground sheet's. */
const _seaTintC = new THREE.Color();
let _seaAtX = NaN, _seaAtZ = NaN;
function positionSea(px, pz) {
  if (px === _seaAtX && pz === _seaAtZ) return;
  _seaAtX = px; _seaAtZ = pz;
  const p = seaGeo.attributes.position, a = p.array;
  const uv = seaGeo.attributes.uv, ua = uv.array;
  const cA = seaGeo.attributes.color, ca = cA.array;
  // verdancy/ruin are shared by the relief and the tint, so they are sampled ONCE per vertex
  // and handed to both — each is two valueNoise2 calls and this loop runs 9 k times per snap.
  for (let i = 0, o = 0; i < SEA_N; i++, o += 3) {
    const wx = px + a[o], wz = pz - a[o + 1];
    const cx = wx / CHUNK, cz = wz / CHUNK;
    const verd = _verdancy(cx, cz), ruin = _ruin(cx, cz);
    a[o + 2] = _seaRamp[i] * seaHeight(wx, wz, verd);
    ua[i * 2] = wx / SEA_TILE; ua[i * 2 + 1] = -wz / SEA_TILE;
    seaTint(wx, wz, verd, ruin, _seaTintC);
    ca[i * 4] = _seaTintC.r; ca[i * 4 + 1] = _seaTintC.g; ca[i * 4 + 2] = _seaTintC.b;
  }
  p.needsUpdate = true; uv.needsUpdate = true; cA.needsUpdate = true;
  seaGeo.computeVertexNormals();
}
positionSea(0, 0);   // never render an undisplaced flat disc, not even on frame one

/* ======================================================================== */
/*  GROUND                                                                  */
/* ======================================================================== */
// The plane is 640 m across and the floor sheet tiles every GROUND_TILE metres.
const GROUND_REPEAT = 640 / GROUND_TILE;
texGround.repeat.set(GROUND_REPEAT, GROUND_REPEAT);
texGroundNormal.repeat.set(GROUND_REPEAT, GROUND_REPEAT);
texGroundRough.repeat.set(GROUND_REPEAT, GROUND_REPEAT);
// Sinkhole mouths: the plane opacity-covers anything sunk below y=0 (see the canal fix in
// worldgen-anomalies.js — canals raise their water above y=0 instead; a sinkhole bowl can't
// be raised), so the material discards fragments inside up to MAX_GROUND_HOLES world-space
// circles via onBeforeCompile. Depth is discarded too, so the bowl renders through the hole.
// syncGroundHoles() rebuilds the uniform set from live chunks' round pits whenever the chunk
// set changes; _groundShader is captured at compile time so per-frame count updates land.
const MAX_GROUND_HOLES = 6;
const _holeVecs = Array.from({ length: MAX_GROUND_HOLES }, () => new THREE.Vector3());
let _groundShader = null;
const groundMat = new THREE.MeshStandardMaterial({
  map: texGround, normalMap: texGroundNormal, normalScale: new THREE.Vector2(1.1, 1.1),
  roughnessMap: texGroundRough, roughness: 1, metalness: 0,
  envMap: envRT.texture, envMapIntensity: 0.3
});
groundMat.onBeforeCompile = (shader) => {
  shader.uniforms.uHoles = { value: _holeVecs };
  // holes registered before this (lazy) first compile must survive — replay the pending count
  shader.uniforms.uHoleCount = { value: groundMat.userData.pendingHoleCount || 0 };
  // The plane is translated to the player every frame, so the hole test must run in world
  // XZ, not the plane's static UVs. r152 anchors verified below (throw-on-no-op guard).
  const VANCHOR = '#include <begin_vertex>';
  if (shader.vertexShader.indexOf(VANCHOR) === -1)
    console.error('CANOPY ground hole-punch: vertex anchor "' + VANCHOR + '" not found in r152 shader — hole punch is a no-op');
  shader.vertexShader = 'varying vec2 vGroundW;\n' + shader.vertexShader.replace(
    VANCHOR,
    VANCHOR + '\n  vGroundW = (modelMatrix * vec4(position, 1.0)).xz;');
  const FANCHOR = '#include <clipping_planes_fragment>';
  if (shader.fragmentShader.indexOf(FANCHOR) === -1)
    console.error('CANOPY ground hole-punch: fragment anchor "' + FANCHOR + '" not found in r152 shader — hole punch is a no-op');
  shader.fragmentShader = ('varying vec2 vGroundW;\nuniform vec3 uHoles[' + MAX_GROUND_HOLES + '];\nuniform int uHoleCount;\n')
    + shader.fragmentShader.replace(
    FANCHOR,
    'for (int i = 0; i < ' + MAX_GROUND_HOLES + '; i++) {\n'
    + '  if (i >= uHoleCount) break;\n'
    + '  vec2 d = vGroundW - uHoles[i].xy;\n'        // uHoles[i].xy = pit world XZ, .z = radius
    + '  if (dot(d, d) < uHoles[i].z * uHoles[i].z) discard;\n'
    + '}\n' + FANCHOR);
  _groundShader = shader;
};
groundMat.customProgramCacheKey = () => 'canopy-ground-holes';

/* Terrain: the floor sheet is no longer two triangles. It is a 192×192 tessellated plane
   (37 249 verts, 3.33 m per quad — fine enough for terrainY's shortest 12.5 m octave) whose
   vertices are displaced by terrainY at their WORLD position. Because main.js keeps re-
   centring the plane on the player snapped to an 8 m grid (one GROUND_TILE, so the floor
   texture stays world-locked), the displacement is not a one-off: every snap moves the whole
   lattice to new world coordinates and the heights must be recomputed, followed by
   computeVertexNormals so raking sun and lamplight read the relief. Measured ≈6 ms per snap
   for the sampling; snaps happen every 8 m walked.
   The plane is authored in local XY with +z as its normal, then rotated −90° about x, which
   maps local (lx, ly, lz) → world (lx, lz, −ly) before the mesh position is added. So the
   world lookup is (px + lx, pz − ly) and the height goes into the LOCAL z component.
   The hole-punch shader is untouched: it recomputes vGroundW from modelMatrix * position,
   so it keys off the displaced world XZ exactly as before. */
const GROUND_SIZE = 640, GROUND_SEG = 192;
const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEG, GROUND_SEG);
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
let _groundAtX = NaN, _groundAtZ = NaN;
// Move the floor sheet to an 8 m-snapped (px, pz) and re-displace it. No-op when the snap
// did not change, which is the common frame.
function positionGround(px, pz) {
  if (px === _groundAtX && pz === _groundAtZ) return;
  _groundAtX = px; _groundAtZ = pz;
  ground.position.set(px, 0, pz);
  const attr = groundGeo.attributes.position, a = attr.array;
  for (let o = 0, n = attr.count * 3; o < n; o += 3) a[o + 2] = terrainY(px + a[o], pz - a[o + 1]);
  attr.needsUpdate = true;
  groundGeo.computeVertexNormals();
}
positionGround(0, 0);   // displace once at load so the first frame is never a flat sheet

// Rebuild the hole uniform set from every live chunk's round pits (sinkhole bowls; rect pits
// are canals, handled by the raised waterline instead). Called from ensureChunks ONLY when
// the chunk set changed. Radius pit.r - 0.4 is deliberately SMALLER than the funnel's top
// ring (Part 2) so the plane edge always overlaps the funnel lip — no see-through sliver.
function syncGroundHoles(px, pz) {
  const found = [];
  for (const [, c] of chunks)
    for (const p of c.colData.pits)
      if (p.r) found.push(p);            // round pits = sinkhole bowls (rect pits are canals)
  if (found.length > MAX_GROUND_HOLES)   // keep the nearest MAX when more bowls are loaded than slots
    found.sort((a, b) => ((a.x - px) ** 2 + (a.z - pz) ** 2) - ((b.x - px) ** 2 + (b.z - pz) ** 2));
  const n = Math.min(found.length, MAX_GROUND_HOLES);
  for (let i = 0; i < n; i++) _holeVecs[i].set(found[i].x, found[i].z, found[i].r - 0.4);
  if (_groundShader) _groundShader.uniforms.uHoleCount.value = n;
  else groundMat.userData.pendingHoleCount = n;   // shader compiles lazily; count re-applied in onBeforeCompile
}

