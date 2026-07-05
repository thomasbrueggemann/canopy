/* CANOPY split file  player: physics, collision, heat (was game.js lines 2927-3226). Header/error-handler in core.js. */
'use strict';
/* ======================================================================== */
/*  PLAYER                                                                  */
/* ======================================================================== */
const player = {
  pos: new THREE.Vector3(2.2, 0, 2.2),
  vel: new THREE.Vector3(),
  yaw: Math.atan2(-(SPIRE.x - 2.2), -(SPIRE.z - 2.2)),  // face the spire
  pitch: 0,
  grounded: false, climbing: false, onCanopy: false, supportLayer: null,
  onLadder: null,                                         // Ladders: {lad} while latched to a rung ladder
  heat: 0, exposed: false, inPit: false, inWater: false,
  bob: 0, stride: 0,
  airPeakY: 0, stagger: 0, shake: 0, blackout: false, blackouts: 0,
  sunE: 0                                                  // smoothed sun-exposure factor (0=full shade, 1=raw sun)
};
let lastShade = player.pos.clone();
// Permanent sprint boost, awarded after golding all five Trials (persisted).
let sprintBoost = false;
try { sprintBoost = localStorage.getItem('canopy.sprintboost') === '1'; } catch (e) { }
const keys = {};
let locked = false, started = false;

addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyM') toggleAudio();
  if (e.code === 'KeyF' && started) { flashOn = !flashOn; hint(flashOn ? 'flashlight on' : 'flashlight off', 1.2); }
  if (e.code === 'KeyR' && started) { player.pos.copy(lastShade); player.vel.set(0, 0, 0); player.heat = Math.min(player.heat, 40); }
  // Satchel (inventory.js): I toggles it, Tab leafs through while open. preventDefault only when
  // the satchel owns the Tab (satchelCycle returns false when closed) so focus never leaves the canvas.
  if (e.code === 'KeyI' && started && typeof satchelToggle === 'function') satchelToggle();
  if (e.code === 'Tab' && started && typeof satchelCycle === 'function') { if (satchelCycle()) e.preventDefault(); }
  if (e.code === 'KeyE' && started) {
    // Latched to a ladder: E always lets go FIRST — before any positional interaction (a cache,
    // plaque, journal page, or the Tinker that happens to sit within reach, e.g. the Four Seasons
    // cache beside the fallen-tower ladder) can steal the press. Reset airPeakY so the ensuing
    // fall is measured from the release point, not a stale pre-latch apex (an airborne latch-save).
    if (player.onLadder) { player.onLadder = null; player.airPeakY = player.pos.y; }
    // Story first (Part 2): the Archivist / campaign interactions are rare & positional, so they
    // win ties over the trial-master and errand giver. storyInteract() returns true if it consumed E.
    else if (typeof storyInteract === 'function' && storyInteract()) { /* consumed by the campaign */ }
    // Ciphers next (story > puzzles > inventory > trial > errand): the Tinker & the five caches.
    // puzzleInteract() returns true if it consumed E.
    else if (typeof puzzleInteract === 'function' && puzzleInteract()) { /* consumed by the Ciphers */ }
    // Inventory next: picking up a journal page within reach. Returns true if it consumed E.
    else if (typeof inventoryInteract === 'function' && inventoryInteract()) { /* picked up a journal page */ }
    // Ladders next (after inventory, before the trial-master): latch onto / release a ladder.
    else if (typeof ladderInteract === 'function' && ladderInteract()) { /* latched or released a ladder */ }
    else {
      const tm = (typeof nearestTrialMaster === 'function') ? nearestTrialMaster(3.4) : null;
      if (tm && !trial) { offerTrial(tm); }
      else if (giver && !activeMission && !trial &&
          Math.hypot(giver.g.position.x - player.pos.x, giver.g.position.z - player.pos.z) < 3.4) acceptMission(giver.giverArch);
    }
  }
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('mousemove', e => {
  if (!locked) return;
  player.yaw -= e.movementX * 0.0021;
  player.pitch = clamp(player.pitch - e.movementY * 0.0021, -1.45, 1.45);
});

const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => {
  initAudio();
  canvas.requestPointerLock && canvas.requestPointerLock();
  if (SHOT) hideOverlay();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) hideOverlay(); else if (!SHOT) showOverlay(true);
});
function hideOverlay() {
  overlay.style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  started = true;
}
function showOverlay(paused) {
  overlay.style.display = 'flex';
  if (paused) document.getElementById('goLabel').textContent = 'CLICK TO RESUME';
}

/* ---- collision helpers ---- */
function collectColliders(px, pz, out) {
  out.solids.length = 0; out.trunks.length = 0; out.pads.length = 0; out.pits.length = 0; out.waters.length = 0; out.ladders.length = 0;
  const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const c = chunks.get(chunkKey(cx + dx, cz + dz));
    if (!c) continue;
    for (const s of c.colData.solids) out.solids.push(s);
    for (const t of c.colData.trunks) out.trunks.push(t);
    for (const p of c.colData.pads) out.pads.push(p);
    for (const pit of c.colData.pits) out.pits.push(pit);
    for (const w of c.colData.waters) out.waters.push(w);
    if (c.colData.ladders) for (const l of c.colData.ladders) out.ladders.push(l);
  }
}
const nearby = { solids: [], trunks: [], pads: [], pits: [], waters: [], ladders: [] };

function stepPlayer(dt) {
  const p = player;
  const feet = () => p.pos.y;
  const wasGrounded = p.grounded, wasClimbing = p.climbing;

  // --- Ladder latch (Ladders feature): a locked-in climb mode, no facing cone, no
  // pitch tricks. Runs BEFORE the normal move/gravity/wind step and returns early, so the
  // weather gust can never shove the player off a ladder. Heat/exposure still tick in
  // stepHeat (called separately). W/S climb; Space hops off; E lets go (ladderInteract). ---
  if (p.onLadder) {
    const lad = p.onLadder;
    p.climbing = false; p.grounded = false; p.onCanopy = false; p.supportLayer = null;
    p.vel.set(0, 0, 0);
    p.pos.x = lad.x + lad.nx * 0.55;                     // stay snapped to the climb line
    p.pos.z = lad.z + lad.nz * 0.55;
    collectColliders(p.pos.x, p.pos.z, nearby);          // keep the heat/sun probe arrays current
    const up = keys.KeyW || keys.ArrowUp, down = keys.KeyS || keys.ArrowDown;
    const spd = CLIMB_SPEED * 1.25;                      // ladders are faster than vines — the comfortable path
    if (up) p.pos.y += spd * dt;
    else if (down) p.pos.y -= spd * dt;
    if (up && p.pos.y >= lad.y1 - 0.3) {                 // top-out → auto-mantle onto the deck/rest platform
      p.pos.x = lad.x - lad.nx * 0.9; p.pos.z = lad.z - lad.nz * 0.9;
      p.pos.y = lad.y1 + 0.05; p.vel.y = 2.2;            // small upward pop inward
      p.onLadder = null; p.airPeakY = p.pos.y;
    } else if (down && p.pos.y <= lad.y0 + 0.05) {       // bottom-out → grounded, release
      p.pos.y = lad.y0; p.grounded = true; p.onLadder = null; p.airPeakY = p.pos.y;
    } else if (keys.Space) {                             // hop off backward
      p.vel.x = lad.nx * 2.5; p.vel.z = lad.nz * 2.5; p.vel.y = 3;
      p.onLadder = null; p.airPeakY = p.pos.y;
    }
    camera.position.set(p.pos.x, p.pos.y + EYE, p.pos.z);
    if (p.shake > 0) { camera.position.x += (Math.random() - 0.5) * p.shake * 0.4; p.shake = Math.max(0, p.shake - dt * 2.6); }
    camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    return null;
  }

  // input direction
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) { mx += fx; mz += fz; }
  if (keys.KeyS || keys.ArrowDown) { mx -= fx; mz -= fz; }
  if (keys.KeyD || keys.ArrowRight) { mx += rx; mz += rz; }
  if (keys.KeyA || keys.ArrowLeft) { mx -= rx; mz -= rz; }
  const ml = Math.hypot(mx, mz);
  if (ml > 0) { mx /= ml; mz /= ml; }
  // Trials reward: +10% sprint. Second Seed (Part 2, Ch6/7): sprint disabled while carrying the Seed.
  const carrying = typeof storyCarrying !== 'undefined' && storyCarrying;
  const sprintF = ((keys.ShiftLeft || keys.ShiftRight) && !carrying) ? SPRINT * (sprintBoost ? 1.1 : 1) : 1;
  let speed = WALK * sprintF * (p.inWater ? 0.35 : 1) * (p.stagger > 0 ? 0.45 : 1);   // wading is slow; a hard landing staggers
  // The Long Rain floods the streets: standing water slows walking at ground level (not in
  // water/pit — those have their own rules). Uses last frame's inWater/inPit (set below).
  const _wx = (typeof WX !== 'undefined') ? WX : null;
  if (_wx && _wx.floodSlow < 1 && p.grounded && p.pos.y < 0.6 && !p.inWater && !p.inPit) speed *= _wx.floodSlow;
  if (p.stagger > 0) p.stagger = Math.max(0, p.stagger - dt);
  const accel = p.grounded ? 11 : 3;
  p.vel.x += (mx * speed - p.vel.x) * Math.min(1, accel * dt);
  p.vel.z += (mz * speed - p.vel.z) * Math.min(1, accel * dt);
  // Weather gust shove: a m/s nudge added to velocity (hard-capped below WALK in weather.js,
  // so it can never pin the player or blow them off a bough while standing still).
  if (_wx) { p.vel.x += _wx.windX * dt; p.vel.z += _wx.windZ * dt; }

  // gravity
  if (!p.climbing) p.vel.y -= GRAV * dt;

  if (p.grounded && keys.Space) { p.vel.y = JUMP; p.grounded = false; }

  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;
  p.pos.y += p.vel.y * dt;

  collectColliders(p.pos.x, p.pos.z, nearby);

  // --- horizontal resolve: walls & trunks ---
  let climbNormal = null, climbSolid = null;
  for (const s of nearby.solids) {
    if (feet() > s.h - 0.35) continue;               // above the roofline: no wall
    const cxp = clamp(p.pos.x, s.x0, s.x1), czp = clamp(p.pos.z, s.z0, s.z1);
    let dx = p.pos.x - cxp, dz = p.pos.z - czp;
    let d = Math.hypot(dx, dz);
    if (d >= PR) continue;
    if (d < 1e-5) { dx = 1; dz = 0; d = 1; } // inside: push +x
    const push = (PR - d);
    p.pos.x += dx / d * push; p.pos.z += dz / d * push;
    if (s.vine) { climbNormal = { x: dx / d, z: dz / d }; climbSolid = s; }
  }
  for (const t of nearby.trunks) {
    if (feet() > t.h) continue;
    let dx = p.pos.x - t.x, dz = p.pos.z - t.z;
    let d = Math.hypot(dx, dz);
    const rr = t.r + PR * 0.9;
    if (d >= rr || d < 1e-5) continue;
    p.pos.x += dx / d * (rr - d); p.pos.z += dz / d * (rr - d);
    if (t.h > 14) { climbNormal = { x: dx / d, z: dz / d }; climbSolid = t; } // big trunks climbable
  }

  // --- climbing ---
  p.climbing = false;
  if (climbNormal && (keys.KeyW || keys.ArrowUp)) {
    const facing = -(fx * climbNormal.x + fz * climbNormal.z); // 1 = looking straight at wall
    if (facing > 0.25) {
      p.climbing = true;
      p.vel.y = p.pitch < -0.4 ? -CLIMB_SPEED : CLIMB_SPEED;
      // mantle over the top edge
      const topY = climbSolid.h !== undefined ? climbSolid.h : 0;
      if (topY && feet() > topY - 1.1 && p.pitch >= -0.4) {
        p.vel.y = 4.2;
        p.vel.x -= climbNormal.x * 2.4; p.vel.z -= climbNormal.z * 2.4;
        p.climbing = false;
      }
      if (keys.Space) { // kick off the wall
        p.vel.y = 3.5; p.vel.x += climbNormal.x * 5; p.vel.z += climbNormal.z * 5;
        p.climbing = false;
      }
    }
  }

  // --- vertical support ---
  // Sinkhole: inside a pit radius the ground drops to the pit floor (below y=0), so the
  // base support and the hard floor clamp both follow the pit depth instead of 0.
  let groundY = 0; p.inPit = false;
  for (const pit of nearby.pits) {
    let inside;
    if (pit.rect) inside = p.pos.x > pit.x0 && p.pos.x < pit.x1 && p.pos.z > pit.z0 && p.pos.z < pit.z1;   // canal channel
    else { const dx = p.pos.x - pit.x, dz = p.pos.z - pit.z; inside = dx * dx + dz * dz < pit.r * pit.r; } // sinkhole bowl
    if (inside) { groundY = Math.min(groundY, -pit.depth); p.inPit = true; }
  }
  let support = groundY; p.onCanopy = false;
  let supportIsCanopy = false, supportLayer = null;
  for (const s of nearby.solids) {
    if (p.pos.x < s.x0 - 0.2 || p.pos.x > s.x1 + 0.2 || p.pos.z < s.z0 - 0.2 || p.pos.z > s.z1 + 0.2) continue;
    if (feet() >= s.h - 1.0 && feet() <= s.h + 0.6 && s.h > support) { support = s.h; supportIsCanopy = false; supportLayer = null; }
  }
  for (const pad of nearby.pads) {
    const dx = p.pos.x - pad.x, dz = p.pos.z - pad.z;
    if (dx * dx + dz * dz > pad.r * pad.r) continue;
    if (feet() >= pad.y - 1.3 && feet() <= pad.y + 0.6 && pad.y > support) { support = pad.y; supportIsCanopy = true; supportLayer = pad.layer || null; }
  }
  p.grounded = false;
  if (p.vel.y <= 0.01 && feet() <= support + 0.02) {
    p.pos.y = support; p.vel.y = 0; p.grounded = true; p.onCanopy = supportIsCanopy; p.supportLayer = supportLayer;
  }
  if (p.pos.y < groundY) { p.pos.y = groundY; p.vel.y = 0; p.grounded = true; }

  // --- reservoir water: feet inside a water rect and near the surface ---
  p.inWater = false;
  for (const w of nearby.waters) {
    if (p.pos.x > w.x0 && p.pos.x < w.x1 && p.pos.z > w.z0 && p.pos.z < w.z1 && feet() >= w.y - 1 && feet() <= w.y + 0.3) { p.inWater = true; break; }
  }

  // --- fall damage: track the apex since leaving the ground, resolve the drop on landing ---
  if (p.grounded || p.climbing) {
    p.airPeakY = p.pos.y;                       // on the ground / on a vine → no accumulating fall
  } else {
    if (p.pos.y > p.airPeakY) p.airPeakY = p.pos.y;
  }
  if (p.grounded && !wasGrounded && !wasClimbing) {   // the frame we touch down after being airborne
    handleLanding(p.airPeakY - p.pos.y);
    p.airPeakY = p.pos.y;
  }

  // --- head bob & footsteps ---
  const hSpeed = Math.hypot(p.vel.x, p.vel.z);
  if (p.grounded && hSpeed > 0.6) {
    p.bob += dt * hSpeed * 1.7;
    const strideNow = Math.floor(p.bob / Math.PI);
    if (strideNow !== p.stride) { p.stride = strideNow; sfxStep(); }
  }
  const bobY = (p.grounded ? Math.sin(p.bob * 2) * 0.042 * Math.min(1, hSpeed / 4) : 0);

  ladderProxTick(dt);   // Ladders: throttled "E — climb the ladder" prompt when one is close

  camera.position.set(p.pos.x, p.pos.y + EYE + bobY, p.pos.z);
  if (p.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * p.shake * 0.4;
    camera.position.y += (Math.random() - 0.5) * p.shake * 0.4;
    camera.position.z += (Math.random() - 0.5) * p.shake * 0.4;
    p.shake = Math.max(0, p.shake - dt * 2.6);
  }
  camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');

  return climbNormal;
}

/* ---- Ladders (Ladders feature): latch finder, interact, proximity hint ------
   The nearest ladder whose climb line is within `radius` horizontally and whose
   span contains (or is within 1.5 m of) the player's feet. Pure scan of the 3×3
   nearby.ladders gathered in collectColliders — no state, safe to call anytime. */
function nearestLatchableLadder(radius) {
  const p = player;
  let best = null, bd = radius * radius;
  for (const lad of nearby.ladders) {
    const dx = p.pos.x - lad.x, dz = p.pos.z - lad.z;
    const hd2 = dx * dx + dz * dz;
    if (hd2 >= bd) continue;
    const fy = clamp(p.pos.y, lad.y0, lad.y1);              // nearest point of the span to the feet
    if (Math.abs(p.pos.y - fy) > 1.5) continue;            // feet must be within 1.5 m of the run
    bd = hd2; best = lad;
  }
  return best;
}
// E in the interact chain (after inventory, before the trial-master). Latched → let go in
// place (falls; the fall rules handle it). Unlatched & a ladder is in catch range → latch.
// Returns true when it consumed the E press. Airborne latching IS allowed (a deliberate save).
function ladderInteract() {
  const p = player;
  if (p.onLadder) { p.onLadder = null; return true; }      // let go — a deliberate release
  const lad = nearestLatchableLadder(1.6);
  if (!lad) return false;
  p.onLadder = lad;
  p.vel.set(0, 0, 0);
  p.pos.x = lad.x + lad.nx * 0.55;                          // snap to the climb line, offset along the normal
  p.pos.z = lad.z + lad.nz * 0.55;
  p.pos.y = clamp(p.pos.y, lad.y0, lad.y1);                 // pull the feet onto the span
  p.grounded = false; p.climbing = false;
  once('ladder', () => msg('Waytrees. Someone keeps the rungs oiled — the lookouts belong to everyone.', 8, true));
  return true;
}
let ladderHintT = 0;
function ladderProxTick(dt) {
  if (player.onLadder) return;
  ladderHintT -= dt;
  if (ladderHintT > 0) return;
  const lad = nearestLatchableLadder(2.2);
  if (!lad) return;
  ladderHintT = 1.5;                                        // throttle: at most one prompt every 1.5 s
  hint('E — climb the ladder', 2);
  once('ladder', () => msg('Waytrees. Someone keeps the rungs oiled — the lookouts belong to everyone.', 8, true));
}

/* ---- fall consequences -----------------------------------------------------
   Leaf layers (the Weave, crown nests, boughs, tree-canopy pads) and water always
   catch you. Hard ground / roofs / the viaduct deck / streets hurt: a 7–10 m drop
   staggers; over 10 m blacks you out — you wake in the last shade, hotter, and any
   Trial or errand in progress is lost. Normal jumps (a 3 m wall ≈ 4 m drop) are free. */
const SAFE_LEAF = { weave: 1, nest: 1, bough: 1, net: 1, lookout: 1 };   // + tree-canopy pads (onCanopy, no layer tag); lookout decks/rest-platforms catch you
function handleLanding(drop) {
  const p = player;
  // Sky nets (Feature B): a walkable net catches you from any height and springs you back —
  // a small bounce on anything but a gentle step-down.
  if (p.onCanopy && p.supportLayer === 'net') {
    if (drop > 3) { p.vel.y = 2.5; p.grounded = false; p.airPeakY = p.pos.y; msg('The net flexes and throws you back up.', 3); }
    return;
  }
  if (drop < 7) return;                                          // ordinary hop — nothing happens
  const soft = p.inWater || (p.onCanopy && (p.supportLayer === null || SAFE_LEAF[p.supportLayer]));
  if (soft) {
    if (p.inWater) msg('You crash down into the water — it swallows the fall.', 4);
    else { msg('Leaves burst and give — the forest catches you.', 4); p.shake = Math.min(0.5, drop * 0.03); }
    return;
  }
  if (drop <= 10) {                                              // hard but survivable
    p.stagger = 1.1; p.shake = 0.55;
    msg('You hit hard and stagger, legs jarred by the landing.', 4);
    return;
  }
  blackout('The ground came up fast. Everything went dark.');   // > 10 m onto something hard
}
function blackout(line) {
  const p = player;
  if (p.blackout) return;                                        // already fading — don't stack
  p.blackout = true; p.blackouts++;
  fadeEl.style.opacity = 1;
  if (trial) failTrial('fell', 'You fell. The trial is lost.');
  else if (activeMission) failMission('You fell hard, and the errand with it.');
  setTimeout(() => {
    p.pos.copy(lastShade); p.vel.set(0, 0, 0);
    p.heat = clamp(p.heat + 25, 0, 100);
    p.airPeakY = p.pos.y; p.grounded = true; p.shake = 0; p.stagger = 0;
    if (line) msg(line + ' You wake in the shade, aching.', 6);
    fadeEl.style.opacity = 0;
    p.blackout = false;
  }, 850);
}

/* ======================================================================== */
/*  HEAT                                                                    */
/* ======================================================================== */
/* --- analytic sun-occlusion probe --------------------------------------------
   Marches an implicit ray from the player toward the sun (sunDir, set in updateSky)
   against the runtime collision arrays — no THREE.Raycaster. Any solid AABB across
   the path = full shade. Leaf discs (pads) and trunks each attenuate partially, so
   direct sun reaches the body through shafts between trees at street level, while
   real overhead cover shades you even above CANOPY_Y. Returns exposure E in [0,1]:
   0 = full shade, 1 = raw sun. No allocations — all scalar math. */
function _rayHitsBox(px, py, pz, dx, dy, dz, x0, z0, x1, z1, h) {
  let tmin = 0, tmax = 1e9;
  if (Math.abs(dx) < 1e-9) { if (px < x0 || px > x1) return false; }
  else { let t1 = (x0 - px) / dx, t2 = (x1 - px) / dx; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
  if (Math.abs(dy) < 1e-9) { if (py < 0 || py > h) return false; }
  else { let t1 = (0 - py) / dy, t2 = (h - py) / dy; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
  if (Math.abs(dz) < 1e-9) { if (pz < z0 || pz > z1) return false; }
  else { let t1 = (z0 - pz) / dz, t2 = (z1 - pz) / dz; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
  return tmax >= tmin && tmax > 0;
}
function sunOcclusion(px, py, pz, sd) {
  if (sd.y <= 0.05) return 0;                                // sun at/below horizon → no direct path (dawn/dusk/night)
  const dx = sd.x, dy = sd.y, dz = sd.z;
  let T = 1;                                                 // transmittance = product of (1 - opacity)
  const solids = nearby.solids;
  for (let i = 0; i < solids.length; i++) {                  // walls / roofs / decks: opaque → full shade
    const s = solids[i];
    if (_rayHitsBox(px, py, pz, dx, dy, dz, s.x0, s.z0, s.x1, s.z1, s.h)) return 0;
  }
  const pads = nearby.pads;                                  // leaf discs: canopies, weave, limbs, nets
  for (let i = 0; i < pads.length; i++) {
    const pd = pads[i];
    if (pd.y <= py + 0.5) continue;                          // pad must be genuine overhead cover, not the platter you stand on
    const t = (pd.y - py) / dy;
    const hx = px + dx * t, hz = pz + dz * t;
    const ex = hx - pd.x, ez = hz - pd.z, rr = pd.r * 0.92;
    if (ex * ex + ez * ez > rr * rr) continue;
    T *= 1 - (pd.layer === 'net' ? 0.35 : 0.75);             // leaves aren't opaque; nets barely shade
  }
  const trunks = nearby.trunks;                              // vertical cylinders: cheap 2D closest-approach
  const denom = dx * dx + dz * dz;
  if (denom > 1e-9) {
    for (let i = 0; i < trunks.length; i++) {
      const tr = trunks[i];
      const tc = ((tr.x - px) * dx + (tr.z - pz) * dz) / denom;
      if (tc <= 0) continue;
      const yh = py + dy * tc; if (yh < 0 || yh > tr.h) continue;
      const ddx = px + dx * tc - tr.x, ddz = pz + dz * tc - tr.z;
      if (ddx * ddx + ddz * ddz > tr.r * tr.r) continue;
      T *= 1 - 0.9;
    }
  }
  // Beyond-range fallback: if the ray leaves the 3×3 chunk ring horizontally while still
  // below leaf height (~45 m), the endless forest statistically covers the horizon-ward
  // path — add canopy-average cover so low sun angles don't falsely burn sheltered streets.
  if (py < CANOPY_Y) {
    const horizRun = ((45 - py) / dy) * Math.hypot(dx, dz);
    if (horizRun > CHUNK) T *= 1 - 0.5;
  }
  return T < 0 ? 0 : T;
}

let shadeTimer = 0, sunTimer = 0.20, sunTarget = 0;         // throttle the probe to ~5 Hz, lerp toward it
function stepHeat(dt) {
  const p = player;
  sunTimer += dt;
  if (sunTimer >= 0.20) { sunTarget = sunOcclusion(p.pos.x, p.pos.y, p.pos.z, sunDir); sunTimer = 0; }
  p.sunE = lerp(p.sunE, sunTarget, clamp(dt * 4, 0, 1));     // smooth transitions when walking through shafts
  let E = p.sunE;
  const deepPit = p.inPit && p.pos.y < -1;                   // down in the sinkhole bowl = deep shade
  if (deepPit) E = 0;
  p.exposed = E > 0.55;                                      // drives messages / missions / HUD "IN THE SUN"

  const airBase = lerp(27, 46, dayF);
  let air = airBase + (p.exposed ? 11 : 0) - clamp((p.pos.y - 40) * 0.04, 0, 3);
  if (deepPit) air -= 6;                                     // cooler at the bottom
  // Gardener's Mantle (Part 2 reward): parasol-leaf cloak drops body-heat gain ×0.75 (typeof-
  // guarded like storyCarrying — puzzles.js may load after this file's first evaluation).
  const mantleF = (typeof ciphMantle !== 'undefined' && ciphMantle) ? 0.75 : 1;
  // Weather mixer (safe-defaulted when weather.js is absent / in SHOT): the White Hour
  // multiplies the burn rate, the Long Rain zeroes it (rain cools), the dust storm leaves it.
  const _wx = (typeof WX !== 'undefined') ? WX : null;
  let heatRate = dayF * 2.6 * smooth(0.25, 0.9, E) * mantleF;   // E<0.25 shaded, dappled = slow burn, full shaft = full burn
  if (_wx) heatRate *= _wx.heatMul;
  if (dayF > 0.05 && heatRate > 0) p.heat += dt * heatRate;  // ~40 s to overheat in a full noon shaft
  else {
    let drain = 7;                                           // base shade drain
    if (deepPit) drain = 14;                                 // ~2× in the pit
    if (p.inWater) drain = 28;                               // ~4× wading in cool water
    if (_wx) drain *= _wx.heatDrainMul;                      // the Long Rain drains 1.5× while out in it
    p.heat -= dt * drain;
  }
  // Dust storm (the Grey Wind): body-heat bar doubles as general strain while unsheltered —
  // ~30 s of open exposure to faint, and the faint wakes you in the last (sheltered) shade.
  if (_wx && _wx.strain > 0 && !(typeof weatherShelter === 'function' && weatherShelter()))
    p.heat += dt * _wx.strain;
  p.heat = clamp(p.heat, 0, 100);

  shadeTimer += dt;
  // The White Hour lowers the exposure that still "counts as shade" for the R-key recall anchor.
  const shadeE = _wx ? Math.min(0.25, _wx.shadeSafeE) : 0.25;
  if (E < shadeE && p.grounded && p.pos.y < CANOPY_Y && shadeTimer > 1) { lastShade.copy(p.pos); shadeTimer = 0; }

  if (p.heat >= 100) {
    // heatstroke: stagger back to the last shade
    fadeEl.style.opacity = 1;
    setTimeout(() => {
      p.pos.copy(lastShade); p.vel.set(0, 0, 0); p.heat = 55;
      msg('The sun took you. You wake in the shade, head pounding.', 6);
      fadeEl.style.opacity = 0;
    }, 850);
    p.heat = 99; // don't retrigger while fading
  }
  if (_wx) air += _wx.airAdd;   // the White Hour shows a hotter air reading (+9 °C at peak)
  return air;
}

