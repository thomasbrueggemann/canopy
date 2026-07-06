## Why

`msg()` appended every toast to `#msgs` (a flex column), so story beats, mission text,
and landing lines stacked three-deep and became unreadable, and durations were tuned too
short to finish reading. This change retroactively codifies the shipped fix: one toast on
screen at a time with a FIFO queue behind it, longer readable holds, and a pressure valve
so a backlog drains instead of lagging minutes behind the game.

## What Changes

- Turn `msg(text, dur, gold)` into an enqueue that shows exactly one `.msg` toast at a
  time and queues the rest FIFO — with no signature change and no call-site changes.
- Compute a longer effective hold per toast with a reading-time floor scaled by text
  length, so long story paragraphs stay on screen long enough to read.
- Deduplicate repeat-fire lines against the showing toast and the queue tail.
- Add a pressure valve: while a backlog waits, pull the current toast's fade earlier to a
  guaranteed minimum hold (4 s normal, 6 s gold) so the queue drains without lagging.
- Cap the waiting queue at 6, dropping the oldest non-gold waiter when full so story
  (gold) beats are protected.
- Leave `hint()` and the persistent `#mission` HUD panel untouched.

## Capabilities

### New Capabilities
- `toasts`: The single-slot, FIFO-queued, reading-time-aware story/mission toast system
  (`msg()`), including dedupe, the pressure valve, and the queue cap.

### Modified Capabilities
<!-- None: the toast queue is a new capability; hint() and #mission are explicitly out of scope. -->

## Impact

- `main.js` only, in the `msg()` area (queue state, `msgShow`/`msgArm`/`msgFade`/
  `msgPressure`). No other file changes; the existing `#msgs` / `.msg` CSS already renders
  a single centered toast.
- No signature change (117 call sites unchanged), no new DOM ids, no CSS changes, no
  per-frame work (stays `setTimeout`-based). SHOT render health is unaffected.
