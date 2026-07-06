## ADDED Requirements

### Requirement: Everything is synthesized, nothing is loaded

The soundscape SHALL be produced entirely by WebAudio synthesis — oscillators, noise
buffers, and filters — with no audio files fetched or decoded. The AudioContext SHALL be
created lazily on the first user start/toggle (inside a user gesture), routed through one
master gain (0.35), and SHALL never be created in SHOT mode. Audio failure SHALL be
non-fatal: the game runs silent if the context cannot be created.

#### Scenario: No context in SHOT mode

- **WHEN** the game runs a SHOT preset
- **THEN** no AudioContext is created and no synth node ever runs

#### Scenario: Silence is survivable

- **WHEN** AudioContext construction throws
- **THEN** the game continues without audio and every sound call is a no-op

### Requirement: Mute toggle

The mute key (M) SHALL initialize audio on first press if none exists, and otherwise toggle
mute by easing the master gain between 0 and 0.35, confirming with a "sound off"/"sound on"
hint. All synthesis SHALL gate on context-present-and-unmuted, including sounds triggered by
other capabilities (the ciphers' carillon notes use the same gate and fall back to text per
the `ciphers` capability).

#### Scenario: First press wakes the sound

- **WHEN** M is pressed before any audio exists
- **THEN** the audio context and beds are created rather than toggling mute

#### Scenario: Muted means silent everywhere

- **WHEN** the player has muted
- **THEN** beds, one-shots, chimes, fanfares, and footsteps all stay silent until unmuted

### Requirement: Wind and cricket beds track altitude and night

Two continuous beds SHALL run: a wind bed (looped noise through a low-pass) whose gain rises
with altitude and slightly with day — 0.035 base plus up to 0.1 by 70 m up plus 0.015×day —
so climbing is audible; and a cricket bed (pulsed band-passed square, ~4.1 kHz carrier with
a ~17 Hz pulse) whose gain follows the night factor, silent by day. Both SHALL move with
smoothed parameter ramps, never steps.

#### Scenario: The wind rises with the climb

- **WHEN** the player climbs from the streets to 70 m
- **THEN** the wind bed's gain ramps smoothly from its floor toward its ceiling

#### Scenario: Crickets belong to the night

- **WHEN** night falls
- **THEN** the cricket pulse fades in with the night factor and fades out again toward day

### Requirement: Daytime birdsong

By day (day factor > 0.3) the system SHALL play randomized bird chirps every 2–9 s: one to
three short sine notes between 2.0 and 3.8 kHz, each bending downward over ~0.1 s at low
gain.

#### Scenario: Chirps punctuate the day

- **WHEN** the day factor exceeds 0.3 and the chirp timer elapses
- **THEN** a 1–3 note descending chirp plays and the timer rearms for 2–9 s

### Requirement: Wind-chime proximity tinkles

Every 2.2–5.4 s the system SHALL check the nearest wind-chime pole across the 3×3 chunks
around the player and, if one is within 10 m, play a randomized pentatonic tinkle (C5 D5 F5
G5 A5, optionally an octave up, 1–4 staggered triangle notes) whose gain scales linearly
down with distance to zero at 10 m — so chime poles are findable by ear, which the ciphers'
carillon cache builds on.

#### Scenario: Chimes get louder as you approach

- **WHEN** the player closes from 10 m to 2 m of a chime pole
- **THEN** the recurring tinkles rise in gain roughly with 1 − d/10

#### Scenario: Out of range is silent

- **WHEN** no chime pole is within 10 m
- **THEN** no chime plays that cycle

### Requirement: Event one-shots reuse the house synth idiom

Event sounds SHALL be short envelope-shaped oscillator phrases in the same idiom: the trial
completion fanfare is a rising four-note triangle arpeggio (C5 E5 G5 C6); other
capabilities' one-shots (cipher dial ticks, carillon notes, the sour error buzz) reuse the
pattern under their own specs. Each one-shot SHALL be fire-and-forget with its own gain
envelope, never touching the beds.

#### Scenario: The fanfare crowns a trial

- **WHEN** a trial completes and audio is on
- **THEN** the rising four-note fanfare plays once without interrupting the wind or cricket beds

### Requirement: Footstep bursts

Each walk stride and each winch-crank pump SHALL trigger a footstep sound: a ~70 ms decaying
noise burst through a low-pass randomized between 300 and 550 Hz, quiet enough to sit under
the beds. Stride timing itself belongs to the movement code; this capability owns the
sound.

#### Scenario: Steps tick with the stride

- **WHEN** the player walks and audio is on
- **THEN** each stride boundary produces one soft filtered thump, each slightly different
