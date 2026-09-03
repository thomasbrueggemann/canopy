## ADDED Requirements

### Requirement: HDR post-processing pipeline

The renderer SHALL draw the scene into an HDR render target and composite it to the canvas
through a bloom pass, a sun-shaft pass, a filmic grade and a soft vignette, applying ACES
tone mapping and the sRGB transform in the composite. The pipeline SHALL be toggleable with
the P key and `?post=0`, SHALL fall back to a direct render if render targets fail, and
SHALL run in SHOT mode so screenshots show the final look.

#### Scenario: Emissives bloom at night

- **WHEN** the night factor exceeds 0.6 and lit windows or lamps are on screen
- **THEN** they show soft bloom halos in the composited frame

#### Scenario: Toggle off restores the plain render

- **WHEN** the player presses P
- **THEN** the next frame renders directly to the canvas and a hint reports the state

### Requirement: Translucent vines and grounded facades

`matVine` SHALL carry the same directional back-scatter term as `matLeaf`, and every
building material SHALL darken and tint green in a smooth band from street level to
~3.6 m so facades read as standing on the ground.

#### Scenario: Vines against a backlit wall

- **WHEN** vines hang between the camera and a sunlit facade
- **THEN** their leaves show green transmitted light rather than a black silhouette
