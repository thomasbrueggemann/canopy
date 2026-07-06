## MODIFIED Requirements

### Requirement: Waytree ground-to-deck ascent

A waytree SHALL provide a forgiving, active ascent from the ground up to the lookout deck at
`deckY`, distinct from freeclimbing, so any mission that routes a player to a waytree lookout is
climbable without freeclimb mastery. The ascent SHALL be a hand-cranked counterweight winch
lift mounted on the +x face of the trunk (the deck railing's dock gap); the earlier ground-to-
deck rung ladder is removed. The player steps onto the lift platform and pumps to crank it up
until it docks level with the deck.

#### Scenario: Riding the lift to the deck

- **WHEN** the player boards the waytree lift and cranks it up
- **THEN** the platform rises and docks level with the lookout deck at `deckY`

#### Scenario: No rung ladder on the waytree

- **WHEN** a waytree is generated
- **THEN** it carries a winch lift and no ground-to-deck rung ladder
