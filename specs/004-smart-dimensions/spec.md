# Feature Specification: Smart Dimension Placement

**Feature Branch**: `004-smart-dimensions`
**Created**: 2026-02-13
**Status**: Draft
**Input**: User description: "Improve dimension line placement to avoid overlaps with other floor plan features using multi-lane stacking, chain dimensions, and collision-aware text placement"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Multi-Lane Exterior Dimensions (Priority: P1)

A user generates a multi-room floor plan (e.g., a two-bedroom house with 8+ rooms). The rendered output shows exterior dimension lines stacked in ordered lanes away from the building perimeter: room-edge chain dimensions in the inner lane, overall building dimensions in the outer lane. No two dimension lines share the same offset distance, and all text is legible without overlapping walls, windows, or other dimensions.

**Why this priority**: This is the single highest-impact change. The current system places all dimensions at the same 2ft offset, causing most of the visible overlap problems. Ordered lane stacking follows AIA architectural drafting conventions and eliminates the majority of clutter.

**Independent Test**: Can be fully tested by rendering the existing `multi-room.yaml` and verifying that exterior dimension lines are placed in distinct, non-overlapping lanes. Delivers immediately cleaner output for every floor plan with more than one room.

**Acceptance Scenarios**:

1. **Given** a floor plan with multiple rooms sharing a building edge (e.g., Bedroom 1, Full Bath, and Bedroom 2 along the north wall), **When** the plan is rendered, **Then** individual room width dimensions appear in a lane closer to the building, and the overall building width dimension appears in a lane further out, with consistent spacing between lanes.
2. **Given** rooms along the same building edge with different widths (e.g., 12ft + 6ft + 10ft), **When** dimensions are generated, **Then** extension lines from the inner lane align vertically with the endpoints of the outer lane's overall dimension.
3. **Given** a room with only one room on a given side (no need for an overall dimension), **When** dimensions are generated, **Then** only a single-lane dimension is produced — no redundant overall dimension that duplicates the room dimension.

---

### User Story 2 - Chain Dimensions (Priority: P2)

A user has multiple rooms sharing a building edge. Instead of seeing independent, disconnected dimension lines for each room segment, the output shows a continuous chain dimension — a single baseline with shared extension lines and segment labels (e.g., `|--12'-0"--|--6'-0"--|--10'-0"--|`). This matches standard architectural construction document conventions and reduces visual noise.

**Why this priority**: Chain dimensions are the natural companion to multi-lane stacking. They merge what would otherwise be N independent dimension lines into one continuous chain, eliminating redundant extension lines and naturally avoiding segment-to-segment overlap.

**Independent Test**: Can be tested by rendering `multi-room.yaml` and verifying that the north building edge shows a single chained dimension line with three segments (12' + 6' + 10') rather than three separate dimension lines.

**Acceptance Scenarios**:

1. **Given** three rooms sharing the north building edge with widths 12ft, 6ft, and 10ft, **When** the plan is rendered, **Then** a single horizontal chain dimension appears with three labeled segments sharing extension lines at their junctions.
2. **Given** a chain dimension where one segment is too narrow for text to fit between extension lines (e.g., a 3ft hallway), **When** the plan is rendered, **Then** the text is placed outside the extension lines with a leader or offset, remaining fully legible.
3. **Given** two rooms sharing a building edge but offset vertically (not collinear), **When** dimensions are generated, **Then** they are NOT merged into a chain — they remain separate dimension lines at appropriate offsets.

---

### User Story 3 - Collision-Aware Text Placement (Priority: P3)

A user has a floor plan where dimension text would overlap with a door swing arc, a switch symbol, or an adjacent dimension's text. The system detects these potential collisions during rendering and adjusts: shifting text along the dimension line, moving text to the opposite side of the line, or placing text outside the extension lines. The result is a plan where all dimension text is readable without manual adjustment.

**Why this priority**: After multi-lane stacking and chain dimensions solve the structural overlap issues, collision detection handles the remaining edge cases — a safety net for dense or complex plans.

**Independent Test**: Can be tested by creating a floor plan with a dimension line adjacent to a door swing or switch, and verifying the dimension text does not visually overlap with those elements.

**Acceptance Scenarios**:

1. **Given** a horizontal dimension line whose text would overlap with another horizontal dimension's text at the same Y position, **When** the plan is rendered, **Then** one of the dimension texts is shifted or repositioned so both are fully readable.
2. **Given** a vertical dimension line whose text would overlap with a door swing arc, **When** the plan is rendered, **Then** the dimension text is moved to the opposite side of the dimension line or shifted along it to avoid the arc.
3. **Given** a dimension for a narrow room (under 4ft) where text does not fit between extension lines, **When** the plan is rendered, **Then** the text is placed outside the extension lines rather than overlapping them.

---

### User Story 4 - Suppression of Interior Duplicate Dimensions (Priority: P4)

A user generates a plan where shared interior walls cause both rooms to attempt to show the same measurement. The system deduplicates these so only one dimension appears per shared edge, and interior dimensions are suppressed when the same measurement is already covered by an exterior chain or lane dimension.

**Why this priority**: Reduces clutter by eliminating redundant measurements that add no information. Lower priority because the current edge-deduplication logic already handles simple cases — this extends it to cover chain-vs-individual redundancy.

**Independent Test**: Can be tested by rendering `multi-room.yaml` and counting the total dimension lines, verifying there are no duplicate measurements for the same edge.

**Acceptance Scenarios**:

1. **Given** a room whose width is already represented as a segment in an exterior chain dimension, **When** dimensions are generated, **Then** no separate interior dimension is generated for that same width.
2. **Given** two adjacent rooms sharing an interior wall, **When** dimensions are generated, **Then** the shared wall dimension appears only once, not twice.

---

### Edge Cases

- What happens when a room is too small for any dimension text to fit (e.g., a 2ft utility chase)? Dimension text is placed outside the extension lines.
- What happens when the building has an L-shaped or non-rectangular composite outline? Each collinear edge segment gets its own chain; non-collinear edges get separate dimension lines.
- What happens when extension/enclosure bump-outs extend past the main building edge? The overall dimension lane spans the full extent including bump-outs.
- What happens when rooms are arranged in a single row with no stacking needed? A single chain dimension is produced; no redundant overall dimension is added.
- What happens when a user specifies manual dimensions? Manual dimensions are rendered as-is, and auto-generated dimensions avoid colliding with them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST organize exterior auto-dimensions into ordered lanes: room-edge chain dimensions in the inner lane, overall building dimensions in the outer lane, with consistent inter-lane spacing.
- **FR-002**: System MUST merge collinear room-edge dimensions along the same building edge into a single chain dimension with shared extension lines.
- **FR-003**: System MUST produce an overall building dimension (outer lane) only when there are two or more room segments along that edge — a single room on an edge gets only one dimension line.
- **FR-004**: System MUST detect when dimension text does not fit between extension lines (segment narrower than text width) and place text outside the extension lines instead.
- **FR-005**: System MUST detect potential text-to-text collisions between dimension lines and resolve them by shifting, flipping, or offsetting the text.
- **FR-006**: System MUST suppress auto-generated interior dimensions when the same measurement is already covered by an exterior chain dimension segment.
- **FR-007**: System MUST correctly handle composite outlines — chains and overall dimensions follow the building's composite perimeter, including extensions and bump-outs.
- **FR-008**: System MUST maintain backward compatibility: floor plans with no overlapping dimensions today produce visually identical or improved output.
- **FR-009**: System MUST place extension lines that extend from the measured wall edge to the dimension line, with a small gap between the wall and the start of the extension line, per architectural convention.
- **FR-010**: System MUST support the existing `dimensions` config field for manual dimensions, rendering them without applying auto-collision avoidance, while ensuring auto-dimensions avoid colliding with them.

### Key Entities

- **DimensionLane**: A set of dimension lines at the same perpendicular offset from a building edge. Lanes are numbered from the building outward (lane 0 = room-edge chain, lane 1 = overall building dimension).
- **DimensionChain**: A continuous series of dimension segments sharing a single baseline with shared extension lines at segment junctions. Produced by merging collinear room-edge dimensions.
- **BuildingEdge**: A collinear segment of the building's composite perimeter. Each building edge can have zero or more chain dimensions and an optional overall dimension.
- **TextBoundingBox**: The rectangular area occupied by rendered dimension text, used for collision detection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The existing `multi-room.yaml` example renders with zero overlapping dimension text when inspected visually — all dimension labels are fully readable.
- **SC-002**: A floor plan with 8+ rooms produces dimension output where every exterior building edge has at most 2 organized lanes (room segments + overall), with no dimension lines sharing the same perpendicular offset.
- **SC-003**: Chain dimensions reduce the total count of individual dimension line elements by at least 30% compared to the current output for multi-room plans.
- **SC-004**: Dimension text for narrow rooms (under 4ft wide) is always placed outside the extension lines and remains fully readable.
- **SC-005**: All existing tests continue to pass without modification — backward compatibility is maintained.
- **SC-006**: The rendered output for simple single-room plans is visually unchanged from the current output.

## Assumptions

- The existing `LANE_SPACING_FT` (1.5ft) and `LANE_SPACING_M` (0.45m) constants are appropriate inter-lane distances. These may be tuned during implementation but serve as reasonable defaults.
- Text width estimation for collision detection can use a simple character-count heuristic (monospaced approximation) rather than requiring full font metrics. This is sufficient for the architectural dimension text format (`12'-6"`).
- The four-sided building perimeter model (north/south/east/west edges) is sufficient for lane assignment. Non-rectangular building shapes (L-shaped composites) are decomposed into collinear edge segments.
- Manual dimensions (from the existing `dimensions` config field) are rare and treated as highest-priority — auto-dimensions defer to them rather than attempting to move them.
