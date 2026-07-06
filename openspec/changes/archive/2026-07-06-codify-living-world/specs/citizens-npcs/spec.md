## ADDED Requirements

### Requirement: Crowd density tracks the day

The citizen crowd SHALL target a population of round(lerp(5, 17, dayF)) — about five
lantern-carriers at deep night rising to seventeen citizens at full day — modified by
place: ×1.4 by day in market chunks (plazas, or city chunks with stall anchors) and ×0.5
in Ash Quarter (ashen-biome) chunks. Under target, a spawn is attempted with probability
0.12 per frame; over target by more than two, the farthest citizen beyond 45 m is removed.

#### Scenario: Day swells the crowd

- **WHEN** the day factor rises from night toward full day
- **THEN** the target population climbs from about 5 toward about 17 and spawning fills toward it

#### Scenario: Markets bustle, ash quarters stand empty

- **WHEN** the player stands in a plaza by day versus an ashen-biome chunk
- **THEN** the target population is 1.4× the base in the market and 0.5× in the ash quarter

#### Scenario: Night thins the streets

- **WHEN** the population exceeds the target plus two
- **THEN** the farthest citizen more than 45 m away is removed

### Requirement: Citizens spawn on the street grid, out of sight-line

New citizens SHALL spawn on the 64 m street grid at 22–75 m from the player, offset onto
the sidewalk band (about 5.6–7.3 m off the centre line) always on canal streets and 75% of
the time otherwise. Daytime spawns SHALL draw roles as roughly 48% walkers, 18% chat pairs,
12% sweepers, 22% tenders, with 28% of day walkers being kid-scaled (about 0.62×); night
spawns SHALL all be lantern-carriers. A chat spawn SHALL bring a partner facing it 0.8 m
away.

#### Scenario: Spawn distance band

- **WHEN** a citizen spawns
- **THEN** its position is on a street line between 22 and 75 m from the player

#### Scenario: Night roster

- **WHEN** the day factor is below the day threshold and a citizen spawns
- **THEN** it is a lantern-carrier

#### Scenario: Chat pairs arrive together

- **WHEN** a chat citizen spawns
- **THEN** a second chat citizen spawns 0.8 m away facing it, and the pair are linked as partners

### Requirement: Walkers follow streets and greet the player

Walking citizens (walkers and lantern-carriers) SHALL move along their street axis, easing
toward their lane offset, and at street intersections (within 0.7 m of the 64 m grid, at
most every 4–8 s) turn onto the perpendicular street 55% of the time, re-rolling lane and
direction. When the player comes within 2.6 m, a walker SHALL pause for about 1.6 s and
turn to face the player before resuming (with a cooldown so it does not re-greet
immediately). Moving citizens bob and waddle; all citizens turn smoothly rather than
snapping.

#### Scenario: Cornering at an intersection

- **WHEN** a walker crosses a street intersection with its turn cooldown elapsed
- **THEN** it turns onto the perpendicular street with 55% probability, picking a fresh lane and direction

#### Scenario: A nod in passing

- **WHEN** the player walks within 2.6 m of a walker
- **THEN** the walker pauses about 1.6 s, faces the player, then walks on

### Requirement: Stationary roles perform their work

Non-walking roles SHALL each read as an occupation: chat pairs face each other, bob
subtly, and swap speaker every 4–9 s with the current speaker's arm raised and gesturing,
disbanding into walkers when their conversation timer ends; sweepers rock a broom and
shuffle, emitting occasional flurries of leaf scraps ahead of the broom every 1.6–4.2 s;
tenders bend and straighten in place; lantern-carriers' lanterns glow in step with the
street-lamp intensity.

#### Scenario: Turn-taking conversation

- **WHEN** a chat pair's speaker timer (4–9 s) elapses
- **THEN** the speaking role swaps and the new speaker's arm raises and gestures while the other's lowers

#### Scenario: Conversation ends in a walk

- **WHEN** a chat pair's conversation timer runs out
- **THEN** both citizens become walkers with walking speed and lowered arms

#### Scenario: The sweeper's scraps

- **WHEN** a sweeper's scrap cooldown elapses
- **THEN** a small flurry of leaf scraps pops off the broom ahead of it

### Requirement: Vendor stalls and chasing kids

By day (and never in SHOT mode) the system SHALL occasionally stage two scripted vignettes:
a vendor behind a stall counter with a customer facing it (spawned at build-time stall
anchors 6–46 m away, at most two vendors at once; the vendor gestures periodically; when
the customer's timer ends it wanders off as a walker and the vendor packs up 6–14 s later),
and a pair of kid-scaled runners chasing in a loop around a plaza fountain or lamp post
(one pair at most, radius ~5.6 m at a plaza or ~2.6 m at a lamp, occasionally reversing
direction, scattering after 14–30 s).

#### Scenario: Stall pair forms and dissolves

- **WHEN** a vendor+customer pair is staged and the customer's timer ends
- **THEN** the customer walks off down the street grid and the vendor is removed 6–14 s later

#### Scenario: Kids circle the fountain

- **WHEN** the chase vignette is staged at a plaza
- **THEN** two kid-scaled citizens run a loose loop of about 5.6 m radius around its centre, reversing occasionally, and scatter after their timer

### Requirement: Citizens respect solid geometry

Citizens SHALL be pushed out of tree trunks (trunk radius + 0.3 m) and building footprints
(0.3 m skin) each frame so crowd motion never clips through the world. Citizens have no
physics beyond this push-out and never block the player.

#### Scenario: No walking through walls

- **WHEN** a citizen's street path carries it into a building footprint or trunk
- **THEN** it is pushed back out to the collision skin distance that frame

### Requirement: Range cull at 88 m

Every citizen SHALL be removed once farther than 88 m from the player. Removal SHALL
unlink chat/vendor partners (the survivor packs up or wanders off) and demote a culled
mission-giver so the errand system can re-designate. Special-role NPCs owned by other
systems (trial-masters, the Archivist, the Tinker, hamlet residents) have their own sync
windows and are not part of this cull.

#### Scenario: Culled beyond 88 m

- **WHEN** a citizen's distance from the player exceeds 88 m
- **THEN** it is removed from the scene and the roster

#### Scenario: Culling the giver demotes it

- **WHEN** the citizen currently marked as errand giver is culled
- **THEN** the giver reference clears so a new giver can be designated

### Requirement: Hidden Hamlet residents

The Hidden Hamlet SHALL keep 2–3 pinned residents while the player is within 1.7 chunks of
its centre: two tenders at the ground fire pit and one lantern-keeper on a platform of the
first hamlet giant, all removed when the player leaves range. Residents within 10 m turn to
face the player. After The Rumor has been completed (per the trials capability), standing
within 3.2 m of a resident SHALL play the elders' one-time standing thank-you.

#### Scenario: Residents appear with the hamlet

- **WHEN** the player comes within 1.7 chunks of the hamlet centre
- **THEN** the two fire-pit tenders and the platform lantern-keeper spawn at their anchors, and they are removed when the player leaves range

#### Scenario: The elders remember

- **WHEN** the hamlet-errand flag is set and the player stands within 3.2 m of a resident
- **THEN** the standing thank-you line plays once per save

### Requirement: Special-role hand-offs are referenced, not duplicated

The crowd system SHALL host, without re-specifying, three behaviors owned elsewhere: the
errand giver (a promoted walker/tender that stands its ground and faces the player — see
`errands`), the departing parcel receiver (the `depart` role — see `parcel-delivery`), and
scripted SHOT-mode citizen sets (deterministic casts placed for screenshot presets, with
the random chase/vendor vignettes suppressed in SHOT).

#### Scenario: Giver stands its ground

- **WHEN** a citizen is the current errand giver
- **THEN** it stops street movement and faces the player until accept or demotion, as specified by the errands capability

#### Scenario: SHOT casts are deterministic

- **WHEN** the game runs a SHOT preset
- **THEN** only the preset's scripted citizens appear and no random vendor/chase vignettes spawn
