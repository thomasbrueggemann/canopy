# CANOPY — Toast queue & longer mission text

Problem: `msg()` appends every toast to `#msgs` (a flex column), so story beats, mission
text and landing lines stack three-deep and become unreadable; and durations were tuned
short. Fix: **one toast on screen at a time, FIFO queue behind it, and every toast holds
long enough to actually read** — with a pressure valve so a backlog drains instead of
lagging minutes behind the game.

`hint()` is NOT a toast and is untouched: it is the single-slot control prompt
("Press E — hear them out") at the bottom of the screen, often load-bearing for
interaction discovery, visually distinct, and already incapable of stacking. Only the
`.msg` story/mission toasts queue.

## Behavior spec (all in `main.js`, the msg() area — no other file changes; the existing
`#msgs` / `.msg` CSS in index.html already handles a single centered toast fine)

`msg(text, dur, gold)` keeps its signature (117 call sites — none change) and becomes an
enqueue:

1. **Effective duration** per toast:
   `eff = Math.max((dur || 5) * 1.25, 2.5 + 0.075 * text.length)` seconds.
   (Longer than today across the board; long story paragraphs get a reading-time floor —
   a 130-char line holds ~12 s.)
2. **One at a time:** exactly one `.msg` div exists in `#msgs`. When the current toast's
   time ends: fade via the existing pattern (`transition opacity .8s` → remove after
   ~850 ms), THEN show the next queued toast (keep the `msgin` entry animation).
3. **Dedupe:** if `text` is identical to the currently-showing toast or to the queue
   tail, drop the new call (repeat-fire sources: the net bounce line, water-crash line).
4. **Pressure valve:** when a toast is enqueued behind a showing toast, the showing
   toast's fade is *rescheduled earlier* to `max(shownAt + minHold, now + 0.8s)` if that
   is sooner than its natural end — where `minHold` = 4 s for normal toasts, 6 s for
   gold (story) toasts. Solo toasts keep their full `eff`; under pressure everything
   still gets a guaranteed readable hold.
5. **Queue cap:** max 6 waiting. When full, drop the oldest *non-gold* waiting entry;
   never drop a gold entry (story beats must not vanish).
6. Implementation stays setTimeout-based like today (track the current timer id so the
   pressure valve can clearTimeout + reschedule). No per-frame work, no new DOM ids, no
   CSS changes required.

## Invariants

- No signature change, no call-site changes anywhere.
- `hint()` untouched. The `#mission` HUD panel (persistent objective text) untouched.
- SHOT mode: msg() is rarely called there (`once('start')` fires only when `active`);
  queueing changes nothing about render health — `?shot=1..5` must still print
  READY err=0.
- The summit sequence (msg + a 10.5 s setTimeout'd follow-up) and every other chained
  call keep working — they simply enqueue.

## Verification

- `node --check main.js`.
- Headless smoke test shots 1..5 print `CANOPY_STATUS READY … err=0`
  (`chrome --headless=new --enable-unsafe-swiftshader --virtual-time-budget=6000 --screenshot "http://localhost:8080/index.html?shot=N"`).
- Best-effort behavioral check: in a served page's console, fire
  `msg('one',5); msg('two',5); msg('three',5,true)` and confirm only one `.msg` node
  exists at any moment and all three appear in order.
