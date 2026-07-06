# player-movement Specification

## Purpose
TBD - created by archiving change codify-player-physics. Update Purpose after archive.
## Requirements
### Requirement: Core movement constants and kinematics

The player SHALL move as a first-person capsule of radius `PR = 0.42` with eye height `EYE = 1.62`, walking at `WALK = 5.2` m/s, sprinting at `WALK × SPRINT` (`SPRINT = 1.75`) while Shift is held, jumping with an upward impulse `JUMP = 6.2` only while grounded, and falling under gravity `GRAV = 16` m/s². Horizontal velocity SHALL approach the input-direction target exponentially with acceleration 11/s while grounded and 3/s while airborne, so air control is real but weak. WASD and the arrow keys both steer, and diagonal input is normalized so it is never faster than a single axis.

#### Scenario: Sprint multiplies walk speed

- **WHEN** the player holds Shift with forward input on flat ground
- **THEN** the target speed is `5.2 × 1.75` m/s rather than 5.2 m/s

#### Scenario: Jump only from the ground

- **WHEN** the player presses Space while airborne (and not climbing or latched)
- **THEN** no jump impulse is applied
- **AND** pressing Space while grounded applies `vel.y = 6.2` and clears grounded

#### Scenario: Weak air control

- **WHEN** the player steers mid-air
- **THEN** horizontal velocity converges toward the input direction at the airborne rate (3/s), noticeably slower than the grounded rate (11/s)

### Requirement: Speed modifiers

Movement speed SHALL be scaled by stacking situational multipliers on the walk/sprint base: ×0.35 while wading in water, ×0.45 while the landing stagger is active, and the thunderstorm flood multiplier (see the weather-events capability) only while grounded at street level (`y < 0.6`) and not already in water or a pit. Sprint SHALL be disabled while carrying the Second Seed (see the story-campaign capability), and a persisted trials reward (`localStorage 'canopy.sprintboost'`) SHALL raise the sprint multiplier by ×1.1.

#### Scenario: Wading is slow

- **WHEN** the player is in water and holds forward
- **THEN** the speed target is 35% of its dry value

#### Scenario: Stagger slows and decays

- **WHEN** a hard 7–10 m landing has set the stagger timer
- **THEN** speed is scaled ×0.45 until the stagger timer counts down to zero

### Requirement: Mouse look and camera feel

While pointer-locked, mouse movement SHALL turn the player at 0.0021 rad per pixel on both axes, with pitch clamped to ±1.45 rad, applied to the camera in YXZ order. The camera SHALL sit at `pos.y + EYE` plus a head-bob offset: while grounded and moving faster than 0.6 m/s the bob phase advances with horizontal speed and adds a `sin` offset of amplitude 0.042, and each half-cycle of the bob phase fires one footstep sound. A camera-shake value SHALL jitter the camera by up to ±0.4 × shake per axis and decay at 2.6/s.

#### Scenario: Pitch cannot flip over

- **WHEN** the player drags the mouse far up or down
- **THEN** pitch stops at ±1.45 rad

#### Scenario: Footsteps track the bob

- **WHEN** the player runs on the ground
- **THEN** footstep sounds fire once per stride as the bob phase crosses each half-cycle
- **AND** no bob or footsteps occur while airborne

### Requirement: Horizontal collision resolve

Each frame, after integrating velocity, the player SHALL be pushed out of nearby colliders: solids (`colData.solids` AABBs) push the player to distance `PR` from the box whenever the feet are below `h − 0.35` (above the roofline a wall no longer blocks, so mantling over a parapet works); trunks (`colData.trunks` cylinders) push to distance `r + PR × 0.9` whenever the feet are below `h`. Touching a vine-flagged solid or a trunk taller than 14 m SHALL record a climb normal that feeds the freeclimbing capability; shorter trunks block without being climbable.

#### Scenario: Walls block below the roofline

- **WHEN** the player walks into a building face with feet below the roof
- **THEN** the player is pushed back out to radius `PR` and does not pass through

#### Scenario: Above the roofline the wall is gone

- **WHEN** the player's feet are above `h − 0.35` of a solid
- **THEN** that solid no longer pushes the player, allowing a mantle onto the roof

#### Scenario: Only tall trunks offer a climb

- **WHEN** the player pushes against a 10 m trunk
- **THEN** the trunk blocks movement but records no climb normal

### Requirement: Vertical support model

The player's support height SHALL be computed each frame as the best candidate among: the ground plane `y = 0` (lowered to `−depth` inside any pit descriptor, circular or rect); solids whose AABB contains the player (±0.2 margin) with feet inside `[h − 1.0, h + 0.6]`; pads (`colData.pads` discs) containing the player horizontally with feet inside `[y − 1.3, y + 0.6]`; and lift platforms (see winch-lifts). The highest qualifying candidate wins. The player SHALL become grounded only when `vel.y ≤ 0.01` and feet are at or below `support + 0.02`, at which point y snaps to the support, vertical velocity zeroes, and `onCanopy`/`supportLayer` record whether and which pad layer supports the player. A hard floor clamp SHALL never let the player sink below the (pit-aware) ground.

#### Scenario: Standing on a pad records its layer

- **WHEN** the player lands within a `weave` pad's radius inside the catch band
- **THEN** the player is grounded with `onCanopy` set and `supportLayer = 'weave'`

#### Scenario: Missing the pad edge means falling

- **WHEN** the player walks off the edge of a pad's radius with nothing below
- **THEN** no support candidate qualifies and the player falls

#### Scenario: Pit lowers the floor

- **WHEN** the player is inside a sinkhole pit descriptor of depth 4
- **THEN** the ground support and hard floor clamp are `y = −4` rather than 0

### Requirement: Water immersion

The player SHALL count as in water when horizontally inside any `colData.waters` rect with feet between `y − 1` and `y + 0.3` of its surface. Water slows walking (×0.35), drains body heat fast (see heat-exposure), and swallows any fall (see fall-consequences).

#### Scenario: Wading detection

- **WHEN** the player's feet are within the vertical band of a reservoir's water rect and inside it horizontally
- **THEN** `inWater` is true for that frame

### Requirement: Pointer lock and pause flow

Clicking the start overlay SHALL initialize audio and request pointer lock; gaining lock hides the overlay, shows the HUD, and marks the game started. Losing pointer lock SHALL re-show the overlay as a pause screen ("CLICK TO RESUME") — except in SHOT mode, which hides the overlay without ever locking. Gameplay keys (interact, flashlight, satchel, recall) SHALL act only once the game has started.

#### Scenario: Escape pauses

- **WHEN** pointer lock is lost during play
- **THEN** the overlay returns reading "CLICK TO RESUME" and the game world keeps rendering

#### Scenario: Keys inert before start

- **WHEN** R or F is pressed before the first click-to-start
- **THEN** nothing happens

### Requirement: Shade recall key

Pressing R while started SHALL teleport the player to the last-shade anchor (see heat-exposure), zero all velocity, and cap body heat at 40. This is the always-available escape hatch the game teaches for sun trouble.

#### Scenario: Recall from a hot roof

- **WHEN** the player presses R while overheating on an exposed roof
- **THEN** the player is placed at the last shade point with zero velocity and heat no higher than 40

### Requirement: Interact dispatch priority

A single E press SHALL be dispatched down a fixed priority chain, stopping at the first consumer: (1) release a latched ladder — always first, so a nearby cache, plaque, page, or NPC can never steal the press from a climber; (2) story campaign interactions; (3) cipher/puzzle interactions; (4) inventory pickups (journal pages); (5) ladder latch/release; (6) the trial-master within 3.4 m; (7) the errand giver within 3.4 m when no mission or trial is active. Later-loaded consumers are typeof-guarded so a missing script never breaks the chain.

#### Scenario: Ladder release wins ties

- **WHEN** the player is latched to a ladder that stands within reach of an interactable cache
- **THEN** pressing E releases the ladder and does not open the cache

#### Scenario: Story outranks the giver

- **WHEN** the Archivist and the errand giver are both within reach
- **THEN** E goes to the story interaction and the errand giver is not triggered

