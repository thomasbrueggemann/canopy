## ADDED Requirements

### Requirement: Receiver waits and faces the player

While an ERRAND delivery is active, the system SHALL spawn the receiver near the target
district once the player is within range, and SHALL keep her turned to face the player
during the waiting phase. She SHALL be spawned with an arm rig capable of the reach-out
gesture so she can take the parcel on delivery.

#### Scenario: Receiver appears near the target
- **WHEN** the player carrying an ERRAND parcel first comes within range of the target district and no receiver exists yet
- **THEN** the receiver is spawned at the target position with the arm rig and added to the scene

#### Scenario: Receiver tracks the approaching player
- **WHEN** the receiver is waiting and the player moves around her
- **THEN** she continuously rotates to face the player until delivery

### Requirement: Parcel handoff on delivery

When the player reaches the receiver, the system SHALL complete the delivery by handing
her the parcel rather than deleting her: it SHALL attach a visible parcel prop to her
raised hand, promote her into the live NPC crowd with the departure role, and complete the
mission with its story reward line. The receiver reference SHALL be cleared before mission
completion so the mission cleanup cannot remove the now-departing NPC.

#### Scenario: Delivery hands over the parcel and completes the mission
- **WHEN** the player reaches the waiting receiver (within delivery distance)
- **THEN** a parcel prop appears in her hand, she is promoted to the departure role, and the mission completes with its reward line

#### Scenario: Departing receiver survives mission cleanup
- **WHEN** the delivery completes and mission meshes are cleared
- **THEN** the departing receiver is not removed by that cleanup, because her reference was nulled before completion

### Requirement: The take beat

On being promoted to the departure role, the receiver SHALL first play a brief take beat
(about 1.15 s): she SHALL stand still, face the player, and ease her arm outward to
receive the parcel. Only after the take beat SHALL she begin to leave.

#### Scenario: She reaches out to receive
- **WHEN** the receiver enters the departure role
- **THEN** for the take beat she holds position, faces the player, and raises her arm outward with the parcel in hand

#### Scenario: Departure begins after the take beat
- **WHEN** the take beat elapses
- **THEN** she chooses her getaway route and starts moving

### Requirement: Graceful departure run away from the player

After the take beat the receiver SHALL run off down a street. She SHALL choose a getaway
line snapped to the street grid and an initial direction that increases distance from the
player. While running she SHALL move like an ordinary street walker, corner at
intersections (turning onto the perpendicular street a fraction of the time and re-choosing
the direction that opens distance from the player), face her run direction, and hug the
parcel to her chest — so cornering naturally takes her out of sight.

#### Scenario: Initial direction opens distance
- **WHEN** she finishes the take beat and picks her getaway street
- **THEN** her initial run direction is the sign that increases her distance from the player along that street (for example, a receiver at z=30 with the player at z=26 runs toward increasing z)

#### Scenario: Corners keep opening distance
- **WHEN** she reaches a street intersection and takes the turn
- **THEN** she re-chooses her direction to move away from the player, so successive corners carry her out of sight

#### Scenario: She covers real ground
- **WHEN** she runs uninterrupted for about 25 seconds at her jog speed with turns
- **THEN** she ends up well beyond 60 m from where she started

### Requirement: Safe retirement, never popping on-screen

The departing receiver SHALL be retired by the ordinary NPC range cull once she is far
enough away that fog and canopy hide her. As a stuck-safety net she SHALL also carry a
hard time budget, but she SHALL NOT be removed by that budget while still close to the
player: if the budget expires while she is near, it SHALL be extended rather than removing
her on-screen. The parcel prop SHALL be freed together with the NPC and SHALL NOT dispose
the shared geometry or material it borrows.

#### Scenario: Range cull retires her out of sight
- **WHEN** the departing receiver passes the NPC range-cull distance from the player
- **THEN** she is removed naturally along with her parcel prop

#### Scenario: Stuck budget never pops her while close
- **WHEN** her time budget expires while she is still near the player (within the close range)
- **THEN** she is not removed on-screen; her budget is extended so retirement happens only once she is far enough away

#### Scenario: Freeing the receiver keeps shared assets live
- **WHEN** the receiver (with her parcel) is removed
- **THEN** the parcel leaves the scene with her while the shared geometry and material it reused remain live for other props

### Requirement: Reuse-only, scoped impact

The departure behavior SHALL reuse existing idioms and assets only: the pivoting-arm
gesture, the street-walker mover and intersection turns, the wander-off re-line trick, the
bob/waddle motion, and wall/trunk push-out. It SHALL introduce no new materials or
textures (one shared parcel prop recipe) and no persistence. The giver system, the other
NPC roles, and the NPC density logic SHALL be untouched, and the behavior SHALL have no
effect in SHOT mode.

#### Scenario: No new assets or persistence
- **WHEN** a handoff occurs
- **THEN** the parcel uses the existing shared box geometry and paper material, and nothing is written to persistent storage

#### Scenario: SHOT mode is unaffected
- **WHEN** the game runs in SHOT mode
- **THEN** the mission update never runs, so no receiver or departure behavior occurs and screenshots are unaffected
