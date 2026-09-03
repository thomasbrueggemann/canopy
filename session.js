/* CANOPY split file  session: awesome-pass — see openspec/changes/awesome-pass/design.md */
'use strict';
/* ==========================================================================
   SESSION PERSISTENCE (design B3)
   Where you stood, which way you faced and what hour it was, carried across a
   reload. The world itself is already deterministic from its seeds — the one
   exception is the Spire chunk, which is re-rolled every load, so a save made
   standing in the OLD spire's chunk is nudged to that chunk's street corner
   rather than dropped inside whatever now occupies it.
   Loaded last, so main.js has already placed the default spawn; the restore runs
   synchronously at evaluation time, before the first frame. Never in SHOT.
   ========================================================================== */

const SESSION_KEY = 'canopy.session';
const SESSION_EVERY = 4;                 // seconds between autosaves

function sessionClear() { try { localStorage.removeItem(SESSION_KEY); } catch (e) { } }

function sessionSave() {
  if (SHOT || !started || player.blackout) return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      v: 1,
      x: player.pos.x, y: player.pos.y, z: player.pos.z,
      yaw: player.yaw, pitch: player.pitch,
      dayT: dayT,
      spire: { cx: SPIRE.cx, cz: SPIRE.cz }
    }));
  } catch (e) { }
}

let _sessionT = 0;
function updateSession(dt) {
  if (SHOT) return;
  _sessionT += dt;
  if (_sessionT < SESSION_EVERY) return;
  _sessionT = 0;
  if (started && player.grounded && !player.blackout) sessionSave();
}

/* ---- restore -------------------------------------------------------------- */
(function sessionRestore() {
  if (SHOT) return;
  if (params.get('fresh') !== null) { sessionClear(); return; }
  let s = null;
  try { const raw = localStorage.getItem(SESSION_KEY); if (raw) s = JSON.parse(raw); } catch (e) { }
  if (!s || s.v !== 1 || typeof s.x !== 'number' || typeof s.y !== 'number' || typeof s.z !== 'number') return;
  if (!isFinite(s.x) || !isFinite(s.y) || !isFinite(s.z)) return;

  let x = s.x, y = s.y, z = s.z;
  // The Spire moves between runs. Everything else is stable, so only a save made INSIDE
  // the old spire's chunk is unsafe — put those feet on that chunk's street corner instead.
  if (s.spire && (s.spire.cx !== SPIRE.cx || s.spire.cz !== SPIRE.cz) &&
      Math.floor(x / CHUNK) === s.spire.cx && Math.floor(z / CHUNK) === s.spire.cz) {
    x = s.spire.cx * CHUNK + 2; z = s.spire.cz * CHUNK + 2; y = terrainY(x, z);
  }
  player.pos.set(x, y, z);
  groundTeleport(player.pos);
  player.vel.set(0, 0, 0);
  lastShade.copy(player.pos);
  if (typeof s.yaw === 'number' && isFinite(s.yaw)) player.yaw = s.yaw;
  if (typeof s.pitch === 'number' && isFinite(s.pitch)) player.pitch = clamp(s.pitch, -1.45, 1.45);
  if (typeof s.dayT === 'number' && isFinite(s.dayT)) { dayT = ((s.dayT % 1) + 1) % 1; if (typeof updateSky === 'function') updateSky(dayT); }
  ensureChunks(player.pos.x, player.pos.z, true);
  player.airPeakY = player.pos.y;

  // One line, once the overlay is out of the way.
  const iv = setInterval(() => {
    if (!started) return;
    clearInterval(iv);
    hint('Back under the leaves — where you left off', 4);
  }, 400);
})();

addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sessionSave(); });
addEventListener('beforeunload', () => sessionSave());
