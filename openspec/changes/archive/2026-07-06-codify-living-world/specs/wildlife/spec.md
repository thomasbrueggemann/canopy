## ADDED Requirements

### Requirement: Pooled populations with day and night rosters

The wildlife system ("The Returned") SHALL run small hard-capped pools driven once per
frame: up to 3 cats and 4 frogs at any hour; up to 2 boars and 3 leapers by day only; two
bird flocks (7 and 6 birds) and one raptor by day; 6 bats by night. Day/night membership
SHALL fade via material opacity on the day factor rather than popping, and under-cap pools
refill by low per-frame spawn probabilities (cats 0.04, frogs 0.05, boars 0.03, leapers
0.04). Wildlife SHALL have no collision with the player and no gameplay effect — it is
ambient only.

#### Scenario: Rosters swap at dusk

- **WHEN** day fades into night
- **THEN** boars, leapers, flocks, and the raptor fade out with the day factor while bats fade in, and cats and frogs remain

#### Scenario: Hard caps hold

- **WHEN** a pool is at its cap
- **THEN** no further individuals of that species spawn until one is culled

### Requirement: Cats slink the rooflines and flee

Cats SHALL spawn on the perimeter of buildings at least 2 m tall and 2×2 m in footprint,
9–48 m from the player, and cycle between walking the building's perimeter at about
1.2 m/s and sitting for 3–8 s. A player closer than 3 m SHALL send the cat fleeing
directly away at about 3 m/s until it is more than 7 m away, when it re-attaches to the
nearest point of its perimeter. Cats are culled beyond 74 m.

#### Scenario: Perimeter patrol with sits

- **WHEN** a cat's walk timer ends
- **THEN** it sits in place for 3–8 s with a slower tail sway, then resumes the perimeter

#### Scenario: Spooked at three metres

- **WHEN** the player approaches a cat within 3 m
- **THEN** it flees away from the player at about 3 m/s and only settles once more than 7 m away

### Requirement: Boars root the green quarters by day

Boars SHALL spawn only in park, grove, or garden-style chunks 12–45 m from the player, and
wander with a rooting head-down bob, re-rolling their heading every 1.5–4 s but steering
home whenever more than 8 m from their spawn point so they stay in the green. Boars fade
with the day factor and are culled beyond 74 m or when day ends.

#### Scenario: Tethered wandering

- **WHEN** a boar wanders more than 8 m from its home point
- **THEN** its heading turns back toward home

### Requirement: Frogs hop the water rims

Frogs SHALL spawn on the rim of water bodies 6–46 m from the player and alternate sitting
(1–5 s) with short parabolic hops of 0.5–1.2 m lasting about 0.4 s, clamped to within
0.6 m of their water rectangle so they never stray from the water. Culled beyond 74 m.

#### Scenario: A hop stays at the water

- **WHEN** a frog launches a hop
- **THEN** the landing point is clamped to within 0.6 m of its water body and the hop follows a parabolic arc

### Requirement: Leapers scamper and jump tree to tree

Canopy leapers SHALL live on small high canopy pads (radius < 10 m, above 8 m), spawning
12–46 m from the player. They scamper circles on their pad, then leap to another pad 3–12 m
away in a squash-and-stretch arc whose duration and height scale with the gap; with no pad
in range they wait and retry. Day-gated by opacity; culled beyond 78 m.

#### Scenario: Leap to a neighbouring pad

- **WHEN** a leaper's idle timer ends and a pad 3–12 m away exists
- **THEN** it leaps there in an arc, stretching mid-flight and squashing at the ends, and resumes scampering on the new pad

### Requirement: Bird flocks ride slow curves overhead

Two flapping bird flocks SHALL drift on slow curving paths in a band roughly 27–43 m up,
wrapping within 70 m of the player so the sky is never empty by day. Each bird is two
flapping triangles in a single vertex-animated mesh per flock (one draw call). In SHOT mode
exactly one flock SHALL be anchored at a fixed deterministic position and the second
hidden, keeping screenshots stable.

#### Scenario: Flocks wrap with the player

- **WHEN** a flock's centre falls more than 70 m behind the travelling player
- **THEN** it wraps to the corresponding position ahead, keeping birds in the sky

#### Scenario: One deterministic flock in SHOT

- **WHEN** the game runs a SHOT preset by day
- **THEN** one flock holds the fixed anchor position and the other is hidden

### Requirement: Bats jink between the lamps at night

Six bats SHALL fly erratic night patrols: each picks a fresh jink target every 0.3–1 s,
accelerates toward it with noise, is speed-capped at 9 m/s, and stays clamped between 8 and
18 m altitude, wrapping within 44 m of the player. New bats SHALL prefer to appear near a
working street lamp's glow. Bats are hidden by day and in SHOT mode.

#### Scenario: Jinking flight

- **WHEN** a bat's jink timer elapses
- **THEN** it veers toward a new random target near the player, capped at 9 m/s between 8 and 18 m up

### Requirement: A raptor circles the landmarks

One raptor SHALL circle at about 40 m radius and 62 m (±7 m) altitude, centring on the
nearest colossus or Spire chunk within a 2-chunk ring of the player when one exists, else
on the player, banking gently as it turns. Day only; hidden in SHOT mode.

#### Scenario: The circle finds the colossus

- **WHEN** the player approaches within the scan ring of a colossus chunk
- **THEN** the raptor's circle centre eases from the player toward the colossus centre
