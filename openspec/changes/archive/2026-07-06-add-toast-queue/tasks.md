# Tasks

> NOTE: This feature is ALREADY IMPLEMENTED and shipped (the `msg()` area of `main.js`).
> These tasks are a retroactive codification of the existing behavior; all items are
> checked to reflect the shipped state.

## 1. Queue core

- [x] 1.1 Add queue state (`msgQ`, `msgCur`, `msgTimer`, `msgFading`) and turn `msg(text, dur, gold)` into an enqueue, keeping the signature
- [x] 1.2 `msgShow` creates exactly one `.msg` div and computes `eff = max((dur||5)*1.25, 2.5 + 0.075*len)`
- [x] 1.3 `msgArm`/`msgFade` run the fade (`opacity .8s`, remove after ~850 ms) then show the next queued toast

## 2. Dedupe, pressure, and cap

- [x] 2.1 Drop calls whose text matches the showing toast or the queue tail
- [x] 2.2 `msgPressure` pulls the current fade to `max(shownAt+minHold, now+0.8s)` only when sooner than natural end; minHold 4 s / 6 s gold
- [x] 2.3 Call the pressure valve when enqueuing behind a live toast and when promoting into a standing backlog; solo toasts keep full `eff`
- [x] 2.4 Cap the queue at 6, evicting the oldest non-gold waiter; protect gold beats (all-gold-full corner drops incoming non-gold / evicts oldest gold)

## 3. Invariants and verification

- [x] 3.1 Confirm no signature change and no call-site changes (117 sites); `hint()` and `#mission` untouched
- [x] 3.2 `node --check main.js`
- [x] 3.3 Headless smoke shots 1..5 print `CANOPY_STATUS READY … err=0`
- [x] 3.4 Behavioral check: `msg('one',5); msg('two',5); msg('three',5,true)` yields one `.msg` node at a time, three in order
