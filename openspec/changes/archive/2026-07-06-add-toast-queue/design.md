## Context

`msg()` is the game's story/mission toast function, called from 117 sites across the
codebase. It previously appended each toast to `#msgs`, a flex column, so simultaneous or
rapid calls stacked and became unreadable, and the base durations were too short to finish
reading long story paragraphs. `hint()` is a separate single-slot control prompt (often
load-bearing for interaction discovery) and is explicitly out of scope. This design
records the HOW of the shipped fix, which lives entirely in the `msg()` area of `main.js`.

## Goals / Non-Goals

**Goals:**
- Exactly one `.msg` on screen at a time with a FIFO queue behind it.
- Every toast held long enough to read, with a reading-time floor for long lines.
- A pressure valve so a backlog drains instead of lagging minutes behind the game.
- No signature change, no call-site changes, no CSS changes, no per-frame work.

**Non-Goals:**
- No change to `hint()` or the persistent `#mission` HUD panel.
- No new DOM ids or CSS; the existing single-centered-toast styling is reused.
- No behavior change in SHOT mode.

## Decisions

- **`msg()` becomes an enqueue, keeping its `(text, dur, gold)` signature.** When no toast
  is showing it displays immediately; otherwise it pushes onto a FIFO array. Keeping the
  signature means none of the 117 call sites change. Alternative considered: a new
  `enqueueMsg()` API — rejected because it would require touching every call site.
- **Effective hold `eff = max((dur||5) * 1.25, 2.5 + 0.075 * text.length)` seconds.** The
  scaled base makes everything longer than before; the length term is a reading-time floor
  so a ~130-char line holds ~12 s. Chosen over a flat duration because story paragraphs
  and one-line landing beats need very different holds.
- **Single-slot rendering with a `setTimeout`-driven fade.** Exactly one `.msg` div is
  created in `msgShow`; `msgArm` sets a timer to `msgFade`, which runs the existing
  `opacity .8s` transition, removes the node after ~850 ms, then shows the next queued
  toast. Stays timer-based like the original (no per-frame work); the current timer id is
  tracked so the pressure valve can `clearTimeout` and reschedule.
- **Dedupe against the showing toast and the queue tail only.** A cheap check that kills
  the common repeat-fire sources (net-bounce, water-crash) without a full-queue scan or a
  history set. Deeper duplicates are allowed intentionally (the same beat far apart is
  legitimate).
- **Pressure valve pulls the fade earlier, never later.** `msgPressure` computes
  `target = max(shownAt + minHold, now + 0.8s)` with `minHold` 4 s normal / 6 s gold, and
  only applies it when `target < end`. It runs when a toast is enqueued behind a live toast
  and once in `msgShow` when a toast is promoted into a standing backlog. Solo toasts keep
  their full `eff`. This guarantees a readable minimum while draining backlogs.
- **Queue cap 6, evicting the oldest non-gold waiter.** On overflow the oldest non-gold
  entry is spliced out so gold (story) beats are protected. If the queue is entirely gold,
  an incoming non-gold toast is dropped and an incoming gold toast evicts the oldest gold
  (FIFO) — the one corner where a gold beat can be replaced, accepted so a runaway gold
  backlog still stays bounded and the newest beat wins.

## Risks / Trade-offs

- [A story-critical beat could be lost] → Gold beats are never evicted by non-gold traffic;
  only an entirely-gold, full queue plus a new gold evicts the oldest gold, which is a
  degenerate case in practice.
- [Chained/delayed sequences could race the queue] → They simply enqueue; the summit
  message plus its ~10.5 s `setTimeout` follow-up both go through `msg()` and display in
  order.
- [Timer drift under pressure] → The single tracked timer id is always cleared before
  rescheduling, so there is never more than one pending fade.

## Migration Plan

Retroactive codification only — the queue is already implemented and shipped in `main.js`.
No rollout/rollback steps. Reverting would mean restoring the append-to-column `msg()`.

## Open Questions

None — behavior is fixed by the shipped implementation and verified against the code.
