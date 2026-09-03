/* CANOPY split file  sail: awesome-pass — see openspec/changes/awesome-pass/design.md */
'use strict';
/* ==========================================================================
   THE LEAF-SAIL (design B1)
   The state machine (unfurl/furl, the glide integration, landings, fov & roll)
   lives in player.js's stepPlayer, because it is physics. This file owns the
   three things that are NOT physics:
     · sailTargets(pitch, tier) — the pure glide table. Kept here, and kept pure,
       so the numeric harness can require it with nothing else loaded.
     · the first-person wing rig (a Group parented to the camera)
     · the wind-rush audio and the two teaching lines
   Nothing here builds, animates or sounds in SHOT mode.
   ========================================================================== */

/* ---- the glide table ------------------------------------------------------
   θ = player pitch in [-1.45, 1.45], UP positive. Diving trades height for speed,
   flaring trades speed for hang time; both saturate, so neither is a free lunch.
   Tiers come from the glowseed ladder (seeds.js): a better sail sinks slower and
   cruises faster, without changing the shape of the curve.
   Deliberately dependency-free (no clamp/lerp from core.js) — it is the one piece
   of this feature that a node harness can exercise on its own. */
function sailTargets(pitch, tier) {
  const th = pitch < -1.45 ? -1.45 : (pitch > 1.45 ? 1.45 : pitch);
  const t = tier | 0;
  const bSink = t >= 2 ? -1.4 : (t === 1 ? -1.8 : -2.2);
  const bSpeed = t >= 2 ? 11.5 : (t === 1 ? 10.5 : 9.5);
  let sink, speed;
  if (th < 0) {                                     // dive: sink hard, gain speed
    sink = Math.max(-8.5, bSink + 6.0 * th);
    speed = Math.min(15, bSpeed - 5.5 * th);
  } else {                                          // flare: float, bleed speed
    sink = Math.min(-0.7, bSink + 1.6 * th);
    speed = Math.max(3.5, bSpeed - 6.0 * th);
  }
  return { sink: sink, speed: speed };
}

/* ---- the first-person wing rig -------------------------------------------
   Built lazily on the first non-SHOT frame that actually needs it, so a screenshot
   run never allocates a byte of it. Two lanceolate blades on a short spar, parented
   to the camera; they flap, bank with p.roll, and scale in with p.sailT. */
let sailRig = null;

function _sailBlade() {
  // A lanceolate leaf: tip at +X, root at the origin, drawn with two quadratic curves.
  const L = 1.9, W = 0.42;
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.quadraticCurveTo(L * 0.42, W, L, 0.02);
  sh.quadraticCurveTo(L * 0.42, -W, 0, 0);
  return new THREE.ShapeGeometry(sh, 14);
}

function _buildSailRig() {
  const g = new THREE.Group();
  // Not matLeaf: that one is fed by vertex colours the worldgen batches write.
  const mat = new THREE.MeshStandardMaterial({
    map: (typeof texLeaf !== 'undefined' ? texLeaf : null),
    alphaTest: 0.45, side: THREE.DoubleSide, transparent: false,
    color: 0xbfe08a, emissive: 0x3d7a22, emissiveIntensity: 0.55, roughness: 0.8, metalness: 0
  });
  const blade = _sailBlade();
  const wingR = new THREE.Mesh(blade, mat);
  const wingL = new THREE.Mesh(blade, mat);
  wingR.rotation.set(-Math.PI / 2, 0, -0.30);        // lie flat overhead, tip out to +X, drooping into view
  wingL.rotation.set(-Math.PI / 2, 0, Math.PI + 0.30); // mirrored, tip out to -X
  wingR.position.set(0.18, 0, 0);
  wingL.position.set(-0.18, 0, 0);
  const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.46, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.95 }));
  spar.rotation.z = Math.PI / 2;
  const ropeGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.9, 4);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x4a3b26, roughness: 1 });
  const ropeR = new THREE.Mesh(ropeGeo, ropeMat), ropeL = new THREE.Mesh(ropeGeo, ropeMat);
  ropeR.position.set(0.30, -0.45, 0.10); ropeR.rotation.z = -0.22;
  ropeL.position.set(-0.30, -0.45, 0.10); ropeL.rotation.z = 0.22;
  g.add(wingR); g.add(wingL); g.add(spar); g.add(ropeR); g.add(ropeL);
  // Camera space. Sits at ~27 degrees above the view centre, so the wing roots and spar
  // ride along the top edge of the frame at the sail's 82-degree fov; at the design's
  // (0, 0.62, -0.55) the rig sat 48 degrees up and was never inside the frustum.
  g.position.set(0, 0.30, -0.74);
  g.visible = false;
  camera.add(g);
  return { g: g, wingR: wingR, wingL: wingL };
}

/* ---- wind-rush audio ------------------------------------------------------
   Same shape as initAudio's wind bed: looping noise buffer → bandpass → gain →
   master. Created once, on the first unfurl with an AudioContext alive. */
let sailNoiseGain = null, sailAudioTried = false;
function _sailAudio() {
  if (sailNoiseGain || sailAudioTried) return sailNoiseGain;
  sailAudioTried = true;
  if (typeof AC === 'undefined' || !AC || !master) { sailAudioTried = false; return null; }
  try {
    const len = AC.sampleRate * 2, buf = AC.createBuffer(1, len, AC.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
    sailNoiseGain = AC.createGain(); sailNoiseGain.gain.value = 0;
    src.connect(bp); bp.connect(sailNoiseGain); sailNoiseGain.connect(master);
    src.start();
  } catch (e) { sailNoiseGain = null; }
  return sailNoiseGain;
}
// The unfurl "whump": a short noise burst under a falling low-pass — canvas snapping taut.
function _sailWhump() {
  if (typeof AC === 'undefined' || !AC || !master || muted) return;
  try {
    const t0 = AC.currentTime + 0.01, len = Math.floor(AC.sampleRate * 0.18);
    const buf = AC.createBuffer(1, len, AC.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = AC.createBufferSource(); src.buffer = buf;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t0); lp.frequency.exponentialRampToValueAtTime(220, t0 + 0.18);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.22, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + 0.22);
  } catch (e) { /* no audio */ }
}

/* ---- hooks called by player.js's state machine ---------------------------- */
function sailOnUnfurl() {
  if (SHOT) return;
  _sailAudio(); _sailWhump();
  once('sail', () => msg('The leaf-sail snaps open and the fall turns into a glide. Look down to dive, up to float.', 7));
}
function sailOnFurl() { /* the gain ramp in updateSailRig handles the fade-out */ }

/* ---- per-frame rig / audio / teaching ------------------------------------ */
let sailHintArmed = true;
function updateSailRig(dt, time) {
  if (SHOT) return;
  const p = player;

  // Teaching: the first time a real fall is under way and the sail is still furled.
  if (sailHintArmed && !p.sailing && !p.grounded && !p.climbing && !p.onLadder &&
      p.airPeakY - p.pos.y > 4) {
    sailHintArmed = false;
    once('sailhint', () => hint('Press SPACE mid-air to unfurl your leaf-sail', 5));
  }
  if (p.grounded) sailHintArmed = true;

  const speed = Math.hypot(p.vel.x, p.vel.z);

  // Audio: gain tracks airspeed while sailing, falls silent otherwise.
  const ng = p.sailing ? _sailAudio() : sailNoiseGain;
  if (ng && typeof AC !== 'undefined' && AC) {
    const want = (p.sailing && !muted) ? 0.10 * Math.min(1, Math.max(0, speed / 12)) : 0;
    ng.gain.setTargetAtTime(want, AC.currentTime, 0.15);
  }

  // Rig: nothing exists until the first unfurl, and it hides again once fully folded.
  if (p.sailT <= 0) { if (sailRig) sailRig.g.visible = false; return; }
  if (!sailRig) sailRig = _buildSailRig();
  const r = sailRig;
  r.g.visible = true;
  const s = 0.55 + 0.45 * p.sailT;                    // unfurl pop
  r.g.scale.setScalar(s);
  r.g.rotation.z = p.roll * 1.6;                      // the wings bank harder than the horizon
  r.g.rotation.x = 0.18 + (1 - p.sailT) * 0.5;      // tipped toward the camera so the blades show their faces
  const flap = (4 * Math.PI / 180) * Math.sin(time * 1.6 * Math.PI * 2) * Math.min(1, speed / 10);
  r.wingR.rotation.y = flap;
  r.wingL.rotation.y = -flap;
}
