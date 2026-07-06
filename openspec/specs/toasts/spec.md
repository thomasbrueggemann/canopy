# toasts Specification

## Purpose
TBD - created by archiving change add-toast-queue. Update Purpose after archive.
## Requirements
### Requirement: One toast on screen, FIFO queue behind it

The system SHALL display exactly one story/mission toast (`.msg`) at a time. Additional
`msg()` calls while a toast is showing SHALL be queued FIFO and shown in order as the
current toast finishes. When a toast's time ends it SHALL fade out via the existing
opacity transition and only then SHALL the next queued toast appear with the entry
animation.

#### Scenario: Concurrent messages show one at a time
- **WHEN** three `msg()` calls fire in quick succession
- **THEN** only one `.msg` element exists in the DOM at any moment and the three texts appear in call order

#### Scenario: Next toast waits for the fade
- **WHEN** the current toast's hold ends while others are queued
- **THEN** it fades out first and the next queued toast is shown only after the fade completes

### Requirement: Reading-time-aware hold duration

Each toast SHALL be held for an effective duration that is the larger of a scaled base
duration and a reading-time floor proportional to its text length, so long story
paragraphs stay on screen long enough to read. A solo toast (nothing waiting behind it)
SHALL keep its full effective duration.

#### Scenario: Long lines get a reading-time floor
- **WHEN** a toast with a long text (around 130 characters) is shown with nothing queued behind it
- **THEN** it is held for roughly its reading-time floor (about 12 seconds), longer than its nominal duration would give

#### Scenario: Solo toast keeps full hold
- **WHEN** a toast is showing and no other toast is queued
- **THEN** it is held for its full effective duration without early fade

### Requirement: Duplicate suppression

The system SHALL drop a `msg()` call whose text is identical to the currently-showing
toast or to the current tail of the queue, so repeat-fire sources do not stack duplicate
toasts.

#### Scenario: Repeat of the showing toast is dropped
- **WHEN** a `msg()` call arrives with text identical to the toast currently on screen
- **THEN** the call is ignored and no duplicate is queued

#### Scenario: Repeat of the queue tail is dropped
- **WHEN** a `msg()` call arrives with text identical to the last toast already waiting in the queue
- **THEN** the call is ignored

### Requirement: Pressure valve drains a backlog

When a toast is enqueued behind a showing toast, the system SHALL reschedule the showing
toast's fade earlier — to the later of a guaranteed minimum hold since it appeared and a
small floor from now — but only if that is sooner than its natural end. The minimum hold
SHALL be 4 seconds for normal toasts and 6 seconds for gold (story) toasts. This SHALL
guarantee every toast a readable hold while preventing the queue from lagging behind the
game.

#### Scenario: Backlog pulls the current fade in
- **WHEN** a new toast is enqueued behind a normal toast that has already been shown for at least its minimum hold
- **THEN** the current toast's fade is rescheduled toward the minimum-hold/near-now target so the backlog begins draining sooner than its natural end

#### Scenario: Minimum hold is guaranteed even under pressure
- **WHEN** a toast is under queue pressure
- **THEN** it is still held at least its minimum hold (4 s normal, 6 s gold) before fading

#### Scenario: Gold toasts get a longer floor
- **WHEN** a gold (story) toast is showing under pressure
- **THEN** its guaranteed minimum hold is 6 seconds rather than the 4 seconds used for normal toasts

### Requirement: Bounded queue that protects story beats

The waiting queue SHALL hold at most 6 toasts. When a new toast arrives and the queue is
full, the system SHALL drop the oldest non-gold waiting entry to make room. If every
waiting entry is gold, an incoming non-gold toast SHALL be dropped instead (leaving the
queue unchanged), and an incoming gold toast SHALL evict the oldest waiting gold entry.
This SHALL protect story (gold) beats from being silently discarded in the common case.

#### Scenario: Full queue drops the oldest non-gold waiter
- **WHEN** the queue already holds 6 waiting toasts including at least one non-gold entry and a new toast arrives
- **THEN** the oldest non-gold waiting entry is removed and the new toast is enqueued

#### Scenario: All-gold full queue rejects an incoming non-gold toast
- **WHEN** the queue is full with 6 gold entries and a non-gold toast arrives
- **THEN** the non-gold toast is dropped and the queue of gold beats is left intact

### Requirement: Preserve the msg signature and adjacent HUD

The change SHALL keep the `msg(text, dur, gold)` signature unchanged so no call site is
modified, and SHALL leave `hint()` (the single-slot control prompt) and the persistent
`#mission` objective panel untouched. Chained calls (a message plus a later
`setTimeout`-scheduled follow-up) SHALL keep working by simply enqueuing, and SHOT-mode
render health SHALL be unaffected.

#### Scenario: Existing call sites keep working unchanged
- **WHEN** any of the existing 117 `msg()` call sites fires, including chained/delayed sequences like the summit follow-up
- **THEN** the toast enqueues and displays without any call-site change

#### Scenario: hint and mission panel are untouched
- **WHEN** a control prompt (`hint()`) or the persistent objective text is displayed
- **THEN** the toast queue neither affects nor is affected by them

