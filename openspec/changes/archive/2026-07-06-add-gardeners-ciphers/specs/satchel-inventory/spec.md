## ADDED Requirements

### Requirement: Item registry and inventory API

The satchel SHALL expose a generic inventory API — register an item definition, add N of an item (with an optional resolved examine note), query possession and count, remove, and read the stored note. Adding an item SHALL fire a pickup toast, and unknown item ids SHALL be ignored until registered. Later scripts SHALL be able to register their own items so the inventory stays generic.

#### Scenario: Registering and adding an item

- **WHEN** a script registers an item definition and then adds one
- **THEN** the item's count becomes at least one and a pickup toast is shown

#### Scenario: Notes and queries

- **WHEN** an item is added with a resolved examine note
- **THEN** the note is retrievable for that item
- **AND** possession and count queries reflect the added quantity

#### Scenario: Unknown ids are ignored

- **WHEN** a script adds an item id that was never registered
- **THEN** nothing is added

### Requirement: The satchel panel and its input

The satchel panel SHALL toggle open and closed with a dedicated key, only while the game is started, and a cycle key SHALL move the selected row while the panel is open (suppressing the default focus behavior only when the panel owns the key). The panel SHALL show each item's icon, name, and stacked count, and an examine box with the selected item's description plus any resolved note. It SHALL show an empty-state message when nothing is carried. The game SHALL keep running while the panel is open, and the panel SHALL NOT block interaction or movement.

#### Scenario: Toggle only when started

- **WHEN** the player presses the satchel key while the game is started
- **THEN** the panel toggles open or closed

#### Scenario: Cycling selection

- **WHEN** the panel is open and the player presses the cycle key
- **THEN** the selected row advances and the examine box updates
- **AND** the default focus behavior is suppressed only because the panel consumed the key

#### Scenario: Empty state

- **WHEN** the panel is opened with nothing carried
- **THEN** an empty-state message is shown instead of item rows

### Requirement: Read-only story item rows

The satchel SHALL display carried campaign items (beacon shards, the warden's key, the Second Seed) as read-only rows computed live from the campaign save, so the satchel reflects everything the player carries without writing to campaign state.

#### Scenario: Story items shown without mutation

- **WHEN** the player has campaign items and opens the satchel
- **THEN** those items appear as read-only rows derived from the campaign save
- **AND** opening or reading them does not modify campaign state

### Requirement: Ambient Gardener's journal pages

Twelve journal pages SHALL be discoverable at Tier-3 oddities. A chunk SHALL host a page only if it carries a qualifying oddity readable from its already-resident collision data (a fern circle or a chime pole) and it passes a fixed deterministic spawn gate, making page hosts deterministic and session-stable. The page props SHALL be synced from a small pool over the resident chunks around the player using only already-built chunk data, never building or peeking a chunk per frame.

#### Scenario: Deterministic host selection

- **WHEN** a resident chunk carries a qualifying oddity and passes the spawn gate
- **THEN** that chunk hosts a journal page at the oddity's position
- **AND** the same chunk hosts a page every session until its page is collected

#### Scenario: Pool sync reads resident chunks only

- **WHEN** the per-frame inventory update runs
- **THEN** page props are placed only from already-resident chunk data
- **AND** no chunk is built or peeked in that path

### Requirement: Collecting journal pages and the keepsake

Collecting a page SHALL persist its chunk as an absolute chunk key, increment the page stack, and store the running journal text as the stack's note with page numbers ordered by collection. Reaching all twelve pages SHALL grant a keepsake item with a gold message.

#### Scenario: Collecting a page

- **WHEN** the player interacts with a page host within reach
- **THEN** the page's chunk key is persisted, the page count increases, and the running journal note updates
- **AND** page numbers reflect the order in which pages were collected

#### Scenario: Twelfth page grants the keepsake

- **WHEN** the twelfth page is collected
- **THEN** a keepsake item is granted with a gold message

### Requirement: Inventory persistence

The satchel SHALL persist to a versioned save holding item counts, resolved notes, and the collected-page chunk keys, using the same guarded storage idiom as the rest of the game. On load it SHALL reconcile the derived page count and note from the persisted page keys.

#### Scenario: Inventory restored across sessions

- **WHEN** the game reloads after items and pages were collected
- **THEN** item counts, notes, and collected-page keys are restored from the versioned save
- **AND** the page count and running note are reconciled from the persisted page keys
