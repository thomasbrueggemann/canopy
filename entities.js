/* CANOPY split file  entities: particles (pollen/fireflies) and cloaked citizens (was game.js lines 2688-2926). Header/error-handler in core.js. */
'use strict';
/* ======================================================================== */
/*  WIND — one cheap global state driving foliage shimmer, pollen & cloth    */
/*  Batched chunk geometry (vine curtains, wall vines, weave fringe, grass)  */
/*  can't be animated per-vertex, so foliage "breathes" by a shared UV-offset*/
/*  wobble on matVine/matGrass. Particles & banners read wind.gust/dir.      */
/* ======================================================================== */
const wind = { dirX: 0.86, dirZ: 0.51, gust: 0, strength: 0 };
// g(t): two sines beating together + an occasional stronger gust envelope. Range ~[-1.6, 1.9].
function windGust(t) {
  const base = Math.sin(t * 0.47) * 0.55 + Math.sin(t * 0.23 + 1.3) * 0.45;
  const env = Math.max(0, Math.sin(t * 0.081 + 0.6));       // slow 0..1 swell
  return base * (0.7 + env * env * env * 1.7);
}
function updateWind(time) {
  wind.gust = windGust(time);
  wind.strength = 0.5 + wind.gust * 0.5;                     // ~0..1.4 loose amplitude
  // foliage shimmer: a tiny shared UV wobble — reads as leaves stirring, costs nothing.
  const w = Math.sin(time * 1.6) * 0.0022 + wind.gust * 0.006;
  texVine.offset.x = w; texVine.offset.y = w * 0.4;
  texGrass.offset.x = w * 0.7;
}

/* ======================================================================== */
/*  PARTICLES — pollen & fireflies                                          */
/* ======================================================================== */
function makeDrifters(n, boxR, boxH, size, color, additive) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), rs = mulberry32(n * 7 + 3);
  const seed = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rs() - 0.5) * boxR * 2; pos[i * 3 + 1] = rs() * boxH; pos[i * 3 + 2] = (rs() - 0.5) * boxR * 2;
    col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
    seed[i * 2] = rs() * 7; seed[i * 2 + 1] = 0.5 + rs() * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({
    size, map: texSoft, vertexColors: true, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 0.55
  }));
  m.frustumCulled = false;
  return { mesh: m, pos, col, seed, n, boxR, boxH, base: color };
}
const pollen = makeDrifters(340, 26, 22, 0.14, srgb(0xfff3c9), false);
scene.add(pollen.mesh);
const flies = makeDrifters(150, 30, 4, 0.35, srgb(0x9dffb0), true);
scene.add(flies.mesh);

function updateDrifters(time, px, py, pz) {
  updateWind(time);                                  // global wind advances every frame
  const wpx = wind.dirX * wind.strength * 0.02, wpz = wind.dirZ * wind.strength * 0.02;   // pollen drift bias
  // Regions: deepgreen night reads bioluminescent — fireflies glow ×1.8 over the player's chunk.
  const _fc = chunkAt(px, pz), flyMul = (_fc && _fc.region && _fc.region.biome === 'deepgreen') ? 1.8 : 1;
  // pollen drifts; both wrap around the player
  for (const D of [pollen, flies]) {
    const isFly = D === flies;
    for (let i = 0; i < D.n; i++) {
      let x = D.pos[i * 3], y = D.pos[i * 3 + 1], z = D.pos[i * 3 + 2];
      const s0 = D.seed[i * 2], s1 = D.seed[i * 2 + 1];
      if (isFly) {
        x += Math.sin(time * 0.7 * s1 + s0) * 0.02; z += Math.cos(time * 0.6 * s1 + s0 * 2) * 0.02;
        y += Math.sin(time * 0.9 * s1 + s0 * 3) * 0.008;
        const blink = Math.max(0, Math.sin(time * 2.2 * s1 + s0 * 5));
        const b = blink * blink * nightF * flyMul;
        D.col[i * 3] = D.base.r * b; D.col[i * 3 + 1] = D.base.g * b; D.col[i * 3 + 2] = D.base.b * b;
      } else {
        x += Math.sin(time * 0.22 + s0) * 0.012 + wpx; y -= 0.004 * s1; z += Math.cos(time * 0.18 + s0) * 0.012 + wpz;
      }
      // wrap into box around player
      const R = D.boxR;
      if (x - px > R) x -= R * 2; else if (px - x > R) x += R * 2;
      if (z - pz > R) z -= R * 2; else if (pz - z > R) z += R * 2;
      const yb = isFly ? 0.3 : py - 6, yt = isFly ? D.boxH : py + D.boxH;
      if (y < yb) y = yt; else if (y > yt) y = yb;
      D.pos[i * 3] = x; D.pos[i * 3 + 1] = y; D.pos[i * 3 + 2] = z;
    }
    D.mesh.geometry.attributes.position.needsUpdate = true;
    if (isFly) D.mesh.geometry.attributes.color.needsUpdate = true;
  }
  pollen.mesh.material.opacity = 0.24 + dayF * 0.3;
  flies.mesh.visible = nightF > 0.05;
}

/* ========================================================================= */
/*  PEOPLE — cloaked citizens of the canopy                                  */
/*                                                                           */
/*  A citizen used to be a 7-sided cone, a squashed sphere and a ball, all on */
/*  untextured MeshStandardMaterials with no map of any kind — which is why   */
/*  they read as faceted plastic cones in a hood. This is the cloth pass:     */
/*   · ONE shared woven sheet (albedo + height→normalMap + roughnessMap),     */
/*     drawn at TRUE WORLD SCALE: 1024 px covers CLOTH_U (0.628 m) of         */
/*     circumference and 2048 px covers CLOTH_H (1.18 m) of cloak — ≈1630     */
/*     px/m, 1 px ≈ 0.6 mm — so the 1.4 mm plain weave is a real 2-px         */
/*     over/under crossing of warp and weft, not a decorative pattern.        */
/*     u TILES ×4 round a cloak (four sewn panels, seam and all); v does NOT  */
/*     tile, so the sheet's vertical axis IS the garment: sun-bleached at the */
/*     collar, road dirt climbing the lower cloak, a stitched turned-up hem   */
/*     and an abraded edge at the very bottom.                                */
/*   · MeshPhysicalMaterial with sheen/sheenColor/sheenRoughness — r152's     */
/*     actual cloth lobe. A diffuse-only cloak stays plastic no matter what   */
/*     you paint on it; sheen is the retro-reflective halo that fibre ends    */
/*     throw at grazing angles, and it is most of what says "this is cloth"   */
/*     on a silhouette. Albedo stays LIGHT and neutral so the eight cloak     */
/*     colours are still plain tints over it (the trick matBark uses).        */
/*   · real drape in the GEOMETRY: 26 radial segments carrying seven fold     */
/*     ridges that twist as they fall and fade out at the shoulders, a bell   */
/*     hem with a closed underside, shoulders that broaden out of the cone,   */
/*     and a carved cowl hood — rolled rim, dark inner lining, an overhang    */
/*     that puts the face in a shadowed recess instead of on a bare ball.     */
/*  Everything is SHARED across every citizen alive: five geometries, one     */
/*  sheet, ten materials. Nothing is built per NPC.                           */
/*  SAFE TO RESHAPE: these are standalone Meshes added to a Group (never      */
/*  Batch.addGeo) that pick colours with Math.random(), not the worldgen rng  */
/*  — so vertex counts here cannot re-roll the world the way template changes */
/*  do (see the note above Batch.addGeo in core.js).                          */
/* ========================================================================= */

/* ------------------------------------------------------------ cloth sheet -- */
const CLOTH_U = 0.628;   // metres of circumference one sheet tile covers (4 panels/cloak)
const CLOTH_H = 1.18;    // metres of cloak the sheet's v axis covers (v=0 hem → v=1 collar)
function makeClothTexture() {
  const W = 1024, H = 2048, r = mulberry32(60217);
  const PX = W / CLOTH_U, PY = H / CLOTH_H;    // ≈1631 / ≈1735 px per metre
  const c = makeCanvas(W, H), x = c.getContext('2d');
  const cH = makeCanvas(W, H), xh = cH.getContext('2d');   // height field → normal map
  const WX = [-W, 0, W];

  /* 1) THE WEAVE. A plain over/under weave is a checkerboard of crossings: at half of
     them the warp (vertical yarn) floats over the weft, at the other half the weft
     floats over the warp. Both yarns keep a rounded cross-section, so every crossing
     is a little dome and every gap between two yarns is a pit — that pit lattice is
     what a normal map needs to make cloth catch a raking light like cloth.
     Written straight into ImageData: at 1.4 mm yarn this sheet is 448×843 crossings,
     and stroking two million of them through the 2d context would cost seconds. */
  const YARN = 0.0014;                                          // 1.4 mm — coarse homespun
  const NU = 2 * Math.max(1, Math.round(W / (YARN * PX) / 2));   // even, so the checker wraps in u
  const NV = Math.max(1, Math.round(H / (YARN * PY)));
  const CU = W / NU, CV = H / NV;
  const wTh = new Float32Array(NU), wTo = new Float32Array(NU);  // per-yarn thickness & dye tone
  for (let i = 0; i < NU; i++) { wTh[i] = 0.72 + r() * 0.52; wTo[i] = 0.90 + r() * 0.2; }
  const fTh = new Float32Array(NV), fTo = new Float32Array(NV);
  for (let i = 0; i < NV; i++) { fTh[i] = 0.72 + r() * 0.52; fTo[i] = 0.90 + r() * 0.2; }
  const img = x.createImageData(W, H), d = img.data;
  const imh = xh.createImageData(W, H), dh = imh.data;
  for (let py = 0; py < H; py++) {
    const fv = py / CV, jv = fv | 0, cv = fv - jv;
    const fth = fTh[jv], fto = fTo[jv];
    let b = (cv - 0.5) / (0.5 * fth); if (b < -1) b = -1; else if (b > 1) b = 1;
    const pv = 1 - b * b;
    const row = py * W * 4;
    for (let px = 0; px < W; px++) {
      const fu = px / CU, ju = fu | 0, cu = fu - ju;
      let a = (cu - 0.5) / (0.5 * wTh[ju]); if (a < -1) a = -1; else if (a > 1) a = 1;
      const pu = 1 - a * a;
      const over = ((ju + jv) & 1) === 0;
      const hg = over ? pu * 0.88 + pv * 0.24 : pv * 0.88 + pu * 0.24;
      const lit = 0.58 + 0.36 * (hg > 1 ? 1 : hg) + r() * 0.09 - 0.045;
      let v = 234 * lit * (over ? wTo[ju] : fto);
      if (v > 255) v = 255; else if (v < 0) v = 0;
      const o = row + px * 4;
      d[o] = v; d[o + 1] = v * 0.988; d[o + 2] = v * 0.968; d[o + 3] = 255;
      let hv = 128 + (hg - 0.56) * 155;
      if (hv > 255) hv = 255; else if (hv < 0) hv = 0;
      dh[o] = dh[o + 1] = dh[o + 2] = hv; dh[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0); xh.putImageData(imh, 0, 0);

  /* 2) uneven dye — hand-dyed cloth is never one flat colour, and this is the only
        layer big enough to survive the mip chain at 15 m. */
  for (let i = 0; i < 24; i++) {
    const bx = r() * W, by = r() * H, br = (0.05 + r() * 0.24) * PY, dark = r() < 0.5, a = 0.05 + r() * 0.09;
    for (const ox of WX) {
      if (bx + ox < -br || bx + ox > W + br) continue;
      const g = x.createRadialGradient(bx + ox, by, 1, bx + ox, by, br);
      g.addColorStop(0, dark ? `rgba(120,110,94,${a})` : `rgba(255,252,244,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(bx + ox, by, br, 0, 7); x.fill();
    }
  }

  /* 3) DRAPE. A fold is a lit ridge with a dark valley pinched under it, so each crease
        is drawn twice into the height field (a wide soft crest, then a narrow deep line)
        and once faintly into albedo. Horizontal "memory" creases come from a cloak
        being folded away; the long vertical wrinkles are the fabric hanging. The
        horizontal ones ride integer harmonics of the width so they tile in u. */
  const wave = (ctx, y0, cyc, amp, ph, lw, style, blur) => {
    ctx.save(); if (blur) ctx.filter = `blur(${blur}px)`;
    ctx.strokeStyle = style; ctx.lineWidth = Math.max(0.8, lw); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let px = -8; px <= W + 8; px += 8) ctx.lineTo(px, y0 + Math.sin(px / W * cyc * 6.283185 + ph) * amp);
    ctx.stroke(); ctx.restore();
  };
  for (let i = 0; i < 9; i++) {
    const y0 = (0.05 + r() * 0.9) * H, cyc = 1 + (r() * 3 | 0);
    const amp = (0.004 + r() * 0.018) * PY, ph = r() * 7, s = 0.55 + r() * 0.6;
    wave(xh, y0 - 0.007 * PY, cyc, amp, ph, 0.011 * PY * s, 'rgba(180,180,180,0.42)', 0.005 * PY);
    wave(xh, y0 + 0.002 * PY, cyc, amp, ph, 0.0038 * PY * s, 'rgba(80,80,80,0.5)', 0.002 * PY);
    wave(x, y0 - 0.006 * PY, cyc, amp, ph, 0.009 * PY * s, 'rgba(255,252,244,0.15)', 0.005 * PY);
    wave(x, y0 + 0.002 * PY, cyc, amp, ph, 0.0038 * PY * s, 'rgba(98,88,72,0.17)', 0.003 * PY);
  }
  const vwave = (ctx, x0, y0, y1, amp, cyc, ph, lw, style, blur) => {
    ctx.save(); if (blur) ctx.filter = `blur(${blur}px)`;
    ctx.strokeStyle = style; ctx.lineWidth = Math.max(0.8, lw); ctx.lineCap = 'round';
    for (const ox of WX) {
      if (x0 + ox < -amp - lw * 3 || x0 + ox > W + amp + lw * 3) continue;
      ctx.beginPath();
      for (let py = y0; py <= y1; py += 10) ctx.lineTo(x0 + ox + Math.sin(py / H * cyc * 6.283185 + ph) * amp, py);
      ctx.stroke();
    }
    ctx.restore();
  };
  for (let i = 0; i < 16; i++) {
    const x0 = r() * W, y1 = (0.35 + r() * 0.65) * H, y0 = y1 - (0.2 + r() * 0.55) * H;
    const amp = (0.01 + r() * 0.05) * PX, cyc = 0.4 + r() * 0.8, ph = r() * 7, s = 0.5 + r() * 0.7;
    vwave(xh, x0 - 0.006 * PX, y0, y1, amp, cyc, ph, 0.012 * PX * s, 'rgba(172,172,172,0.36)', 0.006 * PX);
    vwave(xh, x0 + 0.003 * PX, y0, y1, amp, cyc, ph, 0.004 * PX * s, 'rgba(86,86,86,0.44)', 0.002 * PX);
    vwave(x, x0 + 0.003 * PX, y0, y1, amp, cyc, ph, 0.005 * PX * s, 'rgba(98,88,72,0.13)', 0.003 * PX);
  }

  /* 4) SUN-FADE at the collar. Cloth bleaches from the top down: the shoulders lose
        pigment first, so the top of the sheet washes pale and slightly warm. */
  const gF = x.createLinearGradient(0, 0, 0, H * 0.44);
  gF.addColorStop(0, 'rgba(255,251,238,0.24)'); gF.addColorStop(0.45, 'rgba(255,251,238,0.09)');
  gF.addColorStop(1, 'rgba(255,251,238,0)');
  x.fillStyle = gF; x.fillRect(0, 0, W, H * 0.44);
  for (let i = 0; i < 9; i++) {                    // bleached unevenly, in patches
    const bx = r() * W, by = r() * H * 0.30, br = (0.06 + r() * 0.16) * PY;
    for (const ox of WX) {
      if (bx + ox < -br || bx + ox > W + br) continue;
      const g = x.createRadialGradient(bx + ox, by, 1, bx + ox, by, br);
      g.addColorStop(0, `rgba(255,253,244,${0.08 + r() * 0.12})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(bx + ox, by, br, 0, 7); x.fill();
    }
  }

  /* 5) ROAD DIRT climbing the lower cloak — a graded wash with a deliberately ragged
        upper edge (a straight gradient boundary reads as an airbrush), then spatter
        thrown up off a wet street, thinning fast with height. */
  const gD = x.createLinearGradient(0, H, 0, H * 0.58);
  gD.addColorStop(0, 'rgba(68,58,45,0.70)'); gD.addColorStop(0.35, 'rgba(90,78,60,0.34)');
  gD.addColorStop(0.75, 'rgba(96,86,68,0.10)'); gD.addColorStop(1, 'rgba(96,86,68,0)');
  x.fillStyle = gD; x.fillRect(0, H * 0.58, W, H * 0.42);
  for (let i = 0; i < 60; i++) {                   // ragged tide-line of grime
    const bx = r() * W, by = H - (0.06 + r() * r() * 0.34) * H, br = (0.03 + r() * 0.10) * PY;
    for (const ox of WX) {
      if (bx + ox < -br || bx + ox > W + br) continue;
      const g = x.createRadialGradient(bx + ox, by, 1, bx + ox, by, br);
      g.addColorStop(0, `rgba(70,60,46,${0.07 + r() * 0.13})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(bx + ox, by, br, 0, 7); x.fill();
    }
  }
  for (let i = 0; i < 1400; i++) {                 // spatter: 0.6–4 mm flecks, low and dense
    const sy = H - Math.pow(r(), 2.1) * 0.34 * H, sx = r() * W;
    const sr = (0.0003 + r() * r() * 0.0018) * PY, a = 0.12 + r() * 0.3;
    x.fillStyle = r() < 0.6 ? `rgba(58,48,36,${a})` : `rgba(96,84,58,${a * 0.8})`;
    x.beginPath(); x.ellipse(sx, sy, sr * (1 + r()), sr, r() * 3, 0, 7); x.fill();
    if (r() < 0.3) { xh.fillStyle = `rgba(150,150,150,${a * 0.5})`; xh.beginPath(); xh.arc(sx, sy, sr, 0, 7); xh.fill(); }
  }

  /* 6) THE HEM — a real garment edge: the cloth is turned up 26 mm and sewn, so there
        is a step in the height field, two lines of stitching, and below them the band
        that drags on the ground — abraded pale, with loose fibre pulled out of it. */
  const hemT = H - 0.026 * PY;
  xh.save(); xh.filter = `blur(${0.003 * PY}px)`;
  xh.fillStyle = 'rgba(196,196,196,0.5)'; xh.fillRect(-6, hemT, W + 12, H - hemT + 6); xh.restore();
  x.save(); x.filter = `blur(${0.004 * PY}px)`;
  x.fillStyle = 'rgba(255,250,240,0.10)'; x.fillRect(-6, hemT, W + 12, H - hemT + 6); x.restore();
  for (const sy of [H - 0.021 * PY, H - 0.0055 * PY]) {         // two rows of stitching
    const dash = 0.0038 * PX, gap = 0.0017 * PX;
    for (let px = r() * dash; px < W; px += dash + gap) {
      const wob = (r() - 0.5) * 0.0008 * PY;
      x.fillStyle = `rgba(84,72,56,${0.30 + r() * 0.22})`;
      x.fillRect(px, sy + wob, dash, 0.0012 * PY);
      x.fillStyle = `rgba(255,252,242,${0.12 + r() * 0.12})`;
      x.fillRect(px, sy + wob - 0.0011 * PY, dash, 0.0008 * PY);
      xh.fillStyle = `rgba(72,72,72,${0.4 + r() * 0.3})`;
      xh.fillRect(px, sy + wob, dash, 0.0011 * PY);
    }
  }
  const gW = x.createLinearGradient(0, H, 0, H - 0.05 * PY);    // ground-drag abrasion
  gW.addColorStop(0, 'rgba(228,222,208,0.32)'); gW.addColorStop(1, 'rgba(228,222,208,0)');
  x.fillStyle = gW; x.fillRect(0, H - 0.05 * PY, W, 0.05 * PY);
  for (let i = 0; i < 900; i++) {                               // fibre pulled out of the edge
    const fx = r() * W, fy = H - Math.pow(r(), 1.7) * 0.055 * PY;
    const fl = (0.0015 + r() * 0.007) * PY, tilt = (r() - 0.5) * 0.006 * PX;
    x.strokeStyle = `rgba(250,246,236,${0.10 + r() * 0.2})`; x.lineWidth = Math.max(0.7, 0.0004 * PY);
    x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx + tilt, fy + fl); x.stroke();
    xh.strokeStyle = `rgba(170,170,170,${0.12 + r() * 0.2})`; xh.lineWidth = Math.max(0.7, 0.0004 * PY);
    xh.beginPath(); xh.moveTo(fx, fy); xh.lineTo(fx + tilt, fy + fl); xh.stroke();
  }

  /* 7) THE PANEL SEAM at the tile edge — a cloak is sewn from panels, and because u
        tiles ×4 this single seam becomes four running the full height of the garment. */
  for (const ox of [0, W]) {
    const sw = 0.005 * PX;
    xh.save(); xh.filter = `blur(${0.0015 * PX}px)`;
    xh.fillStyle = 'rgba(190,190,190,0.5)'; xh.fillRect(ox - sw, -4, sw * 2, H + 8); xh.restore();
    x.save(); x.filter = `blur(${0.002 * PX}px)`;
    x.fillStyle = 'rgba(255,250,240,0.09)'; x.fillRect(ox - sw, -4, sw * 2, H + 8);
    x.fillStyle = 'rgba(92,82,66,0.16)'; x.fillRect(ox - 0.0009 * PX, -4, 0.0018 * PX, H + 8); x.restore();
    for (const sx of [ox - sw * 0.72, ox + sw * 0.72]) {
      const dash = 0.0038 * PY, gap = 0.0017 * PY;
      for (let py = r() * dash; py < H; py += dash + gap) {
        x.fillStyle = `rgba(86,74,58,${0.22 + r() * 0.2})`;
        x.fillRect(sx, py, 0.0012 * PX, dash);
        xh.fillStyle = `rgba(80,80,80,${0.3 + r() * 0.3})`;
        xh.fillRect(sx, py, 0.0011 * PX, dash);
      }
    }
  }

  /* 8) surface fuzz — the raised nap of worn wool. Faint, everywhere, and the reason a
        cloth normal map does not look like knurled metal. */
  for (let i = 0; i < 2600; i++) {
    const fx = r() * W, fy = r() * H, fl = (0.0012 + r() * 0.004) * PY, ang = r() * 7;
    const dx = Math.cos(ang) * fl, dy = Math.sin(ang) * fl, a = 0.05 + r() * 0.1;
    x.strokeStyle = r() < 0.5 ? `rgba(255,252,244,${a})` : `rgba(112,102,86,${a * 0.8})`;
    x.lineWidth = Math.max(0.7, 0.0004 * PY);
    x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx + dx, fy + dy); x.stroke();
    xh.strokeStyle = `rgba(158,158,158,${a})`; xh.lineWidth = Math.max(0.7, 0.0004 * PY);
    xh.beginPath(); xh.moveTo(fx, fy); xh.lineTo(fx + dx, fy + dy); xh.stroke();
  }

  /* 9) roughness. Low frequency only, so it lives on a small sheet: dirt is dead matte,
        the turned hem and the seams are compressed and pick up a sheen, and a couple of
        rub patches (shoulders, where a strap or a wall wears the nap flat) go smoother. */
  const RW = 256, RH = 512, cR = makeCanvas(RW, RH), xr = cR.getContext('2d');
  xr.fillStyle = '#dedede'; xr.fillRect(0, 0, RW, RH);
  const gr = xr.createLinearGradient(0, RH, 0, RH * 0.6);
  gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  xr.fillStyle = gr; xr.fillRect(0, RH * 0.6, RW, RH * 0.4);
  xr.fillStyle = 'rgba(120,120,120,0.8)'; xr.fillRect(0, RH - 0.026 * (RH / CLOTH_H), RW, 0.026 * (RH / CLOTH_H));
  for (let i = 0; i < 10; i++) {
    const bx = r() * RW, by = r() * RH * 0.6, br = 10 + r() * 30;
    const g = xr.createRadialGradient(bx, by, 1, bx, by, br);
    g.addColorStop(0, `rgba(150,150,150,${0.3 + r() * 0.3})`); g.addColorStop(1, 'rgba(150,150,150,0)');
    xr.fillStyle = g; xr.beginPath(); xr.arc(bx, by, br, 0, 7); xr.fill();
  }

  return { map: canvasTex(c), normal: normalFromHeight(cH, 2.0), rough: canvasTexLinear(cR) };
}
const texCloth = makeClothTexture();

/* One cloth material per tint. `color` is a plain multiplier over the light neutral
   sheet (matBark's trick), `sheenColor` is a washed-out version of the same dye — real
   sheen is light scattered off the fibre ends of the dyed yarn, so a white sheen on a
   dark cloak reads as dust rather than as pile. */
function npcCloth(hex, sheenRough) {
  return new THREE.MeshPhysicalMaterial({
    color: hex, vertexColors: true,
    map: texCloth.map, normalMap: texCloth.normal, normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: texCloth.rough, roughness: 1, metalness: 0,
    sheen: 0.65, sheenColor: new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.5),
    sheenRoughness: sheenRough || 0.62
  });
}
// The eight tints are unchanged — they now multiply a light neutral sheet instead of
// standing in for the albedo, which lands the finished cloak a little DEEPER than the
// old flat version (the old ones washed out under this exposure).
const NPC_CLOAKS = [0x7a7261, 0x5d6657, 0x6b5d6e, 0x836f54, 0x596672, 0x74584a, 0x86795f, 0x4f5c50]
  .map(h => npcCloth(h));
const NPC_SKINS = [0x8a6a52, 0x6b4b38, 0xa3826a, 0x5a4335, 0x96755d]
  .map(h => new THREE.MeshStandardMaterial({ color: h, vertexColors: true, roughness: 0.78 }));
const npcWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2e, roughness: 1 });
const npcLanternMat = new THREE.MeshStandardMaterial({ color: 0x2a2a22, emissive: srgb(0xffd9a0), emissiveIntensity: 0, roughness: 0.6 });
// The Archivist (Part 2 campaign giver): a dusty-amber cloak + pale papers, distinct from the
// eight citizen cloaks so the campaign's one NPC reads on sight.
const npcArchivistCloak = npcCloth(0x8a6a3a, 0.55);
const npcPaperMat = new THREE.MeshStandardMaterial({ color: 0xcabf9a, roughness: 0.9 });
// The Tinker (Part 2 Ciphers giver): a coppery apron + a tool-bench of brass gears and a small
// brazier so she reads at night — distinct on sight from the eight citizens and the Archivist.
const npcTinkerCloak = npcCloth(0x7a5a3a, 0.5);
const npcBrassMat = new THREE.MeshStandardMaterial({ color: 0x9a7b3a, roughness: 0.5, metalness: 0.3, envMap: envRT.texture, envMapIntensity: 0.5 });

/* ---------------------------------------------------------- citizen bodies -- */
/* Indexed (RI+1)×(RJ+1) sheets with smooth normals. fn(u, v, i, j) returns
   [x, y, z, texU, texV, shade]; `shade` is a grey vertex colour used as baked
   occlusion (this renderer has no AO pass, and the fold valleys and the inside of a
   hood are exactly where a cloaked figure needs it). Winding assumes i runs round the
   axis and j runs UP, which gives outward-facing normals. */
function _npcSurf(RI, RJ, fn) {
  const P = [], U = [], C = [], I = [];
  for (let j = 0; j <= RJ; j++) for (let i = 0; i <= RI; i++) {
    const v = fn(i / RI, j / RJ, i, j);
    P.push(v[0], v[1], v[2]); U.push(v[3], v[4]); C.push(v[5], v[5], v[5]);
  }
  for (let j = 0; j < RJ; j++) for (let i = 0; i < RI; i++) {
    const a = j * (RI + 1) + i;
    I.push(a, a + 1, a + RI + 1, a + 1, a + RI + 2, a + RI + 1);
  }
  return { P, U, C, I };
}
// close a ring with a triangle fan (flip = the fan faces down)
function _npcFan(s, RI, first, cx, cy, cz, u, v, shade, flip) {
  const ci = s.P.length / 3;
  s.P.push(cx, cy, cz); s.U.push(u, v); s.C.push(shade, shade, shade);
  for (let i = 0; i < RI; i++) {
    if (flip) s.I.push(ci, first + i + 1, first + i); else s.I.push(ci, first + i, first + i + 1);
  }
}
/* computeVertexNormals leaves the i=0 / i=RI wrap column split — two coincident vertices
   whose normals only ever see the triangles on their own side — which draws a hard crease
   straight down the front of every head, hood and sleeve. Average the pair back together. */
function _npcGeo(s, RI, RJ) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(s.U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(s.C, 3));
  g.setIndex(s.I);
  g.computeVertexNormals();
  const n = g.attributes.normal.array;
  for (let j = 0; j <= RJ; j++) {
    const a = j * (RI + 1) * 3, b = (j * (RI + 1) + RI) * 3;
    const nx = n[a] + n[b], ny = n[a + 1] + n[b + 1], nz = n[a + 2] + n[b + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    n[a] = n[b] = nx / l; n[a + 1] = n[b + 1] = ny / l; n[a + 2] = n[b + 2] = nz / l;
  }
  return g;
}

/* THE CLOAK. A lathe with drape: seven fold ridges (plus their second harmonic) that
   are deepest at the hem, twist a little as they fall and die out at the shoulders; a
   bell flare at the hem; a shoulder bulge that widens sideways so the top is a body and
   not the tip of a cone; a shallow crease down the front where the cloak closes; and a
   closed, slightly dished underside so nothing shows through on a slope. */
const npcGeoCloak = (() => {
  const RI = 32, RJ = 16, FOLDS = 7;
  const s = _npcSurf(RI, RJ, (fu, fv) => {
    const th = fu * 6.283185, t = fv;
    let R = 0.163 + 0.228 * Math.pow(1 - t, 1.12);
    const fl = Math.max(0, 1 - t / 0.22); R += 0.050 * fl * fl;                 // the hem kicks out
    const sh = Math.max(0, (t - 0.66) / 0.34); R += 0.078 * sh * sh * (1 - sh * 0.42);
    const fold = Math.cos(FOLDS * th + 0.55 * t) * 0.62 + Math.cos(2 * FOLDS * th + 1.9 + 1.2 * t) * 0.38;
    R += 0.037 * Math.pow(1 - t, 1.4) * fold;
    let df = th; if (df > Math.PI) df -= 6.283185;                              // front closure crease
    R -= 0.014 * Math.exp(-(df * df) / 0.05);
    const ex = 1 + 0.22 * sh * sh, ez = 1 - 0.06 * sh * sh;
    // baked occlusion: the fold valleys, the ground the hem stands on, and the general
    // fall-off of a sky-lit body toward its feet — this renderer has no AO pass at all
    const ao = (0.74 + 0.26 * Math.min(1, t / 0.24)) * (0.86 + 0.14 * (fold * 0.5 + 0.5)) * (0.80 + 0.20 * t);
    return [R * Math.sin(th) * ex, t * CLOTH_H - 0.02 * sh * sh, R * Math.cos(th) * ez + 0.018 * sh * sh,
      fu * 4, t, ao];
  });
  _npcFan(s, RI, 0, 0, 0.05, 0, 2, 0.01, 0.34, true);
  return _npcGeo(s, RI, RJ);
})();

/* THE HOOD. Not a squashed sphere: a cowl swept as ONE continuous strip that starts at
   the crown of the LINING, runs down the inside, rolls over the rim and climbs back up
   the outside. Two consequences, both load-bearing:
     · the rim has real thickness, and the inside of the cowl is closed dark cloth — with
       only a rim strip you look straight through the face opening and out the far side
       of the character, which is a hole, not a shadow;
     · the winding flips by itself where the strip rolls over, so the lining faces the
       cavity and the shell faces the world, from one index buffer and one draw call.
   phiMax then carves the opening: dead ahead the cloth stops at the brow, by 60° round
   it has come down to cheek height, and at the sides and nape it sweeps onto the
   shoulders — the rim arches OVER the face instead of closing across it, and the
   forward bulge puts that brow out past the nose so the face sits in its shadow. */
const npcGeoHood = (() => {
  const RI = 28, R0 = 0.232, LIN = 0.88;             // LIN = lining radius, i.e. cloth thickness
  //          phiFrac rFrac        shade
  const PR = [[0.00, LIN, 0.045], [0.22, LIN, 0.045], [0.45, LIN + 0.005, 0.05],
  [0.66, LIN + 0.012, 0.062], [0.84, LIN + 0.022, 0.08], [0.95, LIN + 0.035, 0.105],
  [1.00, LIN + 0.062, 0.17], [1.035, 0.965, 0.32],
  [1.00, 1.000, 0.56], [0.90, 1.000, 0.75], [0.76, 1.000, 0.92],
  [0.60, 1.000, 1.00], [0.44, 1.000, 1.00], [0.28, 1.000, 1.00],
  [0.13, 1.000, 1.00], [0.00, 1.000, 1.00]];
  const s = _npcSurf(RI, PR.length - 1, (fu, fv, i, j) => {
    const th = fu * 6.283185, co = Math.cos(th), si = Math.sin(th);
    const f = (co + 1) * 0.5;                        // 1 at the face, 0 at the nape
    // How far down the polar sweep the cloth reaches, per azimuth. THIS is the face
    // opening: dead ahead the shell stops at the brow (0.68 rad), by 60° round it has
    // dropped to cheek height and at the sides and nape it sweeps all the way down onto
    // the shoulders — so the rim arches over the face instead of closing across it.
    const p = PR[j], phi = p[0] * (1.98 - 1.10 * Math.pow(f, 2.2));
    const sp = Math.sin(phi), cp = Math.cos(phi);
    // every azimuth-dependent term carries an sp factor so the crown stays a single point
    let R = R0 * p[1] * (1 + 0.11 * f * sp + 0.13 * f * f * sp + 0.10 * (1 - f) * sp);
    R *= 1 + 0.02 * Math.cos(5 * th + 0.6) * sp;     // slack folds in the cowl
    // A uniform backward SHEAR with height, not a rotation: the crown leans back behind
    // the head (which is what stops a cowl reading as a bowl set on the shoulders) while
    // the rim — and therefore the overhang that shades the face — stays exactly put.
    const y = R * cp * 0.98;
    return [R * sp * si, y, R * sp * co + 0.018 - 0.20 * Math.max(0, y), fu * 2,
      0.72 + 0.27 * (1 - p[0] * 0.8), p[2] * (0.72 + 0.28 * (0.5 + 0.5 * cp))];
  });
  return _npcGeo(s, RI, PR.length - 1);
})();

/* THE HEAD. Faceless by design — but an ovoid that narrows to a jaw, and vertex-shaded
   for the hood above it: near black across the crown and the temples, opening up only
   on the jaw and chin that sit below the cowl's rim. */
const npcGeoHead = (() => {
  const RI = 16, RJ = 12;
  return _npcGeo(_npcSurf(RI, RJ, (fu, fv) => {
    const th = fu * 6.283185, phi = (1 - fv) * Math.PI;
    const sp = Math.sin(phi), cp = Math.cos(phi), co = Math.cos(th), si = Math.sin(th);
    const jaw = 1 - 0.22 * Math.max(0, -cp) * Math.max(0, -cp);
    // Baked hood shadow. The ramp only opens below cp ≈ -0.28, i.e. the jaw line: the
    // whole face and crown stay in the cowl's shade and only the underside of the jaw
    // — the part that sits below the rim — takes light. Nudged front-to-back as well,
    // so the temples are darker than the chin and the head is not a flat disc.
    const down = Math.min(1, Math.max(0, (-cp - 0.15) / 0.60));
    const front = 0.40 + 0.60 * (co * sp * 0.5 + 0.5);
    return [0.118 * sp * si * jaw, 0.128 * cp, 0.120 * sp * co * jaw + 0.008 * cp,
      fu, 0.5, (0.20 + 0.62 * down) * (0.80 + 0.20 * front)];
  }), RI, RJ);
})();

/* THE SLEEVE. Tapered, cuffed and creased, closed at both ends so the open pipe never
   shows when the chat/vendor arm swings up. Samples the mid-height band of the sheet. */
const npcGeoSleeve = (() => {
  const RI = 12, RJ = 8;
  const s = _npcSurf(RI, RJ, (fu, fv) => {
    const th = fu * 6.283185, t = fv;                // 0 = cuff, 1 = shoulder
    let R = 0.046 + 0.042 * t * t + 0.014 * Math.max(0, 1 - t / 0.14);
    R *= 1 + 0.055 * Math.cos(4 * th + 1.1) * (1 - t * 0.5);
    return [R * Math.sin(th), -0.30 + t * 0.46, R * Math.cos(th),
      fu * 0.7, 0.34 + t * 0.2, 0.80 + 0.20 * t];
  });
  _npcFan(s, RI, 0, 0, -0.325, 0, 0.35, 0.34, 0.66, true);
  _npcFan(s, RI, RJ * (RI + 1), 0, 0.19, 0, 0.35, 0.54, 0.9, false);
  return _npcGeo(s, RI, RJ);
})();
const npcGeoHand = (() => {
  const RI = 10, RJ = 7;
  return _npcGeo(_npcSurf(RI, RJ, (fu, fv) => {
    const th = fu * 6.283185, phi = (1 - fv) * Math.PI;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    return [0.036 * sp * Math.sin(th), 0.052 * cp, 0.030 * sp * Math.cos(th), fu, 0.5, 0.55 + 0.4 * (1 - fv)];
  }), RI, RJ);
})();

const npcs = [];
function makeNPCGroup(kid, role) {
  const g = new THREE.Group();
  const cloak = new THREE.Mesh(npcGeoCloak, NPC_CLOAKS[(Math.random() * NPC_CLOAKS.length) | 0]);
  cloak.castShadow = true;
  // hood centre and head centre are tuned together: the cowl's front rim lands at y≈1.18,
  // in front of and BELOW the eye line, so everything above the jaw sits in its shadow.
  const hood = new THREE.Mesh(npcGeoHood, cloak.material); hood.position.y = 1.155; hood.castShadow = true;
  const head = new THREE.Mesh(npcGeoHead, NPC_SKINS[(Math.random() * NPC_SKINS.length) | 0]); head.position.y = 1.212; head.position.z = 0.028;
  g.add(cloak, hood, head);
  let anim = null;
  if (role === 'sweep') {
    const broom = new THREE.Group();
    const handle = new THREE.Mesh(tplCyl, npcWoodMat); handle.scale.set(0.025, 1.5, 0.025); handle.rotation.x = 0.9;
    const bhead = new THREE.Mesh(tplBox, npcWoodMat); bhead.scale.set(0.34, 0.06, 0.1); bhead.position.set(0, 0.06, 1.18);
    broom.add(handle, bhead); broom.position.set(0.28, 0.35, 0.1);
    g.add(broom); anim = broom;
  } else if (role === 'lantern') {
    const stick = new THREE.Mesh(tplCyl, npcWoodMat); stick.scale.set(0.025, 0.8, 0.025); stick.rotation.z = -0.9; stick.position.set(0.25, 0.75, 0.1);
    const glow = new THREE.Mesh(tplBlob, npcLanternMat); glow.scale.setScalar(0.09); glow.position.set(0.62, 0.98, 0.1);
    g.add(stick, glow); anim = glow;
  } else if (role === 'trialmaster') {
    // a tall carved staff held upright, topped with a glowing crystal orb — a distinct silhouette
    const staff = new THREE.Mesh(tplCyl, npcWoodMat); staff.scale.set(0.035, 2.0, 0.035); staff.position.set(0.34, 0, 0.06);
    const orb = new THREE.Mesh(tplBlob, npcLanternMat); orb.scale.setScalar(0.13); orb.position.set(0.34, 2.05, 0.06);
    g.add(staff, orb); anim = orb;
  } else if (role === 'archivist') {
    // the trial-master body (carved staff + glowing orb) recloaked in dusty amber, with a
    // small stack of crates and loose papers at the feet — the Authority's surviving records.
    cloak.material = npcArchivistCloak; hood.material = npcArchivistCloak;
    const staff = new THREE.Mesh(tplCyl, npcWoodMat); staff.scale.set(0.035, 2.0, 0.035); staff.position.set(0.34, 0, 0.06);
    const orb = new THREE.Mesh(tplBlob, npcLanternMat); orb.scale.setScalar(0.12); orb.position.set(0.34, 2.05, 0.06);
    const crate = new THREE.Mesh(tplBox, npcWoodMat); crate.scale.set(0.5, 0.34, 0.36); crate.position.set(-0.46, 0, 0.12);
    const crate2 = new THREE.Mesh(tplBox, npcWoodMat); crate2.scale.set(0.36, 0.22, 0.42); crate2.position.set(-0.52, 0.34, 0.08);
    const paper = new THREE.Mesh(tplBox, npcPaperMat); paper.scale.set(0.32, 0.04, 0.28); paper.position.set(-0.52, 0.57, 0.08);
    g.add(staff, orb, crate, crate2, paper); anim = orb;
  } else if (role === 'tinker') {
    // a coppery apron, a low tool-bench with brass gears, and a brazier glow (anim = brazier
    // emissive, driven like the archivist's orb) — the Ciphers' one NPC, reads on sight.
    cloak.material = npcTinkerCloak; hood.material = npcTinkerCloak;
    const bench = new THREE.Mesh(tplBox, npcWoodMat); bench.scale.set(1.1, 0.5, 0.55); bench.position.set(0.55, 0, 0.2);
    const gear1 = new THREE.Mesh(tplWheel, npcBrassMat); gear1.scale.setScalar(0.16); gear1.position.set(0.4, 0.6, 0.3);
    const gear2 = new THREE.Mesh(tplWheel, npcBrassMat); gear2.scale.setScalar(0.11); gear2.position.set(0.68, 0.58, 0.18);
    const brazier = new THREE.Mesh(tplBlob, npcLanternMat); brazier.scale.setScalar(0.11); brazier.position.set(-0.5, 0.7, 0.1);
    g.add(bench, gear1, gear2, brazier); anim = brazier;
  } else if (role === 'chat' || role === 'vendor') {
    // a simple pivoting arm so a talker/vendor can raise a hand while gesturing
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(npcGeoSleeve, cloak.material);
    const hand = new THREE.Mesh(npcGeoHand, head.material); hand.position.y = -0.335;
    arm.add(upper, hand); arm.position.set(0.2, 1.0, 0.06);
    g.add(arm); anim = arm;
  } else if (Math.random() < 0.5 && role === 'walk') {
    const basket = new THREE.Mesh(tplBox, npcWoodMat); basket.scale.set(0.36, 0.26, 0.28); basket.position.set(0.34, 0.5, 0);
    g.add(basket);
  }
  g.scale.setScalar(kid ? 0.62 + Math.random() * 0.08 : 1.0 + Math.random() * 0.16);
  return { g, anim };
}

function spawnNPC(forceRole) {
  const day = dayF > 0.35;
  let role = forceRole;
  if (!role) {
    if (!day) role = 'lantern';
    else { const r = Math.random(); role = r < 0.48 ? 'walk' : r < 0.66 ? 'chat' : r < 0.78 ? 'sweep' : 'tend'; }
  }
  // find a street point 22–75 m away
  for (let tries = 0; tries < 12; tries++) {
    const axis = Math.random() < 0.5 ? 0 : 1;
    const line = 64 * Math.round(((axis === 0 ? player.pos.x : player.pos.z) + (Math.random() - 0.5) * 170) / 64);
    const along = (axis === 0 ? player.pos.z : player.pos.x) + (Math.random() - 0.5) * 150;
    // canal lines have water down the centre → keep walkers on the tow-path (sidewalk band)
    const canal = isCanalLine(axis, Math.round(line / 64));
    const off = (canal || Math.random() < 0.75) ? (Math.random() < 0.5 ? -1 : 1) * (5.6 + Math.random() * 1.7) : (Math.random() - 0.5) * 4;
    const x = axis === 0 ? line + off : along;
    const z = axis === 0 ? along : line + off;
    const d = Math.hypot(x - player.pos.x, z - player.pos.z);
    if (d < 22 || d > 75) continue;
    const kid = day && role === 'walk' && Math.random() < 0.28;
    const { g, anim } = makeNPCGroup(kid, role);
    g.position.set(x, terrainY(x, z), z);
    scene.add(g);
    const npc = {
      g, anim, role, axis, line, off, kid,
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: (role === 'walk' || role === 'lantern') ? (kid ? 2.3 + Math.random() : 1.1 + Math.random() * 0.5) : 0.25,
      phase: Math.random() * 7, turnCd: 2, stateT: 12 + Math.random() * 30,
      greetCd: 0, faceYaw: Math.random() * 7, partner: null, speaking: true, speakCd: 4 + Math.random() * 5
    };
    npcs.push(npc);
    if (role === 'chat') { // spawn a partner facing them, 0.8 m away
      const { g: g2, anim: a2 } = makeNPCGroup(false, 'chat');
      const a = Math.random() * Math.PI * 2;
      const p2x = x + Math.cos(a) * 0.8, p2z = z + Math.sin(a) * 0.8;
      g2.position.set(p2x, terrainY(p2x, p2z), p2z);
      scene.add(g2);
      const p2 = { g: g2, anim: a2, role: 'chat', axis, line, off, kid: false, dir: 1, speed: 0.25, phase: Math.random() * 7, turnCd: 2, stateT: npc.stateT, greetCd: 0, faceYaw: 0, partner: npc, speaking: false, speakCd: 1e9 };
      npc.partner = p2; npcs.push(p2);
    }
    return true;
  }
  return false;
}

function removeNPC(npc) {
  scene.remove(npc.g);
  const i = npcs.indexOf(npc); if (i >= 0) npcs.splice(i, 1);
  if (npc.partner) npc.partner.partner = null;
  if (npc === giver) giver = null;   // a giver culled at range: drop it, redesignate later
}

// Deliveries: promote the waiting errand receiver (a 'chat'-bodied {g, anim}) into the live crowd
// the instant the parcel changes hands. She takes it (a shared-geo prop drops into her hand via the
// pivoting arm), then jogs off with the 'depart' role below and corners out of sight. Parcel reuses
// tplBox + npcPaperMat (no new material); it rides the arm group and is freed with the NPC (removeNPC
// only scene.removes — shared geometry/material stay live for the crates/papers that also use them).
function departReceiver(r) {
  const parcel = new THREE.Mesh(tplBox, npcPaperMat); parcel.scale.set(0.22, 0.15, 0.16); parcel.position.set(0, -0.5, 0);
  if (r.anim) r.anim.add(parcel);
  npcs.push({ g: r.g, anim: r.anim, role: 'depart', axis: 0, line: 0, off: 0, kid: false,
    dir: 1, speed: 3.1 + Math.random() * 0.4, phase: Math.random() * 7, turnCd: 2, stateT: 30,
    greetCd: 1e9, faceYaw: r.g.rotation.y, partner: null, speaking: false, speakCd: 1e9, takeT: 1.15 });
}

// KIDS CHASING: two kid-scaled runners looping a fountain/plaza centre or a lamp post.
function spawnChaseKids() {
  nearbyChunks(1, _nc);
  let cx = null, cz = null, R = 3;
  for (const c of _nc) if (c.type === 'plaza') { cx = c.ix * CHUNK + 32; cz = c.iz * CHUNK + 32; R = 5.6; break; }
  if (cx === null) for (const c of _nc) { for (const L of c.colData.lamps) { cx = L.hx; cz = L.hz; R = 2.6; break; } if (cx !== null) break; }
  if (cx === null) return;
  const d = Math.hypot(cx - player.pos.x, cz - player.pos.z);
  if (d < 8 || d > 55) return;
  const ang0 = Math.random() * Math.PI * 2, dir = Math.random() < 0.5 ? 1 : -1;
  for (let k = 0; k < 2; k++) {
    const { g, anim } = makeNPCGroup(true, 'walk');
    const a = ang0 + k * 1.8;
    const kx0 = cx + Math.cos(a) * R, kz0 = cz + Math.sin(a) * R;
    g.position.set(kx0, terrainY(kx0, kz0), kz0); scene.add(g);
    npcs.push({ g, anim, role: 'chase', axis: 0, line: 0, off: 0, kid: true,
      dir, speed: 2.6, phase: Math.random() * 7, turnCd: 2, stateT: 14 + Math.random() * 16,
      greetCd: 0, faceYaw: 0, partner: null, speaking: false, speakCd: 0,
      cx, cz, radius: R, ang: a, flipCd: 2 + Math.random() * 3 });
  }
}

// VENDOR + CUSTOMER: a stationary vendor behind a stall counter and a customer facing it.
function spawnVendorStall() {
  nearbyChunks(1, _nc);
  for (const c of _nc) for (const s of c.colData.stallAnchors) {
    const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z);
    if (d < 6 || d > 46 || Math.random() > 0.5) continue;
    const rot = (lx, lz) => [s.x + lx * Math.cos(s.rot) + lz * Math.sin(s.rot), -lx * Math.sin(s.rot) + lz * Math.cos(s.rot) + s.z];
    const [vx, vz] = rot(0, -0.75);   // behind the counter
    const [kx, kz] = rot(0, 1.7);     // in front of the counter
    const { g: gv, anim: av } = makeNPCGroup(false, 'vendor');
    gv.position.set(vx, terrainY(vx, vz), vz); scene.add(gv);
    const vendor = { g: gv, anim: av, role: 'vendor', axis: 0, line: 0, off: 0, kid: false,
      dir: 1, speed: 0.25, phase: Math.random() * 7, turnCd: 2, stateT: 1e9,
      greetCd: 0, faceYaw: Math.atan2(kx - vx, kz - vz), partner: null, speaking: false, speakCd: 2 + Math.random() * 3 };
    npcs.push(vendor);
    const { g: gc, anim: ac } = makeNPCGroup(false, 'walk');
    gc.position.set(kx, terrainY(kx, kz), kz); scene.add(gc);
    const cust = { g: gc, anim: ac, role: 'customer', axis: 0, line: 0, off: 0, kid: false,
      dir: 1, speed: 0.25, phase: Math.random() * 7, turnCd: 2, stateT: 8 + Math.random() * 12,
      greetCd: 0, faceYaw: Math.atan2(vx - kx, vz - kz), partner: vendor, speaking: false, speakCd: 0 };
    vendor.partner = cust; npcs.push(cust);
    return;
  }
}

function countRole(role) { let n = 0; for (const p of npcs) if (p.role === role) n++; return n; }
function updateNPCs(dt, time) {
  npcLanternMat.emissiveIntensity = matLamp.emissiveIntensity + 0.25;
  let want = Math.round(lerp(5, 17, dayF));
  // Density: +40% by day in market/plaza chunks (night crowds unchanged — lantern walkers).
  const pc = chunkAt(player.pos.x, player.pos.z);
  const market = !!pc && dayF > 0.35 && (pc.type === 'plaza' || (pc.type === 'city' && pc.colData.stallAnchors && pc.colData.stallAnchors.length > 0));
  if (market) want = Math.round(want * 1.4);
  if (pc && pc.region && pc.region.biome === 'ashen') want = Math.round(want * 0.5);   // Regions: the Ash Quarters feel emptied
  if (npcs.length < want && Math.random() < 0.12) spawnNPC();
  // Vignettes: kids chasing a fountain/lamp; a vendor+customer at a stall. Day only, never in
  // SHOT (randomness-heavy, could jitter screenshots — mirrors how boars/leapers gate on SHOT).
  if (!SHOT && dayF > 0.4) {
    if (Math.random() < 0.014 && countRole('chase') === 0) spawnChaseKids();
    if (market && Math.random() < 0.02 && countRole('vendor') < 2) spawnVendorStall();
  }
  let farthest = null, fd = 0;
  for (let i = npcs.length - 1; i >= 0; i--) {
    const n = npcs[i];
    const dx = n.g.position.x - player.pos.x, dz = n.g.position.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 88) { removeNPC(n); continue; }
    if (d > fd) { fd = d; farthest = n; }
    n.turnCd -= dt; n.greetCd -= dt;

    let moving = false;
    if (n === giver) {
      // a mission-giver stands its ground and faces you until you accept or leave
      n.faceYaw = Math.atan2(player.pos.x - n.g.position.x, player.pos.z - n.g.position.z);
    } else if (n.role === 'walk' || n.role === 'lantern') {
      // pause & face the player when close
      if (d < 2.6 && n.greetCd <= -2) n.greetCd = 1.6;
      if (n.greetCd > 0) {
        n.faceYaw = Math.atan2(player.pos.x - n.g.position.x, player.pos.z - n.g.position.z);
      } else {
        moving = true;
        const p = n.g.position;
        if (n.axis === 0) { p.z += n.dir * n.speed * dt; p.x += (n.line + n.off - p.x) * Math.min(1, 2 * dt); }
        else { p.x += n.dir * n.speed * dt; p.z += (n.line + n.off - p.z) * Math.min(1, 2 * dt); }
        // turn at intersections
        const along = n.axis === 0 ? p.z : p.x;
        const grid = Math.round(along / CHUNK) * CHUNK;
        if (Math.abs(along - grid) < 0.7 && n.turnCd <= 0) {
          n.turnCd = 4 + Math.random() * 4;
          if (Math.random() < 0.55) {
            n.axis = 1 - n.axis; n.line = grid;
            const cnl = isCanalLine(n.axis, Math.round(grid / 64));
            n.off = (cnl || Math.random() < 0.75) ? (Math.random() < 0.5 ? -1 : 1) * (5.6 + Math.random() * 1.7) : (Math.random() - 0.5) * 4;
            n.dir = Math.random() < 0.5 ? 1 : -1;
          }
        }
        n.faceYaw = n.axis === 0 ? (n.dir > 0 ? 0 : Math.PI) : (n.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        if (n.anim && n.role === 'lantern') n.anim.position.y = 0.98 + Math.sin(time * 2 + n.phase) * 0.04;
      }
    } else if (n.role === 'chat') {
      if (n.partner) n.faceYaw = Math.atan2(n.partner.g.position.x - n.g.position.x, n.partner.g.position.z - n.g.position.z);
      n.bobY = Math.abs(Math.sin(time * 1.4 + n.phase)) * 0.02;   // subtle head/torso bob (added to terrain below)
      // one lead drives the turn-taking; swap speaker every 4–9 s (partner's speakCd is parked high).
      n.speakCd -= dt;
      if (n.speakCd <= 0 && n.partner) { n.speakCd = 4 + Math.random() * 5; n.speaking = !n.speaking; n.partner.speaking = !n.speaking; }
      if (n.anim) {   // the current speaker raises a hand and gestures
        const tgt = n.speaking ? -0.9 + Math.sin(time * 4 + n.phase) * 0.32 : 0;
        n.anim.rotation.x += (tgt - n.anim.rotation.x) * Math.min(1, 6 * dt);
      }
      n.stateT -= dt;
      if (n.stateT <= 0) { n.role = 'walk'; n.speed = 1.1 + Math.random() * 0.5; if (n.anim) n.anim.rotation.x = 0; if (n.partner) { n.partner.role = 'walk'; n.partner.speed = 1.3; if (n.partner.anim) n.partner.anim.rotation.x = 0; } }
    } else if (n.role === 'chase') {
      // two kids running a loose loop around a centre, with giggling sinusoidal arcs & flips
      n.flipCd -= dt;
      if (n.flipCd <= 0) { n.flipCd = 3 + Math.random() * 4; if (Math.random() < 0.5) n.dir *= -1; }
      n.ang += n.dir * (n.speed / n.radius) * dt;
      const rr = n.radius + Math.sin(time * 3 + n.phase) * 0.5;
      const tx = n.cx + Math.cos(n.ang) * rr, tz = n.cz + Math.sin(n.ang) * rr;
      n.faceYaw = Math.atan2(tx - n.g.position.x, tz - n.g.position.z);
      n.g.position.x = tx; n.g.position.z = tz; moving = true;
      n.stateT -= dt;
      if (n.stateT <= 0) { removeNPC(n); continue; }   // they scatter home after a while
    } else if (n.role === 'vendor') {
      if (n.partner) n.faceYaw = Math.atan2(n.partner.g.position.x - n.g.position.x, n.partner.g.position.z - n.g.position.z);
      n.speakCd -= dt;                                  // occasional gesture toward the customer
      const gesturing = n.speakCd < 0;
      if (n.speakCd < -1.3) n.speakCd = 3 + Math.random() * 4;
      if (n.anim) { const tgt = gesturing ? -0.7 + Math.sin(time * 5 + n.phase) * 0.45 : 0; n.anim.rotation.x += (tgt - n.anim.rotation.x) * Math.min(1, 5 * dt); }
      n.bobY = Math.abs(Math.sin(time * 1.1 + n.phase)) * 0.015;
      if (!n.partner && n.stateT > 1e8) n.stateT = 6 + Math.random() * 8;   // customer gone (or culled): pack up soon
      n.stateT -= dt;
      if (n.stateT <= 0) { removeNPC(n); continue; }
    } else if (n.role === 'customer') {
      if (n.partner) n.faceYaw = Math.atan2(n.partner.g.position.x - n.g.position.x, n.partner.g.position.z - n.g.position.z);
      n.bobY = Math.abs(Math.sin(time * 1.2 + n.phase)) * 0.02;
      n.stateT -= dt;
      if (n.stateT <= 0) {   // done at the stall — wander off; range-cull despawns it, a new one comes later
        n.role = 'walk'; n.speed = 1.1 + Math.random() * 0.6;
        n.axis = Math.random() < 0.5 ? 0 : 1;
        n.line = 64 * Math.round((n.axis === 0 ? n.g.position.x : n.g.position.z) / 64);
        n.off = (Math.random() < 0.5 ? -1 : 1) * (5.6 + Math.random() * 1.7);
        n.dir = Math.random() < 0.5 ? 1 : -1;
        if (n.partner) { n.partner.partner = null; n.partner.stateT = 6 + Math.random() * 8; }   // vendor packs up soon after
        n.partner = null;
      }
    } else if (n.role === 'sweep') {
      const p = n.g.position;
      if (n.axis === 0) p.z += Math.sin(time * 0.35 + n.phase) * 0.15 * dt * 4;
      else p.x += Math.sin(time * 0.35 + n.phase) * 0.15 * dt * 4;
      if (n.anim) n.anim.rotation.y = Math.sin(time * 2.1 + n.phase) * 0.55;
      n.faceYaw += Math.sin(time * 0.2 + n.phase) * 0.002;
      n.scrapCd = (n.scrapCd || 1) - dt;               // occasional flurry of leaf scraps off the broom
      if (n.scrapCd <= 0) { n.scrapCd = 1.6 + Math.random() * 2.6; emitScraps(p.x + Math.sin(n.faceYaw) * 0.9, p.z + Math.cos(n.faceYaw) * 0.9); }
    } else if (n.role === 'tend') {
      n.g.scale.y = n.g.scale.x * (0.86 + Math.sin(time * 0.9 + n.phase) * 0.1);
      n.faceYaw += Math.sin(time * 0.15 + n.phase) * 0.003;
    } else if (n.role === 'depart') {
      // Deliveries: the errand receiver just took the parcel — a brief arm-out "take" beat facing
      // the player, then she jogs off down the street, cornering away from the player each turn until
      // the d>88 cull (or the 30 s stateT safety) retires her. Reuses the walk mover + chat-arm idioms.
      if (n.takeT > 0) {
        n.takeT -= dt;
        n.faceYaw = Math.atan2(player.pos.x - n.g.position.x, player.pos.z - n.g.position.z);
        if (n.anim) n.anim.rotation.x += (-1.05 - n.anim.rotation.x) * Math.min(1, 8 * dt);   // reach out to receive
        if (n.takeT <= 0) {   // pick the getaway street (customer wander-off idiom); dir opens distance
          n.axis = Math.random() < 0.5 ? 0 : 1;
          n.line = 64 * Math.round((n.axis === 0 ? n.g.position.x : n.g.position.z) / 64);
          n.off = (Math.random() < 0.5 ? -1 : 1) * (5.6 + Math.random() * 1.7);
          n.dir = Math.sign(n.axis === 0 ? n.g.position.z - player.pos.z : n.g.position.x - player.pos.x) || 1;
        }
      } else {
        moving = true;
        const p = n.g.position;
        if (n.axis === 0) { p.z += n.dir * n.speed * dt; p.x += (n.line + n.off - p.x) * Math.min(1, 2 * dt); }
        else { p.x += n.dir * n.speed * dt; p.z += (n.line + n.off - p.z) * Math.min(1, 2 * dt); }
        const along = n.axis === 0 ? p.z : p.x;
        const grid = Math.round(along / CHUNK) * CHUNK;
        if (Math.abs(along - grid) < 0.7 && n.turnCd <= 0) {
          n.turnCd = 4 + Math.random() * 4;
          if (Math.random() < 0.55) {   // corner onto the perpendicular street, re-picking dir away from the player
            n.axis = 1 - n.axis; n.line = grid;
            const cnl = isCanalLine(n.axis, Math.round(grid / 64));
            n.off = (cnl || Math.random() < 0.75) ? (Math.random() < 0.5 ? -1 : 1) * (5.6 + Math.random() * 1.7) : (Math.random() - 0.5) * 4;
            n.dir = Math.sign(n.axis === 0 ? p.z - player.pos.z : p.x - player.pos.x) || 1;
          }
        }
        n.faceYaw = n.axis === 0 ? (n.dir > 0 ? 0 : Math.PI) : (n.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        if (n.anim) n.anim.rotation.x += (-0.35 - n.anim.rotation.x) * Math.min(1, 8 * dt);   // hug the parcel while running
      }
      n.stateT -= dt;
      // stuck-safety net, but never pop on-screen: retire on the budget only once she's past 40 m,
      // otherwise grant a small extension (a chaser keeps her alive; the d>88 cull still ends it).
      if (n.stateT <= 0) { if (d > 40) { removeNPC(n); continue; } else n.stateT = 5; }
    }

    // keep them out of cars, trunks, buildings
    const c = chunkAt(n.g.position.x, n.g.position.z);
    if (c) {
      const p = n.g.position;
      for (const t of c.colData.trunks) {
        const ddx = p.x - t.x, ddz = p.z - t.z, dd = Math.hypot(ddx, ddz), rr = t.r + 0.3;
        if (dd < rr && dd > 1e-4) { p.x += ddx / dd * (rr - dd); p.z += ddz / dd * (rr - dd); }
      }
      for (const s of c.colData.solids) {
        if (s.h < 0.5) continue;
        const cxp = clamp(p.x, s.x0, s.x1), czp = clamp(p.z, s.z0, s.z1);
        let ddx = p.x - cxp, ddz = p.z - czp; const dd = Math.hypot(ddx, ddz);
        if (dd < 0.3 && dd > 1e-4) { p.x += ddx / dd * (0.3 - dd); p.z += ddz / dd * (0.3 - dd); }
      }
    }

    // walk bob & waddle
    if (moving) {
      n.phase += dt * n.speed * 3.4;
      n.bobY = Math.abs(Math.sin(n.phase)) * 0.05;
      n.g.rotation.z = Math.sin(n.phase) * 0.045;
    } else n.g.rotation.z *= 0.9;
    // Terrain: the bob is now an OFFSET, applied on top of the ground under the NPC's CURRENT
    // position (movers only ever update x/z), so walkers ride the relief instead of clipping
    // through it. Runs after the trunk/solid push-out so it samples the resolved position.
    n.g.position.y = terrainY(n.g.position.x, n.g.position.z) + (n.bobY || 0);
    // smooth facing
    let dy = n.faceYaw - n.g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    n.g.rotation.y += dy * Math.min(1, 6 * dt);
  }
  // thin the crowd toward night
  if (npcs.length > want + 2 && farthest && fd > 45) removeNPC(farthest);
}

/* ======================================================================== */
/*  "THE RETURNED" — ambient animals (pooled, cheap state machines)         */
/*  Ground: cats, boars, frogs · Sky: bird flocks, bats, a raptor           */
/*  Canopy: leapers (monkeys/squirrels). No collision, sine animation,      */
/*  spawn-near / despawn-far like the citizens. Rosters swap on dayF/nightF.*/
/* ======================================================================== */

// --- shared geometry helpers (this build has no BufferGeometryUtils) ------
// bake a unit centred box (tplBoxC) at an offset/scale/rotation into a part
function _abox(sx, sy, sz, ox, oy, oz, rx, ry, rz) {
  return { geo: tplBoxC, m: compose(ox, oy, oz, sx, sy, sz, rx || 0, ry || 0, rz || 0).clone() };
}
// merge parts → one non-indexed BufferGeometry (position + normal), built once
function _mergeGeos(parts) {
  let count = 0;
  const baked = parts.map(({ geo, m }) => {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    if (m) g.applyMatrix4(m);
    count += g.attributes.position.count;
    return g;
  });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of baked) {
    const p = g.attributes.position.array;
    pos.set(p, o);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o);
    o += p.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

// --- one/two MeshStandardMaterials per species ----------------------------
const MAT_CAT = [0x4b463f, 0x8a5a32].map(h => new THREE.MeshStandardMaterial({ color: h, roughness: 0.95 }));
const MAT_BOAR = new THREE.MeshStandardMaterial({ color: 0x362f2b, roughness: 1, transparent: true, opacity: 1 });
const MAT_FROG = new THREE.MeshStandardMaterial({ color: 0x4c7a35, roughness: 0.8 });
const MAT_BIRD = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 1 });
const MAT_BAT = new THREE.MeshStandardMaterial({ color: 0x161318, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 1 });
const MAT_RAPTOR = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 1 });
const MAT_LEAP = new THREE.MeshStandardMaterial({ color: 0x6a4630, roughness: 0.95, transparent: true, opacity: 1 });

// --- cached per-species merged geometries (built once) --------------------
const catBodyGeo = _mergeGeos([          // faces +z (head forward)
  _abox(0.17, 0.20, 0.52, 0, 0.21, 0),   // stretched body
  _abox(0.16, 0.16, 0.16, 0, 0.29, 0.31) // head
]);
const catTailGeo = new THREE.BoxGeometry(0.05, 0.05, 0.30); catTailGeo.translate(0, 0, -0.15); // pivot at base, extends -z
const boarGeo = _mergeGeos([             // faces +z
  _abox(0.36, 0.40, 0.74, 0, 0.44, 0),   // barrel body
  _abox(0.24, 0.24, 0.20, 0, 0.32, 0.44),// head
  _abox(0.12, 0.12, 0.14, 0, 0.26, 0.56) // snout
]);
const frogGeo = _mergeGeos([
  _abox(0.15, 0.10, 0.16, 0, 0.05, 0),   // squat body
  _abox(0.04, 0.05, 0.05, 0.05, 0.08, 0.07), _abox(0.04, 0.05, 0.05, -0.05, 0.08, 0.07) // eyes
]);
const leaperGeo = _mergeGeos([           // faces +z, curved tail sweeping up & back
  _abox(0.15, 0.16, 0.26, 0, 0.16, 0),
  _abox(0.12, 0.12, 0.12, 0, 0.23, 0.15),
  _abox(0.055, 0.055, 0.15, 0, 0.19, -0.14, 0.5, 0, 0),
  _abox(0.055, 0.055, 0.13, 0, 0.30, -0.22, 1.1, 0, 0),
  _abox(0.05, 0.05, 0.11, 0, 0.40, -0.25, 1.7, 0, 0)
]);
const raptorGeo = _mergeGeos([           // faces +z, body centred on origin (a flyer)
  _abox(0.26, 0.18, 0.80, 0, 0, 0),
  _abox(1.7, 0.05, 0.55, -0.95, 0.06, -0.02, 0, 0, 0.16),  // left wing (slight dihedral)
  _abox(1.7, 0.05, 0.55, 0.95, 0.06, -0.02, 0, 0, -0.16),  // right wing
  _abox(0.12, 0.05, 0.42, 0, 0, -0.55)                     // tail fan
]);

// --- reusable scratch (no per-frame allocation) ---------------------------
const _perim = { x: 0, z: 0, tx: 0, tz: 0 };
function rectPerim(r, pd, off, out) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0, per = 2 * (w + d);
  pd = ((pd % per) + per) % per;
  if (pd < w) { out.x = r.x0 + pd; out.z = r.z0 - off; out.tx = 1; out.tz = 0; }
  else if (pd < w + d) { out.x = r.x1 + off; out.z = r.z0 + (pd - w); out.tx = 0; out.tz = 1; }
  else if (pd < w + d + w) { out.x = r.x1 - (pd - w - d); out.z = r.z1 + off; out.tx = -1; out.tz = 0; }
  else { out.x = r.x0 - off; out.z = r.z1 - (pd - w - d - w); out.tx = 0; out.tz = -1; }
}
function rectPerimInv(r, x, z) {  // nearest boundary → matching pd (inverse of rectPerim)
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const dl = Math.abs(x - r.x0), dr = Math.abs(x - r.x1), dd = Math.abs(z - r.z0), du = Math.abs(z - r.z1);
  const m = Math.min(dl, dr, dd, du);
  if (m === dd) return clamp(x, r.x0, r.x1) - r.x0;
  if (m === dr) return w + (clamp(z, r.z0, r.z1) - r.z0);
  if (m === du) return w + d + (r.x1 - clamp(x, r.x0, r.x1));
  return w + d + w + (r.z1 - clamp(z, r.z0, r.z1));
}
function nearbyChunks(range, out) {
  out.length = 0;
  const cx = Math.floor(player.pos.x / CHUNK), cz = Math.floor(player.pos.z / CHUNK);
  for (let dx = -range; dx <= range; dx++) for (let dz = -range; dz <= range; dz++) {
    const c = chunks.get(chunkKey(cx + dx, cz + dz));
    if (c) out.push(c);
  }
  return out;
}
const _nc = [];
function smoothYaw(g, yaw, dt, rate) {
  let dy = yaw - g.rotation.y;
  while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
  g.rotation.y += dy * Math.min(1, rate * dt);
}

// --- flapping-flyer mesh: N individuals as one vertex-animated buffer -----
// each individual = 2 triangles (a chevron V); wings flap by writing tip Y.
function makeFlapMesh(n, mat) {
  const pos = new Float32Array(n * 18), nor = new Float32Array(n * 18);
  for (let i = 0; i < n * 6; i++) nor[i * 3 + 1] = 1;   // top-lit constant normals (cheap)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const m = new THREE.Mesh(g, mat); m.castShadow = false; m.frustumCulled = false;
  return { mesh: m, pos, n };
}
function writeFlap(buf, i, cx, cy, cz, fx, fz, ww, bl, flap) {
  const rx = fz, rz = -fx, o = i * 18;                 // right = perp of forward
  buf[o] = cx; buf[o + 1] = cy; buf[o + 2] = cz;                       // body
  buf[o + 3] = cx - rx * ww; buf[o + 4] = cy + flap; buf[o + 5] = cz - rz * ww;  // left tip
  buf[o + 6] = cx - fx * bl; buf[o + 7] = cy; buf[o + 8] = cz - fz * bl;         // tail
  buf[o + 9] = cx; buf[o + 10] = cy; buf[o + 11] = cz;                 // body
  buf[o + 12] = cx - fx * bl; buf[o + 13] = cy; buf[o + 14] = cz - fz * bl;      // tail
  buf[o + 15] = cx + rx * ww; buf[o + 16] = cy + flap; buf[o + 17] = cz + rz * ww; // right tip
}

/* ---- pools ---- */
const cats = [], boars = [], frogs = [], leapers = [], bats = [];

/* ---- CATS: slink along building edges, sit, flee the player ---- */
function spawnCat() {
  nearbyChunks(1, _nc);
  for (const c of _nc) for (const s of c.colData.solids) {
    if (s.h < 2 || (s.x1 - s.x0) < 2 || (s.z1 - s.z0) < 2) continue;
    const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2;
    const d = Math.hypot(mx - player.pos.x, mz - player.pos.z);
    if (d < 9 || d > 48 || Math.random() > 0.25) continue;
    const g = new THREE.Group();
    const mat = MAT_CAT[(Math.random() * MAT_CAT.length) | 0];
    const body = new THREE.Mesh(catBodyGeo, mat); body.castShadow = true;
    const tail = new THREE.Mesh(catTailGeo, mat); tail.position.set(0, 0.22, -0.26); tail.castShadow = true;
    g.add(body, tail); scene.add(g);
    cats.push({ g, tail, rect: { x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1 },
      pd: Math.random() * 8, dir: Math.random() < 0.5 ? 1 : -1, state: 'walk',
      t: 3 + Math.random() * 4, ph: Math.random() * 7 });
    return;
  }
}
function updateCats(dt, time) {
  for (let i = cats.length - 1; i >= 0; i--) {
    const a = cats[i], p = a.g.position;
    const dx = p.x - player.pos.x, dz = p.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > 74) { scene.remove(a.g); cats.splice(i, 1); continue; }
    let yaw = a.g.rotation.y, moving = false;
    if (d < 3) a.state = 'flee';
    if (a.state === 'flee') {
      const nd = d > 1e-3 ? d : 1;
      p.x += dx / nd * 3 * dt; p.z += dz / nd * 3 * dt;   // 2.5× the 1.2 m/s stroll
      yaw = Math.atan2(dx, dz); moving = true;
      if (d > 7) { a.state = 'walk'; a.pd = rectPerimInv(a.rect, p.x, p.z); a.t = 3 + Math.random() * 4; }
    } else if (a.state === 'sit') {
      a.t -= dt; if (a.t <= 0) { a.state = 'walk'; a.t = 4 + Math.random() * 5; }
    } else { // walk the perimeter
      a.pd += a.dir * 1.2 * dt;
      rectPerim(a.rect, a.pd, 0.4, _perim);
      p.x = _perim.x; p.z = _perim.z; moving = true;
      yaw = Math.atan2(_perim.tx * a.dir, _perim.tz * a.dir);
      a.t -= dt; if (a.t <= 0) { a.state = 'sit'; a.t = 3 + Math.random() * 5; }
    }
    p.y = terrainY(p.x, p.z) + (moving ? Math.abs(Math.sin(time * 6 + a.ph)) * 0.03 : 0);    // body bob over the ground
    a.tail.rotation.y = Math.sin(time * (a.state === 'sit' ? 2.2 : 3.4) + a.ph) * (a.state === 'sit' ? 0.5 : 0.28);
    smoothYaw(a.g, yaw, dt, 8);
  }
}

/* ---- BOARS: root in parks/groves/gardens (day only) ---- */
function spawnBoar() {
  nearbyChunks(1, _nc);
  for (const c of _nc) {
    if (c.type !== 'park' && c.type !== 'grove' && c.style !== 'garden') continue;
    const hx = c.ix * CHUNK + 16 + Math.random() * 32, hz = c.iz * CHUNK + 16 + Math.random() * 32;
    const d = Math.hypot(hx - player.pos.x, hz - player.pos.z);
    if (d < 12 || d > 45) continue;
    const g = new THREE.Group();
    const body = new THREE.Mesh(boarGeo, MAT_BOAR); body.castShadow = true;
    g.add(body); g.position.set(hx, terrainY(hx, hz), hz); scene.add(g);
    boars.push({ g, hx, hz, ang: Math.random() * 7, ph: Math.random() * 7, turn: 1 + Math.random() * 2 });
    return;
  }
}
function updateBoars(dt, time, on) {
  MAT_BOAR.opacity = on;
  for (let i = boars.length - 1; i >= 0; i--) {
    const a = boars[i], p = a.g.position;
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    if (!on || d > 74) { scene.remove(a.g); boars.splice(i, 1); continue; }
    a.turn -= dt;
    if (a.turn <= 0) { a.turn = 1.5 + Math.random() * 2.5; a.ang += (Math.random() - 0.5) * 1.6; }
    // wander back toward home so they stay in the green
    const toH = Math.atan2(a.hx - p.x, a.hz - p.z), far = Math.hypot(a.hx - p.x, a.hz - p.z);
    if (far > 8) a.ang = toH;
    p.x += Math.sin(a.ang) * 0.5 * dt; p.z += Math.cos(a.ang) * 0.5 * dt;
    p.y = terrainY(p.x, p.z) + Math.abs(Math.sin(time * 2 + a.ph)) * 0.03;   // rooting bob over the ground
    a.g.rotation.x = 0.22 + Math.sin(time * 3 + a.ph) * 0.08;  // head-down
    smoothYaw(a.g, a.ang, dt, 4);
  }
}

/* ---- FROGS: sit at water edges, hop in parabolas (always) ---- */
function spawnFrog() {
  nearbyChunks(1, _nc);
  for (const c of _nc) for (const w of c.colData.waters) {
    // a point on the water rim
    const edge = Math.random() * 4 | 0;
    let x = lerp(w.x0, w.x1, Math.random()), z = lerp(w.z0, w.z1, Math.random());
    if (edge === 0) z = w.z0; else if (edge === 1) z = w.z1; else if (edge === 2) x = w.x0; else x = w.x1;
    const d = Math.hypot(x - player.pos.x, z - player.pos.z);
    if (d < 6 || d > 46) continue;
    const g = new THREE.Mesh(frogGeo, MAT_FROG); g.position.set(x, w.y, z); scene.add(g);
    frogs.push({ g, w, y0: w.y, t: 1 + Math.random() * 4, hop: null });
    return;
  }
}
function updateFrogs(dt, time) {
  for (let i = frogs.length - 1; i >= 0; i--) {
    const a = frogs[i], p = a.g.position;
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    if (d > 74) { scene.remove(a.g); frogs.splice(i, 1); continue; }
    if (a.hop) {
      a.hop.t += dt / a.hop.dur; const k = a.hop.t;
      if (k >= 1) { p.x = a.hop.tx; p.z = a.hop.tz; p.y = a.y0; a.hop = null; a.t = 2 + Math.random() * 4; }
      else {
        p.x = lerp(a.hop.fx, a.hop.tx, k); p.z = lerp(a.hop.fz, a.hop.tz, k);
        p.y = a.y0 + Math.sin(k * Math.PI) * 0.4;                // parabolic arc
        a.g.rotation.y = a.hop.yaw;
      }
    } else {
      a.t -= dt;
      if (a.t <= 0) {                                           // launch a hop along/toward the rim
        const ang = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 0.7;
        let tx = p.x + Math.sin(ang) * r, tz = p.z + Math.cos(ang) * r;
        tx = clamp(tx, a.w.x0 - 0.6, a.w.x1 + 0.6); tz = clamp(tz, a.w.z0 - 0.6, a.w.z1 + 0.6);
        a.hop = { fx: p.x, fz: p.z, tx, tz, t: 0, dur: 0.4, yaw: Math.atan2(tx - p.x, tz - p.z) };
      }
    }
  }
}

/* ---- CANOPY LEAPERS: scamper on canopy pads, leap tree-to-tree (day) ---- */
function gatherPads(within, ox, oz, out) {   // pads with r<10, y>8 near (ox,oz)
  out.length = 0;
  nearbyChunks(1, _nc);
  for (const c of _nc) for (const pd of c.colData.pads) {
    if (pd.r >= 10 || pd.y <= 8) continue;
    if (Math.hypot(pd.x - ox, pd.z - oz) <= within) out.push(pd);
  }
  return out;
}
const _pads = [];
function spawnLeaper() {
  gatherPads(48, player.pos.x, player.pos.z, _pads);
  for (const pd of _pads) {
    const d = Math.hypot(pd.x - player.pos.x, pd.z - player.pos.z);
    if (d < 12 || d > 46) continue;
    const g = new THREE.Mesh(leaperGeo, MAT_LEAP);
    g.position.set(pd.x, pd.y, pd.z); scene.add(g);
    leapers.push({ g, pad: pd, state: 'idle', t: 1 + Math.random() * 2, ph: Math.random() * 7, hop: null });
    return;
  }
}
function updateLeapers(dt, time, on) {
  MAT_LEAP.opacity = on;
  for (let i = leapers.length - 1; i >= 0; i--) {
    const a = leapers[i], p = a.g.position;
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    if (on < 0.1 || d > 78) { scene.remove(a.g); leapers.splice(i, 1); continue; }
    if (a.state === 'leap') {
      a.hop.t += dt / a.hop.dur; const k = a.hop.t;
      if (k >= 1) { p.set(a.hop.tx, a.hop.ty, a.hop.tz); a.state = 'idle'; a.t = 1 + Math.random() * 2.5; a.g.scale.set(1, 1, 1); }
      else {
        p.x = lerp(a.hop.fx, a.hop.tx, k); p.z = lerp(a.hop.fz, a.hop.tz, k);
        p.y = lerp(a.hop.fy, a.hop.ty, k) + Math.sin(k * Math.PI) * a.hop.h;
        const st = 1 + Math.sin(k * Math.PI) * 0.3;             // stretch mid-arc, squash at ends
        a.g.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
        a.g.rotation.y = a.hop.yaw;
      }
    } else { // idle scamper on the pad
      const cx = a.pad.x + Math.sin(time * 1.3 + a.ph) * a.pad.r * 0.4;
      const cz = a.pad.z + Math.cos(time * 1.1 + a.ph) * a.pad.r * 0.4;
      smoothYaw(a.g, Math.atan2(cx - p.x, cz - p.z), dt, 6);
      p.x += (cx - p.x) * Math.min(1, 3 * dt); p.z += (cz - p.z) * Math.min(1, 3 * dt); p.y = a.pad.y;
      a.t -= dt;
      if (a.t <= 0) {                                            // find a pad to leap to (≤12 m)
        gatherPads(14, p.x, p.z, _pads);
        let best = null, bd = 4;
        for (const q of _pads) {
          const dd = Math.hypot(q.x - p.x, q.z - p.z);
          if (q === a.pad || dd < 3 || dd > 12) continue;
          if (Math.random() < 0.5 || !best) { best = q; bd = dd; }
        }
        if (best) {
          a.pad = best;
          a.hop = { fx: p.x, fy: p.y, fz: p.z, tx: best.x, ty: best.y, tz: best.z,
            t: 0, dur: 0.55 + bd * 0.03, h: 1.5 + bd * 0.25, yaw: Math.atan2(best.x - p.x, best.z - p.z) };
          a.state = 'leap';
        } else a.t = 1.5 + Math.random() * 2;
      }
    }
  }
}

/* ---- BIRD FLOCKS: flapping V's drifting on a slow curved path (day) ---- */
function makeFlock(nBirds, baseY, seed) {
  const fm = makeFlapMesh(nBirds, MAT_BIRD); scene.add(fm.mesh);
  const birds = [];
  for (let i = 0; i < nBirds; i++) {
    const a = (i / nBirds) * Math.PI * 2;
    birds.push({ ox: Math.cos(a) * (2 + i * 0.9) + (i ? 0 : 0), oy: (Math.random() - 0.5) * 4,
      oz: Math.sin(a) * (2 + i * 0.9) - i * 1.1, ph: Math.random() * 7, wa: 0.8 + Math.random() * 1.2 });
  }
  return { fm, n: nBirds, birds, cx: (Math.random() - 0.5) * 60, cy: baseY, cz: (Math.random() - 0.5) * 60,
    baseY, head: Math.random() * 7, seed };
}
function updateFlock(F, dt, time, opacity, shotAnchor) {
  F.fm.mesh.visible = opacity > 0.02;
  if (opacity <= 0.02) return;
  MAT_BIRD.opacity = opacity;
  if (shotAnchor) { F.cx = 1; F.cz = 58; F.cy = 14; F.head = 0.5; }  // ahead of the shot-1 camera (+z), up in the canopy gap
  else {
    F.head += Math.sin(time * 0.05 + F.seed) * 0.14 * dt + 0.02 * dt;   // gentle curving path
    F.cx += Math.sin(F.head) * 6 * dt; F.cz += Math.cos(F.head) * 6 * dt;
    F.cy = F.baseY + Math.sin(time * 0.07 + F.seed) * 8;                // 27–43 m band
    const R = 70, px = player.pos.x, pz = player.pos.z;               // wrap around the player
    if (F.cx - px > R) F.cx -= R * 2; else if (px - F.cx > R) F.cx += R * 2;
    if (F.cz - pz > R) F.cz -= R * 2; else if (pz - F.cz > R) F.cz += R * 2;
  }
  const fx = Math.sin(F.head), fz = Math.cos(F.head);
  for (let i = 0; i < F.n; i++) {
    const b = F.birds[i];
    const wx = Math.sin(time * 0.6 + b.ph) * b.wa, wy = Math.sin(time * 0.4 + b.ph) * 0.7, wz = Math.cos(time * 0.5 + b.ph) * b.wa;
    const flap = Math.sin(time * 7 + b.ph) * 0.55;
    writeFlap(F.fm.pos, i, F.cx + b.ox + wx, F.cy + b.oy + wy, F.cz + b.oz + wz, fx, fz, 0.9, 1.4, flap);
  }
  F.fm.mesh.geometry.attributes.position.needsUpdate = true;
}

/* ---- BATS: erratic jinking flight near the lamps (night, replaces birds) ---- */
let batMesh = null;
function ensureBats() {
  if (batMesh) return;
  const fm = makeFlapMesh(6, MAT_BAT); scene.add(fm.mesh); batMesh = fm;
  for (let i = 0; i < 6; i++) bats.push({ x: 0, y: 12, z: 0, vx: 0, vy: 0, vz: 0, tx: 0, ty: 12, tz: 0, tCd: 0, ph: Math.random() * 7, live: false });
}
function updateBats(dt, time, opacity) {
  ensureBats();
  batMesh.mesh.visible = opacity > 0.02;
  if (opacity <= 0.02) return;
  MAT_BAT.opacity = opacity;
  const px = player.pos.x, pz = player.pos.z;
  for (let i = 0; i < bats.length; i++) {
    const b = bats[i];
    if (!b.live) {                        // spawn near a lit lamp glow, else just overhead
      b.x = px + (Math.random() - 0.5) * 40; b.z = pz + (Math.random() - 0.5) * 40; b.y = 9 + Math.random() * 8;
      nearbyChunks(1, _nc);
      let lamp = null;
      for (const c of _nc) for (const L of c.colData.lamps) { if (L.working && (!lamp || Math.random() < 0.3)) lamp = L; }
      if (lamp) { b.x = lamp.hx + (Math.random() - 0.5) * 8; b.z = lamp.hz + (Math.random() - 0.5) * 8; }
      b.tx = b.x; b.tz = b.z; b.ty = 8 + Math.random() * 10; b.live = true;
    }
    b.tCd -= dt;
    if (b.tCd <= 0) {                     // pick a fresh jink target
      b.tCd = 0.3 + Math.random() * 0.7;
      b.tx = px + (Math.random() - 0.5) * 36; b.tz = pz + (Math.random() - 0.5) * 36; b.ty = 8 + Math.random() * 10;
    }
    b.vx += ((b.tx - b.x) * 0.9 + (Math.random() - 0.5) * 10) * dt;
    b.vy += ((b.ty - b.y) * 0.9 + (Math.random() - 0.5) * 6) * dt;
    b.vz += ((b.tz - b.z) * 0.9 + (Math.random() - 0.5) * 10) * dt;
    const sp = Math.hypot(b.vx, b.vy, b.vz), mx = 9;
    if (sp > mx) { const k = mx / sp; b.vx *= k; b.vy *= k; b.vz *= k; }
    b.x += b.vx * dt; b.y = clamp(b.y + b.vy * dt, 8, 18); b.z += b.vz * dt;
    const R = 44;
    if (b.x - px > R) b.x -= R * 2; else if (px - b.x > R) b.x += R * 2;
    if (b.z - pz > R) b.z -= R * 2; else if (pz - b.z > R) b.z += R * 2;
    let fx = b.vx, fz = b.vz; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    writeFlap(batMesh.pos, i, b.x, b.y, b.z, fx, fz, 0.42, 0.55, Math.sin(time * 18 + b.ph) * 0.7);
  }
  batMesh.mesh.geometry.attributes.position.needsUpdate = true;
}

/* ---- RAPTOR: circles high, centred on the nearest colossus/spire (day) ---- */
let raptor = null;
function ensureRaptor() {
  if (raptor) return;
  const g = new THREE.Mesh(raptorGeo, MAT_RAPTOR); g.castShadow = false; scene.add(g);
  raptor = { g, ang: Math.random() * 7, cx: player ? player.pos.x : 0, cz: player ? player.pos.z : 0 };
}
function updateRaptor(dt, time, opacity) {
  ensureRaptor();
  raptor.g.visible = opacity > 0.02;
  if (opacity <= 0.02) return;
  MAT_RAPTOR.opacity = opacity;
  // centre the circle on a landmark chunk if one is near, else follow the player
  let tx = player.pos.x, tz = player.pos.z;
  nearbyChunks(2, _nc);
  let bd = 1e9;
  for (const c of _nc) {
    if (c.type !== 'colossus' && c.type !== 'spire') continue;
    const lx = c.ix * CHUNK + 32, lz = c.iz * CHUNK + 32, dd = Math.hypot(lx - player.pos.x, lz - player.pos.z);
    if (dd < bd) { bd = dd; tx = lx; tz = lz; }
  }
  raptor.cx += (tx - raptor.cx) * Math.min(1, 0.6 * dt); raptor.cz += (tz - raptor.cz) * Math.min(1, 0.6 * dt);
  raptor.ang += dt * 0.13;
  const R = 40, y = 62 + Math.sin(time * 0.05) * 7;
  raptor.g.position.set(raptor.cx + Math.cos(raptor.ang) * R, y, raptor.cz + Math.sin(raptor.ang) * R);
  raptor.g.rotation.y = Math.atan2(-Math.sin(raptor.ang), Math.cos(raptor.ang));  // face the tangent
  raptor.g.rotation.z = Math.sin(time * 0.3) * 0.16;                              // slow wing tilt / bank
}

/* ---- flocks (built once) ---- */
const flockA = makeFlock(7, 34, 1.7), flockB = makeFlock(6, 38, 4.2);

// pooled ambient wildlife, driven once per frame from the main loop. O(pool).
function updateAnimals(dt, time) {
  const dayR = dayF, nightR = nightF;
  // cats & frogs — always out
  if (cats.length < 3 && Math.random() < 0.04) spawnCat();
  updateCats(dt, time);
  if (frogs.length < 4 && Math.random() < 0.05) spawnFrog();
  updateFrogs(dt, time);
  // boars & leapers — day roster
  if (dayR > 0.3 && !SHOT) {
    if (boars.length < 2 && Math.random() < 0.03) spawnBoar();
    if (leapers.length < 3 && Math.random() < 0.04) spawnLeaper();
  }
  updateBoars(dt, time, dayR > 0.12 ? dayR : 0);
  updateLeapers(dt, time, dayR);
  // sky: bird flocks + raptor (day) · bats (night). SHOT: one deterministic flock, rest hidden.
  const dsky = smooth(0.2, 0.5, dayR);
  updateFlock(flockA, dt, time, SHOT ? (dsky > 0.02 ? 1 : 0) : dsky, !!SHOT);
  updateFlock(flockB, dt, time, SHOT ? 0 : dsky, false);
  updateRaptor(dt, time, SHOT ? 0 : dsky);
  updateBats(dt, time, SHOT ? 0 : smooth(0.2, 0.5, nightR));
}

/* ======================================================================== */
/*  AMBIENT VIGNETTES — pooled overlays keyed off build-time anchors.        */
/*  Batched chunk geometry can't move, so motion lives in small pooled       */
/*  overlays parked at anchor points (the LAMP_POOL idea). Each pool is one   */
/*  Points draw call (smoke/scraps/lanterns/drips) or a tiny mesh pool        */
/*  (banners). Queried O(near) per frame, no per-frame allocation.           */
/* ======================================================================== */

// Pick up to maxN nearest anchors of a colData field within `range` m (reused scratch, no alloc).
const _pick = [], _pickD = [];
function pickNearest(field, maxN, range) {
  _pick.length = 0; _pickD.length = 0;
  nearbyChunks(2, _nc);
  const px = player.pos.x, pz = player.pos.z, r2 = range * range;
  for (const c of _nc) {
    const arr = c.colData[field]; if (!arr) continue;
    for (const a of arr) {
      const dx = a.x - px, dz = a.z - pz, dd = dx * dx + dz * dz;
      if (dd > r2) continue;
      if (_pick.length < maxN) { _pick.push(a); _pickD.push(dd); }
      else { let wi = 0; for (let k = 1; k < maxN; k++) if (_pickD[k] > _pickD[wi]) wi = k;
        if (dd < _pickD[wi]) { _pick[wi] = a; _pickD[wi] = dd; } }
    }
  }
  return _pick;
}

/* ---- SMOKE: pooled rising puffs (one Points cloud) at chimneys / fire pits ---- */
const SMOKE_EMIT = 4, SMOKE_PUFFS = 10, SMOKE_N = SMOKE_EMIT * SMOKE_PUFFS;
const smokePos = new Float32Array(SMOKE_N * 3), smokeCol = new Float32Array(SMOKE_N * 3);
const smokeSt = [];
for (let i = 0; i < SMOKE_N; i++) smokeSt.push({ age: Math.random() * 3, life: 2.6 + Math.random() * 2.4, ox: (Math.random() - 0.5) * 0.3, oz: (Math.random() - 0.5) * 0.3, seed: Math.random() * 7 });
const smokeGeo = new THREE.BufferGeometry();
smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
smokeGeo.setAttribute('color', new THREE.BufferAttribute(smokeCol, 3));
const smokeMesh = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ size: 2.6, map: texSoft, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.5 }));
smokeMesh.frustumCulled = false; scene.add(smokeMesh);
const _smokeWarm = srgb(0x8f857a), _smokeFog = new THREE.Color();
function updateSmoke(dt, time) {
  const emitters = pickNearest('smokes', SMOKE_EMIT, 62), nE = emitters.length;
  const dusk = Math.exp(-Math.pow(sunElev * 4.4, 2));
  const vis = clamp(0.5 * dayF + 0.4 * dusk, 0, 0.85);   // by day, brightest at dusk/dawn, gone at deep night
  smokeMesh.visible = nE > 0 && vis > 0.03;
  if (!smokeMesh.visible) return;
  smokeMesh.material.opacity = 0.62 * vis;
  _smokeFog.copy(scene.fog.color);
  for (let i = 0; i < SMOKE_N; i++) {
    const e = i % SMOKE_EMIT, st = smokeSt[i];
    if (e >= nE) { smokePos[i * 3 + 1] = -80; smokeCol[i * 3] = smokeCol[i * 3 + 1] = smokeCol[i * 3 + 2] = 0; continue; }
    const A = emitters[e];
    st.age += dt;
    if (st.age >= st.life) { st.age = 0; st.life = 2.6 + Math.random() * 2.4; st.ox = (Math.random() - 0.5) * 0.3; st.oz = (Math.random() - 0.5) * 0.3; st.seed = Math.random() * 7; }
    const k = st.age / st.life, rise = k * st.life * 1.5;
    smokePos[i * 3] = A.x + st.ox + Math.sin(time * 1.3 + st.seed) * (0.2 + k * 0.5) + wind.dirX * wind.strength * rise * 0.14;
    smokePos[i * 3 + 1] = A.y + rise;
    smokePos[i * 3 + 2] = A.z + st.oz + Math.cos(time * 1.1 + st.seed) * (0.2 + k * 0.5) + wind.dirZ * wind.strength * rise * 0.14;
    smokeCol[i * 3] = _smokeWarm.r * (1 - k) + _smokeFog.r * k;      // dissipate → blend into the sky/fog
    smokeCol[i * 3 + 1] = _smokeWarm.g * (1 - k) + _smokeFog.g * k;
    smokeCol[i * 3 + 2] = _smokeWarm.b * (1 - k) + _smokeFog.b * k;
  }
  smokeGeo.attributes.position.needsUpdate = true; smokeGeo.attributes.color.needsUpdate = true;
}

/* ---- LEAF SCRAPS: tiny pooled quads that pop off the sweeper's broom (one Points cloud) ---- */
const SCRAP_N = 16;
const scrapPos = new Float32Array(SCRAP_N * 3), scrapCol = new Float32Array(SCRAP_N * 3);
const scrapSt = [];
for (let i = 0; i < SCRAP_N; i++) { scrapSt.push({ active: false, age: 0, life: 0, x: 0, y: -80, z: 0, vx: 0, vz: 0 }); scrapPos[i * 3 + 1] = -80; }
const scrapGeo = new THREE.BufferGeometry();
scrapGeo.setAttribute('position', new THREE.BufferAttribute(scrapPos, 3));
scrapGeo.setAttribute('color', new THREE.BufferAttribute(scrapCol, 3));
const scrapMesh = new THREE.Points(scrapGeo, new THREE.PointsMaterial({ size: 0.34, map: texSoft, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.85 }));
scrapMesh.frustumCulled = false; scene.add(scrapMesh);
const _scrapCol = srgb(0x8a7f45);
let _scrapW = 0;
function emitScraps(x, z) {
  const n = 2 + (Math.random() * 2 | 0);
  for (let k = 0; k < n; k++) {
    const s = scrapSt[_scrapW++ % SCRAP_N], a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 0.5;
    s.active = true; s.age = 0; s.life = 0.9 + Math.random() * 0.8; s.x = x; s.y = terrainY(x, z) + 0.15; s.z = z; s.vx = Math.cos(a) * sp; s.vz = Math.sin(a) * sp;
  }
}
function updateScraps(dt) {
  for (let i = 0; i < SCRAP_N; i++) {
    const s = scrapSt[i];
    if (!s.active) { scrapPos[i * 3 + 1] = -80; scrapCol[i * 3] = scrapCol[i * 3 + 1] = scrapCol[i * 3 + 2] = 0; continue; }
    s.age += dt; const k = s.age / s.life;
    if (k >= 1) { s.active = false; scrapPos[i * 3 + 1] = -80; scrapCol[i * 3] = scrapCol[i * 3 + 1] = scrapCol[i * 3 + 2] = 0; continue; }
    s.x += s.vx * dt + wind.dirX * wind.strength * 0.01; s.z += s.vz * dt + wind.dirZ * wind.strength * 0.01;
    s.vx *= 0.9; s.vz *= 0.9; s.y = 0.15 + Math.sin(k * Math.PI) * 0.25;
    const f = 1 - k;
    scrapPos[i * 3] = s.x; scrapPos[i * 3 + 1] = s.y; scrapPos[i * 3 + 2] = s.z;
    scrapCol[i * 3] = _scrapCol.r * f; scrapCol[i * 3 + 1] = _scrapCol.g * f; scrapCol[i * 3 + 2] = _scrapCol.b * f;
  }
  scrapGeo.attributes.position.needsUpdate = true; scrapGeo.attributes.color.needsUpdate = true;
}

/* ---- SWINGING LANTERNS: additive glow sprites that sway at night (one Points cloud) ---- */
const SWING_N = 10;
const swingPos = new Float32Array(SWING_N * 3), swingCol = new Float32Array(SWING_N * 3);
for (let i = 0; i < SWING_N; i++) swingPos[i * 3 + 1] = -80;
const swingGeo = new THREE.BufferGeometry();
swingGeo.setAttribute('position', new THREE.BufferAttribute(swingPos, 3));
swingGeo.setAttribute('color', new THREE.BufferAttribute(swingCol, 3));
const swingMesh = new THREE.Points(swingGeo, new THREE.PointsMaterial({ size: 0.9, map: texSoft, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 }));
swingMesh.frustumCulled = false; scene.add(swingMesh);
const _swingCol = srgb(0xffd9a0);
function updateSwing(dt, time) {
  const anchors = pickNearest('swingAnchors', SWING_N, 55), nA = anchors.length;
  swingMesh.visible = nightF > 0.04 && nA > 0;
  if (!swingMesh.visible) return;
  for (let i = 0; i < SWING_N; i++) {
    if (i >= nA) { swingPos[i * 3 + 1] = -80; swingCol[i * 3] = swingCol[i * 3 + 1] = swingCol[i * 3 + 2] = 0; continue; }
    const A = anchors[i];
    swingPos[i * 3] = A.x + Math.sin(time * 1.6 + i * 1.3) * 0.1 + wind.dirX * wind.strength * 0.05;   // ±0.1 m sway
    swingPos[i * 3 + 1] = A.y + Math.sin(time * 2.1 + i) * 0.03;
    swingPos[i * 3 + 2] = A.z + Math.cos(time * 1.4 + i) * 0.08;
    const b = nightF * (0.75 + Math.sin(time * 3 + i * 2) * 0.15);   // gentle flicker
    swingCol[i * 3] = _swingCol.r * b; swingCol[i * 3 + 1] = _swingCol.g * b; swingCol[i * 3 + 2] = _swingCol.b * b;
  }
  swingGeo.attributes.position.needsUpdate = true; swingGeo.attributes.color.needsUpdate = true;
}

/* ---- DRIPS: dew streaks off bridge/viaduct undersides in the morning (one Points cloud) ---- */
const DRIP_N = 6;
const dripPos = new Float32Array(DRIP_N * 3), dripCol = new Float32Array(DRIP_N * 3);
const dripSt = [];
for (let i = 0; i < DRIP_N; i++) { dripSt.push({ active: false, x: 0, y: -80, z: 0, y0: 0, vy: 0 }); dripPos[i * 3 + 1] = -80; }
const dripGeo = new THREE.BufferGeometry();
dripGeo.setAttribute('position', new THREE.BufferAttribute(dripPos, 3));
dripGeo.setAttribute('color', new THREE.BufferAttribute(dripCol, 3));
const dripMesh = new THREE.Points(dripGeo, new THREE.PointsMaterial({ size: 0.4, map: texSoft, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.7 }));
dripMesh.frustumCulled = false; scene.add(dripMesh);
const _dripCol = srgb(0xbcd6e0);
function updateDrips(dt) {
  const anchors = pickNearest('dripAnchors', 8, 45), vis = dewF;
  dripMesh.visible = vis > 0.05 && anchors.length > 0;
  for (let i = 0; i < DRIP_N; i++) {
    const s = dripSt[i];
    if (!s.active) {
      dripPos[i * 3 + 1] = -80; dripCol[i * 3] = dripCol[i * 3 + 1] = dripCol[i * 3 + 2] = 0;
      if (dripMesh.visible && anchors.length && Math.random() < 0.012 * vis) {
        const A = anchors[(Math.random() * anchors.length) | 0];
        s.active = true; s.x = A.x + (Math.random() - 0.5) * 1.6; s.z = A.z + (Math.random() - 0.5) * 1.6; s.y = A.y; s.y0 = A.y; s.vy = 0;
      }
      continue;
    }
    s.vy -= 9.8 * dt; s.y += s.vy * dt;
    if (s.y < s.y0 - 4.5) { s.active = false; dripPos[i * 3 + 1] = -80; dripCol[i * 3] = dripCol[i * 3 + 1] = dripCol[i * 3 + 2] = 0; continue; }
    dripPos[i * 3] = s.x; dripPos[i * 3 + 1] = s.y; dripPos[i * 3 + 2] = s.z;
    const b = vis * 0.85;
    dripCol[i * 3] = _dripCol.r * b; dripCol[i * 3 + 1] = _dripCol.g * b; dripCol[i * 3 + 2] = _dripCol.b * b;
  }
  dripGeo.attributes.position.needsUpdate = true; dripGeo.attributes.color.needsUpdate = true;
}

/* ---- BANNERS: a small pool of 2-quad cloth banners that flutter with the wind ---- */
const BANNER_HUES = [0xb5552f, 0x9a7a2f, 0x4e6242].map(srgb);
function makeBanner() {
  const g = new THREE.Group(); g.matrixAutoUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ color: 0xb5552f, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const w = 0.55, h = 1.05;
  const gi = new THREE.PlaneGeometry(w, h); gi.translate(w / 2, -h / 2, 0);
  g.add(new THREE.Mesh(gi, mat));
  const outerPivot = new THREE.Group(); outerPivot.position.set(w, 0, 0);
  const go = new THREE.PlaneGeometry(w, h); go.translate(w / 2, -h / 2, 0);
  outerPivot.add(new THREE.Mesh(go, mat)); g.add(outerPivot);
  g.visible = false; scene.add(g);
  return { g, mat, outerPivot };
}
const BANNERS = Array.from({ length: 3 }, makeBanner);
function updateBanners(dt, time) {
  const anchors = pickNearest('bannerAnchors', BANNERS.length, 52);
  for (let i = 0; i < BANNERS.length; i++) {
    const B = BANNERS[i];
    if (i >= anchors.length) { B.g.visible = false; continue; }
    const A = anchors[i];
    B.g.visible = true;
    B.g.position.set(A.x, A.y, A.z);
    B.g.rotation.y = Math.atan2(A.nx, A.nz);
    B.mat.color.copy(BANNER_HUES[A.hue || 0]);
    const f = wind.gust;
    B.outerPivot.rotation.y = 0.3 + Math.sin(time * 2.2 + i) * 0.22 + f * 0.4;   // outer half waves
    B.g.rotation.z = Math.sin(time * 1.5 + i) * 0.03 + f * 0.05;
  }
}

// all pooled ambient vignettes, driven once per frame from the main loop (active only). O(pool).
function updateVignettes(dt, time) {
  updateSmoke(dt, time);
  updateScraps(dt);
  updateSwing(dt, time);
  updateDrips(dt);
  updateBanners(dt, time);
}

/* ======================================================================== */
/*  CARRY-PROPS — the shared collectible language (add-verge-engine-expedition) */
/*  Two halves, both living here where the NPC/prop rigs do:                   */
/*    (a) an animated WORLD-PICKUP pool (bob + slow spin + a pulsing texSoft    */
/*        glint) that reads a piece across a plaza, plus a one-shot pickupBurst; */
/*    (b) a first-person CARRY RIG parented to the camera (lower-right) showing  */
/*        one carried object at a time, with a walk-bob sway (deeper for heavy). */
/*  Consumers: errand parcels (main.js) and every verge item (verge.js). All of */
/*  it is inert in SHOT (nothing shown, no audio) and hidden while the satchel   */
/*  panel is open. carryHeavy (var, cross-file like storyCarrying) is set ONLY    */
/*  by this API and read by player.js to gate sprint. No worldgen touched — the   */
/*  pools are pre-allocated hidden meshes, drawn per-frame for nearby candidates. */
/* ======================================================================== */
var carryHeavy = false;   // var: read by player.js (cross-file, storyCarrying precedent). Set only here.

// --- shared materials (brass house style; distinct from the NPC brass so tinting is free) ---
const cpBrass = new THREE.MeshStandardMaterial({ color: 0x9a7b3a, roughness: 0.5, metalness: 0.35, envMap: envRT.texture, envMapIntensity: 0.5 });
const cpBrassLt = new THREE.MeshStandardMaterial({ color: 0xc4a55e, roughness: 0.45, metalness: 0.4, envMap: envRT.texture, envMapIntensity: 0.5 });
const cpIron = new THREE.MeshStandardMaterial({ color: 0x2b2c24, roughness: 0.8, metalness: 0.2 });
const cpGlass = new THREE.MeshStandardMaterial({ color: 0x9fc6c0, roughness: 0.3, metalness: 0.1, emissive: srgb(0x2a4a44), emissiveIntensity: 0.3, envMap: envRT.texture, envMapIntensity: 0.8 });
const cpWax = new THREE.MeshStandardMaterial({ color: 0xe7dcc0, roughness: 0.9, metalness: 0 });

/* ---- (a) WORLD PICKUP POOL ------------------------------------------------
   8 slots. Each slot is a small brass cluster (a blob core + a box facet) plus a
   texSoft glow sprite, so an uncollected piece bobs, spins, and pulses a glint. A
   caller (verge.js) does pickupBegin() → pickupShow(x,y,z,kind,time) per visible
   candidate → pickupEnd(); the slots left unused this frame are hidden. Never in SHOT. */
const PICKUP_N = 8;
const PICKUP_TINT = {   // per-kind cluster tint (reads at range; not load-bearing)
  flywheel: 0x8a6a2e, governor: 0xb08a3a, windrose: 0x9fc6c0, escapement: 0xc4a55e,
  coil: 0x9a7b3a, censer: 0xb99a6a, timetable: 0xd8cf9a, generic: 0x9a7b3a
};
const PICKUP_POOL = Array.from({ length: PICKUP_N }, () => {
  const g = new THREE.Group();
  const core = new THREE.Mesh(tplBlob, cpBrass); core.scale.setScalar(0.26);
  const facet = new THREE.Mesh(tplBox, cpBrassLt); facet.scale.set(0.34, 0.14, 0.34); facet.position.y = 0.0;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: texSoft, color: 0xffe9a8, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  spr.scale.setScalar(1.4);
  g.add(core, facet, spr); g.visible = false; scene.add(g);
  return { g, core, facet, spr };
});
let _pickN = 0;
function pickupBegin() { _pickN = 0; }
function pickupShow(x, y, z, kind, time) {
  if (SHOT) return;
  const s = PICKUP_POOL[_pickN++]; if (!s) return;
  const bob = Math.sin((time || 0) * 1.9 + x * 0.7) * 0.09;
  s.g.position.set(x, y + 0.4 + bob, z);
  s.g.rotation.y = (time || 0) * 0.7;
  const tint = PICKUP_TINT[kind] || PICKUP_TINT.generic;
  // shared materials stay untinted (mutating them would recolor every slot); the glint
  // sprite carries the per-kind tint so a piece still reads across a plaza.
  s.core.material = (kind === 'windrose') ? cpGlass : cpBrass;
  s.facet.material = cpBrassLt;
  const pulse = 0.42 + 0.28 * (0.5 + 0.5 * Math.sin((time || 0) * 3.1 + z));
  s.spr.material.opacity = pulse;
  s.spr.material.color.setHex(tint);
  s.spr.scale.setScalar(1.25 + 0.35 * Math.sin((time || 0) * 3.1 + z));
  s.g.visible = true;
}
function pickupEnd() { for (let i = _pickN; i < PICKUP_N; i++) PICKUP_POOL[i].g.visible = false; }

// --- burst: a brief scale-pop sprite + a chime arpeggio (sfxNote, AC-gated) on collection ---
const BURST_N = 4;
const BURST_POOL = Array.from({ length: BURST_N }, () => {
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: texSoft, color: 0xffe9a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  spr.scale.setScalar(0.1); spr.visible = false; scene.add(spr);
  return { spr, t: 0, life: 0 };
});
function pickupBurst(x, y, z) {
  if (SHOT) return;
  const b = BURST_POOL.find(b => b.life <= 0) || BURST_POOL[0];
  b.spr.position.set(x, y + 0.5, z); b.t = 0; b.life = 0.25; b.spr.visible = true;
  // chime arpeggio — reuse the Ciphers' sfxNote (loaded before us at runtime), AC-gated inside.
  if (typeof sfxNote === 'function') { sfxNote(659.25, 0.35, 0.06); setTimeout(() => sfxNote(783.99, 0.35, 0.06), 70); setTimeout(() => sfxNote(1046.5, 0.5, 0.06), 150); }
}
function updateBursts(dt) {
  for (const b of BURST_POOL) {
    if (b.life <= 0) continue;
    b.t += dt; const u = Math.min(1, b.t / 0.25);
    b.spr.scale.setScalar(0.4 + u * 2.6);
    b.spr.material.opacity = 0.8 * (1 - u);
    if (u >= 1) { b.life = 0; b.spr.visible = false; }
  }
}

/* ---- (b) FIRST-PERSON CARRY RIG -------------------------------------------
   One Group parented to the camera, lower-right. Per-kind child clusters (built once,
   hidden); carryShow(kind) reveals exactly one and sets carryHeavy for the heavy kinds
   (assay casting + the five machine pieces). Walk-bob sway from player.bob; hidden in
   SHOT and while the satchel is open. Machine pieces ride here from the solve site until
   seated at the Gate — the walk home is the reward lap (design D7). */
const carryRig = new THREE.Group();
carryRig.position.set(0.34, -0.30, -0.78);   // camera space: -Z forward, lower-right
carryRig.visible = false;
camera.add(carryRig);
const _carryKinds = {};
function _cpAdd(group, geo, mat, sx, sy, sz, px, py, pz, rx, ry, rz) {
  const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz);
  m.position.set(px || 0, py || 0, pz || 0); m.rotation.set(rx || 0, ry || 0, rz || 0);
  group.add(m); return m;
}
function _cpKind(name, build) { const g = new THREE.Group(); g.visible = false; build(g); carryRig.add(g); _carryKinds[name] = g; }

// parcel — a waxcloth box tied with a cord (reuses the NPC paper/wood look)
_cpKind('parcel', g => { _cpAdd(g, tplBox, npcPaperMat, 0.20, 0.15, 0.15); _cpAdd(g, tplBox, npcWoodMat, 0.215, 0.02, 0.03, 0, 0.075, 0); _cpAdd(g, tplBox, npcWoodMat, 0.03, 0.02, 0.16, 0, 0.075, 0); });
// taper — a slim wax stick with a live flame sprite at the tip (burn-down via carrySetBurn)
let _cpTaperStick = null, _cpTaperFlame = null;
_cpKind('taper', g => {
  _cpTaperStick = _cpAdd(g, tplCyl, cpWax, 0.018, 0.26, 0.018, 0, 0, 0);
  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: texSoft, color: 0xffb347, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  fl.scale.setScalar(0.09); fl.position.set(0, 0.29, 0); g.add(fl); _cpTaperFlame = fl;
});
// assay casting — a heavy brass ingot silhouette
_cpKind('casting', g => { _cpAdd(g, tplBox, cpBrass, 0.22, 0.12, 0.16); _cpAdd(g, tplBox, cpBrassLt, 0.10, 0.06, 0.10, 0, 0.09, 0); });
// the five machine pieces — distinct 2–3-mesh brass clusters
_cpKind('governor', g => {   // flyball governor: a spindle + two arms with balls
  _cpAdd(g, tplCyl, cpBrass, 0.03, 0.24, 0.03);
  _cpAdd(g, tplBox, cpBrassLt, 0.22, 0.02, 0.02, 0, 0.18, 0, 0, 0, 0.5);
  _cpAdd(g, tplBlob, cpBrass, 0.05, 0.05, 0.05, 0.09, 0.13, 0); _cpAdd(g, tplBlob, cpBrass, 0.05, 0.05, 0.05, -0.09, 0.13, 0);
});
_cpKind('windrose', g => {   // compass rose: a glass disc + crossed brass vanes
  _cpAdd(g, tplCyl, cpGlass, 0.14, 0.02, 0.14, 0, 0.09, 0, Math.PI / 2, 0, 0);
  _cpAdd(g, tplBox, cpBrassLt, 0.26, 0.015, 0.03, 0, 0.1, 0); _cpAdd(g, tplBox, cpBrassLt, 0.03, 0.015, 0.26, 0, 0.1, 0);
});
_cpKind('escapement', g => {   // gear + pallet fork
  _cpAdd(g, tplWheel, cpBrass, 0.16, 0.16, 0.03, 0, 0.09, 0);
  _cpAdd(g, tplBox, cpIron, 0.03, 0.16, 0.02, 0.02, 0.14, 0.02, 0, 0, 0.3);
});
_cpKind('coil', g => {   // condenser coil: stacked brass rings on a core
  _cpAdd(g, tplCyl, cpIron, 0.03, 0.26, 0.03);
  for (let i = 0; i < 4; i++) _cpAdd(g, tplWheel, cpBrass, 0.11, 0.11, 0.02, 0, 0.03 + i * 0.06, 0);
});
_cpKind('censer', g => {   // cloud-seed censer: a hanging bowl + lid + a wisp
  _cpAdd(g, tplBlob, cpBrass, 0.13, 0.09, 0.13, 0, 0.06, 0);
  _cpAdd(g, tplCyl, cpBrassLt, 0.06, 0.05, 0.06, 0, 0.13, 0);
  const wisp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texSoft, color: 0xbfe8d8, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  wisp.scale.setScalar(0.11); wisp.position.set(0, 0.22, 0); g.add(wisp);
});

const CARRY_HEAVY_KINDS = { casting: 1, governor: 1, windrose: 1, escapement: 1, coil: 1, censer: 1 };
let _carryKind = null;
function carryShow(kind) {
  if (!_carryKinds[kind]) return;
  for (const k in _carryKinds) _carryKinds[k].visible = (k === kind);
  _carryKind = kind;
  carryHeavy = !!CARRY_HEAVY_KINDS[kind];
}
function carryHide() {
  _carryKind = null; carryHeavy = false;
  for (const k in _carryKinds) _carryKinds[k].visible = false;
}
function carryKind() { return _carryKind; }
// taper burn-down: shrink the stick and dim the flame as frac→0 (verge.js drives it each frame).
function carrySetBurn(frac) {
  if (!_cpTaperStick) return;
  const f = clamp(frac, 0, 1);
  _cpTaperStick.scale.y = 0.10 + 0.16 * f;
  _cpTaperStick.position.y = 0;
  if (_cpTaperFlame) { _cpTaperFlame.position.y = 0.03 + 0.26 * f; }
}

// One per-frame driver (main loop, all modes — cheap; self-gates SHOT/satchel). Sway the rig
// from the walk bob (deeper for heavy kinds), flicker the taper flame, and age the bursts.
function updateCarry(dt, time) {
  updateBursts(dt);
  const open = (typeof satchelOpen !== 'undefined' && satchelOpen);
  if (SHOT || open || !_carryKind) { carryRig.visible = false; return; }
  carryRig.visible = true;
  const heavy = !!CARRY_HEAVY_KINDS[_carryKind];
  const bob = (typeof player !== 'undefined' && player.bob) ? player.bob : time * 2;
  const amp = heavy ? 0.05 : 0.028;
  carryRig.position.set(0.34 + Math.sin(bob) * amp * 0.6, -0.30 + Math.abs(Math.sin(bob)) * -amp, -0.78);
  carryRig.rotation.set(Math.sin(bob) * (heavy ? 0.06 : 0.03), Math.cos(bob * 0.5) * 0.02, Math.sin(bob) * (heavy ? 0.05 : 0.025));
  if (_carryKind === 'taper' && _cpTaperFlame) {
    const fl = 0.075 + Math.abs(Math.sin(time * 11)) * 0.03 + Math.sin(time * 23) * 0.01;
    _cpTaperFlame.scale.setScalar(fl);
    _cpTaperFlame.material.opacity = 0.75 + 0.2 * Math.sin(time * 17);
  }
}

