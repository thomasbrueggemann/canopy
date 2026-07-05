/* CANOPY split file  inventory: "The Satchel" (Part 1 of the Gardeners' Ciphers). A real
   inventory — item registry, counts, examine texts, a HUD panel, persistence — plus the
   ambient journal-page collectible floor. Loaded between main.js and story.js so every
   helper it calls at runtime (msg/hint/once, chunks/dist2/chunkKey, hash2) already exists;
   at LOAD time it only touches THREE/scene/tplBlob (core.js) and the #satchel DOM, so its
   tag position is otherwise free. No worldgen changes: examine texts are load-bearing (later
   scripts hang puzzle clues on items via invRegister), and story items appear as read-only
   rows computed from STORY_SAVE so the satchel shows everything you carry without touching
   story.js. Persists to localStorage['canopy.inv'] with the same try/catch idiom as
   canopy.story; this file owns all writes to INV_SAVE. */
'use strict';

/* ======================================================================== */
/*  DATA MODEL — item registry + save                                        */
/* ======================================================================== */
// Static definitions. `stack` items show a ×count; puzzles.js (Part 2) registers its own
// items via invRegister so this file stays generic. `desc` is the always-shown examine line;
// per-session/per-collection clue text is stored separately in INV_SAVE.notes (see invAdd).
const ITEMS = {
  page:          { name: 'Gardener’s journal page', icon: '❧', stack: true,
                   desc: 'A leaf-pressed page in a steady hand. Read them in the order they came to you.' },
  pressedflower: { name: 'Pressed flower', icon: '✿', stack: false,
                   desc: 'Her bookmark. It still smells of green. No use but the keeping of it.' }
};

// The twelve journal entries, in COLLECTION order (page 1 = first found, whatever chunk that
// was). Written in the Gardener's voice, foreshadowing the five Ciphers — counting, bells,
// shadows, glyphs, seasons — and the Second Seed. Entries 9-12 gloss the vault cog order
// obliquely (counting > song > shadow > glyph > season), a soft cross-link for close readers.
const JOURNAL = [
  'Entry the first. I am counting again, the way I was taught before they made it a crime. The lamps that ring a square. The standing spans of an iron road. The great ferns in a planted ring. The Authority kept only its final figures and burned the working; so I keep the working. A number is how you find a thing twice.',
  'There is a carillon still hung in the grove, five brass bars gone green. They are not strung low to high — some idle hand crossed two near the middle, so you must listen and not merely look. I have named them for what they are: Rain, Root, Crown, Ash, Star. A song can be a lock, and only the patient pick it.',
  'At the top of the day the Spire throws a shadow like a long dark finger. Where the finger ends, there is always something the Authority did not wish found. Stand at the very tip at five in the afternoon and mark the ground under your feet. The sun keeps truer records than any clerk of theirs.',
  'I have been taking rubbings of the old boundary glyphs — ten marks, no two alike. Laid side by side they become an alphabet. The Authority wrote places and never names; a stranger sees only scratches, but a gardener reads a map. Keep every rubbing. The trail lives in the satchel, not on the wall.',
  'Everything worth the growing answers to four seasons — sowing, bloom, harvest, frost. Set them out of their turning and nothing comes up. I have come to think the whole city was once a garden, run by people who forgot which season came first, and so lost it all.',
  'Sixty years the Authority has been dead and still I lower my voice at its doors. They wake only at night, when the glow-moss does, and they open only to those who have done the reading first. That was ever their cruelty: they hid nothing, and trusted no one would bother to look.',
  'They speak of a second seed — a spare heart for the whole green engine, sealed under the Spire against the day the first one failed. I do not believe they meant a child to carry it out into the Scorch. But the old have old fears, and the young have young legs.',
  'If you are reading these in a satchel that is not mine, then I am gone and you are the gardener now. Good. The work was never mine to finish. Count, and listen, and watch the light; read the stones, and keep the seasons. Taken in that order, all of it makes a single sense.',
  'Of the five old locks I set my hope on, I put the counting-house first — for nothing under this canopy is truly settled until it has been counted, and counted twice.',
  'After the counting, the song; and after the song, the shadow. Sound before light: the Authority always spoke a thing before it showed its hand, and its doors keep the same manners.',
  'Then the reading of the stones — the glyphs — for a place stripped of its name is found only by one who can still spell it out. Lay your rubbings in a row and the word stands up off them.',
  'And last, the seasons, which close every ring: sowing round to frost and round to sowing again. Counting, song, shadow, glyph, season — that is the whole turn of it. Whoever seats the cogs in that same turning will find the great door remembers her.'
];

// Accumulated examine text for the page stack: entries 1..count, numbered. Rendered NEWEST
// first (journal-feed convention) so the most recent page is always visible without scrolling
// under pointer-lock — which also keeps the entries 9-12 cog-order glosses in view once found.
function pageNote(count) {
  const n = Math.min(count, JOURNAL.length);
  let s = '';
  for (let i = n - 1; i >= 0; i--) {
    s += (s ? '\n\n' : '') + '· page ' + (i + 1) + ' ·\n' + JOURNAL[i];
  }
  return s;
}

// Persistence — parsed once at load. pagesAt (absolute 'ix,iz' chunk keys) is the source of
// truth for which journal pages are collected; items.page is kept equal to pagesAt.length so
// the generic count/panel code needs no page special-case.
let INV_SAVE = { v: 1, items: {}, notes: {}, pagesAt: [] };
try {
  const _iv = JSON.parse(localStorage.getItem('canopy.inv') || 'null');
  if (_iv && _iv.v === 1) INV_SAVE = Object.assign(INV_SAVE, _iv);
} catch (e) { }
INV_SAVE.items = INV_SAVE.items || {};
INV_SAVE.notes = INV_SAVE.notes || {};
INV_SAVE.pagesAt = INV_SAVE.pagesAt || [];
if (INV_SAVE.pagesAt.length) {                       // reconcile derived page state on load
  INV_SAVE.items.page = INV_SAVE.pagesAt.length;
  INV_SAVE.notes.page = pageNote(INV_SAVE.pagesAt.length);
}

function saveInv() { try { localStorage.setItem('canopy.inv', JSON.stringify(INV_SAVE)); } catch (e) { } }

/* ======================================================================== */
/*  API (globals — consumed by puzzles.js/Part 2 and the story display)      */
/* ======================================================================== */
// Register a later script's item definition. Generic on purpose: inventory.js never needs to
// know what a rubbing or a cog is, only how to count and examine one.
function invRegister(id, def) { ITEMS[id] = def; }

// Add n of an item (default 1). `note` = resolved examine text (per-session/derived clue) stored
// in notes; also fires a pickup toast via msg(). Unknown ids are ignored (register first).
function invAdd(id, n, note) {
  n = (n === undefined) ? 1 : n;
  const def = ITEMS[id];
  if (!def) return 0;
  INV_SAVE.items[id] = (INV_SAVE.items[id] | 0) + n;
  if (note !== undefined && note !== null) INV_SAVE.notes[id] = note;
  saveInv();
  const cnt = INV_SAVE.items[id];
  if (typeof msg === 'function') msg('+ ' + def.name + (def.stack && cnt > 1 ? ' ×' + cnt : ''), 3.5);
  refreshSatchel();
  return cnt;
}
function invHas(id, n) { return (INV_SAVE.items[id] | 0) >= (n || 1); }
function invCount(id) { return INV_SAVE.items[id] | 0; }
function invRemove(id, n) {
  n = (n === undefined) ? 1 : n;
  const c = Math.max(0, (INV_SAVE.items[id] | 0) - n);
  if (c > 0) INV_SAVE.items[id] = c; else { delete INV_SAVE.items[id]; delete INV_SAVE.notes[id]; }
  saveInv(); refreshSatchel();
  return c;
}
function invNote(id) { return INV_SAVE.notes[id] || ''; }

/* ======================================================================== */
/*  THE SATCHEL PANEL (#satchel — house .panel styling, KeyI / Tab in player.js) */
/* ======================================================================== */
const satchelEl = document.getElementById('satchel');
const satchelListEl = document.getElementById('satchelList');
const satchelExamineEl = document.getElementById('satchelExamine');
var satchelOpen = false;   // var: read by player.js (cross-file), matching the storyCarrying precedent
let satchelSel = 0;

// Build the current row list: real carried items (count>0) followed by read-only story rows
// computed live from STORY_SAVE (typeof-guarded — story.js loads after this file). Story rows
// are display-only; the satchel shows what you carry without ever writing story.js state.
function satchelEntries() {
  const list = [];
  for (const id in ITEMS) {
    const cnt = INV_SAVE.items[id] | 0;
    if (cnt <= 0) continue;
    const def = ITEMS[id];
    list.push({ icon: def.icon || '•', name: def.name, count: cnt, stack: !!def.stack,
                desc: def.desc || '', note: INV_SAVE.notes[id] || '', virtual: false });
  }
  if (typeof STORY_SAVE !== 'undefined' && STORY_SAVE) {
    const sh = STORY_SAVE.shards | 0;
    if (sh > 0) list.push({ icon: '✶', name: 'Beacon shard', count: sh, stack: true, virtual: true,
                            desc: 'A cut of the sun-clock’s focusing glass, warm from noon. Three of them made the Heliograph speak again.', note: '' });
    if (STORY_SAVE.haveKey) list.push({ icon: '⚷', name: 'Warden’s key', count: 1, stack: false, virtual: true,
                            desc: 'Iron, green with canal-silt, still on its chime-string. The Root Vault answered to it.', note: '' });
    if (STORY_SAVE.haveSeed) list.push({ icon: '❂', name: 'The Second Seed', count: 1, stack: false, virtual: true,
                            desc: 'A dark pod the size of a fist, warm, humming faintly. It wants the worst ground in the world.', note: '' });
  }
  return list;
}

function refreshSatchel() {
  if (!satchelListEl) return;
  const list = satchelEntries();
  if (satchelSel >= list.length) satchelSel = list.length ? list.length - 1 : 0;
  satchelListEl.innerHTML = '';
  if (!list.length) {                                        // empty state
    const em = document.createElement('div'); em.id = 'satchelEmpty'; em.textContent = 'Nothing but leaf-dust.';
    satchelListEl.appendChild(em);
    if (satchelExamineEl) satchelExamineEl.textContent = '';
    return;
  }
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    const row = document.createElement('div');
    row.className = 'satrow' + (i === satchelSel ? ' sel' : '') + (it.virtual ? ' ro' : '');
    const ico = document.createElement('span'); ico.className = 'ico'; ico.textContent = it.icon; row.appendChild(ico);
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = it.name; row.appendChild(nm);
    const ct = document.createElement('span'); ct.className = 'ct';
    ct.textContent = ((it.stack || it.virtual) && it.count > 1) ? ('×' + it.count) : '';
    row.appendChild(ct);
    satchelListEl.appendChild(row);
  }
  const sel = list[satchelSel];
  let ex = sel.desc || '';
  if (sel.note) ex += (ex ? '\n\n' : '') + sel.note;
  if (sel.virtual) ex += (ex ? '\n\n' : '') + '(carried — read-only; the campaign keeps this one.)';
  if (satchelExamineEl) satchelExamineEl.textContent = ex;
}

// Toggle the panel (KeyI, only when started). The game keeps running while you read — heat,
// time, everything — by design; the panel never blocks E or movement.
function satchelToggle() {
  if (!satchelEl) return;
  satchelOpen = !satchelOpen;
  satchelEl.style.display = satchelOpen ? 'block' : 'none';
  if (satchelOpen) refreshSatchel();
}
// Tab cycles selection while open. Returns true iff it acted (open) so player.js only
// preventDefault()s the Tab when the satchel actually owns it.
function satchelCycle() {
  if (!satchelOpen) return false;
  const list = satchelEntries();
  if (list.length) satchelSel = (satchelSel + 1) % list.length;
  refreshSatchel();
  return true;
}

/* ======================================================================== */
/*  THE GARDENER'S JOURNAL — 12 ambient pages at Tier-3 oddities              */
/*  Deterministic + session-stable: a chunk carries a page iff it has a fern  */
/*  circle or a chime pole (the oddities readable from resident colData) AND  */
/*  hash2(ix,iz,9101)%5===0. Collected pages persist as absolute chunk keys.  */
/*  NOTE (deviation): shrine niches/greenhouse skeletons are NOT registered   */
/*  distinctly in colData, so per the design's fallback the page hosts are    */
/*  fern circles (colData.ferns) + chime poles (colData.chimes).              */
/* ======================================================================== */
const matPage = new THREE.MeshBasicMaterial({ color: 0xf2ecd0, fog: false });   // pale parchment glint (tplBlob idiom)
// A tiny 4-mesh pool of flat page props, synced over the 3×3 resident chunks each frame.
const PAGE_POOL = Array.from({ length: 4 }, () => {
  const m = new THREE.Mesh(tplBlob, matPage);
  m.scale.set(0.32, 0.05, 0.24); m.visible = false; scene.add(m); return m;
});

function pagesHas(ix, iz) { return INV_SAVE.pagesAt.indexOf(ix + ',' + iz) !== -1; }

// The page host for a resident chunk, or null. Reads ONLY already-built colData (never peeks).
function pageHost(c) {
  if (!c) return null;
  if (hash2(c.ix, c.iz, 9101) % 5 !== 0) return null;        // the design's 1-in-5 spawn gate
  const f = c.colData.ferns, ch = c.colData.chimes;
  if (f && f.length) return { x: f[0].x, z: f[0].z, y: 0.9 };   // fern-circle centre
  if (ch && ch.length) return { x: ch[0].x, z: ch[0].z, y: 1.2 }; // chime pole
  return null;
}

let _pageNear = null;                                        // nearest uncollected page within reach (for E)
const _pageCands = [];
// Per-frame driver (from the main loop, guarded !SHOT). Reads resident chunks only — no
// peekColData, no finders. Syncs the page-prop pool and flags the pickup candidate.
function updateInventory(dt, time) {
  if (typeof player === 'undefined') return;
  _pageCands.length = 0;
  const cx = Math.floor(player.pos.x / CHUNK), cz = Math.floor(player.pos.z / CHUNK);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const c = chunks.get(chunkKey(cx + dx, cz + dz));
    if (!c) continue;
    const h = pageHost(c);
    if (!h || pagesHas(c.ix, c.iz)) continue;
    _pageCands.push({ ix: c.ix, iz: c.iz, x: h.x, y: h.y, z: h.z, d: dist2(h.x, h.z, player.pos.x, player.pos.z) });
  }
  _pageCands.sort((a, b) => a.d - b.d);
  for (let i = 0; i < PAGE_POOL.length; i++) {
    const m = PAGE_POOL[i], cand = _pageCands[i];
    if (cand) {
      m.position.set(cand.x, cand.y + 0.12 + Math.sin(time * 2 + i) * 0.05, cand.z);
      m.rotation.y = time * 0.6; m.visible = true;
    } else m.visible = false;
  }
  const near = _pageCands[0];
  _pageNear = (near && near.d < 2.5) ? near : null;          // 2.5 m is enough (aiming not required — design)
  if (_pageNear) hint('Press E — a leaf-pressed page rests here', 0.4);
}

// Collect the page in chunk (ix,iz): persist the chunk key, bump the stack, store the running
// journal as the note, toast, and at 12 grant the keepsake with a gold line.
function collectPage(ix, iz) {
  const key = ix + ',' + iz;
  if (INV_SAVE.pagesAt.indexOf(key) !== -1) return;
  INV_SAVE.pagesAt.push(key);
  const n = INV_SAVE.pagesAt.length;
  invAdd('page', 1, pageNote(n));                            // items.page -> n, stores note, toasts, saves
  if (typeof once === 'function') once('firstpage', () => msg('A pressed page in a careful hand — the first of the Gardener’s journal. Open the satchel (I) to read what she left.', 8));
  if (n < 12) { if (typeof hint === 'function') hint('Journal page ' + n + ' / 12', 3); }
  else {
    if (typeof msg === 'function') msg('Twelve pages — the Gardener’s journal, whole. Pressed inside the last leaf: a flower, her bookmark. It still smells of green.', 10, true);
    invAdd('pressedflower', 1);
  }
}

// E-interact hook (player.js tries this after storyInteract, before the trial-master check;
// Part 2 will splice puzzleInteract() in between). Returns true iff it consumed E.
function inventoryInteract() {
  if (!_pageNear) return false;
  collectPage(_pageNear.ix, _pageNear.iz);
  _pageNear = null;
  return true;
}
